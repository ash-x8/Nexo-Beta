import { afterEach, describe, expect, it, vi } from "vitest";

const {
  mockRequireAdmin,
  mockRequireSensitiveAdmin,
  mockRequireAuthContext,
  mockGetRuntimeConfig,
  mockHasAdminCredentials,
  mockRecordAuditLog
} = vi.hoisted(() => ({
  mockRequireAdmin: vi.fn(),
  mockRequireSensitiveAdmin: vi.fn(),
  mockRequireAuthContext: vi.fn(),
  mockGetRuntimeConfig: vi.fn(),
  mockHasAdminCredentials: vi.fn(() => false),
  mockRecordAuditLog: vi.fn()
}));

vi.mock("@/server/firebaseAdmin", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/server/firebaseAdmin")>();
  return {
    ...actual,
    requireAdmin: mockRequireAdmin,
    requireSensitiveAdmin: mockRequireSensitiveAdmin,
    requireAuthContext: mockRequireAuthContext,
    hasAdminCredentials: mockHasAdminCredentials
  };
});

vi.mock("@/server/runtimeConfig", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/server/runtimeConfig")>();
  return {
    ...actual,
    getRuntimeConfig: mockGetRuntimeConfig
  };
});

vi.mock("@/server/adminAudit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/server/adminAudit")>();
  return {
    ...actual,
    recordAuditLog: mockRecordAuditLog
  };
});

import { GET as getSecrets, POST as postSecret } from "@/app/api/admin/secrets/route";
import { DELETE as deleteVercelEnv, GET as getVercelEnv, PATCH as patchVercelEnv, POST as postVercelEnv } from "@/app/api/admin/vercel/env/route";
import { POST as postVercelDeploy } from "@/app/api/admin/vercel/deploy/route";
import { POST as postNexoMemory } from "@/app/api/nexo/memory/route";
import { POST as postNexoTranscribe } from "@/app/api/nexo/transcribe/route";
import { clearRuntimeSecretOverlay, readEnv, setRuntimeSecretOverlay } from "@/server/env";
import { ApiError, assertSameOrigin, type AuthContext } from "@/server/firebaseAdmin";
import { buildDefaultSnapshot } from "@/server/runtimeConfig";
import { decryptSecret, encryptSecret, isEncryptionKeyConfigured } from "@/server/secretCrypto";

const ORIG_ENV = { ...process.env };
const ORIG_FETCH = globalThis.fetch;

function makeOwnerCtx(overrides: Partial<AuthContext> = {}): AuthContext {
  return {
    uid: "owner-1",
    email: "kushanashvika216@gmail.com",
    emailVerified: true,
    displayName: "Ash Wickramasinghe",
    photoURL: null,
    role: "SUPER_ADMIN",
    isOwner: true,
    status: "active",
    suspendedReason: "",
    featureOverrides: {},
    ...overrides
  };
}

function makeUserCtx(overrides: Partial<AuthContext> = {}): AuthContext {
  return {
    uid: "user-9",
    email: "user@example.com",
    emailVerified: true,
    displayName: "Normal User",
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
  clearRuntimeSecretOverlay();
  vi.clearAllMocks();
});

describe("AES-256-GCM Secret Encryption & Runtime Secret Overlay", () => {
  it("encrypts and decrypts secrets in memory and fails safely if key is missing or ciphertext tampered", () => {
    delete process.env.NEXO_MASTER_SECRET_KEY;
    delete process.env.SECRET_ENCRYPTION_KEY;
    expect(isEncryptionKeyConfigured()).toBe(false);
    expect(() => encryptSecret("AIzaTestSecret123")).toThrow(/encryption_unconfigured|master key/i);

    process.env.NEXO_MASTER_SECRET_KEY = "short";
    expect(isEncryptionKeyConfigured()).toBe(false);
    expect(() => encryptSecret("AIzaTestSecret123")).toThrow(/master key/i);

    process.env.NEXO_MASTER_SECRET_KEY = "nexo-super-secure-master-encryption-key-2026";
    expect(isEncryptionKeyConfigured()).toBe(true);

    const enc = encryptSecret("AIzaSyD-TestKeyValue-999");
    expect(enc.ciphertext).not.toContain("AIzaSyD-TestKeyValue-999");
    expect(enc.fingerprint).toHaveLength(12);
    expect(enc.length).toBe("AIzaSyD-TestKeyValue-999".length);
    expect(decryptSecret(enc)).toBe("AIzaSyD-TestKeyValue-999");

    // Tampered authTag must reject decryption
    const tampered = { ...enc, authTag: Buffer.from("0000000000000000").toString("base64") };
    expect(() => decryptSecret(tampered)).toThrow(/decrypt/i);
  });

  it("supports runtime_first vs env_first overlay precedence without mutating process.env", () => {
    process.env.GEMINI_API_KEY = "env-gemini-key";
    process.env.TAVILY_API_KEY = "env-tavily-key";

    setRuntimeSecretOverlay({ GEMINI_API_KEY: "runtime-gemini-key", OPENROUTER_API_KEY: "runtime-or-key" }, "runtime_first");
    let e = readEnv();
    expect(e.geminiKey).toBe("runtime-gemini-key");
    expect(e.tavilyKey).toBe("env-tavily-key");
    expect(e.compatKey).toBe("runtime-or-key");
    expect(e.compatBase).toBe("https://openrouter.ai/api/v1");
    expect(process.env.GEMINI_API_KEY).toBe("env-gemini-key");

    setRuntimeSecretOverlay({ GEMINI_API_KEY: "runtime-gemini-key" }, "env_first");
    e = readEnv();
    expect(e.geminiKey).toBe("env-gemini-key");

    clearRuntimeSecretOverlay();
    expect(readEnv().geminiKey).toBe("env-gemini-key");
  });

  it("blocks cross-origin requests via assertSameOrigin CSRF protection", () => {
    expect(() =>
      assertSameOrigin(
        new Request("https://nexo-beta-ten.vercel.app/api/admin/secrets", {
          method: "POST",
          headers: { origin: "https://nexo-beta-ten.vercel.app", host: "nexo-beta-ten.vercel.app" }
        })
      )
    ).not.toThrow();

    expect(() =>
      assertSameOrigin(
        new Request("https://nexo-beta-ten.vercel.app/api/admin/secrets", {
          method: "POST",
          headers: { origin: "https://evil.example.com", host: "nexo-beta-ten.vercel.app" }
        })
      )
    ).toThrow(/cross-origin/i);
  });
});

describe("Vercel Env Manager & Encrypted Secrets API Routes", () => {
  it("rejects unauthorized access to Vercel env and secrets endpoints", async () => {
    mockRequireAdmin.mockRejectedValueOnce(new ApiError(403, "forbidden", "Owner access required."));
    const res1 = await getVercelEnv(new Request("http://localhost/api/admin/vercel/env"));
    expect(res1.status).toBe(403);

    mockRequireSensitiveAdmin.mockRejectedValueOnce(new ApiError(401, "reauth_required", "Please re-authenticate."));
    const res2 = await postSecret(
      new Request("http://localhost/api/admin/secrets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Key", provider: "gemini", value: "abc12345", environment: "all", active: true })
      })
    );
    expect(res2.status).toBe(401);
    expect((await res2.json()).error.code).toBe("reauth_required");
  });

  it("lists full Vercel env inventory including manual vars, masks encrypted secrets, and detects missing expected keys", async () => {
    process.env.VERCEL_TOKEN = "vercel-bootstrap-secret";
    process.env.VERCEL_PROJECT_ID = "prj_nexo_123";
    mockRequireAdmin.mockResolvedValueOnce(makeOwnerCtx());

    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/custom-environments")) {
        return new Response(
          JSON.stringify({ environments: [{ id: "ce_1", slug: "staging", name: "Staging" }] }),
          { status: 200 }
        );
      }
      if (url.includes("/v10/projects/") && url.includes("/env")) {
        return new Response(
          JSON.stringify({
            envs: [
              { id: "env_1", key: "AI_PROVIDER", value: "gemini", type: "plain", target: ["production", "preview"], updatedAt: 1700000000000 },
              { id: "env_2", key: "MANUAL_CUSTOM_FLAG", value: "", type: "encrypted", target: ["production"], updatedAt: 1700000001000 }
            ]
          }),
          { status: 200 }
        );
      }
      if (url.includes("/v6/deployments")) {
        return new Response(
          JSON.stringify({
            deployments: [{ uid: "dpl_1", name: "nexo-beta", url: "nexo-beta-ten.vercel.app", state: "READY", target: "production", createdAt: 1700000002000 }]
          }),
          { status: 200 }
        );
      }
      return new Response(JSON.stringify({ name: "nexo-beta" }), { status: 200 });
    }) as unknown as typeof fetch;

    const res = await getVercelEnv(new Request("http://localhost/api/admin/vercel/env"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.configured).toBe(true);
    expect(body.projectName).toBe("nexo-beta");
    expect(body.customEnvironments).toHaveLength(1);
    expect(body.envs).toHaveLength(2);

    const plainVar = body.envs.find((e: { key: string }) => e.key === "AI_PROVIDER");
    expect(plainVar.valueStatus).toBe("value_available");
    expect(plainVar.value).toBe("gemini");

    const manualEncrypted = body.envs.find((e: { key: string }) => e.key === "MANUAL_CUSTOM_FLAG");
    expect(manualEncrypted.ownership).toBe("created_manually_in_vercel");
    expect(manualEncrypted.valueStatus).toBe("secret_masked");
    expect(manualEncrypted.value).toBeNull();
    expect(body.missingExpectedKeys).toContain("GEMINI_API_KEY");
    expect(JSON.stringify(body)).not.toContain("vercel-bootstrap-secret");
  });

  it("enforces double confirmation for Production overwrites/deletes and never echoes secret values", async () => {
    process.env.VERCEL_TOKEN = "vercel-bootstrap-secret";
    process.env.VERCEL_PROJECT_ID = "prj_nexo_123";
    mockRequireSensitiveAdmin.mockResolvedValue(makeOwnerCtx());

    // Overwriting Production value without confirmProduction -> 400 confirmation_required
    const unconfirmedPatch = await patchVercelEnv(
      new Request("http://localhost/api/admin/vercel/env", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: "env_1", value: "super-secret-api-key", target: ["production"] })
      })
    );
    expect(unconfirmedPatch.status).toBe(400);
    expect((await unconfirmedPatch.json()).error.code).toBe("confirmation_required");

    // Deleting Production var without confirmProduction -> 400 confirmation_required
    const unconfirmedDel = await deleteVercelEnv(
      new Request("http://localhost/api/admin/vercel/env", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: "env_1", key: "GEMINI_API_KEY", isProduction: true })
      })
    );
    expect(unconfirmedDel.status).toBe(400);
    expect((await unconfirmedDel.json()).error.code).toBe("confirmation_required");

    // Creating encrypted variable -> never echoes submitted secret back in response or audit log
    globalThis.fetch = vi.fn().mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          created: { id: "env_new", key: "GEMINI_API_KEY", type: "encrypted", target: ["production"], updatedAt: 1700000005000 }
        }),
        { status: 201 }
      )
    ) as unknown as typeof fetch;

    const createRes = await postVercelEnv(
      new Request("http://localhost/api/admin/vercel/env", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          key: "GEMINI_API_KEY",
          value: "AIzaSySecretValueNeverEchoed",
          type: "encrypted",
          target: ["production"]
        })
      })
    );
    expect(createRes.status).toBe(200);
    const createdJson = await createRes.json();
    expect(createdJson.item.value).toBeUndefined();
    expect(JSON.stringify(createdJson)).not.toContain("AIzaSySecretValueNeverEchoed");
    expect(JSON.stringify(mockRecordAuditLog.mock.calls[0]?.[0] || {})).not.toContain("AIzaSySecretValueNeverEchoed");
  });

  it("triggers controlled Vercel redeploy only when confirmDeploy is true", async () => {
    process.env.VERCEL_TOKEN = "vercel-bootstrap-secret";
    process.env.VERCEL_PROJECT_ID = "prj_nexo_123";
    mockRequireSensitiveAdmin.mockResolvedValue(makeOwnerCtx());

    const missingConfirm = await postVercelDeploy(
      new Request("http://localhost/api/admin/vercel/deploy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target: "production" })
      })
    );
    expect(missingConfirm.status).toBe(400);

    globalThis.fetch = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            deployments: [{ uid: "dpl_prev", name: "nexo-beta", target: "production", state: "READY" }]
          }),
          { status: 200 }
        )
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: "dpl_999", url: "nexo-beta-999.vercel.app", readyState: "QUEUED" }), { status: 200 })
      ) as unknown as typeof fetch;

    const okDeploy = await postVercelDeploy(
      new Request("http://localhost/api/admin/vercel/deploy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target: "production", confirmDeploy: true })
      })
    );
    expect(okDeploy.status).toBe(200);
    const deployBody = await okDeploy.json();
    expect(deployBody.deploymentId).toBe("dpl_999");
    expect(deployBody.state).toBe("QUEUED");
  });

  it("reports encryptionConfigured accurately in GET /api/admin/secrets", async () => {
    mockRequireAdmin.mockResolvedValueOnce(makeOwnerCtx());
    delete process.env.NEXO_MASTER_SECRET_KEY;
    const resNoKey = await getSecrets(new Request("http://localhost/api/admin/secrets"));
    expect(resNoKey.status).toBe(200);
    expect((await resNoKey.json()).encryptionConfigured).toBe(false);

    mockRequireAdmin.mockResolvedValueOnce(makeOwnerCtx());
    process.env.NEXO_MASTER_SECRET_KEY = "nexo-master-encryption-key-2026-prod";
    const resWithKey = await getSecrets(new Request("http://localhost/api/admin/secrets"));
    expect(resWithKey.status).toBe(200);
    expect((await resWithKey.json()).encryptionConfigured).toBe(true);
  });
});

describe("Maintenance Mode Enforcement on Voice & Memory Endpoints", () => {
  it("blocks regular users with 503 maintenance on /api/nexo/transcribe and /api/nexo/memory while Owner bypasses", async () => {
    const snap = buildDefaultSnapshot();
    snap.maintenance.enabled = true;
    snap.maintenance.message = "Scheduled upgrade.";
    mockGetRuntimeConfig.mockResolvedValue(snap);

    mockRequireAuthContext.mockResolvedValueOnce(makeUserCtx());
    const userTransRes = await postNexoTranscribe(
      new Request("http://localhost/api/nexo/transcribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ audioBase64: "AQID", mimeType: "audio/webm" })
      })
    );
    expect(userTransRes.status).toBe(503);
    expect((await userTransRes.json()).error.code).toBe("maintenance");

    mockRequireAuthContext.mockResolvedValueOnce(makeUserCtx());
    const userMemRes = await postNexoMemory(
      new Request("http://localhost/api/nexo/memory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: [{ role: "user", content: "Remember I use TypeScript." }] })
      })
    );
    expect(userMemRes.status).toBe(503);
    expect((await userMemRes.json()).error.code).toBe("maintenance");

    // Owner bypasses maintenance -> reaches body validation (400) instead of 503 maintenance
    mockRequireAuthContext.mockResolvedValueOnce(makeOwnerCtx());
    const ownerMemRes = await postNexoMemory(
      new Request("http://localhost/api/nexo/memory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({})
      })
    );
    expect(ownerMemRes.status).toBe(400);
  });
});
