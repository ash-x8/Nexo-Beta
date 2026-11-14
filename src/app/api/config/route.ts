import { authConfigured, configuredProviders, readEnv } from "@/server/env";
import { DEVELOPER_INFO } from "@/server/developerProfile";
import { getActivePublicAnnouncements, getRuntimeConfig, resolveEffectiveFeatures } from "@/server/runtimeConfig";
import { loadRuntimeSecretsIntoOverlay } from "@/server/runtimeSecrets";
import type { PublicConfig } from "@/lib/types";

export const dynamic = "force-dynamic";

/** Public, secret-free runtime configuration & capabilities. */
export async function GET() {
  const runtime = await getRuntimeConfig();
  await loadRuntimeSecretsIntoOverlay(false, runtime.globalConfig.secretResolutionMode || "runtime_first");
  const e = readEnv();
  const g = runtime.globalConfig;
  const pCfg = runtime.providerConfig;
  const envProviders = configuredProviders();

  const activeProviders = envProviders.filter((id) => {
    const entry = pCfg.providers[id as keyof typeof pCfg.providers];
    return entry ? entry.enabled : true;
  });

  const defaultProvider =
    g.defaultProvider && pCfg.providers[g.defaultProvider]?.enabled !== false ? g.defaultProvider : e.provider;
  const geminiReady = !!(e.geminiKey && pCfg.providers.gemini?.enabled !== false);
  const compatReady = !!(e.compatBase && e.compatKey && pCfg.providers["openai-compatible"]?.enabled !== false);
  const configured = defaultProvider === "gemini" ? geminiReady || compatReady : compatReady || geminiReady;

  const fallbackReady = pCfg.fallbackOrder.length > 1 || (geminiReady && compatReady);
  const features = resolveEffectiveFeatures(runtime.featureFlags);

  const body: PublicConfig = {
    appName: g.appName,
    assistantVersion: "NEXO v1",
    brandingSubtitle: g.brandingSubtitle,
    defaultTheme: g.defaultTheme,
    defaultLanguage: g.defaultLanguage,
    allowLanguageSwitch: g.allowLanguageSwitch,
    allowRegistration: g.allowRegistration,
    configured,
    authConfigured: authConfigured(),
    provider: configured ? "nexo-v1" : "",
    model: "NEXO v1",
    freeOnly: g.freeOnlyMode,
    configuredProviders: activeProviders,
    fallbackReady,
    searchEnabled: !!e.tavilyKey && features.webSearch,
    imageEnabled: features.imageGeneration,
    ttsServer: (!!e.geminiKey || compatReady) && features.tts,
    transcribeServer: (!!e.geminiKey || compatReady) && features.voiceInput,
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
    version: "1.0.0"
  };
  return Response.json(body);
}
