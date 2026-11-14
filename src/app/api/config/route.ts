import { authConfigured, configuredProviders, readEnv } from "@/server/env";
import { DEVELOPER_INFO } from "@/server/developerProfile";
import { getActivePublicAnnouncements, getRuntimeConfig, resolveEffectiveFeatures } from "@/server/runtimeConfig";
import type { PublicConfig } from "@/lib/types";

export const dynamic = "force-dynamic";

/** Public, secret-free runtime configuration & capabilities. */
export async function GET() {
  const e = readEnv();
  const runtime = await getRuntimeConfig();
  const g = runtime.globalConfig;
  const pCfg = runtime.providerConfig;
  const envProviders = configuredProviders();

  const activeProviders = envProviders.filter((id) => {
    const entry = pCfg.providers[id as keyof typeof pCfg.providers];
    return entry ? entry.enabled : true;
  });

  const provider =
    g.defaultProvider && pCfg.providers[g.defaultProvider]?.enabled !== false ? g.defaultProvider : e.provider;
  const providerEntry = pCfg.providers[provider as keyof typeof pCfg.providers];
  const model =
    g.defaultModel ||
    providerEntry?.defaultModel ||
    (provider === "gemini" ? e.geminiModel : e.compatModel);

  const configured =
    provider === "gemini"
      ? !!(e.geminiKey && model && providerEntry?.enabled !== false)
      : !!(e.compatBase && e.compatKey && model && providerEntry?.enabled !== false);

  const fallbackReady = provider === "gemini" ? pCfg.fallbackOrder.length > 1 : false;
  const features = resolveEffectiveFeatures(runtime.featureFlags);

  const body: PublicConfig = {
    appName: g.appName,
    brandingSubtitle: g.brandingSubtitle,
    defaultTheme: g.defaultTheme,
    defaultLanguage: g.defaultLanguage,
    allowLanguageSwitch: g.allowLanguageSwitch,
    allowRegistration: g.allowRegistration,
    configured,
    authConfigured: authConfigured(),
    provider,
    model,
    freeOnly: g.freeOnlyMode,
    configuredProviders: activeProviders,
    fallbackReady,
    searchEnabled: !!e.tavilyKey && features.webSearch,
    ttsServer: !!e.geminiKey && features.tts,
    perMinute: g.rateLimitPerMinute,
    dailyLimit: g.dailyRequestLimit,
    dailyTtsLimit: g.dailyTtsLimit,
    maxInputChars: g.maxInputChars,
    maxHistoryMessages: g.maxHistoryMessages,
    maxAttachmentMb: g.maxAttachmentMb,
    features,
    maintenance: {
      enabled: runtime.maintenance.enabled,
      title: runtime.maintenance.title,
      message: runtime.maintenance.message,
      expectedReturn: runtime.maintenance.expectedReturn
    },
    announcements: getActivePublicAnnouncements(runtime.announcements),
    developer: DEVELOPER_INFO,
    version: "2.3.0"
  };
  return Response.json(body);
}
