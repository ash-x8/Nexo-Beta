"use client";
import { useEffect, useState } from "react";
import { AuthProvider, useAuth } from "@/lib/auth";
import { dictionaries } from "@/lib/i18n";
import type { Lang } from "@/lib/types";
import InstallButton from "./InstallButton";
import JarvisCore from "./JarvisCore";
import ServiceWorkerRegister from "./ServiceWorkerRegister";
import Workspace from "./Workspace";

function Gate() {
  const { user, loading, configured, signIn, logout, getToken } = useAuth();
  const [lang, setLang] = useState<Lang>("en");
  const [signingIn, setSigningIn] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    try {
      const p = JSON.parse(localStorage.getItem("nexo.prefs") || "{}");
      if (p.ui === "si") {
        setLang("si");
        document.documentElement.lang = "si";
      }
    } catch {
      /* ignore corrupt storage */
    }
  }, []);

  const t = dictionaries[lang];

  const switchLang = (next: Lang) => {
    setLang(next);
    document.documentElement.lang = next;
    try {
      const prev = JSON.parse(localStorage.getItem("nexo.prefs") || "{}");
      localStorage.setItem("nexo.prefs", JSON.stringify({ ...prev, ui: next }));
    } catch {
      /* ignore */
    }
  };

  if (loading) {
    return (
      <div className="nx-boot">
        <div className="nx-spinner" />
      </div>
    );
  }

  if (user) {
    return <Workspace user={user} getToken={getToken} onLogout={logout} />;
  }

  return (
    <main className="nx-auth-shell">
      <div className="nx-auth-card">
        <div style={{ width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <InstallButton label={t.install} iosPrompt={t.installIos} closeLabel={t.close} compact />
          <div className="nx-seg" style={{ marginLeft: "auto" }}>
            <button type="button" className={lang === "en" ? "active" : ""} onClick={() => switchLang("en")}>
              EN
            </button>
            <button type="button" className={lang === "si" ? "active" : ""} onClick={() => switchLang("si")}>
              සිං
            </button>
          </div>
        </div>

        <div className="nx-auth-orb">
          <JarvisCore />
        </div>

        <h1 className="nx-auth-title">NEXO AI</h1>
        <p className="nx-auth-sub">{t.tagline}</p>

        {!configured ? (
          <div className="nx-setup-box">
            <strong>{t.setupTitle}</strong>
            <span>{t.setupBody}</span>
          </div>
        ) : (
          <>
            {err && (
              <div className="nx-banner error" style={{ width: "100%" }}>
                <span>{err}</span>
              </div>
            )}
            <button
              type="button"
              className="nx-primary-btn"
              disabled={signingIn}
              onClick={async () => {
                setErr(null);
                setSigningIn(true);
                const msg = await signIn();
                if (msg) setErr(msg);
                setSigningIn(false);
              }}
            >
              <span>{signingIn ? t.signingIn : t.signIn}</span>
            </button>
            <p className="nx-auth-fine">{t.signInFine}</p>
          </>
        )}
      </div>
    </main>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <ServiceWorkerRegister />
      <Gate />
    </AuthProvider>
  );
}
