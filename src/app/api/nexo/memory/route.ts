import { NexoMemorySummarizeSchema } from "@/lib/schemas";
import { ApiError, requireAuthContext } from "@/server/firebaseAdmin";
import { checkRate } from "@/server/limits";
import { consolidateConversationMemory } from "@/server/nexo/memoryEngine";
import { getRuntimeConfig, resolveEffectiveFeatures } from "@/server/runtimeConfig";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const ctx = await requireAuthContext(req);
    const runtimeCfg = await getRuntimeConfig();
    const effective = resolveEffectiveFeatures(runtimeCfg.featureFlags, ctx.featureOverrides);

    if (!effective.personalMemory) {
      throw new ApiError(403, "feature_disabled", "Memory is currently disabled.");
    }

    checkRate(ctx.uid, "memory", Date.now(), 8);

    const parsed = NexoMemorySummarizeSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      throw new ApiError(400, "bad_request", "Invalid memory consolidation payload.");
    }

    const result = await consolidateConversationMemory(parsed.data);
    return Response.json({
      ok: true,
      assistant: "NEXO v1",
      summary: result.summary,
      extractedFacts: result.extractedFacts
    });
  } catch (e) {
    const err = e instanceof ApiError ? e : new ApiError(500, "server_error", "Memory consolidation failed.");
    return Response.json({ error: { code: err.code, message: err.message } }, { status: err.status });
  }
}
