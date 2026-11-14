"use client";
import { useRef, useState, type ChangeEvent } from "react";
import { BookmarkPlus, Check, Download, ImagePlus, MessageSquare, Sparkles, Upload, X } from "lucide-react";
import { ApiClientError, generateImage, type ImageGeneratePayload } from "@/lib/api";
import type { Dict } from "@/lib/i18n";
import type { GeneratedImageArtifact } from "@/lib/types";

interface Props {
  t: Dict;
  getToken: () => Promise<string>;
  imageEnabled: boolean;
  onSaveToLibrary: (img: GeneratedImageArtifact) => Promise<unknown>;
  onSendPromptToChat: (prompt: string) => void;
}

const RATIOS: NonNullable<ImageGeneratePayload["aspectRatio"]>[] = ["1:1", "4:5", "3:2", "16:9", "9:16"];
const STYLES: { id: NonNullable<ImageGeneratePayload["style"]>; label: string }[] = [
  { id: "natural", label: "Natural" },
  { id: "photorealistic", label: "Photorealistic" },
  { id: "illustration", label: "Illustration" },
  { id: "minimal", label: "Minimal" },
  { id: "3d", label: "3D Render" },
  { id: "editorial", label: "Editorial" }
];

function downloadImg(img: GeneratedImageArtifact) {
  const a = document.createElement("a");
  a.href = img.dataUrl;
  a.download = `nexo-studio-${img.id.slice(0, 8)}.png`;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export default function ImageStudio({
  t,
  getToken,
  imageEnabled,
  onSaveToLibrary,
  onSendPromptToChat
}: Props) {
  const [prompt, setPrompt] = useState("");
  const [ratio, setRatio] = useState<NonNullable<ImageGeneratePayload["aspectRatio"]>>("1:1");
  const [style, setStyle] = useState<NonNullable<ImageGeneratePayload["style"]>>("natural");
  const [refImg, setRefImg] = useState<{ base64: string; mime: string; name: string; preview: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<GeneratedImageArtifact[]>([]);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<GeneratedImageArtifact | null>(null);

  const fileRef = useRef<HTMLInputElement | null>(null);

  const handleUpload = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Please select a PNG, JPEG, or WebP reference image.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result || "");
      const idx = dataUrl.indexOf(",");
      if (idx < 0) return;
      setRefImg({
        base64: dataUrl.slice(idx + 1),
        mime: file.type,
        name: file.name,
        preview: dataUrl
      });
      setError(null);
    };
    reader.readAsDataURL(file);
  };

  const handleGenerate = async () => {
    const clean = prompt.trim();
    if (!clean || busy) return;
    setBusy(true);
    setError(null);
    try {
      const token = await getToken();
      const res = await generateImage(token, {
        prompt: clean,
        aspectRatio: ratio,
        style,
        referenceImageBase64: refImg?.base64,
        referenceImageMime: refImg?.mime
      });
      const artifact: GeneratedImageArtifact = {
        id: `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
        prompt: clean,
        aspectRatio: res.aspectRatio,
        mimeType: res.mimeType,
        dataUrl: res.dataUrl,
        createdAt: Date.now()
      };
      setResults((prev) => [artifact, ...prev]);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Image generation failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="nx-view-wrap">
      <div className="nx-view-head">
        <div>
          <h1>{t.viewImageStudio}</h1>
          <p>Create artwork, product visuals, diagrams, or edits powered by NEXO v1.</p>
        </div>
      </div>

      {!imageEnabled && (
        <div className="nx-banner warning">
          <span>{t.featureDisabledNote}</span>
        </div>
      )}

      {error && (
        <div className="nx-banner error">
          <span>{error}</span>
          <button type="button" className="nx-banner-close" onClick={() => setError(null)} aria-label={t.close}>
            <X size={14} />
          </button>
        </div>
      )}

      <div className="nx-surface-card">
        <textarea
          className="nx-textarea"
          style={{ minHeight: 96 }}
          maxLength={2000}
          value={prompt}
          disabled={!imageEnabled || busy}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Describe the image you want NEXO v1 to create or edit…"
        />

        <div style={{ display: "flex", flexWrap: "wrap", gap: 16, justifyContent: "space-between" }}>
          <div>
            <div className="nx-field-hint" style={{ marginBottom: 6 }}>Aspect Ratio</div>
            <div className="nx-chip-row">
              {RATIOS.map((r) => (
                <button
                  key={r}
                  type="button"
                  className={`nx-chip-btn ${ratio === r ? "active" : ""}`}
                  onClick={() => setRatio(r)}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="nx-field-hint" style={{ marginBottom: 6 }}>Style Preset</div>
            <div className="nx-chip-row">
              {STYLES.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  className={`nx-chip-btn ${style === s.id ? "active" : ""}`}
                  onClick={() => setStyle(s.id)}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" onChange={handleUpload} hidden />
            <button
              type="button"
              className="nx-secondary-btn"
              disabled={!imageEnabled || busy}
              onClick={() => fileRef.current?.click()}
            >
              <Upload size={15} />
              <span>{refImg ? `Edit: ${refImg.name}` : "Reference image (optional)"}</span>
            </button>
            {refImg && (
              <button type="button" className="nx-tiny-btn" onClick={() => setRefImg(null)} aria-label={t.delete}>
                <X size={15} />
              </button>
            )}
          </div>

          <button
            type="button"
            className="nx-primary-btn"
            style={{ width: "auto", minWidth: 180 }}
            disabled={!imageEnabled || busy || !prompt.trim()}
            onClick={handleGenerate}
          >
            <Sparkles size={16} />
            <span>{busy ? "Generating…" : "Generate Image"}</span>
          </button>
        </div>
      </div>

      {busy && (
        <div className="nx-studio-grid">
          <div className="nx-media-card">
            <div className="nx-skeleton-bubble" style={{ height: 240, borderRadius: 0 }} />
            <div className="nx-media-body">
              <span className="nx-field-hint">Rendering with NEXO v1…</span>
            </div>
          </div>
        </div>
      )}

      {results.length === 0 && !busy ? (
        <div className="nx-setup-box" style={{ textAlign: "center", padding: 28 }}>
          <ImagePlus size={28} color="var(--accent-blue)" style={{ marginBottom: 8 }} />
          <strong>Ready in Image Studio</strong>
          <span>Your generated images appear here with one-click download and Library saving.</span>
        </div>
      ) : (
        <div className="nx-studio-grid">
          {results.map((img) => (
            <div key={img.id} className="nx-media-card">
              <button
                type="button"
                className="nx-media-thumb"
                onClick={() => setLightbox(img)}
                aria-label={img.prompt}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={img.dataUrl} alt={img.prompt} />
              </button>
              <div className="nx-media-body">
                <span className="nx-media-title">{img.prompt}</span>
                <span className="tabular" style={{ fontSize: 11.5, color: "var(--text-muted)" }}>
                  {img.aspectRatio}
                </span>
                <div className="nx-media-actions">
                  <button type="button" className="nx-secondary-btn" style={{ minHeight: 32, padding: "4px 10px" }} onClick={() => downloadImg(img)}>
                    <Download size={13} />
                    <span>{t.download}</span>
                  </button>
                  <button
                    type="button"
                    className="nx-secondary-btn"
                    style={{ minHeight: 32, padding: "4px 10px" }}
                    onClick={async () => {
                      await onSaveToLibrary(img);
                      setSavedId(img.id);
                      setTimeout(() => setSavedId(null), 1600);
                    }}
                  >
                    {savedId === img.id ? <Check size={13} /> : <BookmarkPlus size={13} />}
                    <span>{savedId === img.id ? t.savedNote : t.saveToLibrary}</span>
                  </button>
                  <button
                    type="button"
                    className="nx-secondary-btn"
                    style={{ minHeight: 32, padding: "4px 10px" }}
                    onClick={() => onSendPromptToChat(img.prompt)}
                  >
                    <MessageSquare size={13} />
                    <span>{t.openInChat}</span>
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {lightbox && (
        <div className="nx-lightbox-backdrop" role="dialog" aria-modal="true" onClick={() => setLightbox(null)}>
          <div className="nx-lightbox-card" onClick={(e) => e.stopPropagation()}>
            <div className="nx-modal-head">
              <h2 style={{ fontSize: 15 }}>{lightbox.prompt}</h2>
              <button type="button" className="nx-tiny-btn" onClick={() => setLightbox(null)} aria-label={t.close}>
                <X size={18} />
              </button>
            </div>
            <div className="nx-lightbox-body">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={lightbox.dataUrl} alt={lightbox.prompt} />
            </div>
            <div className="nx-lightbox-foot">
              <span className="tabular" style={{ fontSize: 12.5, color: "var(--text-muted)" }}>
                NEXO Image Studio · {lightbox.aspectRatio}
              </span>
              <button type="button" className="nx-secondary-btn" onClick={() => downloadImg(lightbox)}>
                <Download size={15} />
                <span>{t.download}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
