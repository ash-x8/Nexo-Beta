import { z } from "zod";
import { RuntimeSecretCreateSchema, RuntimeSecretPatchSchema } from "@/lib/schemas";
import { recordAuditLog } from "@/server/adminAudit";
import { encryptionKeyConfigured, vercelConfigured } from "@/server/env";
import { ApiError, requireAdmin, requireSensitiveAdmin } from "@/server/firebaseAdmin";
import { checkRate } from "@/server/limits";
import {
  deleteRuntimeSecret,
  getDecryptedSecretForServerSync,
  listRuntimeSecretsMetadata,
  markSecretVercelSyncResult,
  saveRuntimeSecret,
  updateRuntimeSecretStatus
} from "@/server/runtimeSecrets";
import { createVercelEnvVar, listVercelEnvInventory, updateVercelEnvVar } from "@/server/vercelManager";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function handleError(e: unknown) {
  const err = e instanceof ApiError ? e : new ApiError(500, "server_error", "Runtime secret operation failed.");
  if (!(e instanceof ApiError)) console.error("[admin/secrets]", e);
  return Response.json({ error: { code: err.code, message: err.message } }, { status: err.status });
}

export async function GET(req: Request) {
  try {
    const admin = await requireAdmin(req);
    checkRate(admin.uid, "secrets_read", Date.now(), 25);
    const items = await listRuntimeSecretsMetadata();
    return Response.json({
      encryptionConfigured: encryptionKeyConfigured(),
      vercelConfigured: vercelConfigured().configured,
      items
    });
  } catch (e) {
    return handleError(e);
  }
}

export async function POST(req: Request) {
  try {
    const admin = await requireSensitiveAdmin(req);
    checkRate(admin.uid, "secrets_write", Date.now(), 15);

    const rawLength = Number(req.headers.get("content-length") || 0);
    if (rawLength > 64 * 1024) {
      throw new ApiError(413, "too_large", "Secret payload exceeds maximum allowed size.");
    }

    const parsed = RuntimeSecretCreateSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      throw new ApiError(400, "bad_request", parsed.error.issues[0]?.message || "Invalid runtime secret payload.");
    }

    const saved = await saveRuntimeSecret({
      ...parsed.data,
      actorUid: admin.uid
    });

    await recordAuditLog({
      actorUid: admin.uid,
      action: parsed.data.id ? "runtime_secret_update" : "runtime_secret_create",
      target: saved.envKey,
      result: "success",
      newValue: {
        id: saved.id,
        name: saved.name,
        provider: saved.provider,
        envKey: saved.envKey,
        environment: saved.environment,
        active: saved.active,
        fingerprint: saved.fingerprint
      }
    });

    return Response.json({ ok: true, item: saved });
  } catch (e) {
    return handleError(e);
  }
}

export async function PATCH(req: Request) {
  try {
    const admin = await requireSensitiveAdmin(req);
    checkRate(admin.uid, "secrets_write", Date.now(), 15);

    const parsed = RuntimeSecretPatchSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      throw new ApiError(400, "bad_request", parsed.error.issues[0]?.message || "Invalid secret update request.");
    }

    if (parsed.data.action === "sync_to_vercel") {
      if (!vercelConfigured().configured) {
        throw new ApiError(503, "vercel_unconfigured", "Configure VERCEL_TOKEN and VERCEL_PROJECT_ID to push secrets to Vercel.");
      }
      const { envKey, plaintext, meta } = await getDecryptedSecretForServerSync(parsed.data.id);
      const targets =
        parsed.data.vercelTargets && parsed.data.vercelTargets.length > 0
          ? parsed.data.vercelTargets
          : meta.environment === "all"
            ? (["production", "preview"] as Array<"production" | "preview">)
            : ([meta.environment] as Array<"production" | "preview" | "development">);

      try {
        const inventory = await listVercelEnvInventory();
        const existingVar = inventory.envs.find((e) => e.key === envKey);
        if (existingVar?.id) {
          await updateVercelEnvVar({
            id: existingVar.id,
            value: plaintext,
            type: "encrypted",
            target: targets,
            comment: `Synced from NEXO Runtime Secret Manager (${meta.name})`
          });
        } else {
          await createVercelEnvVar({
            key: envKey,
            value: plaintext,
            type: "encrypted",
            target: targets,
            comment: `Synced from NEXO Runtime Secret Manager (${meta.name})`
          });
        }
        await markSecretVercelSyncResult(meta.id, "synced");
        await recordAuditLog({
          actorUid: admin.uid,
          action: "runtime_secret_sync_to_vercel",
          target: envKey,
          result: "success",
          metadata: { secretId: meta.id, targets }
        });
        return Response.json({ ok: true, synced: true, envKey, targets, redeployRequired: true });
      } catch (syncErr) {
        await markSecretVercelSyncResult(meta.id, "sync_failed", (syncErr as Error).message);
        throw syncErr;
      }
    }

    if (typeof parsed.data.active !== "boolean") {
      throw new ApiError(400, "bad_request", "Specify active boolean status.");
    }

    const updated = await updateRuntimeSecretStatus(parsed.data.id, parsed.data.active, admin.uid);
    await recordAuditLog({
      actorUid: admin.uid,
      action: updated.active ? "runtime_secret_enable" : "runtime_secret_disable",
      target: updated.envKey,
      result: "success",
      newValue: { id: updated.id, active: updated.active }
    });
    return Response.json({ ok: true, item: updated });
  } catch (e) {
    return handleError(e);
  }
}

const DeleteSchema = z.object({ id: z.string().trim().min(1).max(80) });

export async function DELETE(req: Request) {
  try {
    const admin = await requireSensitiveAdmin(req);
    checkRate(admin.uid, "secrets_write", Date.now(), 15);

    const parsed = DeleteSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      throw new ApiError(400, "bad_request", "Secret ID is required.");
    }

    const removed = await deleteRuntimeSecret(parsed.data.id);
    await recordAuditLog({
      actorUid: admin.uid,
      action: "runtime_secret_delete",
      target: removed?.envKey || parsed.data.id,
      result: "success",
      metadata: { id: parsed.data.id, name: removed?.name }
    });

    return Response.json({ ok: true, id: parsed.data.id });
  } catch (e) {
    return handleError(e);
  }
}
