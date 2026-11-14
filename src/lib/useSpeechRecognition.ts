"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { avatarBus } from "./avatarBus";

export type MicPermission = "unknown" | "granted" | "denied" | "prompt" | "unsupported";

interface SpeechRecLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((e: { results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}

/**
 * Manual-only speech-to-text. Recognition starts ONLY inside start() (user click),
 * never restarts itself (continuous = false), and drives avatarBus.level on speech frames.
 */
export function useSpeechRecognition(lang: string, onFinal: (text: string) => void) {
  const [supported, setSupported] = useState(false);
  const [permission, setPermission] = useState<MicPermission>("unknown");
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");
  const [error, setError] = useState<string | null>(null);
  const recRef = useRef<SpeechRecLike | null>(null);
  const cancelledRef = useRef(false);
  const finalRef = useRef("");
  const interimRef = useRef("");
  const onFinalRef = useRef(onFinal);
  onFinalRef.current = onFinal;

  useEffect(() => {
    const w = window as unknown as { SpeechRecognition?: new () => SpeechRecLike; webkitSpeechRecognition?: new () => SpeechRecLike };
    const isSup = !!(w.SpeechRecognition || w.webkitSpeechRecognition);
    setSupported(isSup);
    if (!isSup) {
      setPermission("unsupported");
      return;
    }

    let statusRef: PermissionStatus | null = null;
    if (navigator.permissions?.query) {
      navigator.permissions
        .query({ name: "microphone" as PermissionName })
        .then((st) => {
          statusRef = st;
          setPermission(st.state as MicPermission);
          st.onchange = () => setPermission(st.state as MicPermission);
        })
        .catch(() => setPermission("unknown"));
    }

    return () => {
      if (statusRef) statusRef.onchange = null;
      try {
        recRef.current?.abort();
      } catch {
        /* noop */
      }
      avatarBus.level = 0;
    };
  }, []);

  const start = useCallback(() => {
    const w = window as unknown as { SpeechRecognition?: new () => SpeechRecLike; webkitSpeechRecognition?: new () => SpeechRecLike };
    const Ctor = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!Ctor || recRef.current) return;

    setError(null);
    setInterim("");
    finalRef.current = "";
    interimRef.current = "";
    cancelledRef.current = false;

    const rec = new Ctor();
    rec.lang = lang;
    rec.continuous = false;
    rec.interimResults = true;
    rec.maxAlternatives = 1;

    rec.onresult = (e) => {
      let fin = "";
      let tmp = "";
      for (let i = 0; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) fin += r[0].transcript;
        else tmp += r[0].transcript;
      }
      finalRef.current = fin;
      interimRef.current = `${fin} ${tmp}`.trim();
      setInterim(interimRef.current);
      setPermission("granted");
      avatarBus.level = Math.min(1, 0.35 + (interimRef.current.length % 12) * 0.05);
    };

    rec.onerror = (e) => {
      avatarBus.level = 0;
      if (e.error === "not-allowed" || e.error === "service-not-allowed") {
        setPermission("denied");
        setError("Microphone permission was denied. Allow it in your browser's site settings.");
      } else if (e.error === "no-speech") {
        setError("No speech detected.");
      } else if (e.error === "audio-capture") {
        setError("No microphone was found.");
      } else if (e.error === "network") {
        setError("Speech recognition needs an internet connection.");
      } else if (e.error === "language-not-supported") {
        setError("This browser doesn't support speech recognition for the selected language.");
      } else if (e.error !== "aborted") {
        setError("Speech recognition failed.");
      }
    };

    rec.onend = () => {
      recRef.current = null;
      avatarBus.level = 0;
      setListening(false);
      const text = (finalRef.current || interimRef.current || "").trim();
      setInterim("");
      if (!cancelledRef.current && text) onFinalRef.current(text);
    };

    recRef.current = rec;
    try {
      rec.start();
      setListening(true);
      avatarBus.level = 0.25;
    } catch {
      recRef.current = null;
      avatarBus.level = 0;
      setError("Could not start the microphone.");
    }
  }, [lang]);

  const stop = useCallback(() => {
    try {
      recRef.current?.stop();
    } catch {
      /* noop */
    }
  }, []);

  const cancel = useCallback(() => {
    cancelledRef.current = true;
    avatarBus.level = 0;
    try {
      recRef.current?.abort();
    } catch {
      /* noop */
    }
  }, []);

  return {
    supported,
    permission,
    listening,
    interim,
    error,
    start,
    stop,
    cancel,
    clearError: () => setError(null)
  };
}
