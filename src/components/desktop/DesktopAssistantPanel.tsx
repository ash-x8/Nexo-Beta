"use client";
import { useCallback, useState } from "react";
import { AudioLines, Pause, Play, Square } from "lucide-react";
import type { AvatarState } from "@/lib/avatarBus";
import type { Dict } from "@/lib/i18n";
import type { NexoTaskType, PublicConfig } from "@/lib/types";
import AudioWaveform from "../AudioWaveform";
import JarvisCore from "../JarvisCore";

interface Props {
  t: Dict;
  state: AvatarState;
  speaking: boolean;
  paused: boolean;
  onPauseSpeak: () => void;
  onResumeSpeak: () => void;
  onStopSpeak: () => void;
  config: PublicConfig | null;
  activeCapability: NexoTaskType | null;
  useSearch: boolean;
  onOpenJarvis?: () => void;
}

const CAPABILITY_NAMES: Record<NexoTaskType, string> = {
  general: "Unified Auto-Router",
  reasoning: "Deep Reasoning",
  coding: "Code Intelligence",
  writing: "Writing Studio",
  translation: "Multilingual Translation",
  summarization: "Smart Synthesis",
  math: "Analytical Math",
  imageGen: "Image Studio",
  imageUnderstanding: "Vision Analysis",
  audioProcessing: "Voice Transcription",
  voiceConversation: "Jarvis Voice",
  webSearch: "Web Research"
};

export default function DesktopAssistantPanel({
  t,
  state,
  speaking,
  paused,
  onPauseSpeak,
  onResumeSpeak,
  onStopSpeak,
  config,
  activeCapability,
  useSearch,
  onOpenJarvis
}: Props) {
  const [webglFailed, setWebglFailed] = useState(false);
  const handleWebglFail = useCallback(() => setWebglFailed(true), []);

  const stateLabel =
    state === "listening"
      ? t.state_listening
      : state === "thinking"
        ? t.state_thinking
        : state === "speaking"
          ? t.state_speaking
          : state === "error"
            ? t.state_error
            : t.state_idle;

  return (
    <aside className="nx-right-panel" aria-label={t.assistantName}>
      <div className="nx-panel-orb-box">
        <div className="nx-panel-orb">
          <JarvisCore onFail={handleWebglFail} state={state} />
        </div>
        <div className="nx-panel-state">
          <span
            className={`nx-live-dot ${state === "listening" || state === "thinking" ? "recording" : state === "error" ? "error" : ""}`}
            aria-hidden="true"
          />
          <span>{stateLabel}</span>
        </div>

        <AudioWaveform height={26} bars={22} />

        {onOpenJarvis && (
          <button
            type="button"
            className="nx-secondary-btn"
            style={{ minHeight: 34, padding: "5px 12px", width: "100%", borderColor: "var(--accent-soft)" }}
            onClick={onOpenJarvis}
          >
            <AudioLines size={14} color="var(--accent-blue)" />
            <span>{t.jarvisStart}</span>
          </button>
        )}

        {speaking && (
          <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
            <button
              type="button"
              className="nx-secondary-btn"
              style={{ minHeight: 32, padding: "4px 10px" }}
              onClick={paused ? onResumeSpeak : onPauseSpeak}
            >
              {paused ? <Play size={14} /> : <Pause size={14} />}
              <span>{paused ? t.resumeSpeaking : t.pauseSpeaking}</span>
            </button>
            <button
              type="button"
              className="nx-secondary-btn"
              style={{ minHeight: 32, padding: "4px 10px" }}
              onClick={onStopSpeak}
            >
              <Square size={13} />
              <span>{t.stopSpeaking}</span>
            </button>
          </div>
        )}

        {webglFailed && (
          <p className="nx-field-hint" style={{ textAlign: "center", fontSize: 11.5 }}>
            {t.noWebgl}
          </p>
        )}
      </div>

      <div className="nx-kv-list">
        <div className="nx-kv-row">
          <span className="nx-kv-key">{t.infoProvider}</span>
          <span className="nx-kv-val" style={{ color: "var(--accent-blue)" }}>
            NEXO v1
          </span>
        </div>
        <div className="nx-kv-row">
          <span className="nx-kv-key">{t.capabilities.split(" ")[0] || "Mode"}</span>
          <span className="nx-kv-val">
            {activeCapability ? CAPABILITY_NAMES[activeCapability] : "Unified Auto-Router"}
          </span>
        </div>
        {config?.searchEnabled && (
          <div className="nx-kv-row">
            <span className="nx-kv-key">{t.infoSearch}</span>
            <span className="nx-kv-val">{useSearch ? t.on : t.off}</span>
          </div>
        )}
      </div>

      <p className="nx-field-hint" style={{ marginTop: "auto", fontSize: 11.5 }}>
        {t.shortcuts}
      </p>
    </aside>
  );
}
