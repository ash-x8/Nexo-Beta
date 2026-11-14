"use client";
import { useState } from "react";
import type { UserProfile } from "@/lib/auth";
import type { AvatarState } from "@/lib/avatarBus";
import type { Dict } from "@/lib/i18n";
import type { Prefs } from "@/lib/prefs";
import type {
  Attachment,
  ChatMessage,
  Conversation,
  MemoryItem,
  ModelCatalogItem,
  PublicConfig
} from "@/lib/types";
import type { MicPermission } from "@/lib/useSpeechRecognition";
import { useKeyboardViewport } from "@/lib/useViewport";
import BottomNav, { type MobileTab } from "./BottomNav";
import MobileChat from "./MobileChat";
import MobileChats from "./MobileChats";
import MobileDrawer from "./MobileDrawer";
import MobileExplore from "./MobileExplore";
import MobileHome from "./MobileHome";
import MobileSettings from "./MobileSettings";

interface Props {
  t: Dict;
  user: UserProfile;
  getToken: () => Promise<string>;
  onLogout: () => Promise<void>;
  config: PublicConfig | null;
  modelsCatalog: ModelCatalogItem[];
  online: boolean;
  prefs: Prefs;
  setPref: <K extends keyof Prefs>(key: K, value: Prefs[K]) => void;
  convs: Conversation[];
  convsHasMore: boolean;
  loadMoreConvs: () => void;
  activeId: string | null;
  messages: ChatMessage[];
  msgsLoading: boolean;
  msgsHasMore: boolean;
  loadingOlder: boolean;
  loadOlderMessages: () => void;
  memory: MemoryItem[];
  busy: boolean;
  error: string | null;
  fallbackNotice: string | null;
  clearError: () => void;
  clearFallbackNotice: () => void;
  startNewChat: () => void;
  selectConversation: (id: string) => void;
  sendMessage: (text: string, files: Attachment[], useSearch: boolean) => Promise<void>;
  editAndResendMessage: (msgId: string, newContent: string, useSearch: boolean) => Promise<void>;
  stopGeneration: () => void;
  regenerateMessage: (msgId: string, useSearch: boolean) => Promise<void>;
  renameConversation: (id: string, title: string) => Promise<void>;
  deleteConversation: (id: string) => Promise<void>;
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
  interim: string;
  micError: string | null;
  startMic: () => void;
  stopMic: () => void;
  cancelMic: () => void;
  clearMicError: () => void;
  useSearch: boolean;
  setUseSearch: (v: boolean) => void;
}

export default function MobileApp(props: Props) {
  const { t, prefs, setPref, config, online, convs, activeId } = props;
  const [tab, setTab] = useState<MobileTab>("home");
  const [inChat, setInChat] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [seedPrompt, setSeedPrompt] = useState<string | undefined>(undefined);

  const keyboardOpen = useKeyboardViewport(true);
  const activeConv = convs.find((c) => c.id === activeId);

  const assistantState: AvatarState = props.listening
    ? "listening"
    : props.busy
      ? "thinking"
      : props.speaking && !props.paused
        ? "speaking"
        : props.error
          ? "error"
          : "idle";

  const openNewChat = (prompt?: string, autoMic = false) => {
    props.startNewChat();
    setSeedPrompt(prompt);
    setInChat(true);
    if (autoMic) props.startMic();
  };

  const openExistingChat = (id: string) => {
    setSeedPrompt(undefined);
    props.selectConversation(id);
    setInChat(true);
  };

  return (
    <>
      {inChat ? (
        <MobileChat
          t={t}
          title={activeConv?.title || t.newChat}
          online={online}
          busy={props.busy}
          assistantState={assistantState}
          error={props.error}
          fallbackNotice={props.fallbackNotice}
          onClearError={props.clearError}
          onClearFallbackNotice={props.clearFallbackNotice}
          messages={props.messages}
          msgsLoading={props.msgsLoading}
          msgsHasMore={props.msgsHasMore}
          loadingOlder={props.loadingOlder}
          onLoadOlder={props.loadOlderMessages}
          speaking={props.speaking}
          paused={props.paused}
          speakingMsgId={props.speakingMsgId}
          onSpeakMsg={props.onSpeakMsg}
          onPauseSpeak={props.onPauseSpeak}
          onResumeSpeak={props.onResumeSpeak}
          onStopSpeak={props.onStopSpeak}
          onRegenerate={(msgId) => props.regenerateMessage(msgId, props.useSearch)}
          onEditResend={(msgId, nextText) =>
            props.editAndResendMessage(msgId, nextText, props.useSearch)
          }
          searchEnabled={Boolean(config?.searchEnabled)}
          useSearch={props.useSearch}
          onToggleSearch={() => props.setUseSearch(!props.useSearch)}
          maxAttachmentMb={config?.maxAttachmentMb ?? 4}
          allowPdf={config?.provider === "gemini"}
          maxInputChars={config?.maxInputChars ?? 8000}
          micSupported={props.micSupported}
          micPermission={props.micPermission}
          listening={props.listening}
          interim={props.interim}
          micError={props.micError}
          onStartMic={props.startMic}
          onStopMic={props.stopMic}
          onCancelMic={props.cancelMic}
          onClearMicError={props.clearMicError}
          onSend={(text, files) => {
            setSeedPrompt(undefined);
            props.sendMessage(text, files, props.useSearch);
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
              lang={prefs.ui}
              nickname={prefs.nickname}
              avatarOn={prefs.avatarOn}
              assistantState={assistantState}
              online={online}
              serverConfigured={Boolean(config?.configured)}
              convs={convs}
              micSupported={props.micSupported}
              onOpenMenu={() => setDrawerOpen(true)}
              onNewChat={() => openNewChat()}
              onStartVoice={() => openNewChat(undefined, true)}
              onOpenExplore={() => setTab("explore")}
              onSeeAllChats={() => setTab("chats")}
              onSelectConv={openExistingChat}
              onPickPrompt={(prompt) => openNewChat(prompt)}
            />
          )}

          {tab === "chats" && (
            <MobileChats
              t={t}
              convs={convs}
              hasMore={props.convsHasMore}
              onLoadMore={props.loadMoreConvs}
              onSelect={openExistingChat}
              onNewChat={() => openNewChat()}
              onRename={props.renameConversation}
              onDelete={props.deleteConversation}
            />
          )}

          {tab === "explore" && (
            <MobileExplore
              t={t}
              lang={prefs.ui}
              config={config}
              onPickPrompt={(prompt) => openNewChat(prompt)}
            />
          )}

          {tab === "settings" && (
            <MobileSettings
              t={t}
              user={props.user}
              getToken={props.getToken}
              config={config}
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
        user={props.user}
        convs={convs}
        activeId={activeId}
        modelsCatalog={props.modelsCatalog}
        selectedModel={prefs.model}
        defaultModel={config?.model || "gemini-2.5-flash"}
        onSelectModel={(modelId) => setPref("model", modelId)}
        onNewChat={() => openNewChat()}
        onSelectConv={openExistingChat}
        onOpenExplore={() => {
          setInChat(false);
          setTab("explore");
        }}
        onOpenSettings={() => {
          setInChat(false);
          setTab("settings");
        }}
      />
    </>
  );
}
