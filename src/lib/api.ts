import type {
  AdminUserSummary,
  AnnouncementItem,
  Attachment,
  AuditLogEntry,
  ModelCatalogItem,
  PublicConfig,
  ReplyLang,
  ResponseStyle,
  SecurityEventEntry,
  SessionInfo,
  StreamEvent,
  UsageInfo
} from "./types";

export class ApiClientError extends Error {
  constructor(public code: string, message: string, public status = 500) {
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
  voiceTriggered?: boolean;
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
        voiceTriggered: r.voiceTriggered || undefined,
        model: r.model || undefined
      }),
      signal: r.signal
    });
  } catch (e) {
    if (r.signal.aborted) throw e;
    throw new ApiClientError("network", "You appear to be offline or the server is unreachable.", 0);
  }

  if (!res.ok || !res.body) {
    const j = await res.json().catch(() => null);
    throw new ApiClientError(
      j?.error?.code || `http_${res.status}`,
      j?.error?.message || `Request failed (${res.status}).`,
      res.status
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
    throw new ApiClientError(j?.error?.code || "tts", j?.error?.message || "Voice generation failed.", res.status);
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
    throw new ApiClientError(j?.error?.code || `http_${res.status}`, j?.error?.message || "Could not load usage.", res.status);
  }
  return res.json();
}

export async function fetchConfig(): Promise<PublicConfig> {
  const res = await fetch("/api/config", { cache: "no-store" });
  if (!res.ok) throw new ApiClientError(`http_${res.status}`, "Could not load server configuration.", res.status);
  return res.json();
}

export async function fetchSession(token: string): Promise<SessionInfo> {
  const res = await fetch("/api/session", {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store"
  });
  if (!res.ok) {
    const j = await res.json().catch(() => null);
    throw new ApiClientError(j?.error?.code || `http_${res.status}`, j?.error?.message || "Could not verify session.", res.status);
  }
  return res.json();
}

async function adminFetch<T>(token: string, path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(path, {
    ...init,
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(init.headers || {})
    }
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new ApiClientError(
      data?.error?.code || `http_${res.status}`,
      data?.error?.message || `Admin request failed (${res.status}).`,
      res.status
    );
  }
  return data as T;
}

export const adminApi = {
  getOverview: (token: string, days = 14) =>
    adminFetch<Record<string, unknown>>(token, `/api/admin/overview?days=${days}`),
  updateConfig: (token: string, section: string, data: unknown) =>
    adminFetch<{ ok: boolean; section: string; data: unknown }>(token, "/api/admin/config", {
      method: "PUT",
      body: JSON.stringify({ section, data })
    }),
  resetConfig: (token: string, section: string) =>
    adminFetch<{ ok: boolean; section: string; data: unknown }>(token, "/api/admin/config", {
      method: "POST",
      body: JSON.stringify({ section })
    }),
  getUsers: (token: string, query = "", status = "all", days = 30) => {
    const qs = new URLSearchParams({ days: String(days) });
    if (query.trim()) qs.set("q", query.trim());
    if (status && status !== "all") qs.set("status", status);
    return adminFetch<{ users: AdminUserSummary[]; total: number }>(token, `/api/admin/users?${qs.toString()}`);
  },
  getUserDetail: (token: string, uid: string, days = 30) =>
    adminFetch<{ user: AdminUserSummary; daily: Array<Record<string, unknown>> }>(
      token,
      `/api/admin/users/${encodeURIComponent(uid)}?days=${days}`
    ),
  patchUser: (token: string, uid: string, body: Record<string, unknown>) =>
    adminFetch<{ ok: boolean }>(token, `/api/admin/users/${encodeURIComponent(uid)}`, {
      method: "PATCH",
      body: JSON.stringify(body)
    }),
  revokeUserTokens: (token: string, uid: string) =>
    adminFetch<{ ok: boolean; revokedAt: number }>(token, `/api/admin/users/${encodeURIComponent(uid)}/revoke`, {
      method: "POST"
    }),
  testProvider: (token: string, provider: "gemini" | "openai-compatible") =>
    adminFetch<{ ok: boolean; provider: string; latencyMs: number; modelsFound: number; error?: string }>(
      token,
      "/api/admin/providers/test",
      {
        method: "POST",
        body: JSON.stringify({ provider })
      }
    ),
  getAnnouncements: (token: string) =>
    adminFetch<{ items: AnnouncementItem[] }>(token, "/api/admin/announcements"),
  createAnnouncement: (token: string, body: Record<string, unknown>) =>
    adminFetch<{ ok: boolean; item: AnnouncementItem; items: AnnouncementItem[] }>(token, "/api/admin/announcements", {
      method: "POST",
      body: JSON.stringify(body)
    }),
  updateAnnouncement: (token: string, body: Record<string, unknown>) =>
    adminFetch<{ ok: boolean; item: AnnouncementItem; items: AnnouncementItem[] }>(token, "/api/admin/announcements", {
      method: "PATCH",
      body: JSON.stringify(body)
    }),
  deleteAnnouncement: (token: string, id: string) =>
    adminFetch<{ ok: boolean; items: AnnouncementItem[] }>(
      token,
      `/api/admin/announcements?id=${encodeURIComponent(id)}`,
      { method: "DELETE" }
    ),
  getAuditLogs: (token: string, limit = 60, action = "") => {
    const qs = new URLSearchParams({ limit: String(limit) });
    if (action.trim()) qs.set("action", action.trim());
    return adminFetch<{ logs: AuditLogEntry[] }>(token, `/api/admin/audit-logs?${qs.toString()}`);
  },
  getSecurity: (token: string) =>
    adminFetch<{ posture: Record<string, unknown>; events: SecurityEventEntry[] }>(token, "/api/admin/security"),
  runMigration: (token: string, action: "init_system_docs" | "backfill_user_metadata") =>
    adminFetch<{ ok: boolean; message: string }>(token, "/api/admin/migrations", {
      method: "POST",
      body: JSON.stringify({ action })
    })
};
