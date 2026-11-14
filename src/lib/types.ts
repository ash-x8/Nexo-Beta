export type Role = "user" | "assistant";
export type Lang = "en" | "si";
export type ReplyLang = "auto" | Lang | "ta" | "hi";
export type VoiceInputLang = "auto" | "en-US" | "si-LK" | "ta-IN" | "hi-IN";
export type ResponseStyle = "balanced" | "concise" | "detailed";
export type ResponseTone = "natural" | "professional" | "friendly" | "technical";
export type AccentPreset = "teal" | "sky" | "emerald" | "indigo" | "amber";
export type FontSizePref = "sm" | "md" | "lg";
export type ChatDensity = "compact" | "comfortable" | "spacious";
export type Theme = "dark" | "light" | "system";
export type MessageStatus = "complete" | "streaming" | "stopped" | "error";
export type ModelStatus = "available" | "rate_limited" | "unavailable";

export type NexoTaskType =
  | "general"
  | "reasoning"
  | "coding"
  | "writing"
  | "translation"
  | "summarization"
  | "math"
  | "imageGen"
  | "imageUnderstanding"
  | "audioProcessing"
  | "voiceConversation"
  | "webSearch";

export type ProviderHealthState = "healthy" | "degraded" | "rate_limited" | "unavailable" | "unknown";

export type UserRole = "SUPER_ADMIN" | "USER";
export type AccountStatus = "active" | "suspended" | "disabled";

export type FeatureKey =
  | "chat"
  | "voiceInput"
  | "tts"
  | "jarvisMode"
  | "attachments"
  | "imageGeneration"
  | "webSearch"
  | "personalMemory"
  | "conversationHistory";

export type FeatureFlags = Record<FeatureKey, boolean> & {
  version: number;
  updatedAt: number;
};

export interface GlobalConfig {
  appName: string;
  brandingSubtitle: string;
  defaultTheme: Theme;
  defaultLanguage: Lang;
  allowLanguageSwitch: boolean;
  allowRegistration: boolean;
  defaultProvider: "gemini" | "openai-compatible";
  defaultModel: string;
  freeOnlyMode: boolean;
  aiTemperature: number;
  maxInputChars: number;
  maxHistoryMessages: number;
  maxAttachmentMb: number;
  rateLimitPerMinute: number;
  dailyRequestLimit: number;
  dailyTtsLimit: number;
  version: number;
  updatedAt: number;
  updatedBy: string;
}

export interface MaintenanceConfig {
  enabled: boolean;
  title: string;
  message: string;
  expectedReturn: string;
  allowOwnerBypass: boolean;
  updatedAt: number;
  updatedBy: string;
}

export interface ProviderConfigEntry {
  enabled: boolean;
  displayName: string;
  priority: number;
  defaultModel: string;
  ttsModel?: string;
  ttsVoice?: string;
  imageModel?: string;
  timeoutMs?: number;
}

export interface ProviderConfig {
  providers: {
    gemini: ProviderConfigEntry;
    "openai-compatible": ProviderConfigEntry;
  };
  fallbackOrder: string[];
  updatedAt: number;
}

export interface ModelOverride {
  displayName?: string;
  enabled?: boolean;
  freeEligible?: boolean;
  limitNote?: string;
  sortOrder?: number;
}

export interface ModelRegistryOverrides {
  models: Record<string, ModelOverride>;
  updatedAt: number;
}

export type AnnouncementCategory = "info" | "update" | "maintenance" | "warning";
export type AnnouncementPriority = "normal" | "high" | "critical";

export interface AnnouncementItem {
  id: string;
  title: string;
  message: string;
  category: AnnouncementCategory;
  priority: AnnouncementPriority;
  published: boolean;
  expiresAt: number | null;
  createdAt: number;
  updatedAt: number;
  createdBy: string;
}

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

export interface GeneratedImageArtifact {
  id: string;
  prompt: string;
  aspectRatio: "1:1" | "4:5" | "3:2" | "16:9" | "9:16";
  mimeType: string;
  dataUrl: string;
  createdAt: number;
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
  images?: GeneratedImageArtifact[];
  feedback?: "up" | "down" | null;
  capability?: NexoTaskType;
  assistantLabel?: "NEXO v1";
  /** Server-only / legacy field; never rendered in normal user UI */
  modelUsed?: string;
  /** Server-only / legacy field; never rendered in normal user UI */
  fallbackFrom?: string;
  error?: string;
  requestId?: string;
}

export interface Conversation {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  pinned?: boolean;
  projectId?: string | null;
  summary?: string;
  summaryUpdatedAt?: number;
}

export interface ProjectItem {
  id: string;
  name: string;
  description: string;
  instructions: string;
  color?: string;
  createdAt: number;
  updatedAt: number;
}

export interface LibraryItem {
  id: string;
  kind: "image" | "prompt" | "response" | "file";
  title: string;
  content?: string;
  dataUrl?: string;
  aspectRatio?: string;
  conversationId?: string;
  createdAt: number;
}

export interface MemoryItem {
  id: string;
  text: string;
  category?: "preference" | "profile" | "project" | "decision" | "general";
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
  enabled?: boolean;
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
  appName: string;
  assistantVersion?: string;
  brandingSubtitle: string;
  defaultTheme: Theme;
  defaultLanguage: Lang;
  allowLanguageSwitch: boolean;
  allowRegistration: boolean;
  configured: boolean;
  authConfigured: boolean;
  provider: string;
  model: string;
  freeOnly: boolean;
  configuredProviders: string[];
  fallbackReady: boolean;
  searchEnabled: boolean;
  imageEnabled?: boolean;
  ttsServer: boolean;
  transcribeServer?: boolean;
  perMinute: number;
  dailyLimit: number;
  dailyTtsLimit: number;
  maxInputChars: number;
  maxHistoryMessages: number;
  maxAttachmentMb: number;
  features: Record<FeatureKey, boolean>;
  maintenance: {
    enabled: boolean;
    title: string;
    message: string;
    expectedReturn: string;
  };
  announcements: Pick<AnnouncementItem, "id" | "title" | "message" | "category" | "priority" | "expiresAt" | "updatedAt">[];
  developer: DeveloperInfo;
  version: string;
}

export interface SessionInfo {
  uid: string;
  email: string | null;
  role: UserRole;
  isOwner: boolean;
  status: AccountStatus;
  suspendedReason?: string;
  featureOverrides: Partial<Record<FeatureKey, boolean>>;
  effectiveFeatures: Record<FeatureKey, boolean>;
}

export interface UsageInfo {
  requests: number;
  tts: number;
  voiceRequests?: number;
  imageRequests?: number;
  estimatedInputTokens?: number;
  estimatedOutputTokens?: number;
  rateLimitHits?: number;
  fallbackCount?: number;
  failedRequests?: number;
  day: string;
  dailyLimit?: number;
  dailyTtsLimit?: number;
  remainingRequests?: number;
  remainingTts?: number;
  providerHealth?: "healthy" | "degraded" | "unconfigured";
  quotaSource?: "account_firestore";
}

export interface ProviderHealthTelemetry {
  providerId: string;
  displayName: string;
  enabled: boolean;
  configured: boolean;
  status: ProviderHealthState;
  circuitState: "closed" | "open" | "half_open";
  lastSuccessAt: number | null;
  lastFailureAt: number | null;
  lastErrorCategory: string | null;
  avgLatencyMs: number | null;
  recentLatencyMs: number | null;
  avgTtftMs: number | null;
  rateLimitHits: number;
  fallbackTriggeredCount: number;
  totalCalls: number;
  successCalls: number;
  quotaStatus: "unknown" | "rate_limited" | "available";
  capabilities: string[];
}

export interface AdminUserSummary {
  uid: string;
  email: string;
  displayName: string;
  photoURL: string;
  role: UserRole;
  isOwner: boolean;
  status: AccountStatus;
  suspendedReason?: string;
  featureOverrides: Partial<Record<FeatureKey, boolean>>;
  createdAt: number | null;
  lastActiveAt: number | null;
  usage: {
    todayRequests: number;
    monthRequests: number;
    totalRequests: number;
    totalTts: number;
    totalVoiceRequests: number;
    estimatedInputTokens: number;
    estimatedOutputTokens: number;
    rateLimitHits: number;
    failedRequests: number;
    fallbackCount: number;
    byProvider: Record<string, number>;
    byModel: Record<string, number>;
  };
}

export interface AuditLogEntry {
  id: string;
  actorUid: string;
  action: string;
  target: string;
  result: "success" | "denied" | "error";
  previousValue?: unknown;
  newValue?: unknown;
  metadata?: Record<string, unknown>;
  createdAt: number;
}

export interface SecurityEventEntry {
  id: string;
  type: "forbidden_admin" | "rate_limit" | "auth_error" | "suspended_access" | "config_alert";
  uid?: string;
  path?: string;
  severity: "low" | "medium" | "high";
  reason: string;
  createdAt: number;
}

export type StreamEvent =
  | { t: string }
  | { sources: Source[] }
  | { nexo: { assistant: "NEXO v1"; capability: NexoTaskType; status: "routing" | "streaming" | "complete"; ttftMs?: number; durationMs?: number } }
  | { meta: { model: string; provider: string; freeEligible: boolean } }
  | { fallback: { from: string; to: string; reason: string } }
  | { done: true }
  | { error: { code: string; message: string } };

