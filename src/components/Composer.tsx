"use client";
import { useEffect, useRef, useState, type ChangeEvent, type KeyboardEvent } from "react";
import { ArrowUp, Globe, Mic, MicOff, Paperclip, Square, X } from "lucide-react";
import { acceptAttr, readAttachment } from "@/lib/files";
import type { Dict } from "@/lib/i18n";
import type { Attachment } from "@/lib/types";
import type { MicPermission } from "@/lib/useSpeechRecognition";

interface Props {
  t: Dict;
  busy: boolean;
  disabled?: boolean;
  disabledNote?: string;
  isMobile: boolean;
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
  interim: string;
  micError: string | null;
  onStartMic: () => void;
  onStopMic: () => void;
  onCancelMic: () => void;
  onClearMicError: () => void;
  onSend: (text: string, files: Attachment[]) => void;
  onStop: () => void;
  initialPrompt?: string;
}

export default function Composer({
  t,
  busy,
  disabled = false,
  disabledNote,
  isMobile,
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
  interim,
  micError,
  onStartMic,
  onStopMic,
  onCancelMic,
  onClearMicError,
  onSend,
  onStop,
  initialPrompt
}: Props) {
  const [text, setText] = useState("");
  const [files, setFiles] = useState<Attachment[]>([]);
  const [fileError, setFileError] = useState<string | null>(null);
  const [readingFiles, setReadingFiles] = useState(false);

  const areaRef = useRef<HTMLTextAreaElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (initialPrompt) {
      setText(initialPrompt);
      requestAnimationFrame(() => areaRef.current?.focus());
    }
  }, [initialPrompt]);

  useEffect(() => {
    const el = areaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [text]);

  const handleFiles = async (e: ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(e.target.files || []);
    e.target.value = "";
    if (!picked.length) return;
    setFileError(null);
    setReadingFiles(true);
    try {
      const next: Attachment[] = [];
      for (const f of picked.slice(0, 4 - files.length)) {
        next.push(await readAttachment(f, maxAttachmentMb, allowPdf));
      }
      setFiles((prev) => [...prev, ...next].slice(0, 4));
    } catch (err) {
      setFileError((err as Error).message);
    } finally {
      setReadingFiles(false);
    }
  };

  const submit = () => {
    if (busy || disabled || readingFiles) return;
    const trimmed = text.trim();
    if (!trimmed && files.length === 0) return;
    if (trimmed.length > maxInputChars) {
      setFileError(`Message is too long (max ${maxInputChars} characters).`);
      return;
    }
    const outgoingFiles = files;
    setText("");
    setFiles([]);
    setFileError(null);
    onSend(trimmed, outgoingFiles);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !isMobile) {
      e.preventDefault();
      submit();
    }
  };

  const canSubmit = !busy && !disabled && !readingFiles && (text.trim().length > 0 || files.length > 0);
  const btnCls = isMobile ? "nx-mob-touch-btn" : "nx-icon-btn";

  return (
    <div className="nx-composer">
      {disabledNote && (
        <div className="nx-banner warning">
          <span>{disabledNote}</span>
        </div>
      )}
      {(fileError || micError) && (
        <div className="nx-banner error">
          <span>{fileError || micError}</span>
          <button
            type="button"
            className="nx-banner-close"
            onClick={() => {
              setFileError(null);
              onClearMicError();
            }}
            aria-label={t.close}
          >
            <X size={14} />
          </button>
        </div>
      )}

      {listening && (
        <div className="nx-composer-interim" role="status" aria-live="polite">
          <span className="nx-live-dot recording" aria-hidden="true" />
          <span style={{ flex: 1 }}>{interim || t.listening}</span>
          <button type="button" className="nx-secondary-btn" style={{ minHeight: 32, padding: "4px 10px" }} onClick={onStopMic}>
            {t.micStop}
          </button>
          <button type="button" className="nx-tiny-btn" onClick={onCancelMic} aria-label={t.micCancel}>
            <X size={15} />
          </button>
        </div>
      )}

      {files.length > 0 && (
        <div className="nx-composer-files">
          {files.map((f, i) => (
            <span key={`${f.name}-${i}`} className="nx-file-chip">
              <span>{f.name}</span>
              <button
                type="button"
                className="nx-file-remove"
                onClick={() => setFiles((prev) => prev.filter((_, idx) => idx !== i))}
                aria-label={t.delete}
              >
                <X size={13} />
              </button>
            </span>
          ))}
        </div>
      )}

      <div className="nx-composer-row">
        <textarea
          ref={areaRef}
          rows={1}
          value={text}
          disabled={disabled}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={readingFiles ? t.reading : t.placeholder}
          aria-label={t.placeholder}
        />
      </div>

      <div className="nx-composer-tools">
        <div className="nx-composer-left">
          {attachmentsEnabled && (
            <>
              <input
                ref={fileRef}
                type="file"
                multiple
                accept={acceptAttr(allowPdf)}
                onChange={handleFiles}
                hidden
              />
              <button
                type="button"
                className={btnCls}
                disabled={disabled || busy || files.length >= 4}
                onClick={() => fileRef.current?.click()}
                title={t.attach}
                aria-label={t.attach}
              >
                <Paperclip size={18} />
              </button>
            </>
          )}

          {searchEnabled && (
            <button
              type="button"
              className={`${btnCls}${useSearch ? " active" : ""}`}
              disabled={disabled}
              onClick={onToggleSearch}
              title={t.webSearch}
              aria-label={t.webSearch}
              aria-pressed={useSearch}
            >
              <Globe size={18} />
              {!isMobile && <span>{t.webSearch}</span>}
            </button>
          )}

          {micSupported && (
            <button
              type="button"
              className={`${btnCls}${listening ? " active" : ""}`}
              disabled={disabled || busy || micPermission === "denied"}
              onClick={listening ? onStopMic : onStartMic}
              title={micPermission === "denied" ? t.micDenied : listening ? t.micStop : t.mic}
              aria-label={listening ? t.micStop : t.mic}
            >
              {micPermission === "denied" ? <MicOff size={18} /> : <Mic size={18} />}
            </button>
          )}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {text.length > maxInputChars * 0.85 && (
            <span className="tabular" style={{ fontSize: 12, color: text.length > maxInputChars ? "var(--status-err)" : "var(--text-muted)" }}>
              {text.length}/{maxInputChars}
            </span>
          )}

          {busy ? (
            <button type="button" className="nx-send-btn stop" onClick={onStop} aria-label={t.stop}>
              <Square size={15} />
              {!isMobile && <span>{t.stop}</span>}
            </button>
          ) : (
            <button type="button" className="nx-send-btn" disabled={!canSubmit} onClick={submit} aria-label={t.send}>
              <ArrowUp size={18} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
