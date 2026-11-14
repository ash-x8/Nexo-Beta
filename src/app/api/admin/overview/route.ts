import { listSecurityEvents } from "@/server/adminAudit";
import { getSystemDailyMetrics, listUsersWithUsage } from "@/server/analytics";
import { authConfigured, configuredProviders, missingConfigKeys, readEnv } from "@/server/env";
import { ApiError, hasAdminCredentials, requireAdmin } from "@/server/firebaseAdmin";
import { buildModelCatalog, getOverallProviderHealth } from "@/server/modelsRegistry";
import { getRuntimeConfig } from "@/server/runtimeConfig";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function adminError(e: unknown) {
  const err = e instanceof ApiError ? e : new ApiError(500, "server_error", "Admin request failed.");
  if (!(e instanceof ApiError)) console.error("[admin/overview]", e);
  return Response.json({ error: { code: err.code, message: err.message } }, { status: err.status });
}

export async function GET(req: Request) {
  try {
    const admin = await requireAdmin(req);
    const url = new URL(req.url);
    const days = Math.min(Math.max(Number(url.searchParams.get("days") || 14), 1), 60);

    const [runtimeCfg, metrics, users, securityEvents] = await Promise.all([
      getRuntimeConfig(true),
      getSystemDailyMetrics(days),
      listUsersWithUsage({ days }),
      listSecurityEvents(25)
    ]);

    const e = readEnv();
    const providerId = runtimeCfg.globalConfig.defaultProvider || e.provider;
    const defaultModel = runtimeCfg.globalConfig.defaultModel || e.geminiModel;
    const catalog = buildModelCatalog(
      providerId,
      [],
      defaultModel,
      !!e.tavilyKey && runtimeCfg.featureFlags.webSearch,
      runtimeCfg.globalConfig.freeOnlyMode,
      runtimeCfg.modelRegistry.models,
      true
    );

    const activeUsersCount = users.filter((u) => u.status === "active").length;
    const suspendedUsersCount = users.filter((u) => u.status !== "active").length;
    const totalEstimatedTokens = metrics.totals.estimatedInputTokens + metrics.totals.estimatedOutputTokens;

    return Response.json({
      admin: {
        uid: admin.uid,
        email: admin.email,
        role: admin.role,
        isOwner: admin.isOwner
      },
      runtime: runtimeCfg,
      system: {
        adminCredentialsReady: hasAdminCredentials(),
        authConfigured: authConfigured(),
        configuredProviders: configuredProviders(),
        tavilyConfigured: !!e.tavilyKey,
        missingKeys: missingConfigKeys(),
        providerHealth: getOverallProviderHealth(
          catalog.map((m) => m.id),
          defaultModel
        ),
        tokenAccuracyNote:
          "Request, TTS, voice, failure, and rate-limit counts are exact server-recorded counters. Token counts are estimated locally (~4 chars/token) because upstream SSE streams do not always report billing tokens."
      },
      summary: {
        totalUsers: users.length,
        activeUsers: activeUsersCount,
        suspendedUsers: suspendedUsersCount,
        requestsWindow: metrics.totals.requests,
        ttsWindow: metrics.totals.tts,
        voiceWindow: metrics.totals.voiceRequests,
        estimatedTokensWindow: totalEstimatedTokens,
        failedRequestsWindow: metrics.totals.failedRequests,
        rateLimitHitsWindow: metrics.totals.rateLimitHits,
        fallbackCountWindow: metrics.totals.fallbackCount,
        securityAlertsRecent: securityEvents.filter((s) => s.severity === "high").length
      },
      daily: metrics.daily,
      byProvider: metrics.totals.byProvider,
      byModel: metrics.totals.byModel,
      modelCatalog: catalog,
      recentSecurityEvents: securityEvents.slice(0, 10)
    });
  } catch (e) {
    return adminError(e);
  }
}
