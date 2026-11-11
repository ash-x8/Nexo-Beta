"use client";
import { useMemo, useState } from "react";
import type { Dict } from "@/lib/i18n";
import type { Conversation, Lang } from "@/lib/types";
import BottomSheet from "./BottomSheet";
import { Icon } from "./icons";

interface Props {
  t: Dict;
  lang: Lang;
  items: Conversation[];
  onOpen: (id: string) => void;
  onNew: () => void;
  onRename: (id: string, title: string) => void;
  onDelete: (id: string) => void;
}

type Mode = "menu" | "rename" | "delete";

export default function ChatsScreen({ t, lang, items, onOpen, onNew, onRename, onDelete }: Props) {
  const [q, setQ] = useState("");
  const [target, setTarget] = useState<Conversation | null>(null);
  const [mode, setMode] = useState<Mode>("menu");
  const [draft, setDraft] = useState("");

  const list = useMemo(() => items.filter((c) => c.title.toLowerCase().includes(q.trim().toLowerCase())), [items, q]);
  const when = (ts: number) => {
    const d = new Date(ts);
    const loc = lang === "si" ? "si-LK" : undefined;
    return d.toDateString() === new Date().toDateString()
      ? d.toLocaleTimeString(loc, { hour: "numeric", minute: "2-digit" })
      : d.toLocaleDateString(loc, { month: "short", day: "numeric" });
  };
  const close = () => { setTarget(null); setMode("menu"); };
  const saveRename = () => {
    const v = draft.trim().slice(0, 80);
    if (target && v) onRename(target.id, v);
    close();
  };

  return (
    <div className="m-screen">
      <header className="m-title-row">
        <h1 className="m-title">{t.chatsTitle}</h1>
        <button className="m-icon-btn" onClick={onNew} aria-label={t.newChat}><Icon name="plus" /></button>
      </header>
      <label className="m-search">
        <Icon name="search" size={18} />
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t.search} aria-label={t.search} />
      </label>

      {items.length === 0 && <p className="m-empty-note">{t.noChats}</p>}
      {items.length > 0 && list.length === 0 && <p className="m-empty-note">{t.noMatch}</p>}
      <ul className="m-list">
        {list.map((c) => (
          <li key={c.id} className="m-conv">
            <button className="m-conv-main" onClick={() => onOpen(c.id)}>
              <span className="m-row-text">{c.title}</span>
              <time className="m-meta">{when(c.updatedAt)}</time>
            </button>
            <button className="m-icon-btn" aria-label={t.actions} onClick={() => { setTarget(c); setMode("menu"); setDraft(c.title); }}><Icon name="more" /></button>
          </li>
        ))}
      </ul>

      <BottomSheet open={!!target} title={target?.title ?? t.actions} onClose={close}>
        {mode === "menu" && (
          <ul className="m-actions">
            <li><button onClick={() => setMode("rename")}>{t.rename}</button></li>
            <li><button className="danger" onClick={() => setMode("delete")}>{t.delete}</button></li>
            <li><button onClick={close}>{t.cancel}</button></li>
          </ul>
        )}
        {mode === "rename" && (
          <form className="m-sheet-form" onSubmit={(e) => { e.preventDefault(); saveRename(); }}>
            <input autoFocus value={draft} maxLength={80} onChange={(e) => setDraft(e.target.value)} aria-label={t.rename} />
            <button type="submit" className="m-primary" disabled={!draft.trim()}>{t.renameSave}</button>
          </form>
        )}
        {mode === "delete" && (
          <div className="m-sheet-form">
            <p className="m-empty-note">{t.confirmDelete}</p>
            <button className="m-primary danger" onClick={() => { if (target) onDelete(target.id); close(); }}>{t.delete}</button>
            <button className="m-ghost" onClick={close}>{t.cancel}</button>
          </div>
        )}
      </BottomSheet>
    </div>
  );
}
