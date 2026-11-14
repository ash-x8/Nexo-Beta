import type { AccountStatus, AdminUserSummary, FeatureKey, UserRole } from "@/lib/types";
import { adminAuth, adminDb, getOwnerAllowlist, hasAdminCredentials } from "./firebaseAdmin";
import { utcDay } from "./limits";

export interface DailyMetricPoint {
  day: string;
  requests: number;
  tts: number;
  voiceRequests: number;
  imageRequests?: number;
  estimatedInputTokens: number;
  estimatedOutputTokens: number;
  rateLimitHits: number;
  failedRequests: number;
  fallbackCount: number;
  providers: Record<string, number>;
  models: Record<string, number>;
  tasks?: Record<string, number>;
}

function lastNDaysKeys(days: number): string[] {
  const keys: string[] = [];
  const now = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 86_400_000);
    keys.push(utcDay(d));
  }
  return keys;
}

function accumulateMap(target: Record<string, number>, raw: unknown) {
  if (!raw || typeof raw !== "object") return;
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof v === "number" && Number.isFinite(v) && v > 0) {
      target[k] = (target[k] || 0) + v;
    }
  }
}

function normalizeOverrides(raw: unknown): Partial<Record<FeatureKey, boolean>> {
  if (!raw || typeof raw !== "object") return {};
  const allowed: FeatureKey[] = [
    "chat",
    "voiceInput",
    "tts",
    "jarvisMode",
    "attachments",
    "imageGeneration",
    "webSearch",
    "personalMemory",
    "conversationHistory"
  ];
  const out: Partial<Record<FeatureKey, boolean>> = {};
  const obj = raw as Record<string, unknown>;
  for (const k of allowed) {
    if (typeof obj[k] === "boolean") out[k] = obj[k];
  }
  return out;
}

/**
 * Lists users & individual usage analytics WITHOUT reading private conversations or messages.
 */
export async function listUsersWithUsage(opts: { query?: string; status?: string; days?: number } = {}): Promise<AdminUserSummary[]> {
  if (!hasAdminCredentials()) return [];

  const db = adminDb();
  const auth = adminAuth();
  const ownerEmails = getOwnerAllowlist();
  const todayKey = utcDay();
  const monthPrefix = todayKey.slice(0, 7);
  const days = Math.min(Math.max(opts.days ?? 30, 1), 90);
  const cutoffDay = lastNDaysKeys(days)[0];

  const [authRes, usersSnap] = await Promise.all([
    auth.listUsers(100).catch(() => ({ users: [] })),
    db.collection("users").limit(200).get().catch(() => ({ docs: [] }))
  ]);

  const userMap = new Map<string, AdminUserSummary>();

  const emptyUsage = () => ({
    todayRequests: 0,
    monthRequests: 0,
    totalRequests: 0,
    totalTts: 0,
    totalVoiceRequests: 0,
    estimatedInputTokens: 0,
    estimatedOutputTokens: 0,
    rateLimitHits: 0,
    failedRequests: 0,
    fallbackCount: 0,
    byProvider: {} as Record<string, number>,
    byModel: {} as Record<string, number>
  });

  for (const au of authRes.users) {
    const email = (au.email || "").toLowerCase();
    const isOwner = !!au.email && au.emailVerified && ownerEmails.has(email);
    const claimRole = (au.customClaims as Record<string, unknown> | undefined)?.role;
    const role: UserRole = isOwner || claimRole === "SUPER_ADMIN" ? "SUPER_ADMIN" : "USER";
    const status: AccountStatus = au.disabled ? "disabled" : "active";

    userMap.set(au.uid, {
      uid: au.uid,
      email: au.email || "",
      displayName: au.displayName || "",
      photoURL: au.photoURL || "",
      role,
      isOwner,
      status,
      featureOverrides: {},
      createdAt: au.metadata?.creationTime ? Date.parse(au.metadata.creationTime) : null,
      lastActiveAt: au.metadata?.lastSignInTime ? Date.parse(au.metadata.lastSignInTime) : null,
      usage: emptyUsage()
    });
  }

  for (const doc of usersSnap.docs) {
    const d = doc.data() as Record<string, unknown>;
    const existing = userMap.get(doc.id);
    const email = typeof d.email === "string" ? d.email : existing?.email || "";
    const isOwner = existing?.isOwner || (email ? ownerEmails.has(email.toLowerCase()) : false);
    const fsStatus: AccountStatus =
      d.status === "suspended" || d.status === "disabled" ? d.status : existing?.status || "active";

    userMap.set(doc.id, {
      uid: doc.id,
      email,
      displayName: typeof d.displayName === "string" && d.displayName ? d.displayName : existing?.displayName || "",
      photoURL: typeof d.photoURL === "string" && d.photoURL ? d.photoURL : existing?.photoURL || "",
      role: isOwner ? "SUPER_ADMIN" : existing?.role || "USER",
      isOwner,
      status: isOwner ? "active" : fsStatus,
      suspendedReason: typeof d.suspendedReason === "string" ? d.suspendedReason : undefined,
      featureOverrides: normalizeOverrides(d.featureOverrides),
      createdAt: typeof d.createdAt === "number" ? d.createdAt : existing?.createdAt || null,
      lastActiveAt:
        typeof d.lastActiveAt === "number"
          ? Math.max(d.lastActiveAt, existing?.lastActiveAt || 0)
          : typeof d.updatedAt === "number"
            ? Math.max(d.updatedAt, existing?.lastActiveAt || 0)
            : existing?.lastActiveAt || null,
      usage: existing?.usage || emptyUsage()
    });
  }

  // Filter early before reading subcollections to minimize Firestore reads
  let list = Array.from(userMap.values());
  if (opts.query && opts.query.trim()) {
    const q = opts.query.trim().toLowerCase();
    list = list.filter(
      (u) =>
        u.uid.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        u.displayName.toLowerCase().includes(q)
    );
  }
  if (opts.status && opts.status !== "all") {
    list = list.filter((u) => u.status === opts.status);
  }

  // Hydrate usage counters from users/{uid}/usage/{day} (never conversations/messages)
  await Promise.all(
    list.slice(0, 60).map(async (u) => {
      try {
        const usageSnap = await db.collection(`users/${u.uid}/usage`).orderBy("__name__", "desc").limit(days).get();
        for (const doc of usageSnap.docs) {
          const dayKey = doc.id;
          if (dayKey < cutoffDay) continue;
          const ud = doc.data() as Record<string, unknown>;
          const reqs = typeof ud.requests === "number" ? ud.requests : 0;
          const tts = typeof ud.tts === "number" ? ud.tts : 0;
          const voice = typeof ud.voiceRequests === "number" ? ud.voiceRequests : 0;
          const estIn = typeof ud.estimatedInputTokens === "number" ? ud.estimatedInputTokens : 0;
          const estOut = typeof ud.estimatedOutputTokens === "number" ? ud.estimatedOutputTokens : 0;
          const rate = typeof ud.rateLimitHits === "number" ? ud.rateLimitHits : 0;
          const fails = typeof ud.failedRequests === "number" ? ud.failedRequests : 0;
          const fb = typeof ud.fallbackCount === "number" ? ud.fallbackCount : 0;

          if (dayKey === todayKey) u.usage.todayRequests += reqs;
          if (dayKey.startsWith(monthPrefix)) u.usage.monthRequests += reqs;
          u.usage.totalRequests += reqs;
          u.usage.totalTts += tts;
          u.usage.totalVoiceRequests += voice;
          u.usage.estimatedInputTokens += estIn;
          u.usage.estimatedOutputTokens += estOut;
          u.usage.rateLimitHits += rate;
          u.usage.failedRequests += fails;
          u.usage.fallbackCount += fb;
          accumulateMap(u.usage.byProvider, ud.providers);
          accumulateMap(u.usage.byModel, ud.models);
        }
      } catch {
        /* ignore subcollection read errors for users without usage yet */
      }
    })
  );

  return list.sort((a, b) => (b.lastActiveAt || 0) - (a.lastActiveAt || 0));
}

export async function getUserDetailAnalytics(uid: string, days = 30) {
  const users = await listUsersWithUsage({ days });
  const summary = users.find((u) => u.uid === uid) || null;
  if (!hasAdminCredentials() || !summary) {
    return { user: summary, daily: [] as DailyMetricPoint[] };
  }

  const db = adminDb();
  const dayKeys = lastNDaysKeys(Math.min(Math.max(days, 1), 90));
  const dailyMap = new Map<string, DailyMetricPoint>();
  for (const k of dayKeys) {
    dailyMap.set(k, {
      day: k,
      requests: 0,
      tts: 0,
      voiceRequests: 0,
      estimatedInputTokens: 0,
      estimatedOutputTokens: 0,
      rateLimitHits: 0,
      failedRequests: 0,
      fallbackCount: 0,
      providers: {},
      models: {}
    });
  }

  const snap = await db.collection(`users/${uid}/usage`).orderBy("__name__", "desc").limit(days).get();
  for (const doc of snap.docs) {
    const pt = dailyMap.get(doc.id);
    if (!pt) continue;
    const d = doc.data() as Record<string, unknown>;
    pt.requests = typeof d.requests === "number" ? d.requests : 0;
    pt.tts = typeof d.tts === "number" ? d.tts : 0;
    pt.voiceRequests = typeof d.voiceRequests === "number" ? d.voiceRequests : 0;
    pt.estimatedInputTokens = typeof d.estimatedInputTokens === "number" ? d.estimatedInputTokens : 0;
    pt.estimatedOutputTokens = typeof d.estimatedOutputTokens === "number" ? d.estimatedOutputTokens : 0;
    pt.rateLimitHits = typeof d.rateLimitHits === "number" ? d.rateLimitHits : 0;
    pt.failedRequests = typeof d.failedRequests === "number" ? d.failedRequests : 0;
    pt.fallbackCount = typeof d.fallbackCount === "number" ? d.fallbackCount : 0;
    accumulateMap(pt.providers, d.providers);
    accumulateMap(pt.models, d.models);
  }

  return {
    user: summary,
    daily: Array.from(dailyMap.values())
  };
}

export async function getSystemDailyMetrics(days = 14): Promise<{
  daily: DailyMetricPoint[];
  totals: {
    requests: number;
    tts: number;
    voiceRequests: number;
    imageRequests: number;
    estimatedInputTokens: number;
    estimatedOutputTokens: number;
    rateLimitHits: number;
    failedRequests: number;
    fallbackCount: number;
    byProvider: Record<string, number>;
    byModel: Record<string, number>;
    tasks: Record<string, number>;
  };
}> {
  const dayKeys = lastNDaysKeys(Math.min(Math.max(days, 1), 60));
  const dailyMap = new Map<string, DailyMetricPoint>();
  for (const k of dayKeys) {
    dailyMap.set(k, {
      day: k,
      requests: 0,
      tts: 0,
      voiceRequests: 0,
      imageRequests: 0,
      estimatedInputTokens: 0,
      estimatedOutputTokens: 0,
      rateLimitHits: 0,
      failedRequests: 0,
      fallbackCount: 0,
      providers: {},
      models: {},
      tasks: {}
    });
  }

  const totals = {
    requests: 0,
    tts: 0,
    voiceRequests: 0,
    imageRequests: 0,
    estimatedInputTokens: 0,
    estimatedOutputTokens: 0,
    rateLimitHits: 0,
    failedRequests: 0,
    fallbackCount: 0,
    byProvider: {} as Record<string, number>,
    byModel: {} as Record<string, number>,
    tasks: {} as Record<string, number>
  };

  if (!hasAdminCredentials()) {
    return { daily: Array.from(dailyMap.values()), totals };
  }

  try {
    const db = adminDb();
    const snap = await db.collection("system/usageMetrics/daily").orderBy("__name__", "desc").limit(days).get();
    for (const doc of snap.docs) {
      const pt = dailyMap.get(doc.id);
      if (!pt) continue;
      const d = doc.data() as Record<string, unknown>;
      pt.requests = typeof d.requests === "number" ? d.requests : 0;
      pt.tts = typeof d.tts === "number" ? d.tts : 0;
      pt.voiceRequests = typeof d.voiceRequests === "number" ? d.voiceRequests : 0;
      pt.imageRequests = typeof d.imageRequests === "number" ? d.imageRequests : 0;
      pt.estimatedInputTokens = typeof d.estimatedInputTokens === "number" ? d.estimatedInputTokens : 0;
      pt.estimatedOutputTokens = typeof d.estimatedOutputTokens === "number" ? d.estimatedOutputTokens : 0;
      pt.rateLimitHits = typeof d.rateLimitHits === "number" ? d.rateLimitHits : 0;
      pt.failedRequests = typeof d.failedRequests === "number" ? d.failedRequests : 0;
      pt.fallbackCount = typeof d.fallbackCount === "number" ? d.fallbackCount : 0;
      accumulateMap(pt.providers, d.providers);
      accumulateMap(pt.models, d.models);
      if (pt.tasks) accumulateMap(pt.tasks, d.tasks);

      totals.requests += pt.requests;
      totals.tts += pt.tts;
      totals.voiceRequests += pt.voiceRequests;
      totals.imageRequests += pt.imageRequests || 0;
      totals.estimatedInputTokens += pt.estimatedInputTokens;
      totals.estimatedOutputTokens += pt.estimatedOutputTokens;
      totals.rateLimitHits += pt.rateLimitHits;
      totals.failedRequests += pt.failedRequests;
      totals.fallbackCount += pt.fallbackCount;
      accumulateMap(totals.byProvider, d.providers);
      accumulateMap(totals.byModel, d.models);
      accumulateMap(totals.tasks, d.tasks);
    }
  } catch {
    /* graceful empty state if metrics collection does not exist yet */
  }

  return { daily: Array.from(dailyMap.values()), totals };
}
