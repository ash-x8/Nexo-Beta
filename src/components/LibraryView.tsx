"use client";
import { useMemo, useState } from "react";
import { Bookmark, Check, Copy, Download, Image as ImageIcon, MessageSquare, Search, Trash2, X } from "lucide-react";
import type { Dict } from "@/lib/i18n";
import type { LibraryItem } from "@/lib/types";

interface Props {
  t: Dict;
  items: LibraryItem[];
  onDelete: (id: string) => Promise<void>;
  onOpenInChat: (promptText: string, conversationId?: string) => void;
}

type LibraryTab = "all" | "image" | "response" | "prompt";

function downloadDataUrl(item: LibraryItem) {
  if (!item.dataUrl) return;
  const a = document.createElement("a");
  a.href = item.dataUrl;
  a.download = `nexo-library-${item.id.slice(0, 8)}.png`;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export default function LibraryView({ t, items, onDelete, onOpenInChat }: Props) {
  const [tab, setTab] = useState<LibraryTab>("all");
  const [query, setQuery] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<LibraryItem | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((item) => {
      if (tab !== "all" && item.kind !== tab) return false;
      if (!q) return true;
      return (
        item.title.toLowerCase().includes(q) ||
        (item.content || "").toLowerCase().includes(q)
      );
    });
  }, [items, query, tab]);

  const handleCopy = async (item: LibraryItem) => {
    const text = item.content || item.title;
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(item.id);
      setTimeout(() => setCopiedId((prev) => (prev === item.id ? null : prev)), 1500);
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="nx-view-shell">
      <div className="nx-view-head">
        <div>
          <span className="nx-view-eyebrow">
            <Bookmark size={13} />
            <span>NEXO Archive</span>
          </span>
          <h1 className="nx-view-title">{t.viewLibrary}</h1>
          <p className="nx-view-sub">
            Saved generated images, key responses, and reusable prompts synced to your account.
          </p>
        </div>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", justifyContent: "space-between" }}>
        <div className="nx-seg" role="tablist" aria-label="Library filter">
          {(
            [
              ["all", "All"],
              ["image", "Images"],
              ["response", "Responses"],
              ["prompt", "Prompts"]
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              className={tab === id ? "active" : ""}
              onClick={() => setTab(id)}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="nx-sidebar-search" style={{ margin: 0, minWidth: 220, flex: "0 1 280px" }}>
          <Search size={14} color="var(--text-muted)" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t.search}
            aria-label={t.search}
          />
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="nx-studio-panel" style={{ textAlign: "center", padding: "32px 20px" }}>
          <p className="nx-field-hint" style={{ fontSize: 14 }}>
            {items.length === 0
              ? "Your library is empty. Save generated images from Image Studio or bookmark helpful responses in chat."
              : t.noMatch}
          </p>
        </div>
      ) : (
        <div className="nx-studio-gallery">
          {filtered.map((item) => (
            <article key={item.id} className="nx-studio-result-card">
              {item.kind === "image" && item.dataUrl ? (
                <button
                  type="button"
                  className="nx-image-thumb"
                  onClick={() => setLightbox(item)}
                  aria-label="Preview saved image"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={item.dataUrl} alt={item.title} />
                </button>
              ) : (
                <div style={{ padding: "12px 12px 4px", display: "flex", alignItems: "center", gap: 6, color: "var(--accent-blue)", fontSize: 12, fontWeight: 600 }}>
                  {item.kind === "image" ? <ImageIcon size={13} /> : <Bookmark size={13} />}
                  <span style={{ textTransform: "uppercase" }}>{item.kind}</span>
                </div>
              )}

              <div className="nx-studio-result-meta">
                <p style={{ margin: "0 0 4px", fontSize: 13.5, fontWeight: 600, color: "var(--text-primary)" }}>
                  {item.title}
                </p>
                {item.content && item.kind !== "image" && (
                  <p className="nx-studio-result-prompt" style={{ WebkitLineClamp: 4 }}>
                    {item.content}
                  </p>
                )}
                <p className="nx-field-hint tabular" style={{ marginBottom: 8 }}>
                  {new Date(item.createdAt).toLocaleDateString()}
                  {item.aspectRatio ? ` · ${item.aspectRatio}` : ""}
                </p>

                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {item.dataUrl && (
                    <button
                      type="button"
                      className="nx-msg-action-btn"
                      onClick={() => downloadDataUrl(item)}
                    >
                      <Download size={13} />
                      <span>{t.download}</span>
                    </button>
                  )}

                  {(item.content || item.title) && (
                    <button
                      type="button"
                      className="nx-msg-action-btn"
                      onClick={() => handleCopy(item)}
                    >
                      {copiedId === item.id ? <Check size={13} /> : <Copy size={13} />}
                      <span>{copiedId === item.id ? t.copied : t.copy}</span>
                    </button>
                  )}

                  <button
                    type="button"
                    className="nx-msg-action-btn"
                    onClick={() => onOpenInChat(item.content || item.title, item.conversationId)}
                  >
                    <MessageSquare size={13} />
                    <span>{t.openInChat}</span>
                  </button>

                  <button
                    type="button"
                    className="nx-msg-action-btn"
                    style={{ color: "var(--status-err)" }}
                    onClick={() => void onDelete(item.id)}
                    aria-label={t.delete}
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      {lightbox?.dataUrl && (
        <div
          className="nx-lightbox-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label={lightbox.title}
          onClick={() => setLightbox(null)}
        >
          <div className="nx-lightbox-card" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              className="nx-tiny-btn nx-lightbox-close"
              onClick={() => setLightbox(null)}
              aria-label={t.close}
            >
              <X size={18} />
            </button>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={lightbox.dataUrl} alt={lightbox.title} className="nx-lightbox-img" />
            <div className="nx-lightbox-foot">
              <p className="nx-field-hint" style={{ color: "var(--text-secondary)" }}>
                {lightbox.title}
              </p>
              <button
                type="button"
                className="nx-secondary-btn"
                style={{ minHeight: 34, padding: "5px 12px" }}
                onClick={() => downloadDataUrl(lightbox)}
              >
                <Download size={14} />
                <span>{t.download}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
