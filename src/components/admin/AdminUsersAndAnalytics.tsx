"use client";
import { useCallback, useEffect, useState } from "react";
import { KeyRound, RefreshCw, Search, ShieldOff, UserCheck, UserX } from "lucide-react";
import { adminApi } from "@/lib/api";
import type { AccountStatus, FeatureKey } from "@/lib/types";
import { DailyBarChart } from "./AdminChartsAndConfirm";
import type { AdminOverviewResponse, AdminUserRow, ConfirmPromptState } from "./adminTypes";

interface Props {
  mode: "users" | "analytics";
  overview: AdminOverviewResponse;
  token: string;
  onRefreshOverview: () => Promise<void>;
  onToast: (type: "ok" | "err", text: string) => void;
  onConfirm: (prompt: ConfirmPromptState) => void;
}

const OVERRIDE_KEYS: { key: FeatureKey; label: string }[] = [
  { key: "chat", label: "AI Chat" },
  { key: "voiceInput", label: "Voice Input" },
  { key: "tts", label: "TTS Voice" },
  { key: "attachments", label: "Attachments" },
  { key: "webSearch", label: "Web Search" },
  { key: "personalMemory", label: "Memory" }
];

export function UsersAndAnalyticsSection({
  mode,
  overview,
  token,
  onRefreshOverview,
  onToast,
  onConfirm
}: Props) {
  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [days, setDays] = useState(30);
  const [selectedUid, setSelectedUid] = useState<string | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [selectedUser, setSelectedUser] = useState<AdminUserRow | null>(null);
  const [userDaily, setUserDaily] = useState<Array<{ day: string; requests: number; estimatedInputTokens: number; estimatedOutputTokens: number }>>([]);
  const [reasonDraft, setReasonDraft] = useState("");
  const [mutating, setMutating] = useState(false);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await adminApi.getUsers(token, query, statusFilter, days);
      setUsers(res.users);
      if (!selectedUid && res.users.length > 0) {
        setSelectedUid(res.users[0].uid);
      }
    } catch (e) {
      onToast("err", (e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [token, query, statusFilter, days, selectedUid, onToast]);

  useEffect(() => {
    void loadUsers();
  }, [loadUsers]);

  const loadDetail = useCallback(
    async (uid: string) => {
      setDetailLoading(true);
      try {
        const res = await adminApi.getUserDetail(token, uid, days);
        setSelectedUser(res.user);
        setReasonDraft(res.user.suspendedReason || "");
        setUserDaily(
          res.daily.map((d) => ({
            day: String(d.day || ""),
            requests: Number(d.requests || 0),
            estimatedInputTokens: Number(d.estimatedInputTokens || 0),
            estimatedOutputTokens: Number(d.estimatedOutputTokens || 0)
          }))
        );
      } catch (e) {
        onToast("err", (e as Error).message);
      } finally {
        setDetailLoading(false);
      }
    },
    [token, days, onToast]
  );

  useEffect(() => {
    if (selectedUid) {
      void loadDetail(selectedUid);
    }
  }, [selectedUid, loadDetail]);

  const applyStatus = (target: AdminUserRow, nextStatus: AccountStatus) => {
    const isSelf = target.uid === overview.admin.uid;
    if (isSelf) {
      onToast("err", "Owner self-protection prevents restricting or disabling your own Owner account.");
      return;
    }

    onConfirm({
      title: `${nextStatus === "active" ? "Restore" : nextStatus === "suspended" ? "Suspend" : "Disable"} User Account?`,
      body:
        nextStatus === "active"
          ? `Restore full access for ${target.email || target.uid}?`
          : `Set ${target.email || target.uid} status to "${nextStatus}". Active requests will be blocked immediately.`,
      confirmLabel: nextStatus === "active" ? "Restore Access" : `Set ${nextStatus}`,
      danger: nextStatus !== "active",
      onConfirm: async () => {
        setMutating(true);
        try {
          await adminApi.patchUser(token, target.uid, {
            status: nextStatus,
            suspendedReason: nextStatus === "active" ? "" : reasonDraft.trim() || "Access restricted by administrator."
          });
          await Promise.all([loadUsers(), loadDetail(target.uid), onRefreshOverview()]);
          onToast("ok", `User ${target.email || target.uid} updated to ${nextStatus}.`);
        } catch (e) {
          onToast("err", (e as Error).message);
        } finally {
          setMutating(false);
        }
      }
    });
  };

  const handleRevoke = (target: AdminUserRow) => {
    if (target.uid === overview.admin.uid) {
      onToast("err", "Owner self-protection prevents revoking your own active Super Admin session here.");
      return;
    }
    onConfirm({
      title: "Force Sign-Out & Revoke Refresh Tokens?",
      body: `This revokes active Firebase refresh tokens for ${target.email || target.uid}, forcing re-authentication.`,
      confirmLabel: "Revoke Tokens",
      danger: true,
      onConfirm: async () => {
        setMutating(true);
        try {
          await adminApi.revokeUserTokens(token, target.uid);
          onToast("ok", `Refresh tokens revoked for ${target.email || target.uid}.`);
        } catch (e) {
          onToast("err", (e as Error).message);
        } finally {
          setMutating(false);
        }
      }
    });
  };

  const handleOverrideToggle = async (target: AdminUserRow, key: FeatureKey, currentVal: boolean | undefined) => {
    setMutating(true);
    try {
      // Cycle: inherit (null) -> false -> true -> inherit (null)
      const nextVal = currentVal === undefined ? false : currentVal === false ? true : null;
      await adminApi.patchUser(token, target.uid, {
        featureOverrides: { [key]: nextVal }
      });
      await Promise.all([loadUsers(), loadDetail(target.uid)]);
      onToast("ok", `Updated ${key} override for ${target.email || target.uid}.`);
    } catch (e) {
      onToast("err", (e as Error).message);
    } finally {
      setMutating(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {mode === "analytics" && (
        <div className="nx-admin-grid-2">
          <DailyBarChart
            title={`Platform Requests (${days}d Window)`}
            points={overview.daily.map((d) => ({ label: d.day, value: d.requests }))}
          />
          <DailyBarChart
            title={`Selected User Requests (${selectedUser?.email || selectedUid || "None"})`}
            variant="alt"
            points={userDaily.map((d) => ({
              label: d.day,
              value: d.requests,
              hint: `${d.day}: ${d.requests} reqs, ~${(d.estimatedInputTokens + d.estimatedOutputTokens).toLocaleString()} tokens`
            }))}
          />
        </div>
      )}

      <div className="nx-admin-card">
        <div className="nx-admin-card-head">
          <div>
            <h2>{mode === "users" ? "Users & Account Access" : "Per-User Usage Analytics"}</h2>
            <p className="nx-field-hint">
              Aggregated from Firebase Auth and server-recorded usage counters. Private chat messages remain isolated.
            </p>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <select
              className="nx-select"
              style={{ width: 130, minHeight: 38 }}
              value={days}
              onChange={(e) => setDays(Number(e.target.value))}
              aria-label="Analytics window"
            >
              <option value={7}>Last 7 days</option>
              <option value={30}>Last 30 days</option>
              <option value={60}>Last 60 days</option>
            </select>
            <button type="button" className="nx-secondary-btn" onClick={() => loadUsers()}>
              <RefreshCw size={14} />
              <span>Refresh</span>
            </button>
          </div>
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
          <div className="nx-sidebar-search" style={{ margin: 0, flex: "1 1 240px", minHeight: 40 }}>
            <Search size={14} color="var(--text-muted)" />
            <input
              type="search"
              placeholder="Search by email, name, or UID…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <select
            className="nx-select"
            style={{ width: 160, minHeight: 40 }}
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            aria-label="Filter user status"
          >
            <option value="all">All Statuses</option>
            <option value="active">Active</option>
            <option value="suspended">Suspended</option>
            <option value="disabled">Disabled</option>
          </select>
        </div>

        {loading ? (
          <div className="nx-skeleton-stack">
            <div className="nx-skeleton-bubble assistant short" />
            <div className="nx-skeleton-bubble assistant short" />
          </div>
        ) : users.length === 0 ? (
          <p className="nx-field-hint">
            No user accounts matched or Admin credentials are not configured in this environment.
          </p>
        ) : (
          <div className="nx-table-wrap">
            <table className="nx-table">
              <thead>
                <tr>
                  <th>User</th>
                  <th>Role</th>
                  <th>Status</th>
                  <th>Requests</th>
                  <th>TTS / Voice</th>
                  <th>Est. Tokens</th>
                  <th>Last Active</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => {
                  const isSelected = u.uid === selectedUid;
                  return (
                    <tr
                      key={u.uid}
                      onClick={() => setSelectedUid(u.uid)}
                      style={{
                        cursor: "pointer",
                        background: isSelected ? "var(--bg-active)" : undefined
                      }}
                    >
                      <td>
                        <div style={{ display: "flex", flexDirection: "column" }}>
                          <span style={{ fontWeight: 600 }}>{u.displayName || u.email || "NEXO User"}</span>
                          <span className="nx-field-hint mono" style={{ fontSize: 11.5 }}>
                            {u.email || u.uid}
                          </span>
                        </div>
                      </td>
                      <td>
                        <span className={`nx-status-text ${u.role === "SUPER_ADMIN" ? "ok" : ""}`}>
                          {u.role}
                        </span>
                      </td>
                      <td>
                        <span className={`nx-status-text ${u.status === "active" ? "ok" : u.status === "suspended" ? "warn" : "err"}`}>
                          {u.status}
                        </span>
                      </td>
                      <td className="tabular">{u.usage.totalRequests.toLocaleString()}</td>
                      <td className="tabular">
                        {u.usage.totalTts} / {u.usage.totalVoiceRequests}
                      </td>
                      <td className="tabular">
                        {(u.usage.estimatedInputTokens + u.usage.estimatedOutputTokens).toLocaleString()}
                      </td>
                      <td className="tabular">
                        {u.lastActiveAt ? new Date(u.lastActiveAt).toLocaleDateString() : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {selectedUser && (
        <div className="nx-admin-card">
          <div className="nx-admin-card-head">
            <div>
              <h3>Account Controls · {selectedUser.email || selectedUser.uid}</h3>
              <p className="nx-field-hint mono">
                UID: {selectedUser.uid} · Role: {selectedUser.role} · Providers:{" "}
                {Object.keys(selectedUser.usage.byProvider).join(", ") || "—"}
              </p>
            </div>
            {detailLoading && <span className="nx-field-hint">Refreshing…</span>}
          </div>

          <div className="nx-admin-grid-2">
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div className="nx-admin-field">
                <label htmlFor="usr-reason">Suspension / Restriction Note (shown to restricted user)</label>
                <input
                  id="usr-reason"
                  className="nx-input"
                  maxLength={240}
                  value={reasonDraft}
                  onChange={(e) => setReasonDraft(e.target.value)}
                  placeholder="Optional reason displayed when access is suspended"
                />
              </div>

              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {selectedUser.status !== "active" ? (
                  <button
                    type="button"
                    className="nx-admin-btn-primary"
                    disabled={mutating}
                    onClick={() => applyStatus(selectedUser, "active")}
                  >
                    <UserCheck size={15} />
                    <span>Restore Active Access</span>
                  </button>
                ) : (
                  <>
                    <button
                      type="button"
                      className="nx-secondary-btn"
                      disabled={mutating}
                      onClick={() => applyStatus(selectedUser, "suspended")}
                    >
                      <ShieldOff size={15} />
                      <span>Suspend User</span>
                    </button>
                    <button
                      type="button"
                      className="nx-danger-btn"
                      disabled={mutating}
                      onClick={() => applyStatus(selectedUser, "disabled")}
                    >
                      <UserX size={15} />
                      <span>Disable Account</span>
                    </button>
                  </>
                )}

                <button
                  type="button"
                  className="nx-secondary-btn"
                  disabled={mutating}
                  onClick={() => handleRevoke(selectedUser)}
                >
                  <KeyRound size={15} />
                  <span>Force Sign-Out</span>
                </button>
              </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <span className="nx-field-label">Per-User Feature Overrides (Click to cycle: Inherit · Force Off · Force On)</span>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 8 }}>
                {OVERRIDE_KEYS.map((item) => {
                  const val = selectedUser.featureOverrides?.[item.key];
                  return (
                    <button
                      key={item.key}
                      type="button"
                      className="nx-secondary-btn"
                      style={{ justifyContent: "space-between", minHeight: 36 }}
                      disabled={mutating}
                      onClick={() => handleOverrideToggle(selectedUser, item.key, val)}
                    >
                      <span>{item.label}</span>
                      <span className={`nx-status-text ${val === true ? "ok" : val === false ? "err" : ""}`}>
                        {val === undefined ? "Inherit" : val ? "On" : "Off"}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
