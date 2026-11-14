import { listSecurityEvents } from "@/server/adminAudit";
import {
  authConfigured,
  encryptionKeyConfigured,
  getRuntimeSecretOverlayKeys,
  missingConfigKeys,
  readEnv,
  vercelConfigured
} from "@/server/env";
import { ApiError, getOwnerAllowlist, hasAdminCredentials, requireAdmin } from "@/server/firebaseAdmin";
import { getRuntimeConfig } from "@/server/runtimeConfig";
import { loadRuntimeSecretsIntoOverlay } from "@/server/runtimeSecrets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    await requireAdmin(req);
    const runtimeCfg = await getRuntimeConfig();
    await loadRuntimeSecretsIntoOverlay(false, runtimeCfg.globalConfig.secretResolutionMode || "runtime_first");
    const events = await listSecurityEvents(50);
    const e = readEnv();
    const vercel = vercelConfigured();

    return Response.json({
      posture: {
        adminCredentialsReady: hasAdminCredentials(),
        firebaseAuthConfigured: authConfigured(),
        appCheckConfigured: !!(process.env.NEXT_PUBLIC_FIREBASE_APP_CHECK_SITE_KEY || "").trim(),
        encryptionMasterKeyConfigured: encryptionKeyConfigured(),
        runtimeSecretOverlayCount: getRuntimeSecretOverlayKeys().length,
        vercelIntegrationConfigured: vercel.configured,
        ownerAllowlistCount: getOwnerAllowlist().size,
        freeOnlyMode: runtimeCfg.globalConfig.freeOnlyMode,
        rateLimitPerMinute: runtimeCfg.globalConfig.rateLimitPerMinute,
        dailyRequestLimit: runtimeCfg.globalConfig.dailyRequestLimit,
        maxInputChars: runtimeCfg.globalConfig.maxInputChars,
        maxAttachmentMb: runtimeCfg.globalConfig.maxAttachmentMb,
        cspEnabled: true,
        hstsEnabled: true,
        csrfOriginCheckEnabled: true,
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
