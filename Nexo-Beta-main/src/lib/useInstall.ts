"use client";
import { useEffect, useState } from "react";

interface InstallEvent extends Event { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> }

// Captured at module load so the event is not missed if a screen mounts later.
let deferred: InstallEvent | null = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());
if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); deferred = e as InstallEvent; notify(); });
  window.addEventListener("appinstalled", () => { deferred = null; notify(); });
}

export function useInstall() {
  const [, tick] = useState(0);
  const [env, setEnv] = useState({ standalone: false, ios: false });
  useEffect(() => {
    const l = () => tick((n) => n + 1);
    listeners.add(l);
    const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as unknown as { standalone?: boolean }).standalone === true;
    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
    setEnv({ standalone, ios });
    return () => { listeners.delete(l); };
  }, []);
  return {
    /** Chromium/Android: the browser offered a real install prompt */
    canInstall: !!deferred && !env.standalone,
    /** iOS Safari has no install prompt: show manual steps instead */
    showIosHelp: env.ios && !env.standalone,
    standalone: env.standalone,
    install: async () => {
      if (!deferred) return;
      const e = deferred;
      deferred = null;
      notify();
      await e.prompt();
    }
  };
}
