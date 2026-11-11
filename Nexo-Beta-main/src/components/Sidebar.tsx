"use client";
import { useMemo, useState } from "react";
import type { Conversation } from "@/lib/types";
import type { Dict } from "@/lib/i18n";

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
  const list = useMemo(() => p.items.filter((c) => c.title.toLowerCase().includes(q.toLowerCase())), [p.items, q]);

  const commit = () => {
    if (editing && draft.trim()) p.onRename(editing, draft.trim().slice(0, 80));
    setEditing(null);
  };

  return (
    <>
      <div className={`scrim ${p.open ? "show" : ""}`} onClick={p.onClose} />
      <nav className={`sidebar glass ${p.open ? "open" : ""}`} aria-label="Conversations">
        <div className="brand"><span className="logo">N</span><span>NEXO AI</span></div>
        <button className="newchat" onClick={() => { p.onNew(); p.onClose(); }}>＋ {t.newChat}</button>
        <input className="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t.search} aria-label={t.search} />
        <ul className="convs">
          {list.length === 0 && <li className="empty">{t.noChats}</li>}
          {list.map((c) => (
            <li key={c.id} className={c.id === p.activeId ? "active" : ""}>
              {editing === c.id ? (
                <input autoFocus className="rename" value={draft} onChange={(e) => setDraft(e.target.value)} onBlur={commit}
                  onKeyDown={(e) => { if (e.key === "Enter") commit(); if (e.key === "Escape") setEditing(null); }} />
              ) : (
                <>
                  <button className="title" onClick={() => { p.onSelect(c.id); p.onClose(); }} title={c.title}>{c.title}</button>
                  <button className="mini" aria-label={t.rename} title={t.rename} onClick={() => { setEditing(c.id); setDraft(c.title); }}>✎</button>
                  <button className="mini" aria-label={t.delete} title={t.delete} onClick={() => { if (confirm(t.confirmDelete)) p.onDelete(c.id); }}>🗑</button>
                </>
              )}
            </li>
          ))}
        </ul>
        <div className="foot">
          <span className="user" title={p.userName}>{p.userName}</span>
          <button className="mini" onClick={p.onSettings} aria-label={t.settings} title={t.settings}>⚙</button>
          <button className="mini" onClick={p.onLogout} aria-label={t.signOut} title={t.signOut}>⎋</button>
        </div>
      </nav>
    </>
  );
}
