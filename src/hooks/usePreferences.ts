"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { DEFAULT_PREFS, sanitizePrefs, type Prefs } from "@/lib/prefs";
import { savePrefs, subscribePrefs } from "@/lib/store";

export function usePreferences(uid: string | undefined) {
  const [prefs, setPrefs] = useState<Prefs>(DEFAULT_PREFS);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Hydrate from localStorage on mount
  useEffect(() => {
    try {
      const saved = sanitizePrefs(JSON.parse(localStorage.getItem("nexo.prefs") || "{}"));
      if (Object.keys(saved).length) {
        setPrefs((p) => ({ ...p, ...saved }));
      }
    } catch {
      /* ignore corrupt storage */
    }
  }, []);

  // Subscribe to Firestore synced prefs when signed in
  useEffect(() => {
    if (!uid) return;
    return subscribePrefs(uid, (remote) => {
      if (remote) {
        setPrefs((p) => {
          const next = { ...p, ...remote };
          try {
            localStorage.setItem("nexo.prefs", JSON.stringify(next));
          } catch {
            /* ignore */
          }
          return next;
        });
      }
    });
  }, [uid]);

  // Apply theme + lang attribute cleanly
  useEffect(() => {
    const applyTheme = () => {
      const resolved =
        prefs.theme === "system"
          ? window.matchMedia("(prefers-color-scheme: light)").matches
            ? "light"
            : "dark"
          : prefs.theme;
      document.documentElement.dataset.theme = resolved;
      const meta = document.querySelector('meta[name="theme-color"]');
      if (meta) {
        meta.setAttribute("content", resolved === "light" ? "#f4f6fb" : "#06070a");
      }
    };
    applyTheme();
    document.documentElement.lang = prefs.ui;

    if (prefs.theme === "system") {
      const mq = window.matchMedia("(prefers-color-scheme: light)");
      mq.addEventListener("change", applyTheme);
      return () => mq.removeEventListener("change", applyTheme);
    }
  }, [prefs.theme, prefs.ui]);

  const setPref = useCallback(
    <K extends keyof Prefs>(key: K, value: Prefs[K]) => {
      setPrefs((prev) => {
        const next = { ...prev, [key]: value };
        try {
          localStorage.setItem("nexo.prefs", JSON.stringify(next));
        } catch {
          /* ignore */
        }
        if (uid) {
          if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
          saveTimerRef.current = setTimeout(() => {
            savePrefs(uid, next).catch(() => {});
          }, 250);
        }
        return next;
      });
    },
    [uid]
  );

  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, []);

  return { prefs, setPref };
}
