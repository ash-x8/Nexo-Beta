export type Role = "user" | "assistant";
export type Lang = "en" | "si";
export type ReplyLang = "auto" | Lang;
export type ResponseStyle = "balanced" | "concise" | "detailed";
export type Theme = "dark" | "light" | "system";
export type MessageStatus = "complete" | "streaming" | "stopped" | "error";

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
  status?: MessageStatus;
  attachments?: { name: string; mime: string; size?: number }[];
  sources?: Source[];
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

export interface PublicConfig {
  configured: boolean;
  authConfigured: boolean;
  provider: string;
  model: string;
  searchEnabled: boolean;
  ttsServer: boolean;
  perMinute: number;
  dailyLimit: number;
  dailyTtsLimit: number;
  maxInputChars: number;
  maxHistoryMessages: number;
  maxAttachmentMb: number;
  version: string;
}

export interface UsageInfo {
  requests: number;
  tts: number;
  day: string;
  dailyLimit?: number;
  dailyTtsLimit?: number;
  remainingRequests?: number;
  remainingTts?: number;
}

export type StreamEvent =
  | { t: string }
  | { sources: Source[] }
  | { done: true }
  | { error: { code: string; message: string } };
