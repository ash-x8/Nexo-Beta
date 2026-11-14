"use client";
import { useCallback, useState } from "react";
import { Pause, Play, Square } from "lucide-react";
import type { AvatarState } from "@/lib/avatarBus";
import type { Dict } from "@/lib/i18n";
import type { PublicConfig } from "@/lib/types";
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
  activeModel: string;
  useSearch: boolean;
}

export default function DesktopAssistantPanel({
  t,
  state,
  speaking,
  paused,
  onPauseSpeak,
  onResumeSpeak,
  onStopSpeak,
  config,
  activeModel,
  useSearch
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
          <span className="nx-kv-val">{config?.provider || "—"}</span>
        </div>
        <div className="nx-kv-row">
          <span className="nx-kv-key">{t.infoModel}</span>
          <span className="nx-kv-val" title={activeModel || config?.model}>
            {activeModel || config?.model || "—"}
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
