function num(name: string, fallback: number): number {
  const v = Number(process.env[name]);
  return Number.isFinite(v) && v > 0 ? v : fallback;
}

export const env = {
  provider: (process.env.AI_PROVIDER || "gemini").toLowerCase(),
  geminiKey: process.env.GEMINI_API_KEY || "",
  geminiModel: process.env.GEMINI_MODEL || "gemini-2.5-flash",
  geminiTtsModel: process.env.GEMINI_TTS_MODEL || "gemini-2.5-flash-preview-tts",
  geminiTtsVoice: process.env.GEMINI_TTS_VOICE || "Kore",
  compatBase: (process.env.OPENAI_COMPAT_BASE_URL || "").replace(/\/+$/, ""),
  compatKey: process.env.OPENAI_COMPAT_API_KEY || "",
  compatModel: process.env.OPENAI_COMPAT_MODEL || "",
  tavilyKey: process.env.TAVILY_API_KEY || "",
  perMinute: num("RATE_LIMIT_PER_MINUTE", 10),
  dailyLimit: num("DAILY_REQUEST_LIMIT", 100),
  dailyTtsLimit: num("DAILY_TTS_LIMIT", 40),
  maxInputChars: num("MAX_INPUT_CHARS", 8000),
  maxHistory: num("MAX_HISTORY_MESSAGES", 24),
  maxAttachmentMb: num("MAX_ATTACHMENT_MB", 4),
  timeoutMs: num("REQUEST_TIMEOUT_MS", 60000)
};

export function activeModel(): string {
  return env.provider === "gemini" ? env.geminiModel : env.compatModel;
}

export function providerConfigured(): boolean {
  if (env.provider === "gemini") return !!env.geminiKey;
  return !!(env.compatBase && env.compatKey && env.compatModel);
}
