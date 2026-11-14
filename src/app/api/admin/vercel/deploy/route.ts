import { z } from "zod";
import { recordAuditLog } from "@/server/adminAudit";
import { ApiError, requireSensitiveAdmin } from "@/server/firebaseAdmin";
import { checkRate } from "@/server/limits";
import { triggerVercelRedeploy } from "@/server/vercelManager";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DeploySchema = z.object({
  target: z.enum(["production", "preview"]).default("production"),
  confirmDeploy: z.literal(true)
});

export async function POST(req: Request) {
  try {
    const admin = await requireSensitiveAdmin(req);
    // Strict cooldown/rate limit to prevent accidental deployment loops
    checkRate(admin.uid, "vercel_deploy", Date.now(), 2);

    const parsed = DeploySchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      throw new ApiError(400, "bad_request", "Confirm deployment trigger before redeploying.");
    }

    const res = await triggerVercelRedeploy(parsed.data.target);

    await recordAuditLog({
      actorUid: admin.uid,
      action: "vercel_trigger_redeploy",
      target: `vercel:${parsed.data.target}`,
      result: "success",
      metadata: {
        deploymentId: res.deploymentId,
        state: res.state,
        url: res.url
      }
    });

    return Response.json(res);
  } catch (e) {
    const err = e instanceof ApiError ? e : new ApiError(500, "server_error", "Redeployment request failed.");
    if (!(e instanceof ApiError)) console.error("[admin/vercel/deploy]", e);
    return Response.json({ error: { code: err.code, message: err.message } }, { status: err.status });
  }
}
