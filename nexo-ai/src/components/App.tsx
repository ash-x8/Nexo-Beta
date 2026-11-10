"use client";
import { useState } from "react";
import { AuthProvider, useAuth } from "@/lib/auth";
import { firebaseReady } from "@/lib/firebase";
import { dictionaries } from "@/lib/i18n";
import Shell from "./Shell";
import ServiceWorkerRegister from "./ServiceWorkerRegister";

function Gate() {
  const { user, loading, signIn } = useAuth();
  const [err, setErr] = useState<string | null>(null);
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
      <div className="landing">
        <div className="glass card">
          <div className="logo big">N</div>
          <h1>NEXO AI</h1>
          <p className="tag">{t.tagline}</p>
          <button className="send" onClick={async () => setErr(await signIn())}>{t.signIn}</button>
          {err && <p className="err" role="alert">{err}</p>}
        </div>
      </div>
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
