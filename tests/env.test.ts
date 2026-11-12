import { afterEach, describe, expect, it } from "vitest";
import { activeModel, authConfigured, missingConfigKeys, providerConfigured, readEnv } from "@/server/env";

const SNAPSHOT = { ...process.env };

afterEach(() => {
  process.env = { ...SNAPSHOT };
});

describe("server/env", () => {
  it("reads defaults when optional env vars are omitted", () => {
    delete process.env.AI_PROVIDER;
    delete process.env.GEMINI_MODEL;
    delete process.env.RATE_LIMIT_PER_MINUTE;

    const e = readEnv();
    expect(e.provider).toBe("gemini");
    expect(e.geminiModel).toBe("gemini-2.5-flash");
    expect(e.perMinute).toBe(10);
  });

  it("reports gemini configured when GEMINI_API_KEY and model exist", () => {
    process.env.AI_PROVIDER = "gemini";
    process.env.GEMINI_API_KEY = "test-key";
    process.env.GEMINI_MODEL = "gemini-2.5-flash";

    expect(providerConfigured()).toBe(true);
    expect(activeModel()).toBe("gemini-2.5-flash");
  });

  it("reports openai-compatible model and missing keys cleanly", () => {
    process.env.AI_PROVIDER = "openai-compatible";
    process.env.OPENAI_COMPAT_BASE_URL = "https://api.example.com/v1/";
    process.env.OPENAI_COMPAT_KEY = "";
    delete process.env.OPENAI_COMPAT_API_KEY;
    delete process.env.OPENAI_COMPAT_MODEL;

    expect(providerConfigured()).toBe(false);
    expect(readEnv().compatBase).toBe("https://api.example.com/v1");
    expect(missingConfigKeys()).toContain("OPENAI_COMPAT_API_KEY");
    expect(missingConfigKeys()).toContain("OPENAI_COMPAT_MODEL");
  });

  it("checks client Firebase auth configuration", () => {
    process.env.NEXT_PUBLIC_FIREBASE_API_KEY = "k";
    process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN = "d";
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID = "p";
    process.env.NEXT_PUBLIC_FIREBASE_APP_ID = "a";
    expect(authConfigured()).toBe(true);

    delete process.env.NEXT_PUBLIC_FIREBASE_APP_ID;
    expect(authConfigured()).toBe(false);
  });
});
