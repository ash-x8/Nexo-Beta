"use client";
import { memo, useState, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import remarkGfm from "remark-gfm";
import {
  Check,
  Copy,
  ExternalLink,
  FileText,
  Pause,
  Pencil,
  Play,
  RotateCcw,
  Square,
  Volume2,
  X
} from "lucide-react";
import type { Dict } from "@/lib/i18n";
import type { ChatMessage } from "@/lib/types";

interface Props {
  msg: ChatMessage;
  t: Dict;
  isBusy: boolean;
  isSpeakingThis: boolean;
  isPaused: boolean;
  canRegenerate: boolean;
  onSpeak: (msg: ChatMessage) => void;
  onPause: () => void;
  onResume: () => void;
  onStopSpeak: () => void;
  onRegenerate: (msgId: string) => void;
  onEditResend?: (msgId: string, newContent: string) => void;
}

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

export const MessageBubble = memo(function MessageBubble({
  msg,
  t,
  isBusy,
  isSpeakingThis,
  isPaused,
  canRegenerate,
  onSpeak,
  onPause,
  onResume,
  onStopSpeak,
  onRegenerate,
  onEditResend
}: Props) {
  const [copied, setCopied] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editDraft, setEditDraft] = useState(msg.content);

  const isUser = msg.role === "user";
  const streamingEmpty = !isUser && msg.status === "streaming" && !msg.content;

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
        {!isUser && msg.modelUsed && (
          <>
            <span aria-hidden="true">·</span>
            <span className="mono" style={{ fontSize: 11 }}>{msg.modelUsed}</span>
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
        </div>
      )}
    </article>
  );
});
