import { listAuditLogs } from "@/server/adminAudit";
import { ApiError, requireAdmin } from "@/server/firebaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    await requireAdmin(req);
    const url = new URL(req.url);
    const limit = Number(url.searchParams.get("limit") || 60);
    const action = url.searchParams.get("action") || undefined;
    const logs = await listAuditLogs(limit, action);
    return Response.json({ logs });
  } catch (e) {
    const err = e instanceof ApiError ? e : new ApiError(500, "server_error", "Could not read audit logs.");
    return Response.json({ error: { code: err.code, message: err.message } }, { status: err.status });
  }
}
