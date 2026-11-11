"use client";
import { useMemo, useState } from "react";
import type { Conversation } from "@/lib/types";
import type { Dict } from "@/lib/i18n";
import { Icon } from "./mobile/icons";

interface Props {
  t: Dict;
  items: Conversation[];
  activeId: string | null;
  open: boolean;
  userName: string;
  onClose: () => void;
  onNew: () => void;
  onSelect: (id: string) => void;
  onRename: (id: string, title: string) => void;
  onDelete: (id: string) => void;
  onSettings: () => void;
  onLogout: () => void;
}

export default function Sidebar(p: Props) {
  const { t } = p;
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const list = useMemo(
    () => p.items.filter((c) => c.title.toLowerCase().includes(q.toLowerCase())),
    [p.items, q]
  );

  const commit = () => {
    if (editing && draft.trim()) p.onRename(editing, draft.trim().slice(0, 80));
    setEditing(null);
  };

  return (
    <>
      <div className={`scrim ${p.open ? "show" : ""}`} onClick={p.onClose} />
      <nav className={`sidebar glass ${p.open ? "open" : ""}`} aria-label="Conversations">
        <div className="brand">
          <span className="logo">N</span>
          <span>NEXO AI</span>
        </div>

        <button
          className="newchat"
          onClick={() => {
            p.onNew();
            p.onClose();
          }}
        >
          <span style={{ display: "inline-flex", alignItems: "center", gap: "8px" }}>
            <Icon name="plus" size={16} />
            <span>{t.newChat}</span>
          </span>
        </button>

        <div style={{ position: "relative", margin: "10px 0" }}>
          <input
            className="search"
            style={{ width: "100%", paddingLeft: "32px", margin: 0 }}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t.search}
            aria-label={t.search}
          />
          <span style={{ position: "absolute", left: "10px", top: "50%", transform: "translateY(-50%)", color: "var(--muted)", pointerEvents: "none" }}>
            <Icon name="search" size={14} />
          </span>
        </div>

        <ul className="convs">
          {list.length === 0 && <li className="empty">{t.noChats}</li>}
          {list.map((c) => (
            <li key={c.id} className={c.id === p.activeId ? "active" : ""}>
              {editing === c.id ? (
                <input
                  autoFocus
                  className="rename"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onBlur={commit}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") commit();
                    if (e.key === "Escape") setEditing(null);
                  }}
                />
              ) : deletingId === c.id ? (
                <div style={{ display: "flex", alignItems: "center", gap: "4px", width: "100%", padding: "4px 8px" }}>
                  <span style={{ flex: 1, fontSize: "12px", color: "var(--danger)" }}>Delete?</span>
                  <button
                    className="mini"
                    style={{ color: "var(--danger)" }}
                    onClick={() => {
                      p.onDelete(c.id);
                      setDeletingId(null);
                    }}
                    title="Confirm delete"
                  >
                    <Icon name="trash" size={14} />
                  </button>
                  <button
                    className="mini"
                    onClick={() => setDeletingId(null)}
                    title="Cancel"
                  >
                    <Icon name="close" size={14} />
                  </button>
                </div>
              ) : (
                <>
                  <button
                    className="title"
                    onClick={() => {
                      p.onSelect(c.id);
                      p.onClose();
                    }}
                    title={c.title}
                  >
                    {c.title}
                  </button>
                  <button
                    className="mini"
                    aria-label={t.rename}
                    title={t.rename}
                    onClick={() => {
                      setEditing(c.id);
                      setDraft(c.title);
                    }}
                  >
                    <Icon name="edit" size={14} />
                  </button>
                  <button
                    className="mini"
                    aria-label={t.delete}
                    title={t.delete}
                    onClick={() => setDeletingId(c.id)}
                  >
                    <Icon name="trash" size={14} />
                  </button>
                </>
              )}
            </li>
          ))}
        </ul>

        <div className="foot">
          <span style={{ display: "flex", alignItems: "center", gap: "6px", flex: 1, minWidth: 0 }}>
            <Icon name="user" size={16} />
            <span className="user" title={p.userName}>
              {p.userName}
            </span>
          </span>
          <button className="mini" onClick={p.onSettings} aria-label={t.settings} title={t.settings}>
            <Icon name="settings" size={16} />
          </button>
          <button className="mini" onClick={p.onLogout} aria-label={t.signOut} title={t.signOut}>
            <Icon name="logout" size={16} />
          </button>
        </div>
      </nav>
    </>
  );
}
