import { randomUUID } from "node:crypto";
import { NexoImageBodySchema } from "@/lib/schemas";
import { ApiError, requireAuthContext } from "@/server/firebaseAdmin";
import { checkRate, consumeDaily, recordGenerationTelemetry, recordUsageMetric } from "@/server/limits";
import { claimRequestId } from "@/server/nexo/healthRegistry";
import { generateUnifiedImage } from "@/server/nexo/imageEngine";
import { ProviderError } from "@/server/providers";
import { getRuntimeConfig, resolveEffectiveFeatures } from "@/server/runtimeConfig";
import { loadRuntimeSecretsIntoOverlay } from "@/server/runtimeSecrets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: Request) {
  let releaseReqId: (() => void) | null = null;
  try {
    const ctx = await requireAuthContext(req);
    const uid = ctx.uid;
    const runtimeCfg = await getRuntimeConfig();
    await loadRuntimeSecretsIntoOverlay(false, runtimeCfg.globalConfig.secretResolutionMode || "runtime_first");
    const g = runtimeCfg.globalConfig;
    const effectiveFeatures = resolveEffectiveFeatures(runtimeCfg.featureFlags, ctx.featureOverrides);

    if (runtimeCfg.maintenance.enabled && !ctx.isOwner) {
      throw new ApiError(503, "maintenance", runtimeCfg.maintenance.message || "NEXO AI is under maintenance.");
    }

    if (!effectiveFeatures.imageGeneration) {
      throw new ApiError(
        403,
        "feature_disabled",
        "Image generation is currently disabled or unavailable on this server."
      );
    }

    const parsed = NexoImageBodySchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      throw new ApiError(400, "bad_request", parsed.error.issues[0]?.message || "Invalid image generation request.");
    }

    releaseReqId = claimRequestId(uid, parsed.data.requestId);
    if (!releaseReqId) {
      throw new ApiError(409, "duplicate_request", "This image request is already in progress.");
    }

    checkRate(uid, "image", Date.now(), Math.max(2, Math.floor(g.rateLimitPerMinute / 2)));
    await consumeDaily(uid, "requests", g.dailyRequestLimit);

    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 55_000);

    try {
      const result = await generateUnifiedImage({
        prompt: parsed.data.prompt,
        aspectRatio: parsed.data.aspectRatio,
        stylePreset: parsed.data.stylePreset,
        sourceImage: parsed.data.sourceImage,
        runtime: runtimeCfg,
        signal: ac.signal
      });

      await recordUsageMetric(uid, "imageRequests");
      await recordGenerationTelemetry(uid, {
        provider: result.providerUsed,
        model: result.modelUsed,
        inputChars: parsed.data.prompt.length,
        outputChars: 256,
        isImage: true,
        taskType: "imageGen"
      });

      return Response.json({
        ok: true,
        assistant: "NEXO v1",
        image: {
          id: randomUUID(),
          prompt: parsed.data.prompt,
          aspectRatio: result.aspectRatio,
          mimeType: result.mimeType,
          dataUrl: result.dataUrl,
          createdAt: Date.now()
        }
      });
    } catch (err) {
      await recordUsageMetric(uid, "failedRequests");
      const msg =
        err instanceof ProviderError
          ? err.code === "provider_auth" || err.code === "image_unconfigured"
            ? "Image generation service is not available right now. Check server credentials or try again later."
            : err.message
          : "Unable to generate image right now.";
      const status = err instanceof ProviderError && (err.code === "provider_rate_limited" || err.code === "provider_quota") ? 429 : 503;
      return Response.json({ error: { code: "image_failed", message: msg } }, { status });
    } finally {
      clearTimeout(timer);
      releaseReqId?.();
    }
  } catch (e) {
    releaseReqId?.();
    const err = e instanceof ApiError ? e : new ApiError(500, "server_error", "Image generation failed.");
    return Response.json({ error: { code: err.code, message: err.message } }, { status: err.status });
  }
}
