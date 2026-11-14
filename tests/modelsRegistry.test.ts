import { afterEach, describe, expect, it, vi } from "vitest";
import {
  _resetModelRegistryForTest,
  buildModelCatalog,
  getFreeFallbackCandidates,
  isFreeEligibleModel,
  markModelHealth
} from "@/server/modelsRegistry";

afterEach(() => {
  _resetModelRegistryForTest();
});

describe("server/modelsRegistry (Strict Free-Only & Fallback)", () => {
  it("approves verified free Gemini and :free OpenRouter models while blocking paid & deprecated models", () => {
    expect(isFreeEligibleModel("gemini-2.5-flash", "gemini")).toBe(true);
    expect(isFreeEligibleModel("gemini-2.5-flash-lite", "gemini")).toBe(true);
    expect(isFreeEligibleModel("gemini-4-hydrogen", "gemini")).toBe(true);
    expect(isFreeEligibleModel("meta-llama/llama-3.3-70b-instruct:free", "openai-compatible")).toBe(true);

    // Paid models must never pass free-eligibility check
    expect(isFreeEligibleModel("gemini-2.5-pro", "gemini")).toBe(false);
    expect(isFreeEligibleModel("gemini-4-argon", "gemini")).toBe(false);
    expect(isFreeEligibleModel("gemini-4-carbon", "gemini")).toBe(false);
    expect(isFreeEligibleModel("gpt-4o", "openai-compatible")).toBe(false);

    // Deprecated models blocked
    expect(isFreeEligibleModel("gemini-1.5-flash", "gemini")).toBe(false);
    expect(isFreeEligibleModel("gemini-2.0-flash", "gemini")).toBe(false);
  });

  it("filters paid models out of catalog when freeOnly=true", () => {
    const catalog = buildModelCatalog(
      "gemini",
      ["gemini-2.5-flash", "gemini-2.5-pro", "gemini-4-carbon", "gemini-2.5-flash-lite"],
      "gemini-2.5-flash",
      true,
      true
    );
    const ids = catalog.map((m) => m.id);
    expect(ids).toContain("gemini-2.5-flash");
    expect(ids).toContain("gemini-2.5-flash-lite");
    expect(ids).not.toContain("gemini-2.5-pro");
    expect(ids).not.toContain("gemini-4-carbon");
    expect(catalog.every((m) => m.freeEligible)).toBe(true);
  });

  it("resolves verified free fallback candidates and deprioritizes rate-limited models", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-13T12:00:00Z"));

    markModelHealth("gemini-2.5-flash-lite", "rate_limited", 60_000);
    const candidates = getFreeFallbackCandidates(
      "gemini",
      "gemini-2.5-flash",
      ["gemini-2.5-flash", "gemini-2.5-flash-lite", "gemini-4-hydrogen", "gemini-4-carbon"],
      "gemini-2.5-flash"
    );

    // Paid model excluded; healthy free candidate prioritized ahead of rate-limited one
    expect(candidates).not.toContain("gemini-4-carbon");
    expect(candidates).not.toContain("gemini-2.5-flash");
    expect(candidates[0]).toBe("gemini-4-hydrogen");
    expect(candidates).toContain("gemini-2.5-flash-lite");

    vi.useRealTimers();
  });
});
