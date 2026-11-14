import { z } from "zod";
import { recordAuditLog } from "@/server/adminAudit";
import { adminDb, ApiError, assertSameOrigin, hasAdminCredentials, requireAdmin } from "@/server/firebaseAdmin";
import {
  getRuntimeConfig,
  invalidateRuntimeConfigCache,
  listConfigVersions,
  recordConfigVersion,
  type VersionableConfigSection
} from "@/server/runtimeConfig";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RollbackSchema = z.object({
  versionId: z.string().trim().min(1).max(120)
});

export async function GET(req: Request) {
  try {
    await requireAdmin(req);
    const url = new URL(req.url);
    const sectionParam = url.searchParams.get("section") as VersionableConfigSection | null;
    const allowed = new Set<VersionableConfigSection>([
      "globalConfig",
      "featureFlags",
      "maintenance",
      "providerConfig",
      "modelRegistry"
    ]);
    const section = sectionParam && allowed.has(sectionParam) ? sectionParam : undefined;
    const versions = await listConfigVersions(section, 25);
    return Response.json({ versions });
  } catch (e) {
    const err = e instanceof ApiError ? e : new ApiError(500, "server_error", "Could not read config version history.");
    return Response.json({ error: { code: err.code, message: err.message } }, { status: err.status });
  }
}

export async function POST(req: Request) {
  try {
    assertSameOrigin(req);
    const admin = await requireAdmin(req);
    if (!hasAdminCredentials()) {
      throw new ApiError(503, "server_config", "Firebase Admin credentials are required for rollback.");
    }

    const parsed = RollbackSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      throw new ApiError(400, "bad_request", "Valid versionId is required.");
    }

    const db = adminDb();
    const snap = await db.collection("system/configHistory/entries").doc(parsed.data.versionId).get();
    if (!snap.exists) {
      throw new ApiError(404, "not_found", "Configuration version snapshot not found.");
    }

    const entry = snap.data() as {
      section: VersionableConfigSection;
      version: number;
      data: Record<string, unknown>;
    };

    const current = await getRuntimeConfig(true);
    const prevSnapshot = current[entry.section];
    const nextVersion =
      entry.section === "globalConfig" || entry.section === "featureFlags"
        ? ((prevSnapshot as { version?: number }).version || 1) + 1
        : (entry.version || 1) + 1;

    const restoredData: Record<string, unknown> = {
      ...entry.data,
      version: nextVersion,
      updatedAt: Date.now(),
      updatedBy: admin.uid
    };

    await db.doc(`system/${entry.section}`).set(restoredData);
    await recordConfigVersion({
      section: entry.section,
      version: nextVersion,
      savedBy: admin.uid,
      data: restoredData
    });
    invalidateRuntimeConfigCache();

    await recordAuditLog({
      actorUid: admin.uid,
      action: `rollback_${entry.section}`,
      target: `system/${entry.section}`,
      result: "success",
      previousValue: prevSnapshot,
      newValue: restoredData,
      metadata: { restoredFromId: parsed.data.versionId, restoredVersion: entry.version }
    });

    return Response.json({ ok: true, section: entry.section, version: nextVersion, data: restoredData });
  } catch (e) {
    const err = e instanceof ApiError ? e : new ApiError(500, "server_error", "Rollback failed.");
    return Response.json({ error: { code: err.code, message: err.message } }, { status: err.status });
  }
}
