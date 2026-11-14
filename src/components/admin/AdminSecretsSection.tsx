"use client";
import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  CloudUpload,
  KeyRound,
  Lock,
  Plus,
  RefreshCw,
  RotateCw,
  ShieldCheck,
  Trash2,
  X
} from "lucide-react";
import { adminApi, ApiClientError } from "@/lib/api";
import type { GlobalConfig, RuntimeSecretMeta } from "@/lib/types";
import type { ConfirmPromptState } from "./adminTypes";

interface Props {
  token: string;
  resolutionMode: GlobalConfig["secretResolutionMode"];
  onRefreshToken: (force?: boolean) => Promise<string>;
  onRequestReauth: () => Promise<boolean>;
  onRefreshOverview: () => Promise<void>;
  onToast: (type: "ok" | "err", text: string) => void;
  onConfirm: (prompt: ConfirmPromptState) => void;
}

const PROVIDER_ENV_SUGGESTIONS: Record<RuntimeSecretMeta["provider"], string> = {
  gemini: "GEMINI_API_KEY",
  gemini_tts: "GEMINI_TTS_API_KEY",
  openai: "OPENAI_API_KEY",
  openrouter: "OPENROUTER_API_KEY",
  openai_compatible: "OPENAI_COMPAT_API_KEY",
  tavily: "TAVILY_API_KEY",
  custom: "CUSTOM_API_KEY"
};

export function AdminSecretsSection({
  token,
  resolutionMode,
  onRefreshToken,
  onRequestReauth,
  onRefreshOverview,
  onToast,
  onConfirm
}: Props) {
  const [loading, setLoading] = useState(true);
  const [encryptionConfigured, setEncryptionConfigured] = useState(false);
  const [vercelConfigured, setVercelConfigured] = useState(false);
  const [items, setItems] = useState<RuntimeSecretMeta[]>([]);
  const [busy, setBusy] = useState(false);

  // Add / Rotate modal
  const [modalOpen, setModalOpen] = useState(false);
  const [rotatingItem, setRotatingItem] = useState<RuntimeSecretMeta | null>(null);
  const [name, setName] = useState("");
  const [provider, setProvider] = useState<RuntimeSecretMeta["provider"]>("gemini");
  const [envKey, setEnvKey] = useState("GEMINI_API_KEY");
  const [secretValue, setSecretValue] = useState("");
  const [environment, setEnvironment] = useState<RuntimeSecretMeta["environment"]>("all");
  const [description, setDescription] = useState("");
  const [active, setActive] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const fresh = await onRefreshToken().catch(() => token);
      const data = await adminApi.getSecrets(fresh);
      setEncryptionConfigured(data.encryptionConfigured);
      setVercelConfigured(data.vercelConfigured);
      setItems(data.items);
    } catch (e) {
      onToast("err", (e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [token, onRefreshToken, onToast]);

  useEffect(() => {
    void load();
  }, [load]);

  const withReauthRetry = async <T,>(fn: (tok: string) => Promise<T>): Promise<T | null> => {
    try {
      const tok = await onRefreshToken().catch(() => token);
      return await fn(tok);
    } catch (e) {
      if (e instanceof ApiClientError && e.code === "reauth_required") {
        const ok = await onRequestReauth();
        if (!ok) {
          onToast("err", "Fresh Owner re-authentication is required for encrypted secret changes.");
          return null;
        }
        const newTok = await onRefreshToken(true);
        return await fn(newTok);
      }
      throw e;
    }
  };

  const openCreate = () => {
    setRotatingItem(null);
    setName("");
    setProvider("gemini");
    setEnvKey("GEMINI_API_KEY");
    setSecretValue("");
    setEnvironment("all");
    setDescription("");
    setActive(true);
    setModalOpen(true);
  };

  const openRotate = (item: RuntimeSecretMeta) => {
    setRotatingItem(item);
    setName(item.name);
    setProvider(item.provider);
    setEnvKey(item.envKey);
    setSecretValue("");
    setEnvironment(item.environment);
    setDescription(item.description);
    setActive(item.active);
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!name.trim()) {
      onToast("err", "Secret label is required.");
      return;
    }
    if (!rotatingItem && !secretValue.trim()) {
      onToast("err", "Secret value is required when adding a new encrypted credential.");
      return;
    }

    setBusy(true);
    try {
      const res = await withReauthRetry((tok) =>
        adminApi.saveSecret(tok, {
          ...(rotatingItem ? { id: rotatingItem.id } : {}),
          name: name.trim(),
          envKey: envKey.trim().toUpperCase(),
          provider,
          ...(secretValue.trim() ? { value: secretValue.trim() } : {}),
          description: description.trim(),
          environment,
          active
        })
      );
      if (!res) return;
      setSecretValue("");
      setModalOpen(false);
      await Promise.all([load(), onRefreshOverview()]);
      onToast("ok", rotatingItem ? `Rotated ${res.item.envKey} (AES-256-GCM).` : `Encrypted & activated ${res.item.envKey}.`);
    } catch (e) {
      onToast("err", (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const handleToggle = async (item: RuntimeSecretMeta) => {
    setBusy(true);
    try {
      const res = await withReauthRetry((tok) => adminApi.toggleSecret(tok, item.id, !item.active));
      if (!res) return;
      await Promise.all([load(), onRefreshOverview()]);
      onToast("ok", `${item.envKey} ${!item.active ? "activated" : "deactivated"} in runtime overlay.`);
    } catch (e) {
      onToast("err", (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const handleSyncToVercel = (item: RuntimeSecretMeta) => {
    onConfirm({
      title: `Push ${item.envKey} to Vercel?`,
      body: `Decrypts "${item.name}" strictly inside server memory and writes it as an encrypted variable in Vercel (${item.environment === "all" ? "production, preview" : item.environment}). A Vercel redeploy is required for build-time visibility.`,
      confirmLabel: "Push to Vercel",
      onConfirm: async () => {
        setBusy(true);
        try {
          const res = await withReauthRetry((tok) => adminApi.syncSecretToVercel(tok, item.id));
          if (!res) return;
          await load();
          onToast("ok", `Synced ${res.envKey} to Vercel (${res.targets.join(", ")}). Redeploy to finalize.`);
        } catch (e) {
          onToast("err", (e as Error).message);
        } finally {
          setBusy(false);
        }
      }
    });
  };

  const handleDelete = (item: RuntimeSecretMeta) => {
    onConfirm({
      title: `Delete Encrypted Secret "${item.name}"?`,
      body: `Removes encrypted runtime credential ${item.envKey} from Firestore. Active server memory overlay is cleared immediately.`,
      confirmLabel: "Delete Secret",
      danger: true,
      onConfirm: async () => {
        setBusy(true);
        try {
          const res = await withReauthRetry((tok) => adminApi.deleteSecret(tok, item.id));
          if (!res) return;
          await Promise.all([load(), onRefreshOverview()]);
          onToast("ok", `Deleted runtime secret ${item.envKey}.`);
        } catch (e) {
          onToast("err", (e as Error).message);
        } finally {
          setBusy(false);
        }
      }
    });
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div className="nx-admin-card">
        <div className="nx-admin-card-head">
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <KeyRound size={18} color="var(--accent-blue)" />
              <h2>API & Encrypted Runtime Secret Manager</h2>
            </div>
            <p className="nx-field-hint">
              AES-256-GCM encrypted API keys take effect dynamically in server runtime memory without redeploying. Stored values are write-only and never returned to the browser.
            </p>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button type="button" className="nx-secondary-btn" disabled={loading || busy} onClick={() => load()}>
              <RefreshCw size={14} />
              <span>Refresh</span>
            </button>
            <button
              type="button"
              className="nx-admin-btn-primary"
              disabled={busy || !encryptionConfigured}
              onClick={openCreate}
            >
              <Plus size={15} />
              <span>Add Runtime Secret</span>
            </button>
          </div>
        </div>

        <div className="nx-admin-grid-2">
          <div className="nx-field-card">
            <div className="nx-field-row">
              <div>
                <span className="nx-field-label">AES-256-GCM Master Encryption Key</span>
                <p className="nx-field-hint">
                  {encryptionConfigured
                    ? "NEXO_MASTER_SECRET_KEY verified on server. All secrets encrypted before Firestore storage."
                    : "NEXO_MASTER_SECRET_KEY is missing or <32 chars. Plaintext fallback is permanently blocked."}
                </p>
              </div>
              <span className={`nx-badge ${encryptionConfigured ? "ok" : "err"}`}>
                <ShieldCheck size={12} /> {encryptionConfigured ? "Configured" : "Required"}
              </span>
            </div>
          </div>

          <div className="nx-field-card">
            <div className="nx-field-row">
              <div>
                <span className="nx-field-label">Precedence Policy</span>
                <p className="nx-field-hint">
                  {resolutionMode === "env_first"
                    ? "Environment Variables First — Vercel/process env wins when both exist."
                    : "Runtime Secrets First — Encrypted Firestore secrets override process env dynamically."}
                </p>
              </div>
              <span className="nx-badge info">{resolutionMode || "runtime_first"}</span>
            </div>
          </div>
        </div>

        {!encryptionConfigured && (
          <div className="nx-banner error" role="alert">
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <AlertTriangle size={16} />
              <span>
                Encryption key missing: Set a 32+ character <code>NEXO_MASTER_SECRET_KEY</code> in your server or Vercel Environment Variables before saving runtime secrets.
              </span>
            </div>
          </div>
        )}
      </div>

      <div className="nx-admin-card">
        <div className="nx-admin-card-head">
          <h3>Stored Encrypted Secrets</h3>
          <span className="nx-kpi-sub tabular">{items.length} credential(s)</span>
        </div>

        {loading ? (
          <div className="nx-skeleton-bubble assistant short" />
        ) : items.length === 0 ? (
          <p className="nx-field-hint">
            No encrypted runtime secrets stored yet. Active Vercel / server environment variables remain in use.
          </p>
        ) : (
          <div className="nx-table-wrap">
            <table className="nx-table">
              <thead>
                <tr>
                  <th>Name / Env Key</th>
                  <th>Provider</th>
                  <th>Masked & Fingerprint</th>
                  <th>Scope</th>
                  <th>Vercel Sync</th>
                  <th>Active</th>
                  <th style={{ textAlign: "right" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                        <strong>{item.name}</strong>
                        <span className="nx-field-hint mono">{item.envKey}</span>
                        {item.description && <span className="nx-field-hint">{item.description}</span>}
                      </div>
                    </td>
                    <td className="mono">{item.provider}</td>
                    <td>
                      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                        <span className="mono" style={{ fontSize: 12 }}>
                          <Lock size={11} style={{ verticalAlign: "middle", marginRight: 4 }} />
                          {item.maskedValue}
                        </span>
                        <span className="nx-field-hint mono">sha256:{item.fingerprint}</span>
                      </div>
                    </td>
                    <td>
                      <span className="nx-badge muted">{item.environment}</span>
                    </td>
                    <td>
                      <span
                        className={`nx-badge ${
                          item.vercelSyncStatus === "synced"
                            ? "ok"
                            : item.vercelSyncStatus === "sync_failed"
                              ? "err"
                              : "muted"
                        }`}
                        title={item.vercelSyncError || undefined}
                      >
                        {item.vercelSyncStatus}
                      </span>
                    </td>
                    <td>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={item.active}
                        className={`nx-switch ${item.active ? "on" : ""}`}
                        disabled={busy}
                        onClick={() => handleToggle(item)}
                        aria-label={`Toggle ${item.name}`}
                      >
                        <span />
                      </button>
                    </td>
                    <td>
                      <div style={{ display: "flex", justifyContent: "flex-end", gap: 6 }}>
                        <button
                          type="button"
                          className="nx-tiny-btn"
                          disabled={busy}
                          onClick={() => openRotate(item)}
                          title="Rotate secret value or metadata"
                          aria-label={`Rotate ${item.name}`}
                        >
                          <RotateCw size={14} />
                        </button>
                        {vercelConfigured && (
                          <button
                            type="button"
                            className="nx-tiny-btn"
                            disabled={busy}
                            onClick={() => handleSyncToVercel(item)}
                            title="One-way encrypted push to Vercel Environment Variables"
                            aria-label={`Push ${item.name} to Vercel`}
                          >
                            <CloudUpload size={14} />
                          </button>
                        )}
                        <button
                          type="button"
                          className="nx-tiny-btn danger"
                          disabled={busy}
                          onClick={() => handleDelete(item)}
                          title="Delete runtime secret"
                          aria-label={`Delete ${item.name}`}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {modalOpen && (
        <div
          className="nx-modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label={rotatingItem ? `Rotate ${rotatingItem.name}` : "Add Encrypted Runtime Secret"}
          onClick={() => !busy && setModalOpen(false)}
        >
          <div className="nx-confirm-modal" style={{ maxWidth: 540 }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <h3>{rotatingItem ? `Rotate Secret · ${rotatingItem.envKey}` : "Add Encrypted Runtime Secret"}</h3>
              <button type="button" className="nx-tiny-btn" disabled={busy} onClick={() => setModalOpen(false)} aria-label="Close">
                <X size={16} />
              </button>
            </div>

            <div className="nx-admin-form-grid">
              <div className="nx-admin-field">
                <label htmlFor="sec-name">Display Name</label>
                <input
                  id="sec-name"
                  className="nx-input"
                  maxLength={80}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Primary Gemini API Key"
                />
              </div>

              <div className="nx-admin-field">
                <label htmlFor="sec-prov">Service Provider</label>
                <select
                  id="sec-prov"
                  className="nx-select"
                  value={provider}
                  onChange={(e) => {
                    const next = e.target.value as RuntimeSecretMeta["provider"];
                    setProvider(next);
                    if (!rotatingItem) setEnvKey(PROVIDER_ENV_SUGGESTIONS[next]);
                  }}
                >
                  <option value="gemini">Google Gemini (GEMINI_API_KEY)</option>
                  <option value="gemini_tts">Gemini Dedicated TTS (GEMINI_TTS_API_KEY)</option>
                  <option value="openai">OpenAI (OPENAI_API_KEY)</option>
                  <option value="openrouter">OpenRouter (OPENROUTER_API_KEY)</option>
                  <option value="openai_compatible">OpenAI-Compatible (OPENAI_COMPAT_API_KEY)</option>
                  <option value="tavily">Tavily Search (TAVILY_API_KEY)</option>
                  <option value="custom">Custom Environment Key</option>
                </select>
              </div>
            </div>

            <div className="nx-admin-form-grid">
              <div className="nx-admin-field">
                <label htmlFor="sec-envkey">Target Environment Key</label>
                <input
                  id="sec-envkey"
                  className="nx-input mono"
                  value={envKey}
                  onChange={(e) => setEnvKey(e.target.value.toUpperCase())}
                />
              </div>

              <div className="nx-admin-field">
                <label htmlFor="sec-env">Target Environment Scope</label>
                <select
                  id="sec-env"
                  className="nx-select"
                  value={environment}
                  onChange={(e) => setEnvironment(e.target.value as RuntimeSecretMeta["environment"])}
                >
                  <option value="all">All Environments</option>
                  <option value="production">Production Only</option>
                  <option value="preview">Preview Only</option>
                  <option value="development">Development Only</option>
                </select>
              </div>
            </div>

            <div className="nx-admin-field">
              <label htmlFor="sec-val">
                {rotatingItem ? "New Secret Value (leave blank to update metadata only)" : "Secret Value (encrypted with AES-256-GCM)"}
              </label>
              <input
                id="sec-val"
                type="password"
                autoComplete="new-password"
                className="nx-input mono"
                value={secretValue}
                onChange={(e) => setSecretValue(e.target.value)}
                placeholder={rotatingItem ? "Paste new rotated API key…" : "Paste API key or token…"}
              />
            </div>

            <div className="nx-admin-field">
              <label htmlFor="sec-desc">Note (optional, non-sensitive)</label>
              <input
                id="sec-desc"
                className="nx-input"
                maxLength={240}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Account tier or rotation schedule…"
              />
            </div>

            <div className="nx-field-card">
              <div className="nx-field-row">
                <div>
                  <span className="nx-field-label">Active in Runtime Memory Overlay</span>
                  <p className="nx-field-hint">Immediately activates this key for server AI/voice/search requests.</p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={active}
                  className={`nx-switch ${active ? "on" : ""}`}
                  onClick={() => setActive((v) => !v)}
                >
                  <span />
                </button>
              </div>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
              <button type="button" className="nx-secondary-btn" disabled={busy} onClick={() => setModalOpen(false)}>
                Cancel
              </button>
              <button type="button" className="nx-admin-btn-primary" disabled={busy} onClick={handleSave}>
                <span>{busy ? "Encrypting…" : rotatingItem ? "Save & Rotate" : "Encrypt & Save"}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
