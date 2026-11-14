"use client";
import { useState } from "react";
import { Check, FolderKanban, MessageSquarePlus, Pencil, Plus, Trash2, X } from "lucide-react";
import type { Dict } from "@/lib/i18n";
import type { Conversation, ProjectItem } from "@/lib/types";

interface Props {
  t: Dict;
  projects: ProjectItem[];
  convs: Conversation[];
  activeProjectId: string | null;
  onSelectProject: (id: string | null) => void;
  onCreateProject: (input: { name: string; description?: string; instructions?: string; color?: string }) => Promise<ProjectItem | null>;
  onUpdateProject: (pid: string, patch: Partial<Pick<ProjectItem, "name" | "description" | "instructions" | "color">>) => Promise<void>;
  onDeleteProject: (pid: string) => Promise<void>;
  onStartChatInProject: (projectId: string) => void;
  onSelectConversation: (convId: string) => void;
}

const COLORS = ["#00d5c5", "#38bdf8", "#10b981", "#818cf8", "#f59e0b"];

export default function WorkspaceProjects({
  t,
  projects,
  convs,
  activeProjectId,
  onSelectProject,
  onCreateProject,
  onUpdateProject,
  onDeleteProject,
  onStartChatInProject,
  onSelectConversation
}: Props) {
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [instructions, setInstructions] = useState("");
  const [color, setColor] = useState(COLORS[0]);
  const [busy, setBusy] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const selectedProject = projects.find((p) => p.id === activeProjectId) || null;
  const scopedConvs = selectedProject ? convs.filter((c) => c.projectId === selectedProject.id) : [];

  const resetForm = () => {
    setName("");
    setDescription("");
    setInstructions("");
    setColor(COLORS[0]);
    setCreating(false);
    setEditingId(null);
  };

  const startEdit = (p: ProjectItem) => {
    setCreating(false);
    setEditingId(p.id);
    setName(p.name);
    setDescription(p.description || "");
    setInstructions(p.instructions || "");
    setColor(p.color || COLORS[0]);
  };

  const handleSave = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setBusy(true);
    try {
      if (editingId) {
        await onUpdateProject(editingId, {
          name: trimmed,
          description: description.trim(),
          instructions: instructions.trim(),
          color
        });
      } else {
        const created = await onCreateProject({
          name: trimmed,
          description: description.trim(),
          instructions: instructions.trim(),
          color
        });
        if (created?.id) onSelectProject(created.id);
      }
      resetForm();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="nx-view-shell">
      <div className="nx-view-head">
        <div>
          <span className="nx-view-eyebrow">
            <FolderKanban size={13} />
            <span>NEXO Workspaces</span>
          </span>
          <h1 className="nx-view-title">{t.viewProjects}</h1>
          <p className="nx-view-sub">
            Organize focused workspaces with dedicated instructions and grouped conversations.
          </p>
        </div>

        <button
          type="button"
          className="nx-primary-btn"
          style={{ minHeight: 40, padding: "8px 16px" }}
          onClick={() => {
            resetForm();
            setCreating(true);
          }}
        >
          <Plus size={15} />
          <span>New Project</span>
        </button>
      </div>

      {(creating || editingId) && (
        <div className="nx-studio-panel" style={{ gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <strong style={{ fontSize: 15 }}>{editingId ? "Edit Project" : "Create Workspace Project"}</strong>
            <button type="button" className="nx-tiny-btn" onClick={resetForm} aria-label={t.close}>
              <X size={16} />
            </button>
          </div>

          <div style={{ display: "grid", gap: 10 }}>
            <div>
              <span className="nx-studio-label">Project Name</span>
              <input
                className="nx-input"
                maxLength={80}
                value={name}
                placeholder="e.g. NEXO Backend Architecture"
                onChange={(e) => setName(e.target.value)}
              />
            </div>

            <div>
              <span className="nx-studio-label">Description</span>
              <input
                className="nx-input"
                maxLength={200}
                value={description}
                placeholder="Short summary of this workspace"
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>

            <div>
              <span className="nx-studio-label">Project Instructions (Scoped Context)</span>
              <textarea
                className="nx-textarea"
                rows={3}
                maxLength={800}
                value={instructions}
                placeholder="Custom instructions applied automatically to every chat inside this project…"
                onChange={(e) => setInstructions(e.target.value)}
              />
            </div>

            <div>
              <span className="nx-studio-label">Accent Tag</span>
              <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                {COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    aria-label={`Color ${c}`}
                    onClick={() => setColor(c)}
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: "50%",
                      background: c,
                      border: color === c ? "2px solid var(--text-primary)" : "2px solid transparent",
                      boxShadow: color === c ? "0 0 0 2px var(--bg-canvas)" : "none"
                    }}
                  />
                ))}
              </div>
            </div>
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
            <button type="button" className="nx-secondary-btn" onClick={resetForm} disabled={busy}>
              {t.cancel}
            </button>
            <button
              type="button"
              className="nx-primary-btn"
              style={{ minHeight: 38, padding: "7px 16px" }}
              disabled={busy || !name.trim()}
              onClick={handleSave}
            >
              <Check size={15} />
              <span>{busy ? t.loading : t.saveMemory}</span>
            </button>
          </div>
        </div>
      )}

      {projects.length === 0 && !creating ? (
        <div className="nx-studio-panel" style={{ textAlign: "center", padding: "32px 20px" }}>
          <p className="nx-field-hint" style={{ fontSize: 14 }}>
            No projects yet. Create a project to give NEXO v1 persistent context and group related chats together.
          </p>
        </div>
      ) : (
        <div className="nx-projects-grid">
          {projects.map((p) => {
            const count = convs.filter((c) => c.projectId === p.id).length;
            const isSelected = activeProjectId === p.id;
            const isConfirming = confirmDeleteId === p.id;

            return (
              <div
                key={p.id}
                className="nx-project-card"
                style={{
                  borderColor: isSelected ? p.color || "var(--accent-blue)" : undefined,
                  background: isSelected ? "var(--bg-elevated)" : undefined
                }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                  <button
                    type="button"
                    onClick={() => onSelectProject(isSelected ? null : p.id)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      minWidth: 0,
                      flex: 1,
                      textAlign: "left"
                    }}
                  >
                    <span
                      style={{
                        width: 10,
                        height: 10,
                        borderRadius: "50%",
                        background: p.color || COLORS[0],
                        flexShrink: 0
                      }}
                    />
                    <span style={{ fontWeight: 600, fontSize: 15, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {p.name}
                    </span>
                  </button>

                  <div style={{ display: "flex", gap: 4 }}>
                    <button
                      type="button"
                      className="nx-tiny-btn"
                      onClick={() => startEdit(p)}
                      aria-label={t.editMemory}
                    >
                      <Pencil size={13} />
                    </button>
                    {isConfirming ? (
                      <>
                        <button
                          type="button"
                          className="nx-tiny-btn danger"
                          onClick={async () => {
                            setConfirmDeleteId(null);
                            await onDeleteProject(p.id);
                          }}
                          aria-label={t.delete}
                        >
                          <Check size={13} />
                        </button>
                        <button
                          type="button"
                          className="nx-tiny-btn"
                          onClick={() => setConfirmDeleteId(null)}
                          aria-label={t.cancel}
                        >
                          <X size={13} />
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        className="nx-tiny-btn danger"
                        onClick={() => setConfirmDeleteId(p.id)}
                        aria-label={t.delete}
                      >
                        <Trash2 size={13} />
                      </button>
                    )}
                  </div>
                </div>

                {p.description && <p className="nx-field-hint">{p.description}</p>}
                {p.instructions && (
                  <p className="nx-field-hint" style={{ color: "var(--text-secondary)", fontSize: 12 }}>
                    {p.instructions.slice(0, 140)}
                    {p.instructions.length > 140 ? "…" : ""}
                  </p>
                )}

                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "auto", paddingTop: 6 }}>
                  <span className="nx-field-hint tabular">
                    {count} {count === 1 ? "chat" : "chats"}
                  </span>
                  <button
                    type="button"
                    className="nx-secondary-btn"
                    style={{ minHeight: 32, padding: "4px 10px", fontSize: 12.5 }}
                    onClick={() => onStartChatInProject(p.id)}
                  >
                    <MessageSquarePlus size={13} />
                    <span>Start chat in project</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {selectedProject && (
        <div className="nx-studio-panel">
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <strong style={{ fontSize: 14.5 }}>
              Conversations in {selectedProject.name} ({scopedConvs.length})
            </strong>
            <button
              type="button"
              className="nx-secondary-btn"
              style={{ minHeight: 32, padding: "4px 10px", fontSize: 12.5 }}
              onClick={() => onStartChatInProject(selectedProject.id)}
            >
              <Plus size={13} />
              <span>{t.newChat}</span>
            </button>
          </div>

          {scopedConvs.length === 0 ? (
            <p className="nx-field-hint">No conversations assigned to this project yet.</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {scopedConvs.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  className="nx-conv-item"
                  style={{ border: "1px solid var(--border-hairline)", justifyContent: "space-between" }}
                  onClick={() => onSelectConversation(c.id)}
                >
                  <span className="nx-conv-select">{c.title}</span>
                  <span className="nx-field-hint tabular" style={{ flexShrink: 0 }}>
                    {new Date(c.updatedAt).toLocaleDateString()}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
