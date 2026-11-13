import { cert, getApps, initializeApp, type App } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

export const PEM_BEGIN_MARKER = "-----BEGIN PRIVATE KEY-----";
export const PEM_END_MARKER = "-----END PRIVATE KEY-----";

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

/** Verifies the Firebase ID token from `Authorization: Bearer <token>` and returns the uid. */
export async function requireUser(req: Request): Promise<string> {
  const header = req.headers.get("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!token) throw new ApiError(401, "unauthenticated", "Sign in to use NEXO.");

  const a = app();
  try {
    const decoded = await getAuth(a).verifyIdToken(token);
    if (!decoded?.uid) throw new ApiError(401, "unauthenticated", "Invalid authentication token.");
    return decoded.uid;
  } catch (e: unknown) {
    if (e instanceof ApiError) throw e;
    const err = e as { code?: string; message?: string };
    console.error("[verifyIdToken]", err?.code || "error");
    if (err?.code === "auth/id-token-expired") {
      throw new ApiError(401, "unauthenticated", "Your session expired. Sign out and sign in again.");
    }
    if (String(err?.message).includes("aud")) {
      throw new ApiError(500, "server_config", "FIREBASE_PROJECT_ID does not match the client Firebase project.");
    }
    throw new ApiError(401, "unauthenticated", "Could not verify your sign-in. Sign out and sign in again.");
  }
}
