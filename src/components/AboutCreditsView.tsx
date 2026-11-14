"use client";
import Link from "next/link";
import { ArrowLeft, Cpu, ExternalLink, Lock, Mic, ShieldCheck } from "lucide-react";
import type { Dict } from "@/lib/i18n";
import type { PublicConfig } from "@/lib/types";

interface ContentProps {
  t: Dict;
  config: PublicConfig | null;
}

export function AboutCreditsContent({ t, config }: ContentProps) {
  const dev = config?.developer || {
    projectName: config?.appName || "NEXO AI",
    creatorName: "Ash Wickramasinghe",
    fullName: "Kushan A Wickramasinghe",
    role: "Founder, Creator & Independent Developer",
    website: "https://ash-wickramasinghe.site",
    copyright: "© 2026 Ash Wickramasinghe. All Rights Reserved."
  };

  const activeProviders = config?.configuredProviders?.length ? config.configuredProviders : [];
  const acknowledgements: { name: string; role: string }[] = [];

  if (activeProviders.includes("gemini")) {
    acknowledgements.push({
      name: "Google Gemini API",
      role: "Upstream multimodal reasoning, audio transcription, image generation, and speech synthesis provider."
    });
  }
  if (activeProviders.includes("openai-compatible")) {
    acknowledgements.push({
      name: "OpenAI-Compatible Inference Endpoint",
      role: "Upstream chat and failover inference provider."
    });
  }
  if (config?.authConfigured !== false) {
    acknowledgements.push({
      name: "Firebase Authentication & Cloud Firestore",
      role: "User account security, session verification, and encrypted cloud persistence."
    });
  }
  if (config?.searchEnabled) {
    acknowledgements.push({
      name: "Tavily Web Search API",
      role: "Real-time source-grounded web research."
    });
  }

  return (
    <div className="nx-mob-settings-group">
      <div className="nx-field-card">
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <ShieldCheck size={16} color="var(--accent-blue)" />
          <span className="nx-field-label">{t.developerSectionTitle}</span>
        </div>
        <p className="nx-field-hint" style={{ color: "var(--text-primary)", fontWeight: 600, fontSize: 14 }}>
          {config?.appName || dev.projectName} (NEXO v1) · {dev.creatorName} ({dev.fullName})
        </p>
        <p className="nx-field-hint">
          {dev.role} · {t.aboutBody}
        </p>
        <a
          href={dev.website}
          target="_blank"
          rel="noopener noreferrer"
          style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13 }}
        >
          <span>{dev.website}</span>
          <ExternalLink size={12} />
        </a>
      </div>

      <div className="nx-field-card">
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Cpu size={16} color="var(--accent-blue)" />
          <span className="nx-field-label">{t.aiTechTitle}</span>
        </div>
        <p className="nx-field-hint">{t.independentNotice}</p>
        <p className="nx-field-hint">
          All normal user chats, Image Studio generations, Jarvis sessions, and workspace tools run through the unified NEXO v1 orchestration layer with automatic failover and capability routing.
        </p>
      </div>

      <div className="nx-field-card">
        <span className="nx-field-label">{t.thirdPartyTitle}</span>
        {acknowledgements.length > 0 ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {acknowledgements.map((item) => (
              <div
                key={item.name}
                style={{
                  padding: "8px 10px",
                  borderRadius: "var(--radius-sm)",
                  background: "var(--bg-elevated)",
                  border: "1px solid var(--border-hairline)"
                }}
              >
                <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>{item.name}</div>
                <div className="nx-field-hint">{item.role}</div>
              </div>
            ))}
          </div>
        ) : (
          <p className="nx-field-hint">
            Third-party upstream AI, web search, and cloud database services are acknowledged here whenever configured on the server.
          </p>
        )}
      </div>

      <div className="nx-field-card">
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Mic size={16} color="var(--accent-blue)" />
          <span className="nx-field-label">{t.privacyTitle}</span>
        </div>
        <p className="nx-field-hint">{t.privacyBody}</p>
      </div>

      <div className="nx-field-card">
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Lock size={16} color="var(--accent-blue)" />
          <span className="nx-field-label">{t.disclaimerTitle}</span>
        </div>
        <p className="nx-field-hint">{t.aiDisclaimerBody}</p>
      </div>

      <div className="nx-field-card">
        <span className="nx-field-label">{t.ipTitle}</span>
        <p className="nx-field-hint">{dev.copyright}</p>
      </div>
    </div>
  );
}
