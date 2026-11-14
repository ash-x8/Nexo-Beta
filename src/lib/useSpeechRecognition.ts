"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { transcribeAudio } from "./api";
import { avatarBus } from "./avatarBus";
import type { VoiceInputLang } from "./types";

export type MicPermission = "unknown" | "granted" | "denied" | "prompt" | "unsupported";

export interface VoiceRecognitionResultMeta {
  detectedLanguage?: string;
  languageLabel?: string;
}

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

interface VoiceOpts {
  getToken?: () => Promise<string>;
  transcribeServer?: boolean;
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const raw = String(reader.result || "");
      const idx = raw.indexOf(",");
      resolve(idx >= 0 ? raw.slice(idx + 1) : raw);
    };
    reader.onerror = () => reject(reader.error || new Error("Audio read failed."));
    reader.readAsDataURL(blob);
  });
}

function resolveBrowserLang(lang: VoiceInputLang): string {
  if (lang !== "auto") return lang;
  if (typeof navigator !== "undefined") {
    const n = navigator.language || "en-US";
    if (n.startsWith("si")) return "si-LK";
    if (n.startsWith("ta")) return "ta-IN";
    if (n.startsWith("hi")) return "hi-IN";
  }
  return "en-US";
}

/**
 * Manual-only speech-to-text with automatic server-side multi-language detection
 * (Sinhala, English, Tamil, Hindi, mixed) when available, plus browser SpeechRecognition fallback.
 */
export function useSpeechRecognition(
  lang: VoiceInputLang,
  onFinal: (text: string, meta?: VoiceRecognitionResultMeta) => void,
  opts: VoiceOpts = {}
) {
  const [supported, setSupported] = useState(false);
  const [permission, setPermission] = useState<MicPermission>("unknown");
  const [listening, setListening] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [interim, setInterim] = useState("");
  const [detectedLanguage, setDetectedLanguage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const recRef = useRef<SpeechRecLike | null>(null);
  const mediaRecRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const rafRef = useRef(0);
  const chunksRef = useRef<Blob[]>([]);
  const cancelledRef = useRef(false);
  const finalRef = useRef("");
  const interimRef = useRef("");
  const onFinalRef = useRef(onFinal);
  onFinalRef.current = onFinal;
  const optsRef = useRef(opts);
  optsRef.current = opts;

  const cleanupMedia = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    avatarBus.level = 0;
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((tr) => tr.stop());
      streamRef.current = null;
    }
    if (audioCtxRef.current) {
      audioCtxRef.current.close().catch(() => {});
      audioCtxRef.current = null;
    }
    mediaRecRef.current = null;
  }, []);

  useEffect(() => {
    const w = window as unknown as {
      SpeechRecognition?: new () => SpeechRecLike;
      webkitSpeechRecognition?: new () => SpeechRecLike;
    };
    const hasSpeech = !!(w.SpeechRecognition || w.webkitSpeechRecognition);
    const hasMedia =
      typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== "undefined";
    const isSup = hasSpeech || hasMedia;
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
      cleanupMedia();
    };
  }, [cleanupMedia]);

  const startBrowserSpeech = useCallback(
    (browserLang: string) => {
      const w = window as unknown as {
        SpeechRecognition?: new () => SpeechRecLike;
        webkitSpeechRecognition?: new () => SpeechRecLike;
      };
      const Ctor = w.SpeechRecognition || w.webkitSpeechRecognition;
      if (!Ctor || recRef.current) {
        setError("Voice input is not supported in this browser.");
        return;
      }

      finalRef.current = "";
      interimRef.current = "";
      const rec = new Ctor();
      rec.lang = browserLang;
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
        if (!cancelledRef.current && text) {
          onFinalRef.current(text, { detectedLanguage: browserLang });
        }
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
    },
    []
  );

  const start = useCallback(async () => {
    if (recRef.current || mediaRecRef.current || transcribing) return;

    setError(null);
    setInterim("");
    setDetectedLanguage(null);
    cancelledRef.current = false;

    const canServerTranscribe =
      !!optsRef.current.transcribeServer &&
      !!optsRef.current.getToken &&
      typeof navigator !== "undefined" &&
      !!navigator.mediaDevices?.getUserMedia &&
      typeof MediaRecorder !== "undefined";

    if (!canServerTranscribe) {
      startBrowserSpeech(resolveBrowserLang(lang));
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      setPermission("granted");
      streamRef.current = stream;

      const mimeCandidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"];
      const pickedMime = mimeCandidates.find((m) => MediaRecorder.isTypeSupported(m)) || "";
      const recorder = pickedMime ? new MediaRecorder(stream, { mimeType: pickedMime }) : new MediaRecorder(stream);
      chunksRef.current = [];
      mediaRecRef.current = recorder;

      // Live mic amplitude for Jarvis core & waveform
      try {
        const ctx = new AudioContext();
        audioCtxRef.current = ctx;
        const src = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 256;
        src.connect(analyser);
        const data = new Uint8Array(analyser.fftSize);
        const meter = () => {
          analyser.getByteTimeDomainData(data);
          let sum = 0;
          for (let i = 0; i < data.length; i++) {
            const v = (data[i] - 128) / 128;
            sum += v * v;
          }
          avatarBus.level = Math.min(1, Math.max(0.15, Math.sqrt(sum / data.length) * 6));
          rafRef.current = requestAnimationFrame(meter);
        };
        meter();
      } catch {
        avatarBus.level = 0.3;
      }

      recorder.ondataavailable = (ev) => {
        if (ev.data && ev.data.size > 0) chunksRef.current.push(ev.data);
      };

      recorder.onstop = async () => {
        const wasCancelled = cancelledRef.current;
        const blobMime = recorder.mimeType || pickedMime || "audio/webm";
        const blob = new Blob(chunksRef.current, { type: blobMime });
        chunksRef.current = [];
        cleanupMedia();
        setListening(false);
        setInterim("");

        if (wasCancelled || blob.size < 400) {
          return;
        }

        setTranscribing(true);
        try {
          const getToken = optsRef.current.getToken;
          if (!getToken) return;
          const token = await getToken();
          const audioBase64 = await blobToBase64(blob);
          const cleanMime = blobMime.split(";")[0] || "audio/webm";
          const res = await transcribeAudio(token, {
            audioBase64,
            mimeType: cleanMime,
            hintLanguage: lang
          });
          if (!cancelledRef.current && res.text.trim()) {
            setDetectedLanguage(res.languageLabel || res.detectedLanguage);
            onFinalRef.current(res.text.trim(), {
              detectedLanguage: res.detectedLanguage,
              languageLabel: res.languageLabel
            });
          } else if (!cancelledRef.current) {
            setError("No speech detected in the recording.");
          }
        } catch (err) {
          if (!cancelledRef.current) {
            setError(err instanceof Error ? err.message : "Voice transcription failed.");
          }
        } finally {
          setTranscribing(false);
        }
      };

      recorder.start();
      setListening(true);
    } catch (err: unknown) {
      cleanupMedia();
      const name = (err as { name?: string })?.name || "";
      if (name === "NotAllowedError" || name === "PermissionDeniedError") {
        setPermission("denied");
        setError("Microphone permission was denied. Allow it in your browser's site settings.");
      } else {
        // Fallback smoothly to browser speech recognition if MediaRecorder unavailable
        startBrowserSpeech(resolveBrowserLang(lang));
      }
    }
  }, [cleanupMedia, lang, startBrowserSpeech, transcribing]);

  const stop = useCallback(() => {
    try {
      if (mediaRecRef.current && mediaRecRef.current.state !== "inactive") {
        mediaRecRef.current.stop();
        return;
      }
      recRef.current?.stop();
    } catch {
      /* noop */
    }
  }, []);

  const cancel = useCallback(() => {
    cancelledRef.current = true;
    avatarBus.level = 0;
    try {
      if (mediaRecRef.current && mediaRecRef.current.state !== "inactive") {
        mediaRecRef.current.stop();
      } else {
        recRef.current?.abort();
      }
    } catch {
      /* noop */
    }
    cleanupMedia();
    setListening(false);
    setInterim("");
  }, [cleanupMedia]);

  return {
    supported,
    permission,
    listening,
    transcribing,
    interim,
    detectedLanguage,
    error,
    start,
    stop,
    cancel,
    clearError: () => setError(null)
  };
}
