"use client";
import type { Dict } from "@/lib/i18n";
import { capabilitiesFor, promptsFor } from "@/lib/prompts";
import type { Lang, PublicConfig } from "@/lib/types";

interface Props {
  t: Dict;
  lang: Lang;
  config: PublicConfig | null;
  onPickPrompt: (prompt: string) => void;
}

export default function MobileExplore({ t, lang, config, onPickPrompt }: Props) {
  const groups = promptsFor(lang);
  const caps = capabilitiesFor(lang, {
    search: Boolean(config?.searchEnabled),
    pdf: config?.provider === "gemini",
    voiceServer: Boolean(config?.ttsServer)
  });

  return (
    <div className="nx-mob-scroll">
      <div className="nx-mob-head-row" style={{ marginBottom: 8 }}>
        <span className="nx-mob-brand">{t.exploreTitle}</span>
      </div>
      <p style={{ margin: "0 0 18px", fontSize: 13.5, color: "var(--text-secondary)" }}>{t.exploreSub}</p>

      {groups.map((g) => (
        <div key={g.id}>
          <div className="nx-group-label">{g.label}</div>
          <div className="nx-mob-list">
            {g.prompts.map((p) => (
              <button key={p} type="button" className="nx-mob-row" onClick={() => onPickPrompt(p)}>
                <span className="nx-mob-row-title" style={{ whiteSpace: "normal", textAlign: "left" }}>
                  {p}
                </span>
              </button>
            ))}
          </div>
        </div>
      ))}

      <div className="nx-group-label" style={{ marginTop: 22 }}>
        {t.capabilities}
      </div>
      <div className="nx-mob-list">
        {caps.map((cap) => (
          <div key={cap} className="nx-mob-row">
            <span className="nx-mob-row-title" style={{ whiteSpace: "normal", fontSize: 13.5, color: "var(--text-secondary)" }}>
              {cap}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
