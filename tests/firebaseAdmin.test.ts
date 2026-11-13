import { afterEach, describe, expect, it } from "vitest";
import {
  ApiError,
  hasAdminCredentials,
  isValidPemPrivateKey,
  normalizePrivateKey,
  readCredentials,
  requireUser
} from "@/server/firebaseAdmin";

const SNAPSHOT = { ...process.env };

afterEach(() => {
  process.env = { ...SNAPSHOT };
});

describe("server/firebaseAdmin PEM handling", () => {
  it("normalizes escaped \\n private keys with optional quotes and trailing commas", () => {
    const raw = '"-----BEGIN PRIVATE KEY-----\\nMIIEvQIBADANBg==\\n-----END PRIVATE KEY-----\\n",';
    const normalized = normalizePrivateKey(raw);
    expect(normalized).toBe("-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBg==\n-----END PRIVATE KEY-----");
    expect(isValidPemPrivateKey(normalized)).toBe(true);
  });

  it("supports actual multiline PEM values with LF or CRLF line endings", () => {
    const multiline = "-----BEGIN PRIVATE KEY-----\r\nMIIEvQIBADANBg==\r\nABC123==\r\n-----END PRIVATE KEY-----\r\n";
    const normalized = normalizePrivateKey(multiline);
    expect(normalized).toBe("-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBg==\nABC123==\n-----END PRIVATE KEY-----");
    expect(isValidPemPrivateKey(normalized)).toBe(true);
  });

  it("supports double-escaped \\\\n private keys", () => {
    const doubleEscaped = "-----BEGIN PRIVATE KEY-----\\\\nMIIEvQIBADANBg==\\\\n-----END PRIVATE KEY-----";
    const normalized = normalizePrivateKey(doubleEscaped);
    expect(normalized).toBe("-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBg==\n-----END PRIVATE KEY-----");
    expect(isValidPemPrivateKey(normalized)).toBe(true);
  });

  it("extracts and normalizes credentials from whole service-account JSON strings", () => {
    process.env.FIREBASE_PROJECT_ID = "";
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID = "";
    process.env.FIREBASE_CLIENT_EMAIL = "";
    process.env.FIREBASE_PRIVATE_KEY = JSON.stringify({
      project_id: "nexo-test-project",
      client_email: "svc@nexo-test-project.iam.gserviceaccount.com",
      private_key: "-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBg==\n-----END PRIVATE KEY-----\n"
    });

    const creds = readCredentials();
    expect(creds.projectId).toBe("nexo-test-project");
    expect(creds.clientEmail).toBe("svc@nexo-test-project.iam.gserviceaccount.com");
    expect(isValidPemPrivateKey(creds.privateKey)).toBe(true);
    expect(hasAdminCredentials()).toBe(true);
  });

  it("rejects keys missing BEGIN/END markers, reversed markers, or empty body", () => {
    expect(isValidPemPrivateKey("MIIEvQIBADANBg==")).toBe(false);
    expect(isValidPemPrivateKey("-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBg==")).toBe(false);
    expect(isValidPemPrivateKey("MIIEvQIBADANBg==\n-----END PRIVATE KEY-----")).toBe(false);
    expect(isValidPemPrivateKey("-----END PRIVATE KEY-----\nMII\n-----BEGIN PRIVATE KEY-----")).toBe(false);
    expect(isValidPemPrivateKey("-----BEGIN PRIVATE KEY-----\n   \n-----END PRIVATE KEY-----")).toBe(false);

    process.env.FIREBASE_PROJECT_ID = "proj";
    process.env.FIREBASE_CLIENT_EMAIL = "svc@proj.iam.gserviceaccount.com";
    process.env.FIREBASE_PRIVATE_KEY = "\\nMIIEvQIBADANBg==\\n";
    expect(hasAdminCredentials()).toBe(false);
  });

  it("enforces authentication and does not leak private key material in errors", async () => {
    process.env.FIREBASE_PROJECT_ID = "proj";
    process.env.FIREBASE_CLIENT_EMAIL = "svc@proj.iam.gserviceaccount.com";
    process.env.FIREBASE_PRIVATE_KEY = "SENSITIVE_FRAGMENT_WITHOUT_HEADERS";

    await expect(requireUser(new Request("http://localhost/api/usage"))).rejects.toMatchObject({
      status: 401,
      code: "unauthenticated"
    });

    try {
      await requireUser(new Request("http://localhost/api/usage", { headers: { Authorization: "Bearer fake-token" } }));
      expect.unreachable("Should have rejected invalid private key");
    } catch (e) {
      expect(e).toBeInstanceOf(ApiError);
      const err = e as ApiError;
      expect(err.status).toBe(500);
      expect(err.message).toBe("FIREBASE_PRIVATE_KEY format is invalid. Ensure it includes the full PEM key.");
      expect(err.message).not.toContain("SENSITIVE_FRAGMENT_WITHOUT_HEADERS");
    }
  });
});
