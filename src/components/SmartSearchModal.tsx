"use client";
import { useEffect, useMemo, useState } from "react";
import { Bookmark, FolderKanban, MessageSquare, Pin, Search, X } from "lucide-react";
import type { Dict } from "@/lib/i18n";
import type { Conversation, LibraryItem, ProjectItem } from "@/lib/types";

interface Props {
  open: boolean;
  onClose: () => void;
  t: Dict;
  convs: Conversation[];
  projects: ProjectItem[];
  library: LibraryItem[];
  onSelectConv: (id: string) => void;
  onSelectProject: (id: string) => void;
  onSelectLibraryItem: (item: LibraryItem) => void;
}

export default function SmartSearchModal({
  open,
  onClose,
  t,
  convs,
  projects,
  library,
  onSelectConv,
  onSelectProject,
  onSelectLibraryItem
}: Props) {
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matchedConvs = convs
      .filter((c) => !q || c.title.toLowerCase().includes(q) || (c.summary || "").toLowerCase().includes(q))
      .slice(0, 12);
    const matchedProjects = projects
      .filter(
        (p) =>
          !q ||
          p.name.toLowerCase().includes(q) ||
          p.description.toLowerCase().includes(q) ||
          p.instructions.toLowerCase().includes(q)
      )
      .slice(0, 6);
    const matchedLibrary = library
      .filter((l) => !q || l.title.toLowerCase().includes(q) || (l.content || "").toLowerCase().includes(q))
      .slice(0, 8);
    return { matchedConvs, matchedProjects, matchedLibrary };
  }, [convs, library, projects, query]);

  if (!open) return null;

  const total =
    results.matchedConvs.length + results.matchedProjects.length + results.matchedLibrary.length;

  return (
    <div className="nx-modal-backdrop" role="dialog" aria-modal="true" aria-label={t.search} onClick={onClose}>
      <div
        className="nx-modal"
        style={{ width: "min(620px, 100%)", height: "auto", maxHeight: "min(560px, 84dvh)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="nx-modal-head" style={{ gap: 10 }}>
          <Search size={17} color="var(--accent-blue)" />
          <input
            className="nx-input"
            style={{ border: 0, background: "transparent", padding: 0, minHeight: 34 }}
            autoFocus
            value={query}
            placeholder={`${t.search} — chats, projects, library…`}
            onChange={(e) => setQuery(e.target.value)}
          />
          <button type="button" className="nx-tiny-btn" onClick={onClose} aria-label={t.close}>
            <X size={18} />
          </button>
        </div>

        <div className="nx-modal-pane" style={{ padding: 14, display: "flex", flexDirection: "column", gap: 14 }}>
          {total === 0 ? (
            <p className="nx-field-hint" style={{ textAlign: "center", padding: "24px 0" }}>
              {t.noMatch}
            </p>
          ) : (
            <>
              {results.matchedConvs.length > 0 && (
                <div>
                  <div className="nx-group-label" style={{ marginTop: 0 }}>
                    {t.recentChats}
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    {results.matchedConvs.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        className="nx-conv-item"
                        style={{ justifyContent: "space-between" }}
                        onClick={() => {
                          onSelectConv(c.id);
                          onClose();
                        }}
                      >
                        <span style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                          {c.pinned ? <Pin size={13} color="var(--accent-blue)" /> : <MessageSquare size={14} />}
                          <span className="nx-conv-select">{c.title}</span>
                        </span>
                        <span className="nx-field-hint tabular" style={{ flexShrink: 0 }}>
                          {new Date(c.updatedAt).toLocaleDateString()}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {results.matchedProjects.length > 0 && (
                <div>
                  <div className="nx-group-label">{t.viewProjects}</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    {results.matchedProjects.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        className="nx-conv-item"
                        style={{ justifyContent: "space-between" }}
                        onClick={() => {
                          onSelectProject(p.id);
                          onClose();
                        }}
                      >
                        <span style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                          <FolderKanban size={14} color={p.color || "var(--accent-blue)"} />
                          <span className="nx-conv-select">{p.name}</span>
                        </span>
                        <span className="nx-field-hint">{p.description || "Project"}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {results.matchedLibrary.length > 0 && (
                <div>
                  <div className="nx-group-label">{t.viewLibrary}</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    {results.matchedLibrary.map((l) => (
                      <button
                        key={l.id}
                        type="button"
                        className="nx-conv-item"
                        style={{ justifyContent: "space-between" }}
                        onClick={() => {
                          onSelectLibraryItem(l);
                          onClose();
                        }}
                      >
                        <span style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                          <Bookmark size={14} color="var(--accent-blue)" />
                          <span className="nx-conv-select">{l.title}</span>
                        </span>
                        <span className="nx-field-hint" style={{ textTransform: "uppercase" }}>
                          {l.kind}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
