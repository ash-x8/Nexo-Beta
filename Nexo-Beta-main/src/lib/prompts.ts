import type { Lang } from "./types";

export interface PromptGroup { id: "write" | "code" | "learn" | "create"; label: string; prompts: string[] }

const en: PromptGroup[] = [
  { id: "write", label: "Write", prompts: ["Help me write a polite email asking for a deadline extension", "Rewrite a paragraph so it sounds more confident"] },
  { id: "code", label: "Code", prompts: ["Explain async/await in JavaScript with a simple example", "Help me debug a Python error"] },
  { id: "learn", label: "Learn", prompts: ["Explain how neural networks learn, in simple words", "Teach me 10 useful English phrases for travel"] },
  { id: "create", label: "Create", prompts: ["Give me 5 startup ideas that suit Sri Lanka", "Write a short story about a robot learning to paint"] }
];

const si: PromptGroup[] = [
  { id: "write", label: "ලිවීම", prompts: ["කාලය දීර්ඝ කරන ලෙස ඉල්ලා ආචාරශීලී ඊමේල් එකක් ලියන්න", "ඡේදයක් වඩා විශ්වාසයෙන් යුතු ලෙස නැවත ලියන්න"] },
  { id: "code", label: "කේත", prompts: ["JavaScript හි async/await සරල උදාහරණයකින් පහදන්න", "Python දෝෂයක් නිවැරදි කිරීමට උදව් කරන්න"] },
  { id: "learn", label: "ඉගෙනීම", prompts: ["Neural networks ඉගෙන ගන්නා ආකාරය සරලව පහදන්න", "ගමන් යාමට ප්‍රයෝජනවත් ඉංග්‍රීසි වාක්‍ය 10ක් උගන්වන්න"] },
  { id: "create", label: "නිර්මාණය", prompts: ["ශ්‍රී ලංකාවට ගැළපෙන ව්‍යාපාර අදහස් 5ක් දෙන්න", "චිත්‍ර අඳින්න ඉගෙන ගන්නා රොබෝවෙකු ගැන කෙටි කතාවක් ලියන්න"] }
];

export const promptsFor = (lang: Lang): PromptGroup[] => (lang === "si" ? si : en);

/** Only lists what the current server configuration can actually do. */
export function capabilitiesFor(lang: Lang, o: { search: boolean; pdf: boolean; voiceServer: boolean }): string[] {
  if (lang === "si") {
    return [
      "සිංහල, English සහ Singlish",
      "කේත සහ ලිවීමේ සහාය",
      o.pdf ? "රූප, පෙළ/කේත ගොනු සහ PDF විශ්ලේෂණය" : "රූප සහ පෙළ/කේත ගොනු විශ්ලේෂණය",
      ...(o.search ? ["මූලාශ්‍ර සහිත වෙබ් සෙවුම"] : []),
      o.voiceServer ? "හඬ ආදානය සහ කියවීම" : "හඬ ආදානය (බ්‍රව්සරය අනුව)"
    ];
  }
  return [
    "Sinhala, English and Singlish",
    "Coding and writing help",
    o.pdf ? "Image, text/code file and PDF analysis" : "Image and text/code file analysis",
    ...(o.search ? ["Web search with sources"] : []),
    o.voiceServer ? "Voice input and read-aloud" : "Voice input (browser dependent)"
  ];
}
