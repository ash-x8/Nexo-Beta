import { ApiError, requireAuthContext } from "@/server/firebaseAdmin";
import { readUsage } from "@/server/limits";
import { getRuntimeConfig } from "@/server/runtimeConfig";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const ctx = await requireAuthContext(req);
    const runtimeCfg = await getRuntimeConfig();
    const g = runtimeCfg.globalConfig;
    return Response.json(
      await readUsage(ctx.uid, {
        dailyLimit: g.dailyRequestLimit,
        dailyTtsLimit: g.dailyTtsLimit,
        activeProviderId: g.defaultProvider,
        activeModelId: g.defaultModel
      })
    );
  } catch (e) {
    const err = e instanceof ApiError ? e : new ApiError(500, "server_error", "Could not read usage.");
    return Response.json({ error: { code: err.code, message: err.message } }, { status: err.status });
  }
}
