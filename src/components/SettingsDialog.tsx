"use client";
import { useEffect, useState, type ReactNode } from "react";
import type { Dict } from "@/lib/i18n";
import type { Lang, MemoryItem, PublicConfig } from "@/lib/types";
import type { Prefs, Theme } from "@/lib/prefs";
import { looksSensitive, MEMORY_LIMIT } from "@/lib/memory";
import { fetchModels } from "@/lib/api";
import { useInstall } from "@/lib/useInstall";
import { Icon } from "./mobile/icons";

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

type SettingsTab = "general" | "ai" | "voice" | "memory" | "account";

export default function SettingsDialog({
  t,
  prefs,
  config,
  memory,
  getToken,
  onChange,
  onAddMemory,
  onUpdateMemory,
  onDeleteMemory,
  onClose,
  variant = "modal",
  userName,
  onLogout
}: Props) {
  const [activeTab, setActiveTab] = useState<SettingsTab>("general");
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
    getToken()
      .then(async (tok) => {
        const [u, m] = await Promise.all([
          fetch("/api/usage", { headers: { Authorization: `Bearer ${tok}` } })
            .then((r) => (r.ok ? r.json() : null))
            .catch(() => null),
          fetchModels(tok).catch(() => ({ current: "", models: [] as string[] }))
        ]);
        if (!alive) return;
        if (u) setUsage(u);
        setModels(m.models);
      })
      .catch(() => {});
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", esc);
    return () => {
      alive = false;
      window.removeEventListener("keydown", esc);
    };
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
    if (memory.length >= MEMORY_LIMIT) {
      setWarn(t.memoryFull);
      return;
    }
    if (looksSensitive(v)) {
      setWarn(t.memorySensitive);
      return;
    }
    setWarn(null);
    onAddMemory(v);
    setNote("");
  };

  const saveEdit = () => {
    const v = draft.trim().slice(0, 300);
    if (!editing || !v) {
      setEditing(null);
      return;
    }
    if (looksSensitive(v)) {
      setWarn(t.memorySensitive);
      return;
    }
    setWarn(null);
    onUpdateMemory(editing, { text: v });
    setEditing(null);
  };

  const showModelPicker = models.length > 1;
  const inList = !prefs.model || models.includes(prefs.model);

  const tabButtons = (
    <div
      style={{
        display: "flex",
        gap: "6px",
        overflowX: "auto",
        paddingBottom: "10px",
        marginBottom: "14px",
        borderBottom: "1px solid var(--line)"
      }}
    >
      {[
        { id: "general", label: t.general, icon: "sliders" as const },
        { id: "ai", label: t.aiSection, icon: "cpu" as const },
        { id: "voice", label: t.voiceSection, icon: "mic" as const },
        { id: "memory", label: t.memory, icon: "shield" as const },
        { id: "account", label: t.account, icon: "user" as const }
      ].map((tab) => (
        <button
          key={tab.id}
          onClick={() => setActiveTab(tab.id as SettingsTab)}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "6px",
            padding: "6px 12px",
            borderRadius: "999px",
            fontSize: "12px",
            fontWeight: activeTab === tab.id ? 600 : 400,
            background: activeTab === tab.id ? "rgba(74, 168, 255, 0.2)" : "rgba(255, 255, 255, 0.05)",
            border: activeTab === tab.id ? "1px solid var(--cyan)" : "1px solid var(--line)",
            color: activeTab === tab.id ? "var(--cyan)" : "var(--muted)",
            whiteSpace: "nowrap"
          }}
        >
          <Icon name={tab.icon} size={13} />
          <span>{tab.label}</span>
        </button>
      ))}
    </div>
  );

  const content = (
    <>
      {tabButtons}

      {activeTab === "general" && (
        <div>
          <h3>{t.general}</h3>
          <label>
            {t.uiLang}
            <select value={prefs.ui} onChange={(e) => set("ui", e.target.value as Lang)}>
              <option value="en">English (US)</option>
              <option value="si">සිංහල (Sinhala)</option>
            </select>
          </label>
          <label>
            {t.theme}
            <select value={prefs.theme} onChange={(e) => set("theme", e.target.value as Theme)}>
              <option value="dark">{t.themeDark}</option>
              <option value="light">{t.themeLight}</option>
              <option value="system">{t.themeSystem}</option>
            </select>
          </label>
          <label className="check" style={{ marginTop: "14px" }}>
            <input type="checkbox" checked={prefs.avatarOn} onChange={(e) => set("avatarOn", e.target.checked)} />
            <span>{t.showAvatar}</span>
          </label>
        </div>
      )}

      {activeTab === "ai" && (
        <div>
          <h3>{t.aiSection}</h3>
          {config && (
            <div
              style={{
                padding: "10px 12px",
                background: "rgba(255, 255, 255, 0.04)",
                borderRadius: "12px",
                border: "1px solid var(--line)",
                marginBottom: "12px",
                fontSize: "13px"
              }}
            >
              <div><strong>{t.infoProvider}:</strong> {config.provider}</div>
              <div><strong>{t.infoModel}:</strong> {config.model}</div>
              <div><strong>{t.infoSearch}:</strong> {config.searchEnabled ? t.on : t.off}</div>
            </div>
          )}
          {showModelPicker && (
            <label>
              {t.modelLabel}
              <select value={inList ? prefs.model : ""} onChange={(e) => set("model", e.target.value)}>
                <option value="">{t.modelDefault}{config ? ` (${config.model})` : ""}</option>
                {models.filter((m) => m !== config?.model).map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </label>
          )}
          {showModelPicker && <p className="hint">{t.modelHint}</p>}
          <label>
            {t.replyLang}
            <select value={prefs.reply} onChange={(e) => set("reply", e.target.value as Prefs["reply"])}>
              <option value="auto">{t.replyAuto}</option>
              <option value="en">English</option>
              <option value="si">සිංහල</option>
            </select>
          </label>
        </div>
      )}

      {activeTab === "voice" && (
        <div>
          <h3>{t.voiceSection}</h3>
          <label>
            {t.voiceLang}
            <select value={prefs.voiceLang} onChange={(e) => set("voiceLang", e.target.value as Prefs["voiceLang"])}>
              <option value="en-US">English (US)</option>
              <option value="si-LK">සිංහල (Sri Lanka)</option>
            </select>
          </label>
          <label className="check" style={{ marginTop: "12px" }}>
            <input type="checkbox" checked={prefs.speak} onChange={(e) => set("speak", e.target.checked)} />
            <span>{t.speakReplies}</span>
          </label>
          {voices.length > 0 && (
            <label style={{ marginTop: "12px" }}>
              {t.browserVoice}
              <select value={prefs.voiceName} onChange={(e) => set("voiceName", e.target.value)}>
                <option value="">{t.voiceDefault}</option>
                {voices.map((v) => (
                  <option key={v.voiceURI} value={v.voiceURI}>{v.name} ({v.lang})</option>
                ))}
              </select>
            </label>
          )}
          <p className="hint" style={{ marginTop: "14px", lineHeight: "1.4" }}>{t.micPrivacy}</p>
        </div>
      )}

      {activeTab === "memory" && (
        <div>
          <h3>{t.memory}</h3>
          <label className="check">
            <input type="checkbox" checked={prefs.memoryOn} onChange={(e) => set("memoryOn", e.target.checked)} />
            <span>{t.memoryOn}</span>
          </label>
          <p className="hint">{t.memoryHint}</p>
          <form className="memform" onSubmit={(e) => { e.preventDefault(); addNote(); }}>
            <input
              value={note}
              maxLength={300}
              onChange={(e) => setNote(e.target.value)}
              placeholder={t.memoryPlaceholder}
              aria-label={t.memory}
            />
            <button type="submit" disabled={!note.trim()}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
                <Icon name="plus" size={14} />
                <span>{t.addMemory}</span>
              </span>
            </button>
          </form>
          {warn && <p className="hint warn" role="alert">{warn}</p>}
          <ul className="memlist" style={{ marginTop: "12px" }}>
            {memory.map((m) => (
              <li key={m.id}>
                <input
                  type="checkbox"
                  checked={m.enabled !== false}
                  aria-label={t.memoryOn}
                  onChange={(e) => onUpdateMemory(m.id, { enabled: e.target.checked })}
                />
                {editing === m.id ? (
                  <input
                    autoFocus
                    className="memedit"
                    value={draft}
                    maxLength={300}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") saveEdit();
                      if (e.key === "Escape") setEditing(null);
                    }}
                  />
                ) : (
                  <span className={m.enabled === false ? "off" : ""}>{m.text}</span>
                )}
                {editing === m.id ? (
                  <button className="mini" onClick={saveEdit} title={t.saveMemory}>
                    <Icon name="check" size={13} />
                  </button>
                ) : (
                  <button
                    className="mini"
                    onClick={() => { setEditing(m.id); setDraft(m.text); }}
                    title={t.editMemory}
                  >
                    <Icon name="edit" size={13} />
                  </button>
                )}
                <button className="mini" onClick={() => onDeleteMemory(m.id)} aria-label={t.delete}>
                  <Icon name="trash" size={13} />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {activeTab === "account" && (
        <div>
          <h3>{t.account}</h3>
          <div
            style={{
              padding: "12px",
              background: "rgba(255, 255, 255, 0.04)",
              borderRadius: "14px",
              border: "1px solid var(--line)",
              marginBottom: "16px"
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "8px", fontWeight: 600 }}>
              <Icon name="user" size={16} />
              <span>{userName || "NEXO User"}</span>
            </div>
            <p className="hint" style={{ margin: "4px 0 0" }}>
              Sessions and history are securely isolated to your account.
            </p>
          </div>

          {config && usage && (
            <div style={{ marginBottom: "16px" }}>
              <h4 style={{ fontSize: "13px", color: "var(--cyan)", margin: "0 0 6px" }}>{t.usageToday}</h4>
              <p className="hint">
                {usage.requests} / {config.dailyLimit} {t.messages}
                {config.ttsServer ? ` · ${usage.tts} / ${config.dailyTtsLimit} ${t.voiceClips}` : ""}
              </p>
            </div>
          )}

          {(install.canInstall || install.showIosHelp || install.standalone) && (
            <div style={{ marginBottom: "16px" }}>
              <h4 style={{ fontSize: "13px", color: "var(--cyan)", margin: "0 0 6px" }}>{t.installSection}</h4>
              {install.standalone && <p className="hint">{t.installed}</p>}
              {install.canInstall && (
                <>
                  <p className="hint">{t.installAndroid}</p>
                  <button className="m-ghost" onClick={install.install}>{t.install}</button>
                </>
              )}
              {install.showIosHelp && <p className="hint">{t.installIos}</p>}
            </div>
          )}

          {onLogout && (
            <button
              className="m-ghost danger"
              onClick={onLogout}
              style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: "6px" }}
            >
              <Icon name="logout" size={16} />
              <span>{t.signOut}</span>
            </button>
          )}

          <div style={{ marginTop: "20px", paddingTop: "14px", borderTop: "1px solid var(--line)" }}>
            <h4 style={{ fontSize: "13px", color: "var(--muted)", margin: "0 0 4px" }}>{t.about}</h4>
            <p className="hint">{t.aboutBody}</p>
            <p className="hint">{t.privacyBody}</p>
          </div>
        </div>
      )}
    </>
  );

  return variant === "screen" ? (
    <div className="m-screen m-settings">
      <header className="m-title-row">
        <h1 className="m-title">{t.settings}</h1>
      </header>
      {content}
    </div>
  ) : (
    <div className="modal-wrap" role="dialog" aria-modal="true" aria-label={t.settings} onClick={onClose}>
      <div className="modal glass" onClick={(e) => e.stopPropagation()}>
        <header>
          <h2>{t.settings}</h2>
          <button className="mini" onClick={onClose} aria-label={t.close}>
            <Icon name="close" size={16} />
          </button>
        </header>
        {content}
      </div>
    </div>
  );
}
