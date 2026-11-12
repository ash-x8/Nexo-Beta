"use client";
import { useState } from "react";
import {
  Activity,
  ArrowLeft,
  Bookmark,
  ChevronRight,
  Cpu,
  Info,
  Sliders,
  User,
  Volume2
} from "lucide-react";
import type { UserProfile } from "@/lib/auth";
import type { Dict } from "@/lib/i18n";
import type { Prefs } from "@/lib/prefs";
import type { MemoryItem, PublicConfig } from "@/lib/types";
import type { MicPermission } from "@/lib/useSpeechRecognition";
import SettingsFields, { type SettingsSection } from "../SettingsFields";

interface Props {
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

export default function MobileSettings(props: Props) {
  const { t, user } = props;
  const [sub, setSub] = useState<SettingsSection | null>(null);

  const items: { id: SettingsSection; label: string; icon: JSX.Element }[] = [
    { id: "general", label: t.general, icon: <Sliders size={18} /> },
    { id: "ai", label: t.aiSection, icon: <Cpu size={18} /> },
    { id: "voice", label: t.voiceSection, icon: <Volume2 size={18} /> },
    { id: "memory", label: t.memory, icon: <Bookmark size={18} /> },
    { id: "usage", label: t.usageToday, icon: <Activity size={18} /> },
    { id: "account", label: t.account, icon: <User size={18} /> },
    { id: "about", label: t.about, icon: <Info size={18} /> }
  ];

  if (sub) {
    const activeTitle = items.find((i) => i.id === sub)?.label || t.settings;
    return (
      <div className="nx-mob-scroll">
        <div className="nx-mob-subpage-head">
          <button type="button" className="nx-mob-topbar-btn" onClick={() => setSub(null)} aria-label={t.back}>
            <ArrowLeft size={20} />
          </button>
          <h1>{activeTitle}</h1>
        </div>
        <SettingsFields section={sub} {...props} />
      </div>
    );
  }

  return (
    <div className="nx-mob-scroll">
      <div className="nx-mob-head-row">
        <span className="nx-mob-brand">{t.settings}</span>
      </div>

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

      <div className="nx-mob-list">
        {items.map((item) => (
          <button key={item.id} type="button" className="nx-mob-row" onClick={() => setSub(item.id)}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <span style={{ color: "var(--accent-blue)", display: "grid", placeItems: "center" }}>{item.icon}</span>
              <span className="nx-mob-row-title">{item.label}</span>
            </div>
            <ChevronRight size={18} color="var(--text-muted)" />
          </button>
        ))}
      </div>
    </div>
  );
}
