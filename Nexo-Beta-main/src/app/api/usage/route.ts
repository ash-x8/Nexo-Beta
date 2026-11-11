import { ApiError, requireUser } from "@/server/firebaseAdmin";
import { readUsage } from "@/server/limits";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const uid = await requireUser(req);
    return Response.json(await readUsage(uid));
  } catch (e) {
    const err = e instanceof ApiError ? e : new ApiError(500, "server_error", "Could not read usage.");
    return Response.json({ error: { code: err.code, message: err.message } }, { status: err.status });
  }
}
