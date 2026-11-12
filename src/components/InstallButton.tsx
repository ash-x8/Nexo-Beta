"use client";
import { useState } from "react";
import { Download, Share, X } from "lucide-react";
import { useInstall } from "@/lib/useInstall";

interface Props {
  label: string;
  iosPrompt?: string;
  closeLabel?: string;
  compact?: boolean;
}

export default function InstallButton({
  label,
  iosPrompt = "On iPhone or iPad, tap Share in Safari and select Add to Home Screen.",
  closeLabel = "Close",
  compact = false
}: Props) {
  const { canInstall, showIosHelp, standalone, install } = useInstall();
  const [iosOpen, setIosOpen] = useState(false);

  if (standalone) return null;

  if (canInstall) {
    return (
      <button type="button" className={compact ? "nx-secondary-btn" : "nx-primary-btn"} onClick={install}>
        <Download size={16} />
        <span>{label}</span>
      </button>
    );
  }

  if (showIosHelp) {
    return (
      <>
        <button type="button" className={compact ? "nx-secondary-btn" : "nx-primary-btn"} onClick={() => setIosOpen(true)}>
          <Share size={16} />
          <span>{label}</span>
        </button>
        {iosOpen && (
          <div className="nx-modal-backdrop" role="dialog" aria-modal="true" onClick={() => setIosOpen(false)}>
            <div className="nx-auth-card" style={{ maxWidth: 360 }} onClick={(e) => e.stopPropagation()}>
              <div style={{ display: "flex", width: "100%", justifyContent: "space-between", alignItems: "center" }}>
                <strong style={{ fontSize: 16 }}>{label}</strong>
                <button type="button" className="nx-tiny-btn" onClick={() => setIosOpen(false)} aria-label={closeLabel}>
                  <X size={16} />
                </button>
              </div>
              <p className="nx-auth-sub">{iosPrompt}</p>
              <button type="button" className="nx-primary-btn" onClick={() => setIosOpen(false)}>
                {closeLabel}
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return null;
}
