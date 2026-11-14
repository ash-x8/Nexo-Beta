"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { DEFAULT_PREFS, sanitizePrefs, type Prefs, type Theme } from "@/lib/prefs";
import { savePrefs, subscribePrefs } from "@/lib/store";
import type { Lang } from "@/lib/types";

interface RuntimePrefDefaults {
  defaultTheme?: Theme;
  defaultLanguage?: Lang;
  allowLanguageSwitch?: boolean;
}

export function usePreferences(uid: string | undefined, runtimeDefaults?: RuntimePrefDefaults) {
  const [prefs, setPrefs] = useState<Prefs>(DEFAULT_PREFS);
  const hasExplicitThemeRef = useRef(false);
  const hasExplicitLangRef = useRef(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Hydrate from localStorage on mount
  useEffect(() => {
    try {
      const saved = sanitizePrefs(JSON.parse(localStorage.getItem("nexo.prefs") || "{}"));
      if (saved.theme) hasExplicitThemeRef.current = true;
      if (saved.ui) hasExplicitLangRef.current = true;
      if (Object.keys(saved).length) {
        setPrefs((p) => ({ ...p, ...saved }));
      }
    } catch {
      /* ignore corrupt storage */
    }
  }, []);

  // Apply server runtime defaults when user has not explicitly customized theme or UI language
  const defTheme = runtimeDefaults?.defaultTheme;
  const defLang = runtimeDefaults?.defaultLanguage;
  const allowLangSwitch = runtimeDefaults?.allowLanguageSwitch;

  useEffect(() => {
    setPrefs((prev) => {
      let changed = false;
      const next = { ...prev };
      if (defTheme && !hasExplicitThemeRef.current && prev.theme !== defTheme) {
        next.theme = defTheme;
        changed = true;
      }
      if (defLang && (!hasExplicitLangRef.current || allowLangSwitch === false) && prev.ui !== defLang) {
        next.ui = defLang;
        changed = true;
      }
      return changed ? next : prev;
    });
  }, [defTheme, defLang, allowLangSwitch]);

  // Subscribe to Firestore synced prefs when signed in
  useEffect(() => {
    if (!uid) return;
    return subscribePrefs(uid, (remote) => {
      if (remote) {
        if (remote.theme) hasExplicitThemeRef.current = true;
        if (remote.ui) hasExplicitLangRef.current = true;
        setPrefs((p) => {
          const next = { ...p, ...remote };
          if (allowLangSwitch === false && defLang) {
            next.ui = defLang;
          }
          try {
            localStorage.setItem("nexo.prefs", JSON.stringify(next));
          } catch {
            /* ignore */
          }
          return next;
        });
      }
    });
  }, [uid, allowLangSwitch, defLang]);

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
        meta.setAttribute("content", resolved === "light" ? "#f4f7fb" : "#080d13");
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
      if (key === "theme") hasExplicitThemeRef.current = true;
      if (key === "ui") hasExplicitLangRef.current = true;
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
