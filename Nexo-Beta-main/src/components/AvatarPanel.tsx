"use client";
import dynamic from "next/dynamic";
import { useCallback, useState } from "react";
import type { AvatarState } from "@/lib/avatarBus";
import type { Dict } from "@/lib/i18n";

const JarvisCore = dynamic(() => import("./JarvisCore"), { ssr: false });

interface Props {
  state: AvatarState;
  speaking: boolean;
  source: "server" | "browser" | null;
  onStopSpeaking: () => void;
  info?: { provider: string; model: string; search: boolean };
  t: Dict;
}

export default function AvatarPanel({ state, speaking, source, onStopSpeaking, info, t }: Props) {
  const [webgl, setWebgl] = useState(true);
  const onFail = useCallback(() => setWebgl(false), []);

  return (
    <aside className="avatar-panel" data-state={state} aria-label="NEXO assistant">
      <div className="stage">
        {webgl ? <JarvisCore onFail={onFail} /> : (
          <div className="core-fallback" aria-hidden><span /><span /><span /></div>
        )}
      </div>
      <div className="avatar-status" role="status">
        <span className="dot" />
        <span>{t[`state_${state}` as keyof Dict]}</span>
        {speaking && (
          <button className="chip" onClick={onStopSpeaking}>{t.stopSpeaking}{source === "browser" ? " · browser voice" : ""}</button>
        )}
      </div>
      {info && (
        <dl className="avatar-info">
          <div><dt>{t.infoProvider}</dt><dd>{info.provider}</dd></div>
          <div><dt>{t.infoModel}</dt><dd>{info.model}</dd></div>
          <div><dt>{t.infoSearch}</dt><dd>{info.search ? t.on : t.off}</dd></div>
        </dl>
      )}
      {!webgl && <p className="avatar-warn">{t.noWebgl}</p>}
    </aside>
  );
}
