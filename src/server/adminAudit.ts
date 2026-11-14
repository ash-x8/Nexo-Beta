import { adminDb, hasAdminCredentials } from "./firebaseAdmin";
import type { AuditLogEntry, SecurityEventEntry } from "@/lib/types";

const SENSITIVE_KEY_PATTERN = /key|token|secret|password|authorization|cookie|private_?key|credential|bearer/i;

/** Recursively removes secrets, tokens, and private keys before saving audit payloads. */
export function sanitizeAuditValue(val: unknown, depth = 0): unknown {
  if (depth > 5) return "[TRUNCATED]";
  if (val === null || val === undefined) return val;
  if (typeof val === "string") {
    if (val.includes("-----BEGIN PRIVATE KEY-----")) return "[REDACTED_PEM_KEY]";
    return val.length > 500 ? `${val.slice(0, 500)}…` : val;
  }
  if (typeof val === "number" || typeof val === "boolean") return val;
  if (Array.isArray(val)) {
    return val.slice(0, 25).map((item) => sanitizeAuditValue(item, depth + 1));
  }
  if (typeof val === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(val as Record<string, unknown>).slice(0, 40)) {
      if (SENSITIVE_KEY_PATTERN.test(k)) {
        out[k] = "[REDACTED]";
      } else {
        out[k] = sanitizeAuditValue(v, depth + 1);
      }
    }
    return out;
  }
  return String(val);
}

export async function recordAuditLog(entry: {
  actorUid: string;
  action: string;
  target: string;
  result: "success" | "denied" | "error";
  previousValue?: unknown;
  newValue?: unknown;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  if (!hasAdminCredentials()) return;
  try {
    await adminDb()
      .collection("admin/auditLogs/entries")
      .add({
        actorUid: entry.actorUid,
        action: entry.action,
        target: entry.target,
        result: entry.result,
        ...(entry.previousValue !== undefined ? { previousValue: sanitizeAuditValue(entry.previousValue) } : {}),
        ...(entry.newValue !== undefined ? { newValue: sanitizeAuditValue(entry.newValue) } : {}),
        ...(entry.metadata ? { metadata: sanitizeAuditValue(entry.metadata) } : {}),
        createdAt: Date.now()
      });
  } catch (err) {
    console.warn("[auditLog] write failed:", (err as Error).message);
  }
}

export async function recordSecurityEvent(entry: {
  type: SecurityEventEntry["type"];
  uid?: string;
  path?: string;
  severity: SecurityEventEntry["severity"];
  reason: string;
}): Promise<void> {
  if (!hasAdminCredentials()) return;
  try {
    await adminDb()
      .collection("admin/securityEvents/entries")
      .add({
        type: entry.type,
        ...(entry.uid ? { uid: entry.uid } : {}),
        ...(entry.path ? { path: entry.path } : {}),
        severity: entry.severity,
        reason: entry.reason.slice(0, 300),
        createdAt: Date.now()
      });
  } catch {
    /* never fail caller on security event log */
  }
}

export async function listAuditLogs(limitCount = 60, actionFilter?: string): Promise<AuditLogEntry[]> {
  if (!hasAdminCredentials()) return [];
  const snap = await adminDb()
    .collection("admin/auditLogs/entries")
    .orderBy("createdAt", "desc")
    .limit(Math.min(Math.max(1, limitCount), 150))
    .get();

  let entries = snap.docs.map((d) => ({
    id: d.id,
    ...(d.data() as Omit<AuditLogEntry, "id">)
  }));

  if (actionFilter && actionFilter.trim()) {
    const q = actionFilter.trim().toLowerCase();
    entries = entries.filter(
      (e) => e.action.toLowerCase().includes(q) || e.target.toLowerCase().includes(q)
    );
  }
  return entries;
}

export async function listSecurityEvents(limitCount = 50): Promise<SecurityEventEntry[]> {
  if (!hasAdminCredentials()) return [];
  const snap = await adminDb()
    .collection("admin/securityEvents/entries")
    .orderBy("createdAt", "desc")
    .limit(Math.min(Math.max(1, limitCount), 100))
    .get();

  return snap.docs.map((d) => ({
    id: d.id,
    ...(d.data() as Omit<SecurityEventEntry, "id">)
  }));
}
