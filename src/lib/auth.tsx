"use client";
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { getRedirectResult, onAuthStateChanged, signInWithPopup, signInWithRedirect, signOut, type User } from "firebase/auth";
import { auth, firebaseReady, googleProvider } from "./firebase";

export interface UserProfile {
  uid: string;
  displayName: string | null;
  email: string | null;
  photoURL: string | null;
}

interface AuthCtx {
  user: UserProfile | null;
  loading: boolean;
  isGuest: boolean;
  signIn: () => Promise<string | null>;
  signInGuest: () => void;
  logout: () => Promise<void>;
  getToken: () => Promise<string>;
}

const Ctx = createContext<AuthCtx | null>(null);

const GUEST_USER: UserProfile = {
  uid: "guest-user",
  displayName: "NEXO User",
  email: "guest@nexo.ai",
  photoURL: null
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [isGuest, setIsGuest] = useState(false);

  useEffect(() => {
    // Check if guest user was stored
    const storedGuest = typeof window !== "undefined" && localStorage.getItem("nexo.guest") === "1";
    if (storedGuest) {
      setUser(GUEST_USER);
      setIsGuest(true);
      setLoading(false);
      return;
    }

    if (!firebaseReady) {
      setLoading(false);
      return;
    }

    try {
      getRedirectResult(auth()).catch((e) => console.warn("[auth] redirect result", e?.code));
      return onAuthStateChanged(auth(), (u: User | null) => {
        if (u) {
          setUser({
            uid: u.uid,
            displayName: u.displayName,
            email: u.email,
            photoURL: u.photoURL
          });
          setIsGuest(false);
        } else {
          setUser(null);
          setIsGuest(false);
        }
        setLoading(false);
      });
    } catch (e) {
      console.warn("[auth] init error", e);
      setLoading(false);
    }
  }, []);

  const value = useMemo<AuthCtx>(() => ({
    user,
    loading,
    isGuest,
    signInGuest() {
      try { localStorage.setItem("nexo.guest", "1"); } catch { /* ignore */ }
      setUser(GUEST_USER);
      setIsGuest(true);
      setLoading(false);
    },
    async signIn() {
      if (!firebaseReady) {
        // Fallback to guest mode if Firebase client is not configured
        value.signInGuest();
        return null;
      }
      try {
        await signInWithPopup(auth(), googleProvider());
        try { localStorage.removeItem("nexo.guest"); } catch { /* ignore */ }
        setIsGuest(false);
        return null;
      } catch (e: any) {
        const code = e?.code as string | undefined;
        if (code === "auth/popup-closed-by-user" || code === "auth/cancelled-popup-request") return null;
        if (code === "auth/popup-blocked" || code === "auth/operation-not-supported-in-this-environment") {
          try {
            await signInWithRedirect(auth(), googleProvider());
            return null;
          } catch {
            return "Sign-in could not start. Allow pop-ups for this site and try again.";
          }
        }
        if (code === "auth/unauthorized-domain") return "This domain is not authorized in Firebase Authentication settings.";
        if (code === "auth/network-request-failed") return "No connection. Check your internet and try again.";
        return "Sign-in failed. Check your connection or continue in Guest mode.";
      }
    },
    async logout() {
      try { localStorage.removeItem("nexo.guest"); } catch { /* ignore */ }
      setIsGuest(false);
      setUser(null);
      if (firebaseReady) {
        try { await signOut(auth()); } catch { /* ignore */ }
      }
    },
    getToken: async () => {
      if (isGuest || !firebaseReady) return "guest-token";
      const u = auth().currentUser;
      if (!u) {
        // if user is stored but no firebase auth currentUser, fallback to guest-token
        return "guest-token";
      }
      return u.getIdToken();
    }
  }), [user, loading, isGuest]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error("useAuth outside AuthProvider");
  return c;
}
