import { cert, getApps, initializeApp, type App } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

/** Reads the three credentials, tolerating common paste mistakes (quotes, trailing comma, whole JSON file). */
function readCredentials() {
  let projectId = process.env.FIREBASE_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "";
  let clientEmail = (process.env.FIREBASE_CLIENT_EMAIL || "").trim().replace(/^["']|["'],?$/g, "");
  let key = (process.env.FIREBASE_PRIVATE_KEY || "").trim();

  if (key.startsWith("{")) {
    try {
      const j = JSON.parse(key);
      key = j.private_key || "";
      clientEmail = clientEmail || j.client_email || "";
      projectId = projectId || j.project_id || "";
    } catch { /* fall through to validation below */ }
  }
  key = key.replace(/,$/, "").replace(/^["']|["']$/g, "").replace(/\\n/g, "\n");
  return { projectId: projectId.trim(), clientEmail, privateKey: key };
}

function app(): App {
  const existing = getApps()[0];
  if (existing) return existing;
  const { projectId, clientEmail, privateKey } = readCredentials();
  if (!projectId || !clientEmail || !privateKey) {
    throw new ApiError(500, "server_config", "Server Firebase credentials are missing. Set FIREBASE_CLIENT_EMAIL and FIREBASE_PRIVATE_KEY in Vercel, then redeploy.");
  }
  if (!privateKey.includes("BEGIN PRIVATE KEY")) {
    throw new ApiError(500, "server_config", "FIREBASE_PRIVATE_KEY is not valid. It must start with -----BEGIN PRIVATE KEY-----. Re-copy private_key from the service-account JSON.");
  }
  try {
    return initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
  } catch (e) {
    console.error("[firebase-admin init]", e);
    throw new ApiError(500, "server_config", "Server Firebase credentials could not be parsed. Re-copy FIREBASE_CLIENT_EMAIL and FIREBASE_PRIVATE_KEY from the service-account JSON, then redeploy.");
  }
}

export const adminDb = () => getFirestore(app());

/** Verifies the Firebase ID token from `Authorization: Bearer <token>` and returns the uid. */
export async function requireUser(req: Request): Promise<string> {
  const header = req.headers.get("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) throw new ApiError(401, "unauthenticated", "Sign in to use NEXO.");
  const a = app(); // config problems surface as their own clear error, not as "session expired"
  try {
    return (await getAuth(a).verifyIdToken(token)).uid;
  } catch (e: any) {
    console.error("[verifyIdToken]", e?.code, e?.message);
    if (e?.code === "auth/id-token-expired") throw new ApiError(401, "unauthenticated", "Your session expired. Sign out and sign in again.");
    if (String(e?.message).includes("aud")) throw new ApiError(500, "server_config", "FIREBASE_PROJECT_ID does not match the project you signed in with. It must be ash-wickramasinghe.");
    throw new ApiError(401, "unauthenticated", "Could not verify your sign-in. Sign out and in again; if it persists, check the Firebase server credentials in Vercel.");
  }
}
