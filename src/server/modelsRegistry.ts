import type { ModelCatalogItem, ModelStatus } from "@/lib/types";

interface KnownModelSpec {
  name: string;
  provider: "gemini" | "openai-compatible";
  freeEligible: boolean;
  contextWindow: number | null;
  vision: boolean;
  pdf: boolean;
  limitNote: string;
}

/**
 * Curated specs for verified free-tier and paid models so the selector and fallback
 * engine never promote a paid-only model into free automatic fallback.
 */
const KNOWN_MODELS: Record<string, KnownModelSpec> = {
  "gemini-2.5-flash": {
    name: "Gemini 2.5 Flash",
    provider: "gemini",
    freeEligible: true,
    contextWindow: 1048576,
    vision: true,
    pdf: true,
    limitNote: "Verified Google Gemini free-tier eligible model (dynamic provider RPM/RPD)"
  },
  "gemini-2.5-flash-lite": {
    name: "Gemini 2.5 Flash-Lite",
    provider: "gemini",
    freeEligible: true,
    contextWindow: 1048576,
    vision: true,
    pdf: true,
    limitNote: "Verified Google Gemini free-tier lightweight model (dynamic provider RPM/RPD)"
  },
  "gemini-4-hydrogen": {
    name: "Gemini 4 Hydrogen",
    provider: "gemini",
    freeEligible: true,
    contextWindow: 1048576,
    vision: true,
    pdf: true,
    limitNote: "Verified free-tier fast general model"
  },
  "gemini-3.1-flash-lite": {
    name: "Gemini 3.1 Flash-Lite",
    provider: "gemini",
    freeEligible: true,
    contextWindow: 1048576,
    vision: true,
    pdf: true,
    limitNote: "Free-tier lightweight flash model"
  },
  "gemini-2.5-pro": {
    name: "Gemini 2.5 Pro",
    provider: "gemini",
    freeEligible: false,
    contextWindow: 1048576,
    vision: true,
    pdf: true,
    limitNote: "Restricted/paid tier model — excluded from automatic free fallback"
  },
  "gemini-4-argon": {
    name: "Gemini 4 Argon",
    provider: "gemini",
    freeEligible: false,
    contextWindow: 1048576,
    vision: true,
    pdf: true,
    limitNote: "Paid reasoning tier — excluded from automatic free fallback"
  },
  "gemini-4-carbon": {
    name: "Gemini 4 Carbon",
    provider: "gemini",
    freeEligible: false,
    contextWindow: 1048576,
    vision: true,
    pdf: true,
    limitNote: "Paid frontier tier — excluded from automatic free fallback"
  }
};

/** Preferred free fallback order when primary model hits quota/rate limits. */
export const GEMINI_FREE_FALLBACK_ORDER = [
  "gemini-2.5-flash",
  "gemini-2.5-flash-lite",
  "gemini-4-hydrogen",
  "gemini-3.1-flash-lite"
];

const PROHIBITED_OR_NON_CHAT = /(?:^models\/)?(?:gemini-1\.5|gemini-2\.0|gemini-pro$|.*(?:tts|embed|imagen|veo|live|audio|robotics|aqa))/i;
const PAID_MODEL_PATTERNS = /(?:^models\/)?(?:gemini-2\.5-pro|gemini-3(?:\.\d+)?-pro|gemini-4-(?:argon|carbon|ultra)|gpt-4|gpt-5|o1|o3|o4|claude-)/i;

interface RuntimeHealthEntry {
  status: ModelStatus;
  until: number;
}

const runtimeHealth = new Map<string, RuntimeHealthEntry>();

export function _resetModelRegistryForTest(): void {
  runtimeHealth.clear();
}

export function markModelHealth(modelId: string, status: ModelStatus, cooldownMs = 90_000): void {
  if (!modelId) return;
  if (status === "available") {
    runtimeHealth.delete(modelId);
    return;
  }
  runtimeHealth.set(modelId, { status, until: Date.now() + cooldownMs });
}

export function getModelHealth(modelId: string, now = Date.now()): ModelStatus {
  const entry = runtimeHealth.get(modelId);
  if (!entry) return "available";
  if (now >= entry.until) {
    runtimeHealth.delete(modelId);
    return "available";
  }
  return entry.status;
}

export function getOverallProviderHealth(models: string[], defaultModel: string): "healthy" | "degraded" | "unconfigured" {
  if (!defaultModel && models.length === 0) return "unconfigured";
  const checkList = models.length > 0 ? models : [defaultModel];
  const primaryStatus = getModelHealth(defaultModel || checkList[0]);
  if (primaryStatus === "available") return "healthy";
  return "degraded";
}

export function isFreeEligibleModel(modelId: string, providerId: string, defaultModel = ""): boolean {
  const id = modelId.trim();
  if (!id || PROHIBITED_OR_NON_CHAT.test(id)) return false;

  const known = KNOWN_MODELS[id];
  if (known) return known.freeEligible;

  if (PAID_MODEL_PATTERNS.test(id) && !id.endsWith(":free")) return false;

  if (providerId === "gemini") {
    // Allow explicit Gemini Flash / Flash-Lite variants on free tier; never allow Pro/Ultra/Carbon/Argon
    return /flash|hydrogen|gemma/i.test(id) && !/pro|ultra|argon|carbon|paid/i.test(id);
  }

  // OpenAI-compatible (e.g. OpenRouter `:free` models or local/self-hosted default model)
  if (id.endsWith(":free")) return true;
  if (defaultModel && id === defaultModel && !PAID_MODEL_PATTERNS.test(id)) return true;
  return false;
}

function formatModelDisplayName(id: string): string {
  const known = KNOWN_MODELS[id];
  if (known) return known.name;
  return id
    .replace(/:free$/i, " (Free)")
    .replace(/\b\w/g, (ch) => ch.toUpperCase());
}

export function classifyModel(
  id: string,
  providerId: string,
  defaultModel: string,
  searchEnabled: boolean
): ModelCatalogItem {
  const known = KNOWN_MODELS[id];
  const freeEligible = isFreeEligibleModel(id, providerId, defaultModel);
  const status = getModelHealth(id);

  return {
    id,
    name: formatModelDisplayName(id),
    provider: providerId,
    freeEligible,
    status,
    isDefault: id === defaultModel,
    capabilities: {
      streaming: true,
      vision: known ? known.vision : providerId === "gemini" || /vision|vl|4o|gemini/i.test(id),
      pdf: known ? known.pdf : providerId === "gemini",
      webSearch: searchEnabled
    },
    contextWindow: known ? known.contextWindow : null,
    limitNote: known
      ? known.limitNote
      : freeEligible
        ? "Provider free tier (exact rate limit governed dynamically by upstream provider)"
        : "Not verified as free-tier eligible"
  };
}

export function buildModelCatalog(
  providerId: string,
  reportedIds: string[],
  defaultModel: string,
  searchEnabled: boolean,
  freeOnly: boolean
): ModelCatalogItem[] {
  const seen = new Set<string>();
  const combined: string[] = [];

  const pushUnique = (id: string) => {
    const clean = id.trim();
    if (!clean || PROHIBITED_OR_NON_CHAT.test(clean) || seen.has(clean)) return;
    seen.add(clean);
    combined.push(clean);
  };

  if (defaultModel) pushUnique(defaultModel);
  for (const id of reportedIds) pushUnique(id);

  if (providerId === "gemini") {
    for (const id of GEMINI_FREE_FALLBACK_ORDER) {
      if (seen.has(id) || reportedIds.length === 0) pushUnique(id);
    }
  }

  const items = combined.map((id) => classifyModel(id, providerId, defaultModel, searchEnabled));
  const filtered = freeOnly ? items.filter((m) => m.freeEligible) : items;

  return filtered.sort((a, b) => {
    if (a.isDefault !== b.isDefault) return a.isDefault ? -1 : 1;
    if (a.freeEligible !== b.freeEligible) return a.freeEligible ? -1 : 1;
    return a.id.localeCompare(b.id);
  });
}

/**
 * Returns strictly verified free-eligible fallback model candidates for automatic
 * recovery when `primaryModel` encounters quota, rate-limit, or temporary unavailability.
 * NEVER returns a paid model.
 */
export function getFreeFallbackCandidates(
  providerId: string,
  primaryModel: string,
  reportedIds: string[],
  defaultModel: string
): string[] {
  const pool = new Set<string>();
  if (defaultModel && isFreeEligibleModel(defaultModel, providerId, defaultModel)) {
    pool.add(defaultModel);
  }
  for (const id of reportedIds) {
    if (isFreeEligibleModel(id, providerId, defaultModel)) {
      pool.add(id);
    }
  }
  if (providerId === "gemini") {
    for (const id of GEMINI_FREE_FALLBACK_ORDER) {
      if (reportedIds.length === 0 || reportedIds.includes(id)) {
        pool.add(id);
      }
    }
  }

  pool.delete(primaryModel);

  const list = Array.from(pool).filter((id) => isFreeEligibleModel(id, providerId, defaultModel));
  return list.sort((a, b) => {
    const aAvail = getModelHealth(a) === "available" ? 0 : 1;
    const bAvail = getModelHealth(b) === "available" ? 0 : 1;
    if (aAvail !== bAvail) return aAvail - bAvail;
    const aIdx = GEMINI_FREE_FALLBACK_ORDER.indexOf(a);
    const bIdx = GEMINI_FREE_FALLBACK_ORDER.indexOf(b);
    if (aIdx !== -1 && bIdx !== -1) return aIdx - bIdx;
    if (aIdx !== -1) return -1;
    if (bIdx !== -1) return 1;
    return a.localeCompare(b);
  });
}
