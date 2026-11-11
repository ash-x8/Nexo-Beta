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

type Source = "server" | "browser" | null;

export function useSpeaker(getToken: () => Promise<string>, serverTts: boolean, voiceName = "") {
  const [speaking, setSpeaking] = useState(false);
  const [source, setSource] = useState<Source>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const nodeRef = useRef<AudioBufferSourceNode | null>(null);
  const rafRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const runRef = useRef(0);

  const stop = useCallback(() => {
    runRef.current++;
    abortRef.current?.abort();
    try { nodeRef.current?.stop(); } catch { /* not started */ }
    nodeRef.current = null;
    if (typeof window !== "undefined") window.speechSynthesis?.cancel();
    cancelAnimationFrame(rafRef.current);
    avatarBus.level = 0;
    setSpeaking(false);
    setSource(null);
  }, []);

  useEffect(() => stop, [stop]);

  const speakBrowser = useCallback((text: string, run: number) => {
    const synth = window.speechSynthesis;
    if (!synth) { setSpeaking(false); return; }
    const u = new SpeechSynthesisUtterance(text);
    u.lang = /[\u0D80-\u0DFF]/.test(text) ? "si-LK" : "en-US";
    const chosen = voiceName ? synth.getVoices().find((v) => v.voiceURI === voiceName) : undefined;
    if (chosen) { u.voice = chosen; u.lang = chosen.lang; }
    // Browser speech exposes no audio stream: drive the mouth from word boundaries (approximate).
    u.onboundary = () => { avatarBus.level = 0.8; };
    u.onend = u.onerror = () => { if (runRef.current === run) { cancelAnimationFrame(rafRef.current); avatarBus.level = 0; setSpeaking(false); setSource(null); } };
    setSource("browser");
    const decay = () => { avatarBus.level *= 0.9; rafRef.current = requestAnimationFrame(decay); };
    decay();
    synth.speak(u);
  }, [voiceName]);

  const speak = useCallback(async (markdown: string) => {
    stop();
    const text = plainForSpeech(markdown);
    if (!text) return;
    const run = ++runRef.current;
    setSpeaking(true);

    if (serverTts) {
      try {
        const ac = new AbortController();
        abortRef.current = ac;
        const wav = await fetchTts(await getToken(), text, ac.signal);
        if (runRef.current !== run) return;
        const ctx = (ctxRef.current ??= new AudioContext());
        await ctx.resume();
        const buf = await ctx.decodeAudioData(wav);
        if (runRef.current !== run) return;
        const src = ctx.createBufferSource();
        src.buffer = buf;
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 512;
        src.connect(analyser);
        analyser.connect(ctx.destination);
        const data = new Uint8Array(analyser.fftSize);
        const loop = () => {
          analyser.getByteTimeDomainData(data);
          let sum = 0;
          for (let i = 0; i < data.length; i++) { const v = (data[i] - 128) / 128; sum += v * v; }
          avatarBus.level = Math.min(1, Math.sqrt(sum / data.length) * 5);
          rafRef.current = requestAnimationFrame(loop);
        };
        src.onended = () => { if (runRef.current === run) { cancelAnimationFrame(rafRef.current); avatarBus.level = 0; setSpeaking(false); setSource(null); } };
        nodeRef.current = src;
        setSource("server");
        src.start();
        loop();
        return;
      } catch (e: any) {
        if (e?.name === "AbortError" || runRef.current !== run) return;
        // quota/network problem: fall through to the browser voice
      }
    }
    if (runRef.current === run) speakBrowser(text, run);
  }, [getToken, serverTts, speakBrowser, stop]);

  return { speak, stop, speaking, source };
}
