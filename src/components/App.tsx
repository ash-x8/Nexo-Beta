"use client";
import dynamic from "next/dynamic";
import { useCallback, useState } from "react";
import { AuthProvider, useAuth } from "@/lib/auth";
import { firebaseReady } from "@/lib/firebase";
import { dictionaries } from "@/lib/i18n";
import Shell from "./Shell";
import ServiceWorkerRegister from "./ServiceWorkerRegister";

const JarvisCore = dynamic(() => import("./JarvisCore"), { ssr: false });

function Gate() {
  const { user, loading, signIn } = useAuth();
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [webgl, setWebgl] = useState(true);
  const onFail = useCallback(() => setWebgl(false), []);
  const t = dictionaries.en;

  if (!firebaseReady) {
    return (
      <div className="landing"><div className="glass card">
        <h1>{t.setupTitle}</h1><p>{t.setupBody}</p>
      </div></div>
    );
  }
  if (loading) return <div className="landing"><div className="boot" aria-label="Loading" /></div>;
  if (!user) {
    return (
      <main className="gate">
        <div className="gate-core" aria-hidden="true">
          {webgl ? <JarvisCore onFail={onFail} /> : <div className="core-fallback"><span /><span /><span /></div>}
        </div>
        <h1>NEXO AI</h1>
        <p className="tag">{t.tagline}</p>
        <button className="send" disabled={busy} onClick={async () => { setBusy(true); setErr(null); setErr(await signIn()); setBusy(false); }}>
          {busy ? t.signingIn : t.signIn}
        </button>
        {err && <p className="err" role="alert">{err}</p>}
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
