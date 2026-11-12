import { activeModel, authConfigured, providerConfigured, readEnv } from "@/server/env";
import type { PublicConfig } from "@/lib/types";

export const dynamic = "force-dynamic";

/** Public, secret-free server capabilities so the UI only enables features that actually work. */
export async function GET() {
  const e = readEnv();
  const body: PublicConfig = {
    configured: providerConfigured(),
    authConfigured: authConfigured(),
    provider: e.provider,
    model: activeModel(),
    searchEnabled: !!e.tavilyKey,
    ttsServer: !!e.geminiKey,
    perMinute: e.perMinute,
    dailyLimit: e.dailyLimit,
    dailyTtsLimit: e.dailyTtsLimit,
    maxInputChars: e.maxInputChars,
    maxHistoryMessages: e.maxHistory,
    maxAttachmentMb: e.maxAttachmentMb,
    version: "2.1.0"
  };
  return Response.json(body);
}
