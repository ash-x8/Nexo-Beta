import { TtsBodySchema } from "@/lib/schemas";
import { ApiError, requireAuthContext } from "@/server/firebaseAdmin";
import { checkRate, consumeDaily, recordGenerationTelemetry, recordUsageMetric } from "@/server/limits";
import { synthesizeUnifiedSpeech } from "@/server/nexo/voiceEngine";
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
    const g = runtimeCfg.globalConfig;
    const effective = resolveEffectiveFeatures(runtimeCfg.featureFlags, ctx.featureOverrides);

    if (runtimeCfg.maintenance.enabled && !ctx.isOwner) {
      throw new ApiError(503, "maintenance", runtimeCfg.maintenance.message || "NEXO AI is under maintenance.");
    }
    if (!effective.tts) {
      throw new ApiError(403, "feature_disabled", "Text-to-speech is disabled by the administrator.");
    }

    const parsed = TtsBodySchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      throw new ApiError(400, "bad_request", "Invalid TTS request.");
    }

    checkRate(ctx.uid, "tts", Date.now(), g.rateLimitPerMinute);
    await consumeDaily(ctx.uid, "tts", g.dailyTtsLimit);

    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 30_000);
    try {
      const audio = await synthesizeUnifiedSpeech({
        text: parsed.data.text,
        runtime: runtimeCfg,
        signal: ac.signal
      });
      await recordGenerationTelemetry(ctx.uid, {
        provider: audio.providerUsed,
        model: runtimeCfg.providerConfig.providers.gemini.ttsModel || "tts",
        inputChars: parsed.data.text.length,
        outputChars: 0,
        isTts: true,
        taskType: "voiceConversation"
      });
      return new Response(audio.data, {
        headers: {
          "Content-Type": audio.mimeType,
          "Cache-Control": "no-store"
        }
      });
    } catch (err) {
      await recordUsageMetric(ctx.uid, "failedRequests");
      const msg = err instanceof ProviderError ? err.message : "Voice synthesis failed.";
      return Response.json({ error: { code: "tts_unavailable", message: msg } }, { status: 503 });
    } finally {
      clearTimeout(timer);
    }
  } catch (e) {
    const err = e instanceof ApiError ? e : new ApiError(500, "server_error", "Voice synthesis failed.");
    return Response.json({ error: { code: err.code, message: err.message } }, { status: err.status });
  }
}
