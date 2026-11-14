import {
  VercelEnvCreateSchema,
  VercelEnvDeleteSchema,
  VercelEnvUpdateSchema
} from "@/lib/schemas";
import { recordAuditLog } from "@/server/adminAudit";
import { ApiError, requireAdmin, requireSensitiveAdmin } from "@/server/firebaseAdmin";
import { checkRate } from "@/server/limits";
import {
  createVercelEnvVar,
  deleteVercelEnvVar,
  listVercelEnvInventory,
  updateVercelEnvVar
} from "@/server/vercelManager";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function handleError(e: unknown) {
  const err = e instanceof ApiError ? e : new ApiError(500, "server_error", "Vercel environment operation failed.");
  if (!(e instanceof ApiError)) console.error("[admin/vercel/env]", e);
  return Response.json({ error: { code: err.code, message: err.message } }, { status: err.status });
}

export async function GET(req: Request) {
  try {
    const admin = await requireAdmin(req);
    checkRate(admin.uid, "vercel_read", Date.now(), 20);
    const inventory = await listVercelEnvInventory();
    return Response.json(inventory);
  } catch (e) {
    return handleError(e);
  }
}

export async function POST(req: Request) {
  try {
    const admin = await requireSensitiveAdmin(req);
    checkRate(admin.uid, "vercel_write", Date.now(), 15);

    const parsed = VercelEnvCreateSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      throw new ApiError(400, "bad_request", parsed.error.issues[0]?.message || "Invalid Vercel environment variable payload.");
    }

    const result = await createVercelEnvVar(parsed.data);

    // Strictly record non-secret metadata only in audit logs (NEVER log parsed.data.value)
    await recordAuditLog({
      actorUid: admin.uid,
      action: "vercel_env_create",
      target: result.key,
      result: "success",
      newValue: {
        id: result.id,
        key: result.key,
        type: result.type,
        target: result.target,
        gitBranch: parsed.data.gitBranch || null
      }
    });

    return Response.json({ ok: true, item: result });
  } catch (e) {
    return handleError(e);
  }
}

export async function PATCH(req: Request) {
  try {
    const admin = await requireSensitiveAdmin(req);
    checkRate(admin.uid, "vercel_write", Date.now(), 15);

    const parsed = VercelEnvUpdateSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      throw new ApiError(400, "bad_request", parsed.error.issues[0]?.message || "Invalid Vercel environment update payload.");
    }

    const touchesProduction = parsed.data.target?.includes("production");
    if (touchesProduction && parsed.data.value !== undefined && parsed.data.confirmProduction !== true) {
      throw new ApiError(
        400,
        "confirmation_required",
        "Explicit confirmation (confirmProduction) is required before overwriting a Production Vercel variable."
      );
    }

    const result = await updateVercelEnvVar(parsed.data);

    await recordAuditLog({
      actorUid: admin.uid,
      action: parsed.data.value !== undefined ? "vercel_env_replace_value" : "vercel_env_update",
      target: result.key || parsed.data.id,
      result: "success",
      newValue: {
        id: result.id,
        key: result.key,
        type: result.type,
        target: result.target,
        valueReplaced: parsed.data.value !== undefined
      }
    });

    return Response.json({ ok: true, item: result });
  } catch (e) {
    return handleError(e);
  }
}

export async function DELETE(req: Request) {
  try {
    const admin = await requireSensitiveAdmin(req);
    checkRate(admin.uid, "vercel_write", Date.now(), 15);

    const parsed = VercelEnvDeleteSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      throw new ApiError(400, "bad_request", "Valid environment variable ID is required for deletion.");
    }

    if (parsed.data.isProduction && parsed.data.confirmProduction !== true) {
      throw new ApiError(
        400,
        "confirmation_required",
        "Explicit confirmation (confirmProduction) is required before deleting a Production variable."
      );
    }

    const result = await deleteVercelEnvVar(parsed.data.id);

    await recordAuditLog({
      actorUid: admin.uid,
      action: "vercel_env_delete",
      target: parsed.data.key || parsed.data.id,
      result: "success",
      metadata: {
        id: result.id,
        isProduction: Boolean(parsed.data.isProduction)
      }
    });

    return Response.json({ ok: true, ...result });
  } catch (e) {
    return handleError(e);
  }
}
