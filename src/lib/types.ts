export type Role = "user" | "assistant";
export type Lang = "en" | "si";
export type ReplyLang = "auto" | Lang;
export type ResponseStyle = "balanced" | "concise" | "detailed";
export type Theme = "dark" | "light" | "system";
export type MessageStatus = "complete" | "streaming" | "stopped" | "error";
export type ModelStatus = "available" | "rate_limited" | "unavailable";

export interface Attachment {
  name: string;
  mime: string;
  /** base64 payload for images / PDFs */
  data?: string;
  /** plain text for text-like / code files */
  text?: string;
  /** original file size in bytes, for display */
  size?: number;
}

export interface Source {
  title: string;
  url: string;
}

export interface ChatMessage {
  id: string;
  role: Role;
  content: string;
  createdAt: number;
  editedAt?: number;
  status?: MessageStatus;
  attachments?: { name: string; mime: string; size?: number }[];
  sources?: Source[];
  modelUsed?: string;
  fallbackFrom?: string;
  error?: string;
}

export interface Conversation {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
}

export interface MemoryItem {
  id: string;
  text: string;
  createdAt: number;
  enabled?: boolean;
}

export interface ModelCatalogItem {
  id: string;
  name: string;
  provider: string;
  freeEligible: boolean;
  status: ModelStatus;
  isDefault: boolean;
  capabilities: {
    streaming: boolean;
    vision: boolean;
    pdf: boolean;
    webSearch: boolean;
  };
  contextWindow: number | null;
  limitNote: string;
}

export interface DeveloperInfo {
  projectName: string;
  creatorName: string;
  fullName: string;
  role: string;
  website: string;
  copyright: string;
}

export interface PublicConfig {
  configured: boolean;
  authConfigured: boolean;
  provider: string;
  model: string;
  freeOnly: boolean;
  configuredProviders: string[];
  fallbackReady: boolean;
  searchEnabled: boolean;
  ttsServer: boolean;
  perMinute: number;
  dailyLimit: number;
  dailyTtsLimit: number;
  maxInputChars: number;
  maxHistoryMessages: number;
  maxAttachmentMb: number;
  developer: DeveloperInfo;
  version: string;
}

export interface UsageInfo {
  requests: number;
  tts: number;
  rateLimitHits?: number;
  fallbackCount?: number;
  day: string;
  dailyLimit?: number;
  dailyTtsLimit?: number;
  remainingRequests?: number;
  remainingTts?: number;
  providerHealth?: "healthy" | "degraded" | "unconfigured";
  quotaSource?: "account_firestore";
}

export type StreamEvent =
  | { t: string }
  | { sources: Source[] }
  | { meta: { model: string; provider: string; freeEligible: boolean } }
  | { fallback: { from: string; to: string; reason: string } }
  | { done: true }
  | { error: { code: string; message: string } };
