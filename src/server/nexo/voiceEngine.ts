import { readEnv } from "@/server/env";
import { ProviderError, synthesize as legacyGeminiSynthesize } from "@/server/providers";
import type { RuntimeConfigSnapshot } from "@/server/runtimeConfig";
import { synthesizeGeminiTts, transcribeGeminiAudio } from "./geminiSdk";
import { recordProviderFailure, recordProviderSuccess } from "./healthRegistry";

export async function transcribeUnifiedAudio(opts: {
  audioBase64: string;
  mimeType: string;
  hintLanguage: string;
  runtime: RuntimeConfigSnapshot;
}): Promise<{ transcript: string; detectedLanguage: "en" | "si" | "ta" | "hi" | "other"; providerUsed: string; latencyMs: number }> {
  const env = readEnv();
  const started = Date.now();

  if (opts.runtime.providerConfig.providers.gemini?.enabled !== false && env.geminiKey) {
    try {
      const model = env.geminiTranscribeModel || env.geminiModel || "gemini-2.5-flash";
      const res = await transcribeGeminiAudio({
        audioBase64: opts.audioBase64,
        mimeType: opts.mimeType,
        hintLanguage: opts.hintLanguage,
        model
      });
      const latencyMs = Date.now() - started;
      recordProviderSuccess("gemini", { latencyMs });
      return {
        transcript: res.transcript,
        detectedLanguage: res.detectedLanguage,
        providerUsed: "gemini",
        latencyMs
      };
    } catch (err) {
      const code = err instanceof ProviderError ? err.code : "transcribe_error";
      recordProviderFailure("gemini", code, {
        isRateLimit: code === "provider_rate_limited" || code === "provider_quota",
        latencyMs: Date.now() - started
      });
      throw err;
    }
  }

  throw new ProviderError(
    "transcribe_unavailable",
    "Server audio transcription is not configured; browser speech recognition fallback is active."
  );
}

export async function synthesizeUnifiedSpeech(opts: {
  text: string;
  runtime: RuntimeConfigSnapshot;
  signal: AbortSignal;
}): Promise<{ data: ArrayBuffer; mimeType: string; providerUsed: string }> {
  const env = readEnv();
  const gEntry = opts.runtime.providerConfig.providers.gemini;
  const ttsModel = gEntry?.ttsModel || env.geminiTtsModel;
  const ttsVoice = gEntry?.ttsVoice || env.geminiTtsVoice;
  const started = Date.now();

  const ttsKey = env.geminiTtsKey || env.geminiKey;
  if (gEntry?.enabled !== false && ttsKey) {
    try {
      const out = await synthesizeGeminiTts({
        text: opts.text,
        model: ttsModel,
        voiceName: ttsVoice,
        apiKeyOverride: ttsKey
      });
      recordProviderSuccess("gemini", { latencyMs: Date.now() - started });
      return { ...out, providerUsed: "gemini" };
    } catch {
      // Fallback to direct REST synthesizer if SDK call fails transiently
      try {
        const out = await legacyGeminiSynthesize(opts.text, opts.signal, { ttsModel, ttsVoice });
        recordProviderSuccess("gemini", { latencyMs: Date.now() - started });
        return { ...out, providerUsed: "gemini" };
      } catch (err) {
        const code = err instanceof ProviderError ? err.code : "tts_unavailable";
        recordProviderFailure("gemini", code, { latencyMs: Date.now() - started });
        throw err;
      }
    }
  }

  throw new ProviderError("tts_unavailable", "Server voice synthesis is not configured.");
}
