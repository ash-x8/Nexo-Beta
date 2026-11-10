"use client";
import { useEffect, useState } from "react";
import type { Dict } from "@/lib/i18n";
import type { Lang, MemoryItem, PublicConfig } from "@/lib/types";

export interface Prefs {
  ui: Lang;
  reply: "auto" | Lang;
  voiceLang: "en-US" | "si-LK";
  speak: boolean;
  memoryOn: boolean;
  avatarOn: boolean;
}

interface Props {
  t: Dict;
  prefs: Prefs;
  config: PublicConfig | null;
  memory: MemoryItem[];
  getToken: () => Promise<string>;
  onChange: (p: Prefs) => void;
  onAddMemory: (text: string) => void;
  onDeleteMemory: (id: string) => void;
  onClose: () => void;
}

export default function SettingsDialog({ t, prefs, config, memory, getToken, onChange, onAddMemory, onDeleteMemory, onClose }: Props) {
  const [usage, setUsage] = useState<{ requests: number; tts: number } | null>(null);
  const [note, setNote] = useState("");
  const set = <K extends keyof Prefs>(k: K, v: Prefs[K]) => onChange({ ...prefs, [k]: v });

  useEffect(() => {
    let alive = true;
    getToken().then((tok) => fetch("/api/usage", { headers: { Authorization: `Bearer ${tok}` } }))
      .then((r) => (r.ok ? r.json() : null)).then((j) => alive && j && setUsage(j)).catch(() => {});
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", esc);
    return () => { alive = false; window.removeEventListener("keydown", esc); };
  }, [getToken, onClose]);

  return (
    <div className="modal-wrap" role="dialog" aria-modal="true" aria-label={t.settings} onClick={onClose}>
      <div className="modal glass" onClick={(e) => e.stopPropagation()}>
        <header><h2>{t.settings}</h2><button className="mini" onClick={onClose} aria-label={t.close}>✕</button></header>

        <label>{t.uiLang}
          <select value={prefs.ui} onChange={(e) => set("ui", e.target.value as Lang)}>
            <option value="en">English</option><option value="si">සිංහල</option>
          </select>
        </label>
        <label>{t.replyLang}
          <select value={prefs.reply} onChange={(e) => set("reply", e.target.value as Prefs["reply"])}>
            <option value="auto">{t.replyAuto}</option><option value="en">English</option><option value="si">සිංහල</option>
          </select>
        </label>
        <label>{t.voiceLang}
          <select value={prefs.voiceLang} onChange={(e) => set("voiceLang", e.target.value as Prefs["voiceLang"])}>
            <option value="en-US">English</option><option value="si-LK">සිංහල</option>
          </select>
        </label>
        <label className="check"><input type="checkbox" checked={prefs.speak} onChange={(e) => set("speak", e.target.checked)} />{t.speakReplies}</label>
        <label className="check"><input type="checkbox" checked={prefs.avatarOn} onChange={(e) => set("avatarOn", e.target.checked)} />{t.showAvatar}</label>

        <h3>{t.memory}</h3>
        <label className="check"><input type="checkbox" checked={prefs.memoryOn} onChange={(e) => set("memoryOn", e.target.checked)} />{t.memoryOn}</label>
        <p className="hint">{t.memoryHint}</p>
        <form className="memform" onSubmit={(e) => { e.preventDefault(); const v = note.trim(); if (v && memory.length < 20) { onAddMemory(v.slice(0, 300)); setNote(""); } }}>
          <input value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} placeholder={t.memoryPlaceholder} />
          <button type="submit" disabled={!note.trim() || memory.length >= 20}>{t.addMemory}</button>
        </form>
        <ul className="memlist">
          {memory.map((m) => (<li key={m.id}><span>{m.text}</span><button className="mini" onClick={() => onDeleteMemory(m.id)} aria-label={t.delete}>🗑</button></li>))}
        </ul>

        {config && usage && (
          <>
            <h3>{t.usageToday}</h3>
            <p className="hint">
              {usage.requests} / {config.dailyLimit} {t.messages}
              {config.ttsServer ? ` · ${usage.tts} / ${config.dailyTtsLimit} ${t.voiceClips}` : ""}
              {` · ${config.provider}: ${config.model}`}
            </p>
          </>
        )}
      </div>
    </div>
  );
}
