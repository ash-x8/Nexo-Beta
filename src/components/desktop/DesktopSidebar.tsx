"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import {
  Bookmark,
  Check,
  FolderKanban,
  ImagePlus,
  Info,
  MessageSquare,
  Pencil,
  Pin,
  PinOff,
  Plus,
  Search,
  Settings,
  ShieldCheck,
  Trash2,
  X
} from "lucide-react";
import type { UserProfile } from "@/lib/auth";
import type { Dict } from "@/lib/i18n";
import type { Conversation, ProjectItem } from "@/lib/types";

export type WorkspaceView = "chat" | "image" | "projects" | "library";

interface Props {
  t: Dict;
  appName?: string;
  isAdmin?: boolean;
  historyEnabled?: boolean;
  user: UserProfile;
  collapsed: boolean;
  activeView: WorkspaceView;
  onChangeView: (v: WorkspaceView) => void;
  convs: Conversation[];
  projects: ProjectItem[];
  hasMore: boolean;
  activeId: string | null;
  onNewChat: () => void;
  onSelect: (id: string) => void;
  onLoadMore: () => void;
  onRename: (id: string, title: string) => Promise<void>;
  onTogglePin: (id: string, nextPinned: boolean) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onOpenSearchModal: () => void;
  onOpenSettings: () => void;
}

export default function DesktopSidebar({
  t,
  appName = "NEXO AI",
  isAdmin = false,
  historyEnabled = true,
  user,
  collapsed,
  activeView,
  onChangeView,
  convs,
  projects,
  hasMore,
  activeId,
  onNewChat,
  onSelect,
  onLoadMore,
  onRename,
  onTogglePin,
  onDelete,
  onOpenSearchModal,
  onOpenSettings
}: Props) {
  const [query, setQuery] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editVal, setEditVal] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const projectMap = useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return convs;
    return convs.filter((c) => c.title.toLowerCase().includes(q));
  }, [convs, query]);

  const grouped = useMemo(() => {
    const now = new Date();
    const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const startYesterday = startToday - 86_400_000;
    const startWeek = startToday - 7 * 86_400_000;

    const pinnedItems: Conversation[] = [];
    const buckets: { label: string; items: Conversation[] }[] = [
      { label: t.groupToday, items: [] },
      { label: t.groupYesterday, items: [] },
      { label: t.groupWeek, items: [] },
      { label: t.groupOlder, items: [] }
    ];

    for (const c of filtered) {
      if (c.pinned) {
        pinnedItems.push(c);
        continue;
      }
      if (c.updatedAt >= startToday) buckets[0].items.push(c);
      else if (c.updatedAt >= startYesterday) buckets[1].items.push(c);
      else if (c.updatedAt >= startWeek) buckets[2].items.push(c);
      else buckets[3].items.push(c);
    }

    const out = buckets.filter((b) => b.items.length > 0);
    if (pinnedItems.length > 0) {
      out.unshift({ label: "Pinned", items: pinnedItems });
    }
    return out;
  }, [filtered, t]);

  const saveEdit = async (id: string) => {
    const next = editVal.trim();
    setEditingId(null);
    if (next) await onRename(id, next);
  };

  return (
    <aside className={`nx-sidebar ${collapsed ? "collapsed" : ""}`} aria-hidden={collapsed}>
      <div className="nx-sidebar-top">
        <span className="nx-brand">{appName}</span>
        <button
          type="button"
          className="nx-secondary-btn"
          style={{ minHeight: 34, padding: "5px 10px" }}
          onClick={onNewChat}
          title={t.newChat}
        >
          <Plus size={15} />
          <span>{t.newChat.split(" ")[0]}</span>
        </button>
      </div>

      <nav className="nx-sidebar-nav" aria-label="Workspace Views">
        <button
          type="button"
          className={`nx-sidebar-nav-btn ${activeView === "chat" ? "active" : ""}`}
          onClick={() => onChangeView("chat")}
        >
          <MessageSquare size={15} />
          <span>{t.viewChat}</span>
        </button>
        <button
          type="button"
          className={`nx-sidebar-nav-btn ${activeView === "image" ? "active" : ""}`}
          onClick={() => onChangeView("image")}
        >
          <ImagePlus size={15} />
          <span>{t.viewImageStudio}</span>
        </button>
        <button
          type="button"
          className={`nx-sidebar-nav-btn ${activeView === "projects" ? "active" : ""}`}
          onClick={() => onChangeView("projects")}
        >
          <FolderKanban size={15} />
          <span>{t.viewProjects}</span>
        </button>
        <button
          type="button"
          className={`nx-sidebar-nav-btn ${activeView === "library" ? "active" : ""}`}
          onClick={() => onChangeView("library")}
        >
          <Bookmark size={15} />
          <span>{t.viewLibrary}</span>
        </button>
      </nav>

      {isAdmin && (
        <div style={{ padding: "0 14px 10px" }}>
          <Link
            href="/admin"
            className="nx-secondary-btn"
            style={{
              width: "100%",
              justifyContent: "flex-start",
              minHeight: 34,
              borderColor: "rgba(0, 213, 197, 0.3)",
              color: "var(--accent-blue)",
              textDecoration: "none"
            }}
          >
            <ShieldCheck size={15} />
            <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{t.adminCenter}</span>
          </Link>
        </div>
      )}

      <div className="nx-sidebar-search">
        <Search size={14} color="var(--text-muted)" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t.search}
          aria-label={t.search}
        />
        <button
          type="button"
          className="nx-tiny-btn"
          style={{ minWidth: 26, minHeight: 24, fontSize: 10.5 }}
          onClick={onOpenSearchModal}
          title="Global Smart Search (Ctrl+K)"
          aria-label="Global Smart Search"
        >
          ⌘K
        </button>
      </div>

      <div className="nx-sidebar-list">
        {!historyEnabled ? (
          <p style={{ padding: "18px 10px", fontSize: 13, color: "var(--text-muted)", margin: 0 }}>
            {t.featureDisabledNote}
          </p>
        ) : filtered.length === 0 ? (
          <p style={{ padding: "18px 10px", fontSize: 13, color: "var(--text-muted)", margin: 0 }}>
            {query.trim() ? t.noMatch : t.noChats}
          </p>
        ) : (
          grouped.map((g) => (
            <div key={g.label}>
              <div className="nx-group-label" style={{ paddingLeft: 6 }}>
                {g.label}
              </div>
              {g.items.map((c) => {
                const isEditing = editingId === c.id;
                const isConfirming = confirmDeleteId === c.id;
                const proj = c.projectId ? projectMap.get(c.projectId) : undefined;

                if (isEditing) {
                  return (
                    <div key={c.id} className="nx-conv-item active">
                      <input
                        className="nx-input"
                        style={{ minHeight: 30, padding: "4px 8px", fontSize: 13 }}
                        value={editVal}
                        maxLength={120}
                        autoFocus
                        onChange={(e) => setEditVal(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") saveEdit(c.id);
                          if (e.key === "Escape") setEditingId(null);
                        }}
                      />
                      <button type="button" className="nx-tiny-btn" onClick={() => saveEdit(c.id)} aria-label={t.renameSave}>
                        <Check size={14} />
                      </button>
                      <button type="button" className="nx-tiny-btn" onClick={() => setEditingId(null)} aria-label={t.cancel}>
                        <X size={14} />
                      </button>
                    </div>
                  );
                }

                if (isConfirming) {
                  return (
                    <div key={c.id} className="nx-conv-item" style={{ background: "var(--status-err-bg)" }}>
                      <span className="nx-conv-select" style={{ color: "var(--status-err)", fontSize: 12.5 }}>
                        {t.delete}?
                      </span>
                      <button
                        type="button"
                        className="nx-tiny-btn danger"
                        onClick={async () => {
                          setConfirmDeleteId(null);
                          await onDelete(c.id);
                        }}
                        aria-label={t.delete}
                      >
                        <Check size={14} />
                      </button>
                      <button
                        type="button"
                        className="nx-tiny-btn"
                        onClick={() => setConfirmDeleteId(null)}
                        aria-label={t.cancel}
                      >
                        <X size={14} />
                      </button>
                    </div>
                  );
                }

                return (
                  <div key={c.id} className={`nx-conv-item ${activeId === c.id ? "active" : ""}`}>
                    <button type="button" className="nx-conv-select" onClick={() => onSelect(c.id)}>
                      {c.pinned && <Pin size={11} style={{ marginRight: 5, display: "inline", verticalAlign: "middle" }} />}
                      {c.title}
                      {proj && (
                        <span
                          style={{
                            marginLeft: 6,
                            fontSize: 10.5,
                            color: proj.color || "var(--accent-blue)",
                            opacity: 0.9
                          }}
                        >
                          · {proj.name}
                        </span>
                      )}
                    </button>
                    <div className="nx-conv-actions">
                      <button
                        type="button"
                        className="nx-tiny-btn"
                        onClick={() => void onTogglePin(c.id, !c.pinned)}
                        aria-label={c.pinned ? t.unpinChat : t.pinChat}
                        title={c.pinned ? t.unpinChat : t.pinChat}
                      >
                        {c.pinned ? <PinOff size={12} /> : <Pin size={12} />}
                      </button>
                      <button
                        type="button"
                        className="nx-tiny-btn"
                        onClick={() => {
                          setConfirmDeleteId(null);
                          setEditingId(c.id);
                          setEditVal(c.title);
                        }}
                        aria-label={t.rename}
                      >
                        <Pencil size={12} />
                      </button>
                      <button
                        type="button"
                        className="nx-tiny-btn danger"
                        onClick={() => {
                          setEditingId(null);
                          setConfirmDeleteId(c.id);
                        }}
                        aria-label={t.delete}
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          ))
        )}

        {hasMore && !query.trim() && (
          <button
            type="button"
            className="nx-secondary-btn"
            style={{ marginTop: 8, width: "100%", minHeight: 34 }}
            onClick={onLoadMore}
          >
            {t.loadMoreChats}
          </button>
        )}
      </div>

      <div className="nx-sidebar-foot">
        <button type="button" className="nx-user-pill" onClick={onOpenSettings}>
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
            <span className="nx-user-email">{user.email || ""}</span>
          </div>
        </button>

        <Link href="/about" className="nx-tiny-btn" aria-label={t.about} title={t.about}>
          <Info size={15} />
        </Link>

        <button type="button" className="nx-tiny-btn" onClick={onOpenSettings} aria-label={t.settings}>
          <Settings size={16} />
        </button>
      </div>
    </aside>
  );
}
