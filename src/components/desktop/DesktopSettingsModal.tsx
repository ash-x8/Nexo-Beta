"use client";
import { useEffect, useState } from "react";
import { Activity, Bookmark, Cpu, Info, Sliders, User, Volume2, X } from "lucide-react";
import type { UserProfile } from "@/lib/auth";
import type { Dict } from "@/lib/i18n";
import type { Prefs } from "@/lib/prefs";
import type { MemoryItem, PublicConfig } from "@/lib/types";
import type { MicPermission } from "@/lib/useSpeechRecognition";
import SettingsFields, { type SettingsSection } from "../SettingsFields";

interface Props {
  open: boolean;
  onClose: () => void;
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

export default function DesktopSettingsModal({ open, onClose, t, ...rest }: Props) {
  const [section, setSection] = useState<SettingsSection>("general");

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const tabs: { id: SettingsSection; label: string; icon: JSX.Element }[] = [
    { id: "general", label: t.general, icon: <Sliders size={16} /> },
    { id: "ai", label: t.aiSection, icon: <Cpu size={16} /> },
    { id: "voice", label: t.voiceSection, icon: <Volume2 size={16} /> },
    { id: "memory", label: t.memory, icon: <Bookmark size={16} /> },
    { id: "usage", label: t.usageToday, icon: <Activity size={16} /> },
    { id: "account", label: t.account, icon: <User size={16} /> },
    { id: "about", label: t.about, icon: <Info size={16} /> }
  ];

  return (
    <div className="nx-modal-backdrop" role="dialog" aria-modal="true" aria-label={t.settings} onClick={onClose}>
      <div className="nx-modal" onClick={(e) => e.stopPropagation()}>
        <div className="nx-modal-head">
          <h2>{t.settings}</h2>
          <button type="button" className="nx-tiny-btn" onClick={onClose} aria-label={t.close}>
            <X size={18} />
          </button>
        </div>

        <div className="nx-modal-body">
          <nav className="nx-modal-nav" aria-label={t.settings}>
            {tabs.map((item) => (
              <button
                key={item.id}
                type="button"
                className={section === item.id ? "active" : ""}
                onClick={() => setSection(item.id)}
              >
                {item.icon}
                <span>{item.label}</span>
              </button>
            ))}
          </nav>

          <div className="nx-modal-pane">
            <SettingsFields section={section} t={t} {...rest} />
          </div>
        </div>
      </div>
    </div>
  );
}
