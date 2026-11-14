"use client";
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  getRedirectResult,
  onAuthStateChanged,
  reauthenticateWithPopup,
  signInWithPopup,
  signInWithRedirect,
  signOut,
  type User
} from "firebase/auth";
import { auth, firebaseReady, googleProvider } from "./firebase";
import { saveUserProfile } from "./store";

export interface UserProfile {
  uid: string;
  displayName: string | null;
  email: string | null;
  photoURL: string | null;
}

interface AuthCtx {
  user: UserProfile | null;
  loading: boolean;
  configured: boolean;
  signIn: () => Promise<string | null>;
  reauthenticate: () => Promise<string | null>;
  logout: () => Promise<void>;
  getToken: (forceRefresh?: boolean) => Promise<string>;
}

const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!firebaseReady) {
      setLoading(false);
      return;
    }

    let active = true;
    getRedirectResult(auth()).catch((e) => {
      if (e?.code) console.warn("[auth] redirect result:", e.code);
    });

    const unsub = onAuthStateChanged(auth(), (u: User | null) => {
      if (!active) return;
      if (u) {
        const profile: UserProfile = {
          uid: u.uid,
          displayName: u.displayName,
          email: u.email,
          photoURL: u.photoURL
        };
        setUser(profile);
        saveUserProfile(profile).catch(() => {});
      } else {
        setUser(null);
      }
      setLoading(false);
    });

    return () => {
      active = false;
      unsub();
    };
  }, []);

  const value = useMemo<AuthCtx>(
    () => ({
      user,
      loading,
      configured: firebaseReady,
      async signIn() {
        if (!firebaseReady) {
          return "Firebase authentication is not configured for this environment.";
        }
        try {
          await signInWithPopup(auth(), googleProvider());
          return null;
        } catch (e: unknown) {
          const code = (e as { code?: string })?.code;
          if (code === "auth/popup-closed-by-user" || code === "auth/cancelled-popup-request") {
            return null;
          }
          if (code === "auth/popup-blocked" || code === "auth/operation-not-supported-in-this-environment") {
            try {
              await signInWithRedirect(auth(), googleProvider());
              return null;
            } catch {
              return "Sign-in could not start. Allow pop-ups for this site and try again.";
            }
          }
          if (code === "auth/unauthorized-domain") {
            return "This domain is not authorized in Firebase Authentication settings.";
          }
          if (code === "auth/network-request-failed") {
            return "No connection. Check your internet and try again.";
          }
          return "Sign-in failed. Please try again.";
        }
      },
      async reauthenticate() {
        if (!firebaseReady || !auth().currentUser) {
          return "Active Firebase session is required to re-authenticate.";
        }
        try {
          await reauthenticateWithPopup(auth().currentUser!, googleProvider());
          await auth().currentUser!.getIdToken(true);
          return null;
        } catch (e: unknown) {
          const code = (e as { code?: string })?.code;
          if (code === "auth/popup-closed-by-user" || code === "auth/cancelled-popup-request") {
            return "Re-authentication cancelled.";
          }
          return "Re-authentication failed. Please sign out and sign back in.";
        }
      },
      async logout() {
        if (firebaseReady) {
          await signOut(auth());
        }
        setUser(null);
      },
      async getToken(forceRefresh = false) {
        if (!firebaseReady) {
          throw new Error("Authentication is not configured.");
        }
        const current = auth().currentUser;
        if (!current) {
          throw new Error("Sign in required.");
        }
        return current.getIdToken(forceRefresh);
      }
    }),
    [user, loading]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
