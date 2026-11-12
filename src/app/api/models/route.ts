import { ApiError, requireUser } from "@/server/firebaseAdmin";
import { checkRate } from "@/server/limits";
import { activeModel, providerConfigured } from "@/server/env";
import { availableModels } from "@/server/providers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Models the signed-in user may choose from. Returns empty list cleanly if listing fails. */
export async function GET(req: Request) {
  try {
    const uid = await requireUser(req);
    checkRate(uid, "models");
    const current = activeModel();
    if (!providerConfigured()) {
      return Response.json({ current, models: [] });
    }
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 8000);
    try {
      const list = await availableModels(ac.signal);
      return Response.json({ current, models: list.slice(0, 60) });
    } catch (e) {
      console.warn("[models] list failed:", (e as Error).message);
      return Response.json({ current, models: [] });
    } finally {
      clearTimeout(timer);
    }
  } catch (e) {
    const err = e instanceof ApiError ? e : new ApiError(500, "server_error", "Could not load models.");
    if (!(e instanceof ApiError)) console.error("[models]", e);
    return Response.json({ error: { code: err.code, message: err.message } }, { status: err.status });
  }
}
