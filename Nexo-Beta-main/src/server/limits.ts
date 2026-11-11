import { FieldValue } from "firebase-admin/firestore";
import { adminDb, ApiError } from "./firebaseAdmin";
import { env } from "./env";

// Per-instance sliding window. On serverless this is best-effort per warm instance;
// the Firestore daily counter below is the authoritative limit.
const windows = new Map<string, number[]>();
const inflight = new Set<string>();

export function checkRate(uid: string, bucket: string) {
  const key = `${bucket}:${uid}`;
  const now = Date.now();
  const recent = (windows.get(key) || []).filter((t) => now - t < 60_000);
  if (recent.length >= env.perMinute) {
    const wait = Math.ceil((60_000 - (now - recent[0])) / 1000);
    throw new ApiError(429, "rate_limited", `Too many requests. Try again in ${wait}s.`);
  }
  recent.push(now);
  windows.set(key, recent);
}

/** Only one generation per user at a time: avoids duplicate/repeated paid calls. */
export function acquireInflight(uid: string): () => void {
  if (inflight.has(uid)) {
    throw new ApiError(409, "busy", "A response is already being generated. Stop it or wait for it to finish.");
  }
  inflight.add(uid);
  return () => inflight.delete(uid);
}

const today = () => new Date().toISOString().slice(0, 10);

export async function consumeDaily(uid: string, field: "requests" | "tts"): Promise<void> {
  const limit = field === "requests" ? env.dailyLimit : env.dailyTtsLimit;
  const ref = adminDb().doc(`users/${uid}/usage/${today()}`);
  await adminDb().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const used = (snap.data()?.[field] as number | undefined) ?? 0;
    if (used >= limit) {
      throw new ApiError(
        429,
        "quota_exceeded",
        `Daily ${field === "requests" ? "message" : "voice"} limit reached (${limit}). It resets at 00:00 UTC.`
      );
    }
    tx.set(ref, { [field]: FieldValue.increment(1), updatedAt: Date.now() }, { merge: true });
  });
}

export async function readUsage(uid: string) {
  const snap = await adminDb().doc(`users/${uid}/usage/${today()}`).get();
  const d = snap.data() || {};
  return { requests: d.requests ?? 0, tts: d.tts ?? 0, day: today() };
}
