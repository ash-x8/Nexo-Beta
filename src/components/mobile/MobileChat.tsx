"use client";
import { useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowLeft, Menu, Pause, Play, Plus, Square, X } from "lucide-react";
import type { AvatarState } from "@/lib/avatarBus";
import type { Dict } from "@/lib/i18n";
import type { Attachment, ChatMessage } from "@/lib/types";
import type { MicPermission } from "@/lib/useSpeechRecognition";
import AudioWaveform from "../AudioWaveform";
import Composer from "../Composer";
import { MessageBubble } from "../MessageBubble";

interface Props {
  t: Dict;
  title: string;
  online: boolean;
  busy: boolean;
  assistantState: AvatarState;
  error: string | null;
  fallbackNotice: string | null;
  onClearError: () => void;
  onClearFallbackNotice: () => void;
  messages: ChatMessage[];
  msgsLoading: boolean;
  msgsHasMore: boolean;
  loadingOlder: boolean;
  onLoadOlder: () => void;
  speaking: boolean;
  paused: boolean;
  speakingMsgId: string | null;
  onSpeakMsg: (m: ChatMessage) => void;
  onPauseSpeak: () => void;
  onResumeSpeak: () => void;
  onStopSpeak: () => void;
  onRegenerate: (msgId: string) => void;
  onEditResend: (msgId: string, nextText: string) => void;
  searchEnabled: boolean;
  useSearch: boolean;
  onToggleSearch: () => void;
  maxAttachmentMb: number;
  allowPdf: boolean;
  maxInputChars: number;
  micSupported: boolean;
  micPermission: MicPermission;
  listening: boolean;
  interim: string;
  micError: string | null;
  onStartMic: () => void;
  onStopMic: () => void;
  onCancelMic: () => void;
  onClearMicError: () => void;
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
  online,
  busy,
  assistantState,
  error,
  fallbackNotice,
  onClearError,
  onClearFallbackNotice,
  messages,
  msgsLoading,
  msgsHasMore,
  loadingOlder,
  onLoadOlder,
  speaking,
  paused,
  speakingMsgId,
  onSpeakMsg,
  onPauseSpeak,
  onResumeSpeak,
  onStopSpeak,
  onRegenerate,
  onEditResend,
  searchEnabled,
  useSearch,
  onToggleSearch,
  maxAttachmentMb,
  allowPdf,
  maxInputChars,
  micSupported,
  micPermission,
  listening,
  interim,
  micError,
  onStartMic,
  onStopMic,
  onCancelMic,
  onClearMicError,
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
          <span className={`nx-live-dot ${!online ? "offline" : assistantState === "listening" || assistantState === "thinking" ? "recording" : assistantState === "error" ? "error" : ""}`} aria-hidden="true" />
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
        {!online && (
          <div className="nx-banner offline">
            <span>{t.offlineNote}</span>
          </div>
        )}

        {fallbackNotice && (
          <div className="nx-banner offline">
            <span>{fallbackNotice}</span>
            <button
              type="button"
              className="nx-banner-close"
              onClick={onClearFallbackNotice}
              aria-label={t.close}
            >
              <X size={14} />
            </button>
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
              canRegenerate={m.id === lastAssistantId}
              onSpeak={onSpeakMsg}
              onPause={onPauseSpeak}
              onResume={onResumeSpeak}
              onStopSpeak={onStopSpeak}
              onRegenerate={onRegenerate}
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
          disabled={!online}
          isMobile
          searchEnabled={searchEnabled}
          useSearch={useSearch}
          onToggleSearch={onToggleSearch}
          maxAttachmentMb={maxAttachmentMb}
          allowPdf={allowPdf}
          maxInputChars={maxInputChars}
          micSupported={micSupported}
          micPermission={micPermission}
          listening={listening}
          interim={interim}
          micError={micError}
          onStartMic={onStartMic}
          onStopMic={onStopMic}
          onCancelMic={onCancelMic}
          onClearMicError={onClearMicError}
          onSend={onSend}
          onStop={onStopGen}
          initialPrompt={initialPrompt}
        />
      </div>
    </div>
  );
}
