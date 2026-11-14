import { z } from "zod";
import { recordAuditLog } from "@/server/adminAudit";
import { adminDb, ApiError, assertSameOrigin, hasAdminCredentials, requireAdmin } from "@/server/firebaseAdmin";
import { isFreeEligibleModel } from "@/server/modelsRegistry";
import {
  buildDefaultSnapshot,
  getRuntimeConfig,
  invalidateRuntimeConfigCache,
  recordConfigVersion
} from "@/server/runtimeConfig";
import { invalidateRuntimeSecretsCache, loadRuntimeSecretsIntoOverlay } from "@/server/runtimeSecrets";
import {
  FeatureFlagsUpdateSchema,
  GlobalConfigUpdateSchema,
  MaintenanceUpdateSchema,
  ModelRegistryUpdateSchema,
  ProviderConfigUpdateSchema
} from "@/lib/schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SectionPatchSchema = z.discriminatedUnion("section", [
  z.object({ section: z.literal("globalConfig"), data: GlobalConfigUpdateSchema }),
  z.object({ section: z.literal("featureFlags"), data: FeatureFlagsUpdateSchema }),
  z.object({ section: z.literal("maintenance"), data: MaintenanceUpdateSchema }),
  z.object({ section: z.literal("providerConfig"), data: ProviderConfigUpdateSchema }),
  z.object({ section: z.literal("modelRegistry"), data: ModelRegistryUpdateSchema })
]);

const ResetSchema = z.object({
  section: z.enum(["globalConfig", "featureFlags", "maintenance", "providerConfig", "modelRegistry"])
});

function adminError(e: unknown) {
  const err = e instanceof ApiError ? e : new ApiError(500, "server_error", "Configuration operation failed.");
  if (!(e instanceof ApiError)) console.error("[admin/config]", e);
  return Response.json({ error: { code: err.code, message: err.message } }, { status: err.status });
}

export async function GET(req: Request) {
  try {
    await requireAdmin(req);
    const snapshot = await getRuntimeConfig(true);
    return Response.json(snapshot);
  } catch (e) {
    return adminError(e);
  }
}

export async function PUT(req: Request) {
  try {
    assertSameOrigin(req);
    const admin = await requireAdmin(req);
    if (!hasAdminCredentials()) {
      throw new ApiError(503, "server_config", "Firebase Admin credentials are required to persist runtime settings.");
    }

    const parsed = SectionPatchSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      throw new ApiError(400, "bad_request", parsed.error.issues[0]?.message || "Invalid configuration payload.");
    }

    const current = await getRuntimeConfig(true);
    const db = adminDb();
    const now = Date.now();
    const { section, data } = parsed.data;

    if (section === "globalConfig") {
      const next = {
        ...current.globalConfig,
        ...data,
        version: (current.globalConfig.version || 1) + 1,
        updatedAt: now,
        updatedBy: admin.uid
      };
      if (next.freeOnlyMode && !isFreeEligibleModel(next.defaultModel, next.defaultProvider, next.defaultModel)) {
        throw new ApiError(
          400,
          "paid_model_blocked",
          `Cannot set default model "${next.defaultModel}" while Free-Only mode is enabled.`
        );
      }
      await db.doc("system/globalConfig").set(next, { merge: true });
      await recordConfigVersion({
        section: "globalConfig",
        version: next.version,
        savedBy: admin.uid,
        data: next as unknown as Record<string, unknown>
      });
      invalidateRuntimeConfigCache();
      invalidateRuntimeSecretsCache();
      await loadRuntimeSecretsIntoOverlay(true, next.secretResolutionMode || "runtime_first");
      await recordAuditLog({
        actorUid: admin.uid,
        action: "update_global_config",
        target: "system/globalConfig",
        result: "success",
        previousValue: current.globalConfig,
        newValue: next
      });
      return Response.json({ ok: true, section, data: next });
    }

    if (section === "featureFlags") {
      const next = {
        ...current.featureFlags,
        ...data,
        version: (current.featureFlags.version || 1) + 1,
        updatedAt: now
      };
      await db.doc("system/featureFlags").set(next, { merge: true });
      invalidateRuntimeConfigCache();
      await recordAuditLog({
        actorUid: admin.uid,
        action: "update_feature_flags",
        target: "system/featureFlags",
        result: "success",
        previousValue: current.featureFlags,
        newValue: next
      });
      return Response.json({ ok: true, section, data: next });
    }

    if (section === "maintenance") {
      const next = {
        ...current.maintenance,
        ...data,
        allowOwnerBypass: true,
        updatedAt: now,
        updatedBy: admin.uid
      };
      await db.doc("system/maintenance").set(next, { merge: true });
      invalidateRuntimeConfigCache();
      await recordAuditLog({
        actorUid: admin.uid,
        action: next.enabled ? "enable_maintenance_mode" : "disable_maintenance_mode",
        target: "system/maintenance",
        result: "success",
        previousValue: current.maintenance,
        newValue: next
      });
      return Response.json({ ok: true, section, data: next });
    }

    if (section === "providerConfig") {
      const nextFallback = data.fallbackOrder ?? current.providerConfig.fallbackOrder;
      if (current.globalConfig.freeOnlyMode) {
        const paidModel = nextFallback.find((m) => !isFreeEligibleModel(m, "gemini", current.globalConfig.defaultModel));
        if (paidModel) {
          throw new ApiError(
            400,
            "paid_model_blocked",
            `Fallback model "${paidModel}" is not verified free-tier eligible under Free-Only mode.`
          );
        }
      }
      const next = {
        providers: {
          gemini: {
            ...current.providerConfig.providers.gemini,
            ...(data.providers?.gemini || {})
          },
          "openai-compatible": {
            ...current.providerConfig.providers["openai-compatible"],
            ...(data.providers?.["openai-compatible"] || {})
          }
        },
        fallbackOrder: nextFallback,
        updatedAt: now
      };
      await db.doc("system/providerConfig").set(next, { merge: true });
      invalidateRuntimeConfigCache();
      await recordAuditLog({
        actorUid: admin.uid,
        action: "update_provider_config",
        target: "system/providerConfig",
        result: "success",
        previousValue: current.providerConfig,
        newValue: next
      });
      return Response.json({ ok: true, section, data: next });
    }

    // modelRegistry
    const mergedModels = {
      ...current.modelRegistry.models,
      ...data.models
    };
    const nextRegistry = {
      models: mergedModels,
      updatedAt: now
    };
    await db.doc("system/modelRegistry").set(nextRegistry);
    invalidateRuntimeConfigCache();
    await recordAuditLog({
      actorUid: admin.uid,
      action: "update_model_registry",
      target: "system/modelRegistry",
      result: "success",
      previousValue: current.modelRegistry,
      newValue: nextRegistry
    });
    return Response.json({ ok: true, section, data: nextRegistry });
  } catch (e) {
    return adminError(e);
  }
}

export async function POST(req: Request) {
  try {
    assertSameOrigin(req);
    const admin = await requireAdmin(req);
    if (!hasAdminCredentials()) {
      throw new ApiError(503, "server_config", "Firebase Admin credentials are required to reset runtime settings.");
    }
    const parsed = ResetSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      throw new ApiError(400, "bad_request", "Invalid section to reset.");
    }
    const defaults = buildDefaultSnapshot();
    const section = parsed.data.section;
    const payload = { ...defaults[section], updatedAt: Date.now() };
    await adminDb().doc(`system/${section}`).set(payload);
    await recordConfigVersion({
      section,
      version: 1,
      savedBy: admin.uid,
      data: payload as unknown as Record<string, unknown>
    });
    invalidateRuntimeConfigCache();
    await recordAuditLog({
      actorUid: admin.uid,
      action: `reset_${section}`,
      target: `system/${section}`,
      result: "success",
      newValue: payload
    });
    return Response.json({ ok: true, section, data: payload });
  } catch (e) {
    return adminError(e);
  }
}
