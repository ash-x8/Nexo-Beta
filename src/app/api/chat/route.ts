import { ApiError, requireAuthContext } from "@/server/firebaseAdmin";
import { recordSecurityEvent } from "@/server/adminAudit";
import {
  acquireInflight,
  checkRate,
  consumeDaily,
  recordGenerationTelemetry,
  recordUsageMetric
} from "@/server/limits";
import { readEnv } from "@/server/env";
import {
  getFreeFallbackCandidates,
  isFreeEligibleModel,
  markModelHealth
} from "@/server/modelsRegistry";
import {
  activeProvider,
  availableModels,
  isRetryableFallbackError,
  ProviderError,
  streamChat,
  type ProviderMessage
} from "@/server/providers";
import { getRuntimeConfig, resolveEffectiveFeatures } from "@/server/runtimeConfig";
import { webSearch } from "@/server/search";
import { systemPrompt } from "@/server/prompt";
import { ALLOWED_ATTACHMENT_MIME, ChatBodySchema } from "@/lib/schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function jsonError(e: unknown) {
  const err = e instanceof ApiError ? e : new ApiError(500, "server_error", "Something went wrong on the server.");
  if (!(e instanceof ApiError)) console.error("[chat]", e);
  return Response.json({ error: { code: err.code, message: err.message } }, { status: err.status });
}

export async function POST(req: Request) {
  let release: (() => void) | undefined;
  try {
    const ctx = await requireAuthContext(req);
    const uid = ctx.uid;
    const e = readEnv();
    const runtimeCfg = await getRuntimeConfig();
    const g = runtimeCfg.globalConfig;
    const effectiveFeatures = resolveEffectiveFeatures(runtimeCfg.featureFlags, ctx.featureOverrides);

    if (runtimeCfg.maintenance.enabled && !ctx.isOwner) {
      throw new ApiError(
        503,
        "maintenance",
        runtimeCfg.maintenance.message || "NEXO AI is currently undergoing scheduled maintenance."
      );
    }

    if (!effectiveFeatures.chat) {
      throw new ApiError(403, "feature_disabled", "AI chat is currently disabled by the administrator.");
    }

    const activeProviderId = g.defaultProvider || e.provider;
    const provEntry = runtimeCfg.providerConfig.providers[activeProviderId as keyof typeof runtimeCfg.providerConfig.providers];
    if (provEntry && provEntry.enabled === false) {
      throw new ApiError(503, "provider_disabled", "The active AI provider is currently disabled by the administrator.");
    }

    const hasCreds =
      activeProviderId === "gemini"
        ? !!(e.geminiKey && (g.defaultModel || provEntry?.defaultModel || e.geminiModel))
        : !!(e.compatBase && e.compatKey && (g.defaultModel || provEntry?.defaultModel || e.compatModel));
    if (!hasCreds) {
      throw new ApiError(503, "server_config", "The AI provider is not configured on the server yet.");
    }

    const declared = Number(req.headers.get("content-length") || 0);
    if (declared > (g.maxAttachmentMb * 1.45 + 1.5) * 1024 * 1024) {
      throw new ApiError(413, "too_large", "The request is too large.");
    }

    const parsed = ChatBodySchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      throw new ApiError(400, "bad_request", "Invalid chat request.");
    }
    const body = parsed.data;

    const history = body.messages.slice(-g.maxHistoryMessages);
    const last = history[history.length - 1];
    if (!last || last.role !== "user") {
      throw new ApiError(400, "bad_request", "The last message must be from the user.");
    }
    if (!last.content.trim() && !(last.attachments && last.attachments.length > 0)) {
      throw new ApiError(400, "bad_request", "Message cannot be empty.");
    }
    if (last.content.length > g.maxInputChars) {
      throw new ApiError(413, "too_long", `Message is too long (max ${g.maxInputChars} characters).`);
    }

    const provider = activeProvider(activeProviderId);
    let attachmentBytes = 0;
    let hasAttachments = false;
    for (const m of history) {
      for (const a of m.attachments || []) {
        hasAttachments = true;
        if (!ALLOWED_ATTACHMENT_MIME.test(a.mime)) {
          throw new ApiError(415, "bad_file", `Unsupported file type: ${a.mime}`);
        }
        if (a.mime === "application/pdf" && !provider.supportsPdf) {
          throw new ApiError(415, "bad_file", "PDF analysis requires the Gemini provider.");
        }
        if (a.data) {
          attachmentBytes += Math.floor((a.data.length * 3) / 4);
        } else if (a.text) {
          attachmentBytes += Buffer.byteLength(a.text, "utf8");
        }
      }
    }
    if (hasAttachments && !effectiveFeatures.attachments) {
      throw new ApiError(403, "feature_disabled", "File and image attachments are disabled by the administrator.");
    }
    if (attachmentBytes > g.maxAttachmentMb * 1024 * 1024) {
      throw new ApiError(413, "too_large", `Attachments exceed ${g.maxAttachmentMb} MB.`);
    }

    if (body.useSearch && !effectiveFeatures.webSearch) {
      throw new ApiError(403, "feature_disabled", "Web search is currently disabled by the administrator.");
    }

    try {
      checkRate(uid, "chat", Date.now(), g.rateLimitPerMinute);
    } catch (rateErr) {
      await recordUsageMetric(uid, "rateLimitHits");
      await recordSecurityEvent({
        type: "rate_limit",
        uid,
        path: "/api/chat",
        severity: "low",
        reason: (rateErr as Error).message
      });
      throw rateErr;
    }

    const defaultModel = g.defaultModel || provEntry?.defaultModel || provider.defaultModel();
    let reportedModels: string[] = [];
    const selectedModel = body.model || defaultModel;
    const modelOverride = runtimeCfg.modelRegistry.models[selectedModel];

    if (modelOverride?.enabled === false) {
      throw new ApiError(403, "model_disabled", "This AI model has been disabled by the administrator.");
    }

    if (g.freeOnlyMode && !isFreeEligibleModel(selectedModel, provider.id, defaultModel)) {
      throw new ApiError(
        403,
        "paid_model_blocked",
        "Only verified free-tier models are enabled. Choose an available free model."
      );
    }

    if (body.model && body.model !== defaultModel) {
      const vc = new AbortController();
      const vt = setTimeout(() => vc.abort(), 8000);
      try {
        reportedModels = await availableModels(vc.signal, provider.id);
        if (reportedModels.length > 0 && !reportedModels.includes(body.model) && !isFreeEligibleModel(body.model, provider.id, defaultModel)) {
          throw new ApiError(400, "bad_model", "That model is not available. Choose another free model.");
        }
      } catch (err) {
        if (err instanceof ApiError) throw err;
        throw new ApiError(503, "model_check", "Could not verify the selected model right now. Use the default model or try again.");
      } finally {
        clearTimeout(vt);
      }
    }

    release = acquireInflight(uid);
    try {
      await consumeDaily(uid, "requests", g.dailyRequestLimit);
    } catch (quotaErr) {
      if (quotaErr instanceof ApiError && quotaErr.status === 429) {
        await recordUsageMetric(uid, "rateLimitHits");
      }
      throw quotaErr;
    }

    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), e.timeoutMs);
    const onAbort = () => ac.abort();
    req.signal.addEventListener("abort", onAbort, { once: true });

    const enc = new TextEncoder();
    const line = (o: unknown) => enc.encode(JSON.stringify(o) + "\n");
    const done = release;
    release = undefined;

    const effectiveMemory = effectiveFeatures.personalMemory ? body.memory : [];
    const inputCharsTotal = history.reduce((acc, m) => acc + (m.content?.length || 0), 0);

    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        let outputChars = 0;
        let usedModel = selectedModel;
        let failed = false;
        try {
          let searchContext: string | undefined;
          if (body.useSearch && effectiveFeatures.webSearch && last.content.trim()) {
            const r = await webSearch(last.content, ac.signal);
            if (r) {
              searchContext = r.context;
              controller.enqueue(line({ sources: r.sources }));
            }
          }

          const system = systemPrompt({
            language: body.language,
            responseStyle: body.responseStyle,
            nickname: body.nickname,
            customInstructions: body.customInstructions,
            memory: effectiveMemory,
            searchContext,
            appName: g.appName
          });

          const msgs: ProviderMessage[] = history.map((m) => ({
            role: m.role,
            content: m.content,
            attachments: m.attachments
          }));

          const fallbackCandidates = getFreeFallbackCandidates(
            provider.id,
            selectedModel,
            reportedModels,
            defaultModel,
            runtimeCfg.providerConfig.fallbackOrder,
            runtimeCfg.modelRegistry.models
          );
          const attemptQueue = [selectedModel, ...fallbackCandidates];

          let produced = false;
          let lastError: unknown;

          for (let idx = 0; idx < attemptQueue.length; idx++) {
            const candidate = attemptQueue[idx];
            if (runtimeCfg.modelRegistry.models[candidate]?.enabled === false) {
              continue;
            }
            if (g.freeOnlyMode && !isFreeEligibleModel(candidate, provider.id, defaultModel)) {
              continue;
            }

            if (idx > 0) {
              controller.enqueue(
                line({
                  fallback: {
                    from: attemptQueue[idx - 1],
                    to: candidate,
                    reason:
                      lastError instanceof ProviderError ? lastError.code : "provider_unavailable"
                  }
                })
              );
              await recordUsageMetric(uid, "fallbackCount");
            }

            usedModel = candidate;
            controller.enqueue(
              line({
                meta: {
                  model: candidate,
                  provider: provider.id,
                  freeEligible: isFreeEligibleModel(candidate, provider.id, defaultModel)
                }
              })
            );

            let chunkProduced = false;
            try {
              for await (const t of streamChat(system, msgs, ac.signal, candidate, provider.id, g.aiTemperature)) {
                if (t) {
                  chunkProduced = true;
                  produced = true;
                  outputChars += t.length;
                  controller.enqueue(line({ t }));
                }
              }
              markModelHealth(candidate, "available");
              break;
            } catch (candidateErr) {
              lastError = candidateErr;
              if (candidateErr instanceof ProviderError) {
                if (candidateErr.code === "provider_rate_limited" || candidateErr.code === "provider_quota") {
                  markModelHealth(candidate, "rate_limited");
                  await recordUsageMetric(uid, "rateLimitHits");
                } else if (candidateErr.code === "provider_model" || candidateErr.code === "provider_unavailable") {
                  markModelHealth(candidate, "unavailable");
                }
              }

              const canFallback =
                !req.signal.aborted &&
                !ac.signal.aborted &&
                !chunkProduced &&
                idx < attemptQueue.length - 1 &&
                isRetryableFallbackError(candidateErr);

              if (!canFallback) {
                throw candidateErr;
              }
            }
          }

          if (!produced) {
            failed = true;
            controller.enqueue(
              line({ error: { code: "empty", message: "The model returned an empty answer. Try rephrasing." } })
            );
          } else {
            controller.enqueue(line({ done: true }));
          }
        } catch (err) {
          failed = true;
          if (req.signal.aborted) {
            // User cancelled intentionally
          } else if (err instanceof ProviderError) {
            controller.enqueue(line({ error: { code: err.code, message: err.message } }));
          } else if (ac.signal.aborted) {
            controller.enqueue(line({ error: { code: "timeout", message: "The AI took too long to respond. Try again." } }));
          } else {
            console.error("[chat stream]", err);
            controller.enqueue(line({ error: { code: "server_error", message: "Something went wrong while generating the answer." } }));
          }
        } finally {
          clearTimeout(timer);
          req.signal.removeEventListener("abort", onAbort);
          done();
          await recordGenerationTelemetry(uid, {
            provider: provider.id,
            model: usedModel,
            inputChars: inputCharsTotal,
            outputChars,
            voiceTriggered: Boolean(body.voiceTriggered),
            failed
          });
          try {
            controller.close();
          } catch {
            /* already closed */
          }
        }
      }
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "application/x-ndjson; charset=utf-8",
        "Cache-Control": "no-store",
        "X-Accel-Buffering": "no"
      }
    });
  } catch (err) {
    release?.();
    return jsonError(err);
  }
}
