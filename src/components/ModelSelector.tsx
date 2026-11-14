"use client";
import { Cpu, Eye, FileText, Globe, Image as ImageIcon, Mic, Sparkles } from "lucide-react";
import type { Dict } from "@/lib/i18n";

interface Props {
  t: Dict;
  configured?: boolean;
  searchEnabled?: boolean;
  imageEnabled?: boolean;
  voiceEnabled?: boolean;
  compact?: boolean;
}

export default function ModelSelector({
  t,
  configured = true,
  searchEnabled = false,
  imageEnabled = true,
  voiceEnabled = true,
  compact = false
}: Props) {
  if (compact) {
    return (
      <div
        className="nx-chip-btn active"
        style={{ minHeight: 32, padding: "4px 10px", cursor: "default" }}
        title={t.modelHint}
      >
        <Sparkles size={13} />
        <span>NEXO v1</span>
      </div>
    );
  }

  const caps = [
    { label: t.capStream, icon: <Cpu size={14} />, active: configured },
    { label: t.capVision, icon: <Eye size={14} />, active: configured },
    { label: t.capPdf, icon: <FileText size={14} />, active: configured },
    { label: t.capImage, icon: <ImageIcon size={14} />, active: imageEnabled },
    { label: t.capVoice, icon: <Mic size={14} />, active: voiceEnabled },
    { label: t.capSearch, icon: <Globe size={14} />, active: searchEnabled }
  ];

  return (
    <div className="nx-field-card">
      <div className="nx-field-row">
        <span className="nx-field-label">{t.modelLabel}</span>
        <span className="nx-field-hint" style={{ color: "var(--accent-blue)", fontWeight: 600 }}>
          {t.modelDefault}
        </span>
      </div>

      <p className="nx-field-hint">{t.modelHint}</p>

      <div className="nx-chip-row">
        {caps.map((c) => (
          <span
            key={c.label}
            className={`nx-chip-btn ${c.active ? "active" : ""}`}
            style={{ minHeight: 30, fontSize: 12, opacity: c.active ? 1 : 0.45, cursor: "default" }}
          >
            {c.icon}
            <span>{c.label}</span>
          </span>
        ))}
      </div>
    </div>
  );
}
