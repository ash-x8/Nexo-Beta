import type { Attachment, ModelCatalogItem, PublicConfig, ReplyLang, ResponseStyle, StreamEvent, UsageInfo } from "./types";

export class ApiClientError extends Error {
  constructor(public code: string, message: string) {
    super(message);
  }
}

export interface ChatRequest {
  token: string;
  messages: { role: "user" | "assistant"; content: string; attachments?: Attachment[] }[];
  language: ReplyLang;
  responseStyle?: ResponseStyle;
  nickname?: string;
  customInstructions?: string;
  memory: string[];
  useSearch: boolean;
  model?: string;
  signal: AbortSignal;
}

export function parseNdjsonLine(raw: string): StreamEvent | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed) as StreamEvent;
  } catch {
    return null;
  }
}

export async function* streamChat(r: ChatRequest): AsyncGenerator<StreamEvent> {
  let res: Response;
  try {
    res = await fetch("/api/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${r.token}`
      },
      body: JSON.stringify({
        messages: r.messages,
        language: r.language,
        responseStyle: r.responseStyle ?? "balanced",
        nickname: r.nickname || undefined,
        customInstructions: r.customInstructions || undefined,
        memory: r.memory,
        useSearch: r.useSearch,
        model: r.model || undefined
      }),
      signal: r.signal
    });
  } catch (e) {
    if (r.signal.aborted) throw e;
    throw new ApiClientError("network", "You appear to be offline or the server is unreachable.");
  }

  if (!res.ok || !res.body) {
    const j = await res.json().catch(() => null);
    throw new ApiClientError(
      j?.error?.code || `http_${res.status}`,
      j?.error?.message || `Request failed (${res.status}).`
    );
  }

  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let i: number;
      while ((i = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, i);
        buf = buf.slice(i + 1);
        const ev = parseNdjsonLine(line);
        if (ev) yield ev;
      }
    }
    buf += dec.decode();
    for (const line of buf.split("\n")) {
      const ev = parseNdjsonLine(line);
      if (ev) yield ev;
    }
  } finally {
    reader.releaseLock();
  }
}

export async function fetchTts(token: string, text: string, signal: AbortSignal): Promise<ArrayBuffer> {
  const res = await fetch("/api/tts", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({ text }),
    signal
  });
  if (!res.ok) {
    const j = await res.json().catch(() => null);
    throw new ApiClientError(j?.error?.code || "tts", j?.error?.message || "Voice generation failed.");
  }
  return res.arrayBuffer();
}

export interface ModelsResponse {
  current: string;
  provider?: string;
  freeOnly?: boolean;
  providerHealth?: string;
  models: string[];
  catalog: ModelCatalogItem[];
}

export async function fetchModels(token: string): Promise<ModelsResponse> {
  const res = await fetch("/api/models", { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) return { current: "", models: [], catalog: [] };
  const data = (await res.json()) as Partial<ModelsResponse>;
  return {
    current: data.current || "",
    provider: data.provider,
    freeOnly: data.freeOnly,
    providerHealth: data.providerHealth,
    models: Array.isArray(data.models) ? data.models : [],
    catalog: Array.isArray(data.catalog) ? data.catalog : []
  };
}

export async function fetchUsage(token: string): Promise<UsageInfo> {
  const res = await fetch("/api/usage", { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) {
    const j = await res.json().catch(() => null);
    throw new ApiClientError(j?.error?.code || `http_${res.status}`, j?.error?.message || "Could not load usage.");
  }
  return res.json();
}

export async function fetchConfig(): Promise<PublicConfig> {
  const res = await fetch("/api/config", { cache: "no-store" });
  if (!res.ok) throw new ApiClientError(`http_${res.status}`, "Could not load server configuration.");
  return res.json();
}
