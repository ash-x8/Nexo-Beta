import { describe, expect, it } from "vitest";
import { ALLOWED_ATTACHMENT_MIME, ChatBodySchema, TtsBodySchema } from "@/lib/schemas";

describe("lib/schemas", () => {
  it("validates chat body defaults and personalization fields", () => {
    const res = ChatBodySchema.safeParse({
      messages: [{ role: "user", content: "Hello" }],
      nickname: "Kasun",
      customInstructions: "Keep answers short."
    });
    expect(res.success).toBe(true);
    if (res.success) {
      expect(res.data.language).toBe("auto");
      expect(res.data.responseStyle).toBe("balanced");
      expect(res.data.useSearch).toBe(false);
    }
  });

  it("rejects empty messages array or invalid model characters", () => {
    expect(ChatBodySchema.safeParse({ messages: [] }).success).toBe(false);
    expect(
      ChatBodySchema.safeParse({
        messages: [{ role: "user", content: "Hi" }],
        model: "bad model name!!!"
      }).success
    ).toBe(false);
  });

  it("validates TTS body trimming and bounds", () => {
    expect(TtsBodySchema.safeParse({ text: "   " }).success).toBe(false);
    expect(TtsBodySchema.safeParse({ text: "Hello world" }).success).toBe(true);
    expect(TtsBodySchema.safeParse({ text: "x".repeat(1201) }).success).toBe(false);
  });

  it("checks allowed attachment MIME types", () => {
    expect(ALLOWED_ATTACHMENT_MIME.test("image/png")).toBe(true);
    expect(ALLOWED_ATTACHMENT_MIME.test("application/pdf")).toBe(true);
    expect(ALLOWED_ATTACHMENT_MIME.test("text/markdown")).toBe(true);
    expect(ALLOWED_ATTACHMENT_MIME.test("application/x-msdownload")).toBe(false);
  });
});
