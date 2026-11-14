import { z } from "zod";
import { recordAuditLog } from "@/server/adminAudit";
import { adminDb, ApiError, hasAdminCredentials, requireAdmin } from "@/server/firebaseAdmin";
import { getRuntimeConfig, invalidateRuntimeConfigCache, sanitizePlainText } from "@/server/runtimeConfig";
import { AnnouncementInputSchema } from "@/lib/schemas";
import type { AnnouncementItem } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PatchSchema = AnnouncementInputSchema.partial().extend({
  id: z.string().trim().min(1).max(80)
});

function adminError(e: unknown) {
  const err = e instanceof ApiError ? e : new ApiError(500, "server_error", "Announcement operation failed.");
  if (!(e instanceof ApiError)) console.error("[admin/announcements]", e);
  return Response.json({ error: { code: err.code, message: err.message } }, { status: err.status });
}

export async function GET(req: Request) {
  try {
    await requireAdmin(req);
    const runtimeCfg = await getRuntimeConfig(true);
    return Response.json({ items: runtimeCfg.announcements });
  } catch (e) {
    return adminError(e);
  }
}

export async function POST(req: Request) {
  try {
    const admin = await requireAdmin(req);
    if (!hasAdminCredentials()) {
      throw new ApiError(503, "server_config", "Firebase Admin credentials are required to save announcements.");
    }
    const parsed = AnnouncementInputSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      throw new ApiError(400, "bad_request", "Invalid announcement payload.");
    }
    const title = sanitizePlainText(parsed.data.title, 120);
    const message = sanitizePlainText(parsed.data.message, 800);
    if (!title || !message) {
      throw new ApiError(400, "bad_request", "Announcement title and message cannot be empty.");
    }

    const now = Date.now();
    const item: AnnouncementItem = {
      id: `ann_${now.toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
      title,
      message,
      category: parsed.data.category,
      priority: parsed.data.priority,
      published: parsed.data.published,
      expiresAt: parsed.data.expiresAt ?? null,
      createdAt: now,
      updatedAt: now,
      createdBy: admin.uid
    };

    const current = await getRuntimeConfig(true);
    const nextItems = [item, ...current.announcements].slice(0, 40);
    await adminDb().doc("system/announcements").set({ items: nextItems, updatedAt: now });
    invalidateRuntimeConfigCache();
    await recordAuditLog({
      actorUid: admin.uid,
      action: "create_announcement",
      target: item.id,
      result: "success",
      newValue: item
    });
    return Response.json({ ok: true, item, items: nextItems });
  } catch (e) {
    return adminError(e);
  }
}

export async function PATCH(req: Request) {
  try {
    const admin = await requireAdmin(req);
    if (!hasAdminCredentials()) {
      throw new ApiError(503, "server_config", "Firebase Admin credentials are required to update announcements.");
    }
    const parsed = PatchSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      throw new ApiError(400, "bad_request", "Invalid announcement update payload.");
    }

    const current = await getRuntimeConfig(true);
    const idx = current.announcements.findIndex((i) => i.id === parsed.data.id);
    if (idx < 0) throw new ApiError(404, "not_found", "Announcement not found.");

    const existing = current.announcements[idx];
    const now = Date.now();
    const updated: AnnouncementItem = {
      ...existing,
      ...(parsed.data.title !== undefined ? { title: sanitizePlainText(parsed.data.title, 120) || existing.title } : {}),
      ...(parsed.data.message !== undefined ? { message: sanitizePlainText(parsed.data.message, 800) || existing.message } : {}),
      ...(parsed.data.category !== undefined ? { category: parsed.data.category } : {}),
      ...(parsed.data.priority !== undefined ? { priority: parsed.data.priority } : {}),
      ...(parsed.data.published !== undefined ? { published: parsed.data.published } : {}),
      ...(parsed.data.expiresAt !== undefined ? { expiresAt: parsed.data.expiresAt } : {}),
      updatedAt: now
    };

    const nextItems = current.announcements.map((it) => (it.id === updated.id ? updated : it));
    await adminDb().doc("system/announcements").set({ items: nextItems, updatedAt: now });
    invalidateRuntimeConfigCache();
    await recordAuditLog({
      actorUid: admin.uid,
      action: "update_announcement",
      target: updated.id,
      result: "success",
      previousValue: existing,
      newValue: updated
    });
    return Response.json({ ok: true, item: updated, items: nextItems });
  } catch (e) {
    return adminError(e);
  }
}

export async function DELETE(req: Request) {
  try {
    const admin = await requireAdmin(req);
    if (!hasAdminCredentials()) {
      throw new ApiError(503, "server_config", "Firebase Admin credentials are required to delete announcements.");
    }
    const url = new URL(req.url);
    const id = url.searchParams.get("id") || "";
    if (!id) throw new ApiError(400, "bad_request", "Missing announcement id.");

    const current = await getRuntimeConfig(true);
    const target = current.announcements.find((i) => i.id === id);
    if (!target) throw new ApiError(404, "not_found", "Announcement not found.");

    const nextItems = current.announcements.filter((i) => i.id !== id);
    const now = Date.now();
    await adminDb().doc("system/announcements").set({ items: nextItems, updatedAt: now });
    invalidateRuntimeConfigCache();
    await recordAuditLog({
      actorUid: admin.uid,
      action: "delete_announcement",
      target: id,
      result: "success",
      previousValue: target
    });
    return Response.json({ ok: true, items: nextItems });
  } catch (e) {
    return adminError(e);
  }
}
