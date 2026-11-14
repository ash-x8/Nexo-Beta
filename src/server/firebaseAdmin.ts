import { cert, getApps, initializeApp, type App } from "firebase-admin/app";
import { getAuth, type DecodedIdToken } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import type { AccountStatus, FeatureKey, UserRole } from "@/lib/types";

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

export const PEM_BEGIN_MARKER = "-----BEGIN PRIVATE KEY-----";
export const PEM_END_MARKER = "-----END PRIVATE KEY-----";

// Fallback designated Owner email used ONLY on the server if OWNER_EMAIL env var is omitted.
// Never exposed to public clients or API responses.
const SERVER_DEFAULT_OWNER_EMAIL = "kushanashvika216@gmail.com";

export interface AuthContext {
  uid: string;
  email: string | null;
  emailVerified: boolean;
  displayName: string | null;
  photoURL: string | null;
  role: UserRole;
  isOwner: boolean;
  status: AccountStatus;
  suspendedReason?: string;
  featureOverrides: Partial<Record<FeatureKey, boolean>>;
  claims: Record<string, unknown>;
}

function stripWrappingQuotes(raw: string): string {
  let v = raw.trim().replace(/,\s*$/, "");
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
    v = v.slice(1, -1).trim();
  }
  return v;
}

/** Normalizes escaped newlines (\\n), CRLF, quotes, and trailing commas in PEM keys. */
export function normalizePrivateKey(raw: string): string {
  return stripWrappingQuotes(raw)
    .replace(/\\\\r\\\\n/g, "\n")
    .replace(/\\\\n/g, "\n")
    .replace(/\\r\\n/g, "\n")
    .replace(/\\n/g, "\n")
    .replace(/\r\n?/g, "\n")
    .trim();
}

/** Validates that a normalized PEM key includes both BEGIN and END PRIVATE KEY markers with content between them. */
export function isValidPemPrivateKey(key: string): boolean {
  const beginIdx = key.indexOf(PEM_BEGIN_MARKER);
  const endIdx = key.indexOf(PEM_END_MARKER);
  if (beginIdx === -1 || endIdx === -1 || endIdx <= beginIdx) return false;
  const body = key.slice(beginIdx + PEM_BEGIN_MARKER.length, endIdx).replace(/\s+/g, "");
  return body.length > 0;
}

/** Reads the three credentials, tolerating common paste mistakes (quotes, trailing comma, escaped newlines, whole JSON file). */
export function readCredentials() {
  let projectId = stripWrappingQuotes(process.env.FIREBASE_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "");
  let clientEmail = stripWrappingQuotes(process.env.FIREBASE_CLIENT_EMAIL || "");
  let key = stripWrappingQuotes(process.env.FIREBASE_PRIVATE_KEY || "");

  if (key.startsWith("{")) {
    try {
      const j = JSON.parse(key) as { private_key?: unknown; client_email?: unknown; project_id?: unknown };
      key = typeof j.private_key === "string" ? j.private_key : "";
      if (!clientEmail && typeof j.client_email === "string") clientEmail = stripWrappingQuotes(j.client_email);
      if (!projectId && typeof j.project_id === "string") projectId = stripWrappingQuotes(j.project_id);
    } catch {
      /* fall through to validation below */
    }
  }

  return {
    projectId: projectId.trim(),
    clientEmail: clientEmail.trim(),
    privateKey: normalizePrivateKey(key)
  };
}

export function hasAdminCredentials(): boolean {
  const { projectId, clientEmail, privateKey } = readCredentials();
  return !!(projectId && clientEmail && privateKey && isValidPemPrivateKey(privateKey));
}

function app(): App {
  const existing = getApps()[0];
  if (existing) return existing;
  const { projectId, clientEmail, privateKey } = readCredentials();
  if (!projectId || !clientEmail || !privateKey) {
    throw new ApiError(
      500,
      "server_config",
      "Server Firebase credentials are missing. Configure FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, and FIREBASE_PRIVATE_KEY."
    );
  }
  if (!isValidPemPrivateKey(privateKey)) {
    throw new ApiError(
      500,
      "server_config",
      "FIREBASE_PRIVATE_KEY format is invalid. Ensure it includes the full PEM key."
    );
  }
  try {
    return initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
  } catch {
    console.error("[firebase-admin init] failed");
    throw new ApiError(
      500,
      "server_config",
      "Server Firebase credentials could not be initialized. Check FIREBASE_CLIENT_EMAIL and FIREBASE_PRIVATE_KEY."
    );
  }
}

export const adminDb = () => getFirestore(app());
export const adminAuth = () => getAuth(app());

export function getOwnerAllowlist(): Set<string> {
  const configured = (process.env.OWNER_EMAIL || "").trim();
  const extra = (process.env.SUPER_ADMIN_EMAILS || "").trim();
  const raw = [configured || SERVER_DEFAULT_OWNER_EMAIL, extra]
    .filter(Boolean)
    .join(",")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return new Set(raw);
}

export function isOwnerIdentity(email?: string | null, emailVerified?: boolean): boolean {
  if (!email || !emailVerified) return false;
  return getOwnerAllowlist().has(email.trim().toLowerCase());
}

async function logSecurityEventInternal(
  a: App,
  entry: {
    type: "forbidden_admin" | "rate_limit" | "auth_error" | "suspended_access" | "config_alert";
    uid?: string;
    path?: string;
    severity: "low" | "medium" | "high";
    reason: string;
  }
) {
  try {
    const db = getFirestore(a);
    await db.collection("admin/securityEvents/entries").add({
      ...entry,
      createdAt: Date.now()
    });
  } catch {
    /* best-effort audit logging */
  }
}

function sanitizeOverrides(raw: unknown): Partial<Record<FeatureKey, boolean>> {
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
 * Verifies the Firebase ID token (`Authorization: Bearer <token>`), checks token revocation,
 * validates custom claims + Owner email allowlist, and checks account status in Firestore.
 */
export async function requireAuthContext(
  req: Request,
  options: { allowSuspended?: boolean; checkRevoked?: boolean } = {}
): Promise<AuthContext> {
  const header = req.headers.get("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!token) throw new ApiError(401, "unauthenticated", "Sign in to use NEXO.");

  const a = app();
  let decoded: DecodedIdToken;
  try {
    decoded = await getAuth(a).verifyIdToken(token, options.checkRevoked !== false);
    if (!decoded?.uid) throw new ApiError(401, "unauthenticated", "Invalid authentication token.");
  } catch (e: unknown) {
    if (e instanceof ApiError) throw e;
    const err = e as { code?: string; message?: string };
    console.error("[verifyIdToken]", err?.code || "error");
    if (err?.code === "auth/id-token-revoked") {
      throw new ApiError(401, "session_revoked", "Your session was revoked. Sign in again.");
    }
    if (err?.code === "auth/id-token-expired") {
      throw new ApiError(401, "unauthenticated", "Your session expired. Sign out and sign in again.");
    }
    if (String(err?.message).includes("aud")) {
      throw new ApiError(500, "server_config", "FIREBASE_PROJECT_ID does not match the client Firebase project.");
    }
    throw new ApiError(401, "unauthenticated", "Could not verify your sign-in. Sign out and sign in again.");
  }

  const email = typeof decoded.email === "string" ? decoded.email : null;
  const emailVerified = decoded.email_verified === true;
  const owner = isOwnerIdentity(email, emailVerified);
  const claimRole = (decoded as Record<string, unknown>).role;
  const role: UserRole = owner || claimRole === "SUPER_ADMIN" ? "SUPER_ADMIN" : "USER";

  // Sync SUPER_ADMIN custom claim when verified Owner signs in for the first time
  if (owner && claimRole !== "SUPER_ADMIN") {
    getAuth(a)
      .setCustomUserClaims(decoded.uid, { role: "SUPER_ADMIN", owner: true })
      .catch(() => {});
  }

  let status: AccountStatus = "active";
  let suspendedReason: string | undefined;
  let featureOverrides: Partial<Record<FeatureKey, boolean>> = {};

  try {
    const db = getFirestore(a);
    const userRef = db.doc(`users/${decoded.uid}`);
    const snap = await userRef.get();
    const data = snap.exists ? (snap.data() as Record<string, unknown>) : null;

    if (data) {
      if (data.status === "suspended" || data.status === "disabled") {
        status = data.status;
      }
      if (typeof data.suspendedReason === "string" && data.suspendedReason.trim()) {
        suspendedReason = data.suspendedReason.trim();
      }
      featureOverrides = sanitizeOverrides(data.featureOverrides);
    } else {
      // Check global registration gate before creating brand-new user account record
      if (!owner) {
        const cfgSnap = await db.doc("system/globalConfig").get();
        if (cfgSnap.exists && cfgSnap.data()?.allowRegistration === false) {
          await logSecurityEventInternal(a, {
            type: "auth_error",
            uid: decoded.uid,
            severity: "medium",
            reason: "New registration blocked by global policy"
          });
          throw new ApiError(403, "registration_closed", "New account registrations are currently closed by the administrator.");
        }
      }
      await userRef.set(
        {
          email: email || "",
          displayName: typeof decoded.name === "string" ? decoded.name.slice(0, 120) : "",
          photoURL: typeof decoded.picture === "string" ? decoded.picture.slice(0, 500) : "",
          role,
          status: "active",
          createdAt: Date.now(),
          lastActiveAt: Date.now(),
          updatedAt: Date.now()
        },
        { merge: true }
      );
    }

    // Best-effort lastActiveAt & role mirror sync (non-blocking)
    if (data) {
      userRef
        .set(
          {
            role,
            lastActiveAt: Date.now(),
            ...(email && !data.email ? { email } : {})
          },
          { merge: true }
        )
        .catch(() => {});
    }
  } catch (err) {
    if (err instanceof ApiError) throw err;
    /* continue gracefully if Firestore metadata check is transiently unavailable */
  }

  // Owner cannot be locked out by accidental suspension records
  if (owner && status !== "active") {
    status = "active";
    suspendedReason = undefined;
  }

  if (!owner && status !== "active" && !options.allowSuspended) {
    await logSecurityEventInternal(a, {
      type: "suspended_access",
      uid: decoded.uid,
      path: (() => {
        try {
          return new URL(req.url).pathname;
        } catch {
          return undefined;
        }
      })(),
      severity: "medium",
      reason: `Blocked ${status} account request`
    });
    throw new ApiError(
      403,
      "account_suspended",
      suspendedReason || "Your account access has been suspended by the administrator."
    );
  }

  return {
    uid: decoded.uid,
    email,
    emailVerified,
    displayName: typeof decoded.name === "string" ? decoded.name : null,
    photoURL: typeof decoded.picture === "string" ? decoded.picture : null,
    role,
    isOwner: owner,
    status,
    suspendedReason,
    featureOverrides,
    claims: decoded as Record<string, unknown>
  };
}

/** Verifies the Firebase ID token from `Authorization: Bearer <token>` and returns the uid. */
export async function requireUser(req: Request): Promise<string> {
  const ctx = await requireAuthContext(req);
  return ctx.uid;
}

/** Strictly verifies SUPER_ADMIN / Owner authorization on server-only admin routes. */
export async function requireAdmin(req: Request): Promise<AuthContext> {
  const ctx = await requireAuthContext(req, { allowSuspended: false });
  if (ctx.role !== "SUPER_ADMIN") {
    let path: string | undefined;
    try {
      path = new URL(req.url).pathname;
    } catch {
      path = undefined;
    }
    if (hasAdminCredentials()) {
      await logSecurityEventInternal(app(), {
        type: "forbidden_admin",
        uid: ctx.uid,
        path,
        severity: "high",
        reason: "Non-admin account attempted to access Owner Super Admin API"
      });
    }
    throw new ApiError(403, "forbidden", "Owner Super Admin authorization required.");
  }
  return ctx;
}

/**
 * Validates same-origin CSRF protection on mutating Owner admin requests when an Origin header is supplied.
 */
export function assertSameOrigin(req: Request): void {
  const origin = req.headers.get("origin");
  if (!origin) return;
  try {
    const originHost = new URL(origin).host.toLowerCase();
    const expectedHost = (
      req.headers.get("x-forwarded-host") ||
      req.headers.get("host") ||
      new URL(req.url).host
    )
      .split(",")[0]
      .trim()
      .toLowerCase();
    if (expectedHost && originHost !== expectedHost) {
      throw new ApiError(403, "csrf_blocked", "Cross-origin administrative mutation rejected.");
    }
  } catch (e) {
    if (e instanceof ApiError) throw e;
    throw new ApiError(403, "csrf_blocked", "Invalid request origin header.");
  }
}

/**
 * Verifies Owner Super Admin authorization plus recent authentication freshness for sensitive secret/Vercel mutations.
 */
export async function requireSensitiveAdmin(req: Request, maxAuthAgeSeconds = 3600): Promise<AuthContext> {
  assertSameOrigin(req);
  const ctx = await requireAdmin(req);
  const authTime = typeof ctx.claims?.auth_time === "number" ? ctx.claims.auth_time : null;
  if (authTime !== null) {
    const age = Math.floor(Date.now() / 1000) - authTime;
    if (age > maxAuthAgeSeconds) {
      throw new ApiError(
        401,
        "reauth_required",
        "Sensitive Owner operation requires recent authentication. Re-authenticate your session to continue."
      );
    }
  }
  return ctx;
}

