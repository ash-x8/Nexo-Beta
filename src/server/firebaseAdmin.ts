import { cert, getApps, initializeApp, type App } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

function app(): App {
  const existing = getApps()[0];
  if (existing) return existing;
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");
  if (!projectId || !clientEmail || !privateKey) {
    throw new ApiError(500, "server_config", "Firebase Admin credentials are not configured on the server.");
  }
  return initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
}

export const adminDb = () => getFirestore(app());

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

/** Verifies the Firebase ID token from `Authorization: Bearer <token>` and returns the uid. */
export async function requireUser(req: Request): Promise<string> {
  const header = req.headers.get("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) throw new ApiError(401, "unauthenticated", "Sign in to use NEXO.");
  try {
    const decoded = await getAuth(app()).verifyIdToken(token);
    return decoded.uid;
  } catch (e) {
    if (e instanceof ApiError) throw e;
    throw new ApiError(401, "unauthenticated", "Your session expired. Sign in again.");
  }
}
