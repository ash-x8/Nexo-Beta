"use client";
import { useMemo, useState } from "react";
import { MoreVertical, Pencil, Plus, Search, Trash2 } from "lucide-react";
import type { Dict } from "@/lib/i18n";
import type { Conversation } from "@/lib/types";
import BottomSheet from "./BottomSheet";

interface Props {
  t: Dict;
  convs: Conversation[];
  hasMore: boolean;
  onLoadMore: () => void;
  onSelect: (id: string) => void;
  onNewChat: () => void;
  onRename: (id: string, title: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}

export default function MobileChats({
  t,
  convs,
  hasMore,
  onLoadMore,
  onSelect,
  onNewChat,
  onRename,
  onDelete
}: Props) {
  const [query, setQuery] = useState("");
  const [sheetConv, setSheetConv] = useState<Conversation | null>(null);
  const [mode, setMode] = useState<"menu" | "rename" | "confirmDelete">("menu");
  const [renameVal, setRenameVal] = useState("");

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

  const openActions = (c: Conversation) => {
    setSheetConv(c);
    setMode("menu");
    setRenameVal(c.title);
  };

  return (
    <div className="nx-mob-scroll">
      <div className="nx-mob-head-row">
        <span className="nx-mob-brand">{t.chatsTitle}</span>
        <button type="button" className="nx-secondary-btn" onClick={onNewChat}>
          <Plus size={16} />
          <span>{t.newChat.split(" ")[0]}</span>
        </button>
      </div>

      <div className="nx-search-bar">
        <Search size={16} color="var(--text-muted)" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t.search}
          aria-label={t.search}
        />
      </div>

      {filtered.length === 0 ? (
        <div className="nx-setup-box" style={{ textAlign: "center" }}>
          <p style={{ margin: 0 }}>{query.trim() ? t.noMatch : t.noChats}</p>
        </div>
      ) : (
        grouped.map((g) => (
          <div key={g.label}>
            <div className="nx-group-label">{g.label}</div>
            <div className="nx-mob-list">
              {g.items.map((c) => (
                <div key={c.id} className="nx-mob-row" style={{ paddingRight: 4 }}>
                  <button
                    type="button"
                    className="nx-mob-row-main"
                    style={{ textAlign: "left", minHeight: 44, justifyContent: "center" }}
                    onClick={() => onSelect(c.id)}
                  >
                    <span className="nx-mob-row-title">{c.title}</span>
                    <span className="nx-mob-row-sub tabular">
                      {new Date(c.updatedAt).toLocaleDateString()}
                    </span>
                  </button>
                  <button
                    type="button"
                    className="nx-mob-row-more"
                    onClick={() => openActions(c)}
                    aria-label={t.actions}
                  >
                    <MoreVertical size={18} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        ))
      )}

      {hasMore && !query.trim() && (
        <div style={{ marginTop: 14, display: "flex", justifyContent: "center" }}>
          <button type="button" className="nx-secondary-btn" onClick={onLoadMore}>
            {t.loadMoreChats}
          </button>
        </div>
      )}

      <BottomSheet
        open={!!sheetConv}
        title={sheetConv?.title || t.actions}
        onClose={() => setSheetConv(null)}
      >
        {mode === "menu" && sheetConv && (
          <>
            <button
              type="button"
              className="nx-sheet-action"
              onClick={() => {
                setRenameVal(sheetConv.title);
                setMode("rename");
              }}
            >
              <Pencil size={18} />
              <span>{t.rename}</span>
            </button>
            <button
              type="button"
              className="nx-sheet-action danger"
              onClick={() => setMode("confirmDelete")}
            >
              <Trash2 size={18} />
              <span>{t.delete}</span>
            </button>
          </>
        )}

        {mode === "rename" && sheetConv && (
          <>
            <input
              className="nx-input"
              maxLength={120}
              value={renameVal}
              onChange={(e) => setRenameVal(e.target.value)}
              autoFocus
            />
            <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
              <button type="button" className="nx-secondary-btn" style={{ flex: 1 }} onClick={() => setSheetConv(null)}>
                {t.cancel}
              </button>
              <button
                type="button"
                className="nx-primary-btn"
                style={{ flex: 1 }}
                onClick={async () => {
                  await onRename(sheetConv.id, renameVal);
                  setSheetConv(null);
                }}
              >
                {t.renameSave}
              </button>
            </div>
          </>
        )}

        {mode === "confirmDelete" && sheetConv && (
          <>
            <p className="nx-field-hint" style={{ fontSize: 14 }}>{t.confirmDelete}</p>
            <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
              <button type="button" className="nx-secondary-btn" style={{ flex: 1 }} onClick={() => setSheetConv(null)}>
                {t.cancel}
              </button>
              <button
                type="button"
                className="nx-danger-btn"
                style={{ flex: 1, minHeight: 46 }}
                onClick={async () => {
                  await onDelete(sheetConv.id);
                  setSheetConv(null);
                }}
              >
                {t.delete}
              </button>
            </div>
          </>
        )}
      </BottomSheet>
    </div>
  );
}
