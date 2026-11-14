import { recordAuditLog } from "@/server/adminAudit";
import { adminAuth, ApiError, assertSameOrigin, hasAdminCredentials, requireAdmin } from "@/server/firebaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: { uid: string } }) {
  try {
    assertSameOrigin(req);
    const admin = await requireAdmin(req);
    if (!hasAdminCredentials()) {
      throw new ApiError(503, "server_config", "Firebase Admin credentials are required to revoke user tokens.");
    }
    const targetUid = params.uid;
    if (!targetUid) throw new ApiError(400, "bad_request", "Missing user ID.");
    if (targetUid === admin.uid) {
      throw new ApiError(400, "self_protection", "You cannot revoke tokens on your active Owner session here.");
    }

    await adminAuth().revokeRefreshTokens(targetUid);
    await recordAuditLog({
      actorUid: admin.uid,
      action: "revoke_user_sessions",
      target: `users/${targetUid}`,
      result: "success"
    });
    return Response.json({ ok: true, uid: targetUid, revokedAt: Date.now() });
  } catch (e) {
    const err = e instanceof ApiError ? e : new ApiError(500, "server_error", "Could not revoke user sessions.");
    if (!(e instanceof ApiError)) console.error("[admin/users/revoke]", e);
    return Response.json({ error: { code: err.code, message: err.message } }, { status: err.status });
  }
}
