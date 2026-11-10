export type Role = "user" | "assistant";
export type Lang = "en" | "si";

export interface Attachment {
  name: string;
  mime: string;
  /** base64 payload for images / PDFs */
  data?: string;
  /** plain text for text-like files */
  text?: string;
}

export interface Source { title: string; url: string }

export interface ChatMessage {
  id: string;
  role: Role;
  content: string;
  createdAt: number;
  attachments?: { name: string; mime: string }[];
  sources?: Source[];
  error?: string;
}

export interface Conversation {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
}

export interface MemoryItem { id: string; text: string; createdAt: number }

export interface PublicConfig {
  provider: string;
  model: string;
  searchEnabled: boolean;
  ttsServer: boolean;
  perMinute: number;
  dailyLimit: number;
  dailyTtsLimit: number;
  maxInputChars: number;
  maxAttachmentMb: number;
}

export type StreamEvent =
  | { t: string }
  | { sources: Source[] }
  | { error: { code: string; message: string } };
