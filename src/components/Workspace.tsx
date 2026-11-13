"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useChatEngine } from "@/hooks/useChatEngine";
import { usePreferences } from "@/hooks/usePreferences";
import { fetchConfig } from "@/lib/api";
import type { UserProfile } from "@/lib/auth";
import { dictionaries } from "@/lib/i18n";
import type { ChatMessage, PublicConfig } from "@/lib/types";
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

export default function Workspace({ user, getToken, onLogout }: Props) {
  const isMobile = useIsMobile();
  const online = useOnlineStatus();
  const [config, setConfig] = useState<PublicConfig | null>(null);
  const [useSearch, setUseSearch] = useState(false);
  const [speakingMsgId, setSpeakingMsgId] = useState<string | null>(null);

  const { prefs, setPref } = usePreferences(user.uid);
  const t = dictionaries[prefs.ui];

  useEffect(() => {
    fetchConfig()
      .then(setConfig)
      .catch(() => {});
  }, []);

  const speaker = useSpeaker(getToken, Boolean(config?.ttsServer), prefs.voiceName);

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
      setSpeakingMsgId(msg.id);
      speaker.speak(msg.content);
    },
    [speaker]
  );

  const sendQueueRef = useRef<((text: string) => void) | null>(null);

  const mic = useSpeechRecognition(prefs.voiceLang, (spoken) => {
    if (spoken.trim()) sendQueueRef.current?.(spoken.trim());
  });

  const engine = useChatEngine({
    uid: user.uid,
    getToken,
    config,
    prefs,
    listening: mic.listening,
    speaking: speaker.speaking,
    paused: speaker.paused,
    speak: speaker.speak,
    stopSpeaking: handleStopSpeak
  });

  sendQueueRef.current = (spoken: string) => {
    engine.sendMessage(spoken, [], useSearch);
  };

  if (isMobile === null) {
    return (
      <div className="nx-boot">
        <div className="nx-spinner" />
      </div>
    );
  }

  const shared = {
    t,
    user,
    getToken,
    onLogout,
    config,
    online,
    prefs,
    setPref,
    convs: engine.convs,
    convsHasMore: engine.convsHasMore,
    loadMoreConvs: engine.loadMoreConvs,
    activeId: engine.activeId,
    messages: engine.messages,
    msgsLoading: engine.msgsLoading,
    msgsHasMore: engine.msgsHasMore,
    loadingOlder: engine.loadingOlder,
    loadOlderMessages: engine.loadOlderMessages,
    memory: engine.memory,
    busy: engine.busy,
    error: engine.error,
    clearError: engine.clearError,
    startNewChat: engine.startNewChat,
    selectConversation: engine.selectConversation,
    sendMessage: engine.sendMessage,
    stopGeneration: engine.stopGeneration,
    regenerateMessage: engine.regenerateMessage,
    renameConversation: engine.renameConversation,
    deleteConversation: engine.deleteConversation,
    speaking: speaker.speaking,
    paused: speaker.paused,
    speakingMsgId,
    onSpeakMsg: handleSpeakMsg,
    onPauseSpeak: speaker.pause,
    onResumeSpeak: speaker.resume,
    onStopSpeak: handleStopSpeak,
    micSupported: mic.supported,
    micPermission: mic.permission,
    listening: mic.listening,
    interim: mic.interim,
    micError: mic.error,
    startMic: mic.start,
    stopMic: mic.stop,
    cancelMic: mic.cancel,
    clearMicError: mic.clearError,
    useSearch,
    setUseSearch
  };

  return isMobile ? <MobileApp {...shared} /> : <DesktopApp {...shared} />;
}
