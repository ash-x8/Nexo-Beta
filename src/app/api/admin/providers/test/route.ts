import { z } from "zod";
import { recordAuditLog } from "@/server/adminAudit";
import { ApiError, requireAdmin } from "@/server/firebaseAdmin";
import { testProviderConnectivity } from "@/server/providers";
import { recordProviderFailure, recordProviderSuccess } from "@/server/nexo/healthRegistry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = z.object({
  provider: z.enum(["gemini", "openai-compatible"])
});

export async function POST(req: Request) {
  try {
    const admin = await requireAdmin(req);
    const parsed = BodySchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      throw new ApiError(400, "bad_request", "Specify provider: 'gemini' or 'openai-compatible'.");
    }

    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 10_000);
    try {
      const result = await testProviderConnectivity(parsed.data.provider, ac.signal);
      if (result.ok) {
        recordProviderSuccess(parsed.data.provider, { latencyMs: result.latencyMs });
      } else {
        recordProviderFailure(parsed.data.provider, "connectivity_test_failed", { latencyMs: result.latencyMs });
      }
      await recordAuditLog({
        actorUid: admin.uid,
        action: "test_provider_connection",
        target: parsed.data.provider,
        result: result.ok ? "success" : "error",
        metadata: { latencyMs: result.latencyMs, modelsFound: result.modelsFound }
      });
      return Response.json({ provider: parsed.data.provider, ...result });
    } finally {
      clearTimeout(timer);
    }
  } catch (e) {
    const err = e instanceof ApiError ? e : new ApiError(500, "server_error", "Provider test failed.");
    return Response.json({ error: { code: err.code, message: err.message } }, { status: err.status });
  }
}
