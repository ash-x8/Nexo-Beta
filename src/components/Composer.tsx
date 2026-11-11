"use client";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import type { Attachment } from "@/lib/types";
import type { Dict } from "@/lib/i18n";
import { acceptAttr, readAttachment } from "@/lib/files";
import BottomSheet from "./mobile/BottomSheet";
import { Icon } from "./mobile/icons";

interface Props {
  t: Dict;
  mobile: boolean;
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
  /** files chosen elsewhere (e.g. Home quick actions) to attach once */
  seed: Attachment[];
  onSeedUsed: () => void;
  onMicStart: () => void;
  onMicStop: () => void;
  onMicCancel: () => void;
  onSend: (text: string, files: Attachment[]) => void;
  onStop: () => void;
  onError: (msg: string) => void;
}

function sizeLabel(a: Attachment): string {
  const n = a.size ?? (a.text ? a.text.length : Math.round(((a.data?.length ?? 0) * 3) / 4));
  return n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`;
}

export default function Composer(p: Props) {
  const [text, setText] = useState("");
  const [files, setFiles] = useState<Attachment[]>([]);
  const [reading, setReading] = useState(false);
  const [sheet, setSheet] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const imgRef = useRef<HTMLInputElement>(null);
  const { t, seed, onSeedUsed } = p;

  useEffect(() => {
    if (seed.length) { setFiles((x) => [...x, ...seed].slice(0, 4)); onSeedUsed(); }
  }, [seed, onSeedUsed]);

  const submit = () => {
    const v = text.trim();
    if ((!v && !files.length) || p.streaming || reading) return;
    p.onSend(v, files);
    setText("");
    setFiles([]);
  };
  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // Enter sends on desktop; on phones Enter inserts a new line and the Send button sends.
    if (!p.mobile && e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); submit(); }
  };
  const onFiles = async (list: FileList | null, input: HTMLInputElement | null) => {
    if (!list) return;
    const picked = Array.from(list);
    if (input) input.value = "";
    setReading(true);
    for (const f of picked) {
      try { const a = await readAttachment(f, p.maxMb, p.allowPdf); setFiles((x) => [...x, a].slice(0, 4)); }
      catch (e) { p.onError((e as Error).message); }
    }
    setReading(false);
  };
  const docAccept = acceptAttr(p.allowPdf);
  const imgAccept = "image/png,image/jpeg,image/webp,image/gif";

  return (
    <div className="composer glass">
      {(files.length > 0 || reading) && (
        <ul className="chips">
          {files.map((f, i) => (
            <li key={i} className="chip att">
              {f.data && f.mime.startsWith("image/") && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={`data:${f.mime};base64,${f.data}`} alt="" />
              )}
              <span className="nm">{f.name}</span>
              <span className="sz">{sizeLabel(f)}</span>
              <button aria-label="Remove" onClick={() => setFiles((x) => x.filter((_, j) => j !== i))}>×</button>
            </li>
          ))}
          {reading && <li className="chip att" role="status">{t.reading}</li>}
        </ul>
      )}
      {p.listening && (
        <div className="listening" role="status">
          <span className="pulse" />
          <span>{p.interim || t.listening}</span>
        </div>
      )}
      <div className="row">
        <input ref={fileRef} type="file" hidden multiple accept={docAccept} onChange={(e) => onFiles(e.target.files, fileRef.current)} />
        <input ref={imgRef} type="file" hidden multiple accept={imgAccept} onChange={(e) => onFiles(e.target.files, imgRef.current)} />
        <button className="icon" title={t.attach} aria-label={t.attach} disabled={p.listening}
          onClick={() => (p.mobile ? setSheet(true) : fileRef.current?.click())}>
          <Icon name="plus" size={18} />
        </button>
        {p.searchAvailable && (
          <button className={`icon ${p.useSearch ? "on" : ""}`} title={t.webSearch} aria-label={t.webSearch} aria-pressed={p.useSearch} onClick={p.onToggleSearch}>
            <Icon name="globe" size={18} />
          </button>
        )}
        <textarea
          value={text}
          rows={1}
          maxLength={p.maxChars}
          placeholder={t.placeholder}
          onChange={(e) => { setText(e.target.value); e.target.style.height = "auto"; e.target.style.height = Math.min(e.target.scrollHeight, 160) + "px"; }}
          onKeyDown={onKey}
          disabled={p.listening}
        />
        {p.micSupported && !p.listening && (
          <button className="icon" title={t.mic} aria-label={t.mic} onClick={p.onMicStart} disabled={p.streaming}>
            <Icon name="mic" size={18} />
          </button>
        )}
        {p.listening && (
          <>
            <button className="icon" title={t.micCancel} aria-label={t.micCancel} onClick={p.onMicCancel}>
              <Icon name="close" size={18} />
            </button>
            <button className="icon rec" title={t.micStop} aria-label={t.micStop} onClick={p.onMicStop}>
              <Icon name="stop" size={18} />
            </button>
          </>
        )}
        {p.streaming ? (
          <button className="send stop" onClick={p.onStop}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
              <Icon name="stop" size={16} />
              <span>{t.stop}</span>
            </span>
          </button>
        ) : (
          <button className="send" onClick={submit} disabled={p.listening || reading || (!text.trim() && !files.length)}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
              <Icon name="send" size={16} />
              <span>{t.send}</span>
            </span>
          </button>
        )}
      </div>

      <BottomSheet open={sheet} title={t.attachMenu} onClose={() => setSheet(false)}>
        <ul className="m-actions">
          <li><button onClick={() => { setSheet(false); imgRef.current?.click(); }}><Icon name="image" />{t.attachImage}</button></li>
          <li><button onClick={() => { setSheet(false); fileRef.current?.click(); }}><Icon name="doc" />{t.attachFile}</button></li>
        </ul>
      </BottomSheet>
    </div>
  );
}
