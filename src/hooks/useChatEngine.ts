"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { ApiClientError, streamChat } from "@/lib/api";
import { avatarBus } from "@/lib/avatarBus";
import { firebaseMessage } from "@/lib/errors";
import { dictionaries } from "@/lib/i18n";
import { selectMemories } from "@/lib/memory";
import type { Prefs } from "@/lib/prefs";
import {
  createConversation,
  deleteConversation as fsDeleteConversation,
  loadMessages,
  removeMessage,
  renameConversation as fsRenameConversation,
  saveMessage,
  subscribeConversations,
  subscribeMemory,
  touchConversation,
  updateMessageStatus
} from "@/lib/store";
import type { Attachment, ChatMessage, Conversation, MemoryItem, PublicConfig, Source } from "@/lib/types";

interface UseChatEngineOpts {
  uid: string;
  getToken: () => Promise<string>;
  config: PublicConfig | null;
  prefs: Prefs;
  listening: boolean;
  speaking: boolean;
  paused: boolean;
  speak: (markdown: string) => Promise<void>;
  stopSpeaking: () => void;
}

const uidGen = () =>
  typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

export function useChatEngine({
  uid,
  getToken,
  config,
  prefs,
  listening,
  speaking,
  paused,
  speak,
  stopSpeaking
}: UseChatEngineOpts) {
  const [convs, setConvs] = useState<Conversation[]>([]);
  const [convLimit, setConvLimit] = useState(30);
  const [convsHasMore, setConvsHasMore] = useState(false);

  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [msgsLoading, setMsgsLoading] = useState(false);
  const [msgsHasMore, setMsgsHasMore] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);

  const [memory, setMemory] = useState<MemoryItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const activeIdRef = useRef<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const lastFilesRef = useRef<Map<string, Attachment[]>>(new Map());
  const skipNextLoadRef = useRef<string | null>(null);

  const t = dictionaries[prefs.ui];

  // Sync 3D / orbital core state without causing unnecessary renders
  useEffect(() => {
    avatarBus.state = listening
      ? "listening"
      : busy
        ? "thinking"
        : speaking && !paused
          ? "speaking"
          : "idle";
  }, [listening, busy, speaking, paused]);

  // Subscribe to conversations (paginated) & memory
  useEffect(() => {
    const u1 = subscribeConversations(
      uid,
      convLimit,
      (list, hasMore) => {
        setConvs(list);
        setConvsHasMore(hasMore);
      },
      (e) => setError(firebaseMessage(e))
    );
    const u2 = subscribeMemory(uid, setMemory);
    return () => {
      u1();
      u2();
    };
  }, [uid, convLimit]);

  const loadMoreConvs = useCallback(() => {
    setConvLimit((prev) => prev + 30);
  }, []);

  // Load initial page of messages whenever activeId changes
  useEffect(() => {
    activeIdRef.current = activeId;
    if (!activeId) {
      setMessages([]);
      setMsgsHasMore(false);
      setMsgsLoading(false);
      return;
    }
    if (skipNextLoadRef.current === activeId) {
      skipNextLoadRef.current = null;
      return;
    }

    let cancelled = false;
    setMsgsLoading(true);
    setMsgsHasMore(false);

    loadMessages(uid, activeId, 60)
      .then(({ messages: loaded, hasMore }) => {
        if (cancelled || activeIdRef.current !== activeId) return;
        setMessages(loaded);
        setMsgsHasMore(hasMore);
      })
      .catch((e) => {
        if (!cancelled) setError(firebaseMessage(e));
      })
      .finally(() => {
        if (!cancelled) setMsgsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [uid, activeId]);

  const loadOlderMessages = useCallback(async () => {
    if (!activeId || loadingOlder || !msgsHasMore || messages.length === 0) return;
    const oldest = messages[0];
    if (!oldest) return;

    setLoadingOlder(true);
    try {
      const { messages: older, hasMore } = await loadMessages(uid, activeId, 60, oldest.createdAt);
      if (activeIdRef.current !== activeId) return;
      setMessages((prev) => {
        const existing = new Set(prev.map((m) => m.id));
        const uniqueOlder = older.filter((m) => !existing.has(m.id));
        return [...uniqueOlder, ...prev];
      });
      setMsgsHasMore(hasMore);
    } catch (e) {
      setError(firebaseMessage(e));
    } finally {
      setLoadingOlder(false);
    }
  }, [uid, activeId, loadingOlder, msgsHasMore, messages]);

  const stopGeneration = useCallback(() => {
    abortRef.current?.abort();
    stopSpeaking();
  }, [stopSpeaking]);

  const startNewChat = useCallback(() => {
    if (busy) abortRef.current?.abort();
    activeIdRef.current = null;
    setActiveId(null);
    setMessages([]);
    setMsgsHasMore(false);
    setError(null);
  }, [busy]);

  const selectConversation = useCallback(
    (id: string) => {
      if (id === activeIdRef.current) return;
      if (busy) abortRef.current?.abort();
      stopSpeaking();
      setError(null);
      activeIdRef.current = id;
      setActiveId(id);
    },
    [busy, stopSpeaking]
  );

  const runStream = useCallback(
    async (
      convId: string,
      historySnapshot: ChatMessage[],
      userMsgId: string,
      useSearch: boolean
    ) => {
      const assistantMsg: ChatMessage = {
        id: uidGen(),
        role: "assistant",
        content: "",
        createdAt: Date.now(),
        status: "streaming"
      };

      setMessages((prev) => [...prev, assistantMsg]);
      setBusy(true);
      setError(null);

      const ac = new AbortController();
      abortRef.current = ac;

      let text = "";
      let sources: Source[] | undefined;
      let streamError: string | undefined;
      let sawDone = false;

      try {
        const token = await getToken();
        const latestQuery = historySnapshot[historySnapshot.length - 1]?.content || "";
        const selectedMem = prefs.memoryOn ? selectMemories(memory, latestQuery) : [];

        const payloadMsgs = historySnapshot
          .slice(-(config?.maxHistoryMessages || 24))
          .map((m) => ({
            role: m.role,
            content: m.content,
            attachments: m.id === userMsgId ? lastFilesRef.current.get(m.id) : undefined
          }));

        for await (const ev of streamChat({
          token,
          messages: payloadMsgs,
          language: prefs.reply,
          responseStyle: prefs.responseStyle,
          nickname: prefs.nickname.trim() || undefined,
          customInstructions: prefs.customInstructions.trim() || undefined,
          memory: selectedMem,
          useSearch,
          model: prefs.model || undefined,
          signal: ac.signal
        })) {
          if (activeIdRef.current !== convId) {
            ac.abort();
            return;
          }
          if ("sources" in ev) {
            sources = ev.sources;
            setMessages((prev) =>
              prev.map((m) => (m.id === assistantMsg.id ? { ...m, sources } : m))
            );
          } else if ("t" in ev) {
            text += ev.t;
            setMessages((prev) =>
              prev.map((m) => (m.id === assistantMsg.id ? { ...m, content: text } : m))
            );
          } else if ("done" in ev) {
            sawDone = true;
          } else if ("error" in ev) {
            streamError = ev.error.message;
          }
        }
      } catch (e: unknown) {
        if ((e as { name?: string })?.name !== "AbortError") {
          streamError = e instanceof ApiClientError ? e.message : "Connection lost while generating.";
        }
      } finally {
        if (abortRef.current === ac) abortRef.current = null;
        setBusy(false);
      }

      const stoppedByUser = ac.signal.aborted && !streamError;
      const finalStatus = stoppedByUser
        ? "stopped"
        : streamError || (!text && !sawDone)
          ? "error"
          : "complete";

      if (finalStatus === "error" && !streamError && !text) {
        streamError = "No response received from the AI.";
      }

      if (activeIdRef.current === convId) {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMsg.id
              ? { ...m, content: text, sources, status: finalStatus, error: streamError }
              : m
          )
        );
      }

      if (streamError) {
        setError(streamError);
      }

      // Persist completed or partial user-stopped content cleanly to Firestore
      if (text && (finalStatus === "complete" || finalStatus === "stopped")) {
        const finalMsg: ChatMessage = {
          ...assistantMsg,
          content: text,
          sources,
          status: finalStatus
        };
        try {
          await saveMessage(uid, convId, finalMsg);
          await touchConversation(uid, convId);
        } catch (e) {
          setError(firebaseMessage(e));
        }
      }

      if (finalStatus === "complete" && prefs.speak && text && activeIdRef.current === convId) {
        speak(text);
      }
    },
    [uid, getToken, config, prefs, memory, speak]
  );

  const sendMessage = useCallback(
    async (text: string, files: Attachment[], useSearch: boolean) => {
      if (busy) return;
      if (typeof navigator !== "undefined" && !navigator.onLine) {
        setError(t.offlineNote);
        return;
      }
      if (config && !config.configured) {
        setError(t.serverNotConfigured);
        return;
      }

      stopSpeaking();
      setError(null);

      let convId = activeIdRef.current;
      if (!convId) {
        try {
          const title = (text || files[0]?.name || t.newChat).slice(0, 60);
          const created = await createConversation(uid, title);
          convId = created.id;
          skipNextLoadRef.current = convId;
          activeIdRef.current = convId;
          setActiveId(convId);
        } catch (e) {
          setError(firebaseMessage(e));
          return;
        }
      }

      const userMsg: ChatMessage = {
        id: uidGen(),
        role: "user",
        content: text,
        createdAt: Date.now(),
        status: "complete",
        attachments: files.length
          ? files.map((f) => ({ name: f.name, mime: f.mime, size: f.size }))
          : undefined
      };

      if (files.length) {
        lastFilesRef.current.set(userMsg.id, files);
        if (lastFilesRef.current.size > 10) {
          const oldestKey = lastFilesRef.current.keys().next().value;
          if (oldestKey) lastFilesRef.current.delete(oldestKey);
        }
      }

      const nextHistory = [...messages, userMsg];
      setMessages(nextHistory);

      try {
        await saveMessage(uid, convId, userMsg);
        await touchConversation(uid, convId);
      } catch (e) {
        setError(firebaseMessage(e));
      }

      if (activeIdRef.current !== convId) return;
      await runStream(convId, nextHistory, userMsg.id, useSearch);
    },
    [busy, config, messages, stopSpeaking, t, uid, runStream]
  );

  const regenerateMessage = useCallback(
    async (msgId: string, useSearch: boolean) => {
      if (busy || !activeIdRef.current) return;
      const convId = activeIdRef.current;
      const idx = messages.findIndex((m) => m.id === msgId);
      if (idx < 0) return;

      let sliceEnd = idx;
      let userMsg: ChatMessage | undefined;
      for (let i = idx - 1; i >= 0; i--) {
        if (messages[i].role === "user") {
          userMsg = messages[i];
          sliceEnd = idx;
          break;
        }
      }
      if (!userMsg) return;

      if (userMsg.attachments?.length && !lastFilesRef.current.has(userMsg.id)) {
        setError(t.regenNoFiles);
      }

      const target = messages[idx];
      if (target.role === "assistant" && target.content) {
        removeMessage(uid, convId, target.id).catch(() => {});
      }

      const nextHistory = messages.slice(0, sliceEnd);
      setMessages(nextHistory);
      await runStream(convId, nextHistory, userMsg.id, useSearch);
    },
    [busy, messages, t.regenNoFiles, uid, runStream]
  );

  const renameConversation = useCallback(
    async (id: string, title: string) => {
      try {
        await fsRenameConversation(uid, id, title);
      } catch (e) {
        setError(firebaseMessage(e));
      }
    },
    [uid]
  );

  const deleteConversation = useCallback(
    async (id: string) => {
      if (id === activeIdRef.current) {
        if (busy) abortRef.current?.abort();
        stopSpeaking();
        activeIdRef.current = null;
        setActiveId(null);
        setMessages([]);
        setMsgsHasMore(false);
      }
      try {
        await fsDeleteConversation(uid, id);
      } catch (e) {
        setError(firebaseMessage(e));
      }
    },
    [busy, stopSpeaking, uid]
  );

  const markStoppedSaved = useCallback(
    (msgId: string, content: string) => {
      if (!activeIdRef.current) return;
      updateMessageStatus(uid, activeIdRef.current, msgId, "stopped", content).catch(() => {});
    },
    [uid]
  );

  return {
    convs,
    convsHasMore,
    loadMoreConvs,
    activeId,
    messages,
    msgsLoading,
    msgsHasMore,
    loadOlderMessages,
    loadingOlder,
    memory,
    busy,
    error,
    clearError: useCallback(() => setError(null), []),
    startNewChat,
    selectConversation,
    sendMessage,
    stopGeneration,
    regenerateMessage,
    renameConversation,
    deleteConversation,
    markStoppedSaved
  };
}
