"use client";
import { useEffect, useRef } from "react";
import { avatarBus } from "@/lib/avatarBus";

interface Props {
  height?: number;
  bars?: number;
}

export default function AudioWaveform({ height = 28, bars = 24 }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let raf = 0;
    let phase = 0;
    let smoothed = 0.08;

    const draw = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = canvas.clientWidth || 180;
      const h = height;
      if (canvas.width !== Math.floor(w * dpr) || canvas.height !== Math.floor(h * dpr)) {
        canvas.width = Math.floor(w * dpr);
        canvas.height = Math.floor(h * dpr);
      }

      ctx.save();
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, w, h);

      const s = avatarBus.state;
      const targetLevel =
        s === "speaking"
          ? Math.max(0.22, avatarBus.level)
          : s === "listening"
            ? Math.max(0.28, avatarBus.level)
            : s === "thinking"
              ? 0.42
              : s === "error"
                ? 0.16
                : 0.08;

      smoothed += (targetLevel - smoothed) * 0.22;
      phase += reduce ? 0.02 : s === "thinking" ? 0.16 : s === "speaking" || s === "listening" ? 0.12 : 0.04;

      const color =
        s === "error"
          ? "#ef4444"
          : s === "speaking"
            ? "#2dd4a8"
            : s === "listening"
              ? "#438bff"
              : s === "thinking"
                ? "#7c8cff"
                : "#00d6c5";

      const gap = 3;
      const barW = Math.max(2, (w - gap * (bars - 1)) / bars);

      ctx.fillStyle = color;
      for (let i = 0; i < bars; i++) {
        const norm = i / Math.max(1, bars - 1);
        const envelope = Math.sin(norm * Math.PI);
        const wave = Math.abs(Math.sin(phase + i * 0.45) * Math.cos(phase * 0.6 - i * 0.2));
        const ratio = Math.min(1, 0.12 + smoothed * envelope * (0.4 + wave * 0.85));
        const barH = Math.max(3, ratio * (h - 4));
        const x = i * (barW + gap);
        const y = (h - barH) / 2;

        ctx.globalAlpha = s === "idle" ? 0.45 : 0.88;
        ctx.beginPath();
        ctx.roundRect(x, y, barW, barH, 2);
        ctx.fill();
      }
      ctx.restore();
      raf = requestAnimationFrame(draw);
    };

    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [bars, height]);

  return (
    <canvas
      ref={canvasRef}
      className="nx-waveform"
      style={{ width: "100%", height }}
      aria-hidden="true"
    />
  );
}
