"use client";
import { useRef, useState, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import type { ChatMessage } from "@/lib/types";
import type { Dict } from "@/lib/i18n";
import { Icon } from "./mobile/icons";

function CodeBlock({ children }: { children?: ReactNode }) {
  const ref = useRef<HTMLPreElement>(null);
  const [done, setDone] = useState(false);
  return (
    <div className="codeblock">
      <button
        className="codecopy"
        onClick={async () => {
          await navigator.clipboard.writeText(ref.current?.innerText ?? "");
          setDone(true);
          setTimeout(() => setDone(false), 1500);
        }}
        aria-label="Copy code block"
      >
        <span style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
          <Icon name={done ? "check" : "copy"} size={13} />
          <span>{done ? "Copied" : "Copy"}</span>
        </span>
      </button>
      <pre ref={ref}>{children}</pre>
    </div>
  );
}

interface Props {
  msg: ChatMessage;
  streaming: boolean;
  canRegenerate: boolean;
  speakingThis: boolean;
  onRegenerate: () => void;
  onSpeak: (text: string) => void;
  onStopSpeak: () => void;
  t: Dict;
}

export default function MessageView({ msg, streaming, canRegenerate, speakingThis, onRegenerate, onSpeak, onStopSpeak, t }: Props) {
  const [copied, setCopied] = useState(false);
  const isUser = msg.role === "user";
  const time = new Date(msg.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  return (
    <article className={`msg ${isUser ? "msg-user" : "msg-ai"}`}>
      <header>
        <span className="who">
          {isUser ? (
            <span style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
              <Icon name="user" size={13} />
              <span>{t.you}</span>
            </span>
          ) : (
            <span style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
              <Icon name="nexo" size={13} />
              <span>{t.assistantName}</span>
            </span>
          )}
        </span>
        <time dateTime={new Date(msg.createdAt).toISOString()}>{time}</time>
      </header>

      {msg.attachments?.length ? (
        <ul className="attached">
          {msg.attachments.map((a, i) => (
            <li key={i} style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
              <Icon name="paperclip" size={12} />
              <span>{a.name}</span>
            </li>
          ))}
        </ul>
      ) : null}

      {isUser ? (
        <p className="user-text">{msg.content}</p>
      ) : msg.content ? (
        <div className="md">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            rehypePlugins={[[rehypeHighlight, { detect: true, ignoreMissing: true }]]}
            components={{
              pre: ({ children }) => <CodeBlock>{children}</CodeBlock>,
              a: ({ href, children }) => (
                <a href={href} target="_blank" rel="noopener noreferrer">
                  {children}
                </a>
              )
            }}
          >
            {msg.content}
          </ReactMarkdown>
        </div>
      ) : streaming ? (
        <div className="thinking" role="status" aria-label={t.thinking}>
          <i />
          <i />
          <i />
          <span>{t.thinking}</span>
        </div>
      ) : null}

      {msg.sources?.length ? (
        <div className="sources">
          <span style={{ display: "inline-flex", alignItems: "center", gap: "4px", color: "var(--cyan)" }}>
            <Icon name="globe" size={12} />
            <span>{t.sources}:</span>
          </span>
          {msg.sources.map((s, i) => (
            <a key={i} href={s.url} target="_blank" rel="noopener noreferrer" title={s.url}>
              [{i + 1}] {s.title}
            </a>
          ))}
        </div>
      ) : null}

      {!isUser && msg.content && !streaming && (
        <footer>
          <button
            onClick={async () => {
              await navigator.clipboard.writeText(msg.content);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            }}
            title={copied ? t.copied : t.copy}
          >
            <span style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
              <Icon name={copied ? "check" : "copy"} size={13} />
              <span>{copied ? t.copied : t.copy}</span>
            </span>
          </button>
          {canRegenerate && (
            <button onClick={onRegenerate} title={t.regenerate}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
                <Icon name="rotate" size={13} />
                <span>{t.regenerate}</span>
              </span>
            </button>
          )}
          {speakingThis ? (
            <button onClick={onStopSpeak} title={t.stopSpeaking}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
                <Icon name="stopSpeak" size={13} />
                <span>{t.stopSpeaking}</span>
              </span>
            </button>
          ) : (
            <button onClick={() => onSpeak(msg.content)} title={t.readAloud}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
                <Icon name="speak" size={13} />
                <span>{t.readAloud}</span>
              </span>
            </button>
          )}
        </footer>
      )}
    </article>
  );
}
