import { afterEach, describe, expect, it, vi } from "vitest";

const {
  mockRequireUser,
  mockReadUsage,
  mockConsumeDaily,
  mockCheckRate,
  mockAcquireInflight,
  mockRecordUsageMetric
} = vi.hoisted(() => ({
  mockRequireUser: vi.fn(),
  mockReadUsage: vi.fn(),
  mockConsumeDaily: vi.fn(),
  mockCheckRate: vi.fn(),
  mockAcquireInflight: vi.fn(() => () => {}),
  mockRecordUsageMetric: vi.fn()
}));

vi.mock("@/server/firebaseAdmin", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/server/firebaseAdmin")>();
  return {
    ...actual,
    requireUser: mockRequireUser
  };
});

vi.mock("@/server/limits", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/server/limits")>();
  return {
    ...actual,
    readUsage: mockReadUsage,
    consumeDaily: mockConsumeDaily,
    checkRate: mockCheckRate,
    acquireInflight: mockAcquireInflight,
    recordUsageMetric: mockRecordUsageMetric
  };
});

import { GET as getConfig } from "@/app/api/config/route";
import { GET as getModels } from "@/app/api/models/route";
import { GET as getUsage } from "@/app/api/usage/route";
import { POST as postChat } from "@/app/api/chat/route";
import { ApiError } from "@/server/firebaseAdmin";
import { _resetModelRegistryForTest } from "@/server/modelsRegistry";
import { _resetModelCacheForTest } from "@/server/providers";

const ORIG_ENV = { ...process.env };
const ORIG_FETCH = globalThis.fetch;

afterEach(() => {
  process.env = { ...ORIG_ENV };
  globalThis.fetch = ORIG_FETCH;
  _resetModelRegistryForTest();
  _resetModelCacheForTest();
  vi.clearAllMocks();
});

describe("API routes integration", () => {
  it("GET /api/config exposes secret-free capabilities and official developer identity", async () => {
    process.env.AI_PROVIDER = "gemini";
    process.env.GEMINI_API_KEY = "secret-key";
    process.env.GEMINI_MODEL = "gemini-2.5-flash";
    delete process.env.TAVILY_API_KEY;

    const res = await getConfig();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.configured).toBe(true);
    expect(body.freeOnly).toBe(true);
    expect(body.searchEnabled).toBe(false);
    expect(body.ttsServer).toBe(true);
    expect(body.developer.creatorName).toBe("Ash Wickramasinghe");
    expect(body.developer.fullName).toBe("Kushan A Wickramasinghe");
    expect(body.developer.website).toBe("https://ash-wickramasinghe.site");
    expect(body.developer.copyright).toBe("© 2026 Ash Wickramasinghe. All Rights Reserved.");
    expect(JSON.stringify(body)).not.toContain("secret-key");
  });

  it("GET /api/usage rejects unauthenticated calls with 401 and returns usage when authenticated", async () => {
    mockRequireUser.mockRejectedValueOnce(new ApiError(401, "unauthenticated", "Sign in to use NEXO."));
    const unauth = await getUsage(new Request("http://localhost/api/usage"));
    expect(unauth.status).toBe(401);

    mockRequireUser.mockResolvedValueOnce("user-123");
    mockReadUsage.mockResolvedValueOnce({
      requests: 3,
      tts: 1,
      rateLimitHits: 0,
      fallbackCount: 1,
      day: "2026-11-12",
      dailyLimit: 100,
      dailyTtsLimit: 40,
      remainingRequests: 97,
      remainingTts: 39,
      providerHealth: "healthy",
      quotaSource: "account_firestore"
    });
    const ok = await getUsage(new Request("http://localhost/api/usage", { headers: { Authorization: "Bearer ok" } }));
    expect(ok.status).toBe(200);
    const json = await ok.json();
    expect(json.remainingRequests).toBe(97);
    expect(json.fallbackCount).toBe(1);
  });

  it("GET /api/models enforces auth and returns free-only catalog", async () => {
    mockRequireUser.mockRejectedValueOnce(new ApiError(401, "unauthenticated", "Sign in."));
    const unauth = await getModels(new Request("http://localhost/api/models"));
    expect(unauth.status).toBe(401);

    process.env.AI_PROVIDER = "gemini";
    process.env.GEMINI_API_KEY = "secret-key";
    process.env.GEMINI_MODEL = "gemini-2.5-flash";
    mockRequireUser.mockResolvedValueOnce("user-123");
    globalThis.fetch = vi.fn().mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          models: [
            { name: "models/gemini-2.5-flash", supportedGenerationMethods: ["generateContent"] },
            { name: "models/gemini-4-carbon", supportedGenerationMethods: ["generateContent"] }
          ]
        }),
        { status: 200 }
      )
    ) as unknown as typeof fetch;

    const ok = await getModels(new Request("http://localhost/api/models", { headers: { Authorization: "Bearer ok" } }));
    expect(ok.status).toBe(200);
    const body = await ok.json();
    expect(body.freeOnly).toBe(true);
    expect(body.models).toContain("gemini-2.5-flash");
    expect(body.models).not.toContain("gemini-4-carbon");
  });

  it("POST /api/chat validates payload, calls Gemini stream, and emits meta + text + done", async () => {
    process.env.AI_PROVIDER = "gemini";
    process.env.GEMINI_API_KEY = "secret-key";
    process.env.GEMINI_MODEL = "gemini-2.5-flash";

    mockRequireUser.mockResolvedValueOnce("user-123");
    mockConsumeDaily.mockResolvedValueOnce(undefined);

    const enc = new TextEncoder();
    const sse = new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(enc.encode('data: {"candidates":[{"content":{"parts":[{"text":"Hello from Gemini"}]}}]}\n\n'));
        c.close();
      }
    });
    globalThis.fetch = vi.fn().mockResolvedValueOnce(new Response(sse, { status: 200 })) as unknown as typeof fetch;

    const req = new Request("http://localhost/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer valid" },
      body: JSON.stringify({
        messages: [{ role: "user", content: "Hi NEXO" }],
        responseStyle: "concise"
      })
    });

    const res = await postChat(req);
    expect(res.status).toBe(200);
    const raw = await res.text();
    const lines = raw
      .trim()
      .split("\n")
      .map((l) => JSON.parse(l));
    expect(lines).toEqual([
      { meta: { model: "gemini-2.5-flash", provider: "gemini", freeEligible: true } },
      { t: "Hello from Gemini" },
      { done: true }
    ]);
  });

  it("POST /api/chat blocks non-free paid models in Free-Only mode", async () => {
    process.env.AI_PROVIDER = "gemini";
    process.env.GEMINI_API_KEY = "secret-key";
    process.env.GEMINI_MODEL = "gemini-2.5-flash";
    mockRequireUser.mockResolvedValueOnce("user-123");

    const req = new Request("http://localhost/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer valid" },
      body: JSON.stringify({
        messages: [{ role: "user", content: "Test" }],
        model: "gemini-4-carbon"
      })
    });

    const res = await postChat(req);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error.code).toBe("paid_model_blocked");
  });

  it("POST /api/chat automatically falls back to another verified free model on 429 rate limit", async () => {
    process.env.AI_PROVIDER = "gemini";
    process.env.GEMINI_API_KEY = "secret-key";
    process.env.GEMINI_MODEL = "gemini-2.5-flash";
    mockRequireUser.mockResolvedValueOnce("user-123");
    mockConsumeDaily.mockResolvedValueOnce(undefined);

    const enc = new TextEncoder();
    const sse = new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(enc.encode('data: {"candidates":[{"content":{"parts":[{"text":"Recovered on free model"}]}}]}\n\n'));
        c.close();
      }
    });

    globalThis.fetch = vi
      .fn()
      .mockResolvedValueOnce(new Response("RESOURCE_EXHAUSTED quota exceeded", { status: 429 }))
      .mockResolvedValueOnce(new Response(sse, { status: 200 })) as unknown as typeof fetch;

    const req = new Request("http://localhost/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer valid" },
      body: JSON.stringify({
        messages: [{ role: "user", content: "Kohomada NEXO?" }]
      })
    });

    const res = await postChat(req);
    expect(res.status).toBe(200);
    const lines = (await res.text())
      .trim()
      .split("\n")
      .map((l) => JSON.parse(l));

    expect(lines[0]).toEqual({ meta: { model: "gemini-2.5-flash", provider: "gemini", freeEligible: true } });
    expect(lines[1]).toEqual({ fallback: { from: "gemini-2.5-flash", to: "gemini-2.5-flash-lite", reason: "provider_quota" } });
    expect(lines[2]).toEqual({ meta: { model: "gemini-2.5-flash-lite", provider: "gemini", freeEligible: true } });
    expect(lines[3]).toEqual({ t: "Recovered on free model" });
    expect(lines[4]).toEqual({ done: true });
    expect(mockRecordUsageMetric).toHaveBeenCalledWith("user-123", "rateLimitHits");
    expect(mockRecordUsageMetric).toHaveBeenCalledWith("user-123", "fallbackCount");
  });
});
