import { readEnv } from "@/server/env";
import { ApiError, requireAdmin } from "@/server/firebaseAdmin";
import { getProviderTelemetrySnapshot } from "@/server/nexo/healthRegistry";
import { getRuntimeConfig } from "@/server/runtimeConfig";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    await requireAdmin(req);
    const runtimeCfg = await getRuntimeConfig(true);
    const e = readEnv();
    const pCfg = runtimeCfg.providerConfig.providers;

    const providers = [
      getProviderTelemetrySnapshot({
        providerId: "gemini",
        displayName: pCfg.gemini.displayName || "Gemini API",
        enabled: pCfg.gemini.enabled,
        configured: !!e.geminiKey,
        capabilities: ["chat", "streaming", "vision", "pdf", "imageGen", "audioTranscribe", "tts"]
      }),
      getProviderTelemetrySnapshot({
        providerId: "openai-compatible",
        displayName: pCfg["openai-compatible"].displayName || "OpenAI-Compatible API",
        enabled: pCfg["openai-compatible"].enabled,
        configured: !!(e.compatBase && e.compatKey),
        capabilities: ["chat", "streaming", "vision", "imageGen"]
      })
    ];

    return Response.json({
      checkedAt: Date.now(),
      tavilyConfigured: !!e.tavilyKey,
      providers
    });
  } catch (e) {
    const err = e instanceof ApiError ? e : new ApiError(500, "server_error", "Health check failed.");
    return Response.json({ error: { code: err.code, message: err.message } }, { status: err.status });
  }
}
