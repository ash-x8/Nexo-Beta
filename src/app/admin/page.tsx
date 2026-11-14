"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Lock, ShieldAlert } from "lucide-react";
import AdminDashboard from "@/components/admin/AdminDashboard";
import type { AdminOverviewResponse } from "@/components/admin/adminTypes";
import { adminApi, ApiClientError, fetchSession } from "@/lib/api";
import { AuthProvider, useAuth } from "@/lib/auth";

function AdminGate() {
  const { user, loading, configured, signIn, logout, getToken } = useAuth();
  const [checking, setChecking] = useState(false);
  const [denied, setDenied] = useState<string | null>(null);
  const [overview, setOverview] = useState<AdminOverviewResponse | null>(null);
  const [signingIn, setSigningIn] = useState(false);

  const verifyAdmin = useCallback(async () => {
    if (!user) {
      setOverview(null);
      setDenied(null);
      return;
    }
    setChecking(true);
    setDenied(null);
    try {
      const tok = await getToken();
      const sess = await fetchSession(tok);
      if (sess.role !== "SUPER_ADMIN" || !sess.isOwner) {
        setDenied("Owner Super Admin authorization is required to access this Control Center.");
        setOverview(null);
        return;
      }
      const data = (await adminApi.getOverview(tok, 14)) as unknown as AdminOverviewResponse;
      setOverview(data);
    } catch (e) {
      const msg =
        e instanceof ApiClientError && (e.status === 401 || e.status === 403)
          ? e.message
          : "Unable to verify Super Admin authorization.";
      setDenied(msg);
      setOverview(null);
    } finally {
      setChecking(false);
    }
  }, [user, getToken]);

  useEffect(() => {
    void verifyAdmin();
  }, [verifyAdmin]);

  if (loading || checking) {
    return (
      <div className="nx-boot">
        <div className="nx-spinner" />
      </div>
    );
  }

  if (!user) {
    return (
      <main className="nx-auth-shell">
        <div className="nx-auth-card">
          <Lock size={34} color="var(--accent-blue)" />
          <h1 className="nx-auth-title" style={{ fontSize: 22 }}>
            NEXO AI · Super Admin Control Center
          </h1>
          <p className="nx-auth-sub">
            Sign in with the designated Owner account to manage platform configuration, security, and users.
          </p>
          {!configured ? (
            <div className="nx-setup-box">
              <strong>Firebase Authentication Not Configured</strong>
              <span>Set NEXT_PUBLIC_FIREBASE_* and server credentials to authenticate.</span>
            </div>
          ) : (
            <button
              type="button"
              className="nx-primary-btn"
              disabled={signingIn}
              onClick={async () => {
                setSigningIn(true);
                await signIn();
                setSigningIn(false);
              }}
            >
              <span>{signingIn ? "Signing in…" : "Continue with Google"}</span>
            </button>
          )}
          <Link href="/" className="nx-secondary-btn" style={{ width: "100%", textDecoration: "none" }}>
            <ArrowLeft size={15} />
            <span>Return to NEXO AI</span>
          </Link>
        </div>
      </main>
    );
  }

  if (denied || !overview) {
    return (
      <main className="nx-auth-shell">
        <div className="nx-auth-card">
          <ShieldAlert size={36} color="var(--status-err)" />
          <h1 className="nx-auth-title" style={{ fontSize: 22 }}>
            Access Denied
          </h1>
          <p className="nx-auth-sub">
            {denied || "This area is restricted exclusively to the verified NEXO AI Owner."}
          </p>
          <div style={{ display: "flex", gap: 10, width: "100%" }}>
            <Link href="/" className="nx-secondary-btn" style={{ flex: 1, textDecoration: "none" }}>
              <ArrowLeft size={15} />
              <span>Back to Chat</span>
            </Link>
            <button type="button" className="nx-danger-btn" style={{ flex: 1 }} onClick={logout}>
              <span>Sign Out</span>
            </button>
          </div>
        </div>
      </main>
    );
  }

  return <AdminDashboard initialOverview={overview} getToken={getToken} onLogout={logout} />;
}

export default function AdminPage() {
  return (
    <AuthProvider>
      <AdminGate />
    </AuthProvider>
  );
}
