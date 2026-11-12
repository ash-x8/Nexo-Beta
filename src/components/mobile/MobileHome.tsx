"use client";
import { Compass, MessageSquarePlus, Mic } from "lucide-react";
import type { Dict } from "@/lib/i18n";
import { promptsFor } from "@/lib/prompts";
import type { Conversation, Lang } from "@/lib/types";
import JarvisCore from "../JarvisCore";

interface Props {
  t: Dict;
  lang: Lang;
  nickname: string;
  avatarOn: boolean;
  online: boolean;
  serverConfigured: boolean;
  convs: Conversation[];
  micSupported: boolean;
  onNewChat: () => void;
  onStartVoice: () => void;
  onOpenExplore: () => void;
  onSeeAllChats: () => void;
  onSelectConv: (id: string) => void;
  onPickPrompt: (prompt: string) => void;
}

function greeting(t: Dict): string {
  const hr = new Date().getHours();
  if (hr < 12) return t.greetMorning;
  if (hr < 18) return t.greetAfternoon;
  return t.greetEvening;
}

export default function MobileHome({
  t,
  lang,
  nickname,
  avatarOn,
  online,
  serverConfigured,
  convs,
  micSupported,
  onNewChat,
  onStartVoice,
  onOpenExplore,
  onSeeAllChats,
  onSelectConv,
  onPickPrompt
}: Props) {
  const groups = promptsFor(lang);
  const featuredPrompts = groups.slice(0, 3).map((g) => ({ cat: g.label, text: g.prompts[0] }));
  const greet = greeting(t) + (nickname.trim() ? `, ${nickname.trim()}` : "");

  return (
    <div className="nx-mob-scroll">
      <div className="nx-mob-head-row">
        <span className="nx-mob-brand">NEXO AI</span>
        <div className="nx-mob-meta-line">
          <span className={`nx-live-dot ${!online ? "offline" : ""}`} aria-hidden="true" />
          <span>{!online ? t.offlineShort : serverConfigured ? t.available : t.unavailable}</span>
        </div>
      </div>

      <section className="nx-mob-hero">
        {avatarOn && (
          <div className="nx-mob-orb">
            <JarvisCore />
          </div>
        )}
        <h1>{greet}</h1>
        <p>{t.helloSub}</p>
      </section>

      <div className="nx-mob-cta-row">
        <button type="button" className="nx-mob-quick-btn" onClick={onNewChat}>
          <MessageSquarePlus size={20} />
          <span>{t.newChat.split(" ")[0]}</span>
        </button>

        <button type="button" className="nx-mob-quick-btn" disabled={!micSupported} onClick={onStartVoice}>
          <Mic size={20} />
          <span>{t.quickVoice}</span>
        </button>

        <button type="button" className="nx-mob-quick-btn" onClick={onOpenExplore}>
          <Compass size={20} />
          <span>{t.navExplore}</span>
        </button>
      </div>

      {convs.length > 0 && (
        <>
          <div className="nx-mob-section-head">
            <h2>{t.recent}</h2>
            <button type="button" className="nx-link-btn" onClick={onSeeAllChats}>
              {t.seeAll}
            </button>
          </div>
          <div className="nx-mob-list">
            {convs.slice(0, 4).map((c) => (
              <button key={c.id} type="button" className="nx-mob-row" onClick={() => onSelectConv(c.id)}>
                <div className="nx-mob-row-main">
                  <span className="nx-mob-row-title">{c.title}</span>
                  <span className="nx-mob-row-sub tabular">
                    {new Date(c.updatedAt).toLocaleDateString()}
                  </span>
                </div>
              </button>
            ))}
          </div>
        </>
      )}

      <div className="nx-mob-section-head">
        <h2>{t.suggested}</h2>
      </div>
      <div className="nx-mob-list">
        {featuredPrompts.map((p) => (
          <button key={p.text} type="button" className="nx-mob-row" onClick={() => onPickPrompt(p.text)}>
            <div className="nx-mob-row-main">
              <span className="nx-mob-row-sub">{p.cat}</span>
              <span className="nx-mob-row-title" style={{ whiteSpace: "normal" }}>
                {p.text}
              </span>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
