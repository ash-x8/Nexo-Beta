"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { AlertTriangle, RefreshCw, ShieldCheck, Wrench } from "lucide-react";
import { useChatEngine } from "@/hooks/useChatEngine";
import { usePreferences } from "@/hooks/usePreferences";
import { ApiClientError, fetchConfig, fetchSession } from "@/lib/api";
import type { UserProfile } from "@/lib/auth";
import { dictionaries } from "@/lib/i18n";
import type {
  ChatMessage,
  FeatureKey,
  PublicConfig,
  SessionInfo
} from "@/lib/types";
import { useOnlineStatus } from "@/lib/useOnlineStatus";
import { useSpeaker } from "@/lib/useSpeaker";
import { useSpeechRecognition } from "@/lib/useSpeechRecognition";
import { useIsMobile } from "@/lib/useViewport";
import DesktopApp from "./desktop/DesktopApp";
import MobileApp from "./mobile/MobileApp";

interface Props {
  user: UserProfile;
  getToken: () => Promise<string>;
  onLogout: () => Promise<void>;
}

const DEFAULT_FEATURES: Record<FeatureKey, boolean> = {
  chat: true,
  voiceInput: true,
  tts: true,
  jarvisMode: true,
  attachments: true,
  imageGeneration: false,
  webSearch: false,
  personalMemory: true,
  conversationHistory: true
};

export default function Workspace({ user, getToken, onLogout }: Props) {
  const isMobile = useIsMobile();
  const online = useOnlineStatus();
  const [config, setConfig] = useState<PublicConfig | null>(null);
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [sessionError, setSessionError] = useState<{ code: string; message: string } | null>(null);
  const [useSearch, setUseSearch] = useState(false);
  const [speakingMsgId, setSpeakingMsgId] = useState<string | null>(null);
  const [dismissedAnnouncements, setDismissedAnnouncements] = useState<Record<string, boolean>>({});
  const [refreshingGate, setRefreshingGate] = useState(false);

  const [jarvisOpen, setJarvisOpen] = useState(false);
  const [voiceAppendText, setVoiceAppendText] = useState("");
  const jarvisOpenRef = useRef(false);
  jarvisOpenRef.current = jarvisOpen;

  const loadConfig = useCallback(async () => {
    try {
      const cfg = await fetchConfig();
      setConfig(cfg);
    } catch {
      /* ignore transient fetch failure */
    }
  }, []);

  const loadSession = useCallback(async () => {
    try {
      const tok = await getToken();
      const sess = await fetchSession(tok);
      setSession(sess);
      setSessionError(null);
    } catch (reason) {
      if (reason instanceof ApiClientError && reason.status === 403) {
        setSessionError({ code: reason.code, message: reason.message });
      }
    }
  }, [getToken]);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("nexo.dismissedAnnouncements") || "{}");
      if (saved && typeof saved === "object") setDismissedAnnouncements(saved);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    loadConfig();
    loadSession();

    const timer = setInterval(() => {
      loadConfig();
    }, 60_000);

    const onFocus = () => {
      loadConfig();
      loadSession();
    };
    window.addEventListener("focus", onFocus);

    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", onFocus);
    };
  }, [loadConfig, loadSession]);

  const { prefs, setPref } = usePreferences(user.uid, {
    defaultTheme: config?.defaultTheme,
    defaultLanguage: config?.defaultLanguage,
    allowLanguageSwitch: config?.allowLanguageSwitch
  });
  const t = dictionaries[prefs.ui];

  const effectiveFeatures: Record<FeatureKey, boolean> = useMemo(() => {
    return {
      ...DEFAULT_FEATURES,
      ...(config?.features || {}),
      ...(session?.effectiveFeatures || {})
    };
  }, [config?.features, session?.effectiveFeatures]);

  useEffect(() => {
    if (!effectiveFeatures.webSearch && useSearch) {
      setUseSearch(false);
    }
  }, [effectiveFeatures.webSearch, useSearch]);

  const speaker = useSpeaker(
    getToken,
    Boolean(config?.ttsServer) && effectiveFeatures.tts,
    prefs.voiceName,
    prefs.voiceSpeed
  );

  useEffect(() => {
    if (!speaker.speaking) {
      setSpeakingMsgId(null);
    }
  }, [speaker.speaking]);

  const handleStopSpeak = useCallback(() => {
    speaker.stop();
    setSpeakingMsgId(null);
  }, [speaker]);

  const handleSpeakMsg = useCallback(
    (msg: ChatMessage) => {
      if (!effectiveFeatures.tts) return;
      setSpeakingMsgId(msg.id);
      void speaker.speak(msg.content);
    },
    [effectiveFeatures.tts, speaker]
  );

  const sendQueueRef = useRef<((text: string) => void) | null>(null);
  const startMicRef = useRef<(() => void) | null>(null);

  const mic = useSpeechRecognition(
    prefs.voiceLang,
    (spoken) => {
      const trimmed = spoken.trim();
      if (!trimmed) return;
      if (jarvisOpenRef.current) {
        sendQueueRef.current?.(trimmed);
      } else {
        setVoiceAppendText(trimmed);
      }
    },
    {
      getToken,
      transcribeServer: Boolean(config?.transcribeServer)
    }
  );
  startMicRef.current = mic.start;

  const speakWithJarvisLoop = useCallback(
    (markdown: string, opts?: { onEnded?: () => void }) => {
      return speaker.speak(markdown, {
        onEnded: () => {
          opts?.onEnded?.();
          if (jarvisOpenRef.current && prefs.jarvisContinuous) {
            startMicRef.current?.();
          }
        }
      });
    },
    [prefs.jarvisContinuous, speaker]
  );

  const engine = useChatEngine({
    uid: user.uid,
    getToken,
    config,
    features: effectiveFeatures,
    prefs,
    listening: mic.listening,
    speaking: speaker.speaking,
    paused: speaker.paused,
    speak: speakWithJarvisLoop,
    stopSpeaking: handleStopSpeak
  });

  sendQueueRef.current = (spoken: string) => {
    void engine.sendMessage(spoken, [], useSearch && effectiveFeatures.webSearch, true);
  };

  const handleOpenJarvis = useCallback(() => {
    handleStopSpeak();
    setJarvisOpen(true);
    mic.start();
  }, [handleStopSpeak, mic]);

  const handleCloseJarvis = useCallback(() => {
    setJarvisOpen(false);
    mic.cancel();
    handleStopSpeak();
  }, [handleStopSpeak, mic]);

  const handleJarvisInterrupt = useCallback(() => {
    handleStopSpeak();
    mic.start();
  }, [handleStopSpeak, mic]);

  const consumedVoiceAppend = useCallback(() => {
    setVoiceAppendText("");
  }, []);

  const visibleAnnouncements: PublicConfig["announcements"] = useMemo(() => {
    return (config?.announcements || []).filter((a) => !dismissedAnnouncements[a.id]);
  }, [config?.announcements, dismissedAnnouncements]);

  const dismissAnnouncement = useCallback((id: string) => {
    setDismissedAnnouncements((prev) => {
      const next = { ...prev, [id]: true };
      try {
        localStorage.setItem("nexo.dismissedAnnouncements", JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  const refreshStatus = useCallback(async () => {
    setRefreshingGate(true);
    await Promise.all([loadConfig(), loadSession()]);
    setRefreshingGate(false);
  }, [loadConfig, loadSession]);

  if (isMobile === null) {
    return (
      <div className="nx-boot">
        <div className="nx-spinner" />
      </div>
    );
  }

  // Suspended or disabled account gate (Owner cannot self-suspend)
  if (
    (session && session.status !== "active" && !session.isOwner) ||
    sessionError?.code === "account_suspended" ||
    sessionError?.code === "registration_closed"
  ) {
    const isRegClosed = sessionError?.code === "registration_closed";
    return (
      <main className="nx-auth-shell">
        <div className="nx-auth-card">
          <AlertTriangle size={36} color="var(--status-warn)" />
          <h1 className="nx-auth-title" style={{ fontSize: 22 }}>
            {isRegClosed ? "Registration Paused" : t.suspendedTitle}
          </h1>
          <p className="nx-auth-sub">
            {session?.suspendedReason || sessionError?.message || t.suspendedDefaultBody}
          </p>
          <div style={{ display: "flex", gap: 10, width: "100%" }}>
            <button type="button" className="nx-secondary-btn" style={{ flex: 1 }} onClick={refreshStatus} disabled={refreshingGate}>
              <RefreshCw size={15} />
              <span>{refreshingGate ? t.loading : "Refresh"}</span>
            </button>
            <button type="button" className="nx-danger-btn" style={{ flex: 1 }} onClick={onLogout}>
              <span>{t.signOut}</span>
            </button>
          </div>
        </div>
      </main>
    );
  }

  // Maintenance gate for regular users; Owner Super Admin bypasses automatically
  if (config?.maintenance?.enabled && !session?.isOwner) {
    return (
      <main className="nx-auth-shell">
        <div className="nx-auth-card">
          <Wrench size={36} color="var(--accent-blue)" />
          <h1 className="nx-auth-title" style={{ fontSize: 22 }}>
            {config.maintenance.title || t.maintenanceTitle}
          </h1>
          <p className="nx-auth-sub">{config.maintenance.message}</p>
          {config.maintenance.expectedReturn && (
            <div className="nx-setup-box">
              <strong>Estimated Return</strong>
              <span>{config.maintenance.expectedReturn}</span>
            </div>
          )}
          <div style={{ display: "flex", gap: 10, width: "100%" }}>
            <button type="button" className="nx-secondary-btn" style={{ flex: 1 }} onClick={refreshStatus} disabled={refreshingGate}>
              <RefreshCw size={15} />
              <span>{refreshingGate ? t.loading : "Check Status"}</span>
            </button>
            <button type="button" className="nx-secondary-btn" style={{ flex: 1 }} onClick={onLogout}>
              <span>{t.signOut}</span>
            </button>
          </div>
        </div>
      </main>
    );
  }

  const ownerMaintenanceBanner =
    config?.maintenance?.enabled && session?.isOwner ? (
      <div className="nx-banner maintenance">
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <ShieldCheck size={16} />
          <span>{t.maintenanceBypassNote}</span>
        </div>
        <Link href="/admin" className="nx-secondary-btn" style={{ minHeight: 30, padding: "4px 10px" }}>
          {t.adminCenter}
        </Link>
      </div>
    ) : null;

  const shared = {
    t,
    user,
    getToken,
    onLogout,
    config,
    session,
    features: effectiveFeatures,
    announcements: visibleAnnouncements,
    onDismissAnnouncement: dismissAnnouncement,
    ownerMaintenanceBanner,
    online,
    prefs,
    setPref,
    convs: engine.convs,
    convsHasMore: engine.convsHasMore,
    loadMoreConvs: engine.loadMoreConvs,
    activeId: engine.activeId,
    activeProject: engine.activeProject,
    activeProjectId: engine.activeProjectId,
    setActiveProjectId: engine.setActiveProjectId,
    projects: engine.projects,
    library: engine.library,
    messages: engine.messages,
    msgsLoading: engine.msgsLoading,
    msgsHasMore: engine.msgsHasMore,
    loadingOlder: engine.loadingOlder,
    loadOlderMessages: engine.loadOlderMessages,
    memory: engine.memory,
    busy: engine.busy,
    activeCapability: engine.activeCapability,
    error: engine.error,
    clearError: engine.clearError,
    startNewChat: engine.startNewChat,
    selectConversation: engine.selectConversation,
    sendMessage: engine.sendMessage,
    editAndResendMessage: engine.editAndResendMessage,
    stopGeneration: engine.stopGeneration,
    regenerateMessage: engine.regenerateMessage,
    continueMessage: engine.continueMessage,
    setMessageFeedback: engine.setMessageFeedback,
    renameConversation: engine.renameConversation,
    togglePinConversation: engine.togglePinConversation,
    assignToProject: engine.assignToProject,
    deleteConversation: engine.deleteConversation,
    saveItemToLibrary: engine.saveItemToLibrary,
    removeLibraryItem: engine.removeLibraryItem,
    createProject: engine.createProject,
    updateProject: engine.updateProject,
    deleteProject: engine.deleteProject,
    speaking: speaker.speaking,
    paused: speaker.paused,
    speakingMsgId,
    onSpeakMsg: handleSpeakMsg,
    onPauseSpeak: speaker.pause,
    onResumeSpeak: speaker.resume,
    onStopSpeak: handleStopSpeak,
    micSupported: mic.supported && effectiveFeatures.voiceInput,
    micPermission: mic.permission,
    listening: mic.listening,
    transcribing: mic.transcribing,
    detectedLanguage: mic.detectedLanguage,
    interim: mic.interim,
    micError: mic.error,
    startMic: mic.start,
    stopMic: mic.stop,
    cancelMic: mic.cancel,
    clearMicError: mic.clearError,
    voiceAppendText,
    onConsumedVoiceAppend: consumedVoiceAppend,
    jarvisOpen,
    onOpenJarvis: handleOpenJarvis,
    onCloseJarvis: handleCloseJarvis,
    onJarvisInterrupt: handleJarvisInterrupt,
    useSearch: useSearch && effectiveFeatures.webSearch,
    setUseSearch
  };

  return isMobile ? <MobileApp {...shared} /> : <DesktopApp {...shared} />;
}
