"use client";
import { useEffect, useState } from "react";
import "@/lib/useInstall"; // attach the install-prompt listener as early as possible

const TEXT = {
  en: { msg: "A new version of NEXO is ready.", update: "Update", later: "Later" },
  si: { msg: "NEXO හි නව අනුවාදයක් සූදානම්.", update: "යාවත්කාලීන කරන්න", later: "පසුව" }
};

export default function ServiceWorkerRegister() {
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null);

  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    let reloading = false;
    const onController = () => { if (!reloading) { reloading = true; window.location.reload(); } };
    navigator.serviceWorker.addEventListener("controllerchange", onController);

    let reg: ServiceWorkerRegistration | undefined;
    const watch = (r: ServiceWorkerRegistration) => {
      if (r.waiting && navigator.serviceWorker.controller) setWaiting(r.waiting);
      r.addEventListener("updatefound", () => {
        const w = r.installing;
        w?.addEventListener("statechange", () => {
          if (w.state === "installed" && navigator.serviceWorker.controller) setWaiting(w);
        });
      });
    };
    navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" })
      .then((r) => { reg = r; watch(r); })
      .catch((e) => console.warn("[sw] registration failed", e));

    // Look for a new version whenever the app returns to the foreground.
    const onVisible = () => { if (document.visibilityState === "visible") reg?.update().catch(() => {}); };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      navigator.serviceWorker.removeEventListener("controllerchange", onController);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  if (!waiting) return null;
  const t = document.documentElement.lang === "si" ? TEXT.si : TEXT.en;
  return (
    <div className="pwa-toast" role="status">
      <span>{t.msg}</span>
      <button onClick={() => waiting.postMessage({ type: "SKIP_WAITING" })}>{t.update}</button>
      <button className="ghost" onClick={() => setWaiting(null)}>{t.later}</button>
    </div>
  );
}
