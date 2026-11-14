"use client";
import type { Dict } from "@/lib/i18n";
import type { ModelCatalogItem } from "@/lib/types";

interface Props {
  t: Dict;
  selectedModel: string;
  defaultModel: string;
  catalog: ModelCatalogItem[];
  onSelect: (modelId: string) => void;
  compact?: boolean;
}

export default function ModelSelector({
  t,
  selectedModel,
  defaultModel,
  catalog,
  onSelect,
  compact = false
}: Props) {
  const effectiveId = selectedModel || defaultModel;
  const activeItem = catalog.find((m) => m.id === effectiveId) || catalog[0];

  if (compact) {
    return (
      <div className="nx-model-compact">
        <select
          className="nx-select nx-select-compact"
          value={selectedModel}
          onChange={(e) => onSelect(e.target.value)}
          aria-label={t.modelLabel}
        >
          <option value="">
            {t.modelDefault} ({defaultModel || "auto"})
          </option>
          {catalog.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name} {m.freeEligible ? `· ${t.freeTierBadge}` : ""}
            </option>
          ))}
        </select>
      </div>
    );
  }

  return (
    <div className="nx-model-selector">
      <div className="nx-field-card">
        <div className="nx-field-row">
          <span className="nx-field-label">{t.modelLabel}</span>
          <span className="nx-field-hint">
            {activeItem
              ? `${activeItem.provider} · ${activeItem.freeEligible ? t.freeTierBadge : t.modelLabel}`
              : t.freeTierBadge}
          </span>
        </div>

        <select
          className="nx-select"
          value={selectedModel}
          onChange={(e) => onSelect(e.target.value)}
          aria-label={t.modelLabel}
        >
          <option value="">
            {t.modelDefault} ({defaultModel || "default"})
          </option>
          {catalog.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name} ({m.id})
            </option>
          ))}
        </select>
        <p className="nx-field-hint">{t.modelHint}</p>
      </div>

      {catalog.length > 0 && (
        <div className="nx-model-list" role="radiogroup" aria-label={t.modelsTitle}>
          {catalog.map((m) => {
            const isSelected = selectedModel === m.id || (!selectedModel && m.isDefault);
            const statusText =
              m.status === "rate_limited"
                ? t.statusRateLimited
                : m.status === "unavailable"
                  ? t.statusUnavailable
                  : t.statusAvailable;
            const caps = [
              m.capabilities.streaming ? t.capStream : null,
              m.capabilities.vision ? t.capVision : null,
              m.capabilities.pdf ? t.capPdf : null,
              m.capabilities.webSearch ? t.capSearch : null
            ]
              .filter(Boolean)
              .join(" · ");

            return (
              <button
                key={m.id}
                type="button"
                role="radio"
                aria-checked={isSelected}
                className={`nx-model-row ${isSelected ? "active" : ""}`}
                onClick={() => onSelect(m.isDefault ? "" : m.id)}
              >
                <div className="nx-model-row-top">
                  <span className="nx-model-name">{m.name}</span>
                  <span className={`nx-model-status ${m.status}`}>
                    {statusText}
                  </span>
                </div>
                <div className="nx-model-meta">
                  <span>{m.provider}</span>
                  <span aria-hidden="true">·</span>
                  <span>{m.freeEligible ? t.freeTierBadge : t.unavailable}</span>
                  {m.contextWindow && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span className="tabular">{Math.round(m.contextWindow / 1024)}k {t.contextLabel}</span>
                    </>
                  )}
                </div>
                <div className="nx-model-caps">{caps}</div>
                <div className="nx-model-note">{m.limitNote}</div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
