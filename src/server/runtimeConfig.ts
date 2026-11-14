import type {
  AnnouncementItem,
  FeatureFlags,
  FeatureKey,
  GlobalConfig,
  MaintenanceConfig,
  ModelRegistryOverrides,
  ProviderConfig
} from "@/lib/types";
import { activeModel, readEnv } from "./env";
import { adminDb, hasAdminCredentials } from "./firebaseAdmin";
import { GEMINI_FREE_FALLBACK_ORDER } from "./modelsRegistry";

export interface RuntimeConfigSnapshot {
  persisted: boolean;
  globalConfig: GlobalConfig;
  featureFlags: FeatureFlags;
  maintenance: MaintenanceConfig;
  providerConfig: ProviderConfig;
  modelRegistry: ModelRegistryOverrides;
  announcements: AnnouncementItem[];
}

const CACHE_TTL_MS = 30_000;
let cachedSnapshot: { at: number; data: RuntimeConfigSnapshot } | null = null;

export function invalidateRuntimeConfigCache(): void {
  cachedSnapshot = null;
}

export function _resetRuntimeConfigCacheForTest(): void {
  cachedSnapshot = null;
}

export function buildDefaultSnapshot(): RuntimeConfigSnapshot {
  const e = readEnv();
  const provider = e.provider === "openai-compatible" ? "openai-compatible" : "gemini";
  const now = 0;

  return {
    persisted: false,
    globalConfig: {
      appName: "NEXO AI",
      brandingSubtitle: "Your Intelligent Digital Companion",
      defaultTheme: "dark",
      defaultLanguage: "en",
      allowLanguageSwitch: true,
      allowRegistration: true,
      defaultProvider: provider,
      defaultModel: activeModel() || "gemini-2.5-flash",
      freeOnlyMode: e.freeOnly,
      aiTemperature: 0.7,
      maxInputChars: e.maxInputChars,
      maxHistoryMessages: e.maxHistory,
      maxAttachmentMb: e.maxAttachmentMb,
      rateLimitPerMinute: e.perMinute,
      dailyRequestLimit: e.dailyLimit,
      dailyTtsLimit: e.dailyTtsLimit,
      secretResolutionMode: "runtime_first",
      version: 1,
      updatedAt: now,
      updatedBy: "system_env"
    },
    featureFlags: {
      chat: true,
      voiceInput: true,
      tts: !!e.geminiKey,
      jarvisMode: true,
      attachments: true,
      imageGeneration: !!(e.geminiKey || (e.compatBase && e.compatKey)),
      webSearch: !!e.tavilyKey,
      personalMemory: true,
      conversationHistory: true,
      version: 1,
      updatedAt: now
    },
    maintenance: {
      enabled: false,
      title: "Scheduled Maintenance",
      message: "NEXO AI is undergoing scheduled maintenance to improve reliability. Please check back shortly.",
      expectedReturn: "",
      allowOwnerBypass: true,
      updatedAt: now,
      updatedBy: "system_env"
    },
    providerConfig: {
      providers: {
        gemini: {
          enabled: true,
          displayName: "Google Gemini",
          priority: 1,
          defaultModel: e.geminiModel || "gemini-2.5-flash",
          ttsModel: e.geminiTtsModel || "gemini-2.5-flash-preview-tts",
          ttsVoice: e.geminiTtsVoice || "Kore",
          imageModel: e.geminiImageModel || "gemini-2.5-flash-image",
          timeoutMs: e.timeoutMs
        },
        "openai-compatible": {
          enabled: !!(e.compatBase && e.compatKey),
          displayName: "OpenAI-Compatible API",
          priority: 2,
          defaultModel: e.compatModel || "",
          imageModel: e.compatImageModel || "gpt-image-1",
          timeoutMs: e.timeoutMs
        }
      },
      fallbackOrder: [...GEMINI_FREE_FALLBACK_ORDER],
      updatedAt: now
    },
    modelRegistry: {
      models: {},
      updatedAt: now
    },
    announcements: []
  };
}

/** Strips HTML tags so announcement strings remain strictly plain text. */
export function sanitizePlainText(input: string, maxLen: number): string {
  return input
    .replace(/<[^>]*>/g, "")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .trim()
    .slice(0, maxLen);
}

export async function getRuntimeConfig(forceFresh = false): Promise<RuntimeConfigSnapshot> {
  const now = Date.now();
  if (!forceFresh && cachedSnapshot && now - cachedSnapshot.at < CACHE_TTL_MS) {
    return cachedSnapshot.data;
  }

  const defaults = buildDefaultSnapshot();
  if (!hasAdminCredentials()) {
    return defaults;
  }

  try {
    const db = adminDb();
    const [globalSnap, flagsSnap, maintSnap, provSnap, modelsSnap, annSnap] = await Promise.all([
      db.doc("system/globalConfig").get(),
      db.doc("system/featureFlags").get(),
      db.doc("system/maintenance").get(),
      db.doc("system/providerConfig").get(),
      db.doc("system/modelRegistry").get(),
      db.doc("system/announcements").get()
    ]);

    const anyPersisted =
      globalSnap.exists ||
      flagsSnap.exists ||
      maintSnap.exists ||
      provSnap.exists ||
      modelsSnap.exists ||
      annSnap.exists;

    const gData = globalSnap.exists ? (globalSnap.data() as Partial<GlobalConfig>) : {};
    const fData = flagsSnap.exists ? (flagsSnap.data() as Partial<FeatureFlags>) : {};
    const mData = maintSnap.exists ? (maintSnap.data() as Partial<MaintenanceConfig>) : {};
    const pData = provSnap.exists ? (provSnap.data() as Partial<ProviderConfig>) : {};
    const mrData = modelsSnap.exists ? (modelsSnap.data() as Partial<ModelRegistryOverrides>) : {};
    const aData = annSnap.exists ? (annSnap.data() as { items?: AnnouncementItem[] }) : {};

    const snapshot: RuntimeConfigSnapshot = {
      persisted: anyPersisted,
      globalConfig: {
        ...defaults.globalConfig,
        ...gData
      },
      featureFlags: {
        ...defaults.featureFlags,
        ...fData
      },
      maintenance: {
        ...defaults.maintenance,
        ...mData,
        allowOwnerBypass: true
      },
      providerConfig: {
        providers: {
          gemini: {
            ...defaults.providerConfig.providers.gemini,
            ...(pData.providers?.gemini || {})
          },
          "openai-compatible": {
            ...defaults.providerConfig.providers["openai-compatible"],
            ...(pData.providers?.["openai-compatible"] || {})
          }
        },
        fallbackOrder:
          Array.isArray(pData.fallbackOrder) && pData.fallbackOrder.length > 0
            ? pData.fallbackOrder
            : defaults.providerConfig.fallbackOrder,
        updatedAt: typeof pData.updatedAt === "number" ? pData.updatedAt : defaults.providerConfig.updatedAt
      },
      modelRegistry: {
        models: mrData.models && typeof mrData.models === "object" ? mrData.models : {},
        updatedAt: typeof mrData.updatedAt === "number" ? mrData.updatedAt : defaults.modelRegistry.updatedAt
      },
      announcements: Array.isArray(aData.items) ? aData.items : []
    };

    cachedSnapshot = { at: now, data: snapshot };
    return snapshot;
  } catch (err) {
    console.warn("[runtimeConfig] fallback to env defaults:", (err as Error).message);
    return defaults;
  }
}

export function getActivePublicAnnouncements(items: AnnouncementItem[], now = Date.now()) {
  const priorityWeight: Record<AnnouncementItem["priority"], number> = {
    critical: 3,
    high: 2,
    normal: 1
  };
  return items
    .filter((item) => item.published && (item.expiresAt === null || item.expiresAt > now))
    .sort((a, b) => priorityWeight[b.priority] - priorityWeight[a.priority] || b.updatedAt - a.updatedAt)
    .map((item) => ({
      id: item.id,
      title: item.title,
      message: item.message,
      category: item.category,
      priority: item.priority,
      expiresAt: item.expiresAt,
      updatedAt: item.updatedAt
    }));
}

/**
 * Resolves effective feature flags strictly enforcing precedence:
 * 1. Server hardware/key capabilities (e.g., web search requires TAVILY_API_KEY, server TTS requires GEMINI_API_KEY)
 * 2. Owner global feature flags
 * 3. Per-user overrides set by Owner (only within what global flags allow, or explicitly enabled by Owner)
 */
export function resolveEffectiveFeatures(
  globalFlags: FeatureFlags,
  userOverrides: Partial<Record<FeatureKey, boolean>> = {}
): Record<FeatureKey, boolean> {
  const e = readEnv();
  const keys: FeatureKey[] = [
    "chat",
    "voiceInput",
    "tts",
    "jarvisMode",
    "attachments",
    "imageGeneration",
    "webSearch",
    "personalMemory",
    "conversationHistory"
  ];
  const out = {} as Record<FeatureKey, boolean>;
  for (const k of keys) {
    let val = globalFlags[k];
    if (typeof userOverrides[k] === "boolean") {
      // Global disable cannot be overridden upward unless Owner explicitly grants feature;
      // for safety, per-user false always restricts, and per-user true only unlocks if capability exists
      val = globalFlags[k] ? userOverrides[k]! : false;
    }
    if (k === "webSearch" && !e.tavilyKey) val = false;
    if (k === "imageGeneration" && !e.geminiKey && !(e.compatBase && e.compatKey)) val = false;
    out[k] = Boolean(val);
  }
  return out;
}

export type VersionableConfigSection =
  | "globalConfig"
  | "featureFlags"
  | "maintenance"
  | "providerConfig"
  | "modelRegistry";

export async function recordConfigVersion(opts: {
  section: VersionableConfigSection;
  version: number;
  savedBy: string;
  data: Record<string, unknown>;
}): Promise<void> {
  if (!hasAdminCredentials()) return;
  try {
    await adminDb()
      .collection("system/configHistory/entries")
      .add({
        section: opts.section,
        version: opts.version,
        savedBy: opts.savedBy,
        savedAt: Date.now(),
        data: opts.data
      });
  } catch {
    /* best-effort config versioning */
  }
}

export async function listConfigVersions(section?: VersionableConfigSection, limitCount = 25) {
  if (!hasAdminCredentials()) return [];
  const snap = await adminDb()
    .collection("system/configHistory/entries")
    .orderBy("savedAt", "desc")
    .limit(Math.min(Math.max(1, limitCount), 50))
    .get();

  const items = snap.docs.map((d) => ({
    id: d.id,
    ...(d.data() as {
      section: VersionableConfigSection;
      version: number;
      savedAt: number;
      savedBy: string;
      data: Record<string, unknown>;
    })
  }));

  return section ? items.filter((i) => i.section === section) : items;
}

