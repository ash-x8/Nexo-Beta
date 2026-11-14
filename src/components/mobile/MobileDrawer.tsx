"use client";
import { useEffect } from "react";
import { Compass, MessageSquare, Plus, Settings, X } from "lucide-react";
import type { UserProfile } from "@/lib/auth";
import type { Dict } from "@/lib/i18n";
import type { Conversation, ModelCatalogItem } from "@/lib/types";
import ModelSelector from "../ModelSelector";

interface Props {
  open: boolean;
  onClose: () => void;
  t: Dict;
  user: UserProfile;
  convs: Conversation[];
  activeId: string | null;
  modelsCatalog: ModelCatalogItem[];
  selectedModel: string;
  defaultModel: string;
  onSelectModel: (id: string) => void;
  onNewChat: () => void;
  onSelectConv: (id: string) => void;
  onOpenExplore: () => void;
  onOpenSettings: () => void;
}

export default function MobileDrawer({
  open,
  onClose,
  t,
  user,
  convs,
  activeId,
  modelsCatalog,
  selectedModel,
  defaultModel,
  onSelectModel,
  onNewChat,
  onSelectConv,
  onOpenExplore,
  onOpenSettings
}: Props) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="nx-mob-drawer-backdrop" role="dialog" aria-modal="true" aria-label={t.menu} onClick={onClose}>
      <nav className="nx-mob-drawer" onClick={(e) => e.stopPropagation()}>
        <div className="nx-mob-drawer-head">
          <span className="nx-mob-brand">NEXO AI</span>
          <button type="button" className="nx-mob-topbar-btn" onClick={onClose} aria-label={t.close}>
            <X size={20} />
          </button>
        </div>

        <div className="nx-mob-drawer-actions">
          <button
            type="button"
            className="nx-mob-drawer-item primary"
            onClick={() => {
              onClose();
              onNewChat();
            }}
          >
            <Plus size={18} />
            <span>{t.newChat}</span>
          </button>

          <button
            type="button"
            className="nx-mob-drawer-item"
            onClick={() => {
              onClose();
              onOpenExplore();
            }}
          >
            <Compass size={18} />
            <span>{t.navExplore}</span>
          </button>

          <button
            type="button"
            className="nx-mob-drawer-item"
            onClick={() => {
              onClose();
              onOpenSettings();
            }}
          >
            <Settings size={18} />
            <span>{t.settings}</span>
          </button>
        </div>

        {modelsCatalog.length > 0 && (
          <div className="nx-mob-drawer-section">
            <span className="nx-group-label" style={{ margin: "0 0 6px" }}>{t.modelLabel}</span>
            <ModelSelector
              t={t}
              selectedModel={selectedModel}
              defaultModel={defaultModel}
              catalog={modelsCatalog}
              onSelect={onSelectModel}
              compact
            />
          </div>
        )}

        <div className="nx-mob-drawer-scroll">
          <span className="nx-group-label" style={{ margin: "4px 2px 6px" }}>{t.recentChats}</span>
          {convs.length === 0 ? (
            <p className="nx-field-hint" style={{ padding: "8px 4px" }}>{t.noChats}</p>
          ) : (
            convs.slice(0, 15).map((c) => (
              <button
                key={c.id}
                type="button"
                className={`nx-mob-drawer-conv ${c.id === activeId ? "active" : ""}`}
                onClick={() => {
                  onClose();
                  onSelectConv(c.id);
                }}
              >
                <MessageSquare size={15} />
                <span>{c.title}</span>
              </button>
            ))
          )}
        </div>

        <div className="nx-mob-drawer-foot">
          <div className="nx-avatar-circle" style={{ width: 34, height: 34, fontSize: 13 }}>
            {user.photoURL ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={user.photoURL} alt={user.displayName || "User"} referrerPolicy="no-referrer" />
            ) : (
              <span>{(user.displayName || user.email || "U").slice(0, 1).toUpperCase()}</span>
            )}
          </div>
          <div className="nx-user-meta">
            <span className="nx-user-name">{user.displayName || "NEXO User"}</span>
            <span className="nx-user-email">{user.email || ""}</span>
          </div>
        </div>
      </nav>
    </div>
  );
}
