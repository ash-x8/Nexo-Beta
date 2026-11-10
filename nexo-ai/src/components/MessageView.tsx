"use client";
import { useRef, useState, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import type { ChatMessage } from "@/lib/types";
import type { Dict } from "@/lib/i18n";

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
      >
        {done ? "✓" : "Copy"}
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
        <span className="who">{isUser ? t.you : t.assistantName}</span>
        <time dateTime={new Date(msg.createdAt).toISOString()}>{time}</time>
      </header>

      {msg.attachments?.length ? (
        <ul className="attached">{msg.attachments.map((a, i) => <li key={i}>{a.name}</li>)}</ul>
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
              a: ({ href, children }) => <a href={href} target="_blank" rel="noopener noreferrer">{children}</a>
            }}
          >
            {msg.content}
          </ReactMarkdown>
        </div>
      ) : streaming ? (
        <div className="thinking" role="status" aria-label={t.thinking}><i /><i /><i /><span>{t.thinking}</span></div>
      ) : null}

      {msg.sources?.length ? (
        <div className="sources">
          <span>{t.sources}</span>
          {msg.sources.map((s, i) => (
            <a key={i} href={s.url} target="_blank" rel="noopener noreferrer" title={s.url}>[{i + 1}] {s.title}</a>
          ))}
        </div>
      ) : null}

      {!isUser && msg.content && !streaming && (
        <footer>
          <button onClick={async () => { await navigator.clipboard.writeText(msg.content); setCopied(true); setTimeout(() => setCopied(false), 1500); }}>
            {copied ? t.copied : t.copy}
          </button>
          {canRegenerate && <button onClick={onRegenerate}>{t.regenerate}</button>}
          {speakingThis ? <button onClick={onStopSpeak}>{t.stopSpeaking}</button> : <button onClick={() => onSpeak(msg.content)}>{t.readAloud}</button>}
        </footer>
      )}
    </article>
  );
}
