"use client";
import { useMemo, useState } from "react";
import { Check, Pencil, Plus, Search, Settings, Trash2, X } from "lucide-react";
import type { UserProfile } from "@/lib/auth";
import type { Dict } from "@/lib/i18n";
import type { Conversation } from "@/lib/types";

interface Props {
  t: Dict;
  user: UserProfile;
  collapsed: boolean;
  convs: Conversation[];
  hasMore: boolean;
  activeId: string | null;
  onNewChat: () => void;
  onSelect: (id: string) => void;
  onLoadMore: () => void;
  onRename: (id: string, title: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onOpenSettings: () => void;
}

export default function DesktopSidebar({
  t,
  user,
  collapsed,
  convs,
  hasMore,
  activeId,
  onNewChat,
  onSelect,
  onLoadMore,
  onRename,
  onDelete,
  onOpenSettings
}: Props) {
  const [query, setQuery] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editVal, setEditVal] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

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

    const buckets: { label: string; items: Conversation[] }[] = [
      { label: t.groupToday, items: [] },
      { label: t.groupYesterday, items: [] },
      { label: t.groupWeek, items: [] },
      { label: t.groupOlder, items: [] }
    ];

    for (const c of filtered) {
      if (c.updatedAt >= startToday) buckets[0].items.push(c);
      else if (c.updatedAt >= startYesterday) buckets[1].items.push(c);
      else if (c.updatedAt >= startWeek) buckets[2].items.push(c);
      else buckets[3].items.push(c);
    }

    return buckets.filter((b) => b.items.length > 0);
  }, [filtered, t]);

  const saveEdit = async (id: string) => {
    const next = editVal.trim();
    setEditingId(null);
    if (next) await onRename(id, next);
  };

  return (
    <aside className={`nx-sidebar ${collapsed ? "collapsed" : ""}`} aria-hidden={collapsed}>
      <div className="nx-sidebar-top">
        <span className="nx-brand">NEXO AI</span>
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

      <div className="nx-sidebar-search">
        <Search size={14} color="var(--text-muted)" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t.search}
          aria-label={t.search}
        />
      </div>

      <div className="nx-sidebar-list">
        {filtered.length === 0 ? (
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
                      {c.title}
                    </button>
                    <div className="nx-conv-actions">
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
                        <Pencil size={13} />
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
                        <Trash2 size={13} />
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

        <button type="button" className="nx-tiny-btn" onClick={onOpenSettings} aria-label={t.settings}>
          <Settings size={16} />
        </button>
      </div>
    </aside>
  );
}
