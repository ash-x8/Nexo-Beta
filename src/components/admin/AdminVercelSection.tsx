"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Cloud,
  Edit3,
  ExternalLink,
  Layers,
  Plus,
  RefreshCw,
  Rocket,
  Search,
  Trash2,
  X
} from "lucide-react";
import { adminApi, ApiClientError } from "@/lib/api";
import type {
  VercelEnvOwnership,
  VercelEnvValueStatus,
  VercelEnvVarItem,
  VercelInventoryResponse
} from "@/lib/types";
import type { ConfirmPromptState } from "./adminTypes";

interface Props {
  token: string;
  onRefreshToken: (force?: boolean) => Promise<string>;
  onRequestReauth: () => Promise<boolean>;
  onToast: (type: "ok" | "err", text: string) => void;
  onConfirm: (prompt: ConfirmPromptState) => void;
}

type VercelTab = "all" | "production" | "preview" | "development" | "custom" | "compare" | "missing";

const PAGE_SIZE = 15;

function valueStatusBadge(status: VercelEnvValueStatus): { label: string; cls: string } {
  switch (status) {
    case "value_available":
      return { label: "Plain Value Readable", cls: "ok" };
    case "secret_masked":
      return { label: "Secret / Masked", cls: "info" };
    case "value_unavailable":
      return { label: "Value Unavailable", cls: "warn" };
    case "sync_failed":
      return { label: "Sync Failed", cls: "err" };
    default:
      return { label: "Not Configured", cls: "muted" };
  }
}

function ownershipBadge(ownership: VercelEnvOwnership): { label: string; cls: string } {
  switch (ownership) {
    case "managed_by_nexo":
      return { label: "Managed by NEXO", cls: "ok" };
    case "created_manually_in_vercel":
      return { label: "Manual in Vercel", cls: "info" };
    case "externally_modified":
      return { label: "Externally Modified", cls: "warn" };
    case "sync_pending":
      return { label: "Sync Pending", cls: "warn" };
    case "sync_failed":
      return { label: "Sync Failed", cls: "err" };
  }
}

export function AdminVercelSection({ token, onRefreshToken, onRequestReauth, onToast, onConfirm }: Props) {
  const [inventory, setInventory] = useState<VercelInventoryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<VercelTab>("all");
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [ownershipFilter, setOwnershipFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [busy, setBusy] = useState(false);

  // Create / Edit modal state
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<VercelEnvVarItem | null>(null);
  const [formKey, setFormKey] = useState("");
  const [formValue, setFormValue] = useState("");
  const [formType, setFormType] = useState<"plain" | "encrypted" | "sensitive">("encrypted");
  const [formTargets, setFormTargets] = useState<Array<"production" | "preview" | "development">>(["production", "preview"]);
  const [formCustomEnvIds, setFormCustomEnvIds] = useState<string[]>([]);
  const [formGitBranch, setFormGitBranch] = useState("");
  const [formComment, setFormComment] = useState("");
  const [confirmProdWrite, setConfirmProdWrite] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const fresh = await onRefreshToken().catch(() => token);
      const data = await adminApi.getVercelEnv(fresh);
      setInventory(data);
    } catch (e) {
      onToast("err", (e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [token, onRefreshToken, onToast]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setPage(1);
  }, [tab, search, typeFilter, ownershipFilter]);

  const withReauthRetry = async <T,>(fn: (tok: string) => Promise<T>): Promise<T | null> => {
    try {
      const tok = await onRefreshToken().catch(() => token);
      return await fn(tok);
    } catch (e) {
      if (e instanceof ApiClientError && e.code === "reauth_required") {
        const ok = await onRequestReauth();
        if (!ok) {
          onToast("err", "Fresh Owner re-authentication is required to modify Vercel environment variables.");
          return null;
        }
        const newTok = await onRefreshToken(true);
        return await fn(newTok);
      }
      throw e;
    }
  };

  const openCreateModal = (presetKey = "") => {
    setEditingItem(null);
    setFormKey(presetKey);
    setFormValue("");
    setFormType("encrypted");
    setFormTargets(["production", "preview"]);
    setFormCustomEnvIds([]);
    setFormGitBranch("");
    setFormComment("");
    setConfirmProdWrite(false);
    setEditorOpen(true);
  };

  const openEditModal = (item: VercelEnvVarItem) => {
    setEditingItem(item);
    setFormKey(item.key);
    setFormValue(item.valueStatus === "value_available" && item.value ? item.value : "");
    setFormType(item.type === "plain" || item.type === "sensitive" ? item.type : "encrypted");
    const stdTargets = item.target.filter(
      (t): t is "production" | "preview" | "development" =>
        t === "production" || t === "preview" || t === "development"
    );
    setFormTargets(stdTargets.length ? stdTargets : ["production"]);
    setFormCustomEnvIds(item.customEnvironmentIds || []);
    setFormGitBranch(item.gitBranch || "");
    setFormComment(item.comment || "");
    setConfirmProdWrite(false);
    setEditorOpen(true);
  };

  const toggleTarget = (t: "production" | "preview" | "development") => {
    setFormTargets((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]));
  };

  const handleSaveEditor = async () => {
    const cleanedKey = formKey.trim().toUpperCase().replace(/[^A-Z0-9_]/g, "");
    if (!cleanedKey) {
      onToast("err", "Environment variable key is required (UPPER_SNAKE_CASE).");
      return;
    }
    if (formTargets.length === 0 && formCustomEnvIds.length === 0) {
      onToast("err", "Select at least one target environment.");
      return;
    }
    if (!editingItem && !formValue) {
      onToast("err", "A value is required when creating a new variable.");
      return;
    }
    const touchesProd = formTargets.includes("production");
    if (editingItem && touchesProd && formValue.trim() && !confirmProdWrite) {
      onToast("err", "Confirm Production overwrite before replacing a Production value.");
      return;
    }

    setBusy(true);
    try {
      const done = await withReauthRetry(async (tok) => {
        if (editingItem) {
          return adminApi.updateVercelEnv(tok, {
            id: editingItem.id,
            key: cleanedKey,
            ...(formValue ? { value: formValue } : {}),
            type: formType,
            target: formTargets,
            ...(formCustomEnvIds.length ? { customEnvironmentIds: formCustomEnvIds } : {}),
            gitBranch: formTargets.includes("preview") ? formGitBranch.trim() || null : null,
            comment: formComment.trim(),
            confirmProduction: touchesProd ? confirmProdWrite || true : undefined
          });
        }
        return adminApi.createVercelEnv(tok, {
          key: cleanedKey,
          value: formValue,
          type: formType,
          target: formTargets,
          ...(formCustomEnvIds.length ? { customEnvironmentIds: formCustomEnvIds } : {}),
          ...(formTargets.includes("preview") && formGitBranch.trim() ? { gitBranch: formGitBranch.trim() } : {}),
          ...(formComment.trim() ? { comment: formComment.trim() } : {})
        });
      });
      if (!done) return;
      setEditorOpen(false);
      await load();
      onToast(
        "ok",
        editingItem
          ? `Updated ${cleanedKey} on Vercel. Trigger Redeploy to activate changes.`
          : `Created ${cleanedKey} on Vercel. Trigger Redeploy to activate changes.`
      );
    } catch (e) {
      onToast("err", (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = (item: VercelEnvVarItem) => {
    const isProd = item.target.includes("production");
    onConfirm({
      title: `Delete Vercel Variable ${item.key}?`,
      body: isProd
        ? `WARNING: "${item.key}" targets PRODUCTION. Deleting it may break live deployments on the next build or cold start. Confirm deletion?`
        : `Delete "${item.key}" (${item.target.join(", ")}) from Vercel?`,
      confirmLabel: isProd ? "Confirm Delete (Production)" : "Delete Variable",
      danger: true,
      onConfirm: async () => {
        setBusy(true);
        try {
          const done = await withReauthRetry((tok) =>
            adminApi.deleteVercelEnv(tok, {
              id: item.id,
              key: item.key,
              isProduction: isProd,
              confirmProduction: isProd
            })
          );
          if (!done) return;
          await load();
          onToast("ok", `Deleted ${item.key} from Vercel.`);
        } catch (e) {
          onToast("err", (e as Error).message);
        } finally {
          setBusy(false);
        }
      }
    });
  };

  const handleRedeploy = (target: "production" | "preview") => {
    onConfirm({
      title: `Trigger Vercel ${target.toUpperCase()} Redeploy?`,
      body: `Starts a fresh ${target} deployment using the latest environment variables stored in Vercel. Existing live traffic continues on the previous build until the new build completes.`,
      confirmLabel: `Redeploy ${target}`,
      danger: target === "production",
      onConfirm: async () => {
        setBusy(true);
        try {
          const res = await withReauthRetry((tok) => adminApi.triggerVercelRedeploy(tok, target));
          if (!res) return;
          await load();
          onToast("ok", `Redeploy triggered (${res.deploymentId}) — state: ${res.state}.`);
        } catch (e) {
          onToast("err", (e as Error).message);
        } finally {
          setBusy(false);
        }
      }
    });
  };

  const filteredEnvs = useMemo(() => {
    const list = inventory?.envs || [];
    const q = search.trim().toLowerCase();
    return list.filter((item) => {
      if (tab === "production" && !item.target.includes("production")) return false;
      if (tab === "preview" && !item.target.includes("preview")) return false;
      if (tab === "development" && !item.target.includes("development")) return false;
      if (tab === "custom" && item.customEnvironmentIds.length === 0) return false;
      if (typeFilter !== "all" && item.type !== typeFilter) return false;
      if (ownershipFilter !== "all" && item.ownership !== ownershipFilter) return false;
      if (q) {
        const hay = `${item.key} ${item.comment || ""} ${item.gitBranch || ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [inventory?.envs, tab, search, typeFilter, ownershipFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredEnvs.length / PAGE_SIZE));
  const pagedEnvs = filteredEnvs.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  if (loading && !inventory) {
    return (
      <div className="nx-admin-card">
        <div className="nx-skeleton-stack">
          <div className="nx-skeleton-bubble assistant short" />
          <div className="nx-skeleton-bubble assistant short" />
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Bootstrap Status & Actions Header */}
      <div className="nx-admin-card">
        <div className="nx-admin-card-head">
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Cloud size={18} color="var(--accent-blue)" />
              <h2>Vercel Environment Variables Manager</h2>
            </div>
            <p className="nx-field-hint">
              Synchronizes directly with Vercel REST API v9/v10/v13. Manages existing manual variables, NEXO keys, environment drift, and controlled redeployments.
            </p>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button type="button" className="nx-secondary-btn" disabled={loading || busy} onClick={() => load()}>
              <RefreshCw size={14} />
              <span>Sync from Vercel</span>
            </button>
            {inventory?.configured && (
              <>
                <button type="button" className="nx-secondary-btn" disabled={busy} onClick={() => handleRedeploy("preview")}>
                  <Rocket size={14} />
                  <span>Redeploy Preview</span>
                </button>
                <button type="button" className="nx-admin-btn-primary" disabled={busy} onClick={() => openCreateModal()}>
                  <Plus size={15} />
                  <span>Add Variable</span>
                </button>
              </>
            )}
          </div>
        </div>

        <div className="nx-kpi-grid">
          <div className="nx-kpi-card">
            <div className="nx-kpi-label"><span>Vercel Project</span></div>
            <div className="nx-kpi-value" style={{ fontSize: 17 }}>
              {inventory?.configured ? inventory.projectName || "Connected" : "Unconfigured"}
            </div>
            <div className="nx-kpi-sub">
              Token: {inventory?.tokenConfigured ? "Set" : "Missing"} · Project ID: {inventory?.projectIdConfigured ? "Set" : "Missing"}
            </div>
          </div>

          <div className="nx-kpi-card">
            <div className="nx-kpi-label"><span>Total Variables</span></div>
            <div className="nx-kpi-value">{inventory?.envs.length ?? 0}</div>
            <div className="nx-kpi-sub">
              {(inventory?.envs || []).filter((e) => e.ownership === "created_manually_in_vercel").length} manual ·{" "}
              {(inventory?.envs || []).filter((e) => e.ownership === "externally_modified").length} externally modified
            </div>
          </div>

          <div className="nx-kpi-card">
            <div className="nx-kpi-label"><span>Missing Expected Keys</span></div>
            <div className="nx-kpi-value">{inventory?.missingExpectedKeys.length ?? 0}</div>
            <div className="nx-kpi-sub">
              {inventory?.customEnvironments.length || 0} custom environment(s)
            </div>
          </div>

          <div className="nx-kpi-card">
            <div className="nx-kpi-label"><span>Deployment Sync</span></div>
            <div className="nx-kpi-value" style={{ fontSize: 17 }}>
              {inventory?.redeployPending ? "Redeploy Pending" : "In Sync"}
            </div>
            <div className="nx-kpi-sub">
              {inventory?.fetchedAt ? `Checked ${new Date(inventory.fetchedAt).toLocaleTimeString()}` : "Not checked"}
            </div>
          </div>
        </div>

        {!inventory?.configured && (
          <div className="nx-banner error" role="alert">
            <div>
              <strong>Vercel Bootstrap Credentials Required:</strong>{" "}
              <span>
                {inventory?.error ||
                  "Set server-only VERCEL_TOKEN and VERCEL_PROJECT_ID (plus optional VERCEL_TEAM_ID) in Vercel Project Settings once to enable live Vercel env & deployment management."}
              </span>
            </div>
          </div>
        )}

        {inventory?.configured && inventory.error && (
          <div className="nx-banner error" role="alert">
            <span>Vercel API Error: {inventory.error}</span>
          </div>
        )}

        {inventory?.configured && inventory.redeployPending && (
          <div className="nx-banner warn" style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <AlertTriangle size={16} />
              <span>
                Environment changes were written to Vercel. Trigger a redeployment for running serverless functions to pick up the updated build environment.
              </span>
            </div>
            <button type="button" className="nx-admin-btn-primary" disabled={busy} onClick={() => handleRedeploy("production")}>
              <Rocket size={14} />
              <span>Redeploy Production</span>
            </button>
          </div>
        )}
      </div>

      {/* Tabs + Filters + Main Table */}
      {inventory?.configured && (
        <div className="nx-admin-card">
          <div className="nx-admin-tabs" role="tablist" aria-label="Vercel Environment Views">
            {(
              [
                ["all", `All (${inventory.envs.length})`],
                ["production", "Production"],
                ["preview", "Preview"],
                ["development", "Development"],
                ["custom", `Custom (${inventory.customEnvironments.length})`],
                ["compare", "Compare Matrix"],
                ["missing", `Missing (${inventory.missingExpectedKeys.length})`]
              ] as Array<[VercelTab, string]>
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={tab === id}
                className={`nx-admin-tab ${tab === id ? "active" : ""}`}
                onClick={() => setTab(id)}
              >
                {label}
              </button>
            ))}
          </div>

          {tab === "compare" ? (
            <div className="nx-table-wrap">
              <table className="nx-table">
                <thead>
                  <tr>
                    <th>Variable Key</th>
                    <th>Production</th>
                    <th>Preview</th>
                    <th>Development</th>
                    <th>Custom</th>
                    <th>Parity Status</th>
                  </tr>
                </thead>
                <tbody>
                  {inventory.comparison.map((row) => (
                    <tr key={row.key}>
                      <td className="mono" style={{ fontWeight: 600 }}>{row.key}</td>
                      <td>{row.production ? <CheckCircle2 size={15} color="var(--status-ok)" /> : <span className="nx-badge muted">Missing</span>}</td>
                      <td>{row.preview ? <CheckCircle2 size={15} color="var(--status-ok)" /> : <span className="nx-badge muted">Missing</span>}</td>
                      <td>{row.development ? <CheckCircle2 size={15} color="var(--status-ok)" /> : <span className="nx-badge muted">Missing</span>}</td>
                      <td className="tabular">{row.customCount}</td>
                      <td>
                        <span className={`nx-badge ${row.consistent ? "ok" : "warn"}`}>
                          {row.consistent ? "Consistent" : `Missing: ${row.missingTargets.join(", ")}`}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : tab === "missing" ? (
            inventory.missingExpectedKeys.length === 0 ? (
              <p className="nx-field-hint">All expected NEXO AI environment keys are present in Vercel.</p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {inventory.missingExpectedKeys.map((key) => (
                  <div key={key} className="nx-field-card">
                    <div className="nx-field-row">
                      <div>
                        <span className="mono" style={{ fontWeight: 600 }}>{key}</span>
                        <p className="nx-field-hint">Expected by NEXO AI runtime or build pipeline, currently absent in Vercel.</p>
                      </div>
                      <button type="button" className="nx-secondary-btn" onClick={() => openCreateModal(key)}>
                        <Plus size={14} />
                        <span>Configure</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )
          ) : (
            <>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                <div className="nx-sidebar-search" style={{ margin: 0, flex: "1 1 240px", minHeight: 40 }}>
                  <Search size={14} color="var(--text-muted)" />
                  <input
                    type="search"
                    placeholder="Search variable key, branch, or note…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>
                <select
                  className="nx-select"
                  style={{ width: 150, minHeight: 40 }}
                  value={typeFilter}
                  onChange={(e) => setTypeFilter(e.target.value)}
                  aria-label="Filter by variable type"
                >
                  <option value="all">All Types</option>
                  <option value="encrypted">Encrypted</option>
                  <option value="sensitive">Sensitive</option>
                  <option value="plain">Plain</option>
                  <option value="secret">Secret</option>
                  <option value="system">System</option>
                </select>
                <select
                  className="nx-select"
                  style={{ width: 190, minHeight: 40 }}
                  value={ownershipFilter}
                  onChange={(e) => setOwnershipFilter(e.target.value)}
                  aria-label="Filter by ownership"
                >
                  <option value="all">All Origins</option>
                  <option value="managed_by_nexo">Managed by NEXO</option>
                  <option value="created_manually_in_vercel">Created Manually in Vercel</option>
                  <option value="externally_modified">Externally Modified</option>
                  <option value="sync_failed">Sync Failed</option>
                </select>
              </div>

              {pagedEnvs.length === 0 ? (
                <p className="nx-field-hint">No Vercel environment variables matched the current filter.</p>
              ) : (
                <div className="nx-table-wrap">
                  <table className="nx-table">
                    <thead>
                      <tr>
                        <th>Key</th>
                        <th>Value / Readability</th>
                        <th>Type</th>
                        <th>Targets</th>
                        <th>Origin / Sync</th>
                        <th>Updated</th>
                        <th style={{ textAlign: "right" }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pagedEnvs.map((item) => {
                        const vs = valueStatusBadge(item.valueStatus);
                        const ob = ownershipBadge(item.ownership);
                        return (
                          <tr key={item.id}>
                            <td>
                              <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                                <span className="mono" style={{ fontWeight: 600 }}>{item.key}</span>
                                {item.gitBranch && (
                                  <span className="nx-field-hint mono">branch: {item.gitBranch}</span>
                                )}
                                {item.comment && <span className="nx-field-hint">{item.comment}</span>}
                              </div>
                            </td>
                            <td>
                              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                                <span className="mono" style={{ fontSize: 12, color: item.valueStatus === "value_available" ? "var(--text-primary)" : "var(--text-muted)" }}>
                                  {item.maskedDisplay}
                                </span>
                                <span className={`nx-badge ${vs.cls}`}>{vs.label}</span>
                              </div>
                            </td>
                            <td className="mono">{item.type}</td>
                            <td>
                              <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                                {item.target.map((t) => (
                                  <span key={t} className={`nx-badge ${t === "production" ? "warn" : "muted"}`}>
                                    {t}
                                  </span>
                                ))}
                                {item.customEnvironmentIds.length > 0 && (
                                  <span className="nx-badge info">
                                    <Layers size={11} /> +{item.customEnvironmentIds.length} custom
                                  </span>
                                )}
                              </div>
                            </td>
                            <td>
                              <span className={`nx-badge ${ob.cls}`}>{ob.label}</span>
                            </td>
                            <td className="tabular">
                              {item.updatedAt ? new Date(item.updatedAt).toLocaleDateString() : "—"}
                            </td>
                            <td>
                              <div style={{ display: "flex", justifyContent: "flex-end", gap: 6 }}>
                                <button
                                  type="button"
                                  className="nx-tiny-btn"
                                  onClick={() => openEditModal(item)}
                                  aria-label={`Edit ${item.key}`}
                                  title="Edit metadata or replace secret value"
                                >
                                  <Edit3 size={14} />
                                </button>
                                <button
                                  type="button"
                                  className="nx-tiny-btn danger"
                                  onClick={() => handleDelete(item)}
                                  aria-label={`Delete ${item.key}`}
                                  title="Delete variable"
                                >
                                  <Trash2 size={14} />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {totalPages > 1 && (
                <div className="nx-admin-actions-bar">
                  <span className="nx-field-hint tabular">
                    Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, filteredEnvs.length)} of {filteredEnvs.length}
                  </span>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button
                      type="button"
                      className="nx-secondary-btn"
                      disabled={page <= 1}
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                    >
                      Previous
                    </button>
                    <button
                      type="button"
                      className="nx-secondary-btn"
                      disabled={page >= totalPages}
                      onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    >
                      Next
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Recent Deployments */}
      {inventory?.configured && inventory.deployments.length > 0 && (
        <div className="nx-admin-card">
          <div className="nx-admin-card-head">
            <h3>Recent Vercel Deployments</h3>
            <button type="button" className="nx-secondary-btn" disabled={busy} onClick={() => handleRedeploy("production")}>
              <Rocket size={14} />
              <span>Redeploy Production</span>
            </button>
          </div>
          <div className="nx-table-wrap">
            <table className="nx-table">
              <thead>
                <tr>
                  <th>Deployment</th>
                  <th>Target</th>
                  <th>State</th>
                  <th>Created</th>
                </tr>
              </thead>
              <tbody>
                {inventory.deployments.map((dep) => (
                  <tr key={dep.uid}>
                    <td>
                      {dep.url ? (
                        <a
                          href={`https://${dep.url}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mono"
                          style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
                        >
                          <span>{dep.url}</span>
                          <ExternalLink size={12} />
                        </a>
                      ) : (
                        <span className="mono">{dep.uid}</span>
                      )}
                    </td>
                    <td className="mono">{dep.target || "preview"}</td>
                    <td>
                      <span
                        className={`nx-badge ${
                          dep.state === "READY"
                            ? "ok"
                            : dep.state === "ERROR" || dep.state === "CANCELED"
                              ? "err"
                              : "warn"
                        }`}
                      >
                        {dep.state}
                      </span>
                    </td>
                    <td className="tabular">{dep.createdAt ? new Date(dep.createdAt).toLocaleString() : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Create / Edit Modal */}
      {editorOpen && (
        <div
          className="nx-modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label={editingItem ? `Edit ${editingItem.key}` : "Create Vercel Environment Variable"}
          onClick={() => !busy && setEditorOpen(false)}
        >
          <div className="nx-confirm-modal" style={{ maxWidth: 560 }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
              <h3>{editingItem ? `Edit Variable · ${editingItem.key}` : "Add Vercel Environment Variable"}</h3>
              <button type="button" className="nx-tiny-btn" disabled={busy} onClick={() => setEditorOpen(false)} aria-label="Close">
                <X size={16} />
              </button>
            </div>

            <div className="nx-admin-form-grid">
              <div className="nx-admin-field">
                <label htmlFor="vc-key">Variable Key (UPPER_SNAKE_CASE)</label>
                <input
                  id="vc-key"
                  className="nx-input mono"
                  value={formKey}
                  onChange={(e) => setFormKey(e.target.value.toUpperCase())}
                  placeholder="GEMINI_API_KEY"
                />
              </div>

              <div className="nx-admin-field">
                <label htmlFor="vc-type">Storage Security Type</label>
                <select
                  id="vc-type"
                  className="nx-select"
                  value={formType}
                  onChange={(e) => setFormType(e.target.value as "plain" | "encrypted" | "sensitive")}
                >
                  <option value="encrypted">Encrypted (Default for API Keys)</option>
                  <option value="sensitive">Sensitive (Write-only, masked)</option>
                  <option value="plain">Plain (Readable non-secret config)</option>
                </select>
              </div>
            </div>

            <div className="nx-admin-field">
              <label htmlFor="vc-value">
                {editingItem
                  ? editingItem.valueStatus === "secret_masked" || editingItem.valueStatus === "value_unavailable"
                    ? "Replace Secret Value (leave empty to keep existing Vercel secret untouched)"
                    : "Variable Value"
                  : "Variable Value"}
              </label>
              <input
                id="vc-value"
                type={formType === "plain" ? "text" : "password"}
                className="nx-input mono"
                autoComplete="new-password"
                value={formValue}
                onChange={(e) => setFormValue(e.target.value)}
                placeholder={editingItem ? "Leave blank to preserve current secret value…" : "Enter value…"}
              />
            </div>

            <div className="nx-admin-field">
              <label>Target Environments</label>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {(["production", "preview", "development"] as const).map((t) => {
                  const active = formTargets.includes(t);
                  return (
                    <button
                      key={t}
                      type="button"
                      className={active ? "nx-admin-btn-primary" : "nx-secondary-btn"}
                      style={{ minHeight: 34, padding: "4px 12px" }}
                      onClick={() => toggleTarget(t)}
                    >
                      <span>{t}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {inventory && inventory.customEnvironments.length > 0 && (
              <div className="nx-admin-field">
                <label>Custom Vercel Environments</label>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {inventory.customEnvironments.map((ce) => {
                    const active = formCustomEnvIds.includes(ce.id);
                    return (
                      <button
                        key={ce.id}
                        type="button"
                        className={active ? "nx-admin-btn-primary" : "nx-secondary-btn"}
                        style={{ minHeight: 34, padding: "4px 12px" }}
                        onClick={() =>
                          setFormCustomEnvIds((prev) =>
                            prev.includes(ce.id) ? prev.filter((x) => x !== ce.id) : [...prev, ce.id]
                          )
                        }
                      >
                        <span>{ce.name || ce.slug}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="nx-admin-form-grid">
              {formTargets.includes("preview") && (
                <div className="nx-admin-field">
                  <label htmlFor="vc-branch">Git Branch Scope (Preview only, optional)</label>
                  <input
                    id="vc-branch"
                    className="nx-input mono"
                    value={formGitBranch}
                    onChange={(e) => setFormGitBranch(e.target.value)}
                    placeholder="e.g. staging"
                  />
                </div>
              )}

              <div className="nx-admin-field">
                <label htmlFor="vc-comment">Note / Comment (optional)</label>
                <input
                  id="vc-comment"
                  className="nx-input"
                  maxLength={240}
                  value={formComment}
                  onChange={(e) => setFormComment(e.target.value)}
                  placeholder="Purpose or rotation reminder…"
                />
              </div>
            </div>

            {editingItem && formTargets.includes("production") && formValue.trim().length > 0 && (
              <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--status-warn)" }}>
                <input
                  type="checkbox"
                  checked={confirmProdWrite}
                  onChange={(e) => setConfirmProdWrite(e.target.checked)}
                />
                <span>I confirm overwriting the live Production value for {editingItem.key}.</span>
              </label>
            )}

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
              <button type="button" className="nx-secondary-btn" disabled={busy} onClick={() => setEditorOpen(false)}>
                Cancel
              </button>
              <button type="button" className="nx-admin-btn-primary" disabled={busy} onClick={handleSaveEditor}>
                <span>{busy ? "Saving…" : editingItem ? "Save Update" : "Create Variable"}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
