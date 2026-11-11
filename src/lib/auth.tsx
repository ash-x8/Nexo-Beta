"use client";
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { getRedirectResult, onAuthStateChanged, signInWithPopup, signInWithRedirect, signOut, type User } from "firebase/auth";
import { auth, firebaseReady, googleProvider } from "./firebase";

interface AuthCtx {
  user: User | null;
  loading: boolean;
  signIn: () => Promise<string | null>;
  logout: () => Promise<void>;
  getToken: () => Promise<string>;
}
const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(firebaseReady);

  useEffect(() => {
    if (!firebaseReady) return;
    getRedirectResult(auth()).catch((e) => console.warn("[auth] redirect result", e?.code));
    return onAuthStateChanged(auth(), (u) => { setUser(u); setLoading(false); });
  }, []);

  const value = useMemo<AuthCtx>(() => ({
    user,
    loading,
    async signIn() {
      try { await signInWithPopup(auth(), googleProvider()); return null; }
      catch (e: any) {
        const code = e?.code as string | undefined;
        if (code === "auth/popup-closed-by-user" || code === "auth/cancelled-popup-request") return null;
        if (code === "auth/popup-blocked" || code === "auth/operation-not-supported-in-this-environment") {
          try { await signInWithRedirect(auth(), googleProvider()); return null; }
          catch { return "Sign-in could not start. Allow pop-ups for this site and try again."; }
        }
        if (code === "auth/unauthorized-domain") return "This domain is not authorized in Firebase Authentication settings.";
        if (code === "auth/network-request-failed") return "No connection. Check your internet and try again.";
        return "Sign-in failed. Check your connection and try again.";
      }
    },
    logout: () => signOut(auth()),
    getToken: async () => {
      const u = auth().currentUser;
      if (!u) throw new Error("Not signed in");
      return u.getIdToken();
    }
  }), [user, loading]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error("useAuth outside AuthProvider");
  return c;
}
