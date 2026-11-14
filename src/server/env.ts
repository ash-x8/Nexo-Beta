function positiveInt(name: string, fallback: number): number {
  const v = Number(process.env[name]);
  return Number.isFinite(v) && v > 0 ? Math.floor(v) : fallback;
}

export function readEnv() {
  const rawCompatKey = (process.env.OPENAI_COMPAT_API_KEY || "").trim();
  const rawCompatBase = (process.env.OPENAI_COMPAT_BASE_URL || "").trim().replace(/\/+$/, "");
  const rawCompatModel = (process.env.OPENAI_COMPAT_MODEL || "").trim();

  const openRouterKey = (process.env.OPENROUTER_API_KEY || "").trim();
  const openAiKey = (process.env.OPENAI_API_KEY || "").trim();

  const compatKey = rawCompatKey || openRouterKey || openAiKey;
  const compatBase =
    rawCompatBase ||
    (openRouterKey && !rawCompatKey ? "https://openrouter.ai/api/v1" : openAiKey && !rawCompatKey ? "https://api.openai.com/v1" : "");

  return {
    provider: (process.env.AI_PROVIDER || "gemini").trim().toLowerCase(),
    freeOnly: (process.env.FREE_ONLY_MODE || "true").trim().toLowerCase() !== "false",
    geminiKey: (process.env.GEMINI_API_KEY || "").trim(),
    geminiModel: (process.env.GEMINI_MODEL || "gemini-2.5-flash").trim(),
    geminiTtsModel: (process.env.GEMINI_TTS_MODEL || "gemini-2.5-flash-preview-tts").trim(),
    geminiTtsVoice: (process.env.GEMINI_TTS_VOICE || "Kore").trim(),
    compatBase,
    compatKey,
    compatModel: rawCompatModel,
    tavilyKey: (process.env.TAVILY_API_KEY || "").trim(),
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
