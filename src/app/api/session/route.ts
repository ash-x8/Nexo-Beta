import { ApiError, requireAuthContext } from "@/server/firebaseAdmin";
import { getRuntimeConfig, resolveEffectiveFeatures } from "@/server/runtimeConfig";
import type { SessionInfo } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const ctx = await requireAuthContext(req, { allowSuspended: true });
    const runtime = await getRuntimeConfig();
    const effectiveFeatures = resolveEffectiveFeatures(runtime.featureFlags, ctx.featureOverrides);

    const body: SessionInfo = {
      uid: ctx.uid,
      email: ctx.email,
      role: ctx.role,
      isOwner: ctx.isOwner,
      status: ctx.status,
      suspendedReason: ctx.suspendedReason,
      featureOverrides: ctx.featureOverrides,
      effectiveFeatures
    };
    return Response.json(body);
  } catch (e) {
    const err = e instanceof ApiError ? e : new ApiError(500, "server_error", "Could not verify session.");
    return Response.json({ error: { code: err.code, message: err.message } }, { status: err.status });
  }
}
