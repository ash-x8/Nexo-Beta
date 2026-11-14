import { readEnv } from "@/server/env";
import { ProviderError } from "@/server/providers";
import type { RuntimeConfigSnapshot } from "@/server/runtimeConfig";
import { generateGeminiImage } from "./geminiSdk";
import { recordProviderFailure, recordProviderSuccess } from "./healthRegistry";

export interface ImageGenerationResult {
  dataUrl: string;
  mimeType: string;
  aspectRatio: "1:1" | "4:5" | "3:2" | "16:9" | "9:16";
  providerUsed: "gemini" | "openai-compatible";
  modelUsed: string;
  latencyMs: number;
}

const STYLE_MODIFIERS: Record<string, string> = {
  auto: "",
  photoreal: ", photorealistic editorial photography, natural lighting, crisp fine textures",
  editorial: ", minimalist architectural editorial style, balanced composition, studio contrast",
  illustration: ", refined modern digital illustration, cohesive color palette, clean brushwork",
  concept: ", detailed industrial concept art, atmospheric depth, dramatic lighting",
  minimal: ", clean geometric minimalism, restrained neutral negative space, crisp edges"
};

function openaiSizeForAspect(aspect: "1:1" | "4:5" | "3:2" | "16:9" | "9:16"): string {
  switch (aspect) {
    case "16:9":
    case "3:2":
      return "1536x1024";
    case "9:16":
    case "4:5":
      return "1024x1536";
    default:
      return "1024x1024";
  }
}

export async function generateUnifiedImage(opts: {
  prompt: string;
  aspectRatio: "1:1" | "4:5" | "3:2" | "16:9" | "9:16";
  stylePreset: string;
  sourceImage?: { mime: string; data: string };
  runtime: RuntimeConfigSnapshot;
  signal: AbortSignal;
}): Promise<ImageGenerationResult> {
  const env = readEnv();
  const pCfg = opts.runtime.providerConfig;
  const fullPrompt = `${opts.prompt.trim()}${STYLE_MODIFIERS[opts.stylePreset] || ""}`;

  const geminiEnabled = pCfg.providers.gemini?.enabled !== false && Boolean(env.geminiKey);
  const compatEnabled =
    pCfg.providers["openai-compatible"]?.enabled !== false && Boolean(env.compatBase && env.compatKey);

  if (!geminiEnabled && !compatEnabled) {
    throw new ProviderError(
      "image_unconfigured",
      "Image generation requires an active image-capable service configured on the server."
    );
  }

  const orderedProviders: Array<"gemini" | "openai-compatible"> = [];
  if (geminiEnabled) orderedProviders.push("gemini");
  if (compatEnabled && !opts.sourceImage) orderedProviders.push("openai-compatible");
  if (pCfg.providers["openai-compatible"]?.priority < (pCfg.providers.gemini?.priority ?? 1) && compatEnabled && !opts.sourceImage) {
    orderedProviders.reverse();
  }

  let lastErr: unknown;

  for (const prov of orderedProviders) {
    const started = Date.now();
    if (prov === "gemini") {
      const configuredImgModel = pCfg.providers.gemini?.imageModel || env.geminiImageModel;
      const modelCandidates = Array.from(
        new Set([configuredImgModel, "gemini-2.5-flash-image", "gemini-3.1-flash-lite-image"].filter(Boolean))
      );
      try {
        const res = await generateGeminiImage({
          prompt: fullPrompt,
          aspectRatio: opts.aspectRatio,
          modelCandidates,
          sourceImage: opts.sourceImage
        });
        const latencyMs = Date.now() - started;
        recordProviderSuccess("gemini", { latencyMs });
        return {
          dataUrl: res.dataUrl,
          mimeType: res.mimeType,
          aspectRatio: opts.aspectRatio,
          providerUsed: "gemini",
          modelUsed: res.modelUsed,
          latencyMs
        };
      } catch (err) {
        lastErr = err;
        const code = err instanceof ProviderError ? err.code : "provider_error";
        recordProviderFailure("gemini", code, {
          isRateLimit: code === "provider_rate_limited" || code === "provider_quota",
          triggeredFallback: orderedProviders.length > 1,
          latencyMs: Date.now() - started
        });
      }
    } else if (prov === "openai-compatible") {
      const model = pCfg.providers["openai-compatible"]?.imageModel || env.compatImageModel || "gpt-image-1";
      try {
        const res = await fetch(`${env.compatBase}/images/generations`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${env.compatKey}`
          },
          body: JSON.stringify({
            model,
            prompt: fullPrompt,
            n: 1,
            size: openaiSizeForAspect(opts.aspectRatio),
            response_format: "b64_json"
          }),
          signal: opts.signal
        });
        if (!res.ok) {
          const text = await res.text().catch(() => "");
          throw new ProviderError(
            res.status === 429 ? "provider_rate_limited" : "image_unavailable",
            text ? `Image service returned (${res.status}).` : "Image generation request failed."
          );
        }
        const json = (await res.json()) as { data?: Array<{ b64_json?: string; url?: string }> };
        const first = json.data?.[0];
        if (!first?.b64_json) {
          throw new ProviderError("image_unavailable", "The image service returned no image payload.");
        }
        const latencyMs = Date.now() - started;
        recordProviderSuccess("openai-compatible", { latencyMs });
        return {
          dataUrl: `data:image/png;base64,${first.b64_json}`,
          mimeType: "image/png",
          aspectRatio: opts.aspectRatio,
          providerUsed: "openai-compatible",
          modelUsed: model,
          latencyMs
        };
      } catch (err) {
        lastErr = err;
        const code = err instanceof ProviderError ? err.code : "provider_error";
        recordProviderFailure("openai-compatible", code, {
          isRateLimit: code === "provider_rate_limited" || code === "provider_quota",
          latencyMs: Date.now() - started
        });
      }
    }
  }

  if (lastErr instanceof ProviderError) throw lastErr;
  throw new ProviderError("image_unavailable", "Unable to generate the requested image right now.");
}
