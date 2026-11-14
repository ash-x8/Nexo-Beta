import { NexoTranscribeBodySchema } from "@/lib/schemas";
import { ApiError, requireAuthContext } from "@/server/firebaseAdmin";
import { checkRate } from "@/server/limits";
import { transcribeUnifiedAudio } from "@/server/nexo/voiceEngine";
import { ProviderError } from "@/server/providers";
import { getRuntimeConfig, resolveEffectiveFeatures } from "@/server/runtimeConfig";
import { loadRuntimeSecretsIntoOverlay } from "@/server/runtimeSecrets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const ctx = await requireAuthContext(req);
    const runtimeCfg = await getRuntimeConfig();
    await loadRuntimeSecretsIntoOverlay(false, runtimeCfg.globalConfig.secretResolutionMode || "runtime_first");
    const effective = resolveEffectiveFeatures(runtimeCfg.featureFlags, ctx.featureOverrides);

    if (runtimeCfg.maintenance.enabled && !ctx.isOwner) {
      throw new ApiError(503, "maintenance", runtimeCfg.maintenance.message || "NEXO AI is under maintenance.");
    }

    if (!effective.voiceInput) {
      throw new ApiError(403, "feature_disabled", "Voice input is currently disabled by the administrator.");
    }

    checkRate(ctx.uid, "transcribe", Date.now(), Math.max(6, runtimeCfg.globalConfig.rateLimitPerMinute));

    const parsed = NexoTranscribeBodySchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      throw new ApiError(400, "bad_request", "Invalid audio transcription payload.");
    }

    const res = await transcribeUnifiedAudio({
      audioBase64: parsed.data.audioBase64,
      mimeType: parsed.data.mimeType,
      hintLanguage: parsed.data.hintLanguage,
      runtime: runtimeCfg
    });

    return Response.json({
      ok: true,
      assistant: "NEXO v1",
      transcript: res.transcript,
      detectedLanguage: res.detectedLanguage
    });
  } catch (e) {
    if (e instanceof ApiError) {
      return Response.json({ error: { code: e.code, message: e.message } }, { status: e.status });
    }
    if (e instanceof ProviderError) {
      const status = e.code === "transcribe_unavailable" ? 503 : 502;
      return Response.json({ error: { code: e.code, message: e.message } }, { status });
    }
    return Response.json(
      { error: { code: "transcribe_error", message: "Could not transcribe audio." } },
      { status: 500 }
    );
  }
}
