import { ApiError, requireUser } from "@/server/firebaseAdmin";
import { checkRate } from "@/server/limits";
import { activeModel, providerConfigured, readEnv } from "@/server/env";
import { buildModelCatalog, getOverallProviderHealth } from "@/server/modelsRegistry";
import { availableModels } from "@/server/providers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Models the signed-in user may choose from, enriched with free-tier eligibility, status & capabilities. */
export async function GET(req: Request) {
  try {
    const uid = await requireUser(req);
    checkRate(uid, "models");
    const e = readEnv();
    const current = activeModel();

    if (!providerConfigured()) {
      return Response.json({
        current,
        provider: e.provider,
        freeOnly: e.freeOnly,
        providerHealth: "unconfigured",
        models: [],
        catalog: []
      });
    }

    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 8000);
    let reported: string[] = [];
    try {
      reported = await availableModels(ac.signal);
    } catch (err) {
      console.warn("[models] list failed:", (err as Error).message);
    } finally {
      clearTimeout(timer);
    }

    const catalog = buildModelCatalog(e.provider, reported, current, !!e.tavilyKey, e.freeOnly).slice(0, 60);
    const models = catalog.map((m) => m.id);
    const providerHealth = getOverallProviderHealth(models, current);

    return Response.json({
      current,
      provider: e.provider,
      freeOnly: e.freeOnly,
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
