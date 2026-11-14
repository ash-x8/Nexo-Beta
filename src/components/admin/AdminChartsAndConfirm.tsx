"use client";
import { useEffect } from "react";
import { AlertTriangle, X } from "lucide-react";
import type { ConfirmPromptState } from "./adminTypes";

export function DailyBarChart({
  title,
  points,
  variant = "primary",
  emptyText = "No usage data recorded for this window yet."
}: {
  title: string;
  points: { label: string; value: number; hint?: string }[];
  variant?: "primary" | "alt" | "err";
  emptyText?: string;
}) {
  const maxVal = Math.max(1, ...points.map((p) => p.value));
  const total = points.reduce((acc, p) => acc + p.value, 0);

  return (
    <div className="nx-admin-card">
      <div className="nx-admin-card-head">
        <h3>{title}</h3>
        <span className="nx-kpi-sub tabular">Total: {total.toLocaleString()}</span>
      </div>
      {points.length === 0 ? (
        <p className="nx-field-hint">{emptyText}</p>
      ) : (
        <div className="nx-bar-chart" role="img" aria-label={title}>
          {points.map((pt) => {
            const pct = Math.max(3, Math.round((pt.value / maxVal) * 100));
            return (
              <div
                key={pt.label}
                className="nx-bar-col"
                title={pt.hint || `${pt.label}: ${pt.value.toLocaleString()}`}
              >
                <div
                  className={`nx-bar-fill ${variant === "alt" ? "alt" : variant === "err" ? "err" : ""}`}
                  style={{ height: `${pt.value === 0 ? 3 : pct}%`, opacity: pt.value === 0 ? 0.25 : 1 }}
                />
                <span className="nx-bar-date">{pt.label.slice(5)}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function BreakdownCard({
  title,
  entries,
  emptyLabel = "No recorded usage yet."
}: {
  title: string;
  entries: Record<string, number>;
  emptyLabel?: string;
}) {
  const sorted = Object.entries(entries).sort((a, b) => b[1] - a[1]);
  const maxVal = Math.max(1, ...sorted.map(([, v]) => v));

  return (
    <div className="nx-admin-card">
      <div className="nx-admin-card-head">
        <h3>{title}</h3>
      </div>
      {sorted.length === 0 ? (
        <p className="nx-field-hint">{emptyLabel}</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {sorted.map(([key, count]) => (
            <div key={key} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <div className="nx-kv-row" style={{ fontSize: 13 }}>
                <span className="mono" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {key}
                </span>
                <span className="tabular" style={{ fontWeight: 600 }}>
                  {count.toLocaleString()}
                </span>
              </div>
              <div className="nx-meter">
                <div className="nx-meter-fill" style={{ width: `${Math.max(4, Math.round((count / maxVal) * 100))}%` }} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function ConfirmDialog({
  prompt,
  busy,
  onCancel
}: {
  prompt: ConfirmPromptState | null;
  busy: boolean;
  onCancel: () => void;
}) {
  useEffect(() => {
    if (!prompt) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [prompt, busy, onCancel]);

  if (!prompt) return null;

  return (
    <div className="nx-modal-backdrop" role="dialog" aria-modal="true" aria-label={prompt.title} onClick={() => !busy && onCancel()}>
      <div className="nx-confirm-modal" onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <AlertTriangle size={18} color={prompt.danger ? "var(--status-err)" : "var(--status-warn)"} />
            <h3>{prompt.title}</h3>
          </div>
          <button type="button" className="nx-tiny-btn" disabled={busy} onClick={onCancel} aria-label="Close">
            <X size={16} />
          </button>
        </div>
        <p>{prompt.body}</p>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 4 }}>
          <button type="button" className="nx-secondary-btn" disabled={busy} onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
            className={prompt.danger ? "nx-danger-btn" : "nx-admin-btn-primary"}
            disabled={busy}
            onClick={() => prompt.onConfirm()}
          >
            {busy ? "Working…" : prompt.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
