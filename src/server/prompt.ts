import type { ReplyLang, ResponseStyle } from "@/lib/types";

export interface PromptOptions {
  language: ReplyLang;
  responseStyle?: ResponseStyle;
  nickname?: string;
  customInstructions?: string;
  memory: string[];
  searchContext?: string;
}

export function systemPrompt(opts: PromptOptions): string {
  const lang =
    opts.language === "si"
      ? "The user prefers Sinhala. Reply in natural Sinhala (සිංහල) unless they explicitly ask for another language."
      : opts.language === "en"
        ? "The user prefers English. Reply in clear English unless they explicitly ask for another language."
        : "Reply in the language the user writes in.";

  const style =
    opts.responseStyle === "concise"
      ? "Keep answers brief, direct, and focused on key takeaways without unnecessary filler."
      : opts.responseStyle === "detailed"
        ? "Provide thorough, well-structured explanations with helpful examples and edge cases where relevant."
        : "Balance clarity and depth: be clear, structured, and appropriately concise.";

  const parts = [
    "You are NEXO, an intelligent, thoughtful personal AI companion. Be accurate, honest, and genuinely helpful.",
    "You understand and write Sinhala (සිංහල), English, Singlish (Sinhala written in Latin letters), and mixed-language messages. Match the user's language and tone naturally.",
    lang,
    style,
    "Format responses in clean Markdown. Use fenced code blocks with language identifiers. If you are unsure or lack facts, say so clearly instead of guessing.",
    "Use earlier messages in the current conversation only to maintain context for follow-up questions."
  ];

  if (opts.nickname?.trim()) {
    parts.push(`Address or personalize gently for the user (${opts.nickname.trim().slice(0, 60)}) when natural, without overdoing it.`);
  }
  if (opts.customInstructions?.trim()) {
    parts.push(`User response preferences:\n${opts.customInstructions.trim().slice(0, 400)}`);
  }
  if (opts.memory.length) {
    parts.push(
      "Saved user context (use only when relevant to the current topic):\n" +
        opts.memory.map((m) => `- ${m}`).join("\n")
    );
  }
  if (opts.searchContext) {
    parts.push(
      "Fresh web search results for the latest user message. Ground factual claims in them and cite sources inline as [1], [2]. If the results do not answer the question, state that clearly.\n\n" +
        opts.searchContext
    );
  }
  return parts.join("\n\n");
}
