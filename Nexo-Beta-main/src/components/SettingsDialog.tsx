"use client";
import { useEffect, useState, type ReactNode } from "react";
import type { Dict } from "@/lib/i18n";
import type { Lang, MemoryItem, PublicConfig } from "@/lib/types";
import type { Prefs, Theme } from "@/lib/prefs";
import { looksSensitive, MEMORY_LIMIT } from "@/lib/memory";
import { fetchModels } from "@/lib/api";
import { useInstall } from "@/lib/useInstall";

interface Props {
  t: Dict;
  prefs: Prefs;
  config: PublicConfig | null;
  memory: MemoryItem[];
  getToken: () => Promise<string>;
  onChange: (p: Prefs) => void;
  onAddMemory: (text: string) => void;
  onUpdateMemory: (id: string, patch: { text?: string; enabled?: boolean }) => void;
  onDeleteMemory: (id: string) => void;
  onClose: () => void;
  variant?: "modal" | "screen";
  userName?: string;
  onLogout?: () => void;
}

export default function SettingsDialog({ t, prefs, config, memory, getToken, onChange, onAddMemory, onUpdateMemory, onDeleteMemory, onClose, variant = "modal", userName, onLogout }: Props) {
  const [usage, setUsage] = useState<{ requests: number; tts: number } | null>(null);
  const [models, setModels] = useState<string[]>([]);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [note, setNote] = useState("");
  const [warn, setWarn] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const install = useInstall();
  const set = <K extends keyof Prefs>(k: K, v: Prefs[K]) => onChange({ ...prefs, [k]: v });

  useEffect(() => {
    let alive = true;
    getToken().then(async (tok) => {
      const [u, m] = await Promise.all([
        fetch("/api/usage", { headers: { Authorization: `Bearer ${tok}` } }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
        fetchModels(tok).catch(() => ({ current: "", models: [] as string[] }))
      ]);
      if (!alive) return;
      if (u) setUsage(u);
      setModels(m.models);
    }).catch(() => {});
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", esc);
    return () => { alive = false; window.removeEventListener("keydown", esc); };
  }, [getToken, onClose]);

  useEffect(() => {
    const synth = typeof window !== "undefined" ? window.speechSynthesis : undefined;
    if (!synth) return;
    const load = () => setVoices(synth.getVoices());
    load();
    synth.addEventListener?.("voiceschanged", load);
    return () => synth.removeEventListener?.("voiceschanged", load);
  }, []);

  const addNote = () => {
    const v = note.trim().slice(0, 300);
    if (!v) return;
    if (memory.length >= MEMORY_LIMIT) { setWarn(t.memoryFull); return; }
    if (looksSensitive(v)) { setWarn(t.memorySensitive); return; }
    setWarn(null); onAddMemory(v); setNote("");
  };
  const saveEdit = () => {
    const v = draft.trim().slice(0, 300);
    if (!editing || !v) { setEditing(null); return; }
    if (looksSensitive(v)) { setWarn(t.memorySensitive); return; }
    setWarn(null); onUpdateMemory(editing, { text: v }); setEditing(null);
  };

  const wrap = (children: ReactNode) =>
    variant === "screen" ? (
      <div className="m-screen m-settings">
        <header className="m-title-row"><h1 className="m-title">{t.settings}</h1></header>
        {children}
      </div>
    ) : (
      <div className="modal-wrap" role="dialog" aria-modal="true" aria-label={t.settings} onClick={onClose}>
        <div className="modal glass" onClick={(e) => e.stopPropagation()}>
          <header><h2>{t.settings}</h2><button className="mini" onClick={onClose} aria-label={t.close}>✕</button></header>
          {children}
        </div>
      </div>
    );

  const showModelPicker = models.length > 1;
  const inList = !prefs.model || models.includes(prefs.model);

  return wrap(
    <>
      <h3>{t.general}</h3>
      <label>{t.uiLang}
        <select value={prefs.ui} onChange={(e) => set("ui", e.target.value as Lang)}>
          <option value="en">English</option><option value="si">සිංහල</option>
        </select>
      </label>
      <label>{t.theme}
        <select value={prefs.theme} onChange={(e) => set("theme", e.target.value as Theme)}>
          <option value="dark">{t.themeDark}</option><option value="light">{t.themeLight}</option><option value="system">{t.themeSystem}</option>
        </select>
      </label>
      <label className="check"><input type="checkbox" checked={prefs.avatarOn} onChange={(e) => set("avatarOn", e.target.checked)} />{t.showAvatar}</label>

      <h3>{t.aiSection}</h3>
      {config && <p className="hint">{t.infoProvider}: {config.provider} · {t.infoModel}: {config.model} · {t.infoSearch}: {config.searchEnabled ? t.on : t.off}</p>}
      {showModelPicker && (
        <label>{t.modelLabel}
          <select value={inList ? prefs.model : ""} onChange={(e) => set("model", e.target.value)}>
            <option value="">{t.modelDefault}{config ? ` (${config.model})` : ""}</option>
            {models.filter((m) => m !== config?.model).map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </label>
      )}
      {showModelPicker && <p className="hint">{t.modelHint}</p>}
      <label>{t.replyLang}
        <select value={prefs.reply} onChange={(e) => set("reply", e.target.value as Prefs["reply"])}>
          <option value="auto">{t.replyAuto}</option><option value="en">English</option><option value="si">සිංහල</option>
        </select>
      </label>

      <h3>{t.voiceSection}</h3>
      <label>{t.voiceLang}
        <select value={prefs.voiceLang} onChange={(e) => set("voiceLang", e.target.value as Prefs["voiceLang"])}>
          <option value="en-US">English</option><option value="si-LK">සිංහල</option>
        </select>
      </label>
      <label className="check"><input type="checkbox" checked={prefs.speak} onChange={(e) => set("speak", e.target.checked)} />{t.speakReplies}</label>
      {voices.length > 0 && (
        <label>{t.browserVoice}
          <select value={prefs.voiceName} onChange={(e) => set("voiceName", e.target.value)}>
            <option value="">{t.voiceDefault}</option>
            {voices.map((v) => <option key={v.voiceURI} value={v.voiceURI}>{v.name} ({v.lang})</option>)}
          </select>
        </label>
      )}
      <p className="hint">{t.micPrivacy}</p>

      <h3>{t.memory}</h3>
      <label className="check"><input type="checkbox" checked={prefs.memoryOn} onChange={(e) => set("memoryOn", e.target.checked)} />{t.memoryOn}</label>
      <p className="hint">{t.memoryHint}</p>
      <form className="memform" onSubmit={(e) => { e.preventDefault(); addNote(); }}>
        <input value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} placeholder={t.memoryPlaceholder} aria-label={t.memory} />
        <button type="submit" disabled={!note.trim()}>{t.addMemory}</button>
      </form>
      {warn && <p className="hint warn" role="alert">{warn}</p>}
      <ul className="memlist">
        {memory.map((m) => (
          <li key={m.id}>
            <input type="checkbox" checked={m.enabled !== false} aria-label={t.memoryOn} onChange={(e) => onUpdateMemory(m.id, { enabled: e.target.checked })} />
            {editing === m.id ? (
              <input autoFocus className="memedit" value={draft} maxLength={300} onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") saveEdit(); if (e.key === "Escape") setEditing(null); }} />
            ) : (
              <span className={m.enabled === false ? "off" : ""}>{m.text}</span>
            )}
            {editing === m.id
              ? <button className="mini" onClick={saveEdit}>{t.saveMemory}</button>
              : <button className="mini" onClick={() => { setEditing(m.id); setDraft(m.text); }}>{t.editMemory}</button>}
            <button className="mini" onClick={() => onDeleteMemory(m.id)} aria-label={t.delete}>🗑</button>
          </li>
        ))}
      </ul>

      {config && usage && (
        <>
          <h3>{t.usageToday}</h3>
          <p className="hint">
            {usage.requests} / {config.dailyLimit} {t.messages}
            {config.ttsServer ? ` · ${usage.tts} / ${config.dailyTtsLimit} ${t.voiceClips}` : ""}
          </p>
        </>
      )}

      {(install.canInstall || install.showIosHelp || install.standalone) && (
        <>
          <h3>{t.installSection}</h3>
          {install.standalone && <p className="hint">{t.installed}</p>}
          {install.canInstall && (
            <>
              <p className="hint">{t.installAndroid}</p>
              <button className="m-ghost" onClick={install.install}>{t.install}</button>
            </>
          )}
          {install.showIosHelp && <p className="hint">{t.installIos}</p>}
        </>
      )}

      <h3>{t.account}</h3>
      {userName && <p className="hint">{userName}</p>}
      {onLogout && <button className="m-ghost danger" onClick={onLogout}>{t.signOut}</button>}
      <h3>{t.about}</h3>
      <p className="hint">{t.aboutBody}</p>
      <p className="hint">{t.privacyBody}</p>
    </>
  );
}
