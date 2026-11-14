"use client";
import { useEffect, useState } from "react";
import { Activity, CheckCircle2, Cpu, RefreshCw, RotateCcw, Save, ShieldAlert, Wrench } from "lucide-react";
import { adminApi } from "@/lib/api";
import type {
  FeatureFlags,
  FeatureKey,
  GlobalConfig,
  MaintenanceConfig,
  ModelOverride,
  ProviderConfig,
  ProviderHealthTelemetry
} from "@/lib/types";
import { BreakdownCard, DailyBarChart } from "./AdminChartsAndConfirm";
import type { AdminOverviewResponse, ConfirmPromptState } from "./adminTypes";

interface CommonProps {
  overview: AdminOverviewResponse;
  token: string;
  onRefresh: () => Promise<void>;
  onToast: (type: "ok" | "err", text: string) => void;
  onConfirm: (prompt: ConfirmPromptState) => void;
}

export function OverviewSection({ overview }: { overview: AdminOverviewResponse }) {
  const { summary, daily, byProvider, byModel, system, runtime } = overview;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div className="nx-kpi-grid">
        <div className="nx-kpi-card">
          <div className="nx-kpi-label">
            <span>Total Users</span>
          </div>
          <div className="nx-kpi-value">{summary.totalUsers.toLocaleString()}</div>
          <div className="nx-kpi-sub">
            {summary.activeUsers} active · {summary.suspendedUsers} restricted
          </div>
        </div>

        <div className="nx-kpi-card">
          <div className="nx-kpi-label">
            <span>AI Requests</span>
          </div>
          <div className="nx-kpi-value">{summary.requestsWindow.toLocaleString()}</div>
          <div className="nx-kpi-sub">
            {summary.ttsWindow} TTS · {summary.voiceWindow} voice · {summary.imageRequestsWindow ?? 0} images
          </div>
        </div>

        <div className="nx-kpi-card">
          <div className="nx-kpi-label">
            <span>Estimated Tokens</span>
          </div>
          <div className="nx-kpi-value">{summary.estimatedTokensWindow.toLocaleString()}</div>
          <div className="nx-kpi-sub">~4 chars/token approximation</div>
        </div>

        <div className="nx-kpi-card">
          <div className="nx-kpi-label">
            <span>Failures & Rate Limits</span>
          </div>
          <div className="nx-kpi-value">{summary.failedRequestsWindow.toLocaleString()}</div>
          <div className="nx-kpi-sub">
            {summary.rateLimitHitsWindow} rate limits · {summary.fallbackCountWindow} fallbacks
          </div>
        </div>
      </div>

      <div className="nx-admin-grid-2">
        <DailyBarChart
          title="Daily AI Requests"
          points={daily.map((d) => ({
            label: d.day,
            value: d.requests,
            hint: `${d.day}: ${d.requests} requests, ${d.failedRequests} failed`
          }))}
        />
        <DailyBarChart
          title="Daily Estimated Tokens"
          variant="alt"
          points={daily.map((d) => ({
            label: d.day,
            value: d.estimatedInputTokens + d.estimatedOutputTokens,
            hint: `${d.day}: ~${(d.estimatedInputTokens + d.estimatedOutputTokens).toLocaleString()} tokens`
          }))}
        />
      </div>

      <div className="nx-admin-grid-2">
        <BreakdownCard title="Requests by Provider" entries={byProvider} />
        <BreakdownCard title="Requests by Model" entries={byModel} />
      </div>

      {overview.byTask && Object.keys(overview.byTask).length > 0 && (
        <BreakdownCard title="Requests by Capability (NEXO Auto-Router)" entries={overview.byTask} />
      )}

      <div className="nx-admin-card">
        <div className="nx-admin-card-head">
          <h3>Runtime Status Snapshot</h3>
          <span className={`nx-status-text ${system.providerHealth === "healthy" ? "ok" : "warn"}`}>
            {system.providerHealth}
          </span>
        </div>
        <div className="nx-kv-list">
          <div className="nx-kv-row">
            <span className="nx-kv-key">Maintenance Mode</span>
            <span className={`nx-status-text ${runtime.maintenance.enabled ? "warn" : "ok"}`}>
              {runtime.maintenance.enabled ? "Enabled (Owner bypass active)" : "Inactive"}
            </span>
          </div>
          <div className="nx-kv-row">
            <span className="nx-kv-key">Free-Only Guardrail</span>
            <span className={`nx-status-text ${runtime.globalConfig.freeOnlyMode ? "ok" : "warn"}`}>
              {runtime.globalConfig.freeOnlyMode ? "Enforced" : "Disabled"}
            </span>
          </div>
          <div className="nx-kv-row">
            <span className="nx-kv-key">Firebase Admin Persistence</span>
            <span className={`nx-status-text ${system.adminCredentialsReady ? "ok" : "err"}`}>
              {system.adminCredentialsReady ? "Connected" : "Admin credentials missing"}
            </span>
          </div>
          <div className="nx-kv-row">
            <span className="nx-kv-key">High-Severity Security Events</span>
            <span className="nx-kv-val tabular">{summary.securityAlertsRecent}</span>
          </div>
        </div>
        <p className="nx-field-hint">{system.tokenAccuracyNote}</p>
      </div>
    </div>
  );
}

export function GlobalSettingsSection({ overview, token, onRefresh, onToast, onConfirm }: CommonProps) {
  const [draft, setDraft] = useState<GlobalConfig>(overview.runtime.globalConfig);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setDraft(overview.runtime.globalConfig);
  }, [overview.runtime.globalConfig]);

  const persistSave = async (next: GlobalConfig) => {
    setSaving(true);
    try {
      await adminApi.updateConfig(token, "globalConfig", {
        appName: next.appName,
        brandingSubtitle: next.brandingSubtitle,
        defaultTheme: next.defaultTheme,
        defaultLanguage: next.defaultLanguage,
        allowLanguageSwitch: next.allowLanguageSwitch,
        allowRegistration: next.allowRegistration,
        defaultProvider: next.defaultProvider,
        defaultModel: next.defaultModel,
        freeOnlyMode: next.freeOnlyMode,
        aiTemperature: Number(next.aiTemperature),
        dailyRequestLimit: Number(next.dailyRequestLimit),
        dailyTtsLimit: Number(next.dailyTtsLimit),
        rateLimitPerMinute: Number(next.rateLimitPerMinute),
        maxInputChars: Number(next.maxInputChars),
        maxHistoryMessages: Number(next.maxHistoryMessages)
      });
      await onRefresh();
      onToast("ok", "Global configuration saved and applied immediately.");
    } catch (e) {
      onToast("err", (e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const handleSave = () => {
    if (draft.freeOnlyMode !== overview.runtime.globalConfig.freeOnlyMode && !draft.freeOnlyMode) {
      onConfirm({
        title: "Disable Strict Free-Only Mode?",
        body: "Disabling Free-Only mode allows selecting non-free model identifiers if your upstream provider key permits billing. Continue?",
        confirmLabel: "Disable Free-Only",
        danger: true,
        onConfirm: () => persistSave(draft)
      });
      return;
    }
    void persistSave(draft);
  };

  const handleReset = () => {
    onConfirm({
      title: "Reset Global Settings to Defaults?",
      body: "This restores NEXO AI's default branding, quotas, temperature, and Free-Only guardrail.",
      confirmLabel: "Reset Defaults",
      danger: true,
      onConfirm: async () => {
        setSaving(true);
        try {
          await adminApi.resetConfig(token, "globalConfig");
          await onRefresh();
          onToast("ok", "Global settings restored to defaults.");
        } catch (e) {
          onToast("err", (e as Error).message);
        } finally {
          setSaving(false);
        }
      }
    });
  };

  return (
    <div className="nx-admin-card">
      <div className="nx-admin-card-head">
        <div>
          <h2>Global Application Configuration</h2>
          <p className="nx-field-hint">Runtime changes apply immediately across clients without redeploying.</p>
        </div>
        <span className="nx-kpi-sub tabular">Version {overview.runtime.globalConfig.version || 1}</span>
      </div>

      <div className="nx-admin-form-grid">
        <div className="nx-admin-field">
          <label htmlFor="gc-app-name">Application Name</label>
          <input
            id="gc-app-name"
            className="nx-input"
            maxLength={60}
            value={draft.appName}
            onChange={(e) => setDraft({ ...draft, appName: e.target.value })}
          />
        </div>

        <div className="nx-admin-field">
          <label htmlFor="gc-subtitle">Sign-In Tagline / Branding Subtitle</label>
          <input
            id="gc-subtitle"
            className="nx-input"
            maxLength={140}
            value={draft.brandingSubtitle}
            onChange={(e) => setDraft({ ...draft, brandingSubtitle: e.target.value })}
          />
        </div>

        <div className="nx-admin-field">
          <label htmlFor="gc-theme">Default Theme (for new sessions)</label>
          <select
            id="gc-theme"
            className="nx-select"
            value={draft.defaultTheme}
            onChange={(e) => setDraft({ ...draft, defaultTheme: e.target.value as GlobalConfig["defaultTheme"] })}
          >
            <option value="dark">Dark</option>
            <option value="light">Light</option>
            <option value="system">System</option>
          </select>
        </div>

        <div className="nx-admin-field">
          <label htmlFor="gc-lang">Default Language</label>
          <select
            id="gc-lang"
            className="nx-select"
            value={draft.defaultLanguage}
            onChange={(e) => setDraft({ ...draft, defaultLanguage: e.target.value as GlobalConfig["defaultLanguage"] })}
          >
            <option value="en">English (en)</option>
            <option value="si">Sinhala (si)</option>
          </select>
        </div>

        <div className="nx-admin-field">
          <label htmlFor="gc-provider">Default AI Provider</label>
          <select
            id="gc-provider"
            className="nx-select"
            value={draft.defaultProvider}
            onChange={(e) => setDraft({ ...draft, defaultProvider: e.target.value as GlobalConfig["defaultProvider"] })}
          >
            <option value="gemini">Google Gemini</option>
            <option value="openai-compatible">OpenAI-Compatible</option>
          </select>
        </div>

        <div className="nx-admin-field">
          <label htmlFor="gc-model">Default Model ID</label>
          <input
            id="gc-model"
            className="nx-input mono"
            maxLength={120}
            value={draft.defaultModel}
            onChange={(e) => setDraft({ ...draft, defaultModel: e.target.value })}
          />
        </div>

        <div className="nx-admin-field">
          <label htmlFor="gc-temp">Temperature (0 – 2)</label>
          <input
            id="gc-temp"
            type="number"
            min={0}
            max={2}
            step={0.05}
            className="nx-input tabular"
            value={draft.aiTemperature}
            onChange={(e) => setDraft({ ...draft, aiTemperature: Number(e.target.value) })}
          />
        </div>

        <div className="nx-admin-field">
          <label htmlFor="gc-rpm">Rate Limit (Requests / Minute)</label>
          <input
            id="gc-rpm"
            type="number"
            min={1}
            max={120}
            className="nx-input tabular"
            value={draft.rateLimitPerMinute}
            onChange={(e) => setDraft({ ...draft, rateLimitPerMinute: Number(e.target.value) })}
          />
        </div>

        <div className="nx-admin-field">
          <label htmlFor="gc-daily">Daily Request Limit / User</label>
          <input
            id="gc-daily"
            type="number"
            min={1}
            max={5000}
            className="nx-input tabular"
            value={draft.dailyRequestLimit}
            onChange={(e) => setDraft({ ...draft, dailyRequestLimit: Number(e.target.value) })}
          />
        </div>

        <div className="nx-admin-field">
          <label htmlFor="gc-tts">Daily TTS Limit / User</label>
          <input
            id="gc-tts"
            type="number"
            min={1}
            max={2000}
            className="nx-input tabular"
            value={draft.dailyTtsLimit}
            onChange={(e) => setDraft({ ...draft, dailyTtsLimit: Number(e.target.value) })}
          />
        </div>

        <div className="nx-admin-field">
          <label htmlFor="gc-chars">Max Input Characters / Message</label>
          <input
            id="gc-chars"
            type="number"
            min={200}
            max={32000}
            className="nx-input tabular"
            value={draft.maxInputChars}
            onChange={(e) => setDraft({ ...draft, maxInputChars: Number(e.target.value) })}
          />
        </div>

        <div className="nx-admin-field">
          <label htmlFor="gc-hist">Max History Window Messages</label>
          <input
            id="gc-hist"
            type="number"
            min={2}
            max={60}
            className="nx-input tabular"
            value={draft.maxHistoryMessages}
            onChange={(e) => setDraft({ ...draft, maxHistoryMessages: Number(e.target.value) })}
          />
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div className="nx-field-card">
          <div className="nx-field-row">
            <div>
              <span className="nx-field-label">Allow Language Switching (English / Sinhala)</span>
              <p className="nx-field-hint">When disabled, all clients use the default language configured above.</p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={draft.allowLanguageSwitch}
              className={`nx-switch ${draft.allowLanguageSwitch ? "on" : ""}`}
              onClick={() => setDraft({ ...draft, allowLanguageSwitch: !draft.allowLanguageSwitch })}
            >
              <span />
            </button>
          </div>
        </div>

        <div className="nx-field-card">
          <div className="nx-field-row">
            <div>
              <span className="nx-field-label">Allow New User Sign-Ups</span>
              <p className="nx-field-hint">When disabled, brand new Google accounts are blocked while existing users and the Owner continue normally.</p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={draft.allowRegistration}
              className={`nx-switch ${draft.allowRegistration ? "on" : ""}`}
              onClick={() => setDraft({ ...draft, allowRegistration: !draft.allowRegistration })}
            >
              <span />
            </button>
          </div>
        </div>

        <div className="nx-field-card">
          <div className="nx-field-row">
            <div>
              <span className="nx-field-label">Strict Free-Only Model Guardrail</span>
              <p className="nx-field-hint">Blocks paid/unverified model IDs from manual selection and automatic quota fallbacks.</p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={draft.freeOnlyMode}
              className={`nx-switch ${draft.freeOnlyMode ? "on" : ""}`}
              onClick={() => setDraft({ ...draft, freeOnlyMode: !draft.freeOnlyMode })}
            >
              <span />
            </button>
          </div>
        </div>
      </div>

      <div className="nx-admin-actions-bar">
        <button type="button" className="nx-secondary-btn" disabled={saving} onClick={handleReset}>
          <RotateCcw size={15} />
          <span>Reset to Defaults</span>
        </button>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            type="button"
            className="nx-secondary-btn"
            disabled={saving}
            onClick={() => setDraft(overview.runtime.globalConfig)}
          >
            Cancel
          </button>
          <button type="button" className="nx-admin-btn-primary" disabled={saving} onClick={handleSave}>
            <Save size={15} />
            <span>{saving ? "Saving…" : "Save Changes"}</span>
          </button>
        </div>
      </div>
    </div>
  );
}

export function ProvidersSection({ overview, token, onRefresh, onToast, onConfirm }: CommonProps) {
  const [draft, setDraft] = useState<ProviderConfig>(overview.runtime.providerConfig);
  const [fallbackText, setFallbackText] = useState(overview.runtime.providerConfig.fallbackOrder.join(", "));
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState<string | null>(null);
  const [healthLoading, setHealthLoading] = useState(false);
  const [healthRows, setHealthRows] = useState<ProviderHealthTelemetry[]>(overview.system.providerHealthDetails || []);
  const [testResult, setTestResult] = useState<{
    provider: string;
    ok: boolean;
    latencyMs: number;
    modelsFound: number;
    error?: string;
  } | null>(null);

  useEffect(() => {
    setDraft(overview.runtime.providerConfig);
    setFallbackText(overview.runtime.providerConfig.fallbackOrder.join(", "));
    if (overview.system.providerHealthDetails) {
      setHealthRows(overview.system.providerHealthDetails);
    }
  }, [overview.runtime.providerConfig, overview.system.providerHealthDetails]);

  const refreshHealth = async () => {
    setHealthLoading(true);
    try {
      const res = await adminApi.getHealth(token);
      setHealthRows(res.providers);
      onToast("ok", "Provider health telemetry refreshed.");
    } catch (e) {
      onToast("err", (e as Error).message);
    } finally {
      setHealthLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const parsedOrder = fallbackText
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      await adminApi.updateConfig(token, "providerConfig", {
        providers: draft.providers,
        fallbackOrder: parsedOrder
      });
      await onRefresh();
      onToast("ok", "AI provider configuration updated.");
    } catch (e) {
      onToast("err", (e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async (provider: "gemini" | "openai-compatible") => {
    setTesting(provider);
    setTestResult(null);
    try {
      const res = await adminApi.testProvider(token, provider);
      setTestResult(res);
      if (res.ok) onToast("ok", `${provider} connectivity verified (${res.latencyMs}ms).`);
      else onToast("err", res.error || `${provider} connectivity check failed.`);
    } catch (e) {
      onToast("err", (e as Error).message);
    } finally {
      setTesting(null);
    }
  };

  const handleReset = () => {
    onConfirm({
      title: "Reset Provider Configuration?",
      body: "Restores default Gemini and OpenAI-compatible display names, TTS settings, and fallback order.",
      confirmLabel: "Reset Defaults",
      danger: true,
      onConfirm: async () => {
        setSaving(true);
        try {
          await adminApi.resetConfig(token, "providerConfig");
          await onRefresh();
          onToast("ok", "Provider settings restored to defaults.");
        } catch (e) {
          onToast("err", (e as Error).message);
        } finally {
          setSaving(false);
        }
      }
    });
  };

  const gem = draft.providers.gemini;
  const compat = draft.providers["openai-compatible"];
  const configured = overview.system.configuredProviders;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div className="nx-admin-grid-2">
        <div className="nx-admin-card">
          <div className="nx-admin-card-head">
            <div>
              <h3>Google Gemini</h3>
              <p className="nx-field-hint">
                Server key: {configured.includes("gemini") ? "Configured" : "Not set in environment"}
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={gem.enabled}
              className={`nx-switch ${gem.enabled ? "on" : ""}`}
              onClick={() =>
                setDraft({
                  ...draft,
                  providers: { ...draft.providers, gemini: { ...gem, enabled: !gem.enabled } }
                })
              }
            >
              <span />
            </button>
          </div>

          <div className="nx-admin-field">
            <label htmlFor="prov-gem-label">Display Name</label>
            <input
              id="prov-gem-label"
              className="nx-input"
              value={gem.displayName}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  providers: { ...draft.providers, gemini: { ...gem, displayName: e.target.value } }
                })
              }
            />
          </div>

          <div className="nx-admin-form-grid">
            <div className="nx-admin-field">
              <label htmlFor="prov-gem-tts-model">TTS Model</label>
              <input
                id="prov-gem-tts-model"
                className="nx-input mono"
                value={gem.ttsModel || ""}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    providers: { ...draft.providers, gemini: { ...gem, ttsModel: e.target.value } }
                  })
                }
              />
            </div>
            <div className="nx-admin-field">
              <label htmlFor="prov-gem-tts-voice">TTS Voice</label>
              <input
                id="prov-gem-tts-voice"
                className="nx-input"
                value={gem.ttsVoice || ""}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    providers: { ...draft.providers, gemini: { ...gem, ttsVoice: e.target.value } }
                  })
                }
              />
            </div>
            <div className="nx-admin-field">
              <label htmlFor="prov-gem-img-model">Image Model</label>
              <input
                id="prov-gem-img-model"
                className="nx-input mono"
                placeholder="imagen-3.0-generate-002"
                value={gem.imageModel || ""}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    providers: { ...draft.providers, gemini: { ...gem, imageModel: e.target.value } }
                  })
                }
              />
            </div>
            <div className="nx-admin-field">
              <label htmlFor="prov-gem-timeout">Timeout (ms)</label>
              <input
                id="prov-gem-timeout"
                type="number"
                min={3000}
                max={60000}
                className="nx-input tabular"
                value={gem.timeoutMs ?? 20000}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    providers: { ...draft.providers, gemini: { ...gem, timeoutMs: Number(e.target.value) } }
                  })
                }
              />
            </div>
          </div>

          <button
            type="button"
            className="nx-secondary-btn"
            disabled={testing !== null}
            onClick={() => handleTest("gemini")}
          >
            <Activity size={15} />
            <span>{testing === "gemini" ? "Testing…" : "Test Connectivity"}</span>
          </button>
        </div>

        <div className="nx-admin-card">
          <div className="nx-admin-card-head">
            <div>
              <h3>OpenAI-Compatible Endpoint</h3>
              <p className="nx-field-hint">
                Server key: {configured.includes("openai-compatible") ? "Configured" : "Not set in environment"}
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={compat.enabled}
              className={`nx-switch ${compat.enabled ? "on" : ""}`}
              onClick={() =>
                setDraft({
                  ...draft,
                  providers: { ...draft.providers, "openai-compatible": { ...compat, enabled: !compat.enabled } }
                })
              }
            >
              <span />
            </button>
          </div>

          <div className="nx-admin-field">
            <label htmlFor="prov-compat-label">Display Name</label>
            <input
              id="prov-compat-label"
              className="nx-input"
              value={compat.displayName}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  providers: {
                    ...draft.providers,
                    "openai-compatible": { ...compat, displayName: e.target.value }
                  }
                })
              }
            />
          </div>

          <div className="nx-admin-form-grid">
            <div className="nx-admin-field">
              <label htmlFor="prov-compat-prio">Priority Order</label>
              <input
                id="prov-compat-prio"
                type="number"
                min={1}
                max={10}
                className="nx-input tabular"
                value={compat.priority}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    providers: {
                      ...draft.providers,
                      "openai-compatible": { ...compat, priority: Number(e.target.value) }
                    }
                  })
                }
              />
            </div>
            <div className="nx-admin-field">
              <label htmlFor="prov-compat-img-model">Image Model</label>
              <input
                id="prov-compat-img-model"
                className="nx-input mono"
                placeholder="gpt-image-1"
                value={compat.imageModel || ""}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    providers: {
                      ...draft.providers,
                      "openai-compatible": { ...compat, imageModel: e.target.value }
                    }
                  })
                }
              />
            </div>
          </div>

          <button
            type="button"
            className="nx-secondary-btn"
            disabled={testing !== null}
            onClick={() => handleTest("openai-compatible")}
          >
            <Activity size={15} />
            <span>{testing === "openai-compatible" ? "Testing…" : "Test Connectivity"}</span>
          </button>
        </div>
      </div>

      <div className="nx-admin-card">
        <div className="nx-admin-card-head">
          <div>
            <h3>NEXO Orchestrator — Live Provider Health & Circuit Breakers</h3>
            <p className="nx-field-hint">
              Real-time runtime metrics from NEXO v1 failover & health registry. Quota displays &ldquo;unknown&rdquo; unless the upstream API signals rate exhaustion.
            </p>
          </div>
          <button type="button" className="nx-secondary-btn" disabled={healthLoading} onClick={refreshHealth}>
            <RefreshCw size={14} />
            <span>{healthLoading ? "Checking…" : "Refresh Health"}</span>
          </button>
        </div>

        <div className="nx-table-wrap">
          <table className="nx-table">
            <thead>
              <tr>
                <th>Provider</th>
                <th>Health</th>
                <th>Circuit</th>
                <th>Avg / Recent Latency</th>
                <th>Avg TTFT</th>
                <th>Rate Limits</th>
                <th>Fallbacks</th>
                <th>Quota</th>
                <th>Last Error</th>
              </tr>
            </thead>
            <tbody>
              {healthRows.map((h) => {
                const statusClass =
                  h.status === "healthy"
                    ? "ok"
                    : h.status === "degraded" || h.status === "rate_limited"
                      ? "warn"
                      : h.status === "unavailable"
                        ? "err"
                        : "";
                return (
                  <tr key={h.providerId}>
                    <td>
                      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                        <strong>{h.displayName}</strong>
                        <span className="nx-field-hint mono">
                          {h.providerId} · {h.configured ? "Key configured" : "Not configured"}
                        </span>
                      </div>
                    </td>
                    <td>
                      <span className={`nx-status-text ${statusClass}`} style={{ textTransform: "uppercase", fontSize: 11.5 }}>
                        {h.status}
                      </span>
                    </td>
                    <td className="mono">{h.circuitState}</td>
                    <td className="tabular">
                      {h.avgLatencyMs != null ? `${h.avgLatencyMs}ms` : "—"} /{" "}
                      {h.recentLatencyMs != null ? `${h.recentLatencyMs}ms` : "—"}
                    </td>
                    <td className="tabular">{h.avgTtftMs != null ? `${h.avgTtftMs}ms` : "—"}</td>
                    <td className="tabular">{h.rateLimitHits}</td>
                    <td className="tabular">{h.fallbackTriggeredCount}</td>
                    <td className="mono">{h.quotaStatus}</td>
                    <td className="nx-field-hint">{h.lastErrorCategory || "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {testResult && (
        <div className={`nx-banner ${testResult.ok ? "info" : "error"}`}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <CheckCircle2 size={16} />
            <span>
              {testResult.provider}: {testResult.ok ? "Healthy" : "Failed"} · {testResult.latencyMs}ms ·{" "}
              {testResult.modelsFound} model(s) discovered
              {testResult.error ? ` · ${testResult.error}` : ""}
            </span>
          </div>
        </div>
      )}

      <div className="nx-admin-card">
        <div className="nx-admin-field">
          <label htmlFor="prov-fallback">Fallback Order (comma-separated free-tier model IDs)</label>
          <input
            id="prov-fallback"
            className="nx-input mono"
            value={fallbackText}
            onChange={(e) => setFallbackText(e.target.value)}
            placeholder="gemini-2.5-flash, gemini-2.5-flash-lite, gemini-2.0-flash"
          />
          <p className="nx-field-hint">
            When strict Free-Only mode is active, paid/non-free model IDs are rejected automatically. API secrets remain server-only in environment variables.
          </p>
        </div>

        <div className="nx-admin-actions-bar">
          <button type="button" className="nx-secondary-btn" disabled={saving} onClick={handleReset}>
            <RotateCcw size={15} />
            <span>Reset Defaults</span>
          </button>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              type="button"
              className="nx-secondary-btn"
              disabled={saving}
              onClick={() => {
                setDraft(overview.runtime.providerConfig);
                setFallbackText(overview.runtime.providerConfig.fallbackOrder.join(", "));
              }}
            >
              Cancel
            </button>
            <button type="button" className="nx-admin-btn-primary" disabled={saving} onClick={handleSave}>
              <Save size={15} />
              <span>{saving ? "Saving…" : "Save Provider Settings"}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function ModelsSection({ overview, token, onRefresh, onToast }: CommonProps) {
  const [overrides, setOverrides] = useState<Record<string, ModelOverride>>(overview.runtime.modelRegistry.models);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setOverrides(overview.runtime.modelRegistry.models);
  }, [overview.runtime.modelRegistry.models]);

  const setModelField = (id: string, patch: ModelOverride) => {
    setOverrides((prev) => ({
      ...prev,
      [id]: { ...(prev[id] || {}), ...patch }
    }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await adminApi.updateConfig(token, "modelRegistry", { models: overrides });
      await onRefresh();
      onToast("ok", "Model registry overrides saved.");
    } catch (e) {
      onToast("err", (e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="nx-admin-card">
      <div className="nx-admin-card-head">
        <div>
          <h2>AI Model Management</h2>
          <p className="nx-field-hint">
            Enable or disable catalog models, customize display labels, or add free-tier notes. Free-Only mode still enforces strict server guardrails.
          </p>
        </div>
        <button type="button" className="nx-secondary-btn" onClick={() => onRefresh()}>
          <RefreshCw size={14} />
          <span>Refresh Catalog</span>
        </button>
      </div>

      <div className="nx-table-wrap">
        <table className="nx-table">
          <thead>
            <tr>
              <th>Model ID</th>
              <th>Display Name</th>
              <th>Free Eligibility</th>
              <th>Order</th>
              <th>Enabled</th>
            </tr>
          </thead>
          <tbody>
            {overview.modelCatalog.map((m) => {
              const ov = overrides[m.id] || {};
              const isEnabled = ov.enabled !== false && m.enabled !== false;
              return (
                <tr key={m.id}>
                  <td>
                    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                      <span className="mono" style={{ fontWeight: 600 }}>{m.id}</span>
                      <span className="nx-field-hint">{m.provider} · {m.status}</span>
                    </div>
                  </td>
                  <td>
                    <input
                      className="nx-input"
                      style={{ minHeight: 34, padding: "4px 8px", minWidth: 160 }}
                      value={ov.displayName ?? m.name}
                      onChange={(e) => setModelField(m.id, { displayName: e.target.value })}
                    />
                  </td>
                  <td>
                    <span className={`nx-status-text ${m.freeEligible ? "ok" : "err"}`}>
                      {m.freeEligible ? "Free Eligible" : "Blocked (Paid)"}
                    </span>
                  </td>
                  <td>
                    <input
                      type="number"
                      className="nx-input tabular"
                      style={{ minHeight: 34, padding: "4px 8px", width: 76 }}
                      value={ov.sortOrder ?? 50}
                      onChange={(e) => setModelField(m.id, { sortOrder: Number(e.target.value) })}
                    />
                  </td>
                  <td>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={isEnabled}
                      className={`nx-switch ${isEnabled ? "on" : ""}`}
                      onClick={() => setModelField(m.id, { enabled: !isEnabled })}
                    >
                      <span />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="nx-admin-actions-bar">
        <span className="nx-field-hint">
          <Cpu size={14} style={{ verticalAlign: "middle", marginRight: 6 }} />
          {overview.modelCatalog.length} model(s) currently tracked.
        </span>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            type="button"
            className="nx-secondary-btn"
            disabled={saving}
            onClick={() => setOverrides(overview.runtime.modelRegistry.models)}
          >
            Cancel
          </button>
          <button type="button" className="nx-admin-btn-primary" disabled={saving} onClick={handleSave}>
            <Save size={15} />
            <span>{saving ? "Saving…" : "Save Model Registry"}</span>
          </button>
        </div>
      </div>
    </div>
  );
}

export function MaintenanceSection({ overview, token, onRefresh, onToast, onConfirm }: CommonProps) {
  const [draft, setDraft] = useState<MaintenanceConfig>(overview.runtime.maintenance);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setDraft(overview.runtime.maintenance);
  }, [overview.runtime.maintenance]);

  const applySave = async () => {
    setSaving(true);
    try {
      await adminApi.updateConfig(token, "maintenance", {
        enabled: draft.enabled,
        title: draft.title,
        message: draft.message,
        expectedReturn: draft.expectedReturn || ""
      });
      await onRefresh();
      onToast("ok", draft.enabled ? "Maintenance mode enabled for users." : "Maintenance mode disabled.");
    } catch (e) {
      onToast("err", (e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const handleSave = () => {
    if (draft.enabled !== overview.runtime.maintenance.enabled) {
      onConfirm({
        title: draft.enabled ? "Enable Maintenance Mode?" : "Disable Maintenance Mode?",
        body: draft.enabled
          ? "Regular users will see the Maintenance screen and AI endpoints will return 503. Your verified Owner Super Admin session bypasses maintenance automatically."
          : "All active users will regain normal access to NEXO AI immediately.",
        confirmLabel: draft.enabled ? "Enable Maintenance" : "Restore Normal Access",
        danger: draft.enabled,
        onConfirm: applySave
      });
      return;
    }
    void applySave();
  };

  return (
    <div className="nx-admin-card">
      <div className="nx-admin-card-head">
        <div>
          <h2>Maintenance Mode</h2>
          <p className="nx-field-hint">
            Restrict non-owner access cleanly with a custom notice. Owner Super Admin always bypasses maintenance lockouts.
          </p>
        </div>
        <Wrench size={18} color={draft.enabled ? "var(--status-warn)" : "var(--text-muted)"} />
      </div>

      <div className="nx-field-card">
        <div className="nx-field-row">
          <div>
            <span className="nx-field-label">Enable Global Maintenance Mode</span>
            <p className="nx-field-hint">Immediately blocks non-owner chat, TTS, and workspace access.</p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={draft.enabled}
            className={`nx-switch ${draft.enabled ? "on" : ""}`}
            onClick={() => setDraft({ ...draft, enabled: !draft.enabled })}
          >
            <span />
          </button>
        </div>
      </div>

      <div className="nx-admin-field">
        <label htmlFor="maint-title">Maintenance Headline</label>
        <input
          id="maint-title"
          className="nx-input"
          maxLength={100}
          value={draft.title}
          onChange={(e) => setDraft({ ...draft, title: e.target.value })}
        />
      </div>

      <div className="nx-admin-field">
        <label htmlFor="maint-msg">User-Facing Message</label>
        <textarea
          id="maint-msg"
          className="nx-textarea"
          maxLength={500}
          value={draft.message}
          onChange={(e) => setDraft({ ...draft, message: e.target.value })}
        />
      </div>

      <div className="nx-admin-field">
        <label htmlFor="maint-eta">Expected Return Time (Optional)</label>
        <input
          id="maint-eta"
          className="nx-input"
          maxLength={80}
          placeholder="e.g. Today at 18:30 UTC"
          value={draft.expectedReturn || ""}
          onChange={(e) => setDraft({ ...draft, expectedReturn: e.target.value })}
        />
      </div>

      <div className="nx-admin-actions-bar">
        <span className="nx-field-hint">
          <ShieldAlert size={14} style={{ verticalAlign: "middle", marginRight: 6 }} />
          Owner bypass is always enforced server-side.
        </span>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            type="button"
            className="nx-secondary-btn"
            disabled={saving}
            onClick={() => setDraft(overview.runtime.maintenance)}
          >
            Cancel
          </button>
          <button type="button" className="nx-admin-btn-primary" disabled={saving} onClick={handleSave}>
            <Save size={15} />
            <span>{saving ? "Saving…" : "Apply Maintenance Settings"}</span>
          </button>
        </div>
      </div>
    </div>
  );
}

const FEATURE_META: { key: FeatureKey; label: string; desc: string; unavailable?: boolean }[] = [
  { key: "chat", label: "AI Chat Generation", desc: "Core streaming text conversations across web and mobile." },
  { key: "voiceInput", label: "Voice Input (Microphone)", desc: "Speech-to-text microphone input in the composer." },
  { key: "tts", label: "Text-to-Speech Readout", desc: "Server Gemini TTS & browser fallback readout on replies." },
  { key: "jarvisMode", label: "JARVIS 3D Core & Assistant Panel", desc: "Three.js holographic orb and live audio waveform panel." },
  { key: "attachments", label: "File & Image Attachments", desc: "Upload images, code, text, and PDF documents to prompts." },
  { key: "webSearch", label: "Tavily Web Search Grounding", desc: "Requires TAVILY_API_KEY configured on the server." },
  { key: "personalMemory", label: "Personal Memory", desc: "User-curated memory notes injected into context." },
  { key: "conversationHistory", label: "Conversation History Sidebar", desc: "Saved conversation list & search across sessions." },
  {
    key: "imageGeneration",
    label: "Image Generation (NEXO Image Studio)",
    desc: "Enables real image creation and reference editing when an image-capable AI provider key is configured."
  }
];

export function FeaturesSection({ overview, token, onRefresh, onToast, onConfirm }: CommonProps) {
  const [draft, setDraft] = useState<FeatureFlags>(overview.runtime.featureFlags);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setDraft(overview.runtime.featureFlags);
  }, [overview.runtime.featureFlags]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await adminApi.updateConfig(token, "featureFlags", {
        chat: draft.chat,
        voiceInput: draft.voiceInput,
        tts: draft.tts,
        jarvisMode: draft.jarvisMode,
        attachments: draft.attachments,
        imageGeneration: draft.imageGeneration,
        webSearch: draft.webSearch,
        personalMemory: draft.personalMemory,
        conversationHistory: draft.conversationHistory
      });
      await onRefresh();
      onToast("ok", "Global feature flags saved and synced.");
    } catch (e) {
      onToast("err", (e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    onConfirm({
      title: "Reset Feature Flags?",
      body: "Restores all global feature toggles to their default NEXO AI configuration.",
      confirmLabel: "Reset Defaults",
      danger: true,
      onConfirm: async () => {
        setSaving(true);
        try {
          await adminApi.resetConfig(token, "featureFlags");
          await onRefresh();
          onToast("ok", "Feature flags restored to defaults.");
        } catch (e) {
          onToast("err", (e as Error).message);
        } finally {
          setSaving(false);
        }
      }
    });
  };

  return (
    <div className="nx-admin-card">
      <div className="nx-admin-card-head">
        <div>
          <h2>Platform Feature Management</h2>
          <p className="nx-field-hint">
            Enable or disable capabilities globally. Server environment requirements (such as Tavily API key) always take precedence.
          </p>
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {FEATURE_META.map((item) => {
          const checked = item.unavailable ? false : Boolean(draft[item.key]);
          return (
            <div key={item.key} className="nx-field-card">
              <div className="nx-field-row">
                <div style={{ minWidth: 0, flex: 1 }}>
                  <span className="nx-field-label">{item.label}</span>
                  <p className="nx-field-hint">{item.desc}</p>
                </div>
                <button
                  type="button"
                  role="switch"
                  disabled={item.unavailable}
                  aria-checked={checked}
                  className={`nx-switch ${checked ? "on" : ""}`}
                  onClick={() => setDraft({ ...draft, [item.key]: !draft[item.key] })}
                >
                  <span />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <div className="nx-admin-actions-bar">
        <button type="button" className="nx-secondary-btn" disabled={saving} onClick={handleReset}>
          <RotateCcw size={15} />
          <span>Reset Defaults</span>
        </button>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            type="button"
            className="nx-secondary-btn"
            disabled={saving}
            onClick={() => setDraft(overview.runtime.featureFlags)}
          >
            Cancel
          </button>
          <button type="button" className="nx-admin-btn-primary" disabled={saving} onClick={handleSave}>
            <Save size={15} />
            <span>{saving ? "Saving…" : "Save Feature Flags"}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
