import { readEnv } from "./env";
import type { Attachment } from "@/lib/types";

export class ProviderError extends Error {
  constructor(public code: string, message: string) {
    super(message);
  }
}

export interface ProviderMessage {
  role: "user" | "assistant";
  content: string;
  attachments?: Attachment[];
}

export interface SynthesizedAudio {
  data: ArrayBuffer;
  mimeType: string;
}

export function mapHttpError(status: number, body: string): ProviderError {
  const lower = body.toLowerCase();
  if (status === 429) {
    const quota = lower.includes("quota") || lower.includes("resource_exhausted");
    return new ProviderError(
      quota ? "provider_quota" : "provider_rate_limited",
      quota
        ? "The AI provider's quota is exhausted right now. Try again later or check your provider billing/quota."
        : "The AI provider is rate-limiting requests. Try again in a moment."
    );
  }
  if (status === 401 || status === 403) {
    return new ProviderError("provider_auth", "The server's AI credentials were rejected. Verify your API key configuration.");
  }
  if (status === 404) {
    return new ProviderError("provider_model", "The configured AI model was not found. Check the model name in server configuration.");
  }
  if (status === 400) {
    if (lower.includes("api key")) return new ProviderError("provider_auth", "The server's AI API key is invalid.");
    return new ProviderError("bad_request", "The AI provider rejected this request (for example an unsupported file or oversized input).");
  }
  if (status >= 500) {
    return new ProviderError("provider_unavailable", "The AI model is temporarily unavailable. Please try again shortly.");
  }
  return new ProviderError("provider_error", `The AI provider returned an error (${status}).`);
}

export async function* sseLines(res: Response): AsyncGenerator<string> {
  if (!res.body) return;
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i: number;
    while ((i = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, i).trim();
      buf = buf.slice(i + 1);
      if (line.startsWith("data:")) yield line.slice(5).trim();
    }
  }
  buf += dec.decode();
  const lines = buf.split("\n");
  for (const raw of lines) {
    const line = raw.trim();
    if (line.startsWith("data:")) yield line.slice(5).trim();
  }
}

async function post(url: string, headers: Record<string, string>, body: unknown, signal: AbortSignal) {
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body),
      signal
    });
  } catch {
    if (signal.aborted) throw new ProviderError("timeout", "The AI took too long to respond.");
    throw new ProviderError("provider_unavailable", "Could not reach the AI provider.");
  }
  if (!res.ok) throw mapHttpError(res.status, await res.text().catch(() => ""));
  return res;
}

async function getJson(url: string, headers: Record<string, string>, signal: AbortSignal): Promise<Record<string, unknown>> {
  let res: Response;
  try {
    res = await fetch(url, { headers, signal });
  } catch {
    if (signal.aborted) throw new ProviderError("timeout", "The AI provider timed out.");
    throw new ProviderError("provider_unavailable", "Could not reach the AI provider.");
  }
  if (!res.ok) throw mapHttpError(res.status, await res.text().catch(() => ""));
  return res.json() as Promise<Record<string, unknown>>;
}

function geminiParts(m: ProviderMessage) {
  const parts: Record<string, unknown>[] = [];
  for (const a of m.attachments || []) {
    if (a.data) parts.push({ inlineData: { mimeType: a.mime, data: a.data } });
    else if (a.text) parts.push({ text: `[Attached file: ${a.name}]\n${a.text}\n[End of file]` });
  }
  parts.push({ text: m.content || " " });
  return parts;
}

async function* gemini(system: string, msgs: ProviderMessage[], signal: AbortSignal, model: string): AsyncGenerator<string> {
  const env = readEnv();
  if (!env.geminiKey) throw new ProviderError("server_config", "GEMINI_API_KEY is not configured on the server.");
  if (!model) throw new ProviderError("provider_model", "GEMINI_MODEL is not configured on the server.");

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse`;
  const res = await post(
    url,
    { "x-goog-api-key": env.geminiKey },
    {
      systemInstruction: { parts: [{ text: system }] },
      contents: msgs.map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: geminiParts(m) })),
      generationConfig: { temperature: 0.7 }
    },
    signal
  );

  let blocked: string | undefined;
  for await (const data of sseLines(res)) {
    let j: {
      promptFeedback?: { blockReason?: string };
      candidates?: Array<{
        finishReason?: string;
        content?: { parts?: Array<{ text?: string; thought?: boolean }> };
      }>;
    };
    try {
      j = JSON.parse(data);
    } catch {
      continue;
    }
    if (j.promptFeedback?.blockReason) blocked = j.promptFeedback.blockReason;
    const cand = j.candidates?.[0];
    for (const p of cand?.content?.parts || []) {
      if (typeof p.text === "string" && !p.thought) yield p.text;
    }
    if (cand?.finishReason === "SAFETY") blocked = "SAFETY";
  }
  if (blocked) throw new ProviderError("blocked", "The AI provider declined to answer this request.");
}

async function* compat(system: string, msgs: ProviderMessage[], signal: AbortSignal, model: string): AsyncGenerator<string> {
  const env = readEnv();
  if (!env.compatBase || !env.compatKey || !model) {
    throw new ProviderError("server_config", "OpenAI-compatible provider credentials are incomplete.");
  }

  const messages: unknown[] = [{ role: "system", content: system }];
  for (const m of msgs) {
    const content: unknown[] = [];
    for (const a of m.attachments || []) {
      if (a.data && a.mime.startsWith("image/")) {
        content.push({ type: "image_url", image_url: { url: `data:${a.mime};base64,${a.data}` } });
      } else if (a.text) {
        content.push({ type: "text", text: `[Attached file: ${a.name}]\n${a.text}\n[End of file]` });
      }
    }
    content.push({ type: "text", text: m.content || " " });
    messages.push({ role: m.role, content: content.length === 1 ? m.content || " " : content });
  }

  const res = await post(
    `${env.compatBase}/chat/completions`,
    { Authorization: `Bearer ${env.compatKey}` },
    { model, messages, stream: true, temperature: 0.7 },
    signal
  );

  for await (const data of sseLines(res)) {
    if (data === "[DONE]") return;
    try {
      const parsed = JSON.parse(data) as { choices?: Array<{ delta?: { content?: string } }> };
      const t = parsed.choices?.[0]?.delta?.content;
      if (typeof t === "string" && t) yield t;
    } catch {
      /* ignore keep-alives */
    }
  }
}

export interface Provider {
  id: string;
  supportsPdf: boolean;
  defaultModel: () => string;
  stream: (system: string, msgs: ProviderMessage[], signal: AbortSignal, model: string) => AsyncGenerator<string>;
  listModels: (signal: AbortSignal) => Promise<string[]>;
}

const geminiProvider: Provider = {
  id: "gemini",
  supportsPdf: true,
  defaultModel: () => readEnv().geminiModel,
  stream: gemini,
  async listModels(signal) {
    const env = readEnv();
    if (!env.geminiKey) return [];
    const j = (await getJson(
      "https://generativelanguage.googleapis.com/v1beta/models?pageSize=200",
      { "x-goog-api-key": env.geminiKey },
      signal
    )) as { models?: Array<{ name?: string; supportedGenerationMethods?: string[] }> };
    const skip = /tts|embed|imagen|aqa|live|audio|image|veo|robotics/i;
    return (j.models || [])
      .filter(
        (m) =>
          (m.supportedGenerationMethods || []).includes("generateContent") &&
          typeof m.name === "string" &&
          /^models\/gemini/.test(m.name) &&
          !skip.test(m.name)
      )
      .map((m) => String(m.name).replace(/^models\//, ""))
      .sort();
  }
};

const compatProvider: Provider = {
  id: "openai-compatible",
  supportsPdf: false,
  defaultModel: () => readEnv().compatModel,
  stream: compat,
  async listModels(signal) {
    const env = readEnv();
    if (!env.compatBase || !env.compatKey) return [];
    const j = (await getJson(`${env.compatBase}/models`, { Authorization: `Bearer ${env.compatKey}` }, signal)) as {
      data?: Array<{ id?: string }>;
    };
    return (j.data || []).map((m) => String(m.id)).filter(Boolean).sort();
  }
};

const registry: Record<string, Provider> = {
  [geminiProvider.id]: geminiProvider,
  [compatProvider.id]: compatProvider
};

export function activeProvider(): Provider {
  const providerId = readEnv().provider;
  const found = registry[providerId];
  if (!found) {
    throw new ProviderError("server_config", `Unsupported AI_PROVIDER "${providerId}". Use "gemini" or "openai-compatible".`);
  }
  return found;
}

export function streamChat(system: string, msgs: ProviderMessage[], signal: AbortSignal, model?: string) {
  const p = activeProvider();
  return p.stream(system, msgs, signal, model || p.defaultModel());
}

let modelCache: { providerId: string; at: number; list: string[] } | null = null;

/** Models the configured provider reports as usable (cached 10 min per provider). */
export async function availableModels(signal: AbortSignal): Promise<string[]> {
  const p = activeProvider();
  if (modelCache && modelCache.providerId === p.id && Date.now() - modelCache.at < 10 * 60_000) {
    return modelCache.list;
  }
  const list = await p.listModels(signal);
  modelCache = { providerId: p.id, at: Date.now(), list };
  return list;
}

export function _resetModelCacheForTest(): void {
  modelCache = null;
}

/** Wraps raw 16-bit mono PCM bytes with a valid RIFF/WAV header. */
export function pcmToWav(pcm: Buffer, sampleRate = 24000): ArrayBuffer {
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16); // PCM chunk size
  header.writeUInt16LE(1, 20); // PCM format
  header.writeUInt16LE(1, 22); // mono
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2, 28); // byte rate
  header.writeUInt16LE(2, 32); // block align
  header.writeUInt16LE(16, 34); // bits per sample
  header.write("data", 36);
  header.writeUInt32LE(pcm.length, 40);
  const wav = Buffer.concat([header, pcm]);
  const out = new ArrayBuffer(wav.length);
  new Uint8Array(out).set(wav);
  return out;
}

/** Text-to-speech via Gemini. Handles both raw PCM (L16/PCM -> WAV) and encoded audio formats. */
export async function synthesize(text: string, signal: AbortSignal): Promise<SynthesizedAudio> {
  const env = readEnv();
  if (!env.geminiKey) throw new ProviderError("tts_unavailable", "Server voice needs GEMINI_API_KEY.");
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(env.geminiTtsModel)}:generateContent`;
  const res = await post(
    url,
    { "x-goog-api-key": env.geminiKey },
    {
      contents: [{ parts: [{ text }] }],
      generationConfig: {
        responseModalities: ["AUDIO"],
        speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: env.geminiTtsVoice } } }
      }
    },
    signal
  );

  const j = (await res.json()) as {
    candidates?: Array<{
      content?: { parts?: Array<{ inlineData?: { data?: string; mimeType?: string } }> };
    }>;
  };
  const inline = j.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data)?.inlineData;
  if (!inline?.data) throw new ProviderError("tts_unavailable", "The voice model returned no audio.");

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
}
