import { activeModel, authConfigured, configuredProviders, providerConfigured, readEnv } from "@/server/env";
import { DEVELOPER_INFO } from "@/server/developerProfile";
import { GEMINI_FREE_FALLBACK_ORDER } from "@/server/modelsRegistry";
import type { PublicConfig } from "@/lib/types";

export const dynamic = "force-dynamic";

/** Public, secret-free server capabilities so the UI only enables features that actually work. */
export async function GET() {
  const e = readEnv();
  const providers = configuredProviders();
  const fallbackReady = e.provider === "gemini" ? GEMINI_FREE_FALLBACK_ORDER.length > 1 : false;

  const body: PublicConfig = {
    configured: providerConfigured(),
    authConfigured: authConfigured(),
    provider: e.provider,
    model: activeModel(),
    freeOnly: e.freeOnly,
    configuredProviders: providers,
    fallbackReady,
    searchEnabled: !!e.tavilyKey,
    ttsServer: !!e.geminiKey,
    perMinute: e.perMinute,
    dailyLimit: e.dailyLimit,
    dailyTtsLimit: e.dailyTtsLimit,
    maxInputChars: e.maxInputChars,
    maxHistoryMessages: e.maxHistory,
    maxAttachmentMb: e.maxAttachmentMb,
    developer: DEVELOPER_INFO,
    version: "2.2.0"
  };
  return Response.json(body);
}
