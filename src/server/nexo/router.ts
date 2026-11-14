import type { NexoTaskType } from "@/lib/types";
import { readEnv } from "@/server/env";
import { GEMINI_FREE_FALLBACK_ORDER, getModelHealth, isFreeEligibleModel } from "@/server/modelsRegistry";
import type { RuntimeConfigSnapshot } from "@/server/runtimeConfig";
import { canAttemptProvider } from "./healthRegistry";

export interface RouteCandidate {
  providerId: "gemini" | "openai-compatible";
  model: string;
  timeoutMs: number;
}

/**
 * Intelligent NEXO v1 backend-only router.
 * Selects provider + model candidates based on task requirements, attachment capabilities,
 * admin priority, free-only constraints, and circuit-breaker health.
 */
export function buildNexoRoutePlan(opts: {
  runtime: RuntimeConfigSnapshot;
  taskType: NexoTaskType;
  complexity: "fast" | "standard" | "deep";
  requiresVision: boolean;
  requiresPdf: boolean;
}): RouteCandidate[] {
  const env = readEnv();
  const g = opts.runtime.globalConfig;
  const pCfg = opts.runtime.providerConfig;
  const overrides = opts.runtime.modelRegistry.models;

  const geminiEnabled = pCfg.providers.gemini?.enabled !== false && Boolean(env.geminiKey);
  const compatEnabled =
    pCfg.providers["openai-compatible"]?.enabled !== false && Boolean(env.compatBase && env.compatKey && (pCfg.providers["openai-compatible"]?.defaultModel || env.compatModel));

  const geminiTimeout = pCfg.providers.gemini?.timeoutMs || env.timeoutMs;
  const compatTimeout = pCfg.providers["openai-compatible"]?.timeoutMs || env.timeoutMs;

  const candidates: RouteCandidate[] = [];
  const seen = new Set<string>();

  const pushCandidate = (providerId: "gemini" | "openai-compatible", model: string, timeoutMs: number) => {
    const m = model.trim();
    if (!m) return;
    const key = `${providerId}:${m}`;
    if (seen.has(key)) return;
    if (overrides[m]?.enabled === false) return;
    if (g.freeOnlyMode && !isFreeEligibleModel(m, providerId, providerId === "gemini" ? g.defaultModel : m)) return;
    if (opts.requiresPdf && providerId !== "gemini") return;
    seen.add(key);
    candidates.push({ providerId, model: m, timeoutMs });
  };

  // Determine ordered providers by admin priority & circuit-breaker state
  const configuredOrder: Array<{ id: "gemini" | "openai-compatible"; priority: number; enabled: boolean }> = (
    [
      { id: "gemini" as const, priority: pCfg.providers.gemini?.priority ?? 1, enabled: geminiEnabled },
      {
        id: "openai-compatible" as const,
        priority: pCfg.providers["openai-compatible"]?.priority ?? 2,
        enabled: compatEnabled
      }
    ] satisfies Array<{ id: "gemini" | "openai-compatible"; priority: number; enabled: boolean }>
  )
    .filter((p) => p.enabled)
    .sort((a, b) => {
      // Respect configured default provider first when healthy, then priority, then circuit health
      const aOpen = canAttemptProvider(a.id) ? 0 : 1;
      const bOpen = canAttemptProvider(b.id) ? 0 : 1;
      if (aOpen !== bOpen) return aOpen - bOpen;
      if (a.id === g.defaultProvider && b.id !== g.defaultProvider) return -1;
      if (b.id === g.defaultProvider && a.id !== g.defaultProvider) return 1;
      return a.priority - b.priority;
    });

  for (const prov of configuredOrder) {
    if (prov.id === "gemini") {
      const configuredPrimary =
        g.defaultProvider === "gemini" && g.defaultModel
          ? g.defaultModel
          : pCfg.providers.gemini?.defaultModel || env.geminiModel;

      // Task-aware preference: fast/voice/translation favors flash-lite when healthy; deep/coding favors primary flash
      const geminiPool: string[] = [];
      if (opts.complexity === "fast" || opts.taskType === "voiceConversation") {
        geminiPool.push(configuredPrimary);
        if (GEMINI_FREE_FALLBACK_ORDER.includes("gemini-2.5-flash-lite")) {
          geminiPool.push("gemini-2.5-flash-lite");
        }
      } else {
        geminiPool.push(configuredPrimary);
      }

      for (const m of pCfg.fallbackOrder.length ? pCfg.fallbackOrder : GEMINI_FREE_FALLBACK_ORDER) {
        geminiPool.push(m);
      }
      for (const m of GEMINI_FREE_FALLBACK_ORDER) {
        geminiPool.push(m);
      }

      // Sort healthy models first while preserving intended preference order
      const uniqueGemini = Array.from(new Set(geminiPool)).sort((a, b) => {
        const aAvail = getModelHealth(a) === "available" ? 0 : 1;
        const bAvail = getModelHealth(b) === "available" ? 0 : 1;
        if (aAvail !== bAvail) return aAvail - bAvail;
        return geminiPool.indexOf(a) - geminiPool.indexOf(b);
      });

      for (const m of uniqueGemini) {
        pushCandidate("gemini", m, geminiTimeout);
      }
    } else {
      const compatPrimary =
        g.defaultProvider === "openai-compatible" && g.defaultModel
          ? g.defaultModel
          : pCfg.providers["openai-compatible"]?.defaultModel || env.compatModel;
      pushCandidate("openai-compatible", compatPrimary, compatTimeout);
    }
  }

  return candidates;
}
