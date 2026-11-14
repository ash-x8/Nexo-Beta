"use client";
import { memo, useState, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import remarkGfm from "remark-gfm";
import {
  BookmarkPlus,
  Check,
  Copy,
  Download,
  ExternalLink,
  FileText,
  Pause,
  Pencil,
  Play,
  RotateCcw,
  Sparkles,
  Square,
  ThumbsDown,
  ThumbsUp,
  Volume2,
  X
} from "lucide-react";
import type { Dict } from "@/lib/i18n";
import type { ChatMessage, GeneratedImageArtifact, NexoTaskType } from "@/lib/types";

interface Props {
  msg: ChatMessage;
  t: Dict;
  isBusy: boolean;
  isSpeakingThis: boolean;
  isPaused: boolean;
  ttsEnabled?: boolean;
  canRegenerate: boolean;
  onSpeak: (msg: ChatMessage) => void;
  onPause: () => void;
  onResume: () => void;
  onStopSpeak: () => void;
  onRegenerate: (msgId: string) => void;
  onContinue?: () => void;
  onFeedback?: (msgId: string, feedback: "up" | "down" | null) => void;
  onSaveImageToLibrary?: (img: GeneratedImageArtifact) => void;
  onSaveResponseToLibrary?: (msg: ChatMessage) => void;
  onEditResend?: (msgId: string, newContent: string) => void;
}

const CAPABILITY_LABEL: Partial<Record<NexoTaskType, string>> = {
  coding: "Code",
  reasoning: "Reasoning",
  math: "Math",
  writing: "Writing",
  translation: "Translation",
  summarization: "Summary",
  imageGen: "Image Studio",
  imageUnderstanding: "Vision",
  audioProcessing: "Audio",
  voiceConversation: "Jarvis Voice",
  webSearch: "Web Research"
};

function extractText(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(extractText).join("");
  if (node && typeof node === "object" && "props" in node) {
    return extractText((node as { props?: { children?: ReactNode } }).props?.children);
  }
  return "";
}

function CodeBlock({
  className,
  children,
  copyLabel,
  copiedLabel
}: {
  className?: string;
  children?: ReactNode;
  copyLabel: string;
  copiedLabel: string;
}) {
  const [copied, setCopied] = useState(false);
  const langMatch = /language-([\w+-]+)/.exec(className || "");
  const lang = langMatch?.[1] || "code";

  const handleCopy = () => {
    const raw = extractText(children).replace(/\n$/, "");
    navigator.clipboard
      ?.writeText(raw)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1600);
      })
      .catch(() => {});
  };

  return (
    <div className="nx-code-wrap">
      <div className="nx-code-head">
        <span>{lang}</span>
        <button type="button" className="nx-code-copy" onClick={handleCopy}>
          {copied ? <Check size={13} /> : <Copy size={13} />}
          <span>{copied ? copiedLabel : copyLabel}</span>
        </button>
      </div>
      <pre>
        <code className={className}>{children}</code>
      </pre>
    </div>
  );
}

function formatTime(ms: number): string {
  try {
    return new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" }).format(new Date(ms));
  } catch {
    return "";
  }
}

function triggerImageDownload(img: GeneratedImageArtifact) {
  const a = document.createElement("a");
  a.href = img.dataUrl;
  a.download = `nexo-${img.id.slice(0, 8)}.png`;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export const MessageBubble = memo(function MessageBubble({
  msg,
  t,
  isBusy,
  isSpeakingThis,
  isPaused,
  ttsEnabled = true,
  canRegenerate,
  onSpeak,
  onPause,
  onResume,
  onStopSpeak,
  onRegenerate,
  onContinue,
  onFeedback,
  onSaveImageToLibrary,
  onSaveResponseToLibrary,
  onEditResend
}: Props) {
  const [copied, setCopied] = useState(false);
  const [savedNote, setSavedNote] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editDraft, setEditDraft] = useState(msg.content);
  const [lightboxImg, setLightboxImg] = useState<GeneratedImageArtifact | null>(null);

  const isUser = msg.role === "user";
  const streamingEmpty = !isUser && msg.status === "streaming" && !msg.content;
  const capLabel = !isUser && msg.capability ? CAPABILITY_LABEL[msg.capability] : undefined;

  const copyAll = () => {
    if (!msg.content) return;
    navigator.clipboard
      ?.writeText(msg.content)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1600);
      })
      .catch(() => {});
  };

  const handleSaveEdit = () => {
    const clean = editDraft.trim();
    if (!clean || !onEditResend) return;
    setEditing(false);
    onEditResend(msg.id, clean);
  };

  return (
    <article className={`nx-msg-row ${isUser ? "user" : "assistant"}`}>
      <div className="nx-msg-meta">
        <span>{isUser ? t.you : t.assistantName}</span>
        <span aria-hidden="true">·</span>
        <span className="tabular">{formatTime(msg.createdAt)}</span>
        {isUser && msg.editedAt && (
          <>
            <span aria-hidden="true">·</span>
            <span>{t.editedNote}</span>
          </>
        )}
        {capLabel && (
          <>
            <span aria-hidden="true">·</span>
            <span style={{ color: "var(--accent-blue)" }}>{capLabel}</span>
          </>
        )}
      </div>

      <div className="nx-msg-bubble">
        {msg.attachments && msg.attachments.length > 0 && (
          <div className="nx-msg-attachments">
            {msg.attachments.map((a, idx) => (
              <span key={`${a.name}-${idx}`} className="nx-msg-file-item">
                <FileText size={13} />
                <span>{a.name}</span>
              </span>
            ))}
          </div>
        )}

        {isUser ? (
          editing ? (
            <div className="nx-msg-edit-box">
              <textarea
                className="nx-textarea"
                value={editDraft}
                maxLength={8000}
                onChange={(e) => setEditDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                    e.preventDefault();
                    handleSaveEdit();
                  } else if (e.key === "Escape") {
                    setEditing(false);
                  }
                }}
                autoFocus
              />
              <div className="nx-msg-edit-actions">
                <button
                  type="button"
                  className="nx-secondary-btn"
                  style={{ minHeight: 34, padding: "4px 12px" }}
                  onClick={() => setEditing(false)}
                >
                  <X size={13} />
                  <span>{t.cancel}</span>
                </button>
                <button
                  type="button"
                  className="nx-secondary-btn"
                  style={{ minHeight: 34, padding: "4px 12px", borderColor: "var(--accent-blue)", color: "var(--accent-blue)" }}
                  disabled={!editDraft.trim() || isBusy}
                  onClick={handleSaveEdit}
                >
                  <Check size={13} />
                  <span>{t.saveAndResend}</span>
                </button>
              </div>
            </div>
          ) : (
            <div style={{ whiteSpace: "pre-wrap" }}>{msg.content}</div>
          )
        ) : streamingEmpty ? (
          <div className="nx-typing" aria-live="polite">
            <div className="nx-typing-bars" aria-hidden="true">
              <span />
              <span />
              <span />
            </div>
            <span>{t.thinking}</span>
          </div>
        ) : msg.content ? (
          <div className="nx-md">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              rehypePlugins={[rehypeHighlight]}
              components={{
                pre({ children }) {
                  return <>{children}</>;
                },
                code({ className, children, ...rest }) {
                  const isBlock = Boolean(className?.includes("language-")) || String(children).includes("\n");
                  if (isBlock) {
                    return (
                      <CodeBlock className={className} copyLabel={t.copy} copiedLabel={t.copied}>
                        {children}
                      </CodeBlock>
                    );
                  }
                  return (
                    <code className={className} {...rest}>
                      {children}
                    </code>
                  );
                },
                a({ href, children }) {
                  return (
                    <a href={href} target="_blank" rel="noopener noreferrer">
                      {children}
                    </a>
                  );
                }
              }}
            >
              {msg.content}
            </ReactMarkdown>
          </div>
        ) : null}

        {msg.images && msg.images.length > 0 && (
          <div className="nx-msg-images">
            {msg.images.map((img) => (
              <div key={img.id} className="nx-msg-img-card">
                <button
                  type="button"
                  className="nx-msg-img-btn"
                  onClick={() => setLightboxImg(img)}
                  aria-label={img.prompt}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={img.dataUrl} alt={img.prompt} />
                </button>
                <div className="nx-msg-img-foot">
                  <span className="tabular">{img.aspectRatio}</span>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button
                      type="button"
                      className="nx-tiny-btn"
                      onClick={() => triggerImageDownload(img)}
                      aria-label={t.download}
                      title={t.download}
                    >
                      <Download size={14} />
                    </button>
                    {onSaveImageToLibrary && (
                      <button
                        type="button"
                        className="nx-tiny-btn"
                        onClick={() => onSaveImageToLibrary(img)}
                        aria-label={t.saveToLibrary}
                        title={t.saveToLibrary}
                      >
                        <BookmarkPlus size={14} />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {msg.sources && msg.sources.length > 0 && (
          <div className="nx-sources">
            <div className="nx-sources-label">{t.sources}</div>
            <div className="nx-sources-list">
              {msg.sources.map((s, i) => (
                <a
                  key={`${s.url}-${i}`}
                  href={s.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="nx-source-link"
                >
                  <ExternalLink size={12} />
                  <span>
                    [{i + 1}] {s.title}
                  </span>
                </a>
              ))}
            </div>
          </div>
        )}

        {!isUser && msg.status === "stopped" && (
          <div className="nx-msg-status-note">
            <span>{t.stoppedNote}</span>
          </div>
        )}

        {!isUser && msg.status === "error" && msg.error && (
          <div className="nx-banner error" style={{ marginTop: 10 }}>
            <span>{msg.error}</span>
          </div>
        )}
      </div>

      {isUser && onEditResend && !editing && (
        <div className="nx-msg-actions">
          <button
            type="button"
            className="nx-action-btn"
            disabled={isBusy}
            onClick={() => {
              setEditDraft(msg.content);
              setEditing(true);
            }}
          >
            <Pencil size={13} />
            <span>{t.editMsg}</span>
          </button>
        </div>
      )}

      {!isUser && msg.status !== "streaming" && (
        <div className="nx-msg-actions">
          {msg.content && (
            <button type="button" className="nx-action-btn" onClick={copyAll}>
              {copied ? <Check size={14} /> : <Copy size={14} />}
              <span>{copied ? t.copied : t.copy}</span>
            </button>
          )}

          {msg.content &&
            ttsEnabled &&
            (!isSpeakingThis ? (
              <button type="button" className="nx-action-btn" onClick={() => onSpeak(msg)}>
                <Volume2 size={14} />
                <span>{t.readAloud}</span>
              </button>
            ) : (
              <>
                <button type="button" className="nx-action-btn" onClick={isPaused ? onResume : onPause}>
                  {isPaused ? <Play size={14} /> : <Pause size={14} />}
                  <span>{isPaused ? t.resumeSpeaking : t.pauseSpeaking}</span>
                </button>
                <button type="button" className="nx-action-btn" onClick={onStopSpeak}>
                  <Square size={13} />
                  <span>{t.stopSpeaking}</span>
                </button>
              </>
            ))}

          {canRegenerate && (
            <button
              type="button"
              className="nx-action-btn"
              disabled={isBusy}
              onClick={() => onRegenerate(msg.id)}
            >
              <RotateCcw size={14} />
              <span>{msg.status === "error" || msg.status === "stopped" ? t.retry : t.regenerate}</span>
            </button>
          )}

          {canRegenerate && onContinue && (msg.status === "stopped" || msg.content.length > 500) && (
            <button type="button" className="nx-action-btn" disabled={isBusy} onClick={onContinue}>
              <Sparkles size={13} />
              <span>{t.continueGen}</span>
            </button>
          )}

          {onSaveResponseToLibrary && msg.content && (
            <button
              type="button"
              className="nx-action-btn"
              onClick={() => {
                onSaveResponseToLibrary(msg);
                setSavedNote(true);
                setTimeout(() => setSavedNote(false), 1600);
              }}
            >
              {savedNote ? <Check size={13} /> : <BookmarkPlus size={13} />}
              <span>{savedNote ? t.savedNote : t.saveToLibrary}</span>
            </button>
          )}

          {onFeedback && msg.content && (
            <>
              <button
                type="button"
                className={`nx-action-btn ${msg.feedback === "up" ? "active" : ""}`}
                onClick={() => onFeedback(msg.id, msg.feedback === "up" ? null : "up")}
                aria-label={t.helpful}
                title={t.helpful}
              >
                <ThumbsUp size={13} />
              </button>
              <button
                type="button"
                className={`nx-action-btn ${msg.feedback === "down" ? "active" : ""}`}
                onClick={() => onFeedback(msg.id, msg.feedback === "down" ? null : "down")}
                aria-label={t.notHelpful}
                title={t.notHelpful}
              >
                <ThumbsDown size={13} />
              </button>
            </>
          )}
        </div>
      )}

      {lightboxImg && (
        <div
          className="nx-lightbox-backdrop"
          role="dialog"
          aria-modal="true"
          onClick={() => setLightboxImg(null)}
        >
          <div className="nx-lightbox-card" onClick={(e) => e.stopPropagation()}>
            <div className="nx-modal-head">
              <h2 style={{ fontSize: 15, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {lightboxImg.prompt}
              </h2>
              <button type="button" className="nx-tiny-btn" onClick={() => setLightboxImg(null)} aria-label={t.close}>
                <X size={18} />
              </button>
            </div>
            <div className="nx-lightbox-body">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={lightboxImg.dataUrl} alt={lightboxImg.prompt} />
            </div>
            <div className="nx-lightbox-foot">
              <span className="tabular" style={{ fontSize: 12.5, color: "var(--text-muted)" }}>
                NEXO Image Studio · {lightboxImg.aspectRatio}
              </span>
              <div style={{ display: "flex", gap: 8 }}>
                {onSaveImageToLibrary && (
                  <button
                    type="button"
                    className="nx-secondary-btn"
                    onClick={() => onSaveImageToLibrary(lightboxImg)}
                  >
                    <BookmarkPlus size={15} />
                    <span>{t.saveToLibrary}</span>
                  </button>
                )}
                <button
                  type="button"
                  className="nx-secondary-btn"
                  style={{ borderColor: "var(--accent-blue)", color: "var(--accent-blue)" }}
                  onClick={() => triggerImageDownload(lightboxImg)}
                >
                  <Download size={15} />
                  <span>{t.download}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </article>
  );
});
