import { GoogleGenAI } from "@google/genai";
import { readEnv } from "@/server/env";
import { pcmToWav, ProviderError } from "@/server/providers";

let cachedClientKey = "";
let cachedClient: GoogleGenAI | null = null;

export function getGeminiClient(): GoogleGenAI {
  const { geminiKey } = readEnv();
  if (!geminiKey) {
    throw new ProviderError("server_config", "GEMINI_API_KEY is not configured on the server.");
  }
  if (!cachedClient || cachedClientKey !== geminiKey) {
    cachedClientKey = geminiKey;
    cachedClient = new GoogleGenAI({
      apiKey: geminiKey,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build"
        }
      }
    });
  }
  return cachedClient;
}

export function _resetGeminiClientForTest(): void {
  cachedClientKey = "";
  cachedClient = null;
}

export function normalizeSdkError(err: unknown): ProviderError {
  if (err instanceof ProviderError) return err;
  const e = err as { status?: number; message?: string; code?: string };
  const msg = String(e?.message || "AI service error");
  const lower = msg.toLowerCase();
  const status = typeof e?.status === "number" ? e.status : 0;

  if (status === 429 || lower.includes("429") || lower.includes("resource_exhausted") || lower.includes("quota")) {
    const quota = lower.includes("quota") || lower.includes("resource_exhausted");
    return new ProviderError(
      quota ? "provider_quota" : "provider_rate_limited",
      quota ? "Service capacity is temporarily saturated. Please try again in a moment." : "Rate limit reached. Retrying shortly."
    );
  }
  if (status === 401 || status === 403 || lower.includes("api key") || lower.includes("permission_denied")) {
    return new ProviderError("provider_auth", "Server authentication credentials for the AI service are invalid or missing permissions.");
  }
  if (status === 404 || lower.includes("not found")) {
    return new ProviderError("provider_model", "The requested capability model is currently unavailable.");
  }
  if (status === 400 || lower.includes("invalid_argument")) {
    return new ProviderError("bad_request", "The request input could not be processed. Adjust the prompt or attachment.");
  }
  if (lower.includes("abort") || lower.includes("timeout")) {
    return new ProviderError("timeout", "The request took too long to complete.");
  }
  return new ProviderError("provider_unavailable", "The service is temporarily unavailable. Please try again.");
}

export async function generateGeminiImage(opts: {
  prompt: string;
  aspectRatio: "1:1" | "4:5" | "3:2" | "16:9" | "9:16";
  modelCandidates: string[];
  sourceImage?: { mime: string; data: string };
}): Promise<{ dataUrl: string; mimeType: string; modelUsed: string }> {
  const ai = getGeminiClient();
  let lastErr: unknown;

  // Map 4:5 cleanly to closest supported Gemini ratio 3:4 if 4:5 is rejected, or pass native aspect ratio directly first
  const ratioMap: Record<string, string[]> = {
    "1:1": ["1:1"],
    "4:5": ["4:5", "3:4"],
    "3:2": ["3:2", "4:3"],
    "16:9": ["16:9"],
    "9:16": ["9:16"]
  };

  for (const model of opts.modelCandidates) {
    const ratios = ratioMap[opts.aspectRatio] || ["1:1"];
    for (const ratio of ratios) {
      try {
        const contents = opts.sourceImage
          ? [
              { text: opts.prompt },
              { inlineData: { mimeType: opts.sourceImage.mime, data: opts.sourceImage.data } }
            ]
          : opts.prompt;

        const response = await ai.models.generateContent({
          model,
          contents,
          config: {
            responseModalities: ["IMAGE", "TEXT"],
            imageConfig: {
              aspectRatio: ratio
            }
          } as Record<string, unknown>
        });

        const parts = response.candidates?.[0]?.content?.parts || [];
        for (const part of parts) {
          const inline = (part as { inlineData?: { data?: string; mimeType?: string } }).inlineData;
          if (inline?.data) {
            const mimeType = inline.mimeType || "image/png";
            return {
              dataUrl: `data:${mimeType};base64,${inline.data}`,
              mimeType,
              modelUsed: model
            };
          }
        }
      } catch (err) {
        lastErr = err;
        const msg = String((err as Error)?.message || "").toLowerCase();
        // If aspectRatio string caused 400, try fallback ratio in ratioMap before switching model
        if (msg.includes("aspect") && ratio !== ratios[ratios.length - 1]) {
          continue;
        }
        break;
      }
    }
  }

  throw normalizeSdkError(lastErr || new ProviderError("image_unavailable", "Unable to generate image with configured models."));
}

export async function transcribeGeminiAudio(opts: {
  audioBase64: string;
  mimeType: string;
  hintLanguage: string;
  model: string;
}): Promise<{ transcript: string; detectedLanguage: "en" | "si" | "ta" | "hi" | "other"; modelUsed: string }> {
  const ai = getGeminiClient();
  const hint =
    opts.hintLanguage && opts.hintLanguage !== "auto"
      ? `Language hint: ${opts.hintLanguage}. However, if the speaker clearly uses another language, transcribe in the actual spoken language.`
      : "Auto-detect the spoken language (e.g. Sinhala, English, Tamil, Hindi, or mixed).";

  const instruction = [
    "Transcribe the user's spoken audio accurately in its ORIGINAL spoken language and native script.",
    "CRITICAL: If the speaker speaks Sinhala (සිංහල), output Sinhala script (සිංහල). If Tamil (தமிழ்), output Tamil script. If Hindi (हिन्दी), output Devanagari. If English, output English. Do NOT translate Sinhala/Tamil/Hindi into English.",
    hint,
    'Return ONLY a compact JSON object with keys: {"language":"si"|"ta"|"hi"|"en"|"other","transcript":"..."}.'
  ].join("\n");

  try {
    const response = await ai.models.generateContent({
      model: opts.model,
      contents: [
        { text: instruction },
        { inlineData: { mimeType: opts.mimeType, data: opts.audioBase64 } }
      ],
      config: {
        temperature: 0.1,
        responseMimeType: "application/json"
      }
    });

    const raw = (response.text || "").trim();
    const parsed = JSON.parse(raw) as { language?: string; transcript?: string };
    const transcript = (parsed.transcript || "").trim();
    const langRaw = (parsed.language || "").toLowerCase();
    const detectedLanguage =
      langRaw === "si" || langRaw === "ta" || langRaw === "hi" || langRaw === "en" ? langRaw : "other";
    return { transcript, detectedLanguage, modelUsed: opts.model };
  } catch (err) {
    throw normalizeSdkError(err);
  }
}

export async function synthesizeGeminiTts(opts: {
  text: string;
  model: string;
  voiceName: string;
}): Promise<{ data: ArrayBuffer; mimeType: string }> {
  const ai = getGeminiClient();
  try {
    const response = await ai.models.generateContent({
      model: opts.model,
      contents: [{ parts: [{ text: opts.text }] }],
      config: {
        responseModalities: ["AUDIO"],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: opts.voiceName }
          }
        }
      }
    });

    const parts = response.candidates?.[0]?.content?.parts || [];
    const inline = parts.find((p) => (p as { inlineData?: { data?: string } }).inlineData?.data)?.inlineData;
    if (!inline?.data) {
      throw new ProviderError("tts_unavailable", "Voice synthesis returned no audio.");
    }
    const rawBuf = Buffer.from(inline.data, "base64");
    const mime = (inline.mimeType || "audio/L16;rate=24000").toLowerCase();
    if (mime.includes("pcm") || mime.includes("l16")) {
      const rateMatch = /rate=(\d+)/.exec(mime);
      const sampleRate = rateMatch ? Number(rateMatch[1]) || 24000 : 24000;
      return { data: pcmToWav(rawBuf, sampleRate), mimeType: "audio/wav" };
    }
    const out = new ArrayBuffer(rawBuf.length);
    new Uint8Array(out).set(rawBuf);
    return { data: out, mimeType: inline.mimeType || "audio/wav" };
  } catch (err) {
    throw normalizeSdkError(err);
  }
}
