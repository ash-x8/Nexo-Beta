"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowDown, ArrowLeft, AudioLines, Menu, Pause, Play, Plus, Square, X } from "lucide-react";
import type { AvatarState } from "@/lib/avatarBus";
import type { Dict } from "@/lib/i18n";
import type { Attachment, ChatMessage, GeneratedImageArtifact, PublicConfig } from "@/lib/types";
import type { MicPermission } from "@/lib/useSpeechRecognition";
import AudioWaveform from "../AudioWaveform";
import Composer from "../Composer";
import { MessageBubble } from "../MessageBubble";

interface Props {
  t: Dict;
  title: string;
  draftKey: string;
  enterToSend: boolean;
  online: boolean;
  busy: boolean;
  chatDisabled?: boolean;
  chatDisabledNote?: string;
  assistantState: AvatarState;
  error: string | null;
  ownerMaintenanceBanner?: ReactNode;
  announcements?: PublicConfig["announcements"];
  onDismissAnnouncement?: (id: string) => void;
  onClearError: () => void;
  messages: ChatMessage[];
  msgsLoading: boolean;
  msgsHasMore: boolean;
  loadingOlder: boolean;
  onLoadOlder: () => void;
  speaking: boolean;
  paused: boolean;
  ttsEnabled?: boolean;
  speakingMsgId: string | null;
  onSpeakMsg: (m: ChatMessage) => void;
  onPauseSpeak: () => void;
  onResumeSpeak: () => void;
  onStopSpeak: () => void;
  onRegenerate: (msgId: string) => void;
  onContinue: () => void;
  onFeedback: (msgId: string, feedback: "up" | "down" | null) => void;
  onSaveImageToLibrary: (img: GeneratedImageArtifact) => void;
  onSaveResponseToLibrary: (msg: ChatMessage) => void;
  onEditResend: (msgId: string, nextText: string) => void;
  searchEnabled: boolean;
  useSearch: boolean;
  onToggleSearch: () => void;
  attachmentsEnabled?: boolean;
  maxAttachmentMb: number;
  allowPdf: boolean;
  maxInputChars: number;
  micSupported: boolean;
  micPermission: MicPermission;
  listening: boolean;
  transcribing: boolean;
  detectedLanguage: string | null;
  interim: string;
  micError: string | null;
  onStartMic: () => void;
  onStopMic: () => void;
  onCancelMic: () => void;
  onClearMicError: () => void;
  voiceAppendText: string;
  onConsumedVoiceAppend: () => void;
  onOpenJarvis?: () => void;
  onOpenImageStudio?: () => void;
  onSend: (text: string, files: Attachment[]) => void;
  onStopGen: () => void;
  onBack: () => void;
  onOpenMenu: () => void;
  onNewChat: () => void;
  initialPrompt?: string;
}

export default function MobileChat({
  t,
  title,
  draftKey,
  enterToSend,
  online,
  busy,
  chatDisabled = false,
  chatDisabledNote,
  assistantState,
  error,
  ownerMaintenanceBanner,
  announcements = [],
  onDismissAnnouncement,
  onClearError,
  messages,
  msgsLoading,
  msgsHasMore,
  loadingOlder,
  onLoadOlder,
  speaking,
  paused,
  ttsEnabled = true,
  speakingMsgId,
  onSpeakMsg,
  onPauseSpeak,
  onResumeSpeak,
  onStopSpeak,
  onRegenerate,
  onContinue,
  onFeedback,
  onSaveImageToLibrary,
  onSaveResponseToLibrary,
  onEditResend,
  searchEnabled,
  useSearch,
  onToggleSearch,
  attachmentsEnabled = true,
  maxAttachmentMb,
  allowPdf,
  maxInputChars,
  micSupported,
  micPermission,
  listening,
  transcribing,
  detectedLanguage,
  interim,
  micError,
  onStartMic,
  onStopMic,
  onCancelMic,
  onClearMicError,
  voiceAppendText,
  onConsumedVoiceAppend,
  onOpenJarvis,
  onOpenImageStudio,
  onSend,
  onStopGen,
  onBack,
  onOpenMenu,
  onNewChat,
  initialPrompt
}: Props) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const stickRef = useRef(true);
  const [showFab, setShowFab] = useState(false);

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const dist = el.scrollHeight - el.scrollTop - el.clientHeight;
    stickRef.current = dist < 80;
    setShowFab(dist > 180);
  };

  const lastMessageContent = messages[messages.length - 1]?.content;

  useEffect(() => {
    if (stickRef.current && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages.length, lastMessageContent]);

  const scrollToBottom = () => {
    stickRef.current = true;
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
    setShowFab(false);
  };

  const lastAssistantId = [...messages].reverse().find((m) => m.role === "assistant")?.id;
  const stateLabel =
    assistantState === "listening"
      ? t.state_listening
      : assistantState === "thinking"
        ? t.state_thinking
        : assistantState === "speaking"
          ? t.state_speaking
          : assistantState === "error"
            ? t.state_error
            : "";

  return (
    <div className="nx-mob-chat">
      <header className="nx-mob-topbar">
        <div style={{ display: "flex", alignItems: "center" }}>
          <button type="button" className="nx-mob-topbar-btn" onClick={onBack} aria-label={t.back}>
            <ArrowLeft size={20} />
          </button>
          <button type="button" className="nx-mob-topbar-btn" onClick={onOpenMenu} aria-label={t.menu}>
            <Menu size={19} />
          </button>
        </div>

        <div className="nx-mob-topbar-center">
          <span
            className={`nx-live-dot ${!online ? "offline" : assistantState === "listening" || assistantState === "thinking" ? "recording" : assistantState === "error" ? "error" : ""}`}
            aria-hidden="true"
          />
          <span className="nx-mob-topbar-title">{title || t.newChat}</span>
        </div>

        <div style={{ display: "flex", alignItems: "center" }}>
          {speaking && (
            <>
              <button
                type="button"
                className="nx-mob-topbar-btn"
                onClick={paused ? onResumeSpeak : onPauseSpeak}
                aria-label={paused ? t.resumeSpeaking : t.pauseSpeaking}
              >
                {paused ? <Play size={18} /> : <Pause size={18} />}
              </button>
              <button
                type="button"
                className="nx-mob-topbar-btn"
                onClick={onStopSpeak}
                aria-label={t.stopSpeaking}
              >
                <Square size={16} />
              </button>
            </>
          )}
          {onOpenJarvis && (
            <button
              type="button"
              className="nx-mob-topbar-btn"
              onClick={onOpenJarvis}
              aria-label={t.jarvisStart}
            >
              <AudioLines size={18} color="var(--accent-blue)" />
            </button>
          )}
          <button type="button" className="nx-mob-topbar-btn" onClick={onNewChat} aria-label={t.newChat}>
            <Plus size={20} />
          </button>
        </div>
      </header>

      {assistantState !== "idle" && (
        <div className="nx-mob-wave-bar">
          <span className="nx-mob-wave-label">{stateLabel}</span>
          <div style={{ flex: 1, maxWidth: 160 }}>
            <AudioWaveform height={18} bars={18} />
          </div>
        </div>
      )}

      <div ref={scrollRef} className="nx-mob-messages" onScroll={onScroll}>
        {ownerMaintenanceBanner}

        {announcements.length > 0 && (
          <div className="nx-announcement-stack">
            {announcements.map((a) => (
              <div key={a.id} className={`nx-banner ${a.priority === "critical" ? "critical" : a.category}`}>
                <div className="nx-announcement-content">
                  <strong>{a.title}</strong>
                  <span>{a.message}</span>
                </div>
                {onDismissAnnouncement && (
                  <button
                    type="button"
                    className="nx-banner-close"
                    onClick={() => onDismissAnnouncement(a.id)}
                    aria-label={t.close}
                  >
                    <X size={14} />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        {!online && (
          <div className="nx-banner offline">
            <span>{t.offlineNote}</span>
          </div>
        )}

        {error && (
          <div className="nx-banner error">
            <span>{error}</span>
            <button type="button" className="nx-banner-close" onClick={onClearError} aria-label={t.close}>
              <X size={14} />
            </button>
          </div>
        )}

        {msgsHasMore && (
          <div style={{ display: "flex", justifyContent: "center" }}>
            <button type="button" className="nx-secondary-btn" disabled={loadingOlder} onClick={onLoadOlder}>
              {loadingOlder ? t.loading : t.loadOlderMsgs}
            </button>
          </div>
        )}

        {msgsLoading ? (
          <div className="nx-skeleton-stack" aria-busy="true" aria-label={t.loading}>
            <div className="nx-skeleton-bubble user" />
            <div className="nx-skeleton-bubble assistant" />
            <div className="nx-skeleton-bubble assistant short" />
          </div>
        ) : messages.length === 0 ? (
          <div style={{ margin: "auto 0", textAlign: "center", padding: "32px 12px" }}>
            <h2 style={{ margin: "0 0 8px", fontFamily: "var(--font-display-stack)", fontSize: 22 }}>{t.empty}</h2>
            <p style={{ margin: 0, color: "var(--text-secondary)", fontSize: 14 }}>{t.helloSub}</p>
          </div>
        ) : (
          messages.map((m) => (
            <MessageBubble
              key={m.id}
              msg={m}
              t={t}
              isBusy={busy}
              isSpeakingThis={speaking && speakingMsgId === m.id}
              isPaused={paused}
              ttsEnabled={ttsEnabled}
              canRegenerate={m.id === lastAssistantId}
              onSpeak={onSpeakMsg}
              onPause={onPauseSpeak}
              onResume={onResumeSpeak}
              onStopSpeak={onStopSpeak}
              onRegenerate={onRegenerate}
              onContinue={m.id === lastAssistantId ? onContinue : undefined}
              onFeedback={onFeedback}
              onSaveImageToLibrary={onSaveImageToLibrary}
              onSaveResponseToLibrary={onSaveResponseToLibrary}
              onEditResend={onEditResend}
            />
          ))
        )}

        {showFab && (
          <button
            type="button"
            className="nx-scroll-fab"
            onClick={scrollToBottom}
            aria-label={t.scrollToBottom}
          >
            <ArrowDown size={18} />
          </button>
        )}
      </div>

      <div className="nx-mob-composer-dock">
        <Composer
          t={t}
          busy={busy}
          disabled={!online || chatDisabled}
          disabledNote={chatDisabledNote}
          isMobile
          draftKey={draftKey}
          enterToSend={enterToSend}
          searchEnabled={searchEnabled}
          useSearch={useSearch}
          onToggleSearch={onToggleSearch}
          attachmentsEnabled={attachmentsEnabled}
          maxAttachmentMb={maxAttachmentMb}
          allowPdf={allowPdf}
          maxInputChars={maxInputChars}
          micSupported={micSupported}
          micPermission={micPermission}
          listening={listening}
          transcribing={transcribing}
          detectedLanguage={detectedLanguage}
          interim={interim}
          micError={micError}
          onStartMic={onStartMic}
          onStopMic={onStopMic}
          onCancelMic={onCancelMic}
          onClearMicError={onClearMicError}
          onOpenJarvis={onOpenJarvis}
          onOpenImageStudio={onOpenImageStudio}
          onSend={onSend}
          onStop={onStopGen}
          initialPrompt={initialPrompt}
          voiceAppendText={voiceAppendText}
          onConsumedVoiceAppend={onConsumedVoiceAppend}
        />
      </div>
    </div>
  );
}
