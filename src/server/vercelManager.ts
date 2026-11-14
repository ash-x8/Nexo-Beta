import type {
  VercelCustomEnvSummary,
  VercelDeploymentSummary,
  VercelEnvComparisonRow,
  VercelEnvOwnership,
  VercelEnvValueStatus,
  VercelEnvVarItem,
  VercelEnvVarType,
  VercelInventoryResponse
} from "@/lib/types";
import { vercelConfigured } from "./env";
import { adminDb, ApiError, hasAdminCredentials } from "./firebaseAdmin";

const VERCEL_API_BASE = "https://api.vercel.com";

export const EXPECTED_NEXO_ENV_KEYS = [
  "AI_PROVIDER",
  "FREE_ONLY_MODE",
  "GEMINI_API_KEY",
  "GEMINI_MODEL",
  "GEMINI_IMAGE_MODEL",
  "GEMINI_TTS_MODEL",
  "FIREBASE_PROJECT_ID",
  "FIREBASE_CLIENT_EMAIL",
  "FIREBASE_PRIVATE_KEY",
  "NEXT_PUBLIC_FIREBASE_API_KEY",
  "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN",
  "NEXT_PUBLIC_FIREBASE_PROJECT_ID",
  "NEXT_PUBLIC_FIREBASE_APP_ID",
  "OWNER_EMAIL",
  "NEXO_MASTER_SECRET_KEY",
  "TAVILY_API_KEY"
];

interface LedgerEntry {
  managedByNexo: boolean;
  lastSyncedAt: number | null;
  lastSyncedUpdatedAt: number | null;
  lastTargets: string[];
  syncStatus: "synced" | "sync_pending" | "sync_failed";
  lastSyncError?: string | null;
  lastKnownVercelId?: string | null;
}

interface VercelLedgerDoc {
  redeployPending?: boolean;
  entries?: Record<string, LedgerEntry>;
  updatedAt?: number;
}

interface RawVercelEnv {
  id?: string;
  key?: string;
  value?: string;
  type?: string;
  target?: string[] | string;
  customEnvironmentIds?: string[];
  gitBranch?: string | null;
  comment?: string | null;
  createdAt?: number;
  updatedAt?: number;
}

function getVercelCreds() {
  const token = (process.env.VERCEL_TOKEN || "").trim();
  const projectId = (process.env.VERCEL_PROJECT_ID || "").trim();
  const teamId = (process.env.VERCEL_TEAM_ID || "").trim();
  return { token, projectId, teamId };
}

function withTeamQuery(path: string, teamId: string): string {
  if (!teamId) return path;
  const sep = path.includes("?") ? "&" : "?";
  return `${path}${sep}teamId=${encodeURIComponent(teamId)}`;
}

async function vercelFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const { token, projectId, teamId } = getVercelCreds();
  if (!token || !projectId) {
    throw new ApiError(
      503,
      "vercel_unconfigured",
      "Vercel bootstrap credentials (VERCEL_TOKEN and VERCEL_PROJECT_ID) are not configured on the server."
    );
  }

  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 14_000);
  try {
    const res = await fetch(`${VERCEL_API_BASE}${withTeamQuery(path, teamId)}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(init.body ? { "Content-Type": "application/json" } : {}),
        ...(init.headers || {})
      },
      cache: "no-store",
      signal: ac.signal
    });

    const json = (await res.json().catch(() => null)) as Record<string, unknown> | null;
    if (!res.ok) {
      const errObj = json?.error as { message?: string; code?: string } | undefined;
      const msg = errObj?.message || `Vercel API error (${res.status}).`;
      if (res.status === 401 || res.status === 403) {
        throw new ApiError(res.status, "vercel_auth_error", msg);
      }
      if (res.status === 404) {
        throw new ApiError(404, "vercel_not_found", msg);
      }
      throw new ApiError(res.status >= 400 && res.status < 500 ? res.status : 502, "vercel_api_error", msg);
    }
    return (json || {}) as T;
  } catch (err) {
    if (err instanceof ApiError) throw err;
    if (ac.signal.aborted) {
      throw new ApiError(504, "vercel_timeout", "Vercel API request timed out.");
    }
    throw new ApiError(502, "vercel_network_error", "Could not reach Vercel REST API.");
  } finally {
    clearTimeout(timer);
  }
}

async function readLedger(): Promise<VercelLedgerDoc> {
  if (!hasAdminCredentials()) return { redeployPending: false, entries: {} };
  try {
    const snap = await adminDb().doc("system/vercelEnvLedger").get();
    if (!snap.exists) return { redeployPending: false, entries: {} };
    const data = snap.data() as VercelLedgerDoc;
    return {
      redeployPending: Boolean(data.redeployPending),
      entries: data.entries && typeof data.entries === "object" ? data.entries : {},
      updatedAt: data.updatedAt || 0
    };
  } catch {
    return { redeployPending: false, entries: {} };
  }
}

async function writeLedgerPatch(patch: {
  redeployPending?: boolean;
  entryKey?: string;
  entry?: LedgerEntry | null;
}): Promise<void> {
  if (!hasAdminCredentials()) return;
  try {
    const ref = adminDb().doc("system/vercelEnvLedger");
    const cur = await readLedger();
    const entries = { ...(cur.entries || {}) };
    if (patch.entryKey) {
      if (patch.entry === null) {
        delete entries[patch.entryKey];
      } else if (patch.entry) {
        entries[patch.entryKey] = patch.entry;
      }
    }
    await ref.set(
      {
        redeployPending: patch.redeployPending !== undefined ? patch.redeployPending : Boolean(cur.redeployPending),
        entries,
        updatedAt: Date.now()
      },
      { merge: true }
    );
  } catch {
    /* non-blocking ledger persistence */
  }
}

function normalizeTargets(raw: RawVercelEnv): string[] {
  const arr = Array.isArray(raw.target) ? raw.target : typeof raw.target === "string" ? [raw.target] : [];
  return arr.map((t) => String(t).trim()).filter(Boolean);
}

function normalizeEnvType(rawType: string | undefined): VercelEnvVarType {
  if (rawType === "plain" || rawType === "encrypted" || rawType === "sensitive" || rawType === "secret" || rawType === "system") {
    return rawType;
  }
  return "encrypted";
}

function classifyValueHandling(raw: RawVercelEnv, type: VercelEnvVarType): {
  valueStatus: VercelEnvValueStatus;
  value: string | null;
  maskedDisplay: string;
} {
  // Respect Vercel secret protection strictly:
  // Only return plaintext value for non-secret config ("plain" / "system") when legitimately returned by Vercel API.
  const isProtectedType = type === "secret" || type === "sensitive" || type === "encrypted";
  const hasReturnedString = typeof raw.value === "string" && raw.value.length > 0;

  if (!isProtectedType && hasReturnedString) {
    return {
      valueStatus: "value_available",
      value: raw.value!,
      maskedDisplay: raw.value!
    };
  }

  if (isProtectedType) {
    return {
      valueStatus: hasReturnedString && type === "encrypted" ? "secret_masked" : "secret_masked",
      value: null,
      maskedDisplay: "•••••••••••• (Value unavailable — replace to update)"
    };
  }

  return {
    valueStatus: "value_unavailable",
    value: null,
    maskedDisplay: "Value unavailable — replace to update"
  };
}

function classifyOwnership(raw: RawVercelEnv, ledgerEntry: LedgerEntry | undefined): VercelEnvOwnership {
  if (!ledgerEntry) return "created_manually_in_vercel";
  if (ledgerEntry.syncStatus === "sync_failed") return "sync_failed";
  if (ledgerEntry.syncStatus === "sync_pending") return "sync_pending";

  const remoteUpdated = typeof raw.updatedAt === "number" ? raw.updatedAt : null;
  if (
    ledgerEntry.managedByNexo &&
    remoteUpdated &&
    ledgerEntry.lastSyncedUpdatedAt &&
    remoteUpdated > ledgerEntry.lastSyncedUpdatedAt + 2000
  ) {
    return "externally_modified";
  }

  const remoteTargets = [...normalizeTargets(raw)].sort().join(",");
  const syncedTargets = [...(ledgerEntry.lastTargets || [])].sort().join(",");
  if (ledgerEntry.managedByNexo && syncedTargets && remoteTargets !== syncedTargets) {
    return "externally_modified";
  }

  return ledgerEntry.managedByNexo ? "managed_by_nexo" : "created_manually_in_vercel";
}

export async function listVercelEnvInventory(): Promise<VercelInventoryResponse> {
  const cfg = vercelConfigured();
  const { projectId } = getVercelCreds();
  const ledger = await readLedger();

  if (!cfg.configured) {
    return {
      configured: false,
      projectIdConfigured: cfg.hasProjectId,
      tokenConfigured: cfg.hasToken,
      teamIdConfigured: cfg.hasTeamId,
      redeployPending: Boolean(ledger.redeployPending),
      customEnvironments: [],
      envs: [],
      comparison: [],
      missingExpectedKeys: [...EXPECTED_NEXO_ENV_KEYS],
      deployments: [],
      fetchedAt: Date.now(),
      error: "Configure VERCEL_TOKEN and VERCEL_PROJECT_ID (server-only) to manage live Vercel environment variables."
    };
  }

  const [projectRes, envRes, customEnvRes, deployRes] = await Promise.all([
    vercelFetch<{ name?: string }>(`/v9/projects/${encodeURIComponent(projectId)}`).catch(() => ({ name: undefined })),
    vercelFetch<{ envs?: RawVercelEnv[] }>(`/v10/projects/${encodeURIComponent(projectId)}/env`),
    vercelFetch<{ environments?: Array<{ id?: string; slug?: string; name?: string }> }>(
      `/v9/projects/${encodeURIComponent(projectId)}/custom-environments`
    ).catch(() => ({ environments: [] })),
    vercelFetch<{
      deployments?: Array<{
        uid?: string;
        name?: string;
        url?: string;
        state?: string;
        target?: string | null;
        createdAt?: number;
        created?: number;
      }>;
    }>(`/v6/deployments?projectId=${encodeURIComponent(projectId)}&limit=6`).catch(() => ({ deployments: [] }))
  ]);

  const rawEnvs = Array.isArray(envRes.envs) ? envRes.envs : [];
  const customEnvironments: VercelCustomEnvSummary[] = (customEnvRes.environments || [])
    .filter((c) => c.id && (c.name || c.slug))
    .map((c) => ({
      id: String(c.id),
      slug: String(c.slug || c.name),
      name: String(c.name || c.slug)
    }));

  const envs: VercelEnvVarItem[] = rawEnvs.map((raw) => {
    const id = String(raw.id || "");
    const key = String(raw.key || "");
    const type = normalizeEnvType(raw.type);
    const target = normalizeTargets(raw);
    const customEnvironmentIds = Array.isArray(raw.customEnvironmentIds)
      ? raw.customEnvironmentIds.map((x) => String(x))
      : [];
    const valueInfo = classifyValueHandling(raw, type);
    const ledgerKey = id || key;
    const ledgerEntry = ledger.entries?.[ledgerKey] || ledger.entries?.[key];
    const ownership = classifyOwnership(raw, ledgerEntry);

    return {
      id,
      key,
      type,
      target,
      customEnvironmentIds,
      gitBranch: raw.gitBranch ? String(raw.gitBranch) : null,
      comment: raw.comment ? String(raw.comment) : null,
      valueStatus: ledgerEntry?.syncStatus === "sync_failed" ? "sync_failed" : valueInfo.valueStatus,
      value: valueInfo.value,
      maskedDisplay: valueInfo.maskedDisplay,
      ownership,
      createdAt: typeof raw.createdAt === "number" ? raw.createdAt : null,
      updatedAt: typeof raw.updatedAt === "number" ? raw.updatedAt : null,
      lastSyncedAt: ledgerEntry?.lastSyncedAt ?? null,
      lastSyncError: ledgerEntry?.lastSyncError ?? null
    };
  });

  // Build comparison matrix grouped by variable key across Production / Preview / Development / Custom
  const matrixMap = new Map<string, { production: boolean; preview: boolean; development: boolean; custom: Set<string> }>();
  for (const item of envs) {
    const entry = matrixMap.get(item.key) || {
      production: false,
      preview: false,
      development: false,
      custom: new Set<string>()
    };
    if (item.target.includes("production")) entry.production = true;
    if (item.target.includes("preview")) entry.preview = true;
    if (item.target.includes("development")) entry.development = true;
    for (const cId of item.customEnvironmentIds) entry.custom.add(cId);
    matrixMap.set(item.key, entry);
  }

  const comparison: VercelEnvComparisonRow[] = Array.from(matrixMap.entries())
    .map(([key, scopes]) => {
      const missingTargets: string[] = [];
      if (!scopes.production) missingTargets.push("production");
      if (!scopes.preview) missingTargets.push("preview");
      if (!scopes.development) missingTargets.push("development");
      return {
        key,
        production: scopes.production,
        preview: scopes.preview,
        development: scopes.development,
        customCount: scopes.custom.size,
        consistent: missingTargets.length === 0,
        missingTargets
      };
    })
    .sort((a, b) => Number(a.consistent) - Number(b.consistent) || a.key.localeCompare(b.key));

  const presentKeys = new Set(envs.map((e) => e.key));
  const missingExpectedKeys = EXPECTED_NEXO_ENV_KEYS.filter((k) => !presentKeys.has(k));

  const deployments: VercelDeploymentSummary[] = (deployRes.deployments || [])
    .filter((d) => d.uid && d.url)
    .map((d) => ({
      uid: String(d.uid),
      name: String(d.name || projectRes.name || "nexo-ai"),
      url: String(d.url),
      state: String(d.state || "UNKNOWN"),
      target: d.target ? String(d.target) : null,
      createdAt: Number(d.createdAt || d.created || 0)
    }));

  return {
    configured: true,
    projectIdConfigured: true,
    tokenConfigured: true,
    teamIdConfigured: cfg.hasTeamId,
    projectName: projectRes.name ? String(projectRes.name) : undefined,
    redeployPending: Boolean(ledger.redeployPending),
    customEnvironments,
    envs: envs.sort((a, b) => a.key.localeCompare(b.key)),
    comparison,
    missingExpectedKeys,
    deployments,
    fetchedAt: Date.now()
  };
}

export async function createVercelEnvVar(input: {
  key: string;
  value: string;
  type: "plain" | "encrypted" | "sensitive";
  target: string[];
  customEnvironmentIds?: string[];
  gitBranch?: string;
  comment?: string;
}): Promise<{ id: string; key: string; target: string[]; type: string; redeployRequired: true }> {
  const { projectId } = getVercelCreds();
  const cleanKey = input.key.trim().toUpperCase();

  try {
    const res = await vercelFetch<{ created?: RawVercelEnv | RawVercelEnv[]; id?: string }>(
      `/v10/projects/${encodeURIComponent(projectId)}/env`,
      {
        method: "POST",
        body: JSON.stringify({
          key: cleanKey,
          value: input.value,
          type: input.type,
          target: input.target,
          ...(input.customEnvironmentIds?.length ? { customEnvironmentIds: input.customEnvironmentIds } : {}),
          ...(input.gitBranch?.trim() ? { gitBranch: input.gitBranch.trim() } : {}),
          ...(input.comment?.trim() ? { comment: input.comment.trim() } : {})
        })
      }
    );

    const createdObj = Array.isArray(res.created) ? res.created[0] : res.created || (res as unknown as RawVercelEnv);
    const id = String(createdObj?.id || res.id || cleanKey);
    const updatedAt = typeof createdObj?.updatedAt === "number" ? createdObj.updatedAt : Date.now();

    await writeLedgerPatch({
      redeployPending: true,
      entryKey: id,
      entry: {
        managedByNexo: true,
        lastSyncedAt: Date.now(),
        lastSyncedUpdatedAt: updatedAt,
        lastTargets: input.target,
        syncStatus: "synced",
        lastKnownVercelId: id
      }
    });

    return {
      id,
      key: cleanKey,
      target: input.target,
      type: input.type,
      redeployRequired: true
    };
  } catch (err) {
    await writeLedgerPatch({
      entryKey: cleanKey,
      entry: {
        managedByNexo: true,
        lastSyncedAt: Date.now(),
        lastSyncedUpdatedAt: null,
        lastTargets: input.target,
        syncStatus: "sync_failed",
        lastSyncError: (err as Error).message.slice(0, 180)
      }
    });
    throw err;
  }
}

export async function updateVercelEnvVar(input: {
  id: string;
  key?: string;
  value?: string;
  type?: "plain" | "encrypted" | "sensitive";
  target?: string[];
  customEnvironmentIds?: string[];
  gitBranch?: string | null;
  comment?: string;
}): Promise<{ id: string; key: string; target: string[]; type: string; redeployRequired: true }> {
  const { projectId } = getVercelCreds();
  const payload: Record<string, unknown> = {};
  if (input.key) payload.key = input.key.trim().toUpperCase();
  if (input.value !== undefined) payload.value = input.value;
  if (input.type) payload.type = input.type;
  if (input.target?.length) payload.target = input.target;
  if (input.customEnvironmentIds) payload.customEnvironmentIds = input.customEnvironmentIds;
  if (input.gitBranch !== undefined) payload.gitBranch = input.gitBranch;
  if (input.comment !== undefined) payload.comment = input.comment;

  try {
    const res = await vercelFetch<RawVercelEnv>(
      `/v9/projects/${encodeURIComponent(projectId)}/env/${encodeURIComponent(input.id)}`,
      {
        method: "PATCH",
        body: JSON.stringify(payload)
      }
    );

    const updatedTargets = normalizeTargets(res).length ? normalizeTargets(res) : input.target || [];
    const updatedAt = typeof res.updatedAt === "number" ? res.updatedAt : Date.now();

    await writeLedgerPatch({
      redeployPending: true,
      entryKey: input.id,
      entry: {
        managedByNexo: true,
        lastSyncedAt: Date.now(),
        lastSyncedUpdatedAt: updatedAt,
        lastTargets: updatedTargets,
        syncStatus: "synced",
        lastKnownVercelId: input.id
      }
    });

    return {
      id: input.id,
      key: String(res.key || input.key || ""),
      target: updatedTargets,
      type: normalizeEnvType(res.type || input.type),
      redeployRequired: true
    };
  } catch (err) {
    await writeLedgerPatch({
      entryKey: input.id,
      entry: {
        managedByNexo: true,
        lastSyncedAt: Date.now(),
        lastSyncedUpdatedAt: null,
        lastTargets: input.target || [],
        syncStatus: "sync_failed",
        lastSyncError: (err as Error).message.slice(0, 180),
        lastKnownVercelId: input.id
      }
    });
    throw err;
  }
}

export async function deleteVercelEnvVar(id: string): Promise<{ id: string; redeployRequired: true }> {
  const { projectId } = getVercelCreds();
  await vercelFetch<Record<string, unknown>>(
    `/v9/projects/${encodeURIComponent(projectId)}/env/${encodeURIComponent(id)}`,
    { method: "DELETE" }
  );

  await writeLedgerPatch({
    redeployPending: true,
    entryKey: id,
    entry: null
  });

  return { id, redeployRequired: true };
}

/**
 * Triggers a safe Vercel redeployment of the latest deployment for the requested target environment.
 * Only confirms success if Vercel returns a created deployment ID and state.
 */
export async function triggerVercelRedeploy(target: "production" | "preview" = "production"): Promise<{
  ok: true;
  deploymentId: string;
  url: string;
  state: string;
  target: string;
}> {
  const { projectId } = getVercelCreds();
  const listRes = await vercelFetch<{
    deployments?: Array<{ uid?: string; name?: string; target?: string | null; state?: string }>;
  }>(`/v6/deployments?projectId=${encodeURIComponent(projectId)}&target=${encodeURIComponent(target)}&limit=5`);

  const latest = (listRes.deployments || []).find((d) => d.uid && d.state !== "ERROR");
  if (!latest?.uid) {
    throw new ApiError(
      404,
      "no_source_deployment",
      `No prior ${target} deployment was found in Vercel to clone for redeployment.`
    );
  }

  const created = await vercelFetch<{ id?: string; uid?: string; url?: string; readyState?: string; status?: string }>(
    `/v13/deployments`,
    {
      method: "POST",
      body: JSON.stringify({
        name: latest.name || "nexo-ai",
        deploymentId: latest.uid,
        target
      })
    }
  );

  const deploymentId = String(created.id || created.uid || "");
  if (!deploymentId) {
    throw new ApiError(502, "redeploy_unconfirmed", "Vercel did not return a confirmed deployment ID.");
  }

  await writeLedgerPatch({ redeployPending: false });

  return {
    ok: true,
    deploymentId,
    url: String(created.url || ""),
    state: String(created.readyState || created.status || "BUILDING"),
    target
  };
}
