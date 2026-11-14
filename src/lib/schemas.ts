import { z } from "zod";

export const ALLOWED_ATTACHMENT_MIME = /^(image\/(png|jpe?g|webp|gif)|application\/pdf|text\/.*|application\/json)$/;

export const AttachmentSchema = z.object({
  name: z.string().min(1).max(200),
  mime: z.string().min(1).max(100),
  data: z.string().optional(),
  text: z.string().max(200000).optional(),
  size: z.number().int().nonnegative().optional()
});

export const ChatMessageInputSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().max(40000),
  attachments: z.array(AttachmentSchema).max(4).optional()
});

export const ChatBodySchema = z.object({
  messages: z.array(ChatMessageInputSchema).min(1).max(200),
  language: z.enum(["en", "si", "ta", "hi", "auto"]).default("auto"),
  responseStyle: z.enum(["balanced", "concise", "detailed"]).default("balanced"),
  responseTone: z.enum(["natural", "professional", "friendly", "technical"]).default("natural").optional(),
  nickname: z.string().max(60).optional(),
  customInstructions: z.string().max(1200).optional(),
  projectInstructions: z.string().max(1200).optional(),
  conversationSummary: z.string().max(4000).optional(),
  memory: z.array(z.string().max(300)).max(24).default([]),
  useSearch: z.boolean().default(false),
  voiceTriggered: z.boolean().optional(),
  requestId: z.string().max(120).optional(),
  model: z.string().max(100).regex(/^[\w.\-:\/]+$/).optional()
});

export const NexoImageBodySchema = z.object({
  prompt: z.string().trim().min(2).max(2000),
  aspectRatio: z.enum(["1:1", "4:5", "3:2", "16:9", "9:16"]).default("1:1"),
  stylePreset: z.enum(["auto", "photoreal", "editorial", "illustration", "concept", "minimal"]).default("auto"),
  sourceImage: z
    .object({
      mime: z.string().regex(/^image\/(png|jpe?g|webp)$/),
      data: z.string().min(10).max(12_000_000)
    })
    .optional(),
  requestId: z.string().max(120).optional()
});

export const NexoTranscribeBodySchema = z.object({
  audioBase64: z.string().min(16).max(16_000_000),
  mimeType: z.string().min(5).max(80),
  hintLanguage: z.enum(["auto", "en-US", "si-LK", "ta-IN", "hi-IN"]).default("auto")
});

export const NexoMemorySummarizeSchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().max(20000)
      })
    )
    .min(1)
    .max(60),
  previousSummary: z.string().max(4000).optional(),
  existingFacts: z.array(z.string().max(300)).max(24).optional()
});

export const TtsBodySchema = z.object({
  text: z.string().trim().min(1).max(1200),
  language: z.string().max(20).optional()
});

export const GlobalConfigUpdateSchema = z
  .object({
    appName: z.string().trim().min(1).max(60),
    brandingSubtitle: z.string().trim().max(140),
    defaultTheme: z.enum(["dark", "light", "system"]),
    defaultLanguage: z.enum(["en", "si"]),
    allowLanguageSwitch: z.boolean(),
    allowRegistration: z.boolean(),
    defaultProvider: z.enum(["gemini", "openai-compatible"]),
    defaultModel: z.string().trim().min(1).max(100).regex(/^[\w.\-:\/]+$/),
    freeOnlyMode: z.boolean(),
    aiTemperature: z.number().min(0).max(2),
    maxInputChars: z.number().int().min(100).max(50000),
    maxHistoryMessages: z.number().int().min(2).max(100),
    maxAttachmentMb: z.number().int().min(1).max(25),
    rateLimitPerMinute: z.number().int().min(1).max(120),
    dailyRequestLimit: z.number().int().min(1).max(10000),
    dailyTtsLimit: z.number().int().min(0).max(5000),
    secretResolutionMode: z.enum(["runtime_first", "env_first"])
  })
  .partial();

export const FeatureFlagsUpdateSchema = z
  .object({
    chat: z.boolean(),
    voiceInput: z.boolean(),
    tts: z.boolean(),
    jarvisMode: z.boolean(),
    attachments: z.boolean(),
    imageGeneration: z.boolean(),
    webSearch: z.boolean(),
    personalMemory: z.boolean(),
    conversationHistory: z.boolean()
  })
  .partial();

export const MaintenanceUpdateSchema = z
  .object({
    enabled: z.boolean(),
    title: z.string().trim().min(1).max(100),
    message: z.string().trim().min(1).max(600),
    expectedReturn: z.string().trim().max(100),
    allowOwnerBypass: z.boolean()
  })
  .partial();

export const ProviderEntrySchema = z.object({
  enabled: z.boolean(),
  displayName: z.string().trim().min(1).max(60),
  priority: z.number().int().min(1).max(10),
  defaultModel: z.string().trim().max(100),
  ttsModel: z.string().trim().max(100).optional(),
  ttsVoice: z.string().trim().max(60).optional(),
  imageModel: z.string().trim().max(100).optional(),
  timeoutMs: z.number().int().min(5000).max(120000).optional()
});

export const ProviderConfigUpdateSchema = z
  .object({
    providers: z
      .object({
        gemini: ProviderEntrySchema.partial(),
        "openai-compatible": ProviderEntrySchema.partial()
      })
      .partial(),
    fallbackOrder: z.array(z.string().trim().min(1).max(100)).max(20)
  })
  .partial();

export const ModelOverrideSchema = z.object({
  displayName: z.string().trim().min(1).max(80).optional(),
  enabled: z.boolean().optional(),
  freeEligible: z.boolean().optional(),
  limitNote: z.string().trim().max(240).optional(),
  sortOrder: z.number().int().min(0).max(999).optional()
});

export const ModelRegistryUpdateSchema = z.object({
  models: z.record(z.string().min(1).max(100), ModelOverrideSchema)
});

export const AnnouncementInputSchema = z.object({
  title: z.string().trim().min(1).max(120),
  message: z.string().trim().min(1).max(800),
  category: z.enum(["info", "update", "maintenance", "warning"]).default("info"),
  priority: z.enum(["normal", "high", "critical"]).default("normal"),
  published: z.boolean().default(true),
  expiresAt: z.number().int().positive().nullable().default(null)
});

export const UserAdminPatchSchema = z.object({
  status: z.enum(["active", "suspended", "disabled"]).optional(),
  suspendedReason: z.string().trim().max(300).optional(),
  featureOverrides: z
    .record(
      z.enum([
        "chat",
        "voiceInput",
        "tts",
        "jarvisMode",
        "attachments",
        "imageGeneration",
        "webSearch",
        "personalMemory",
        "conversationHistory"
      ]),
      z.boolean().nullable()
    )
    .optional()
});

export const VercelEnvCreateSchema = z.object({
  key: z
    .string()
    .trim()
    .min(1)
    .max(128)
    .regex(/^[A-Z0-9_]+$/, "Variable name must use uppercase letters, numbers, and underscores."),
  value: z.string().min(1).max(65536),
  type: z.enum(["plain", "encrypted", "sensitive"]).default("encrypted"),
  target: z.array(z.string().trim().min(1).max(80)).min(1).max(12),
  customEnvironmentIds: z.array(z.string().trim().min(1).max(80)).max(12).optional(),
  gitBranch: z.string().trim().max(120).optional(),
  comment: z.string().trim().max(300).optional()
});

export const VercelEnvUpdateSchema = z.object({
  id: z.string().trim().min(1).max(120),
  key: z.string().trim().min(1).max(128).optional(),
  value: z.string().min(1).max(65536).optional(),
  type: z.enum(["plain", "encrypted", "sensitive"]).optional(),
  target: z.array(z.string().trim().min(1).max(80)).min(1).max(12).optional(),
  customEnvironmentIds: z.array(z.string().trim().min(1).max(80)).max(12).optional(),
  gitBranch: z.string().trim().max(120).nullable().optional(),
  comment: z.string().trim().max(300).optional(),
  confirmProduction: z.boolean().optional()
});

export const VercelEnvDeleteSchema = z.object({
  id: z.string().trim().min(1).max(120),
  key: z.string().trim().min(1).max(128).optional(),
  isProduction: z.boolean().optional(),
  confirmProduction: z.boolean().optional()
});

export const RuntimeSecretCreateSchema = z.object({
  id: z.string().trim().max(80).optional(),
  name: z.string().trim().min(1).max(80),
  envKey: z
    .string()
    .trim()
    .max(128)
    .regex(/^[A-Za-z0-9_]*$/)
    .optional(),
  provider: z.enum(["gemini", "gemini_tts", "openai", "openrouter", "openai_compatible", "tavily", "custom"]),
  value: z.string().max(16384).optional(),
  description: z.string().trim().max(240).optional(),
  environment: z.enum(["all", "production", "preview", "development"]).default("all"),
  active: z.boolean().default(true)
});

export const RuntimeSecretPatchSchema = z.object({
  id: z.string().trim().min(1).max(80),
  active: z.boolean().optional(),
  action: z.enum(["toggle", "sync_to_vercel"]).optional(),
  vercelTargets: z.array(z.enum(["production", "preview", "development"])).optional()
});

export type ChatBodyInput = z.infer<typeof ChatBodySchema>;
export type NexoImageBodyInput = z.infer<typeof NexoImageBodySchema>;
export type NexoTranscribeBodyInput = z.infer<typeof NexoTranscribeBodySchema>;
export type TtsBodyInput = z.infer<typeof TtsBodySchema>;

