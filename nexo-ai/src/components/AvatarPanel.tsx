"use client";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useState } from "react";
import type { AvatarState } from "@/lib/avatarBus";
import type { Dict } from "@/lib/i18n";
import { MODEL_URL } from "./Avatar3D";

const Avatar3D = dynamic(() => import("./Avatar3D"), { ssr: false });

interface Props {
  state: AvatarState;
  speaking: boolean;
  source: "server" | "browser" | null;
  onStopSpeaking: () => void;
  t: Dict;
}

export default function AvatarPanel({ state, speaking, source, onStopSpeaking, t }: Props) {
  const [model, setModel] = useState<"checking" | "ready" | "missing">("checking");
  const [morphs, setMorphs] = useState<number | null>(null);

  useEffect(() => {
    let alive = true;
    fetch(MODEL_URL, { method: "HEAD" })
      .then((r) => alive && setModel(r.ok ? "ready" : "missing"))
      .catch(() => alive && setModel("missing"));
    return () => { alive = false; };
  }, []);

  const onInfo = useCallback((n: number) => setMorphs(n), []);
  const onFail = useCallback(() => setModel("missing"), []);

  return (
    <aside className="avatar-panel" data-state={state} aria-label="NEXO assistant">
      <div className="stage">
        <div className="ring" aria-hidden />
        <div className="ring ring-2" aria-hidden />
        {model === "ready" && <Avatar3D onInfo={onInfo} onFail={onFail} />}
        {model === "missing" && (
          <div className="model-missing" role="status">
            <strong>{t.modelMissing}</strong>
            <span>{t.modelMissingHelp}</span>
          </div>
        )}
      </div>
      <div className="avatar-status">
        <span className="dot" />
        <span>{t[`state_${state}` as keyof Dict]}</span>
        {speaking && (
          <button className="chip" onClick={onStopSpeaking}>{t.stopSpeaking}{source === "browser" ? " ·  browser voice" : ""}</button>
        )}
      </div>
      {model === "ready" && morphs === 0 && <p className="avatar-warn">{t.noMorphs}</p>}
    </aside>
  );
}
