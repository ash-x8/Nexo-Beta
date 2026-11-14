"use client";
import { useCallback, useEffect, useState } from "react";
import {
  Activity,
  Database,
  ExternalLink,
  Megaphone,
  Plus,
  RefreshCw,
  Shield,
  Trash2
} from "lucide-react";
import { adminApi } from "@/lib/api";
import type { AnnouncementItem } from "@/lib/types";
import { DailyBarChart } from "./AdminChartsAndConfirm";
import type {
  AdminAuditRow,
  AdminOverviewResponse,
  ConfirmPromptState,
  SecurityPostureResponse
} from "./adminTypes";

interface OpsProps {
  overview: AdminOverviewResponse;
  token: string;
  onRefresh: () => Promise<void>;
  onToast: (type: "ok" | "err", text: string) => void;
  onConfirm: (prompt: ConfirmPromptState) => void;
}

export function SecurityCenterSection({ token, onToast }: Pick<OpsProps, "token" | "onToast">) {
  const [data, setData] = useState<SecurityPostureResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = (await adminApi.getSecurity(token)) as unknown as SecurityPostureResponse;
      setData(res);
    } catch (e) {
      onToast("err", (e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [token, onToast]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading || !data) {
    return (
      <div className="nx-admin-card">
        <div className="nx-skeleton-bubble assistant short" />
      </div>
    );
  }

  const p = data.posture;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div className="nx-admin-card">
        <div className="nx-admin-card-head">
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Shield size={18} color="var(--accent-blue)" />
            <h2>Security & Hardening Posture</h2>
          </div>
          <button type="button" className="nx-secondary-btn" onClick={() => load()}>
            <RefreshCw size={14} />
            <span>Re-check</span>
          </button>
        </div>

        <div className="nx-admin-grid-2">
          <div className="nx-kv-list">
            <div className="nx-kv-row">
              <span className="nx-kv-key">Firebase Admin SDK</span>
              <span className={`nx-status-text ${p.adminCredentialsReady ? "ok" : "err"}`}>
                {p.adminCredentialsReady ? "Verified & Ready" : "Missing Private Key"}
              </span>
            </div>
            <div className="nx-kv-row">
              <span className="nx-kv-key">Firebase Authentication</span>
              <span className={`nx-status-text ${p.firebaseAuthConfigured ? "ok" : "err"}`}>
                {p.firebaseAuthConfigured ? "Configured" : "Incomplete"}
              </span>
            </div>
            <div className="nx-kv-row">
              <span className="nx-kv-key">Firebase App Check</span>
              <span className={`nx-status-text ${p.appCheckConfigured ? "ok" : "warn"}`}>
                {p.appCheckConfigured ? "Site key configured" : "Not configured"}
              </span>
            </div>
            <div className="nx-kv-row">
              <span className="nx-kv-key">Strict Free-Only Guardrail</span>
              <span className={`nx-status-text ${p.freeOnlyMode ? "ok" : "warn"}`}>
                {p.freeOnlyMode ? "Enforced" : "Disabled"}
              </span>
            </div>
          </div>

          <div className="nx-kv-list">
            <div className="nx-kv-row">
              <span className="nx-kv-key">CSP & HSTS Headers</span>
              <span className="nx-status-text ok">Active (next.config.mjs)</span>
            </div>
            <div className="nx-kv-row">
              <span className="nx-kv-key">Firestore RBAC Rules</span>
              <span className="nx-status-text ok">Default-Deny + Server-Only system/*</span>
            </div>
            <div className="nx-kv-row">
              <span className="nx-kv-key">API Secrets Isolation</span>
              <span className="nx-status-text ok">Server-only (never serialized)</span>
            </div>
            <div className="nx-kv-row">
              <span className="nx-kv-key">Missing Env Keys</span>
              <span className={`nx-status-text ${p.missingKeys.length ? "warn" : "ok"}`}>
                {p.missingKeys.length ? p.missingKeys.join(", ") : "None"}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="nx-admin-card">
        <div className="nx-admin-card-head">
          <h3>Recent Security Events</h3>
          <span className="nx-kpi-sub tabular">{data.events.length} event(s)</span>
        </div>
        {data.events.length === 0 ? (
          <p className="nx-field-hint">No unauthorized access attempts or security alerts recorded.</p>
        ) : (
          <div className="nx-table-wrap">
            <table className="nx-table">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Type</th>
                  <th>Severity</th>
                  <th>Actor / Route</th>
                  <th>Message</th>
                </tr>
              </thead>
              <tbody>
                {data.events.map((ev) => (
                  <tr key={ev.id}>
                    <td className="tabular">{new Date(ev.createdAt).toLocaleString()}</td>
                    <td className="mono">{ev.type}</td>
                    <td>
                      <span className={`nx-status-text ${ev.severity === "high" ? "err" : ev.severity === "medium" ? "warn" : "ok"}`}>
                        {ev.severity}
                      </span>
                    </td>
                    <td className="mono">{ev.uid || ev.path || "—"}</td>
                    <td>{ev.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

export function MonitoringSection({ overview, onRefresh }: Pick<OpsProps, "overview" | "onRefresh">) {
  const { summary, daily, system } = overview;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div className="nx-kpi-grid">
        <div className="nx-kpi-card">
          <div className="nx-kpi-label">
            <span>Provider Health</span>
            <Activity size={14} color="var(--accent-blue)" />
          </div>
          <div className="nx-kpi-value" style={{ fontSize: 20 }}>
            {system.providerHealth}
          </div>
          <div className="nx-kpi-sub">Active providers: {system.configuredProviders.join(", ") || "None"}</div>
        </div>
        <div className="nx-kpi-card">
          <div className="nx-kpi-label">
            <span>Failed Requests</span>
          </div>
          <div className="nx-kpi-value">{summary.failedRequestsWindow.toLocaleString()}</div>
          <div className="nx-kpi-sub">Across selected window</div>
        </div>
        <div className="nx-kpi-card">
          <div className="nx-kpi-label">
            <span>Rate Limit Hits (429)</span>
          </div>
          <div className="nx-kpi-value">{summary.rateLimitHitsWindow.toLocaleString()}</div>
          <div className="nx-kpi-sub">Automatic retry/fallback handled</div>
        </div>
        <div className="nx-kpi-card">
          <div className="nx-kpi-label">
            <span>Auto Model Fallbacks</span>
          </div>
          <div className="nx-kpi-value">{summary.fallbackCountWindow.toLocaleString()}</div>
          <div className="nx-kpi-sub">Free-tier failover events</div>
        </div>
      </div>

      <div className="nx-admin-grid-2">
        <DailyBarChart
          title="Daily Failed Requests"
          variant="err"
          points={daily.map((d) => ({ label: d.day, value: d.failedRequests }))}
        />
        <DailyBarChart
          title="Daily Rate-Limit & Fallback Events"
          points={daily.map((d) => ({ label: d.day, value: d.rateLimitHits + d.fallbackCount }))}
        />
      </div>

      <div className="nx-admin-card">
        <div className="nx-admin-card-head">
          <h3>Subsystem Diagnostics</h3>
          <button type="button" className="nx-secondary-btn" onClick={() => onRefresh()}>
            <RefreshCw size={14} />
            <span>Refresh</span>
          </button>
        </div>
        <div className="nx-kv-list">
          <div className="nx-kv-row">
            <span className="nx-kv-key">Firebase Admin SDK</span>
            <span className={`nx-status-text ${system.adminCredentialsReady ? "ok" : "err"}`}>
              {system.adminCredentialsReady ? "Ready" : "Not configured"}
            </span>
          </div>
          <div className="nx-kv-row">
            <span className="nx-kv-key">Tavily Web Search</span>
            <span className={`nx-status-text ${system.tavilyConfigured ? "ok" : "warn"}`}>
              {system.tavilyConfigured ? "Configured" : "No API key"}
            </span>
          </div>
          <div className="nx-kv-row">
            <span className="nx-kv-key">Missing Keys</span>
            <span className="nx-kv-val">{system.missingKeys.length ? system.missingKeys.join(", ") : "All required keys present"}</span>
          </div>
          {(system.providerHealthDetails || []).map((p) => (
            <div key={p.providerId} className="nx-kv-row">
              <span className="nx-kv-key">
                {p.displayName} ({p.providerId})
              </span>
              <span className={`nx-status-text ${p.status === "healthy" ? "ok" : p.status === "degraded" || p.status === "rate_limited" ? "warn" : ""}`}>
                {p.status} · circuit {p.circuitState} · {p.avgLatencyMs != null ? `${p.avgLatencyMs}ms avg` : "no samples"}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function AnnouncementsSection({ token, onRefresh, onToast, onConfirm }: Omit<OpsProps, "overview">) {
  const [items, setItems] = useState<AnnouncementItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [category, setCategory] = useState<AnnouncementItem["category"]>("info");
  const [priority, setPriority] = useState<AnnouncementItem["priority"]>("normal");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await adminApi.getAnnouncements(token);
      setItems(res.items);
    } catch (e) {
      onToast("err", (e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [token, onToast]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleCreate = async () => {
    if (!title.trim() || !message.trim()) {
      onToast("err", "Title and message are required.");
      return;
    }
    setBusy(true);
    try {
      const res = await adminApi.createAnnouncement(token, {
        title: title.trim(),
        message: message.trim(),
        category,
        priority,
        published: true
      });
      setItems(res.items);
      setTitle("");
      setMessage("");
      await onRefresh();
      onToast("ok", "Announcement published.");
    } catch (e) {
      onToast("err", (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const toggleActive = async (item: AnnouncementItem) => {
    setBusy(true);
    try {
      const res = await adminApi.updateAnnouncement(token, {
        id: item.id,
        published: !item.published
      });
      setItems(res.items);
      await onRefresh();
      onToast("ok", !item.published ? "Announcement published." : "Announcement unpublished.");
    } catch (e) {
      onToast("err", (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = (item: AnnouncementItem) => {
    onConfirm({
      title: "Delete Announcement?",
      body: `Permanently delete "${item.title}"?`,
      confirmLabel: "Delete",
      danger: true,
      onConfirm: async () => {
        setBusy(true);
        try {
          const res = await adminApi.deleteAnnouncement(token, item.id);
          setItems(res.items);
          await onRefresh();
          onToast("ok", "Announcement deleted.");
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
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Megaphone size={18} color="var(--accent-blue)" />
            <h2>Create Platform Announcement</h2>
          </div>
        </div>

        <div className="nx-admin-form-grid">
          <div className="nx-admin-field">
            <label htmlFor="ann-title">Title</label>
            <input
              id="ann-title"
              className="nx-input"
              maxLength={100}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. NEXO AI v2.3 Update"
            />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div className="nx-admin-field">
              <label htmlFor="ann-cat">Category</label>
              <select
                id="ann-cat"
                className="nx-select"
                value={category}
                onChange={(e) => setCategory(e.target.value as AnnouncementItem["category"])}
              >
                <option value="info">Info</option>
                <option value="update">Update</option>
                <option value="maintenance">Maintenance</option>
                <option value="warning">Warning</option>
              </select>
            </div>
            <div className="nx-admin-field">
              <label htmlFor="ann-prio">Priority</label>
              <select
                id="ann-prio"
                className="nx-select"
                value={priority}
                onChange={(e) => setPriority(e.target.value as AnnouncementItem["priority"])}
              >
                <option value="normal">Normal</option>
                <option value="high">High</option>
                <option value="critical">Critical</option>
              </select>
            </div>
          </div>
        </div>

        <div className="nx-admin-field">
          <label htmlFor="ann-body">Message (Plain Text, HTML Sanitized)</label>
          <textarea
            id="ann-body"
            className="nx-textarea"
            maxLength={500}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Share release notes or operational notices cleanly with signed-in users…"
          />
        </div>

        <div className="nx-admin-actions-bar">
          <span className="nx-field-hint">HTML tags are automatically stripped before saving.</span>
          <button type="button" className="nx-admin-btn-primary" disabled={busy} onClick={handleCreate}>
            <Plus size={15} />
            <span>{busy ? "Publishing…" : "Publish Announcement"}</span>
          </button>
        </div>
      </div>

      <div className="nx-admin-card">
        <div className="nx-admin-card-head">
          <h3>Existing Announcements</h3>
          <span className="nx-kpi-sub tabular">{items.length} item(s)</span>
        </div>

        {loading ? (
          <div className="nx-skeleton-bubble assistant short" />
        ) : items.length === 0 ? (
          <p className="nx-field-hint">No announcements published yet.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {items.map((item) => (
              <div key={item.id} className="nx-field-card">
                <div className="nx-field-row">
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <strong style={{ fontSize: 14 }}>{item.title}</strong>
                      <span className="nx-field-hint">
                        {item.category} · {item.priority} ·{" "}
                        <span className={`nx-status-text ${item.published ? "ok" : ""}`}>
                          {item.published ? "Published" : "Draft / Unpublished"}
                        </span>
                      </span>
                    </div>
                    <p className="nx-field-hint" style={{ marginTop: 4, color: "var(--text-secondary)" }}>
                      {item.message}
                    </p>
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={item.published}
                      className={`nx-switch ${item.published ? "on" : ""}`}
                      disabled={busy}
                      onClick={() => toggleActive(item)}
                      aria-label={`Toggle ${item.title}`}
                    >
                      <span />
                    </button>
                    <button
                      type="button"
                      className="nx-tiny-btn danger"
                      disabled={busy}
                      onClick={() => handleDelete(item)}
                      aria-label="Delete announcement"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function AuditLogsSection({ token, onToast }: Pick<OpsProps, "token" | "onToast">) {
  const [logs, setLogs] = useState<AdminAuditRow[]>([]);
  const [filter, setFilter] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await adminApi.getAuditLogs(token, 80, filter);
      setLogs(res.logs);
    } catch (e) {
      onToast("err", (e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [token, filter, onToast]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="nx-admin-card">
      <div className="nx-admin-card-head">
        <div>
          <h2>Administrative Audit Logs</h2>
          <p className="nx-field-hint">Immutable server-recorded log of all Super Admin actions. Secrets and tokens are automatically redacted.</p>
        </div>
        <button type="button" className="nx-secondary-btn" onClick={() => load()}>
          <RefreshCw size={14} />
          <span>Refresh</span>
        </button>
      </div>

      <div style={{ display: "flex", gap: 10 }}>
        <input
          className="nx-input"
          style={{ maxWidth: 320 }}
          placeholder="Filter by action prefix (e.g. update_global_config)…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
      </div>

      {loading ? (
        <div className="nx-skeleton-bubble assistant short" />
      ) : logs.length === 0 ? (
        <p className="nx-field-hint">No audit log entries found.</p>
      ) : (
        <div className="nx-table-wrap">
          <table className="nx-table">
            <thead>
              <tr>
                <th>Timestamp</th>
                <th>Action</th>
                <th>Target</th>
                <th>Actor UID</th>
                <th>Result</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((row) => (
                <tr key={row.id}>
                  <td className="tabular">{new Date(row.createdAt).toLocaleString()}</td>
                  <td className="mono">{row.action}</td>
                  <td className="mono">{row.target}</td>
                  <td className="mono">{row.actorUid}</td>
                  <td>
                    <span className={`nx-status-text ${row.result === "success" ? "ok" : "err"}`}>
                      {row.result}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export function DataManagementSection({ token, onRefresh, onToast, onConfirm }: Omit<OpsProps, "overview">) {
  const [running, setRunning] = useState(false);

  const triggerMigration = (action: "init_system_docs" | "backfill_user_metadata", title: string, body: string) => {
    onConfirm({
      title,
      body,
      confirmLabel: "Run Safe Migration",
      onConfirm: async () => {
        setRunning(true);
        try {
          const res = await adminApi.runMigration(token, action);
          await onRefresh();
          onToast("ok", res.message);
        } catch (e) {
          onToast("err", (e as Error).message);
        } finally {
          setRunning(false);
        }
      }
    });
  };

  return (
    <div className="nx-admin-card">
      <div className="nx-admin-card-head">
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Database size={18} color="var(--accent-blue)" />
          <h2>Data & Safe Schema Migrations</h2>
        </div>
      </div>

      <p className="nx-field-hint">
        All migrations are strictly idempotent and preserve existing user conversations, messages, memories, and preferences. No destructive data wipes are performed.
      </p>

      <div className="nx-admin-grid-2">
        <div className="nx-field-card">
          <span className="nx-field-label">Initialize System Runtime Documents</span>
          <p className="nx-field-hint">
            Ensures <code>system/globalConfig</code>, <code>system/featureFlags</code>, <code>system/maintenance</code>, <code>system/providerConfig</code>, and <code>system/modelRegistry</code> exist without overwriting custom values.
          </p>
          <button
            type="button"
            className="nx-secondary-btn"
            disabled={running}
            onClick={() =>
              triggerMigration(
                "init_system_docs",
                "Initialize Missing System Docs?",
                "Creates any missing runtime config documents in Firestore with default values. Existing documents are preserved."
              )
            }
          >
            Run Initialization
          </button>
        </div>

        <div className="nx-field-card">
          <span className="nx-field-label">Backfill User Role & Status Metadata</span>
          <p className="nx-field-hint">
            Syncs default <code>role</code> and <code>status: &quot;active&quot;</code> metadata on legacy Firebase user documents while preserving all chats, memories, and preferences.
          </p>
          <button
            type="button"
            className="nx-secondary-btn"
            disabled={running}
            onClick={() =>
              triggerMigration(
                "backfill_user_metadata",
                "Backfill Legacy User Metadata?",
                "Safely fills missing role and status fields on Firebase Auth users in Firestore without altering conversations or messages."
              )
            }
          >
            Run User Metadata Backfill
          </button>
        </div>
      </div>
    </div>
  );
}

export function AdminAboutSection({ overview }: { overview: AdminOverviewResponse }) {
  const configured = overview.system.configuredProviders;
  return (
    <div className="nx-admin-card">
      <div className="nx-admin-card-head">
        <h2>About & Official Credits</h2>
      </div>

      <div className="nx-kv-list">
        <div className="nx-kv-row">
          <span className="nx-kv-key">Platform</span>
          <span className="nx-kv-val">{overview.runtime.globalConfig.appName}</span>
        </div>
        <div className="nx-kv-row">
          <span className="nx-kv-key">Creator & Owner</span>
          <span className="nx-kv-val">Ash Wickramasinghe (Kushan A Wickramasinghe)</span>
        </div>
        <div className="nx-kv-row">
          <span className="nx-kv-key">Role</span>
          <span className="nx-kv-val">Founder, Creator & Independent Developer</span>
        </div>
        <div className="nx-kv-row">
          <span className="nx-kv-key">Official Website</span>
          <a
            href="https://ash-wickramasinghe.site"
            target="_blank"
            rel="noopener noreferrer"
            style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13 }}
          >
            <span>https://ash-wickramasinghe.site</span>
            <ExternalLink size={12} />
          </a>
        </div>
        <div className="nx-kv-row">
          <span className="nx-kv-key">Active Server Providers</span>
          <span className="nx-kv-val">{configured.join(", ") || "None configured"}</span>
        </div>
      </div>

      <p className="nx-field-hint">
        NEXO AI is an independent software platform and is not affiliated with or endorsed by Google, OpenAI, or other third-party API providers. Third-party attributions appear in Settings → About & Credits only for active configured integrations.
      </p>
      <p className="nx-field-hint" style={{ color: "var(--text-primary)", fontWeight: 500 }}>
        © 2026 Ash Wickramasinghe. All Rights Reserved.
      </p>
    </div>
  );
}
