"use client";
import dynamic from "next/dynamic";
import { useCallback, useRef, useState } from "react";
import type { Dict } from "@/lib/i18n";
import type { Conversation, Lang } from "@/lib/types";
import { acceptAttr } from "@/lib/files";
import { promptsFor } from "@/lib/prompts";
import { Icon } from "./icons";

import { isWebGLAvailable } from "@/lib/webgl";

const JarvisCore = dynamic(() => import("../JarvisCore"), { ssr: false });

interface Props {
  t: Dict;
  lang: Lang;
  name: string;
  avatarOn: boolean;
  status: "online" | "offline" | "unavailable";
  allowPdf: boolean;
  micSupported: boolean;
  convs: Conversation[];
  onNew: () => void;
  onPrompt: (text: string) => void;
  onOpen: (id: string) => void;
  onSeeAll: () => void;
  onVoice: () => void;
  onFiles: (files: File[]) => void;
}

export default function HomeScreen(p: Props) {
  const { t } = p;
  const imgRef = useRef<HTMLInputElement>(null);
  const docRef = useRef<HTMLInputElement>(null);
  const [webgl, setWebgl] = useState(() => isWebGLAvailable());
  const onFail = useCallback(() => setWebgl(false), []);

  const now = new Date();
  const hour = now.getHours();
  const greet = hour < 12 ? t.greetMorning : hour < 18 ? t.greetAfternoon : t.greetEvening;
  const date = now.toLocaleDateString(p.lang === "si" ? "si-LK" : "en-US", { weekday: "long", month: "long", day: "numeric" });
  const first = p.name.split(" ")[0];
  const suggestions = promptsFor(p.lang).map((g) => g.prompts[0]);
  const docAccept = acceptAttr(p.allowPdf).split(",").filter((x) => !x.startsWith("image/")).join(",");
  const statusLabel = p.status === "online" ? t.available : p.status === "offline" ? t.offlineShort : t.unavailable;

  const pick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (files.length) p.onFiles(files);
  };

  return (
    <div className="m-screen m-home">
      <header className="m-home-head">
        <span className="m-brand"><span className="logo">N</span>NEXO AI</span>
        <span className="m-pill" data-status={p.status} role="status"><i />{statusLabel}</span>
      </header>

      <div className="m-core" aria-hidden={p.avatarOn ? "true" : undefined}>
        {p.avatarOn && webgl ? <JarvisCore onFail={onFail} /> : (
          <div className="core-fallback" aria-hidden="true"><span /><span /><span /></div>
        )}
      </div>

      <section className="m-hello">
        <p className="m-date">{date}{first ? ` · ${greet}, ${first}` : ""}</p>
        <h1>{t.hello}</h1>
        <p>{t.helloSub}</p>
      </section>

      <button className="m-primary" onClick={p.onNew}><Icon name="plus" size={20} />{t.newChat}</button>

      <div className="m-quick">
        {p.micSupported && (
          <button onClick={p.onVoice}><Icon name="mic" /><span>{t.quickVoice}</span></button>
        )}
        <button onClick={() => imgRef.current?.click()}><Icon name="image" /><span>{t.quickImage}</span></button>
        <button onClick={() => docRef.current?.click()}><Icon name="doc" /><span>{t.quickDoc}</span></button>
        <input ref={imgRef} type="file" hidden multiple accept="image/png,image/jpeg,image/webp,image/gif" onChange={pick} />
        <input ref={docRef} type="file" hidden multiple accept={docAccept} onChange={pick} />
      </div>

      <section className="m-section">
        <h2>{t.suggested}</h2>
        <ul className="m-list">
          {suggestions.map((s) => (
            <li key={s}><button className="m-row" onClick={() => p.onPrompt(s)}><span className="m-row-text">{s}</span><Icon name="chevron" size={18} /></button></li>
          ))}
        </ul>
      </section>

      {p.convs.length > 0 && (
        <section className="m-section">
          <div className="m-section-head"><h2>{t.recent}</h2><button className="m-link" onClick={p.onSeeAll}>{t.seeAll}</button></div>
          <ul className="m-list">
            {p.convs.slice(0, 3).map((c) => (
              <li key={c.id}><button className="m-row" onClick={() => p.onOpen(c.id)}><span className="m-row-text">{c.title}</span><Icon name="chevron" size={18} /></button></li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
