"use client";
import { useRef, useState, type KeyboardEvent } from "react";
import type { Attachment } from "@/lib/types";
import type { Dict } from "@/lib/i18n";
import { acceptAttr, readAttachment } from "@/lib/files";

interface Props {
  t: Dict;
  streaming: boolean;
  maxChars: number;
  maxMb: number;
  allowPdf: boolean;
  searchAvailable: boolean;
  useSearch: boolean;
  onToggleSearch: () => void;
  micSupported: boolean;
  listening: boolean;
  interim: string;
  onMicStart: () => void;
  onMicStop: () => void;
  onMicCancel: () => void;
  onSend: (text: string, files: Attachment[]) => void;
  onStop: () => void;
  onError: (msg: string) => void;
}

export default function Composer(p: Props) {
  const [text, setText] = useState("");
  const [files, setFiles] = useState<Attachment[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  const { t } = p;

  const submit = () => {
    const v = text.trim();
    if ((!v && !files.length) || p.streaming) return;
    p.onSend(v, files);
    setText("");
    setFiles([]);
  };
  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); submit(); }
  };
  const onFiles = async (list: FileList | null) => {
    if (!list) return;
    for (const f of Array.from(list)) {
      try { const a = await readAttachment(f, p.maxMb, p.allowPdf); setFiles((x) => [...x, a].slice(0, 4)); }
      catch (e) { p.onError((e as Error).message); }
    }
    if (fileRef.current) fileRef.current.value = "";
  };

  return (
    <div className="composer glass">
      {files.length > 0 && (
        <ul className="chips">
          {files.map((f, i) => (
            <li key={i} className="chip">{f.name}<button aria-label="Remove" onClick={() => setFiles((x) => x.filter((_, j) => j !== i))}>×</button></li>
          ))}
        </ul>
      )}
      {p.listening && (
        <div className="listening" role="status">
          <span className="pulse" />
          <span>{p.interim || t.listening}</span>
        </div>
      )}
      <div className="row">
        <input ref={fileRef} type="file" hidden multiple accept={acceptAttr(p.allowPdf)} onChange={(e) => onFiles(e.target.files)} />
        <button className="icon" title={t.attach} aria-label={t.attach} onClick={() => fileRef.current?.click()} disabled={p.listening}>＋</button>
        {p.searchAvailable && (
          <button className={`icon ${p.useSearch ? "on" : ""}`} title={t.webSearch} aria-label={t.webSearch} aria-pressed={p.useSearch} onClick={p.onToggleSearch}>⌕</button>
        )}
        <textarea
          value={text}
          rows={1}
          maxLength={p.maxChars}
          placeholder={t.placeholder}
          onChange={(e) => { setText(e.target.value); e.target.style.height = "auto"; e.target.style.height = Math.min(e.target.scrollHeight, 180) + "px"; }}
          onKeyDown={onKey}
          disabled={p.listening}
        />
        {p.micSupported && !p.listening && (
          <button className="icon" title={t.mic} aria-label={t.mic} onClick={p.onMicStart} disabled={p.streaming}>🎙</button>
        )}
        {p.listening && (
          <>
            <button className="icon" title={t.micCancel} aria-label={t.micCancel} onClick={p.onMicCancel}>✕</button>
            <button className="icon rec" title={t.micStop} aria-label={t.micStop} onClick={p.onMicStop}>■</button>
          </>
        )}
        {p.streaming ? (
          <button className="send stop" onClick={p.onStop}>{t.stop}</button>
        ) : (
          <button className="send" onClick={submit} disabled={p.listening || (!text.trim() && !files.length)}>{t.send}</button>
        )}
      </div>
    </div>
  );
}
