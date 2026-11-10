import { env } from "./env";
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

function mapHttpError(status: number, body: string): ProviderError {
  const lower = body.toLowerCase();
  if (status === 429) {
    const quota = lower.includes("quota") || lower.includes("resource_exhausted");
    return new ProviderError(
      quota ? "provider_quota" : "provider_rate_limited",
      quota
        ? "The AI provider's quota is used up for now. Wait a while or switch provider in the server configuration."
        : "The AI provider is rate-limiting requests. Try again in a moment."
    );
  }
  if (status === 401 || status === 403) return new ProviderError("provider_auth", "The server's AI credentials were rejected. Check the API key configuration.");
  if (status === 404) return new ProviderError("provider_model", "The configured AI model was not found. Check the model name in the server configuration.");
  if (status === 400) {
    if (lower.includes("api key")) return new ProviderError("provider_auth", "The server's AI API key is invalid.");
    return new ProviderError("bad_request", "The AI provider rejected this request (for example an unsupported file type or an oversized input).");
  }
  if (status >= 500) return new ProviderError("provider_unavailable", "The AI model is temporarily unavailable. Try again shortly.");
  return new ProviderError("provider_error", `The AI provider returned an error (${status}).`);
}

async function* sseLines(res: Response): AsyncGenerator<string> {
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
  const rest = buf.trim();
  if (rest.startsWith("data:")) yield rest.slice(5).trim();
}

async function post(url: string, headers: Record<string, string>, body: unknown, signal: AbortSignal) {
  let res: Response;
  try {
    res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body), signal });
  } catch (e) {
    if (signal.aborted) throw new ProviderError("timeout", "The AI took too long to respond.");
    throw new ProviderError("provider_unavailable", "Could not reach the AI provider.");
  }
  if (!res.ok) throw mapHttpError(res.status, await res.text().catch(() => ""));
  return res;
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

async function* gemini(system: string, msgs: ProviderMessage[], signal: AbortSignal): AsyncGenerator<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(env.geminiModel)}:streamGenerateContent?alt=sse`;
  const res = await post(url, { "x-goog-api-key": env.geminiKey }, {
    systemInstruction: { parts: [{ text: system }] },
    contents: msgs.map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: geminiParts(m) })),
    generationConfig: { temperature: 0.7 }
  }, signal);
  let blocked: string | undefined;
  for await (const data of sseLines(res)) {
    let j: any;
    try { j = JSON.parse(data); } catch { continue; }
    if (j.promptFeedback?.blockReason) blocked = j.promptFeedback.blockReason;
    const cand = j.candidates?.[0];
    for (const p of cand?.content?.parts || []) if (typeof p.text === "string" && !p.thought) yield p.text;
    if (cand?.finishReason === "SAFETY") blocked = "SAFETY";
  }
  if (blocked) throw new ProviderError("blocked", "The AI provider declined to answer this request.");
}

async function* compat(system: string, msgs: ProviderMessage[], signal: AbortSignal): AsyncGenerator<string> {
  const messages: unknown[] = [{ role: "system", content: system }];
  for (const m of msgs) {
    const content: unknown[] = [];
    for (const a of m.attachments || []) {
      if (a.data && a.mime.startsWith("image/")) content.push({ type: "image_url", image_url: { url: `data:${a.mime};base64,${a.data}` } });
      else if (a.text) content.push({ type: "text", text: `[Attached file: ${a.name}]\n${a.text}\n[End of file]` });
    }
    content.push({ type: "text", text: m.content || " " });
    messages.push({ role: m.role, content: content.length === 1 ? m.content || " " : content });
  }
  const res = await post(`${env.compatBase}/chat/completions`, { Authorization: `Bearer ${env.compatKey}` },
    { model: env.compatModel, messages, stream: true, temperature: 0.7 }, signal);
  for await (const data of sseLines(res)) {
    if (data === "[DONE]") return;
    try {
      const t = JSON.parse(data).choices?.[0]?.delta?.content;
      if (typeof t === "string" && t) yield t;
    } catch { /* ignore keep-alives */ }
  }
}

export function streamChat(system: string, msgs: ProviderMessage[], signal: AbortSignal) {
  return env.provider === "gemini" ? gemini(system, msgs, signal) : compat(system, msgs, signal);
}

/** Text-to-speech via Gemini. Returns a WAV file (24 kHz, 16-bit mono PCM). */
export async function synthesize(text: string, signal: AbortSignal): Promise<ArrayBuffer> {
  if (!env.geminiKey) throw new ProviderError("tts_unavailable", "Server voice needs GEMINI_API_KEY.");
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(env.geminiTtsModel)}:generateContent`;
  const res = await post(url, { "x-goog-api-key": env.geminiKey }, {
    contents: [{ parts: [{ text }] }],
    generationConfig: {
      responseModalities: ["AUDIO"],
      speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: env.geminiTtsVoice } } }
    }
  }, signal);
  const j: any = await res.json();
  const b64: string | undefined = j.candidates?.[0]?.content?.parts?.find((p: any) => p.inlineData)?.inlineData?.data;
  if (!b64) throw new ProviderError("tts_unavailable", "The voice model returned no audio.");
  const pcm = Buffer.from(b64, "base64");
  const header = Buffer.alloc(44);
  header.write("RIFF", 0); header.writeUInt32LE(36 + pcm.length, 4); header.write("WAVE", 8);
  header.write("fmt ", 12); header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(1, 22);
  header.writeUInt32LE(24000, 24); header.writeUInt32LE(48000, 28); header.writeUInt16LE(2, 32); header.writeUInt16LE(16, 34);
  header.write("data", 36); header.writeUInt32LE(pcm.length, 40);
  const wav = Buffer.concat([header, pcm]);
  const out = new ArrayBuffer(wav.length);
  new Uint8Array(out).set(wav);
  return out;
}
