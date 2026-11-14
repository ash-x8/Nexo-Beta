import { recordAuditLog } from "@/server/adminAudit";
import { getUserDetailAnalytics } from "@/server/analytics";
import { adminAuth, adminDb, ApiError, getOwnerAllowlist, hasAdminCredentials, requireAdmin } from "@/server/firebaseAdmin";
import { UserAdminPatchSchema } from "@/lib/schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: { uid: string } }) {
  try {
    await requireAdmin(req);
    const url = new URL(req.url);
    const days = Math.min(Math.max(Number(url.searchParams.get("days") || 30), 1), 90);
    const detail = await getUserDetailAnalytics(params.uid, days);
    if (!detail.user) {
      throw new ApiError(404, "not_found", "User account not found.");
    }
    return Response.json(detail);
  } catch (e) {
    const err = e instanceof ApiError ? e : new ApiError(500, "server_error", "Could not load user analytics.");
    return Response.json({ error: { code: err.code, message: err.message } }, { status: err.status });
  }
}

export async function PATCH(req: Request, { params }: { params: { uid: string } }) {
  try {
    const admin = await requireAdmin(req);
    if (!hasAdminCredentials()) {
      throw new ApiError(503, "server_config", "Firebase Admin credentials are required to modify user access.");
    }
    const targetUid = params.uid;
    if (!targetUid) throw new ApiError(400, "bad_request", "Missing user ID.");

    // Strict self-protection: Owner cannot suspend, disable, or demote their own active admin access
    if (targetUid === admin.uid) {
      throw new ApiError(400, "self_protection", "You cannot suspend, disable, or restrict your own Owner account.");
    }

    const parsed = UserAdminPatchSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      throw new ApiError(400, "bad_request", "Invalid user update payload.");
    }

    const auth = adminAuth();
    const db = adminDb();
    const ownerEmails = getOwnerAllowlist();

    let targetEmail = "";
    try {
      const targetUser = await auth.getUser(targetUid);
      targetEmail = (targetUser.email || "").toLowerCase();
      if (targetUser.emailVerified && ownerEmails.has(targetEmail)) {
        throw new ApiError(400, "owner_protected", "Cannot suspend or disable the designated Owner account.");
      }
    } catch (err) {
      if (err instanceof ApiError) throw err;
    }

    const userRef = db.doc(`users/${targetUid}`);
    const existingSnap = await userRef.get();
    const prevData = existingSnap.exists ? existingSnap.data() : {};

    const updateDocData: Record<string, unknown> = { updatedAt: Date.now() };
    if (parsed.data.status !== undefined) {
      updateDocData.status = parsed.data.status;
      if (parsed.data.status === "active") {
        updateDocData.suspendedReason = "";
      }
      // Sync Firebase Auth disabled flag cleanly when disabled/active
      await auth.updateUser(targetUid, { disabled: parsed.data.status === "disabled" }).catch(() => {});
    }
    if (parsed.data.suspendedReason !== undefined) {
      updateDocData.suspendedReason = parsed.data.suspendedReason;
    }
    if (parsed.data.featureOverrides !== undefined) {
      const nextOverrides: Record<string, boolean> = { ...((prevData?.featureOverrides as Record<string, boolean>) || {}) };
      for (const [k, v] of Object.entries(parsed.data.featureOverrides)) {
        if (v === null) delete nextOverrides[k];
        else if (typeof v === "boolean") nextOverrides[k] = v;
      }
      updateDocData.featureOverrides = nextOverrides;
    }

    await userRef.set(updateDocData, { merge: true });
    await recordAuditLog({
      actorUid: admin.uid,
      action: "update_user_access",
      target: `users/${targetUid}`,
      result: "success",
      previousValue: { status: prevData?.status, featureOverrides: prevData?.featureOverrides },
      newValue: updateDocData
    });

    return Response.json({ ok: true, uid: targetUid, ...updateDocData });
  } catch (e) {
    const err = e instanceof ApiError ? e : new ApiError(500, "server_error", "Could not update user account.");
    if (!(e instanceof ApiError)) console.error("[admin/users/uid PATCH]", e);
    return Response.json({ error: { code: err.code, message: err.message } }, { status: err.status });
  }
}
