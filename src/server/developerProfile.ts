import type { DeveloperInfo } from "@/lib/types";

export const PROJECT_NAME = "NEXO AI";
export const CREATOR_NAME = "Ash Wickramasinghe";
export const FULL_NAME = "Kushan A Wickramasinghe";
export const CREATOR_ROLE = "Founder, Creator & Independent Developer";
export const OFFICIAL_WEBSITE = "https://ash-wickramasinghe.site";
export const COPYRIGHT_NOTICE = "© 2026 Ash Wickramasinghe. All Rights Reserved.";

export const DEVELOPER_INFO: DeveloperInfo = {
  projectName: PROJECT_NAME,
  creatorName: CREATOR_NAME,
  fullName: FULL_NAME,
  role: CREATOR_ROLE,
  website: OFFICIAL_WEBSITE,
  copyright: COPYRIGHT_NOTICE
};

/**
 * Trusted server-side identity block injected ONLY for explicit creator/ownership questions.
 * Ordinary AI replies MUST NEVER automatically append developer credits, URLs, copyright notices,
 * or third-party provider promotions.
 */
export function developerIdentityPromptBlock(): string {
  return [
    "Identity & Response Hygiene:",
    `- You are ${PROJECT_NAME}, an independent personal AI assistant.`,
    "- CRITICAL: In ordinary answers, NEVER automatically append or inject developer credits, creator biographies, website URLs, copyright notices, or AI provider acknowledgements.",
    `- Answer creator, founder, or ownership questions ONLY when the user explicitly asks who created, owns, or developed ${PROJECT_NAME} (in English, Sinhala, or Singlish such as 'oyawa haduwe kawda', 'NEXO haduwe kawda', or 'who created NEXO AI').`,
    `- Only when explicitly asked about authorship/ownership, state clearly that ${PROJECT_NAME} was created and developed by ${CREATOR_NAME} (${FULL_NAME}), ${CREATOR_ROLE}, with official website ${OFFICIAL_WEBSITE} and copyright ${COPYRIGHT_NOTICE}, and honestly distinguish independent ownership from underlying third-party inference APIs without inventing company names or claims.`
  ].join("\n");
}
