function positiveInt(name: string, fallback: number): number {
  const v = Number(readRawKey(name));
  return Number.isFinite(v) && v > 0 ? Math.floor(v) : fallback;
}

export type SecretResolutionMode = "runtime_first" | "env_first";

let runtimeSecretOverlay: Record<string, string> = {};
let runtimeSecretResolutionMode: SecretResolutionMode = "runtime_first";

export function setRuntimeSecretOverlay(
  secretsMap: Record<string, string>,
  mode: SecretResolutionMode = "runtime_first"
): void {
  runtimeSecretOverlay = { ...secretsMap };
  runtimeSecretResolutionMode = mode;
}

export function clearRuntimeSecretOverlay(): void {
  runtimeSecretOverlay = {};
}

export function getRuntimeSecretOverlayKeys(): string[] {
  return Object.keys(runtimeSecretOverlay).filter((k) => Boolean(runtimeSecretOverlay[k]));
}

function readRawKey(name: string): string {
  const envVal = (process.env[name] || "").trim();
  const runtimeVal = (runtimeSecretOverlay[name] || "").trim();
  if (runtimeSecretResolutionMode === "env_first") {
    return envVal || runtimeVal;
  }
  return runtimeVal || envVal;
}

export function readEnv() {
  const rawCompatKey = readRawKey("OPENAI_COMPAT_API_KEY");
  const rawCompatBase = readRawKey("OPENAI_COMPAT_BASE_URL").replace(/\/+$/, "");
  const rawCompatModel = readRawKey("OPENAI_COMPAT_MODEL");

  const openRouterKey = readRawKey("OPENROUTER_API_KEY");
  const openAiKey = readRawKey("OPENAI_API_KEY");

  const compatKey = rawCompatKey || openRouterKey || openAiKey;
  const compatBase =
    rawCompatBase ||
    (openRouterKey && !rawCompatKey ? "https://openrouter.ai/api/v1" : openAiKey && !rawCompatKey ? "https://api.openai.com/v1" : "");

  return {
    provider: (readRawKey("AI_PROVIDER") || "gemini").toLowerCase(),
    freeOnly: (readRawKey("FREE_ONLY_MODE") || "true").toLowerCase() !== "false",
    geminiKey: readRawKey("GEMINI_API_KEY"),
    geminiTtsKey: readRawKey("GEMINI_TTS_API_KEY") || readRawKey("GEMINI_API_KEY"),
    geminiModel: readRawKey("GEMINI_MODEL") || "gemini-2.5-flash",
    geminiImageModel: readRawKey("GEMINI_IMAGE_MODEL") || "gemini-2.5-flash-image",
    geminiTranscribeModel: readRawKey("GEMINI_TRANSCRIBE_MODEL") || "gemini-2.5-flash",
    geminiTtsModel: readRawKey("GEMINI_TTS_MODEL") || "gemini-2.5-flash-preview-tts",
    geminiTtsVoice: readRawKey("GEMINI_TTS_VOICE") || "Kore",
    compatBase,
    compatKey,
    compatModel: rawCompatModel,
    compatImageModel: readRawKey("OPENAI_IMAGE_MODEL") || "gpt-image-1",
    tavilyKey: readRawKey("TAVILY_API_KEY"),
    perMinute: positiveInt("RATE_LIMIT_PER_MINUTE", 10),
    dailyLimit: positiveInt("DAILY_REQUEST_LIMIT", 100),
    dailyTtsLimit: positiveInt("DAILY_TTS_LIMIT", 40),
    maxInputChars: positiveInt("MAX_INPUT_CHARS", 8000),
    maxHistory: positiveInt("MAX_HISTORY_MESSAGES", 24),
    maxAttachmentMb: positiveInt("MAX_ATTACHMENT_MB", 4),
    timeoutMs: positiveInt("REQUEST_TIMEOUT_MS", 60000)
  };
}

export const env = readEnv();

export function activeModel(): string {
  const e = readEnv();
  return e.provider === "gemini" ? e.geminiModel : e.compatModel;
}

export function configuredProviders(): string[] {
  const e = readEnv();
  const list: string[] = [];
  if (e.geminiKey && e.geminiModel) list.push("gemini");
  if (e.compatBase && e.compatKey && e.compatModel) list.push("openai-compatible");
  return list;
}

export function providerConfigured(): boolean {
  const e = readEnv();
  if (e.provider === "gemini") return !!(e.geminiKey && e.geminiModel);
  if (e.provider === "openai-compatible") return !!(e.compatBase && e.compatKey && e.compatModel);
  return false;
}

export function authConfigured(): boolean {
  return !!(
    process.env.NEXT_PUBLIC_FIREBASE_API_KEY &&
    process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN &&
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID &&
    process.env.NEXT_PUBLIC_FIREBASE_APP_ID
  );
}

export function vercelConfigured(): { configured: boolean; hasToken: boolean; hasProjectId: boolean; hasTeamId: boolean } {
  const hasToken = !!(process.env.VERCEL_TOKEN || "").trim();
  const hasProjectId = !!(process.env.VERCEL_PROJECT_ID || "").trim();
  const hasTeamId = !!(process.env.VERCEL_TEAM_ID || "").trim();
  return {
    configured: hasToken && hasProjectId,
    hasToken,
    hasProjectId,
    hasTeamId
  };
}

export function encryptionKeyConfigured(): boolean {
  const raw = (process.env.NEXO_MASTER_SECRET_KEY || process.env.SECRET_ENCRYPTION_KEY || "").trim();
  return raw.length >= 16;
}

/** Returns names of missing required variables (never values) for diagnostics. */
export function missingConfigKeys(): string[] {
  const e = readEnv();
  const missing: string[] = [];
  if (e.provider === "gemini") {
    if (!e.geminiKey) missing.push("GEMINI_API_KEY");
  } else if (e.provider === "openai-compatible") {
    if (!e.compatBase) missing.push("OPENAI_COMPAT_BASE_URL");
    if (!e.compatKey) missing.push("OPENAI_COMPAT_API_KEY");
    if (!e.compatModel) missing.push("OPENAI_COMPAT_MODEL");
  } else {
    missing.push("AI_PROVIDER");
  }
  if (!(process.env.FIREBASE_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "").trim()) {
    missing.push("FIREBASE_PROJECT_ID");
  }
  if (!(process.env.FIREBASE_CLIENT_EMAIL || "").trim()) missing.push("FIREBASE_CLIENT_EMAIL");
  if (!(process.env.FIREBASE_PRIVATE_KEY || "").trim()) missing.push("FIREBASE_PRIVATE_KEY");
  if (!process.env.NEXT_PUBLIC_FIREBASE_API_KEY) missing.push("NEXT_PUBLIC_FIREBASE_API_KEY");
  if (!process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN) missing.push("NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN");
  if (!process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID) missing.push("NEXT_PUBLIC_FIREBASE_PROJECT_ID");
  if (!process.env.NEXT_PUBLIC_FIREBASE_APP_ID) missing.push("NEXT_PUBLIC_FIREBASE_APP_ID");
  return missing;
}
