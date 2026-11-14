import type { NexoTaskType } from "@/lib/types";
import type { ProviderMessage } from "@/server/providers";
import type { ChatBodyInput } from "@/lib/schemas";
import { markModelHealth } from "@/server/modelsRegistry";
import { isRetryableFallbackError, ProviderError, streamChat } from "@/server/providers";
import { recordUsageMetric } from "@/server/limits";
import { systemPrompt } from "@/server/prompt";
import { webSearch } from "@/server/search";
import type { RuntimeConfigSnapshot } from "@/server/runtimeConfig";
import { recordProviderFailure, recordProviderFallback, recordProviderSuccess } from "./healthRegistry";
import { buildNexoRoutePlan, type RouteCandidate } from "./router";
import { classifyNexoTask } from "./taskClassifier";

export interface OrchestratorResult {
  taskType: NexoTaskType;
  providerUsed: string;
  modelUsed: string;
  outputChars: number;
  fallbackCount: number;
  ttftMs: number | undefined;
  durationMs: number;
  failed: boolean;
}

const sleep = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    if (signal.aborted) {
      reject(new Error("aborted"));
      return;
    }
    const t = setTimeout(resolve, ms);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(t);
        reject(new Error("aborted"));
      },
      { once: true }
    );
  });

/**
 * Executes a unified NEXO v1 streaming turn with:
 * - Zero-cost deterministic task classification
 * - Multi-provider + multi-model routing
 * - Exponential backoff for transient failures + automatic silent failover
 * - Strictly NEXO v1 normalized client stream (no third-party provider or model IDs emitted)
 */
export async function executeUnifiedNexoStream(opts: {
  uid: string;
  body: ChatBodyInput;
  runtime: RuntimeConfigSnapshot;
  effectiveMemory: string[];
  allowWebSearch: boolean;
  reqSignal: AbortSignal;
  timeoutSignal: AbortSignal;
  enqueue: (obj: unknown) => void;
}): Promise<OrchestratorResult> {
  const startedAt = Date.now();
  const g = opts.runtime.globalConfig;
  const history = opts.body.messages.slice(-g.maxHistoryMessages);
  const last = history[history.length - 1];

  const classification = classifyNexoTask({
    text: last?.content || "",
    attachments: last?.attachments,
    useSearch: opts.body.useSearch && opts.allowWebSearch,
    voiceTriggered: opts.body.voiceTriggered
  });

  opts.enqueue({
    nexo: {
      assistant: "NEXO v1",
      capability: classification.taskType,
      status: "routing"
    }
  });

  let searchContext: string | undefined;
  if (opts.body.useSearch && opts.allowWebSearch && last?.content?.trim()) {
    const sr = await webSearch(last.content, opts.timeoutSignal).catch(() => null);
    if (sr) {
      searchContext = sr.context;
      opts.enqueue({ sources: sr.sources });
    }
  }

  const system = systemPrompt({
    language: opts.body.language,
    responseStyle: opts.body.responseStyle,
    responseTone: opts.body.responseTone,
    nickname: opts.body.nickname,
    customInstructions: opts.body.customInstructions,
    projectInstructions: opts.body.projectInstructions,
    conversationSummary: opts.body.conversationSummary,
    memory: opts.effectiveMemory,
    searchContext,
    appName: g.appName
  });

  const msgs: ProviderMessage[] = history.map((m) => ({
    role: m.role,
    content: m.content,
    attachments: m.attachments
  }));

  const routePlan: RouteCandidate[] = buildNexoRoutePlan({
    runtime: opts.runtime,
    taskType: classification.taskType,
    complexity: classification.complexity,
    requiresVision: classification.requiresVision,
    requiresPdf: classification.requiresPdf
  });

  if (routePlan.length === 0) {
    throw new ProviderError("server_config", "NEXO intelligence service is not configured on the server.");
  }

  let outputChars = 0;
  let produced = false;
  let fallbackCount = 0;
  let ttftMs: number | undefined;
  let usedProvider = routePlan[0].providerId;
  let usedModel = routePlan[0].model;

  opts.enqueue({
    nexo: {
      assistant: "NEXO v1",
      capability: classification.taskType,
      status: "streaming"
    }
  });

  for (let idx = 0; idx < routePlan.length; idx++) {
    const candidate = routePlan[idx];
    const attemptStart = Date.now();
    usedProvider = candidate.providerId;
    usedModel = candidate.model;

    if (idx > 0) {
      fallbackCount += 1;
      recordProviderFallback(routePlan[idx - 1].providerId);
      await recordUsageMetric(opts.uid, "fallbackCount");
    }

    // Up to 1 quick retry with short jitter on the same candidate ONLY for transient 5xx before failover
    let candidateSucceeded = false;
    let chunkProduced = false;

    for (let retry = 0; retry < 2; retry++) {
      if (retry > 0) {
        const backoff = Math.min(450 * retry + Math.floor(Math.random() * 150), 900);
        await sleep(backoff, opts.timeoutSignal).catch(() => {});
      }

      try {
        for await (const chunk of streamChat(
          system,
          msgs,
          opts.timeoutSignal,
          candidate.model,
          candidate.providerId,
          g.aiTemperature
        )) {
          if (chunk) {
            if (!chunkProduced) {
              ttftMs = Date.now() - startedAt;
            }
            chunkProduced = true;
            produced = true;
            outputChars += chunk.length;
            opts.enqueue({ t: chunk });
          }
        }
        markModelHealth(candidate.model, "available");
        recordProviderSuccess(candidate.providerId, {
          latencyMs: Date.now() - attemptStart,
          ttftMs
        });
        candidateSucceeded = true;
        break;
      } catch (err) {
        const code = err instanceof ProviderError ? err.code : "provider_error";
        const isRate = code === "provider_rate_limited" || code === "provider_quota";

        if (isRate) {
          markModelHealth(candidate.model, "rate_limited");
          await recordUsageMetric(opts.uid, "rateLimitHits");
        } else if (code === "provider_model" || code === "provider_unavailable") {
          markModelHealth(candidate.model, "unavailable");
        }

        const isTransientSameCandidate =
          !chunkProduced &&
          retry === 0 &&
          code === "provider_unavailable" &&
          !opts.reqSignal.aborted &&
          !opts.timeoutSignal.aborted;

        if (isTransientSameCandidate) {
          continue;
        }

        recordProviderFailure(candidate.providerId, code, {
          isRateLimit: isRate,
          triggeredFallback: idx < routePlan.length - 1,
          latencyMs: Date.now() - attemptStart
        });

        const canFailover =
          !opts.reqSignal.aborted &&
          !opts.timeoutSignal.aborted &&
          !chunkProduced &&
          idx < routePlan.length - 1 &&
          (isRetryableFallbackError(err) || code === "provider_auth");

        if (!canFailover) {
          throw err;
        }
        break;
      }
    }

    if (candidateSucceeded) break;
  }

  const durationMs = Date.now() - startedAt;
  if (!produced) {
    opts.enqueue({
      error: {
        code: "empty",
        message: "NEXO could not produce a complete answer for that input. Please try rephrasing."
      }
    });
    return {
      taskType: classification.taskType,
      providerUsed: usedProvider,
      modelUsed: usedModel,
      outputChars,
      fallbackCount,
      ttftMs,
      durationMs,
      failed: true
    };
  }

  opts.enqueue({
    nexo: {
      assistant: "NEXO v1",
      capability: classification.taskType,
      status: "complete",
      ttftMs,
      durationMs
    }
  });
  opts.enqueue({ done: true });

  return {
    taskType: classification.taskType,
    providerUsed: usedProvider,
    modelUsed: usedModel,
    outputChars,
    fallbackCount,
    ttftMs,
    durationMs,
    failed: false
  };
}
