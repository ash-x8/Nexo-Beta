import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes } from "node:crypto";
import { ApiError } from "./firebaseAdmin";

export interface EncryptedSecretPayload {
  ciphertext: string;
  iv: string;
  authTag: string;
  keyVersion: number;
  fingerprint: string;
  length: number;
}

const KEY_VERSION = 1;
const MIN_RAW_KEY_CHARS = 16;

export function isEncryptionKeyConfigured(): boolean {
  const raw = (process.env.NEXO_MASTER_SECRET_KEY || process.env.SECRET_ENCRYPTION_KEY || "").trim();
  return raw.length >= MIN_RAW_KEY_CHARS;
}

/**
 * Derives a deterministic 256-bit AES key from NEXO_MASTER_SECRET_KEY (or SECRET_ENCRYPTION_KEY).
 * Supports 64-char hex keys, 32-byte base64 keys, or >= 16-char passphrases.
 * Fails safely with 503 if unavailable — NEVER falls back to hardcoded keys or plaintext storage.
 */
function deriveMasterKey(): Buffer {
  const raw = (process.env.NEXO_MASTER_SECRET_KEY || process.env.SECRET_ENCRYPTION_KEY || "").trim();
  if (raw.length < MIN_RAW_KEY_CHARS) {
    throw new ApiError(
      503,
      "encryption_unconfigured",
      "Server encryption master key (NEXO_MASTER_SECRET_KEY, min 16 characters) is not configured. Plaintext secret storage is strictly disabled."
    );
  }

  if (/^[0-9a-fA-F]{64}$/.test(raw)) {
    return Buffer.from(raw, "hex");
  }

  if (/^[A-Za-z0-9+/]{43}=?$/.test(raw)) {
    const decoded = Buffer.from(raw, "base64");
    if (decoded.length === 32) return decoded;
  }

  return createHash("sha256").update(`nexo-runtime-secrets-v1:${raw}`, "utf8").digest();
}

/**
 * Encrypts a runtime secret using authenticated AES-256-GCM encryption.
 * Returns ciphertext, 96-bit random IV, GCM authTag, and non-reversible HMAC fingerprint.
 */
export function encryptSecret(plaintext: string): EncryptedSecretPayload {
  const clean = plaintext.trim();
  if (!clean) {
    throw new ApiError(400, "bad_request", "Secret value cannot be empty.");
  }

  const key = deriveMasterKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(clean, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  const fingerprint = createHmac("sha256", key).update(clean, "utf8").digest("hex").slice(0, 12);

  return {
    ciphertext: encrypted.toString("base64"),
    iv: iv.toString("base64"),
    authTag: authTag.toString("base64"),
    keyVersion: KEY_VERSION,
    fingerprint,
    length: clean.length
  };
}

/**
 * Decrypts an AES-256-GCM encrypted runtime secret strictly inside trusted server memory.
 * Never call from public routes or serialize decrypted output to responses or logs.
 */
export function decryptSecret(payload: { ciphertext: string; iv: string; authTag: string }): string {
  const key = deriveMasterKey();
  try {
    const iv = Buffer.from(payload.iv, "base64");
    const authTag = Buffer.from(payload.authTag, "base64");
    const ciphertext = Buffer.from(payload.ciphertext, "base64");
    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(authTag);
    const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return decrypted.toString("utf8");
  } catch {
    throw new ApiError(
      500,
      "secret_decryption_failed",
      "Unable to decrypt stored secret. Verify NEXO_MASTER_SECRET_KEY matches the key used when encrypting."
    );
  }
}
