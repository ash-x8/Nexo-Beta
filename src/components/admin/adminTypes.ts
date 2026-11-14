import type {
  AdminUserSummary,
  AnnouncementItem,
  AuditLogEntry,
  FeatureFlags,
  GlobalConfig,
  MaintenanceConfig,
  ModelCatalogItem,
  ModelRegistryOverrides,
  ProviderConfig,
  ProviderHealthTelemetry,
  SecurityEventEntry,
  UserRole
} from "@/lib/types";

export type AdminSectionId =
  | "overview"
  | "global"
  | "users"
  | "analytics"
  | "providers"
  | "models"
  | "security"
  | "maintenance"
  | "features"
  | "monitoring"
  | "announcements"
  | "audit"
  | "data"
  | "about";

export interface DailyMetricPoint {
  day: string;
  requests: number;
  tts: number;
  voiceRequests: number;
  imageRequests?: number;
  failedRequests: number;
  rateLimitHits: number;
  fallbackCount: number;
  estimatedInputTokens: number;
  estimatedOutputTokens: number;
}

export interface RuntimeConfigSnapshot {
  globalConfig: GlobalConfig & { version?: number; updatedAt?: number; updatedBy?: string };
  featureFlags: FeatureFlags & { version?: number; updatedAt?: number };
  maintenance: MaintenanceConfig & { updatedAt?: number; updatedBy?: string };
  providerConfig: ProviderConfig & { updatedAt?: number };
  modelRegistry: ModelRegistryOverrides;
  announcements: AnnouncementItem[];
}

export interface AdminOverviewResponse {
  admin: {
    uid: string;
    email: string | null;
    role: UserRole;
    isOwner: boolean;
  };
  runtime: RuntimeConfigSnapshot;
  system: {
    adminCredentialsReady: boolean;
    authConfigured: boolean;
    configuredProviders: string[];
    tavilyConfigured: boolean;
    missingKeys: string[];
    providerHealth: string;
    providerHealthDetails?: ProviderHealthTelemetry[];
    tokenAccuracyNote: string;
  };
  summary: {
    totalUsers: number;
    activeUsers: number;
    suspendedUsers: number;
    requestsWindow: number;
    ttsWindow: number;
    voiceWindow: number;
    imageRequestsWindow?: number;
    estimatedTokensWindow: number;
    failedRequestsWindow: number;
    rateLimitHitsWindow: number;
    fallbackCountWindow: number;
    securityAlertsRecent: number;
  };
  daily: DailyMetricPoint[];
  byProvider: Record<string, number>;
  byModel: Record<string, number>;
  byTask?: Record<string, number>;
  modelCatalog: ModelCatalogItem[];
  recentSecurityEvents: SecurityEventEntry[];
}

export interface SecurityPostureResponse {
  posture: {
    adminCredentialsReady: boolean;
    firebaseAuthConfigured: boolean;
    appCheckConfigured: boolean;
    freeOnlyMode: boolean;
    rateLimitPerMinute: number;
    dailyRequestLimit: number;
    cspEnabled: boolean;
    hstsEnabled: boolean;
    serverSideKeysOnly: boolean;
    firestoreRulesHardened: boolean;
    geminiKeyConfigured: boolean;
    compatKeyConfigured: boolean;
    tavilyKeyConfigured: boolean;
    missingKeys: string[];
  };
  events: SecurityEventEntry[];
}

export interface ConfirmPromptState {
  title: string;
  body: string;
  confirmLabel: string;
  danger?: boolean;
  onConfirm: () => Promise<void> | void;
}

export type AdminUserRow = AdminUserSummary;
export type AdminAuditRow = AuditLogEntry;
