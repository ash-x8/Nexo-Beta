"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { fetchTts } from "./api";
import { avatarBus } from "./avatarBus";

export function plainForSpeech(md: string): string {
  return md
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[#>*_~|-]{1,}/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 1200);
}

function detectSpeechLocale(text: string): string {
  if (/[\u0D80-\u0DFF]/.test(text)) return "si-LK";
  if (/[\u0B80-\u0BFF]/.test(text)) return "ta-IN";
  if (/[\u0900-\u097F]/.test(text)) return "hi-IN";
  return "en-US";
}

type Source = "server" | "browser" | null;

export function useSpeaker(
  getToken: () => Promise<string>,
  serverTts: boolean,
  voiceName = "",
  speed = 1
) {
  const [speaking, setSpeaking] = useState(false);
  const [paused, setPaused] = useState(false);
  const [source, setSource] = useState<Source>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const nodeRef = useRef<AudioBufferSourceNode | null>(null);
  const rafRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const runRef = useRef(0);
  const sourceRef = useRef<Source>(null);
  const pausedRef = useRef(false);

  const stop = useCallback(() => {
    runRef.current++;
    abortRef.current?.abort();
    try {
      nodeRef.current?.stop();
    } catch {
      /* not started */
    }
    nodeRef.current = null;
    if (typeof window !== "undefined") window.speechSynthesis?.cancel();
    cancelAnimationFrame(rafRef.current);
    avatarBus.level = 0;
    pausedRef.current = false;
    sourceRef.current = null;
    setSpeaking(false);
    setPaused(false);
    setSource(null);
  }, []);

  useEffect(() => stop, [stop]);

  const pause = useCallback(async () => {
    if (!sourceRef.current || pausedRef.current) return;
    pausedRef.current = true;
    setPaused(true);
    avatarBus.level = 0;
    if (sourceRef.current === "server" && ctxRef.current && ctxRef.current.state === "running") {
      try {
        await ctxRef.current.suspend();
      } catch {
        /* ignore */
      }
    } else if (sourceRef.current === "browser" && typeof window !== "undefined") {
      window.speechSynthesis?.pause();
    }
  }, []);

  const resume = useCallback(async () => {
    if (!sourceRef.current || !pausedRef.current) return;
    pausedRef.current = false;
    setPaused(false);
    if (sourceRef.current === "server" && ctxRef.current && ctxRef.current.state === "suspended") {
      try {
        await ctxRef.current.resume();
      } catch {
        /* ignore */
      }
    } else if (sourceRef.current === "browser" && typeof window !== "undefined") {
      window.speechSynthesis?.resume();
    }
  }, []);

  const speakBrowser = useCallback(
    (text: string, run: number, onFinish?: () => void) => {
      const synth = typeof window !== "undefined" ? window.speechSynthesis : undefined;
      if (!synth) {
        setSpeaking(false);
        onFinish?.();
        return;
      }
      const u = new SpeechSynthesisUtterance(text);
      u.lang = detectSpeechLocale(text);
      u.rate = Math.min(1.5, Math.max(0.75, speed));
      const chosen = voiceName ? synth.getVoices().find((v) => v.voiceURI === voiceName) : undefined;
      if (chosen) {
        u.voice = chosen;
        u.lang = chosen.lang;
      }
      u.onboundary = () => {
        if (!pausedRef.current) avatarBus.level = 0.8;
      };
      u.onend = u.onerror = () => {
        if (runRef.current === run) {
          cancelAnimationFrame(rafRef.current);
          avatarBus.level = 0;
          pausedRef.current = false;
          sourceRef.current = null;
          setSpeaking(false);
          setPaused(false);
          setSource(null);
          onFinish?.();
        }
      };
      sourceRef.current = "browser";
      setSource("browser");
      const decay = () => {
        avatarBus.level = pausedRef.current ? 0 : avatarBus.level * 0.9;
        rafRef.current = requestAnimationFrame(decay);
      };
      decay();
      synth.speak(u);
    },
    [voiceName, speed]
  );

  const speak = useCallback(
    async (markdown: string, opts?: { onEnded?: () => void }) => {
      stop();
      const text = plainForSpeech(markdown);
      if (!text) {
        opts?.onEnded?.();
        return;
      }
      const run = ++runRef.current;
      pausedRef.current = false;
      setPaused(false);
      setSpeaking(true);

      if (serverTts) {
        try {
          const ac = new AbortController();
          abortRef.current = ac;
          const wav = await fetchTts(await getToken(), text, ac.signal);
          if (runRef.current !== run) return;
          const ctx = (ctxRef.current ??= new AudioContext());
          if (ctx.state === "suspended") await ctx.resume();
          const buf = await ctx.decodeAudioData(wav);
          if (runRef.current !== run) return;

          const src = ctx.createBufferSource();
          src.buffer = buf;
          src.playbackRate.value = Math.min(1.5, Math.max(0.75, speed));
          const analyser = ctx.createAnalyser();
          analyser.fftSize = 512;
          src.connect(analyser);
          analyser.connect(ctx.destination);

          const data = new Uint8Array(analyser.fftSize);
          const loop = () => {
            if (pausedRef.current) {
              avatarBus.level = 0;
            } else {
              analyser.getByteTimeDomainData(data);
              let sum = 0;
              for (let i = 0; i < data.length; i++) {
                const v = (data[i] - 128) / 128;
                sum += v * v;
              }
              avatarBus.level = Math.min(1, Math.sqrt(sum / data.length) * 5);
            }
            rafRef.current = requestAnimationFrame(loop);
          };

          src.onended = () => {
            if (runRef.current === run) {
              cancelAnimationFrame(rafRef.current);
              avatarBus.level = 0;
              pausedRef.current = false;
              sourceRef.current = null;
              setSpeaking(false);
              setPaused(false);
              setSource(null);
              opts?.onEnded?.();
            }
          };

          nodeRef.current = src;
          sourceRef.current = "server";
          setSource("server");
          src.start();
          loop();
          return;
        } catch (e: unknown) {
          if ((e as { name?: string })?.name === "AbortError" || runRef.current !== run) return;
        }
      }
      if (runRef.current === run) speakBrowser(text, run, opts?.onEnded);
    },
    [getToken, serverTts, speakBrowser, speed, stop]
  );

  return { speak, pause, resume, stop, speaking, paused, source };
}
