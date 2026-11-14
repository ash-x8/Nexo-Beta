"use client";
import { useEffect } from "react";
import { motion } from "motion/react";
import { Mic, MicOff, Square, VolumeX, X } from "lucide-react";
import type { AvatarState } from "@/lib/avatarBus";
import type { Dict } from "@/lib/i18n";
import AudioWaveform from "./AudioWaveform";
import JarvisCore from "./JarvisCore";

interface Props {
  open: boolean;
  onClose: () => void;
  t: Dict;
  state: AvatarState;
  listening: boolean;
  transcribing: boolean;
  busy: boolean;
  speaking: boolean;
  continuous: boolean;
  onToggleContinuous: () => void;
  detectedLanguage: string | null;
  interim: string;
  lastUserText: string;
  lastAssistantText: string;
  micError: string | null;
  onStartTurn: () => void;
  onStopListening: () => void;
  onInterrupt: () => void;
}

export default function JarvisSession({
  open,
  onClose,
  t,
  state,
  listening,
  transcribing,
  busy,
  speaking,
  continuous,
  onToggleContinuous,
  detectedLanguage,
  interim,
  lastUserText,
  lastAssistantText,
  micError,
  onStartTurn,
  onStopListening,
  onInterrupt
}: Props) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const statusText = listening
    ? t.state_listening
    : transcribing
      ? t.transcribing
      : busy
        ? t.state_thinking
        : speaking
          ? t.state_speaking
          : state === "error"
            ? t.state_error
            : t.state_idle;

  return (
    <div className="nx-jarvis-backdrop" role="dialog" aria-modal="true" aria-label={t.jarvisSessionTitle} onClick={onClose}>
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
        className="nx-jarvis-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontWeight: 700, fontFamily: "var(--font-display-stack)", fontSize: 16 }}>
            {t.jarvisSessionTitle}
          </span>
          <button type="button" className="nx-tiny-btn" onClick={onClose} aria-label={t.close}>
            <X size={18} />
          </button>
        </div>

        <div className="nx-jarvis-orb">
          <JarvisCore state={state} />
        </div>

        <div className="nx-jarvis-status">{statusText}</div>
        <div style={{ width: "80%", maxWidth: 260 }}>
          <AudioWaveform height={28} bars={26} />
        </div>

        {detectedLanguage && (
          <div style={{ fontSize: 12.5, color: "var(--accent-blue)" }}>
            {t.detectedLangPrefix}: {detectedLanguage}
          </div>
        )}

        {micError && (
          <div className="nx-banner error" style={{ width: "100%", textAlign: "left" }}>
            <span>{micError}</span>
          </div>
        )}

        <div className="nx-jarvis-transcript">
          {interim ? (
            <div>
              <strong style={{ color: "var(--text-primary)" }}>{t.you}:</strong> {interim}
            </div>
          ) : lastAssistantText && (busy || speaking) ? (
            <div>
              <strong style={{ color: "var(--accent-blue)" }}>NEXO v1:</strong> {lastAssistantText.slice(0, 320)}
            </div>
          ) : lastUserText ? (
            <div>
              <strong style={{ color: "var(--text-primary)" }}>{t.you}:</strong> {lastUserText}
            </div>
          ) : (
            <span style={{ color: "var(--text-muted)" }}>{t.listening}</span>
          )}
        </div>

        <div className="nx-jarvis-controls">
          {listening ? (
            <button
              type="button"
              className="nx-primary-btn"
              style={{ flex: 1 }}
              onClick={onStopListening}
            >
              <Square size={16} />
              <span>{t.micStop}</span>
            </button>
          ) : speaking || busy ? (
            <button
              type="button"
              className="nx-danger-btn"
              style={{ flex: 1, minHeight: 46 }}
              onClick={onInterrupt}
            >
              <VolumeX size={16} />
              <span>{t.jarvisInterrupt}</span>
            </button>
          ) : (
            <button
              type="button"
              className="nx-primary-btn"
              style={{ flex: 1 }}
              disabled={transcribing}
              onClick={onStartTurn}
            >
              <Mic size={16} />
              <span>{t.jarvisTapSpeak}</span>
            </button>
          )}

          <button
            type="button"
            className="nx-secondary-btn"
            style={{ minHeight: 46 }}
            onClick={onClose}
          >
            <MicOff size={15} />
            <span>{t.jarvisStop}</span>
          </button>
        </div>

        <div className="nx-field-row" style={{ width: "100%", paddingTop: 4 }}>
          <span className="nx-field-hint">{t.jarvisContinuousLabel}</span>
          <button
            type="button"
            role="switch"
            aria-checked={continuous}
            className={`nx-switch ${continuous ? "on" : ""}`}
            onClick={onToggleContinuous}
          >
            <span />
          </button>
        </div>

        <p className="nx-field-hint" style={{ fontSize: 11.5 }}>{t.micPrivacy}</p>
      </motion.div>
    </div>
  );
}
