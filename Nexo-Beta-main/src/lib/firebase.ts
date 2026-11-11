import { getApp, getApps, initializeApp, type FirebaseApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const cfg = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID
};

export const firebaseReady = !!(cfg.apiKey && cfg.authDomain && cfg.projectId && cfg.appId);

let app: FirebaseApp | null = null;
function getFb(): FirebaseApp {
  if (!firebaseReady) throw new Error("Firebase web config is missing.");
  app = app ?? (getApps().length ? getApp() : initializeApp(cfg));
  return app;
}

export const auth = () => getAuth(getFb());
export const db = () => getFirestore(getFb());
export const googleProvider = () => new GoogleAuthProvider();
