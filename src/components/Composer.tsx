"use client";
import { useEffect, useRef, useState, type ChangeEvent, type KeyboardEvent } from "react";
import { ArrowUp, AudioLines, Globe, ImagePlus, Mic, MicOff, Paperclip, Square, X } from "lucide-react";
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
  draftKey?: string;
  enterToSend?: boolean;
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
  transcribing?: boolean;
  detectedLanguage?: string | null;
  interim: string;
  micError: string | null;
  onStartMic: () => void;
  onStopMic: () => void;
  onCancelMic: () => void;
  onClearMicError: () => void;
  onSend: (text: string, files: Attachment[]) => void;
  onStop: () => void;
  onOpenJarvis?: () => void;
  onOpenImageStudio?: () => void;
  initialPrompt?: string;
  voiceAppendText?: string;
  onConsumedVoiceAppend?: () => void;
}

const DRAFT_STORAGE_KEY = "nexo.drafts";

function readSavedDraft(key: string): string {
  try {
    const raw = JSON.parse(localStorage.getItem(DRAFT_STORAGE_KEY) || "{}");
    return typeof raw[key] === "string" ? raw[key] : "";
  } catch {
    return "";
  }
}

function writeSavedDraft(key: string, val: string) {
  try {
    const raw = JSON.parse(localStorage.getItem(DRAFT_STORAGE_KEY) || "{}") as Record<string, string>;
    if (!val) {
      delete raw[key];
    } else {
      raw[key] = val.slice(0, 12000);
      const keys = Object.keys(raw);
      if (keys.length > 20) delete raw[keys[0]];
    }
    localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(raw));
  } catch {
    /* ignore storage errors */
  }
}

export default function Composer({
  t,
  busy,
  disabled = false,
  disabledNote,
  isMobile,
  draftKey = "new",
  enterToSend = true,
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
  transcribing = false,
  detectedLanguage,
  interim,
  micError,
  onStartMic,
  onStopMic,
  onCancelMic,
  onClearMicError,
  onSend,
  onStop,
  onOpenJarvis,
  onOpenImageStudio,
  initialPrompt,
  voiceAppendText,
  onConsumedVoiceAppend
}: Props) {
  const [text, setText] = useState("");
  const [files, setFiles] = useState<Attachment[]>([]);
  const [fileError, setFileError] = useState<string | null>(null);
  const [readingFiles, setReadingFiles] = useState(false);

  const areaRef = useRef<HTMLTextAreaElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  // Restore saved draft when switching conversations
  useEffect(() => {
    if (!initialPrompt) {
      setText(readSavedDraft(draftKey));
    }
  }, [draftKey, initialPrompt]);

  useEffect(() => {
    if (initialPrompt) {
      setText(initialPrompt);
      requestAnimationFrame(() => areaRef.current?.focus());
    }
  }, [initialPrompt]);

  // Append verified/editable voice transcription into composer
  useEffect(() => {
    if (voiceAppendText && voiceAppendText.trim()) {
      setText((prev) => {
        const next = prev.trim() ? `${prev.trim()} ${voiceAppendText.trim()}` : voiceAppendText.trim();
        writeSavedDraft(draftKey, next);
        return next;
      });
      onConsumedVoiceAppend?.();
      requestAnimationFrame(() => areaRef.current?.focus());
    }
  }, [voiceAppendText, draftKey, onConsumedVoiceAppend]);

  useEffect(() => {
    const el = areaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [text]);

  const handleTextChange = (next: string) => {
    setText(next);
    writeSavedDraft(draftKey, next);
  };

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
    if (busy || disabled || readingFiles || transcribing) return;
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
    writeSavedDraft(draftKey, "");
    onSend(trimmed, outgoingFiles);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !isMobile && enterToSend) {
      e.preventDefault();
      submit();
    }
  };

  const canSubmit =
    !busy && !disabled && !readingFiles && !transcribing && (text.trim().length > 0 || files.length > 0);
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

      {(listening || transcribing) && (
        <div className="nx-composer-interim" role="status" aria-live="polite">
          <span className="nx-live-dot recording" aria-hidden="true" />
          <span style={{ flex: 1 }}>
            {transcribing ? t.transcribing : interim || t.listening}
          </span>
          {listening && (
            <>
              <button
                type="button"
                className="nx-secondary-btn"
                style={{ minHeight: 32, padding: "4px 10px" }}
                onClick={onStopMic}
              >
                {t.micStop}
              </button>
              <button type="button" className="nx-tiny-btn" onClick={onCancelMic} aria-label={t.micCancel}>
                <X size={15} />
              </button>
            </>
          )}
        </div>
      )}

      {!listening && !transcribing && detectedLanguage && (
        <div className="nx-field-hint" style={{ padding: "0 4px", fontSize: 12 }}>
          {t.detectedLangPrefix}: <strong style={{ color: "var(--accent-blue)" }}>{detectedLanguage}</strong>
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
          onChange={(e) => handleTextChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={readingFiles ? t.reading : transcribing ? t.transcribing : t.placeholder}
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

          {onOpenImageStudio && (
            <button
              type="button"
              className={btnCls}
              disabled={disabled || busy}
              onClick={onOpenImageStudio}
              title={t.viewImageStudio}
              aria-label={t.viewImageStudio}
            >
              <ImagePlus size={18} />
            </button>
          )}

          {micSupported && (
            <button
              type="button"
              className={`${btnCls}${listening ? " active" : ""}`}
              disabled={disabled || busy || transcribing || micPermission === "denied"}
              onClick={listening ? onStopMic : onStartMic}
              title={micPermission === "denied" ? t.micDenied : listening ? t.micStop : t.mic}
              aria-label={listening ? t.micStop : t.mic}
            >
              {micPermission === "denied" ? <MicOff size={18} /> : <Mic size={18} />}
            </button>
          )}

          {onOpenJarvis && micSupported && (
            <button
              type="button"
              className={btnCls}
              disabled={disabled || micPermission === "denied"}
              onClick={onOpenJarvis}
              title={t.jarvisSessionTitle}
              aria-label={t.jarvisSessionTitle}
            >
              <AudioLines size={18} />
              {!isMobile && <span>Jarvis</span>}
            </button>
          )}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {text.length > maxInputChars * 0.85 && (
            <span
              className="tabular"
              style={{
                fontSize: 12,
                color: text.length > maxInputChars ? "var(--status-err)" : "var(--text-muted)"
              }}
            >
              {text.length}/{maxInputChars}
            </span>
          )}

          {busy ? (
            <button type="button" className="nx-send-btn stop" onClick={onStop} aria-label={t.stop}>
              <Square size={15} />
              {!isMobile && <span>{t.stop}</span>}
            </button>
          ) : (
            <button
              type="button"
              className="nx-send-btn"
              disabled={!canSubmit}
              onClick={submit}
              aria-label={t.send}
            >
              <ArrowUp size={18} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
