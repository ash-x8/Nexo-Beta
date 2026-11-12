import { afterEach, describe, expect, it, vi } from "vitest";

const { mockRequireUser, mockReadUsage, mockConsumeDaily, mockCheckRate, mockAcquireInflight } = vi.hoisted(() => ({
  mockRequireUser: vi.fn(),
  mockReadUsage: vi.fn(),
  mockConsumeDaily: vi.fn(),
  mockCheckRate: vi.fn(),
  mockAcquireInflight: vi.fn(() => () => {})
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
    acquireInflight: mockAcquireInflight
  };
});

import { GET as getConfig } from "@/app/api/config/route";
import { GET as getUsage } from "@/app/api/usage/route";
import { POST as postChat } from "@/app/api/chat/route";
import { ApiError } from "@/server/firebaseAdmin";

const ORIG_ENV = { ...process.env };
const ORIG_FETCH = globalThis.fetch;

afterEach(() => {
  process.env = { ...ORIG_ENV };
  globalThis.fetch = ORIG_FETCH;
  vi.clearAllMocks();
});

describe("API routes integration", () => {
  it("GET /api/config exposes secret-free capability flags", async () => {
    process.env.AI_PROVIDER = "gemini";
    process.env.GEMINI_API_KEY = "secret-key";
    process.env.GEMINI_MODEL = "gemini-2.5-flash";
    delete process.env.TAVILY_API_KEY;

    const res = await getConfig();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.configured).toBe(true);
    expect(body.searchEnabled).toBe(false);
    expect(body.ttsServer).toBe(true);
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
      day: "2026-11-12",
      dailyLimit: 100,
      dailyTtsLimit: 40,
      remainingRequests: 97,
      remainingTts: 39
    });
    const ok = await getUsage(new Request("http://localhost/api/usage", { headers: { Authorization: "Bearer ok" } }));
    expect(ok.status).toBe(200);
    expect((await ok.json()).remainingRequests).toBe(97);
  });

  it("POST /api/chat validates payload, calls Gemini stream, and emits done sentinel", async () => {
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
    expect(lines).toEqual([{ t: "Hello from Gemini" }, { done: true }]);
  });
});
