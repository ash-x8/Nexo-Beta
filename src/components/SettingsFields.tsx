"use client";
import { useEffect, useState } from "react";
import { Check, Pencil, Plus, Trash2 } from "lucide-react";
import { fetchModels, fetchUsage } from "@/lib/api";
import type { UserProfile } from "@/lib/auth";
import type { Dict } from "@/lib/i18n";
import { firebaseMessage } from "@/lib/errors";
import { looksSensitive, MEMORY_LIMIT } from "@/lib/memory";
import type { Prefs, ResponseStyle, Theme } from "@/lib/prefs";
import { addMemory, deleteMemory, updateMemory } from "@/lib/store";
import type { MemoryItem, PublicConfig, UsageInfo } from "@/lib/types";
import { useInstall } from "@/lib/useInstall";
import type { MicPermission } from "@/lib/useSpeechRecognition";
import InstallButton from "./InstallButton";

export type SettingsSection = "general" | "ai" | "voice" | "memory" | "usage" | "account" | "about";

interface Props {
  section: SettingsSection;
  t: Dict;
  user: UserProfile;
  getToken: () => Promise<string>;
  config: PublicConfig | null;
  prefs: Prefs;
  setPref: <K extends keyof Prefs>(key: K, value: Prefs[K]) => void;
  memory: MemoryItem[];
  micPermission: MicPermission;
  onLogout: () => Promise<void>;
}

export default function SettingsFields({
  section,
  t,
  user,
  getToken,
  config,
  prefs,
  setPref,
  memory,
  micPermission,
  onLogout
}: Props) {
  const [models, setModels] = useState<string[]>([]);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [usage, setUsage] = useState<UsageInfo | null>(null);
  const [usageErr, setUsageErr] = useState<string | null>(null);

  const [memInput, setMemInput] = useState("");
  const [memErr, setMemErr] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [editVal, setEditVal] = useState("");

  const { standalone } = useInstall();

  useEffect(() => {
    if (section !== "ai") return;
    let active = true;
    getToken()
      .then((tok) => fetchModels(tok))
      .then((r) => {
        if (active && r.models.length) setModels(r.models);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [section, getToken]);

  useEffect(() => {
    if (section !== "voice" || typeof window === "undefined" || !window.speechSynthesis) return;
    const load = () => setVoices(window.speechSynthesis.getVoices());
    load();
    window.speechSynthesis.addEventListener("voiceschanged", load);
    return () => window.speechSynthesis.removeEventListener("voiceschanged", load);
  }, [section]);

  useEffect(() => {
    if (section !== "usage") return;
    let active = true;
    setUsageErr(null);
    getToken()
      .then((tok) => fetchUsage(tok))
      .then((u) => {
        if (active) setUsage(u);
      })
      .catch((e: Error) => {
        if (active) setUsageErr(e.message);
      });
    return () => {
      active = false;
    };
  }, [section, getToken]);

  const handleAddMem = async () => {
    const val = memInput.trim();
    if (!val) return;
    setMemErr(null);
    if (memory.length >= MEMORY_LIMIT) {
      setMemErr(t.memoryFull);
      return;
    }
    if (looksSensitive(val)) {
      setMemErr(t.memorySensitive);
      return;
    }
    try {
      await addMemory(user.uid, val);
      setMemInput("");
    } catch (e) {
      setMemErr(firebaseMessage(e));
    }
  };

  const handleSaveEdit = async (id: string) => {
    const val = editVal.trim();
    if (!val) return;
    if (looksSensitive(val)) {
      setMemErr(t.memorySensitive);
      return;
    }
    setMemErr(null);
    try {
      await updateMemory(user.uid, id, { text: val });
      setEditId(null);
    } catch (e) {
      setMemErr(firebaseMessage(e));
    }
  };

  if (section === "general") {
    return (
      <div className="nx-mob-settings-group">
        <div className="nx-field-card">
          <div className="nx-field-row">
            <span className="nx-field-label">{t.uiLang}</span>
            <div className="nx-seg">
              <button type="button" className={prefs.ui === "en" ? "active" : ""} onClick={() => setPref("ui", "en")}>
                English
              </button>
              <button type="button" className={prefs.ui === "si" ? "active" : ""} onClick={() => setPref("ui", "si")}>
                සිංහල
              </button>
            </div>
          </div>
        </div>

        <div className="nx-field-card">
          <div className="nx-field-row">
            <span className="nx-field-label">{t.theme}</span>
            <div className="nx-seg">
              {(["dark", "light", "system"] as Theme[]).map((th) => (
                <button key={th} type="button" className={prefs.theme === th ? "active" : ""} onClick={() => setPref("theme", th)}>
                  {th === "dark" ? t.themeDark : th === "light" ? t.themeLight : t.themeSystem}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="nx-field-card">
          <div className="nx-field-row">
            <span className="nx-field-label">{t.showAvatar}</span>
            <button
              type="button"
              role="switch"
              aria-checked={prefs.avatarOn}
              className={`nx-switch ${prefs.avatarOn ? "on" : ""}`}
              onClick={() => setPref("avatarOn", !prefs.avatarOn)}
            >
              <span />
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (section === "ai") {
    return (
      <div className="nx-mob-settings-group">
        <div className="nx-field-card">
          <span className="nx-field-label">{t.replyLang}</span>
          <div className="nx-seg">
            {(["auto", "en", "si"] as const).map((rl) => (
              <button key={rl} type="button" className={prefs.reply === rl ? "active" : ""} onClick={() => setPref("reply", rl)}>
                {rl === "auto" ? t.replyAuto : rl === "en" ? "English" : "සිංහල"}
              </button>
            ))}
          </div>
        </div>

        <div className="nx-field-card">
          <span className="nx-field-label">{t.responseStyleLabel}</span>
          <div className="nx-seg">
            {(["balanced", "concise", "detailed"] as ResponseStyle[]).map((st) => (
              <button key={st} type="button" className={prefs.responseStyle === st ? "active" : ""} onClick={() => setPref("responseStyle", st)}>
                {st === "balanced" ? t.styleBalanced : st === "concise" ? t.styleConcise : t.styleDetailed}
              </button>
            ))}
          </div>
        </div>

        <div className="nx-field-card">
          <span className="nx-field-label">{t.modelLabel}</span>
          <select
            className="nx-select"
            value={prefs.model}
            onChange={(e) => setPref("model", e.target.value)}
            aria-label={t.modelLabel}
          >
            <option value="">
              {t.modelDefault} ({config?.model || "default"})
            </option>
            {models.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
          <p className="nx-field-hint">{t.modelHint}</p>
        </div>

        <div className="nx-field-card">
          <span className="nx-field-label">{t.nicknameLabel}</span>
          <input
            className="nx-input"
            maxLength={60}
            value={prefs.nickname}
            placeholder={t.nicknamePlaceholder}
            onChange={(e) => setPref("nickname", e.target.value)}
          />
          <span className="nx-field-label" style={{ marginTop: 4 }}>
            {t.customInstructionsLabel}
          </span>
          <textarea
            className="nx-textarea"
            maxLength={400}
            value={prefs.customInstructions}
            placeholder={t.customInstructionsPlaceholder}
            onChange={(e) => setPref("customInstructions", e.target.value)}
          />
        </div>
      </div>
    );
  }

  if (section === "voice") {
    return (
      <div className="nx-mob-settings-group">
        <div className="nx-field-card">
          <div className="nx-field-row">
            <span className="nx-field-label">{t.voiceLang}</span>
            <div className="nx-seg">
              <button type="button" className={prefs.voiceLang === "en-US" ? "active" : ""} onClick={() => setPref("voiceLang", "en-US")}>
                English
              </button>
              <button type="button" className={prefs.voiceLang === "si-LK" ? "active" : ""} onClick={() => setPref("voiceLang", "si-LK")}>
                සිංහල
              </button>
            </div>
          </div>
        </div>

        <div className="nx-field-card">
          <div className="nx-field-row">
            <span className="nx-field-label">{t.speakReplies}</span>
            <button
              type="button"
              role="switch"
              aria-checked={prefs.speak}
              className={`nx-switch ${prefs.speak ? "on" : ""}`}
              onClick={() => setPref("speak", !prefs.speak)}
            >
              <span />
            </button>
          </div>
        </div>

        <div className="nx-field-card">
          <span className="nx-field-label">{t.browserVoice}</span>
          <select
            className="nx-select"
            value={prefs.voiceName}
            onChange={(e) => setPref("voiceName", e.target.value)}
            aria-label={t.browserVoice}
          >
            <option value="">{t.voiceDefault}</option>
            {voices.map((v) => (
              <option key={v.voiceURI} value={v.voiceURI}>
                {v.name} ({v.lang})
              </option>
            ))}
          </select>
        </div>

        <div className="nx-field-card">
          <p className="nx-field-hint">{t.micPrivacy}</p>
          {micPermission === "denied" && <p className="nx-field-hint" style={{ color: "var(--status-err)" }}>{t.micDenied}</p>}
          {micPermission === "unsupported" && <p className="nx-field-hint">{t.micUnsupported}</p>}
        </div>
      </div>
    );
  }

  if (section === "memory") {
    return (
      <div className="nx-mob-settings-group">
        <div className="nx-field-card">
          <div className="nx-field-row">
            <span className="nx-field-label">{t.memoryOn}</span>
            <button
              type="button"
              role="switch"
              aria-checked={prefs.memoryOn}
              className={`nx-switch ${prefs.memoryOn ? "on" : ""}`}
              onClick={() => setPref("memoryOn", !prefs.memoryOn)}
            >
              <span />
            </button>
          </div>
          <p className="nx-field-hint">{t.memoryHint}</p>
        </div>

        <div className="nx-field-card">
          <div style={{ display: "flex", gap: 8 }}>
            <input
              className="nx-input"
              maxLength={300}
              value={memInput}
              placeholder={t.memoryPlaceholder}
              onChange={(e) => setMemInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleAddMem();
              }}
            />
            <button type="button" className="nx-secondary-btn" onClick={handleAddMem}>
              <Plus size={15} />
              <span>{t.addMemory}</span>
            </button>
          </div>
          {memErr && <p className="nx-field-hint" style={{ color: "var(--status-err)" }}>{memErr}</p>}
        </div>

        {memory.map((item) => {
          const isEditing = editId === item.id;
          return (
            <div key={item.id} className="nx-field-card">
              {isEditing ? (
                <div style={{ display: "flex", gap: 8 }}>
                  <input
                    className="nx-input"
                    maxLength={300}
                    value={editVal}
                    onChange={(e) => setEditVal(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleSaveEdit(item.id);
                    }}
                  />
                  <button type="button" className="nx-secondary-btn" onClick={() => handleSaveEdit(item.id)}>
                    <Check size={15} />
                    <span>{t.saveMemory}</span>
                  </button>
                </div>
              ) : (
                <div className="nx-field-row">
                  <button
                    type="button"
                    style={{ flex: 1, textAlign: "left", fontSize: 13.5, opacity: item.enabled === false ? 0.48 : 1 }}
                    onClick={() => {
                      updateMemory(user.uid, item.id, { enabled: item.enabled === false }).catch((e) =>
                        setMemErr(firebaseMessage(e))
                      );
                    }}
                  >
                    {item.text}
                  </button>
                  <div style={{ display: "flex", gap: 4 }}>
                    <button
                      type="button"
                      className="nx-tiny-btn"
                      onClick={() => {
                        setEditId(item.id);
                        setEditVal(item.text);
                      }}
                      aria-label={t.editMemory}
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      type="button"
                      className="nx-tiny-btn danger"
                      onClick={() => {
                        deleteMemory(user.uid, item.id).catch((e) => setMemErr(firebaseMessage(e)));
                      }}
                      aria-label={t.delete}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  }

  if (section === "usage") {
    const reqUsed = usage?.requests ?? 0;
    const reqLimit = usage?.dailyLimit ?? config?.dailyLimit ?? 100;
    const ttsUsed = usage?.tts ?? 0;
    const ttsLimit = usage?.dailyTtsLimit ?? config?.dailyTtsLimit ?? 40;

    return (
      <div className="nx-mob-settings-group">
        {usageErr && (
          <div className="nx-banner error">
            <span>{usageErr}</span>
          </div>
        )}
        <div className="nx-field-card">
          <div className="nx-field-row">
            <span className="nx-field-label">{t.messages}</span>
            <span className="tabular" style={{ fontSize: 13.5, color: "var(--text-secondary)" }}>
              {reqUsed} / {reqLimit} · {Math.max(0, reqLimit - reqUsed)} {t.usageRemaining}
            </span>
          </div>
          <div className="nx-meter">
            <div className="nx-meter-fill" style={{ width: `${Math.min(100, (reqUsed / Math.max(1, reqLimit)) * 100)}%` }} />
          </div>
        </div>

        <div className="nx-field-card">
          <div className="nx-field-row">
            <span className="nx-field-label">{t.voiceClips}</span>
            <span className="tabular" style={{ fontSize: 13.5, color: "var(--text-secondary)" }}>
              {ttsUsed} / {ttsLimit} · {Math.max(0, ttsLimit - ttsUsed)} {t.usageRemaining}
            </span>
          </div>
          <div className="nx-meter">
            <div className="nx-meter-fill" style={{ width: `${Math.min(100, (ttsUsed / Math.max(1, ttsLimit)) * 100)}%` }} />
          </div>
        </div>

        {usage?.day && (
          <p className="nx-field-hint tabular">
            UTC: {usage.day} · {config?.perMinute ?? 10}/min · {config?.maxInputChars ?? 8000} chars/msg
          </p>
        )}
      </div>
    );
  }

  if (section === "account") {
    return (
      <div className="nx-mob-settings-group">
        <div className="nx-mob-profile-card">
          <div className="nx-avatar-circle">
            {user.photoURL ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={user.photoURL} alt={user.displayName || "User"} referrerPolicy="no-referrer" />
            ) : (
              <span>{(user.displayName || user.email || "U").slice(0, 1).toUpperCase()}</span>
            )}
          </div>
          <div className="nx-user-meta">
            <span className="nx-user-name">{user.displayName || "NEXO User"}</span>
            <span className="nx-user-email">{user.email || user.uid}</span>
          </div>
        </div>

        <div className="nx-field-card">
          <span className="nx-field-label">{t.installSection}</span>
          {standalone ? (
            <p className="nx-field-hint">{t.installed}</p>
          ) : (
            <>
              <p className="nx-field-hint">{t.installAndroid}</p>
              <InstallButton label={t.install} iosPrompt={t.installIos} closeLabel={t.close} compact />
            </>
          )}
        </div>

        <button type="button" className="nx-danger-btn" onClick={onLogout}>
          {t.signOut}
        </button>
      </div>
    );
  }

  return (
    <div className="nx-mob-settings-group">
      <div className="nx-field-card">
        <span className="nx-field-label">{t.about}</span>
        <p className="nx-field-hint">{t.aboutBody}</p>
      </div>
      <div className="nx-field-card">
        <span className="nx-field-label">{t.privacyTitle}</span>
        <p className="nx-field-hint">{t.privacyBody}</p>
      </div>
      <div className="nx-field-card">
        <span className="nx-field-label">{t.termsTitle}</span>
        <p className="nx-field-hint">{t.termsBody}</p>
      </div>
    </div>
  );
}
