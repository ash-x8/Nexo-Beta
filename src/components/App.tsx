"use client";
import dynamic from "next/dynamic";
import { useCallback, useState } from "react";
import { AuthProvider, useAuth } from "@/lib/auth";
import { firebaseReady } from "@/lib/firebase";
import { dictionaries } from "@/lib/i18n";
import Shell from "./Shell";
import ServiceWorkerRegister from "./ServiceWorkerRegister";

import { isWebGLAvailable } from "@/lib/webgl";

const JarvisCore = dynamic(() => import("./JarvisCore"), { ssr: false });

function Gate() {
  const { user, loading, signIn, signInGuest } = useAuth();
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [webgl, setWebgl] = useState(() => isWebGLAvailable());
  const onFail = useCallback(() => setWebgl(false), []);
  const t = dictionaries.en;

  if (loading) return <div className="landing"><div className="boot" aria-label="Loading" /></div>;

  if (!user) {
    return (
      <main className="gate">
        <div className="gate-core" aria-hidden="true">
          {webgl ? <JarvisCore onFail={onFail} /> : <div className="core-fallback"><span /><span /><span /></div>}
        </div>
        <h1>NEXO AI</h1>
        <p className="tag">{t.tagline}</p>
        
        {firebaseReady ? (
          <div style={{ display: "grid", gap: "10px", width: "min(340px, 100%)" }}>
            <button
              className="send"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                setErr(null);
                const res = await signIn();
                if (res) setErr(res);
                setBusy(false);
              }}
            >
              {busy ? t.signingIn : t.signIn}
            </button>
            <button
              className="m-ghost"
              disabled={busy}
              onClick={() => signInGuest()}
              style={{ height: "46px", borderRadius: "14px" }}
            >
              Continue in Guest Mode
            </button>
          </div>
        ) : (
          <div style={{ display: "grid", gap: "10px", width: "min(340px, 100%)" }}>
            <button
              className="send"
              onClick={() => signInGuest()}
            >
              Launch NEXO AI (Preview)
            </button>
            <p className="fine" style={{ margin: "4px 0", color: "var(--cyan)" }}>
              Running in local preview mode. Cloud sync activates automatically when deployed to Vercel.
            </p>
          </div>
        )}

        {err && <p className="err" role="alert" style={{ marginTop: "12px" }}>{err}</p>}
        <p className="fine">{t.signInFine}</p>
      </main>
    );
  }

  return <Shell />;
}

export default function App() {
  return (
    <AuthProvider>
      <ServiceWorkerRegister />
      <Gate />
    </AuthProvider>
  );
}
