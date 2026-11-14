import type { ProviderHealthState, ProviderHealthTelemetry } from "@/lib/types";
import { adminDb, hasAdminCredentials } from "@/server/firebaseAdmin";

interface InternalProviderState {
  status: ProviderHealthState;
  circuitState: "closed" | "open" | "half_open";
  openUntil: number;
  consecutiveFailures: number;
  lastSuccessAt: number | null;
  lastFailureAt: number | null;
  lastErrorCategory: string | null;
  totalLatencyMs: number;
  latencySamples: number;
  recentLatencyMs: number | null;
  totalTtftMs: number;
  ttftSamples: number;
  rateLimitHits: number;
  fallbackTriggeredCount: number;
  totalCalls: number;
  successCalls: number;
}

const CIRCUIT_OPEN_MS = 60_000;
const FAILURE_THRESHOLD = 3;

const providerStates = new Map<string, InternalProviderState>();
const idempotencyCache = new Map<string, { at: number; status: "inflight" | "done" }>();

function getOrCreateState(providerId: string): InternalProviderState {
  let st = providerStates.get(providerId);
  if (!st) {
    st = {
      status: "unknown",
      circuitState: "closed",
      openUntil: 0,
      consecutiveFailures: 0,
      lastSuccessAt: null,
      lastFailureAt: null,
      lastErrorCategory: null,
      totalLatencyMs: 0,
      latencySamples: 0,
      recentLatencyMs: null,
      totalTtftMs: 0,
      ttftSamples: 0,
      rateLimitHits: 0,
      fallbackTriggeredCount: 0,
      totalCalls: 0,
      successCalls: 0
    };
    providerStates.set(providerId, st);
  }
  return st;
}

export function canAttemptProvider(providerId: string, now = Date.now()): boolean {
  const st = getOrCreateState(providerId);
  if (st.circuitState === "closed") return true;
  if (st.circuitState === "open" && now >= st.openUntil) {
    st.circuitState = "half_open";
    return true;
  }
  return st.circuitState === "half_open";
}

export function recordProviderSuccess(
  providerId: string,
  metrics: { latencyMs: number; ttftMs?: number }
): void {
  const now = Date.now();
  const st = getOrCreateState(providerId);
  st.status = "healthy";
  st.circuitState = "closed";
  st.openUntil = 0;
  st.consecutiveFailures = 0;
  st.lastSuccessAt = now;
  st.lastErrorCategory = null;
  st.totalCalls += 1;
  st.successCalls += 1;
  if (Number.isFinite(metrics.latencyMs) && metrics.latencyMs >= 0) {
    st.recentLatencyMs = Math.round(metrics.latencyMs);
    st.totalLatencyMs += st.recentLatencyMs;
    st.latencySamples += 1;
  }
  if (typeof metrics.ttftMs === "number" && Number.isFinite(metrics.ttftMs) && metrics.ttftMs >= 0) {
    st.totalTtftMs += Math.round(metrics.ttftMs);
    st.ttftSamples += 1;
  }
  void persistProviderHealthBestEffort(providerId, st);
}

export function recordProviderFailure(
  providerId: string,
  category: string,
  opts: { isRateLimit?: boolean; triggeredFallback?: boolean; latencyMs?: number } = {}
): void {
  const now = Date.now();
  const st = getOrCreateState(providerId);
  st.totalCalls += 1;
  st.consecutiveFailures += 1;
  st.lastFailureAt = now;
  st.lastErrorCategory = category;

  if (typeof opts.latencyMs === "number" && Number.isFinite(opts.latencyMs)) {
    st.recentLatencyMs = Math.round(opts.latencyMs);
  }
  if (opts.isRateLimit) {
    st.rateLimitHits += 1;
    st.status = "rate_limited";
  } else {
    st.status = st.consecutiveFailures >= FAILURE_THRESHOLD ? "unavailable" : "degraded";
  }
  if (opts.triggeredFallback) {
    st.fallbackTriggeredCount += 1;
  }

  if (opts.isRateLimit || st.consecutiveFailures >= FAILURE_THRESHOLD) {
    st.circuitState = "open";
    st.openUntil = now + (opts.isRateLimit ? 45_000 : CIRCUIT_OPEN_MS);
  }
  void persistProviderHealthBestEffort(providerId, st);
}

export function recordProviderFallback(providerId: string): void {
  const st = getOrCreateState(providerId);
  st.fallbackTriggeredCount += 1;
}

export function getProviderTelemetrySnapshot(opts: {
  providerId: string;
  displayName: string;
  enabled: boolean;
  configured: boolean;
  capabilities: string[];
}): ProviderHealthTelemetry {
  const now = Date.now();
  const st = getOrCreateState(opts.providerId);
  if (st.circuitState === "open" && now >= st.openUntil) {
    st.circuitState = "half_open";
  }

  let effectiveStatus: ProviderHealthState = st.status;
  if (!opts.configured || !opts.enabled) {
    effectiveStatus = "unavailable";
  } else if (st.status === "unknown" && opts.configured) {
    effectiveStatus = "unknown";
  }

  return {
    providerId: opts.providerId,
    displayName: opts.displayName,
    enabled: opts.enabled,
    configured: opts.configured,
    status: effectiveStatus,
    circuitState: st.circuitState,
    lastSuccessAt: st.lastSuccessAt,
    lastFailureAt: st.lastFailureAt,
    lastErrorCategory: st.lastErrorCategory,
    avgLatencyMs: st.latencySamples > 0 ? Math.round(st.totalLatencyMs / st.latencySamples) : null,
    recentLatencyMs: st.recentLatencyMs,
    avgTtftMs: st.ttftSamples > 0 ? Math.round(st.totalTtftMs / st.ttftSamples) : null,
    rateLimitHits: st.rateLimitHits,
    fallbackTriggeredCount: st.fallbackTriggeredCount,
    totalCalls: st.totalCalls,
    successCalls: st.successCalls,
    quotaStatus: st.status === "rate_limited" ? "rate_limited" : "unknown",
    capabilities: opts.capabilities
  };
}

/** Prevents accidental double-submit on the same requestId within a 2-minute window. */
export function claimRequestId(uid: string, requestId?: string): (() => void) | null {
  if (!requestId || !requestId.trim()) return () => {};
  const now = Date.now();
  // Prune old entries
  for (const [k, v] of idempotencyCache.entries()) {
    if (now - v.at > 120_000) idempotencyCache.delete(k);
  }
  const key = `${uid}:${requestId.trim()}`;
  const existing = idempotencyCache.get(key);
  if (existing && now - existing.at < 120_000) {
    return null;
  }
  idempotencyCache.set(key, { at: now, status: "inflight" });
  return () => {
    idempotencyCache.set(key, { at: Date.now(), status: "done" });
  };
}

async function persistProviderHealthBestEffort(providerId: string, st: InternalProviderState): Promise<void> {
  if (!hasAdminCredentials()) return;
  try {
    await adminDb()
      .doc(`system/providerHealth/providers/${providerId}`)
      .set(
        {
          providerId,
          status: st.status,
          circuitState: st.circuitState,
          lastSuccessAt: st.lastSuccessAt,
          lastFailureAt: st.lastFailureAt,
          lastErrorCategory: st.lastErrorCategory,
          recentLatencyMs: st.recentLatencyMs,
          avgLatencyMs: st.latencySamples > 0 ? Math.round(st.totalLatencyMs / st.latencySamples) : null,
          avgTtftMs: st.ttftSamples > 0 ? Math.round(st.totalTtftMs / st.ttftSamples) : null,
          rateLimitHits: st.rateLimitHits,
          fallbackTriggeredCount: st.fallbackTriggeredCount,
          totalCalls: st.totalCalls,
          successCalls: st.successCalls,
          updatedAt: Date.now()
        },
        { merge: true }
      );
  } catch {
    /* telemetry write is non-blocking */
  }
}

export function _resetNexoHealthForTest(): void {
  providerStates.clear();
  idempotencyCache.clear();
}
