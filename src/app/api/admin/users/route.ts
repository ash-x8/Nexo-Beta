import { listUsersWithUsage } from "@/server/analytics";
import { ApiError, requireAdmin } from "@/server/firebaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    await requireAdmin(req);
    const url = new URL(req.url);
    const query = url.searchParams.get("q") || undefined;
    const status = url.searchParams.get("status") || undefined;
    const days = Number(url.searchParams.get("days") || 30);

    const users = await listUsersWithUsage({ query, status, days });
    return Response.json({ users, total: users.length });
  } catch (e) {
    const err = e instanceof ApiError ? e : new ApiError(500, "server_error", "Could not list users.");
    if (!(e instanceof ApiError)) console.error("[admin/users]", e);
    return Response.json({ error: { code: err.code, message: err.message } }, { status: err.status });
  }
}
