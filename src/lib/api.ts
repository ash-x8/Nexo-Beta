import type {
  AdminUserSummary,
  AnnouncementItem,
  Attachment,
  AuditLogEntry,
  ConfigVersionEntry,
  ModelCatalogItem,
  ProviderHealthTelemetry,
  PublicConfig,
  ReplyLang,
  ResponseStyle,
  ResponseTone,
  RuntimeSecretMeta,
  SecurityEventEntry,
  SessionInfo,
  StreamEvent,
  UsageInfo,
  VercelEnvVarItem,
  VercelInventoryResponse,
  VoiceInputLang
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
  responseTone?: ResponseTone;
  nickname?: string;
  customInstructions?: string;
  projectInstructions?: string;
  conversationSummary?: string;
  memory: string[];
  useSearch: boolean;
  voiceTriggered?: boolean;
  requestId?: string;
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
    res = await fetch("/api/nexo/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${r.token}`
      },
      body: JSON.stringify({
        messages: r.messages,
        language: r.language,
        responseStyle: r.responseStyle ?? "balanced",
        responseTone: r.responseTone ?? "natural",
        nickname: r.nickname || undefined,
        customInstructions: r.customInstructions || undefined,
        projectInstructions: r.projectInstructions || undefined,
        conversationSummary: r.conversationSummary || undefined,
        memory: r.memory,
        useSearch: r.useSearch,
        voiceTriggered: r.voiceTriggered || undefined,
        requestId: r.requestId || undefined
      }),
      signal: r.signal
    });
  } catch (e) {
    if (r.signal.aborted) throw e;
    throw new ApiClientError("network", "You appear to be offline or NEXO is temporarily unreachable.", 0);
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

export interface ImageGeneratePayload {
  prompt: string;
  aspectRatio?: "1:1" | "4:5" | "3:2" | "16:9" | "9:16";
  style?: "natural" | "photorealistic" | "illustration" | "minimal" | "3d" | "editorial";
  referenceImageBase64?: string;
  referenceImageMime?: string;
}

export interface ImageGenerateResult {
  assistant: "NEXO v1";
  mimeType: string;
  dataUrl: string;
  aspectRatio: "1:1" | "4:5" | "3:2" | "16:9" | "9:16";
  revisedPrompt?: string;
}

export async function generateImage(
  token: string,
  payload: ImageGeneratePayload,
  signal?: AbortSignal
): Promise<ImageGenerateResult> {
  const res = await fetch("/api/nexo/image", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify(payload),
    signal
  });
  const j = await res.json().catch(() => null);
  if (!res.ok) {
    throw new ApiClientError(
      j?.error?.code || `http_${res.status}`,
      j?.error?.message || "Image generation failed.",
      res.status
    );
  }
  return j as ImageGenerateResult;
}

export interface TranscribeResult {
  assistant: "NEXO v1";
  text: string;
  detectedLanguage: "en" | "si" | "ta" | "hi" | "mixed" | "unknown";
  languageLabel: string;
}

export async function transcribeAudio(
  token: string,
  payload: { audioBase64: string; mimeType: string; hintLanguage?: VoiceInputLang },
  signal?: AbortSignal
): Promise<TranscribeResult> {
  const res = await fetch("/api/nexo/transcribe", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify(payload),
    signal
  });
  const j = await res.json().catch(() => null);
  if (!res.ok) {
    throw new ApiClientError(
      j?.error?.code || `http_${res.status}`,
      j?.error?.message || "Voice transcription failed.",
      res.status
    );
  }
  return j as TranscribeResult;
}

export async function fetchTts(token: string, text: string, signal: AbortSignal): Promise<ArrayBuffer> {
  const res = await fetch("/api/nexo/tts", {
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

export async function consolidateMemory(
  token: string,
  payload: {
    existingSummary?: string;
    existingMemories?: string[];
    messages: { role: "user" | "assistant"; content: string }[];
  }
): Promise<{ summary: string; extractedFacts: { text: string; category: string }[] }> {
  const res = await fetch("/api/nexo/memory", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify(payload)
  });
  if (!res.ok) {
    throw new ApiClientError(`http_${res.status}`, "Memory consolidation skipped.", res.status);
  }
  return res.json();
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
  getHealth: (token: string) =>
    adminFetch<{ checkedAt: number; tavilyConfigured: boolean; providers: ProviderHealthTelemetry[] }>(
      token,
      "/api/admin/health"
    ),
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
    }),
  getVercelEnv: (token: string) =>
    adminFetch<VercelInventoryResponse>(token, "/api/admin/vercel/env"),
  createVercelEnv: (
    token: string,
    body: {
      key: string;
      value: string;
      type: "plain" | "encrypted" | "sensitive";
      target: Array<"production" | "preview" | "development">;
      customEnvironmentIds?: string[];
      gitBranch?: string;
      comment?: string;
    }
  ) =>
    adminFetch<{ ok: boolean; item: VercelEnvVarItem }>(token, "/api/admin/vercel/env", {
      method: "POST",
      body: JSON.stringify(body)
    }),
  updateVercelEnv: (
    token: string,
    body: {
      id: string;
      key?: string;
      value?: string;
      type?: "plain" | "encrypted" | "sensitive";
      target?: Array<"production" | "preview" | "development">;
      customEnvironmentIds?: string[];
      gitBranch?: string | null;
      comment?: string;
      confirmProduction?: boolean;
    }
  ) =>
    adminFetch<{ ok: boolean; item: VercelEnvVarItem }>(token, "/api/admin/vercel/env", {
      method: "PATCH",
      body: JSON.stringify(body)
    }),
  deleteVercelEnv: (
    token: string,
    body: { id: string; key?: string; isProduction?: boolean; confirmProduction?: boolean }
  ) =>
    adminFetch<{ ok: boolean; id: string }>(token, "/api/admin/vercel/env", {
      method: "DELETE",
      body: JSON.stringify(body)
    }),
  triggerVercelRedeploy: (token: string, target: "production" | "preview") =>
    adminFetch<{ ok: boolean; deploymentId: string; url: string; state: string; target: string }>(
      token,
      "/api/admin/vercel/deploy",
      {
        method: "POST",
        body: JSON.stringify({ target, confirmDeploy: true })
      }
    ),
  getSecrets: (token: string) =>
    adminFetch<{ encryptionConfigured: boolean; vercelConfigured: boolean; items: RuntimeSecretMeta[] }>(
      token,
      "/api/admin/secrets"
    ),
  saveSecret: (
    token: string,
    body: {
      id?: string;
      name: string;
      envKey?: string;
      provider: RuntimeSecretMeta["provider"];
      value?: string;
      description?: string;
      environment: RuntimeSecretMeta["environment"];
      active: boolean;
    }
  ) =>
    adminFetch<{ ok: boolean; item: RuntimeSecretMeta }>(token, "/api/admin/secrets", {
      method: "POST",
      body: JSON.stringify(body)
    }),
  toggleSecret: (token: string, id: string, active: boolean) =>
    adminFetch<{ ok: boolean; item: RuntimeSecretMeta }>(token, "/api/admin/secrets", {
      method: "PATCH",
      body: JSON.stringify({ id, action: "toggle", active })
    }),
  syncSecretToVercel: (
    token: string,
    id: string,
    vercelTargets?: Array<"production" | "preview" | "development">
  ) =>
    adminFetch<{ ok: boolean; synced: boolean; envKey: string; targets: string[]; redeployRequired: boolean }>(
      token,
      "/api/admin/secrets",
      {
        method: "PATCH",
        body: JSON.stringify({ id, action: "sync_to_vercel", vercelTargets })
      }
    ),
  deleteSecret: (token: string, id: string) =>
    adminFetch<{ ok: boolean; id: string }>(token, "/api/admin/secrets", {
      method: "DELETE",
      body: JSON.stringify({ id })
    }),
  getConfigHistory: (token: string, section?: ConfigVersionEntry["section"]) => {
    const qs = section ? `?section=${encodeURIComponent(section)}` : "";
    return adminFetch<{ versions: ConfigVersionEntry[] }>(token, `/api/admin/config/history${qs}`);
  },
  rollbackConfig: (token: string, versionId: string) =>
    adminFetch<{ ok: boolean; section: string; version: number; data: Record<string, unknown> }>(
      token,
      "/api/admin/config/history",
      {
        method: "POST",
        body: JSON.stringify({ versionId })
      }
    )
};
