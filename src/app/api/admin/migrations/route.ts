import { z } from "zod";
import { recordAuditLog } from "@/server/adminAudit";
import { adminDb, ApiError, getOwnerAllowlist, hasAdminCredentials, requireAdmin } from "@/server/firebaseAdmin";
import { buildDefaultSnapshot, invalidateRuntimeConfigCache } from "@/server/runtimeConfig";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MigrationSchema = z.object({
  action: z.enum(["init_system_docs", "backfill_user_metadata"])
});

export async function POST(req: Request) {
  try {
    const admin = await requireAdmin(req);
    if (!hasAdminCredentials()) {
      throw new ApiError(503, "server_config", "Firebase Admin credentials are required to run migrations.");
    }
    const parsed = MigrationSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      throw new ApiError(400, "bad_request", "Specify a valid migration action.");
    }

    const db = adminDb();
    const now = Date.now();

    if (parsed.data.action === "init_system_docs") {
      const defaults = buildDefaultSnapshot();
      const created: string[] = [];
      const docEntries: Array<[string, Record<string, unknown>]> = [
        ["system/globalConfig", { ...defaults.globalConfig, updatedAt: now, updatedBy: admin.uid }],
        ["system/featureFlags", { ...defaults.featureFlags, updatedAt: now }],
        ["system/maintenance", { ...defaults.maintenance, updatedAt: now, updatedBy: admin.uid }],
        ["system/providerConfig", { ...defaults.providerConfig, updatedAt: now }],
        ["system/modelRegistry", { ...defaults.modelRegistry, updatedAt: now }],
        ["system/announcements", { items: [], updatedAt: now }]
      ];
      for (const [path, payload] of docEntries) {
        const ref = db.doc(path);
        const snap = await ref.get();
        if (!snap.exists) {
          await ref.set(payload);
          created.push(path);
        }
      }
      invalidateRuntimeConfigCache();
      await recordAuditLog({
        actorUid: admin.uid,
        action: "migration_init_system_docs",
        target: "system/*",
        result: "success",
        metadata: { createdCount: created.length, created }
      });
      return Response.json({
        ok: true,
        action: "init_system_docs",
        message: created.length
          ? `Initialized ${created.length} missing runtime configuration document(s).`
          : "All runtime configuration documents already exist; zero records overwritten.",
        created
      });
    }

    // Additive, non-destructive user metadata backfill (never alters conversations/messages/memories)
    const usersSnap = await db.collection("users").limit(200).get();
    const owners = getOwnerAllowlist();
    let updatedCount = 0;
    for (const doc of usersSnap.docs) {
      const d = doc.data() as Record<string, unknown>;
      const patch: Record<string, unknown> = {};
      const email = typeof d.email === "string" ? d.email.toLowerCase() : "";
      const isOwner = !!email && owners.has(email);
      if (d.status !== "active" && d.status !== "suspended" && d.status !== "disabled") {
        patch.status = "active";
      }
      if (d.role !== "SUPER_ADMIN" && d.role !== "USER") {
        patch.role = isOwner ? "SUPER_ADMIN" : "USER";
      }
      if (Object.keys(patch).length > 0) {
        patch.updatedAt = now;
        await doc.ref.set(patch, { merge: true });
        updatedCount++;
      }
    }

    await recordAuditLog({
      actorUid: admin.uid,
      action: "migration_backfill_user_metadata",
      target: "users/*",
      result: "success",
      metadata: { inspected: usersSnap.docs.length, updatedCount }
    });

    return Response.json({
      ok: true,
      action: "backfill_user_metadata",
      inspected: usersSnap.docs.length,
      updatedCount,
      message: `Inspected ${usersSnap.docs.length} user record(s); safely backfilled ${updatedCount} missing role/status field(s) without modifying user conversations or memories.`
    });
  } catch (e) {
    const err = e instanceof ApiError ? e : new ApiError(500, "server_error", "Migration failed.");
    if (!(e instanceof ApiError)) console.error("[admin/migrations]", e);
    return Response.json({ error: { code: err.code, message: err.message } }, { status: err.status });
  }
}
