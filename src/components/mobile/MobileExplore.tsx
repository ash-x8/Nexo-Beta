"use client";
import type { Dict } from "@/lib/i18n";
import { capabilitiesFor, promptsFor } from "@/lib/prompts";
import type {
  Conversation,
  GeneratedImageArtifact,
  Lang,
  LibraryItem,
  ProjectItem,
  PublicConfig
} from "@/lib/types";
import ImageStudio from "../ImageStudio";
import LibraryView from "../LibraryView";
import WorkspaceProjects from "../WorkspaceProjects";

export type StudioSubTab = "prompts" | "image" | "projects" | "library";

interface Props {
  t: Dict;
  lang: Lang;
  config: PublicConfig | null;
  getToken: () => Promise<string>;
  imageEnabled: boolean;
  studioTab: StudioSubTab;
  onChangeStudioTab: (tab: StudioSubTab) => void;
  projects: ProjectItem[];
  convs: Conversation[];
  activeProjectId: string | null;
  onSelectProject: (id: string | null) => void;
  onCreateProject: (input: { name: string; description?: string; instructions?: string; color?: string }) => Promise<ProjectItem | null>;
  onUpdateProject: (pid: string, patch: Partial<Pick<ProjectItem, "name" | "description" | "instructions" | "color">>) => Promise<void>;
  onDeleteProject: (pid: string) => Promise<void>;
  onStartChatInProject: (projectId: string) => void;
  onSelectConversation: (convId: string) => void;
  library: LibraryItem[];
  onSaveImageToLibrary: (img: GeneratedImageArtifact) => Promise<unknown>;
  onDeleteLibraryItem: (id: string) => Promise<void>;
  onOpenLibraryInChat: (promptText: string, conversationId?: string) => void;
  onPickPrompt: (prompt: string) => void;
}

export default function MobileExplore({
  t,
  lang,
  config,
  getToken,
  imageEnabled,
  studioTab,
  onChangeStudioTab,
  projects,
  convs,
  activeProjectId,
  onSelectProject,
  onCreateProject,
  onUpdateProject,
  onDeleteProject,
  onStartChatInProject,
  onSelectConversation,
  library,
  onSaveImageToLibrary,
  onDeleteLibraryItem,
  onOpenLibraryInChat,
  onPickPrompt
}: Props) {
  const groups = promptsFor(lang);
  const caps = capabilitiesFor(lang, {
    search: Boolean(config?.searchEnabled),
    pdf: Boolean(config?.configuredProviders?.includes("gemini") || config?.configured),
    voiceServer: Boolean(config?.ttsServer)
  });

  return (
    <div className="nx-mob-scroll">
      <div className="nx-mob-head-row" style={{ marginBottom: 8 }}>
        <span className="nx-mob-brand">{t.exploreTitle}</span>
      </div>
      <p style={{ margin: "0 0 14px", fontSize: 13.5, color: "var(--text-secondary)" }}>{t.exploreSub}</p>

      <div className="nx-mob-studio-subnav">
        <div className="nx-seg" role="tablist" aria-label="Studio sections">
          {(
            [
              ["prompts", "Prompts"],
              ["image", t.viewImageStudio],
              ["projects", t.viewProjects],
              ["library", t.viewLibrary]
            ] as [StudioSubTab, string][]
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={studioTab === id}
              className={studioTab === id ? "active" : ""}
              onClick={() => onChangeStudioTab(id)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {studioTab === "image" ? (
        <ImageStudio
          t={t}
          getToken={getToken}
          imageEnabled={imageEnabled}
          onSaveToLibrary={onSaveImageToLibrary}
          onSendPromptToChat={onPickPrompt}
        />
      ) : studioTab === "projects" ? (
        <WorkspaceProjects
          t={t}
          projects={projects}
          convs={convs}
          activeProjectId={activeProjectId}
          onSelectProject={onSelectProject}
          onCreateProject={onCreateProject}
          onUpdateProject={onUpdateProject}
          onDeleteProject={onDeleteProject}
          onStartChatInProject={onStartChatInProject}
          onSelectConversation={onSelectConversation}
        />
      ) : studioTab === "library" ? (
        <LibraryView
          t={t}
          items={library}
          onDelete={onDeleteLibraryItem}
          onOpenInChat={onOpenLibraryInChat}
        />
      ) : (
        <>
          {groups.map((g) => (
            <div key={g.id}>
              <div className="nx-group-label">{g.label}</div>
              <div className="nx-mob-list">
                {g.prompts.map((p) => (
                  <button key={p} type="button" className="nx-mob-row" onClick={() => onPickPrompt(p)}>
                    <span className="nx-mob-row-title" style={{ whiteSpace: "normal", textAlign: "left" }}>
                      {p}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ))}

          <div className="nx-group-label" style={{ marginTop: 22 }}>
            {t.capabilities}
          </div>
          <div className="nx-mob-list">
            {caps.map((cap) => (
              <div key={cap} className="nx-mob-row">
                <span className="nx-mob-row-title" style={{ whiteSpace: "normal", fontSize: 13.5, color: "var(--text-secondary)" }}>
                  {cap}
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
