import { FieldValue } from "firebase-admin/firestore";
import { adminDb, ApiError, hasAdminCredentials } from "./firebaseAdmin";
import { activeModel, providerConfigured, readEnv } from "./env";
import { getOverallProviderHealth } from "./modelsRegistry";

const windows = new Map<string, number[]>();
const inflight = new Set<string>();

export function checkRate(uid: string, bucket: string, now = Date.now(), perMinuteOverride?: number): void {
  const env = readEnv();
  const limit = perMinuteOverride && perMinuteOverride > 0 ? perMinuteOverride : env.perMinute;
  const key = `${bucket}:${uid}`;
  const recent = (windows.get(key) || []).filter((t) => now - t < 60_000);
  if (recent.length >= limit) {
    const wait = Math.max(1, Math.ceil((60_000 - (now - recent[0])) / 1000));
    throw new ApiError(429, "rate_limited", `Too many requests. Try again in ${wait}s.`);
  }
  recent.push(now);
  windows.set(key, recent);
}

/** Only one generation per user at a time: avoids duplicate/repeated calls. */
export function acquireInflight(uid: string): () => void {
  if (inflight.has(uid)) {
    throw new ApiError(409, "busy", "A response is already being generated. Stop it or wait for it to finish.");
  }
  inflight.add(uid);
  return () => {
    inflight.delete(uid);
  };
}

export const utcDay = (d = new Date()) => d.toISOString().slice(0, 10);

export function safeMetricKey(raw: string): string {
  return raw.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 80) || "unknown";
}

export function estimateTokensFromChars(chars: number): number {
  if (!Number.isFinite(chars) || chars <= 0) return 0;
  return Math.ceil(chars / 4);
}

export async function consumeDaily(uid: string, field: "requests" | "tts", limitOverride?: number): Promise<void> {
  const env = readEnv();
  const limit =
    typeof limitOverride === "number" && limitOverride >= 0
      ? limitOverride
      : field === "requests"
        ? env.dailyLimit
        : env.dailyTtsLimit;
  const day = utcDay();
  const ref = adminDb().doc(`users/${uid}/usage/${day}`);
  await adminDb().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const used = (snap.data()?.[field] as number | undefined) ?? 0;
    if (used >= limit) {
      throw new ApiError(
        429,
        "quota_exceeded",
        `Daily ${field === "requests" ? "message" : "voice"} limit reached (${limit}). It resets at 00:00 UTC.`
      );
    }
    tx.set(ref, { [field]: FieldValue.increment(1), updatedAt: Date.now() }, { merge: true });
  });
}

export async function recordUsageMetric(
  uid: string,
  field: "rateLimitHits" | "fallbackCount" | "failedRequests" | "voiceRequests" | "imageRequests"
): Promise<void> {
  if (!hasAdminCredentials()) return;
  try {
    const day = utcDay();
    const userRef = adminDb().doc(`users/${uid}/usage/${day}`);
    const sysRef = adminDb().doc(`system/usageMetrics/daily/${day}`);
    await Promise.all([
      userRef.set({ [field]: FieldValue.increment(1), updatedAt: Date.now() }, { merge: true }),
      sysRef.set({ [field]: FieldValue.increment(1), day, updatedAt: Date.now() }, { merge: true })
    ]);
  } catch {
    /* best-effort telemetry metric; never fail main request */
  }
}

export async function recordGenerationTelemetry(
  uid: string,
  params: {
    provider: string;
    model: string;
    inputChars: number;
    outputChars: number;
    voiceTriggered?: boolean;
    failed?: boolean;
    isTts?: boolean;
    isImage?: boolean;
    taskType?: string;
  }
): Promise<void> {
  if (!hasAdminCredentials()) return;
  try {
    const day = utcDay();
    const estIn = estimateTokensFromChars(params.inputChars);
    const estOut = estimateTokensFromChars(params.outputChars);
    const provKey = safeMetricKey(params.provider);
    const modelKey = safeMetricKey(params.model);
    const taskKey = params.taskType ? safeMetricKey(params.taskType) : "";

    const patch: Record<string, unknown> = {
      updatedAt: Date.now(),
      ...(estIn > 0 ? { estimatedInputTokens: FieldValue.increment(estIn) } : {}),
      ...(estOut > 0 ? { estimatedOutputTokens: FieldValue.increment(estOut) } : {}),
      ...(params.voiceTriggered ? { voiceRequests: FieldValue.increment(1) } : {}),
      ...(params.isImage ? { imageRequests: FieldValue.increment(1) } : {}),
      ...(params.failed ? { failedRequests: FieldValue.increment(1) } : {})
    };

    if (!params.isTts && !params.isImage && params.provider && params.model) {
      patch[`providers.${provKey}`] = FieldValue.increment(1);
      patch[`models.${modelKey}`] = FieldValue.increment(1);
    }
    if (taskKey) {
      patch[`tasks.${taskKey}`] = FieldValue.increment(1);
    }

    const userRef = adminDb().doc(`users/${uid}/usage/${day}`);
    const sysRef = adminDb().doc(`system/usageMetrics/daily/${day}`);
    await Promise.all([
      userRef.set(patch, { merge: true }),
      sysRef.set(
        {
          ...patch,
          day,
          ...(!params.isTts && !params.isImage
            ? { requests: FieldValue.increment(1) }
            : params.isTts
              ? { tts: FieldValue.increment(1) }
              : {})
        },
        { merge: true }
      )
    ]);
  } catch {
    /* best-effort telemetry */
  }
}

export async function readUsage(
  uid: string,
  overrides?: { dailyLimit?: number; dailyTtsLimit?: number; activeProviderId?: string; activeModelId?: string }
) {
  const env = readEnv();
  const dailyLimit = overrides?.dailyLimit ?? env.dailyLimit;
  const dailyTtsLimit = overrides?.dailyTtsLimit ?? env.dailyTtsLimit;
  const day = utcDay();
  const snap = await adminDb().doc(`users/${uid}/usage/${day}`).get();
  const d = snap.data() || {};
  const requests = typeof d.requests === "number" ? d.requests : 0;
  const tts = typeof d.tts === "number" ? d.tts : 0;
  const voiceRequests = typeof d.voiceRequests === "number" ? d.voiceRequests : 0;
  const imageRequests = typeof d.imageRequests === "number" ? d.imageRequests : 0;
  const estimatedInputTokens = typeof d.estimatedInputTokens === "number" ? d.estimatedInputTokens : 0;
  const estimatedOutputTokens = typeof d.estimatedOutputTokens === "number" ? d.estimatedOutputTokens : 0;
  const rateLimitHits = typeof d.rateLimitHits === "number" ? d.rateLimitHits : 0;
  const fallbackCount = typeof d.fallbackCount === "number" ? d.fallbackCount : 0;
  const failedRequests = typeof d.failedRequests === "number" ? d.failedRequests : 0;
  const currentModel = overrides?.activeModelId || activeModel();
  const providerHealth = providerConfigured()
    ? getOverallProviderHealth([], currentModel)
    : "unconfigured";

  return {
    requests,
    tts,
    voiceRequests,
    imageRequests,
    estimatedInputTokens,
    estimatedOutputTokens,
    rateLimitHits,
    fallbackCount,
    failedRequests,
    day,
    dailyLimit,
    dailyTtsLimit,
    remainingRequests: Math.max(0, dailyLimit - requests),
    remainingTts: Math.max(0, dailyTtsLimit - tts),
    providerHealth,
    quotaSource: "account_firestore" as const
  };
}

/** Test-only helper to clear in-memory rate limit and inflight state. */
export function _resetLimitsForTest(): void {
  windows.clear();
  inflight.clear();
}
