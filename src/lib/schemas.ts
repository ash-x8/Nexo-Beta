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
  language: z.enum(["en", "si", "auto"]).default("auto"),
  responseStyle: z.enum(["balanced", "concise", "detailed"]).default("balanced"),
  nickname: z.string().max(60).optional(),
  customInstructions: z.string().max(400).optional(),
  memory: z.array(z.string().max(300)).max(20).default([]),
  useSearch: z.boolean().default(false),
  voiceTriggered: z.boolean().optional(),
  model: z.string().max(100).regex(/^[\w.\-:\/]+$/).optional()
});

export const TtsBodySchema = z.object({
  text: z.string().trim().min(1).max(1200)
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
    dailyTtsLimit: z.number().int().min(0).max(5000)
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
  ttsVoice: z.string().trim().max(60).optional()
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

export type ChatBodyInput = z.infer<typeof ChatBodySchema>;
export type TtsBodyInput = z.infer<typeof TtsBodySchema>;
