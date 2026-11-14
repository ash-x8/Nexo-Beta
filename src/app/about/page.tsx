"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { AboutCreditsContent } from "@/components/AboutCreditsView";
import { fetchConfig } from "@/lib/api";
import { dictionaries } from "@/lib/i18n";
import type { PublicConfig } from "@/lib/types";

export default function AboutPage() {
  const [config, setConfig] = useState<PublicConfig | null>(null);

  useEffect(() => {
    fetchConfig()
      .then(setConfig)
      .catch(() => {});
  }, []);

  const lang = config?.defaultLanguage === "si" ? "si" : "en";
  const t = dictionaries[lang];

  return (
    <main className="nx-view-shell" style={{ minHeight: "100dvh", paddingTop: 28 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <Link href="/" className="nx-secondary-btn" style={{ minHeight: 38, padding: "6px 14px", textDecoration: "none" }}>
          <ArrowLeft size={15} />
          <span>Back to Workspace</span>
        </Link>
        <span className="nx-view-eyebrow">NEXO AI V1 · {t.tagline}</span>
      </div>

      <div>
        <h1 className="nx-view-title">{t.about}</h1>
        <p className="nx-view-sub">{t.tagline}</p>
      </div>

      <AboutCreditsContent t={t} config={config} />
    </main>
  );
}
