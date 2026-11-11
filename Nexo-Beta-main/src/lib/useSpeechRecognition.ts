"use client";
import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Manual-only speech-to-text. Recognition starts ONLY inside start() (called from a button click),
 * never restarts itself (continuous = false), and stops on stop()/cancel()/silence.
 */
export function useSpeechRecognition(lang: string, onFinal: (text: string) => void) {
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");
  const [error, setError] = useState<string | null>(null);
  const recRef = useRef<any>(null);
  const cancelledRef = useRef(false);
  const finalRef = useRef("");
  const interimRef = useRef("");
  const onFinalRef = useRef(onFinal);
  onFinalRef.current = onFinal;

  useEffect(() => {
    const w = window as any;
    setSupported(!!(w.SpeechRecognition || w.webkitSpeechRecognition));
    return () => { try { recRef.current?.abort(); } catch { /* noop */ } };
  }, []);

  const start = useCallback(() => {
    const w = window as any;
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
    rec.onresult = (e: any) => {
      let fin = "", tmp = "";
      for (let i = 0; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) fin += r[0].transcript; else tmp += r[0].transcript;
      }
      finalRef.current = fin;
      interimRef.current = (fin + " " + tmp).trim();
      setInterim(interimRef.current);
    };
    rec.onerror = (e: any) => {
      if (e.error === "not-allowed" || e.error === "service-not-allowed") setError("Microphone permission was denied. Allow it in your browser's site settings.");
      else if (e.error === "no-speech") setError("No speech detected.");
      else if (e.error === "audio-capture") setError("No microphone was found.");
      else if (e.error === "network") setError("Speech recognition needs an internet connection.");
      else if (e.error === "language-not-supported") setError("This browser doesn't support speech recognition for the selected language.");
      else if (e.error !== "aborted") setError("Speech recognition failed.");
    };
    rec.onend = () => {
      recRef.current = null;
      setListening(false);
      const text = (finalRef.current || interimRef.current || "").trim();
      setInterim("");
      if (!cancelledRef.current && text) onFinalRef.current(text);
    };
    recRef.current = rec;
    try { rec.start(); setListening(true); } catch { recRef.current = null; setError("Could not start the microphone."); }
  }, [lang]);

  const stop = useCallback(() => { try { recRef.current?.stop(); } catch { /* noop */ } }, []);
  const cancel = useCallback(() => { cancelledRef.current = true; try { recRef.current?.abort(); } catch { /* noop */ } }, []);

  return { supported, listening, interim, error, start, stop, cancel, clearError: () => setError(null) };
}
