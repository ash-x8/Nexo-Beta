import { ApiError, requireAuthContext } from "@/server/firebaseAdmin";
import { checkRate, consumeDaily, recordGenerationTelemetry, recordUsageMetric } from "@/server/limits";
import { readEnv } from "@/server/env";
import { ProviderError, synthesize } from "@/server/providers";
import { getRuntimeConfig, resolveEffectiveFeatures } from "@/server/runtimeConfig";
import { TtsBodySchema } from "@/lib/schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const e = readEnv();
    const ctx = await requireAuthContext(req);
    const runtimeCfg = await getRuntimeConfig();
    const effectiveFeatures = resolveEffectiveFeatures(runtimeCfg.featureFlags, ctx.featureOverrides);

    if (runtimeCfg.maintenance.enabled && !ctx.isOwner) {
      throw new ApiError(503, "maintenance", runtimeCfg.maintenance.message || "NEXO AI is under maintenance.");
    }
    if (!effectiveFeatures.tts) {
      throw new ApiError(403, "feature_disabled", "Text-to-speech is disabled by the administrator.");
    }
    if (!e.geminiKey) {
      throw new ApiError(503, "tts_unavailable", "Server voice is not configured.");
    }

    const parsed = TtsBodySchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      throw new ApiError(400, "bad_request", "Text must be 1-1200 characters.");
    }

    try {
      checkRate(ctx.uid, "tts", Date.now(), runtimeCfg.globalConfig.rateLimitPerMinute);
    } catch (rateErr) {
      await recordUsageMetric(ctx.uid, "rateLimitHits");
      throw rateErr;
    }
    await consumeDaily(ctx.uid, "tts", runtimeCfg.globalConfig.dailyTtsLimit);

    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), e.timeoutMs);
    try {
      const geminiCfg = runtimeCfg.providerConfig.providers.gemini;
      const audio = await synthesize(parsed.data.text, ac.signal, {
        ttsModel: geminiCfg.ttsModel,
        ttsVoice: geminiCfg.ttsVoice
      });
      await recordGenerationTelemetry(ctx.uid, {
        provider: "gemini",
        model: geminiCfg.ttsModel || e.geminiTtsModel,
        inputChars: parsed.data.text.length,
        outputChars: 0,
        isTts: true
      });
      return new Response(audio.data, {
        headers: {
          "Content-Type": audio.mimeType,
          "Cache-Control": "no-store"
        }
      });
    } finally {
      clearTimeout(timer);
    }
  } catch (err) {
    if (err instanceof ProviderError) {
      return Response.json({ error: { code: err.code, message: err.message } }, { status: 502 });
    }
    if (err instanceof ApiError) {
      return Response.json({ error: { code: err.code, message: err.message } }, { status: err.status });
    }
    console.error("[tts]", err);
    return Response.json({ error: { code: "server_error", message: "Voice generation failed." } }, { status: 500 });
  }
}
