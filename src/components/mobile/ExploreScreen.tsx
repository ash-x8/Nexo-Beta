"use client";
import type { Dict } from "@/lib/i18n";
import type { Lang } from "@/lib/types";
import { capabilitiesFor, promptsFor } from "@/lib/prompts";
import { Icon } from "./icons";

interface Props {
  t: Dict;
  lang: Lang;
  searchEnabled: boolean;
  pdf: boolean;
  voiceServer: boolean;
  onPrompt: (text: string) => void;
}

export default function ExploreScreen({ t, lang, searchEnabled, pdf, voiceServer, onPrompt }: Props) {
  return (
    <div className="m-screen">
      <header className="m-title-row"><h1 className="m-title">{t.exploreTitle}</h1></header>
      <p className="m-empty-note">{t.exploreSub}</p>

      {promptsFor(lang).map((g) => (
        <section className="m-section" key={g.id}>
          <h2>{g.label}</h2>
          <ul className="m-list">
            {g.prompts.map((s) => (
              <li key={s}><button className="m-row" onClick={() => onPrompt(s)}><span className="m-row-text">{s}</span><Icon name="chevron" size={18} /></button></li>
            ))}
          </ul>
        </section>
      ))}

      <section className="m-section">
        <h2>{t.capabilities}</h2>
        <ul className="m-caps">
          {capabilitiesFor(lang, { search: searchEnabled, pdf, voiceServer }).map((c) => <li key={c}>{c}</li>)}
        </ul>
      </section>
    </div>
  );
}
