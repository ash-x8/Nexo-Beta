"use client";
import { Compass, Home, MessageSquare, Plus, Settings } from "lucide-react";
import type { Dict } from "@/lib/i18n";

export type MobileTab = "home" | "chats" | "explore" | "settings";

interface Props {
  tab: MobileTab;
  t: Dict;
  onSelectTab: (tab: MobileTab) => void;
  onOpenNewChat: () => void;
}

export default function BottomNav({ tab, t, onSelectTab, onOpenNewChat }: Props) {
  return (
    <nav className="nx-bottom-nav" aria-label="Main navigation">
      <button
        type="button"
        className={`nx-bnav-item ${tab === "home" ? "active" : ""}`}
        onClick={() => onSelectTab("home")}
      >
        <Home size={20} />
        <span>{t.navHome}</span>
      </button>

      <button
        type="button"
        className={`nx-bnav-item ${tab === "chats" ? "active" : ""}`}
        onClick={() => onSelectTab("chats")}
      >
        <MessageSquare size={20} />
        <span>{t.navChats}</span>
      </button>

      <button
        type="button"
        className="nx-bnav-item"
        onClick={onOpenNewChat}
        aria-label={t.newChat}
      >
        <span className="nx-bnav-center">
          <Plus size={22} />
        </span>
      </button>

      <button
        type="button"
        className={`nx-bnav-item ${tab === "explore" ? "active" : ""}`}
        onClick={() => onSelectTab("explore")}
      >
        <Compass size={20} />
        <span>{t.navExplore}</span>
      </button>

      <button
        type="button"
        className={`nx-bnav-item ${tab === "settings" ? "active" : ""}`}
        onClick={() => onSelectTab("settings")}
      >
        <Settings size={20} />
        <span>{t.navSettings}</span>
      </button>
    </nav>
  );
}
