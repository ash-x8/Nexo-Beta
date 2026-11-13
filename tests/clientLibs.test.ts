import { afterEach, describe, expect, it } from "vitest";
import { firebaseMessage } from "@/lib/errors";
import { validateAttachmentMeta } from "@/lib/files";
import { dictionaries } from "@/lib/i18n";
import { looksSensitive, selectMemories } from "@/lib/memory";
import { sanitizePrefs } from "@/lib/prefs";
import { plainForSpeech } from "@/lib/useSpeaker";
import { _resetLimitsForTest, acquireInflight, checkRate } from "@/server/limits";
import { systemPrompt } from "@/server/prompt";

afterEach(() => {
  _resetLimitsForTest();
});

describe("client libs & limits", () => {
  it("detects secret-like strings in memory", () => {
    expect(looksSensitive("My API key is sk-123456")).toBe(true);
    expect(looksSensitive("My password is hello")).toBe(true);
    expect(looksSensitive("I prefer concise TypeScript answers")).toBe(false);
  });

  it("ranks memories by query relevance", () => {
    const items = Array.from({ length: 10 }, (_, i) => ({
      id: String(i),
      text: i === 7 ? "I build Next.js TypeScript apps" : `Random note ${i}`,
      createdAt: i
    }));
    const picked = selectMemories(items, "How do I debug TypeScript in Next.js?", 3);
    expect(picked[0]).toBe("I build Next.js TypeScript apps");
    expect(picked).toHaveLength(3);
  });

  it("sanitizes preferences and drops invalid values", () => {
    const out = sanitizePrefs({
      ui: "si",
      reply: "invalid",
      responseStyle: "concise",
      theme: "light",
      nickname: "x".repeat(120),
      speak: "not-bool"
    });
    expect(out.ui).toBe("si");
    expect(out.reply).toBeUndefined();
    expect(out.responseStyle).toBe("concise");
    expect(out.theme).toBe("light");
    expect(out.nickname?.length).toBe(60);
    expect(out.speak).toBeUndefined();
  });

  it("maintains strict 1:1 key parity between en and si dictionaries", () => {
    const enKeys = Object.keys(dictionaries.en).sort();
    const siKeys = Object.keys(dictionaries.si).sort();
    expect(siKeys).toEqual(enKeys);
  });

  it("validates attachment file sizes and provider PDF support", () => {
    expect(validateAttachmentMeta({ name: "photo.png", type: "image/png", size: 1024 }, 4, true)).toBe("image");
    expect(validateAttachmentMeta({ name: "doc.pdf", type: "application/pdf", size: 1024 }, 4, true)).toBe("pdf");
    expect(() => validateAttachmentMeta({ name: "doc.pdf", type: "application/pdf", size: 1024 }, 4, false)).toThrow(
      /Gemini/
    );
    expect(() => validateAttachmentMeta({ name: "big.png", type: "image/png", size: 5 * 1024 * 1024 }, 4, true)).toThrow(
      /larger than 4 MB/
    );
  });

  it("enforces sliding rate limit and single-inflight lock", () => {
    process.env.RATE_LIMIT_PER_MINUTE = "2";
    checkRate("u1", "chat", 1000);
    checkRate("u1", "chat", 2000);
    expect(() => checkRate("u1", "chat", 3000)).toThrow(/Too many requests/);

    const release = acquireInflight("u1");
    expect(() => acquireInflight("u1")).toThrow(/already being generated/);
    release();
    const release2 = acquireInflight("u1");
    release2();
  });

  it("builds personalized system prompts and strips markdown for speech", () => {
    const prompt = systemPrompt({
      language: "si",
      responseStyle: "concise",
      nickname: "Ash",
      customInstructions: "Keep examples short.",
      memory: ["Prefers TypeScript"],
      searchContext: "[1] Example (https://example.com)"
    });
    expect(prompt).toContain("Sinhala");
    expect(prompt).toContain("brief, direct");
    expect(prompt).toContain("Ash");
    expect(prompt).toContain("Keep examples short.");
    expect(prompt).toContain("Prefers TypeScript");
    expect(prompt).toContain("Fresh web search results");

    const spoken = plainForSpeech("# Hello\nCheck [NEXO](https://example.com) and `code`\n```ts\nconst x = 1;\n```");
    expect(spoken).toBe("Hello Check NEXO and code");
    expect(firebaseMessage({ code: "permission-denied" })).toContain("firestore.rules");
  });
});
