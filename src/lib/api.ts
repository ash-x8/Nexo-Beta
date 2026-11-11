import type { Attachment, StreamEvent } from "./types";

export class ApiClientError extends Error {
  constructor(public code: string, message: string) { super(message); }
}

export interface ChatRequest {
  token: string;
  messages: { role: "user" | "assistant"; content: string; attachments?: Attachment[] }[];
  language: "en" | "si" | "auto";
  memory: string[];
  useSearch: boolean;
  model?: string;
  signal: AbortSignal;
}

export async function* streamChat(r: ChatRequest): AsyncGenerator<StreamEvent> {
  let res: Response;
  try {
    res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${r.token}` },
      body: JSON.stringify({ messages: r.messages, language: r.language, memory: r.memory, useSearch: r.useSearch, model: r.model }),
      signal: r.signal
    });
  } catch (e) {
    if (r.signal.aborted) throw e;
    throw new ApiClientError("network", "You appear to be offline or the server is unreachable.");
  }
  if (!res.ok || !res.body) {
    const j = await res.json().catch(() => null);
    throw new ApiClientError(j?.error?.code || "http_" + res.status, j?.error?.message || `Request failed (${res.status}).`);
  }
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
      if (line) yield JSON.parse(line) as StreamEvent;
    }
  }
}

export async function fetchTts(token: string, text: string, signal: AbortSignal): Promise<ArrayBuffer> {
  const res = await fetch("/api/tts", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ text }),
    signal
  });
  if (!res.ok) {
    const j = await res.json().catch(() => null);
    throw new ApiClientError(j?.error?.code || "tts", j?.error?.message || "Voice failed.");
  }
  return res.arrayBuffer();
}

export async function fetchModels(token: string): Promise<{ current: string; models: string[] }> {
  const res = await fetch("/api/models", { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) return { current: "", models: [] };
  return res.json();
}
