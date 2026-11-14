import { afterEach, describe, expect, it, vi } from "vitest";

const {
  mockRequireAuthContext,
  mockConsumeDaily,
  mockCheckRate,
  mockAcquireInflight,
  mockRecordUsageMetric,
  mockRecordGenerationTelemetry
} = vi.hoisted(() => ({
  mockRequireAuthContext: vi.fn(),
  mockConsumeDaily: vi.fn(),
  mockCheckRate: vi.fn(),
  mockAcquireInflight: vi.fn(() => () => {}),
  mockRecordUsageMetric: vi.fn(),
  mockRecordGenerationTelemetry: vi.fn()
}));

vi.mock("@/server/firebaseAdmin", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/server/firebaseAdmin")>();
  return {
    ...actual,
    requireAuthContext: mockRequireAuthContext
  };
});

vi.mock("@/server/limits", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/server/limits")>();
  return {
    ...actual,
    consumeDaily: mockConsumeDaily,
    checkRate: mockCheckRate,
    acquireInflight: mockAcquireInflight,
    recordUsageMetric: mockRecordUsageMetric,
    recordGenerationTelemetry: mockRecordGenerationTelemetry
  };
});

import { POST as postNexoChat } from "@/app/api/nexo/chat/route";
import { POST as postNexoImage } from "@/app/api/nexo/image/route";
import { POST as postNexoMemory } from "@/app/api/nexo/memory/route";
import type { AuthContext } from "@/server/firebaseAdmin";
import { _resetModelRegistryForTest } from "@/server/modelsRegistry";
import {
  _resetNexoHealthForTest,
  canAttemptProvider,
  claimRequestId,
  getProviderTelemetrySnapshot,
  recordProviderFailure,
  recordProviderSuccess
} from "@/server/nexo/healthRegistry";
import { buildNexoRoutePlan } from "@/server/nexo/router";
import { classifyNexoTask, detectTextScript } from "@/server/nexo/taskClassifier";
import { _resetModelCacheForTest } from "@/server/providers";
import { _resetRuntimeConfigCacheForTest, getRuntimeConfig } from "@/server/runtimeConfig";

const ORIG_ENV = { ...process.env };
const ORIG_FETCH = globalThis.fetch;

function makeAuthCtx(overrides: Partial<AuthContext> = {}): AuthContext {
  return {
    uid: "nexo-user-1",
    email: "user@nexo.test",
    emailVerified: true,
    displayName: "NEXO Tester",
    photoURL: null,
    role: "USER",
    isOwner: false,
    status: "active",
    suspendedReason: "",
    featureOverrides: {},
    ...overrides
  };
}

afterEach(() => {
  process.env = { ...ORIG_ENV };
  globalThis.fetch = ORIG_FETCH;
  _resetNexoHealthForTest();
  _resetModelRegistryForTest();
  _resetModelCacheForTest();
  _resetRuntimeConfigCacheForTest();
  vi.clearAllMocks();
});

describe("NEXO v1 unified intelligence engine", () => {
  it("classifies tasks deterministically and detects Sinhala/Tamil/Hindi/English scripts", () => {
    expect(detectTextScript("ආයුබෝවන් NEXO")).toBe("si");
    expect(detectTextScript("வணக்கம்")).toBe("ta");
    expect(detectTextScript("नमस्ते")).toBe("hi");
    expect(detectTextScript("Hello world")).toBe("en");

    expect(
      classifyNexoTask({ text: "Debug this TypeScript React component stack trace" }).taskType
    ).toBe("coding");
    expect(
      classifyNexoTask({ text: "Solve this integral equation step by step" }).taskType
    ).toBe("math");
    expect(
      classifyNexoTask({ text: "Translate this paragraph to Sinhala" }).taskType
    ).toBe("translation");
    expect(
      classifyNexoTask({ text: "Analyze this", voiceTriggered: true }).taskType
    ).toBe("voiceConversation");
    expect(
      classifyNexoTask({
        text: "Summarize",
        attachments: [{ name: "spec.pdf", mime: "application/pdf", data: "JVBERi0=" }]
      }).requiresPdf
    ).toBe(true);
  });

  it("tracks provider health, opens/recovers circuit breakers, and guards requestId idempotency", () => {
    expect(canAttemptProvider("gemini", 1000)).toBe(true);
    recordProviderFailure("gemini", "rate_limit", { isRateLimit: true, triggeredFallback: true });
    expect(canAttemptProvider("gemini", Date.now())).toBe(false);

    // After 46s cooldown, circuit moves to half_open cleanly
    expect(canAttemptProvider("gemini", Date.now() + 46_000)).toBe(true);

    recordProviderSuccess("gemini", { latencyMs: 420, ttftMs: 110 });
    const snap = getProviderTelemetrySnapshot({
      providerId: "gemini",
      displayName: "Google Gemini",
      enabled: true,
      configured: true,
      capabilities: ["chat", "vision"]
    });
    expect(snap.status).toBe("healthy");
    expect(snap.circuitState).toBe("closed");
    expect(snap.avgLatencyMs).toBe(420);
    expect(snap.avgTtftMs).toBe(110);
    expect(snap.quotaStatus).toBe("unknown");

    const release = claimRequestId("u1", "req-abc");
    expect(release).not.toBeNull();
    expect(claimRequestId("u1", "req-abc")).toBeNull();
    release?.();
  });

  it("plans backend routes respecting PDF capabilities and circuit health", async () => {
    process.env.GEMINI_API_KEY = "gem-key";
    process.env.OPENAI_COMPAT_BASE_URL = "https://compat.example/v1";
    process.env.OPENAI_COMPAT_API_KEY = "compat-key";
    process.env.OPENAI_COMPAT_MODEL = "llama-3.3-70b";

    const runtime = await getRuntimeConfig(true);
    const pdfPlan = buildNexoRoutePlan({
      runtime,
      taskType: "imageUnderstanding",
      complexity: "standard",
      requiresVision: false,
      requiresPdf: true
    });
    expect(pdfPlan.length).toBeGreaterThan(0);
    expect(pdfPlan.every((c) => c.providerId === "gemini")).toBe(true);
  });

  it("streams NEXO v1 events cleanly and executes silent cross-provider failover without leaking provider names", async () => {
    process.env.AI_PROVIDER = "gemini";
    process.env.GEMINI_API_KEY = "gem-key";
    process.env.GEMINI_MODEL = "gemini-2.5-flash";
    process.env.OPENAI_COMPAT_BASE_URL = "https://compat.example/v1";
    process.env.OPENAI_COMPAT_API_KEY = "compat-key";
    process.env.OPENAI_COMPAT_MODEL = "compat-fast-model";

    mockRequireAuthContext.mockResolvedValue(makeAuthCtx());
    mockConsumeDaily.mockResolvedValue(1);

    const enc = new TextEncoder();
    globalThis.fetch = vi.fn(async (input) => {
      const url = String(input);
      // Fail all Gemini attempts with 429 so orchestrator silently fails over to openai-compatible
      if (url.includes("generativelanguage.googleapis.com")) {
        return new Response("RESOURCE_EXHAUSTED quota exceeded", { status: 429 });
      }
      if (url.includes("compat.example")) {
        const sse =
          'data: {"choices":[{"delta":{"content":"Unified NEXO answer."}}]}\n\n' +
          "data: [DONE]\n\n";
        return new Response(
          new ReadableStream({
            start(c) {
              c.enqueue(enc.encode(sse));
              c.close();
            }
          }),
          { status: 200 }
        );
      }
      return new Response("Not found", { status: 404 });
    }) as unknown as typeof fetch;

    const req = new Request("https://nexo.local/api/nexo/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer tok" },
      body: JSON.stringify({
        requestId: "req-failover-1",
        messages: [{ role: "user", content: "Write a clean function in TypeScript" }]
      })
    });

    const res = await postNexoChat(req);
    expect(res.status).toBe(200);
    const raw = await res.text();
    expect(raw).toContain('"assistant":"NEXO v1"');
    expect(raw).toContain("Unified NEXO answer.");
    expect(raw).toContain('"done":true');
    // Zero upstream provider/model leaks in user-facing stream payload
    expect(raw).not.toContain("gemini-2.5-flash");
    expect(raw).not.toContain("compat-fast-model");
    expect(raw).not.toContain('"fallback"');
  });

  it("enforces image generation validation, feature gating, and clean response shape", async () => {
    delete process.env.GEMINI_API_KEY;
    delete process.env.OPENAI_COMPAT_API_KEY;
    mockRequireAuthContext.mockResolvedValue(makeAuthCtx());

    const disabledRes = await postNexoImage(
      new Request("https://nexo.local/api/nexo/image", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer tok" },
        body: JSON.stringify({ prompt: "A serene Sri Lankan misty tea mountain at sunrise", aspectRatio: "16:9" })
      })
    );
    expect(disabledRes.status).toBe(403);

    process.env.OPENAI_COMPAT_BASE_URL = "https://compat.example/v1";
    process.env.OPENAI_COMPAT_API_KEY = "compat-key";
    process.env.OPENAI_COMPAT_IMAGE_MODEL = "compat-img-1";
    _resetRuntimeConfigCacheForTest();
    globalThis.fetch = vi.fn().mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          data: [{ b64_json: Buffer.from("fake-png-bytes").toString("base64") }]
        }),
        { status: 200 }
      )
    ) as unknown as typeof fetch;

    const okRes = await postNexoImage(
      new Request("https://nexo.local/api/nexo/image", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer tok" },
        body: JSON.stringify({ prompt: "Minimal geometric emblem on dark canvas", aspectRatio: "1:1" })
      })
    );
    expect(okRes.status).toBe(200);
    const body = await okRes.json();
    expect(body.ok).toBe(true);
    expect(body.assistant).toBe("NEXO v1");
    expect(body.image.dataUrl).toMatch(/^data:image\/png;base64,/);
    expect(JSON.stringify(body)).not.toContain("compat-img-1");
    expect(JSON.stringify(body)).not.toContain("openai-compatible");
  });

  it("consolidates conversation memory cleanly without storing secrets when offline", async () => {
    delete process.env.GEMINI_API_KEY;
    mockRequireAuthContext.mockResolvedValue(makeAuthCtx());

    const res = await postNexoMemory(
      new Request("https://nexo.local/api/nexo/memory", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer tok" },
        body: JSON.stringify({
          messages: [
            { role: "user", content: "I am building a Next.js platform in Sri Lanka" },
            { role: "assistant", content: "Noted! I can tailor TypeScript examples accordingly." }
          ]
        })
      })
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.summary).toContain("Next.js");
    expect(Array.isArray(data.extractedFacts)).toBe(true);
  });
});
