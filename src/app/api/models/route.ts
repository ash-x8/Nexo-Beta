import { ApiError, requireAuthContext } from "@/server/firebaseAdmin";
import { checkRate } from "@/server/limits";
import { readEnv } from "@/server/env";
import { buildModelCatalog, getOverallProviderHealth } from "@/server/modelsRegistry";
import { availableModels } from "@/server/providers";
import { getRuntimeConfig, resolveEffectiveFeatures } from "@/server/runtimeConfig";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Models the signed-in user may choose from, enriched with runtime Admin overrides & Free-Only policy. */
export async function GET(req: Request) {
  try {
    const ctx = await requireAuthContext(req);
    const runtimeCfg = await getRuntimeConfig();
    const g = runtimeCfg.globalConfig;
    const effectiveFeatures = resolveEffectiveFeatures(runtimeCfg.featureFlags, ctx.featureOverrides);

    if (runtimeCfg.maintenance.enabled && !ctx.isOwner) {
      throw new ApiError(503, "maintenance", runtimeCfg.maintenance.message || "NEXO AI is under maintenance.");
    }

    checkRate(ctx.uid, "models", Date.now(), g.rateLimitPerMinute * 2);
    const e = readEnv();
    const providerId = g.defaultProvider || e.provider;
    const provEntry = runtimeCfg.providerConfig.providers[providerId as keyof typeof runtimeCfg.providerConfig.providers];
    const current = g.defaultModel || provEntry?.defaultModel || (providerId === "gemini" ? e.geminiModel : e.compatModel);

    const hasCreds =
      providerId === "gemini"
        ? !!(e.geminiKey && current && provEntry?.enabled !== false)
        : !!(e.compatBase && e.compatKey && current && provEntry?.enabled !== false);

    if (!hasCreds) {
      return Response.json({
        current,
        provider: providerId,
        freeOnly: g.freeOnlyMode,
        providerHealth: "unconfigured",
        models: [],
        catalog: []
      });
    }

    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 8000);
    let reported: string[] = [];
    try {
      reported = await availableModels(ac.signal, providerId);
    } catch (err) {
      console.warn("[models] list failed:", (err as Error).message);
    } finally {
      clearTimeout(timer);
    }

    const catalog = buildModelCatalog(
      providerId,
      reported,
      current,
      effectiveFeatures.webSearch && !!e.tavilyKey,
      g.freeOnlyMode,
      runtimeCfg.modelRegistry.models,
      false
    ).slice(0, 60);
    const models = catalog.map((m) => m.id);
    const providerHealth = getOverallProviderHealth(models, current);

    return Response.json({
      current,
      provider: providerId,
      freeOnly: g.freeOnlyMode,
      providerHealth,
      models,
      catalog
    });
  } catch (e) {
    const err = e instanceof ApiError ? e : new ApiError(500, "server_error", "Could not load models.");
    if (!(e instanceof ApiError)) console.error("[models]", e);
    return Response.json({ error: { code: err.code, message: err.message } }, { status: err.status });
  }
}
