"use client";
import { useState, type ReactNode } from "react";
import type { UserProfile } from "@/lib/auth";
import type { AvatarState } from "@/lib/avatarBus";
import type { Dict } from "@/lib/i18n";
import type { Prefs } from "@/lib/prefs";
import type {
  Attachment,
  ChatMessage,
  Conversation,
  FeatureKey,
  GeneratedImageArtifact,
  LibraryItem,
  MemoryItem,
  ProjectItem,
  PublicConfig,
  SessionInfo
} from "@/lib/types";
import type { MicPermission } from "@/lib/useSpeechRecognition";
import { useKeyboardViewport } from "@/lib/useViewport";
import JarvisSession from "../JarvisSession";
import BottomNav, { type MobileTab } from "./BottomNav";
import MobileChat from "./MobileChat";
import MobileChats from "./MobileChats";
import MobileDrawer from "./MobileDrawer";
import MobileExplore, { type StudioSubTab } from "./MobileExplore";
import MobileHome from "./MobileHome";
import MobileSettings from "./MobileSettings";

interface Props {
  t: Dict;
  user: UserProfile;
  getToken: () => Promise<string>;
  onLogout: () => Promise<void>;
  config: PublicConfig | null;
  session: SessionInfo | null;
  features: Record<FeatureKey, boolean>;
  announcements: PublicConfig["announcements"];
  onDismissAnnouncement: (id: string) => void;
  ownerMaintenanceBanner: ReactNode;
  online: boolean;
  prefs: Prefs;
  setPref: <K extends keyof Prefs>(key: K, value: Prefs[K]) => void;
  convs: Conversation[];
  convsHasMore: boolean;
  loadMoreConvs: () => void;
  activeId: string | null;
  activeProjectId: string | null;
  setActiveProjectId: (id: string | null) => void;
  projects: ProjectItem[];
  library: LibraryItem[];
  messages: ChatMessage[];
  msgsLoading: boolean;
  msgsHasMore: boolean;
  loadingOlder: boolean;
  loadOlderMessages: () => void;
  memory: MemoryItem[];
  busy: boolean;
  error: string | null;
  clearError: () => void;
  startNewChat: (projectId?: string | null) => void;
  selectConversation: (id: string) => void;
  sendMessage: (text: string, files: Attachment[], useSearch: boolean, spoken?: boolean) => Promise<unknown>;
  editAndResendMessage: (msgId: string, newContent: string, useSearch: boolean) => Promise<void>;
  stopGeneration: () => void;
  regenerateMessage: (msgId: string, useSearch: boolean) => Promise<void>;
  continueMessage: (useSearch: boolean) => Promise<void>;
  setMessageFeedback: (msgId: string, feedback: "up" | "down" | null) => Promise<void>;
  renameConversation: (id: string, title: string) => Promise<void>;
  togglePinConversation: (id: string, nextPinned: boolean) => Promise<void>;
  deleteConversation: (id: string) => Promise<void>;
  saveItemToLibrary: (input: Omit<LibraryItem, "id" | "createdAt">) => Promise<LibraryItem | null>;
  removeLibraryItem: (id: string) => Promise<void>;
  createProject: (input: { name: string; description?: string; instructions?: string; color?: string }) => Promise<ProjectItem | null>;
  updateProject: (pid: string, patch: Partial<Pick<ProjectItem, "name" | "description" | "instructions" | "color">>) => Promise<void>;
  deleteProject: (pid: string) => Promise<void>;
  speaking: boolean;
  paused: boolean;
  speakingMsgId: string | null;
  onSpeakMsg: (m: ChatMessage) => void;
  onPauseSpeak: () => void;
  onResumeSpeak: () => void;
  onStopSpeak: () => void;
  micSupported: boolean;
  micPermission: MicPermission;
  listening: boolean;
  transcribing: boolean;
  detectedLanguage: string | null;
  interim: string;
  micError: string | null;
  startMic: () => void;
  stopMic: () => void;
  cancelMic: () => void;
  clearMicError: () => void;
  voiceAppendText: string;
  onConsumedVoiceAppend: () => void;
  jarvisOpen: boolean;
  onOpenJarvis: () => void;
  onCloseJarvis: () => void;
  onJarvisInterrupt: () => void;
  useSearch: boolean;
  setUseSearch: (v: boolean) => void;
}

export default function MobileApp(props: Props) {
  const { t, prefs, setPref, config, session, features, online, convs, activeId } = props;
  const isAdmin = session?.role === "SUPER_ADMIN";
  const appName = config?.appName || "NEXO AI";
  const [tab, setTab] = useState<MobileTab>("home");
  const [studioTab, setStudioTab] = useState<StudioSubTab>("prompts");
  const [inChat, setInChat] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [seedPrompt, setSeedPrompt] = useState<string | undefined>(undefined);

  const keyboardOpen = useKeyboardViewport(true);
  const activeConv = convs.find((c) => c.id === activeId);
  const lastUserText = [...props.messages].reverse().find((m) => m.role === "user")?.content || "";
  const lastAssistantText = [...props.messages].reverse().find((m) => m.role === "assistant")?.content || "";

  const assistantState: AvatarState = props.listening
    ? "listening"
    : props.busy || props.transcribing
      ? "thinking"
      : props.speaking && !props.paused
        ? "speaking"
        : props.error
          ? "error"
          : "idle";

  const allowPdf = Boolean(config?.configuredProviders?.includes("gemini") || config?.configured);

  const openNewChat = (prompt?: string, projectId?: string | null) => {
    props.startNewChat(projectId);
    setSeedPrompt(prompt);
    setInChat(true);
  };

  const openExistingChat = (id: string) => {
    setSeedPrompt(undefined);
    props.selectConversation(id);
    setInChat(true);
  };

  const openStudioSub = (sub: StudioSubTab) => {
    setStudioTab(sub);
    setInChat(false);
    setTab("explore");
  };

  const handleSaveImageToLibrary = (img: GeneratedImageArtifact) => {
    return props.saveItemToLibrary({
      kind: "image",
      title: img.prompt.slice(0, 80) || "Generated image",
      content: img.prompt,
      dataUrl: img.dataUrl,
      aspectRatio: img.aspectRatio,
      conversationId: activeId || undefined
    });
  };

  const handleSaveResponseToLibrary = (msg: ChatMessage) => {
    void props.saveItemToLibrary({
      kind: "response",
      title: msg.content.slice(0, 80) || "Saved NEXO response",
      content: msg.content,
      conversationId: activeId || undefined
    });
  };

  return (
    <>
      {inChat ? (
        <MobileChat
          t={t}
          title={activeConv?.title || t.newChat}
          draftKey={activeId || "new"}
          enterToSend={prefs.enterToSend}
          online={online}
          busy={props.busy}
          chatDisabled={!features.chat}
          chatDisabledNote={!features.chat ? t.featureDisabledNote : undefined}
          assistantState={assistantState}
          error={props.error}
          ownerMaintenanceBanner={props.ownerMaintenanceBanner}
          announcements={props.announcements}
          onDismissAnnouncement={props.onDismissAnnouncement}
          onClearError={props.clearError}
          messages={props.messages}
          msgsLoading={props.msgsLoading}
          msgsHasMore={props.msgsHasMore}
          loadingOlder={props.loadingOlder}
          onLoadOlder={props.loadOlderMessages}
          speaking={props.speaking}
          paused={props.paused}
          ttsEnabled={features.tts}
          speakingMsgId={props.speakingMsgId}
          onSpeakMsg={props.onSpeakMsg}
          onPauseSpeak={props.onPauseSpeak}
          onResumeSpeak={props.onResumeSpeak}
          onStopSpeak={props.onStopSpeak}
          onRegenerate={(msgId) => props.regenerateMessage(msgId, props.useSearch)}
          onContinue={() => props.continueMessage(props.useSearch)}
          onFeedback={props.setMessageFeedback}
          onSaveImageToLibrary={(img) => void handleSaveImageToLibrary(img)}
          onSaveResponseToLibrary={handleSaveResponseToLibrary}
          onEditResend={(msgId, nextText) =>
            props.editAndResendMessage(msgId, nextText, props.useSearch)
          }
          searchEnabled={Boolean(config?.searchEnabled) && features.webSearch}
          useSearch={props.useSearch}
          onToggleSearch={() => props.setUseSearch(!props.useSearch)}
          attachmentsEnabled={features.attachments}
          maxAttachmentMb={config?.maxAttachmentMb ?? 4}
          allowPdf={allowPdf}
          maxInputChars={config?.maxInputChars ?? 8000}
          micSupported={props.micSupported}
          micPermission={props.micPermission}
          listening={props.listening}
          transcribing={props.transcribing}
          detectedLanguage={props.detectedLanguage}
          interim={props.interim}
          micError={props.micError}
          onStartMic={props.startMic}
          onStopMic={props.stopMic}
          onCancelMic={props.cancelMic}
          onClearMicError={props.clearMicError}
          voiceAppendText={props.voiceAppendText}
          onConsumedVoiceAppend={props.onConsumedVoiceAppend}
          onOpenJarvis={features.jarvisMode && props.micSupported ? props.onOpenJarvis : undefined}
          onOpenImageStudio={() => openStudioSub("image")}
          onSend={(text, files) => {
            setSeedPrompt(undefined);
            props.sendMessage(text, files, props.useSearch, false);
          }}
          onStopGen={props.stopGeneration}
          onBack={() => setInChat(false)}
          onOpenMenu={() => setDrawerOpen(true)}
          onNewChat={() => openNewChat()}
          initialPrompt={seedPrompt}
        />
      ) : (
        <div className="nx-mob-shell">
          {tab === "home" && (
            <MobileHome
              t={t}
              appName={appName}
              historyEnabled={features.conversationHistory}
              ownerMaintenanceBanner={props.ownerMaintenanceBanner}
              announcements={props.announcements}
              onDismissAnnouncement={props.onDismissAnnouncement}
              lang={prefs.ui}
              nickname={prefs.nickname}
              avatarOn={prefs.avatarOn && features.jarvisMode}
              assistantState={assistantState}
              online={online}
              serverConfigured={Boolean(config?.configured)}
              convs={convs}
              micSupported={props.micSupported}
              onOpenMenu={() => setDrawerOpen(true)}
              onNewChat={() => openNewChat()}
              onOpenJarvis={props.onOpenJarvis}
              onOpenImageStudio={() => openStudioSub("image")}
              onOpenProjects={() => openStudioSub("projects")}
              onSeeAllChats={() => setTab("chats")}
              onSelectConv={openExistingChat}
              onPickPrompt={(prompt) => openNewChat(prompt)}
            />
          )}

          {tab === "chats" && (
            <MobileChats
              t={t}
              convs={features.conversationHistory ? convs : []}
              hasMore={features.conversationHistory ? props.convsHasMore : false}
              onLoadMore={props.loadMoreConvs}
              onSelect={openExistingChat}
              onNewChat={() => openNewChat()}
              onRename={props.renameConversation}
              onTogglePin={props.togglePinConversation}
              onDelete={props.deleteConversation}
            />
          )}

          {tab === "explore" && (
            <MobileExplore
              t={t}
              lang={prefs.ui}
              config={config}
              getToken={props.getToken}
              imageEnabled={Boolean(config?.imageEnabled) && features.imageGeneration}
              studioTab={studioTab}
              onChangeStudioTab={setStudioTab}
              projects={props.projects}
              convs={convs}
              activeProjectId={props.activeProjectId}
              onSelectProject={props.setActiveProjectId}
              onCreateProject={props.createProject}
              onUpdateProject={props.updateProject}
              onDeleteProject={props.deleteProject}
              onStartChatInProject={(projectId) => openNewChat(undefined, projectId)}
              onSelectConversation={openExistingChat}
              library={props.library}
              onSaveImageToLibrary={handleSaveImageToLibrary}
              onDeleteLibraryItem={props.removeLibraryItem}
              onOpenLibraryInChat={(promptText, cid) => {
                if (cid) openExistingChat(cid);
                else openNewChat(promptText);
              }}
              onPickPrompt={(prompt) => openNewChat(prompt)}
            />
          )}

          {tab === "settings" && (
            <MobileSettings
              t={t}
              user={props.user}
              getToken={props.getToken}
              config={config}
              session={session}
              features={features}
              prefs={prefs}
              setPref={props.setPref}
              memory={props.memory}
              micPermission={props.micPermission}
              onLogout={props.onLogout}
            />
          )}

          {!keyboardOpen && (
            <BottomNav tab={tab} t={t} onSelectTab={setTab} onOpenNewChat={() => openNewChat()} />
          )}
        </div>
      )}

      <MobileDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        t={t}
        appName={appName}
        isAdmin={isAdmin}
        historyEnabled={features.conversationHistory}
        user={props.user}
        convs={convs}
        activeId={activeId}
        onNewChat={() => openNewChat()}
        onSelectConv={openExistingChat}
        onOpenJarvis={props.onOpenJarvis}
        onOpenExplore={() => openStudioSub("image")}
        onOpenSettings={() => {
          setInChat(false);
          setTab("settings");
        }}
      />

      <JarvisSession
        open={props.jarvisOpen}
        onClose={props.onCloseJarvis}
        t={t}
        state={assistantState}
        listening={props.listening}
        transcribing={props.transcribing}
        busy={props.busy}
        speaking={props.speaking}
        continuous={prefs.jarvisContinuous}
        onToggleContinuous={() => setPref("jarvisContinuous", !prefs.jarvisContinuous)}
        detectedLanguage={props.detectedLanguage}
        interim={props.interim}
        lastUserText={lastUserText}
        lastAssistantText={lastAssistantText}
        micError={props.micError}
        onStartTurn={props.startMic}
        onStopListening={props.stopMic}
        onInterrupt={props.onJarvisInterrupt}
      />
    </>
  );
}
