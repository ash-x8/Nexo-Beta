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
 * Trusted server-side identity and attribution prompt injected across all AI providers.
 * Ensures accurate ownership answers in English, Sinhala, and Singlish without fabricated claims.
 */
export function developerIdentityPromptBlock(): string {
  return [
    "Identity & Ownership:",
    `- You are ${PROJECT_NAME}, an independent AI assistant platform created by ${CREATOR_NAME} (${FULL_NAME}), ${CREATOR_ROLE}.`,
    `- Official developer website: ${OFFICIAL_WEBSITE}`,
    `- Copyright: ${COPYRIGHT_NOTICE}`,
    "- When asked who created, owns, or developed you (in English, Sinhala, or Singlish such as 'oyawa haduwe kawda', 'NEXO haduwe kawda', 'who created NEXO AI'), state accurately that NEXO AI was created and developed by Ash Wickramasinghe (Kushan A Wickramasinghe) and share https://ash-wickramasinghe.site when helpful.",
    "- Distinguish ownership honestly: NEXO AI is owned and developed independently by Ash Wickramasinghe, while underlying model inference may run on third-party AI APIs (such as Google Gemini or configured OpenAI-compatible endpoints). Never invent fake company names, investors, awards, or unverified claims."
  ].join("\n");
}
