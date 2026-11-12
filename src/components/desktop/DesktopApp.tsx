"use client";
import { useEffect, useRef, useState } from "react";
import { PanelLeft, PanelRight, Settings, X } from "lucide-react";
import type { UserProfile } from "@/lib/auth";
import type { AvatarState } from "@/lib/avatarBus";
import type { Dict } from "@/lib/i18n";
import type { Prefs } from "@/lib/prefs";
import { promptsFor } from "@/lib/prompts";
import type { Attachment, ChatMessage, Conversation, MemoryItem, PublicConfig } from "@/lib/types";
import type { MicPermission } from "@/lib/useSpeechRecognition";
import Composer from "../Composer";
import InstallButton from "../InstallButton";
import { MessageBubble } from "../MessageBubble";
import DesktopAssistantPanel from "./DesktopAssistantPanel";
import DesktopSettingsModal from "./DesktopSettingsModal";
import DesktopSidebar from "./DesktopSidebar";

interface Props {
  t: Dict;
  user: UserProfile;
  getToken: () => Promise<string>;
  onLogout: () => Promise<void>;
  config: PublicConfig | null;
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
  clearError: () => void;
  startNewChat: () => void;
  selectConversation: (id: string) => void;
  sendMessage: (text: string, files: Attachment[], useSearch: boolean) => Promise<void>;
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

export default function DesktopApp(props: Props) {
  const { t, prefs, setPref, config, online, convs, activeId, messages, busy } = props;
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [seedPrompt, setSeedPrompt] = useState<string | undefined>(undefined);

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const stickRef = useRef(true);

  const activeConv = convs.find((c) => c.id === activeId);
  const lastAssistantId = [...messages].reverse().find((m) => m.role === "assistant")?.id;

  const orbState: AvatarState = props.listening
    ? "listening"
    : busy
      ? "thinking"
      : props.speaking && !props.paused
        ? "speaking"
        : "idle";

  // Keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.shiftKey && e.key.toLowerCase() === "o") {
        e.preventDefault();
        props.startNewChat();
      } else if (mod && e.key === "/") {
        e.preventDefault();
        setPref("sidebarCollapsed", !prefs.sidebarCollapsed);
      } else if (mod && e.key === ",") {
        e.preventDefault();
        setSettingsOpen((v) => !v);
      } else if (e.key === "Escape" && busy) {
        props.stopGeneration();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, prefs.sidebarCollapsed, props, setPref]);

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    stickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 90;
  };

  const lastMessageContent = messages[messages.length - 1]?.content;

  useEffect(() => {
    if (stickRef.current && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages.length, lastMessageContent]);

  const groups = promptsFor(prefs.ui);

  return (
    <div className="nx-desk-shell">
      <DesktopSidebar
        t={t}
        user={props.user}
        collapsed={prefs.sidebarCollapsed}
        convs={convs}
        hasMore={props.convsHasMore}
        activeId={activeId}
        onNewChat={() => {
          setSeedPrompt(undefined);
          props.startNewChat();
        }}
        onSelect={(id) => {
          setSeedPrompt(undefined);
          props.selectConversation(id);
        }}
        onLoadMore={props.loadMoreConvs}
        onRename={props.renameConversation}
        onDelete={props.deleteConversation}
        onOpenSettings={() => setSettingsOpen(true)}
      />

      <div className="nx-desk-main">
        <header className="nx-desk-topbar">
          <div className="nx-topbar-left">
            <button
              type="button"
              className="nx-icon-btn"
              onClick={() => setPref("sidebarCollapsed", !prefs.sidebarCollapsed)}
              aria-label="Toggle sidebar"
            >
              <PanelLeft size={18} />
            </button>
            <span className="nx-topbar-title">{activeConv?.title || t.newChat}</span>
          </div>

          <div className="nx-topbar-right">
            <div className="nx-mob-meta-line" style={{ marginRight: 6 }}>
              <span className={`nx-live-dot ${!online ? "offline" : ""}`} aria-hidden="true" />
              <span>{!online ? t.offlineShort : config?.configured ? t.available : t.unavailable}</span>
            </div>

            <InstallButton label={t.install} iosPrompt={t.installIos} closeLabel={t.close} compact />

            {prefs.avatarOn && (
              <button
                type="button"
                className={`nx-icon-btn ${prefs.infoPanelOpen ? "active" : ""}`}
                onClick={() => setPref("infoPanelOpen", !prefs.infoPanelOpen)}
                aria-label={t.showAvatar}
              >
                <PanelRight size={18} />
              </button>
            )}

            <button
              type="button"
              className="nx-icon-btn"
              onClick={() => setSettingsOpen(true)}
              aria-label={t.settings}
            >
              <Settings size={18} />
            </button>
          </div>
        </header>

        <div className="nx-desk-body">
          <main className="nx-chat-col">
            <div ref={scrollRef} className="nx-desk-scroll" onScroll={onScroll}>
              <div className="nx-desk-inner">
                {!online && (
                  <div className="nx-banner offline">
                    <span>{t.offlineNote}</span>
                  </div>
                )}

                {props.error && (
                  <div className="nx-banner error">
                    <span>{props.error}</span>
                    <button type="button" className="nx-banner-close" onClick={props.clearError} aria-label={t.close}>
                      <X size={14} />
                    </button>
                  </div>
                )}

                {props.msgsHasMore && (
                  <div style={{ display: "flex", justifyContent: "center" }}>
                    <button
                      type="button"
                      className="nx-secondary-btn"
                      disabled={props.loadingOlder}
                      onClick={props.loadOlderMessages}
                    >
                      {props.loadingOlder ? t.loading : t.loadOlderMsgs}
                    </button>
                  </div>
                )}

                {props.msgsLoading ? (
                  <div className="nx-boot" style={{ minHeight: 240 }}>
                    <div className="nx-spinner" />
                  </div>
                ) : messages.length === 0 ? (
                  <div className="nx-desk-empty">
                    <h1>{prefs.nickname.trim() ? `${t.hello.replace(".", "")}, ${prefs.nickname.trim()}.` : t.hello}</h1>
                    <p>{t.helloSub}</p>
                    <div className="nx-prompt-grid">
                      {groups.map((g) => (
                        <button
                          key={g.id}
                          type="button"
                          className="nx-prompt-card"
                          onClick={() => setSeedPrompt(g.prompts[0])}
                        >
                          <span className="nx-prompt-cat">{g.label}</span>
                          <span className="nx-prompt-text">{g.prompts[0]}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  messages.map((m) => (
                    <MessageBubble
                      key={m.id}
                      msg={m}
                      t={t}
                      isBusy={busy}
                      isSpeakingThis={props.speaking && props.speakingMsgId === m.id}
                      isPaused={props.paused}
                      canRegenerate={m.id === lastAssistantId}
                      onSpeak={props.onSpeakMsg}
                      onPause={props.onPauseSpeak}
                      onResume={props.onResumeSpeak}
                      onStopSpeak={props.onStopSpeak}
                      onRegenerate={(msgId) => props.regenerateMessage(msgId, props.useSearch)}
                    />
                  ))
                )}
              </div>
            </div>

            <div className="nx-desk-composer-wrap">
              <div className="nx-desk-composer-inner">
                <Composer
                  t={t}
                  busy={busy}
                  disabled={!online}
                  isMobile={false}
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
                  onStop={props.stopGeneration}
                  initialPrompt={seedPrompt}
                />
              </div>
            </div>
          </main>

          {prefs.avatarOn && prefs.infoPanelOpen && (
            <DesktopAssistantPanel
              t={t}
              state={orbState}
              speaking={props.speaking}
              paused={props.paused}
              onPauseSpeak={props.onPauseSpeak}
              onResumeSpeak={props.onResumeSpeak}
              onStopSpeak={props.onStopSpeak}
              config={config}
              activeModel={prefs.model}
              useSearch={props.useSearch}
            />
          )}
        </div>
      </div>

      <DesktopSettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        t={t}
        user={props.user}
        getToken={props.getToken}
        config={config}
        prefs={prefs}
        setPref={setPref}
        memory={props.memory}
        micPermission={props.micPermission}
        onLogout={props.onLogout}
      />
    </div>
  );
}
