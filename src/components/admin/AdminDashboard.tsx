"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  Activity,
  ArrowLeft,
  BarChart3,
  Bot,
  Cpu,
  Database,
  FileText,
  Info,
  LayoutDashboard,
  LogOut,
  Megaphone,
  Menu,
  RefreshCw,
  Settings,
  Shield,
  Sliders,
  Users,
  Wrench,
  X
} from "lucide-react";
import { adminApi } from "@/lib/api";
import { ConfirmDialog } from "./AdminChartsAndConfirm";
import {
  FeaturesSection,
  GlobalSettingsSection,
  MaintenanceSection,
  ModelsSection,
  OverviewSection,
  ProvidersSection
} from "./AdminCoreSections";
import {
  AdminAboutSection,
  AnnouncementsSection,
  AuditLogsSection,
  DataManagementSection,
  MonitoringSection,
  SecurityCenterSection
} from "./AdminOpsSections";
import { UsersAndAnalyticsSection } from "./AdminUsersAndAnalytics";
import type { AdminOverviewResponse, AdminSectionId, ConfirmPromptState } from "./adminTypes";

interface Props {
  initialOverview: AdminOverviewResponse;
  getToken: () => Promise<string>;
  onLogout: () => Promise<void>;
}

const NAV_ITEMS: { id: AdminSectionId; label: string; icon: JSX.Element }[] = [
  { id: "overview", label: "Overview", icon: <LayoutDashboard size={16} /> },
  { id: "global", label: "Global Settings", icon: <Settings size={16} /> },
  { id: "users", label: "Users & Accounts", icon: <Users size={16} /> },
  { id: "analytics", label: "Usage Analytics", icon: <BarChart3 size={16} /> },
  { id: "providers", label: "AI Providers", icon: <Bot size={16} /> },
  { id: "models", label: "AI Models", icon: <Cpu size={16} /> },
  { id: "security", label: "Security Center", icon: <Shield size={16} /> },
  { id: "maintenance", label: "Maintenance Mode", icon: <Wrench size={16} /> },
  { id: "features", label: "Feature Flags", icon: <Sliders size={16} /> },
  { id: "monitoring", label: "System Monitoring", icon: <Activity size={16} /> },
  { id: "announcements", label: "Announcements", icon: <Megaphone size={16} /> },
  { id: "audit", label: "Audit Logs", icon: <FileText size={16} /> },
  { id: "data", label: "Data & Migrations", icon: <Database size={16} /> },
  { id: "about", label: "About & Credits", icon: <Info size={16} /> }
];

export default function AdminDashboard({ initialOverview, getToken, onLogout }: Props) {
  const [section, setSection] = useState<AdminSectionId>("overview");
  const [overview, setOverview] = useState<AdminOverviewResponse>(initialOverview);
  const [days, setDays] = useState(14);
  const [token, setToken] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [toast, setToast] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [confirmPrompt, setConfirmPrompt] = useState<ConfirmPromptState | null>(null);
  const [confirmBusy, setConfirmBusy] = useState(false);

  const showToast = useCallback((type: "ok" | "err", text: string) => {
    setToast({ type, text });
  }, []);

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 4500);
    return () => clearTimeout(id);
  }, [toast]);

  const refreshAll = useCallback(
    async (nextDays = days) => {
      setRefreshing(true);
      try {
        const freshTok = await getToken();
        setToken(freshTok);
        const data = (await adminApi.getOverview(freshTok, nextDays)) as unknown as AdminOverviewResponse;
        setOverview(data);
      } catch (e) {
        showToast("err", (e as Error).message);
      } finally {
        setRefreshing(false);
      }
    },
    [days, getToken, showToast]
  );

  useEffect(() => {
    getToken()
      .then(setToken)
      .catch(() => {});
  }, [getToken]);

  const activeNav = NAV_ITEMS.find((n) => n.id === section) || NAV_ITEMS[0];

  const handleConfirmRun = async () => {
    if (!confirmPrompt) return;
    setConfirmBusy(true);
    try {
      await confirmPrompt.onConfirm();
      setConfirmPrompt(null);
    } finally {
      setConfirmBusy(false);
    }
  };

  return (
    <div className="nx-admin-shell">
      {mobileNavOpen && (
        <div
          className="nx-admin-sidebar-backdrop"
          onClick={() => setMobileNavOpen(false)}
          aria-hidden="true"
        />
      )}

      <aside className={`nx-admin-sidebar ${mobileNavOpen ? "open" : ""}`} aria-label="Super Admin Navigation">
        <div className="nx-admin-brand">
          <div className="nx-admin-brand-title">
            <strong>{overview.runtime.globalConfig.appName || "NEXO AI"}</strong>
            <span>Owner Super Admin</span>
          </div>
          <button
            type="button"
            className="nx-tiny-btn nx-admin-mobile-toggle"
            onClick={() => setMobileNavOpen(false)}
            aria-label="Close navigation"
          >
            <X size={17} />
          </button>
        </div>

        <nav className="nx-admin-nav">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`nx-admin-nav-btn ${section === item.id ? "active" : ""}`}
              onClick={() => {
                setSection(item.id);
                setMobileNavOpen(false);
              }}
            >
              {item.icon}
              <span>{item.label}</span>
            </button>
          ))}
        </nav>

        <div className="nx-admin-sidebar-foot">
          <Link href="/" className="nx-secondary-btn" style={{ width: "100%", textDecoration: "none" }}>
            <ArrowLeft size={15} />
            <span>Back to Workspace</span>
          </Link>
          <button type="button" className="nx-danger-btn" style={{ width: "100%" }} onClick={onLogout}>
            <LogOut size={15} />
            <span>Sign Out</span>
          </button>
        </div>
      </aside>

      <div className="nx-admin-main">
        <header className="nx-admin-topbar">
          <div className="nx-admin-topbar-left">
            <button
              type="button"
              className="nx-icon-btn nx-admin-mobile-toggle"
              onClick={() => setMobileNavOpen(true)}
              aria-label="Open admin menu"
            >
              <Menu size={18} />
            </button>
            <h1>{activeNav.label}</h1>
          </div>

          <div className="nx-admin-topbar-right">
            <select
              className="nx-select"
              style={{ width: 120, minHeight: 36, padding: "4px 10px", fontSize: 13 }}
              value={days}
              onChange={(e) => {
                const next = Number(e.target.value);
                setDays(next);
                void refreshAll(next);
              }}
              aria-label="Overview time window"
            >
              <option value={7}>7 days</option>
              <option value={14}>14 days</option>
              <option value={30}>30 days</option>
            </select>

            <button
              type="button"
              className="nx-secondary-btn"
              style={{ minHeight: 36, padding: "6px 12px" }}
              disabled={refreshing}
              onClick={() => refreshAll()}
            >
              <RefreshCw size={14} />
              <span>{refreshing ? "Syncing…" : "Refresh"}</span>
            </button>
          </div>
        </header>

        <div className="nx-admin-content">
          {toast && (
            <div className={`nx-banner ${toast.type === "err" ? "error" : "info"}`} role="status">
              <span>{toast.text}</span>
              <button type="button" className="nx-banner-close" onClick={() => setToast(null)} aria-label="Dismiss">
                <X size={14} />
              </button>
            </div>
          )}

          {section === "overview" && <OverviewSection overview={overview} />}
          {section === "global" && token && (
            <GlobalSettingsSection
              overview={overview}
              token={token}
              onRefresh={() => refreshAll()}
              onToast={showToast}
              onConfirm={setConfirmPrompt}
            />
          )}
          {(section === "users" || section === "analytics") && token && (
            <UsersAndAnalyticsSection
              mode={section}
              overview={overview}
              token={token}
              onRefreshOverview={() => refreshAll()}
              onToast={showToast}
              onConfirm={setConfirmPrompt}
            />
          )}
          {section === "providers" && token && (
            <ProvidersSection
              overview={overview}
              token={token}
              onRefresh={() => refreshAll()}
              onToast={showToast}
              onConfirm={setConfirmPrompt}
            />
          )}
          {section === "models" && token && (
            <ModelsSection
              overview={overview}
              token={token}
              onRefresh={() => refreshAll()}
              onToast={showToast}
              onConfirm={setConfirmPrompt}
            />
          )}
          {section === "security" && token && <SecurityCenterSection token={token} onToast={showToast} />}
          {section === "maintenance" && token && (
            <MaintenanceSection
              overview={overview}
              token={token}
              onRefresh={() => refreshAll()}
              onToast={showToast}
              onConfirm={setConfirmPrompt}
            />
          )}
          {section === "features" && token && (
            <FeaturesSection
              overview={overview}
              token={token}
              onRefresh={() => refreshAll()}
              onToast={showToast}
              onConfirm={setConfirmPrompt}
            />
          )}
          {section === "monitoring" && <MonitoringSection overview={overview} onRefresh={() => refreshAll()} />}
          {section === "announcements" && token && (
            <AnnouncementsSection
              token={token}
              onRefresh={() => refreshAll()}
              onToast={showToast}
              onConfirm={setConfirmPrompt}
            />
          )}
          {section === "audit" && token && <AuditLogsSection token={token} onToast={showToast} />}
          {section === "data" && token && (
            <DataManagementSection
              token={token}
              onRefresh={() => refreshAll()}
              onToast={showToast}
              onConfirm={setConfirmPrompt}
            />
          )}
          {section === "about" && <AdminAboutSection overview={overview} />}
        </div>
      </div>

      <ConfirmDialog
        prompt={
          confirmPrompt
            ? {
                ...confirmPrompt,
                onConfirm: handleConfirmRun
              }
            : null
        }
        busy={confirmBusy}
        onCancel={() => !confirmBusy && setConfirmPrompt(null)}
      />
    </div>
  );
}
