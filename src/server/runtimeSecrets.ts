import { randomUUID } from "node:crypto";
import { clearRuntimeSecretOverlay, setRuntimeSecretOverlay, type SecretResolutionMode } from "./env";
import { adminDb, ApiError, hasAdminCredentials } from "./firebaseAdmin";
import { decryptSecret, encryptSecret, isEncryptionKeyConfigured } from "./secretCrypto";

export type RuntimeSecretProvider =
  | "gemini"
  | "gemini_tts"
  | "openai"
  | "openrouter"
  | "openai_compatible"
  | "tavily"
  | "custom";

export type RuntimeSecretEnvironment = "all" | "production" | "preview" | "development";

export interface RuntimeSecretRecordDoc {
  name: string;
  envKey: string;
  provider: RuntimeSecretProvider;
  description: string;
  environment: RuntimeSecretEnvironment;
  active: boolean;
  ciphertext: string;
  iv: string;
  authTag: string;
  keyVersion: number;
  fingerprint: string;
  length: number;
  createdAt: number;
  updatedAt: number;
  updatedBy: string;
  vercelSyncStatus?: "not_synced" | "synced" | "sync_failed";
  vercelSyncedAt?: number | null;
  vercelSyncError?: string;
}

export interface RuntimeSecretMetadata {
  id: string;
  name: string;
  envKey: string;
  provider: RuntimeSecretProvider;
  description: string;
  environment: RuntimeSecretEnvironment;
  active: boolean;
  hasValue: true;
  maskedValue: string;
  fingerprint: string;
  length: number;
  keyVersion: number;
  createdAt: number;
  updatedAt: number;
  updatedBy: string;
  vercelSyncStatus: "not_synced" | "synced" | "sync_failed";
  vercelSyncedAt: number | null;
  vercelSyncError?: string;
}

export const PROVIDER_DEFAULT_ENV_KEY: Record<RuntimeSecretProvider, string> = {
  gemini: "GEMINI_API_KEY",
  gemini_tts: "GEMINI_TTS_API_KEY",
  openai: "OPENAI_API_KEY",
  openrouter: "OPENROUTER_API_KEY",
  openai_compatible: "OPENAI_COMPAT_API_KEY",
  tavily: "TAVILY_API_KEY",
  custom: "CUSTOM_API_KEY"
};

const SECRETS_CACHE_TTL_MS = 30_000;
let lastLoadedAt = 0;
let lastLoadedMode: SecretResolutionMode = "runtime_first";

export function invalidateRuntimeSecretsCache(): void {
  lastLoadedAt = 0;
  clearRuntimeSecretOverlay();
}

function currentRuntimeEnv(): RuntimeSecretEnvironment {
  const vercelEnv = (process.env.VERCEL_ENV || "").trim().toLowerCase();
  if (vercelEnv === "production") return "production";
  if (vercelEnv === "preview") return "preview";
  if (vercelEnv === "development" || process.env.NODE_ENV === "development") return "development";
  return "production";
}

function sanitizeSecretMeta(id: string, doc: RuntimeSecretRecordDoc): RuntimeSecretMetadata {
  return {
    id,
    name: doc.name,
    envKey: doc.envKey,
    provider: doc.provider,
    description: doc.description || "",
    environment: doc.environment || "all",
    active: doc.active !== false,
    hasValue: true,
    maskedValue: `•••••••••••• (${doc.length || 0} chars)`,
    fingerprint: doc.fingerprint || "unknown",
    length: doc.length || 0,
    keyVersion: doc.keyVersion || 1,
    createdAt: doc.createdAt || doc.updatedAt || 0,
    updatedAt: doc.updatedAt || 0,
    updatedBy: doc.updatedBy || "system",
    vercelSyncStatus: doc.vercelSyncStatus || "not_synced",
    vercelSyncedAt: doc.vercelSyncedAt ?? null,
    ...(doc.vercelSyncError ? { vercelSyncError: doc.vercelSyncError } : {})
  };
}

/**
 * Loads active encrypted runtime secrets from Firestore, decrypts ONLY in server memory,
 * and populates the server env overlay. Never writes to process.env permanently or logs values.
 */
export async function loadRuntimeSecretsIntoOverlay(
  force = false,
  mode: SecretResolutionMode = "runtime_first"
): Promise<void> {
  const now = Date.now();
  if (!force && lastLoadedAt > 0 && now - lastLoadedAt < SECRETS_CACHE_TTL_MS && lastLoadedMode === mode) {
    return;
  }

  if (!hasAdminCredentials() || !isEncryptionKeyConfigured()) {
    lastLoadedAt = now;
    lastLoadedMode = mode;
    return;
  }

  try {
    const snap = await adminDb().collection("secrets").where("active", "==", true).limit(100).get();
    const envTarget = currentRuntimeEnv();
    const decryptedMap: Record<string, string> = {};

    // Deterministic sort so specific environment overrides "all" and newer overrides older
    const docs = snap.docs
      .map((d) => ({ id: d.id, data: d.data() as RuntimeSecretRecordDoc }))
      .sort((a, b) => {
        const aSpecific = a.data.environment === envTarget ? 1 : 0;
        const bSpecific = b.data.environment === envTarget ? 1 : 0;
        if (aSpecific !== bSpecific) return aSpecific - bSpecific;
        return (a.data.updatedAt || 0) - (b.data.updatedAt || 0);
      });

    for (const item of docs) {
      const d = item.data;
      if (d.environment !== "all" && d.environment !== envTarget) continue;
      if (!d.envKey || !d.ciphertext || !d.iv || !d.authTag) continue;
      try {
        const val = decryptSecret({
          ciphertext: d.ciphertext,
          iv: d.iv,
          authTag: d.authTag
        });
        if (val) decryptedMap[d.envKey] = val;
      } catch {
        console.warn(`[runtimeSecrets] skipped secret ${item.id} due to decryption mismatch`);
      }
    }

    setRuntimeSecretOverlay(decryptedMap, mode);
    lastLoadedAt = now;
    lastLoadedMode = mode;
  } catch (err) {
    console.warn("[runtimeSecrets] load skipped:", (err as Error).message);
  }
}

export async function listRuntimeSecretsMetadata(): Promise<RuntimeSecretMetadata[]> {
  if (!hasAdminCredentials()) return [];
  const snap = await adminDb().collection("secrets").orderBy("updatedAt", "desc").limit(100).get();
  return snap.docs.map((d) => sanitizeSecretMeta(d.id, d.data() as RuntimeSecretRecordDoc));
}

export async function saveRuntimeSecret(opts: {
  id?: string;
  name: string;
  envKey?: string;
  provider: RuntimeSecretProvider;
  value?: string;
  description?: string;
  environment: RuntimeSecretEnvironment;
  active: boolean;
  actorUid: string;
}): Promise<RuntimeSecretMetadata> {
  if (!hasAdminCredentials()) {
    throw new ApiError(503, "server_config", "Firebase Admin credentials are required for Runtime Secret Manager.");
  }
  if (!isEncryptionKeyConfigured()) {
    throw new ApiError(
      503,
      "encryption_unconfigured",
      "Server master encryption key (NEXO_MASTER_SECRET_KEY) is not configured. Plaintext storage is disabled."
    );
  }

  const db = adminDb();
  const now = Date.now();
  const id = (opts.id || "").trim() || `sec_${randomUUID().replace(/-/g, "").slice(0, 16)}`;
  const ref = db.collection("secrets").doc(id);
  const existingSnap = await ref.get();
  const existing = existingSnap.exists ? (existingSnap.data() as RuntimeSecretRecordDoc) : null;

  const envKey = (opts.envKey || PROVIDER_DEFAULT_ENV_KEY[opts.provider] || "CUSTOM_API_KEY")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_]/g, "");

  if (!envKey) {
    throw new ApiError(400, "bad_request", "Valid target environment variable key is required.");
  }

  let encryptedParts: {
    ciphertext: string;
    iv: string;
    authTag: string;
    keyVersion: number;
    fingerprint: string;
    length: number;
  };

  if (opts.value && opts.value.trim()) {
    encryptedParts = encryptSecret(opts.value);
  } else if (existing) {
    encryptedParts = {
      ciphertext: existing.ciphertext,
      iv: existing.iv,
      authTag: existing.authTag,
      keyVersion: existing.keyVersion || 1,
      fingerprint: existing.fingerprint,
      length: existing.length
    };
  } else {
    throw new ApiError(400, "bad_request", "Secret value is required when creating a new runtime secret.");
  }

  const nextDoc: RuntimeSecretRecordDoc = {
    name: opts.name.trim().slice(0, 80),
    envKey,
    provider: opts.provider,
    description: (opts.description || "").trim().slice(0, 240),
    environment: opts.environment,
    active: opts.active,
    ...encryptedParts,
    createdAt: existing?.createdAt || now,
    updatedAt: now,
    updatedBy: opts.actorUid,
    vercelSyncStatus: existing?.vercelSyncStatus || "not_synced",
    vercelSyncedAt: existing?.vercelSyncedAt ?? null
  };

  await ref.set(nextDoc);
  invalidateRuntimeSecretsCache();
  await loadRuntimeSecretsIntoOverlay(true);
  return sanitizeSecretMeta(id, nextDoc);
}

export async function updateRuntimeSecretStatus(id: string, active: boolean, actorUid: string): Promise<RuntimeSecretMetadata> {
  if (!hasAdminCredentials()) {
    throw new ApiError(503, "server_config", "Firebase Admin credentials are required.");
  }
  const ref = adminDb().collection("secrets").doc(id);
  const snap = await ref.get();
  if (!snap.exists) {
    throw new ApiError(404, "not_found", "Runtime secret record not found.");
  }
  const prev = snap.data() as RuntimeSecretRecordDoc;
  const next: RuntimeSecretRecordDoc = {
    ...prev,
    active,
    updatedAt: Date.now(),
    updatedBy: actorUid
  };
  await ref.set(next);
  invalidateRuntimeSecretsCache();
  await loadRuntimeSecretsIntoOverlay(true);
  return sanitizeSecretMeta(id, next);
}

export async function deleteRuntimeSecret(id: string): Promise<RuntimeSecretMetadata | null> {
  if (!hasAdminCredentials()) {
    throw new ApiError(503, "server_config", "Firebase Admin credentials are required.");
  }
  const ref = adminDb().collection("secrets").doc(id);
  const snap = await ref.get();
  if (!snap.exists) {
    throw new ApiError(404, "not_found", "Runtime secret record not found.");
  }
  const meta = sanitizeSecretMeta(id, snap.data() as RuntimeSecretRecordDoc);
  await ref.delete();
  invalidateRuntimeSecretsCache();
  await loadRuntimeSecretsIntoOverlay(true);
  return meta;
}

/**
 * Strictly server-only: decrypts a runtime secret solely for pushing into Vercel Env API.
 * NEVER return the returned string in any API response or audit log.
 */
export async function getDecryptedSecretForServerSync(
  id: string
): Promise<{ envKey: string; plaintext: string; meta: RuntimeSecretMetadata }> {
  if (!hasAdminCredentials()) {
    throw new ApiError(503, "server_config", "Firebase Admin credentials are required.");
  }
  if (!isEncryptionKeyConfigured()) {
    throw new ApiError(503, "encryption_unconfigured", "NEXO_MASTER_SECRET_KEY is not configured.");
  }
  const ref = adminDb().collection("secrets").doc(id);
  const snap = await ref.get();
  if (!snap.exists) {
    throw new ApiError(404, "not_found", "Runtime secret record not found.");
  }
  const doc = snap.data() as RuntimeSecretRecordDoc;
  const plaintext = decryptSecret({
    ciphertext: doc.ciphertext,
    iv: doc.iv,
    authTag: doc.authTag
  });
  return {
    envKey: doc.envKey,
    plaintext,
    meta: sanitizeSecretMeta(id, doc)
  };
}

export async function markSecretVercelSyncResult(
  id: string,
  status: "synced" | "sync_failed",
  errorMessage?: string
): Promise<void> {
  if (!hasAdminCredentials()) return;
  await adminDb()
    .collection("secrets")
    .doc(id)
    .set(
      {
        vercelSyncStatus: status,
        vercelSyncedAt: status === "synced" ? Date.now() : null,
        vercelSyncError: status === "sync_failed" ? (errorMessage || "Sync failed").slice(0, 200) : ""
      },
      { merge: true }
    );
}
