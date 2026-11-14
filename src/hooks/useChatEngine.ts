"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ApiClientError, consolidateMemory, generateImage, streamChat, type ImageGeneratePayload } from "@/lib/api";
import { avatarBus } from "@/lib/avatarBus";
import { firebaseMessage } from "@/lib/errors";
import { dictionaries } from "@/lib/i18n";
import { looksSensitive, MEMORY_LIMIT, selectMemories } from "@/lib/memory";
import type { Prefs } from "@/lib/prefs";
import {
  addMemory,
  assignConversationProject,
  createConversation,
  createProject as fsCreateProject,
  deleteConversation as fsDeleteConversation,
  deleteLibraryItem as fsDeleteLibraryItem,
  deleteProject as fsDeleteProject,
  loadMessages,
  removeMessage,
  removeMessagesByIds,
  renameConversation as fsRenameConversation,
  saveConversationSummary,
  saveMessage,
  saveMessageFeedback,
  saveToLibrary,
  subscribeConversations,
  subscribeLibrary,
  subscribeMemory,
  subscribeProjects,
  togglePinConversation as fsTogglePinConversation,
  touchConversation,
  updateMessageContent,
  updateMessageStatus,
  updateProject as fsUpdateProject
} from "@/lib/store";
import type {
  Attachment,
  ChatMessage,
  Conversation,
  FeatureFlags,
  GeneratedImageArtifact,
  LibraryItem,
  MemoryItem,
  NexoTaskType,
  ProjectItem,
  PublicConfig,
  Source
} from "@/lib/types";

interface UseChatEngineOpts {
  uid: string;
  getToken: () => Promise<string>;
  config: PublicConfig | null;
  features?: Partial<FeatureFlags>;
  prefs: Prefs;
  listening: boolean;
  speaking: boolean;
  paused: boolean;
  speak: (markdown: string, opts?: { onEnded?: () => void }) => Promise<void>;
  stopSpeaking: () => void;
}

const uidGen = () =>
  typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

export function applyEditedUserMessage(
  messages: ChatMessage[],
  msgId: string,
  nextContent: string,
  editedAt = Date.now()
): { kept: ChatMessage[]; removedIds: string[]; editedMsg: ChatMessage } | null {
  const idx = messages.findIndex((m) => m.id === msgId);
  if (idx < 0 || messages[idx].role !== "user") return null;
  const editedMsg: ChatMessage = {
    ...messages[idx],
    content: nextContent,
    editedAt
  };
  const kept = [...messages.slice(0, idx), editedMsg];
  const removedIds = messages.slice(idx + 1).map((m) => m.id);
  return { kept, removedIds, editedMsg };
}

export function useChatEngine({
  uid,
  getToken,
  config,
  features,
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
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [msgsLoading, setMsgsLoading] = useState(false);
  const [msgsHasMore, setMsgsHasMore] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);

  const [memory, setMemory] = useState<MemoryItem[]>([]);
  const [projects, setProjects] = useState<ProjectItem[]>([]);
  const [library, setLibrary] = useState<LibraryItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [activeCapability, setActiveCapability] = useState<NexoTaskType | null>(null);
  const [error, setError] = useState<string | null>(null);

  const activeIdRef = useRef<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const lastFilesRef = useRef<Map<string, Attachment[]>>(new Map());
  const skipNextLoadRef = useRef<string | null>(null);
  const inFlightSubmitRef = useRef(false);

  const t = dictionaries[prefs.ui];

  // Sync 3D / orbital core 5-state channel cleanly
  useEffect(() => {
    avatarBus.state = listening
      ? "listening"
      : busy
        ? "thinking"
        : speaking && !paused
          ? "speaking"
          : error
            ? "error"
            : "idle";
  }, [listening, busy, speaking, paused, error]);

  // Subscribe to conversations, memory, projects, and saved library
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
    const u3 = subscribeProjects(uid, setProjects);
    const u4 = subscribeLibrary(uid, setLibrary);
    return () => {
      u1();
      u2();
      u3();
      u4();
    };
  }, [uid, convLimit]);

  const sortedConvs = useMemo(() => {
    return [...convs].sort((a, b) => {
      const pa = a.pinned ? 1 : 0;
      const pb = b.pinned ? 1 : 0;
      if (pa !== pb) return pb - pa;
      return b.updatedAt - a.updatedAt;
    });
  }, [convs]);

  const activeConv = useMemo(
    () => convs.find((c) => c.id === activeId) || null,
    [convs, activeId]
  );

  const activeProject = useMemo(() => {
    const pid = activeConv?.projectId ?? activeProjectId;
    return pid ? projects.find((p) => p.id === pid) || null : null;
  }, [activeConv?.projectId, activeProjectId, projects]);

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

  const startNewChat = useCallback(
    (projectId?: string | null) => {
      if (busy) abortRef.current?.abort();
      activeIdRef.current = null;
      setActiveId(null);
      if (projectId !== undefined) setActiveProjectId(projectId);
      setMessages([]);
      setMsgsHasMore(false);
      setError(null);
      setActiveCapability(null);
    },
    [busy]
  );

  const selectConversation = useCallback(
    (id: string) => {
      if (id === activeIdRef.current) return;
      if (busy) abortRef.current?.abort();
      stopSpeaking();
      setError(null);
      setActiveCapability(null);
      activeIdRef.current = id;
      setActiveId(id);
    },
    [busy, stopSpeaking]
  );

  const maybeConsolidateMemory = useCallback(
    async (convId: string, fullHistory: ChatMessage[]) => {
      if (!prefs.memoryOn || features?.personalMemory === false) return;
      if (fullHistory.length < 6 || fullHistory.length % 6 !== 0) return;
      const conv = convs.find((c) => c.id === convId);
      try {
        const token = await getToken();
        const res = await consolidateMemory(token, {
          existingSummary: conv?.summary,
          existingMemories: memory.map((m) => m.text),
          messages: fullHistory.slice(-12).map((m) => ({
            role: m.role,
            content: m.content.slice(0, 2000)
          }))
        });
        if (res.summary) {
          await saveConversationSummary(uid, convId, res.summary);
        }
        if (res.extractedFacts?.length && memory.length < MEMORY_LIMIT) {
          const existingLower = new Set(memory.map((m) => m.text.trim().toLowerCase()));
          let added = 0;
          for (const fact of res.extractedFacts) {
            if (added >= 2 || memory.length + added >= MEMORY_LIMIT) break;
            if (!fact.text || looksSensitive(fact.text)) continue;
            if (existingLower.has(fact.text.trim().toLowerCase())) continue;
            await addMemory(uid, fact.text, (fact.category as MemoryItem["category"]) || "general");
            existingLower.add(fact.text.trim().toLowerCase());
            added += 1;
          }
        }
      } catch {
        /* background smart memory consolidation is best-effort */
      }
    },
    [convs, features?.personalMemory, getToken, memory, prefs.memoryOn, uid]
  );

  const runStream = useCallback(
    async (
      convId: string,
      historySnapshot: ChatMessage[],
      userMsgId: string,
      useSearch: boolean,
      opts?: { voiceTriggered?: boolean; requestId?: string; onSpeakEnded?: () => void }
    ): Promise<{ content: string; failed: boolean }> => {
      const assistantMsg: ChatMessage = {
        id: uidGen(),
        role: "assistant",
        content: "",
        createdAt: Date.now(),
        status: "streaming",
        assistantLabel: "NEXO v1"
      };

      setMessages((prev) => [...prev, assistantMsg]);
      setBusy(true);
      setError(null);
      setActiveCapability(opts?.voiceTriggered ? "voiceConversation" : "general");

      const ac = new AbortController();
      abortRef.current = ac;

      let text = "";
      let sources: Source[] | undefined;
      let capability: NexoTaskType = "general";
      let streamError: string | undefined;
      let sawDone = false;

      try {
        const token = await getToken();
        const latestQuery = historySnapshot[historySnapshot.length - 1]?.content || "";
        const memoryAllowed = features?.personalMemory !== false;
        const selectedMem = prefs.memoryOn && memoryAllowed ? selectMemories(memory, latestQuery) : [];
        const convMeta = convs.find((c) => c.id === convId);
        const projMeta = convMeta?.projectId
          ? projects.find((p) => p.id === convMeta.projectId)
          : activeProjectId
            ? projects.find((p) => p.id === activeProjectId)
            : undefined;

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
          responseTone: prefs.responseTone,
          nickname: prefs.nickname.trim() || undefined,
          customInstructions: prefs.customInstructions.trim() || undefined,
          projectInstructions: projMeta?.instructions || undefined,
          conversationSummary: convMeta?.summary || undefined,
          memory: selectedMem,
          useSearch,
          voiceTriggered: opts?.voiceTriggered,
          requestId: opts?.requestId || userMsgId,
          signal: ac.signal
        })) {
          if (activeIdRef.current !== convId) {
            ac.abort();
            return { content: text, failed: true };
          }
          if ("nexo" in ev) {
            capability = ev.nexo.capability;
            setActiveCapability(capability);
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantMsg.id ? { ...m, capability, assistantLabel: "NEXO v1" } : m
              )
            );
          } else if ("sources" in ev) {
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
          streamError = e instanceof ApiClientError ? e.message : "Connection interrupted while NEXO was responding.";
        }
      } finally {
        if (abortRef.current === ac) abortRef.current = null;
        setBusy(false);
        setActiveCapability(null);
      }

      const stoppedByUser = ac.signal.aborted && !streamError;
      const finalStatus = stoppedByUser
        ? "stopped"
        : streamError || (!text && !sawDone)
          ? "error"
          : "complete";

      if (finalStatus === "error" && !streamError && !text) {
        streamError = "NEXO could not produce a response. Please retry.";
      }

      const finalMsg: ChatMessage = {
        ...assistantMsg,
        content: text,
        sources,
        capability,
        assistantLabel: "NEXO v1",
        status: finalStatus,
        error: streamError
      };

      if (activeIdRef.current === convId) {
        setMessages((prev) => prev.map((m) => (m.id === assistantMsg.id ? finalMsg : m)));
      }

      if (streamError) {
        setError(streamError);
      }

      if (text && (finalStatus === "complete" || finalStatus === "stopped")) {
        try {
          await saveMessage(uid, convId, finalMsg);
          await touchConversation(uid, convId);
          void maybeConsolidateMemory(convId, [...historySnapshot, finalMsg]);
        } catch (e) {
          setError(firebaseMessage(e));
        }
      }

      const shouldAutoSpeak =
        finalStatus === "complete" &&
        (prefs.speak || opts?.voiceTriggered) &&
        features?.tts !== false &&
        !!text &&
        activeIdRef.current === convId;

      if (shouldAutoSpeak) {
        void speak(text, { onEnded: opts?.onSpeakEnded });
      } else if (opts?.onSpeakEnded && finalStatus === "complete") {
        opts.onSpeakEnded();
      }

      return { content: text, failed: finalStatus === "error" };
    },
    [
      uid,
      getToken,
      config,
      convs,
      projects,
      activeProjectId,
      features?.personalMemory,
      features?.tts,
      prefs,
      memory,
      speak,
      maybeConsolidateMemory
    ]
  );

  const sendMessage = useCallback(
    async (
      text: string,
      files: Attachment[],
      useSearch: boolean,
      voiceTriggered = false,
      onSpeakEnded?: () => void
    ): Promise<{ content: string; failed: boolean } | void> => {
      if (busy || inFlightSubmitRef.current) return;
      if (typeof navigator !== "undefined" && !navigator.onLine) {
        setError(t.offlineNote);
        return;
      }
      if (config && !config.configured) {
        setError(t.serverNotConfigured);
        return;
      }

      inFlightSubmitRef.current = true;
      try {
        stopSpeaking();
        setError(null);

        let convId = activeIdRef.current;
        if (!convId) {
          try {
            const title = (text || files[0]?.name || t.newChat).slice(0, 60);
            const created = await createConversation(uid, title, { projectId: activeProjectId });
            convId = created.id;
            skipNextLoadRef.current = convId;
            activeIdRef.current = convId;
            setActiveId(convId);
          } catch (e) {
            setError(firebaseMessage(e));
            return;
          }
        }

        const reqId = uidGen();
        const userMsg: ChatMessage = {
          id: reqId,
          role: "user",
          content: text,
          createdAt: Date.now(),
          status: "complete",
          requestId: reqId,
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
        return await runStream(convId, nextHistory, userMsg.id, useSearch, {
          voiceTriggered,
          requestId: reqId,
          onSpeakEnded
        });
      } finally {
        inFlightSubmitRef.current = false;
      }
    },
    [activeProjectId, busy, config, messages, runStream, stopSpeaking, t, uid]
  );

  const generateChatImage = useCallback(
    async (payload: ImageGeneratePayload): Promise<GeneratedImageArtifact | null> => {
      if (busy || inFlightSubmitRef.current) return null;
      if (typeof navigator !== "undefined" && !navigator.onLine) {
        setError(t.offlineNote);
        return null;
      }
      inFlightSubmitRef.current = true;
      stopSpeaking();
      setError(null);

      let convId = activeIdRef.current;
      if (!convId) {
        try {
          const created = await createConversation(uid, payload.prompt.slice(0, 60) || "Generated Image", {
            projectId: activeProjectId
          });
          convId = created.id;
          skipNextLoadRef.current = convId;
          activeIdRef.current = convId;
          setActiveId(convId);
        } catch (e) {
          inFlightSubmitRef.current = false;
          setError(firebaseMessage(e));
          return null;
        }
      }

      const userMsg: ChatMessage = {
        id: uidGen(),
        role: "user",
        content: `/image ${payload.prompt}`,
        createdAt: Date.now(),
        status: "complete"
      };
      const assistantMsg: ChatMessage = {
        id: uidGen(),
        role: "assistant",
        content: "",
        createdAt: Date.now() + 1,
        status: "streaming",
        capability: "imageGen",
        assistantLabel: "NEXO v1"
      };

      setMessages((prev) => [...prev, userMsg, assistantMsg]);
      setBusy(true);
      setActiveCapability("imageGen");
      saveMessage(uid, convId, userMsg).catch(() => {});

      const ac = new AbortController();
      abortRef.current = ac;

      try {
        const token = await getToken();
        const res = await generateImage(token, payload, ac.signal);
        const artifact: GeneratedImageArtifact = {
          id: uidGen(),
          prompt: payload.prompt,
          aspectRatio: res.aspectRatio,
          mimeType: res.mimeType,
          dataUrl: res.dataUrl,
          createdAt: Date.now()
        };
        const completedMsg: ChatMessage = {
          ...assistantMsg,
          content: res.revisedPrompt ? res.revisedPrompt : `Generated image for "${payload.prompt}".`,
          images: [artifact],
          status: "complete"
        };
        if (activeIdRef.current === convId) {
          setMessages((prev) => prev.map((m) => (m.id === assistantMsg.id ? completedMsg : m)));
        }
        await saveMessage(uid, convId, completedMsg).catch(() => {});
        await touchConversation(uid, convId).catch(() => {});
        return artifact;
      } catch (e: unknown) {
        const msg = e instanceof ApiClientError ? e.message : "Image generation failed.";
        setError(msg);
        if (activeIdRef.current === convId) {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantMsg.id ? { ...m, status: "error", error: msg } : m
            )
          );
        }
        return null;
      } finally {
        if (abortRef.current === ac) abortRef.current = null;
        setBusy(false);
        setActiveCapability(null);
        inFlightSubmitRef.current = false;
      }
    },
    [activeProjectId, busy, getToken, stopSpeaking, t.offlineNote, uid]
  );

  const editAndResendMessage = useCallback(
    async (msgId: string, newContent: string, useSearch: boolean) => {
      const trimmed = newContent.trim();
      if (!trimmed || busy || !activeIdRef.current) return;
      if (typeof navigator !== "undefined" && !navigator.onLine) {
        setError(t.offlineNote);
        return;
      }
      const convId = activeIdRef.current;
      const applied = applyEditedUserMessage(messages, msgId, trimmed);
      if (!applied) return;

      stopSpeaking();
      setError(null);
      setMessages(applied.kept);

      try {
        await updateMessageContent(uid, convId, applied.editedMsg.id, trimmed, applied.editedMsg.editedAt || Date.now());
        if (applied.removedIds.length) {
          await removeMessagesByIds(uid, convId, applied.removedIds);
        }
        await touchConversation(uid, convId);
      } catch (e) {
        setError(firebaseMessage(e));
      }

      if (activeIdRef.current !== convId) return;
      await runStream(convId, applied.kept, applied.editedMsg.id, useSearch, { requestId: uidGen() });
    },
    [busy, messages, stopSpeaking, t.offlineNote, uid, runStream]
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
      await runStream(convId, nextHistory, userMsg.id, useSearch, { requestId: uidGen() });
    },
    [busy, messages, t.regenNoFiles, uid, runStream]
  );

  const continueMessage = useCallback(
    async (useSearch: boolean) => {
      if (busy || !activeIdRef.current) return;
      await sendMessage("Continue your previous answer seamlessly from where you left off.", [], useSearch);
    },
    [busy, sendMessage]
  );

  const setMessageFeedback = useCallback(
    async (msgId: string, feedback: "up" | "down" | null) => {
      if (!activeIdRef.current) return;
      const convId = activeIdRef.current;
      setMessages((prev) => prev.map((m) => (m.id === msgId ? { ...m, feedback } : m)));
      await saveMessageFeedback(uid, convId, msgId, feedback).catch(() => {});
    },
    [uid]
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

  const togglePinConversation = useCallback(
    async (id: string, pinned: boolean) => {
      try {
        await fsTogglePinConversation(uid, id, pinned);
      } catch (e) {
        setError(firebaseMessage(e));
      }
    },
    [uid]
  );

  const assignToProject = useCallback(
    async (id: string, projectId: string | null) => {
      try {
        await assignConversationProject(uid, id, projectId);
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

  const saveItemToLibrary = useCallback(
    async (item: Omit<LibraryItem, "id" | "createdAt">) => {
      try {
        return await saveToLibrary(uid, item);
      } catch (e) {
        setError(firebaseMessage(e));
        return null;
      }
    },
    [uid]
  );

  const removeLibraryItem = useCallback(
    async (id: string) => {
      try {
        await fsDeleteLibraryItem(uid, id);
      } catch (e) {
        setError(firebaseMessage(e));
      }
    },
    [uid]
  );

  const createProject = useCallback(
    async (input: { name: string; description?: string; instructions?: string; color?: string }) => {
      try {
        return await fsCreateProject(uid, input);
      } catch (e) {
        setError(firebaseMessage(e));
        return null;
      }
    },
    [uid]
  );

  const updateProject = useCallback(
    async (pid: string, patch: Partial<Pick<ProjectItem, "name" | "description" | "instructions" | "color">>) => {
      try {
        await fsUpdateProject(uid, pid, patch);
      } catch (e) {
        setError(firebaseMessage(e));
      }
    },
    [uid]
  );

  const deleteProject = useCallback(
    async (pid: string) => {
      if (activeProjectId === pid) setActiveProjectId(null);
      try {
        await fsDeleteProject(uid, pid);
      } catch (e) {
        setError(firebaseMessage(e));
      }
    },
    [activeProjectId, uid]
  );

  return {
    convs: sortedConvs,
    convsHasMore,
    loadMoreConvs,
    activeId,
    activeConv,
    activeProject,
    activeProjectId,
    setActiveProjectId,
    messages,
    msgsLoading,
    msgsHasMore,
    loadOlderMessages,
    loadingOlder,
    memory,
    projects,
    library,
    busy,
    activeCapability,
    error,
    clearError: useCallback(() => setError(null), []),
    startNewChat,
    selectConversation,
    sendMessage,
    generateChatImage,
    editAndResendMessage,
    stopGeneration,
    regenerateMessage,
    continueMessage,
    setMessageFeedback,
    renameConversation,
    togglePinConversation,
    assignToProject,
    deleteConversation,
    markStoppedSaved,
    saveItemToLibrary,
    removeLibraryItem,
    createProject,
    updateProject,
    deleteProject
  };
}
