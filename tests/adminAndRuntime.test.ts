import { afterEach, describe, expect, it, vi } from "vitest";

const { mockRequireAdmin, mockRequireAuthContext, mockGetRuntimeConfig, mockHasAdminCredentials } = vi.hoisted(() => ({
  mockRequireAdmin: vi.fn(),
  mockRequireAuthContext: vi.fn(),
  mockGetRuntimeConfig: vi.fn(),
  mockHasAdminCredentials: vi.fn(() => true)
}));

vi.mock("@/server/firebaseAdmin", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/server/firebaseAdmin")>();
  return {
    ...actual,
    requireAdmin: mockRequireAdmin,
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

import { GET as getAdminOverview } from "@/app/api/admin/overview/route";
import { PATCH as patchAdminUser } from "@/app/api/admin/users/[uid]/route";
import { POST as revokeAdminUser } from "@/app/api/admin/users/[uid]/revoke/route";
import { POST as postChat } from "@/app/api/chat/route";
import { sanitizeAuditValue } from "@/server/adminAudit";
import { ApiError, getOwnerAllowlist, isOwnerIdentity, type AuthContext } from "@/server/firebaseAdmin";
import { systemPrompt } from "@/server/prompt";
import { buildDefaultSnapshot, resolveEffectiveFeatures, sanitizePlainText } from "@/server/runtimeConfig";

const ORIG_ENV = { ...process.env };

function makeOwnerCtx(overrides: Partial<AuthContext> = {}): AuthContext {
  return {
    uid: "owner-uid-1",
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
    uid: "user-uid-2",
    email: "user@example.com",
    emailVerified: true,
    displayName: "Regular User",
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
  vi.clearAllMocks();
});

describe("Owner RBAC, runtime config precedence, maintenance bypass, and hygiene", () => {
  it("recognizes verified owner email allowlist and blocks unverified or forged emails", () => {
    delete process.env.OWNER_EMAIL;
    delete process.env.SUPER_ADMIN_EMAILS;
    const allow = getOwnerAllowlist();
    expect(allow.has("kushanashvika216@gmail.com")).toBe(true);
    expect(isOwnerIdentity("kushanashvika216@gmail.com", true)).toBe(true);
    expect(isOwnerIdentity("kushanashvika216@gmail.com", false)).toBe(false);
    expect(isOwnerIdentity("attacker@example.com", true)).toBe(false);
  });

  it("blocks non-owner and unauthenticated access to admin API routes", async () => {
    mockRequireAdmin.mockRejectedValueOnce(new ApiError(403, "forbidden", "Owner Super Admin authorization required."));
    const res = await getAdminOverview(new Request("http://localhost/api/admin/overview"));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error.code).toBe("forbidden");
  });

  it("prevents the Owner from self-suspending or self-revoking active admin access", async () => {
    mockRequireAdmin.mockResolvedValue(makeOwnerCtx({ uid: "owner-uid-1" }));

    const patchRes = await patchAdminUser(
      new Request("http://localhost/api/admin/users/owner-uid-1", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "suspended" })
      }),
      { params: { uid: "owner-uid-1" } }
    );
    expect(patchRes.status).toBe(400);
    expect((await patchRes.json()).error.code).toBe("self_protection");

    const revokeRes = await revokeAdminUser(
      new Request("http://localhost/api/admin/users/owner-uid-1/revoke", { method: "POST" }),
      { params: { uid: "owner-uid-1" } }
    );
    expect(revokeRes.status).toBe(400);
    expect((await revokeRes.json()).error.code).toBe("self_protection");
  });

  it("enforces maintenance mode (503) and disabled feature flags (403) for regular users while preserving Owner bypass", async () => {
    process.env.AI_PROVIDER = "gemini";
    process.env.GEMINI_API_KEY = "test-secret";

    const snapshot = buildDefaultSnapshot();
    snapshot.maintenance.enabled = true;
    snapshot.maintenance.message = "Upgrading backend services.";
    mockGetRuntimeConfig.mockResolvedValue(snapshot);

    mockRequireAuthContext.mockResolvedValueOnce(makeUserCtx());
    const userRes = await postChat(
      new Request("http://localhost/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: [{ role: "user", content: "Hello" }] })
      })
    );
    expect(userRes.status).toBe(503);
    expect((await userRes.json()).error.code).toBe("maintenance");

    // Owner bypasses maintenance mode (reaches body validation -> 400 rather than 503 maintenance)
    mockRequireAuthContext.mockResolvedValueOnce(makeOwnerCtx());
    const ownerRes = await postChat(
      new Request("http://localhost/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: [{ role: "user", content: "" }] })
      })
    );
    expect(ownerRes.status).toBe(400);

    // Disable chat globally and verify feature gate for owner/user
    const disabledChatSnap = buildDefaultSnapshot();
    disabledChatSnap.featureFlags.chat = false;
    mockGetRuntimeConfig.mockResolvedValueOnce(disabledChatSnap);
    mockRequireAuthContext.mockResolvedValueOnce(makeUserCtx());
    const disabledRes = await postChat(
      new Request("http://localhost/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: [{ role: "user", content: "Hello" }] })
      })
    );
    expect(disabledRes.status).toBe(403);
    expect((await disabledRes.json()).error.code).toBe("feature_disabled");
  });

  it("resolves effective feature flags with strict precedence (server keys > global flags > user overrides)", () => {
    const baseFlags = buildDefaultSnapshot().featureFlags;
    // Server lacks Tavily key -> webSearch stays false even if global or user override enables it
    const effNoKey = resolveEffectiveFeatures(baseFlags, { webSearch: true, tts: false }, false);
    expect(effNoKey.webSearch).toBe(false);
    expect(effNoKey.tts).toBe(false);
    expect(effNoKey.imageGeneration).toBe(false);

    // Global webSearch off -> user override cannot force it on
    const effGlobalOff = resolveEffectiveFeatures({ ...baseFlags, webSearch: false }, { webSearch: true }, true);
    expect(effGlobalOff.webSearch).toBe(false);
  });

  it("sanitizes HTML from announcements and redacts sensitive fields from audit logs", () => {
    expect(sanitizePlainText('<b>Notice</b><script>alert(1)</script> Scheduled update')).toBe(
      "Noticealert(1) Scheduled update"
    );

    const sanitized = sanitizeAuditValue({
      appName: "NEXO AI",
      apiKey: "super-secret-value",
      nested: {
        privateKey: "-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----",
        token: "bearer-123",
        safeField: "gemini-2.5-flash"
      }
    }) as Record<string, unknown>;

    expect(sanitized.appName).toBe("NEXO AI");
    expect(sanitized.apiKey).toBe("[REDACTED]");
    expect((sanitized.nested as Record<string, unknown>).privateKey).toBe("[REDACTED]");
    expect((sanitized.nested as Record<string, unknown>).token).toBe("[REDACTED]");
    expect((sanitized.nested as Record<string, unknown>).safeField).toBe("gemini-2.5-flash");
  });

  it("keeps ordinary AI prompt free of automatic credit injection while retaining conditional identity instruction", () => {
    const prompt = systemPrompt({
      language: "auto",
      memory: []
    });
    expect(prompt).toContain("NEVER automatically append or inject developer credits");
    expect(prompt).toContain("Only when explicitly asked about authorship/ownership");
  });
});
