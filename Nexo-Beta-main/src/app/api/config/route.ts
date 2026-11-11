import { env, activeModel, providerConfigured } from "@/server/env";
import type { PublicConfig } from "@/lib/types";

export const dynamic = "force-dynamic";

/** Public, secret-free capabilities so the UI only shows features that work. */
export async function GET() {
  const body: PublicConfig & { configured: boolean } = {
    configured: providerConfigured(),
    provider: env.provider,
    model: activeModel(),
    searchEnabled: !!env.tavilyKey,
    ttsServer: !!env.geminiKey,
    perMinute: env.perMinute,
    dailyLimit: env.dailyLimit,
    dailyTtsLimit: env.dailyTtsLimit,
    maxInputChars: env.maxInputChars,
    maxAttachmentMb: env.maxAttachmentMb
  };
  return Response.json(body);
}
