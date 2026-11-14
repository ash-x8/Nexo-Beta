import { listSecurityEvents } from "@/server/adminAudit";
import { authConfigured, missingConfigKeys, readEnv } from "@/server/env";
import { ApiError, hasAdminCredentials, requireAdmin } from "@/server/firebaseAdmin";
import { getRuntimeConfig } from "@/server/runtimeConfig";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    await requireAdmin(req);
    const [events, runtimeCfg] = await Promise.all([listSecurityEvents(50), getRuntimeConfig()]);
    const e = readEnv();

    return Response.json({
      posture: {
        adminCredentialsReady: hasAdminCredentials(),
        firebaseAuthConfigured: authConfigured(),
        appCheckConfigured: !!(process.env.NEXT_PUBLIC_FIREBASE_APP_CHECK_SITE_KEY || "").trim(),
        freeOnlyMode: runtimeCfg.globalConfig.freeOnlyMode,
        rateLimitPerMinute: runtimeCfg.globalConfig.rateLimitPerMinute,
        dailyRequestLimit: runtimeCfg.globalConfig.dailyRequestLimit,
        cspEnabled: true,
        hstsEnabled: true,
        serverSideKeysOnly: true,
        firestoreRulesHardened: true,
        geminiKeyConfigured: !!e.geminiKey,
        compatKeyConfigured: !!e.compatKey,
        tavilyKeyConfigured: !!e.tavilyKey,
        missingKeys: missingConfigKeys()
      },
      events
    });
  } catch (e) {
    const err = e instanceof ApiError ? e : new ApiError(500, "server_error", "Could not read security diagnostics.");
    return Response.json({ error: { code: err.code, message: err.message } }, { status: err.status });
  }
}
