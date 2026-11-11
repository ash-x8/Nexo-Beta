"use client";
import type { Dict } from "@/lib/i18n";
import { Icon, type IconName } from "./icons";

export type Tab = "home" | "chats" | "chat" | "explore" | "settings";

interface Props { t: Dict; tab: Tab; onTab: (t: Tab) => void }

export default function BottomNav({ t, tab, onTab }: Props) {
  const item = (id: Tab, icon: IconName, label: string) => (
    <button key={id} className="m-nav-item" aria-current={tab === id ? "page" : undefined} onClick={() => onTab(id)}>
      <Icon name={icon} />
      <span>{label}</span>
    </button>
  );
  return (
    <nav className="m-nav" aria-label="Main">
      {item("home", "home", t.navHome)}
      {item("chats", "chats", t.navChats)}
      <button className="m-nav-core" aria-label={t.navAssistant} onClick={() => onTab("chat")}>
        <Icon name="nexo" size={26} />
      </button>
      {item("explore", "explore", t.navExplore)}
      {item("settings", "settings", t.navSettings)}
    </nav>
  );
}
