"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/lib/auth";
import { dictionaries } from "@/lib/i18n";
import { avatarBus, type AvatarState } from "@/lib/avatarBus";
import { ApiClientError, streamChat } from "@/lib/api";
import * as store from "@/lib/store";
import { firebaseMessage } from "@/lib/errors";
import { useSpeaker } from "@/lib/useSpeaker";
import { useSpeechRecognition } from "@/lib/useSpeechRecognition";
import type { Attachment, ChatMessage, Conversation, MemoryItem, PublicConfig } from "@/lib/types";
import Sidebar from "./Sidebar";
import MessageView from "./MessageView";
import Composer from "./Composer";
import AvatarPanel from "./AvatarPanel";
import SettingsDialog from "./SettingsDialog";
import { DEFAULT_PREFS, sanitizePrefs, type Prefs } from "@/lib/prefs";
import { selectMemories } from "@/lib/memory";
import InstallButton from "./InstallButton";
import { readAttachment } from "@/lib/files";
import { promptsFor } from "@/lib/prompts";
import { useIsMobile, useKeyboardViewport } from "@/lib/useViewport";
import BottomNav, { type Tab } from "./mobile/BottomNav";
import HomeScreen from "./mobile/HomeScreen";
import ChatsScreen from "./mobile/ChatsScreen";
import ExploreScreen from "./mobile/ExploreScreen";
import { Icon } from "./mobile/icons";

const uid = () => (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2));

export default function Shell() {
  const { user, getToken, logout } = useAuth();
  const userId = user!.uid;

  const [prefs, setPrefs] = useState<Prefs>(DEFAULT_PREFS);
  const [config, setConfig] = useState<(PublicConfig & { configured: boolean }) | null>(null);
  const [convs, setConvs] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [useSearch, setUseSearch] = useState(false);
  const [memory, setMemory] = useState<MemoryItem[]>([]);
  const [menu, setMenu] = useState(false);
  const [settings, setSettings] = useState(false);
  const [online, setOnline] = useState(true);
  const [speakingId, setSpeakingId] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("home");
  const [pending, setPending] = useState<string | null>(null);
  const [seed, setSeed] = useState<Attachment[]>([]);
  const isMobile = useIsMobile();
  const kbOpen = useKeyboardViewport(!!isMobile);

  const t = dictionaries[prefs.ui];
  const abortRef = useRef<AbortController | null>(null);
  const filesRef = useRef(new Map<string, Attachment[]>());
  const activeRef = useRef<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const stickRef = useRef(true);
  activeRef.current = activeId;

  const speaker = useSpeaker(getToken, !!config?.ttsServer, prefs.voiceName);

  // ---- bootstrap: prefs, config, subscriptions
  useEffect(() => {
    try { const p = localStorage.getItem("nexo.prefs"); if (p) setPrefs({ ...DEFAULT_PREFS, ...sanitizePrefs(JSON.parse(p)) }); } catch { /* ignore */ }
    fetch("/api/config").then((r) => r.json()).then(setConfig).catch(() => {});
    setOnline(navigator.onLine);
    const on = () => setOnline(true), off = () => setOnline(false);
    window.addEventListener("online", on); window.addEventListener("offline", off);
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); };
  }, []);
  useEffect(() => { document.documentElement.lang = prefs.ui; }, [prefs.ui]);
  useEffect(() => store.subscribeConversations(userId, setConvs, (e) => setNotice(firebaseMessage(e))), [userId]);
  useEffect(() => store.subscribeMemory(userId, setMemory), [userId]);

  // Preferences: local first (instant, works offline), mirrored to Firestore so they follow the account.
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const changePrefs = (p: Prefs) => {
    setPrefs(p);
    try { localStorage.setItem("nexo.prefs", JSON.stringify(p)); } catch { /* ignore */ }
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => store.savePrefs(userId, p).catch(() => {}), 600);
  };
  useEffect(() => store.subscribePrefs(userId, (remote) => {
    if (!remote) return;
    setPrefs((cur) => {
      const merged = { ...cur, ...remote, voiceName: cur.voiceName, sidebarCollapsed: cur.sidebarCollapsed };
      if (JSON.stringify(merged) === JSON.stringify(cur)) return cur;
      try { localStorage.setItem("nexo.prefs", JSON.stringify(merged)); } catch { /* ignore */ }
      return merged;
    });
  }), [userId]);

  // Theme: "system" follows the device and updates live.
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: light)");
    const apply = () => {
      const theme = prefs.theme === "system" ? (mq.matches ? "light" : "dark") : prefs.theme;
      document.documentElement.dataset.theme = theme;
      document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.setAttribute("content", theme === "light" ? "#f4f6fb" : "#07080c"));
    };
    apply();
    if (prefs.theme !== "system") return;
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, [prefs.theme]);

  // ---- voice input (manual only)
  const sendRef = useRef<(text: string, files: Attachment[]) => void>(() => {});
  const mic = useSpeechRecognition(prefs.voiceLang, (text) => sendRef.current(text, []));

  // ---- avatar state
  const waiting = streaming && !messages.some((m, i) => i === messages.length - 1 && m.role === "assistant" && m.content);
  const avatarState: AvatarState = mic.listening ? "listening" : waiting ? "thinking" : speaker.speaking ? "speaking" : "idle";
  useEffect(() => { avatarBus.state = avatarState; }, [avatarState]);

  // ---- scrolling
  useEffect(() => { if (stickRef.current) bottomRef.current?.scrollIntoView({ block: "end" }); }, [messages]);
  const onScroll = () => {
    const el = scrollRef.current;
    if (el) stickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
  };

  // ---- core generation
  const runAssistant = useCallback(async (cid: string, history: ChatMessage[]) => {
    setNotice(null);
    const ac = new AbortController();
    abortRef.current = ac;
    setStreaming(true);
    stickRef.current = true;
    const aid = uid();
    let text = "";
    let sources: ChatMessage["sources"];
    const draft = (): ChatMessage => ({ id: aid, role: "assistant", content: text, createdAt: Date.now(), sources });
    setMessages((m) => [...m, draft()]);
    const last = history[history.length - 1];
    try {
      const payload = history.slice(-40).map((m) => ({
        role: m.role, content: m.content, attachments: m.id === last.id ? filesRef.current.get(m.id) : undefined
      }));
      const gen = streamChat({
        token: await getToken(), messages: payload, language: prefs.reply,
        memory: prefs.memoryOn ? selectMemories(memory, last.content) : [], useSearch: useSearch && !!config?.searchEnabled, model: prefs.model || undefined, signal: ac.signal
      });
      for await (const ev of gen) {
        if ("t" in ev) { text += ev.t; setMessages((m) => m.map((x) => (x.id === aid ? { ...x, content: text } : x))); }
        else if ("sources" in ev) { sources = ev.sources; setMessages((m) => m.map((x) => (x.id === aid ? { ...x, sources } : x))); }
        else if ("error" in ev) setNotice(ev.error.message);
      }
    } catch (e: any) {
      if (e?.name !== "AbortError") setNotice(e instanceof ApiClientError ? e.message : "Something went wrong. Check your connection and try again.");
    } finally {
      abortRef.current = null;
      setStreaming(false);
      const final = draft();
      if (final.content.trim()) {
        store.saveMessage(userId, cid, final).then(() => store.touchConversation(userId, cid)).catch(() => setNotice("Reply shown but could not be saved to your history."));
        if (prefs.speak && !ac.signal.aborted) { setSpeakingId(aid); speaker.speak(final.content); }
      } else {
        setMessages((m) => m.filter((x) => x.id !== aid));
      }
    }
  }, [config, getToken, memory, prefs.memoryOn, prefs.model, prefs.reply, prefs.speak, speaker, useSearch, userId]);

  const send = useCallback(async (text: string, files: Attachment[]) => {
    if (streaming || !online) return;
    speaker.stop();
    let cid = activeRef.current;
    const content = text || "(see attached file)";
    try {
      if (!cid) {
        const c = await store.createConversation(userId, content.replace(/\s+/g, " ").slice(0, 48));
        cid = c.id; setActiveId(cid); activeRef.current = cid;
      }
      const msg: ChatMessage = {
        id: uid(), role: "user", content, createdAt: Date.now(),
        attachments: files.length ? files.map((f) => ({ name: f.name, mime: f.mime })) : undefined
      };
      if (files.length) filesRef.current.set(msg.id, files);
      const next = [...messages, msg];
      setMessages(next);
      store.saveMessage(userId, cid, msg).catch((e) => setNotice(firebaseMessage(e)));
      await runAssistant(cid, next);
    } catch (e) {
      setNotice(firebaseMessage(e));
    }
  }, [messages, online, runAssistant, speaker, streaming, userId]);
  sendRef.current = send;

  useEffect(() => {
    if (pending && tab === "chat" && !activeId && messages.length === 0 && !streaming) {
      const text = pending;
      setPending(null);
      sendRef.current(text, []);
    }
  }, [pending, tab, activeId, messages.length, streaming]);

  const regenerate = useCallback(async () => {
    const cid = activeRef.current;
    if (!cid || streaming) return;
    let base = messages;
    const last = base[base.length - 1];
    if (last?.role === "assistant") {
      base = base.slice(0, -1);
      setMessages(base);
      store.removeMessage(userId, cid, last.id).catch(() => {});
    }
    if (base[base.length - 1]?.role === "user") await runAssistant(cid, base);
  }, [messages, runAssistant, streaming, userId]);

  const openConv = async (id: string) => {
    abortRef.current?.abort(); speaker.stop(); mic.cancel();
    setActiveId(id); setNotice(null); setMessages([]);
    try { setMessages(await store.loadMessages(userId, id)); stickRef.current = true; }
    catch { setNotice("Could not load this conversation."); }
  };
  const newConv = () => { abortRef.current?.abort(); speaker.stop(); mic.cancel(); setActiveId(null); setMessages([]); setNotice(null); };
  const removeConv = async (id: string) => {
    try { await store.deleteConversation(userId, id); if (id === activeId) newConv(); }
    catch { setNotice("Could not delete the conversation."); }
  };

  const toggleSidebar = () => {
    if (window.innerWidth <= 860) setMenu(true);
    else changePrefs({ ...prefs, sidebarCollapsed: !prefs.sidebarCollapsed });
  };
  useEffect(() => {
    if (isMobile) return;
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.shiftKey && e.key.toLowerCase() === "o") { e.preventDefault(); newConv(); }
      else if (mod && e.key === ",") { e.preventDefault(); setSettings(true); }
      else if (mod && e.key === "/") { e.preventDefault(); toggleSidebar(); }
      else if (e.key === "Escape" && abortRef.current) abortRef.current.abort();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // handlers are recreated each render on purpose; they only touch refs and setters
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMobile, prefs.sidebarCollapsed]);

  const lastMsg = messages[messages.length - 1];
  const canRetry = !streaming && lastMsg?.role === "user";
  const title = useMemo(() => convs.find((c) => c.id === activeId)?.title ?? t.newChat, [convs, activeId, t.newChat]);
  const micError = mic.error;

  const onSeedUsed = useCallback(() => setSeed([]), []);
  const starters = promptsFor(prefs.ui).map((g) => g.prompts[0]).slice(0, 3);
  const canSearch = !!config?.searchEnabled;

  const chatBody = (
    <>
      <div className="scroll" ref={scrollRef} onScroll={onScroll}>
        {messages.length === 0 && (isMobile ? (
          <div className="m-empty">
            <h2>{t.empty}</h2>
            <p>{t.tagline}</p>
            <ul className="m-list">
              {starters.map((q) => (
                <li key={q}><button className="m-row" onClick={() => send(q, [])}><span className="m-row-text">{q}</span><Icon name="chevron" size={18} /></button></li>
              ))}
            </ul>
          </div>
        ) : (
          <div className="hero">
            <h2>{t.empty}</h2>
            <p>{t.tagline}</p>
          </div>
        ))}
        {messages.map((m, i) => (
          <MessageView
            key={m.id} msg={m} t={t}
            streaming={streaming && i === messages.length - 1 && m.role === "assistant"}
            canRegenerate={!streaming && i === messages.length - 1 && m.role === "assistant"}
            speakingThis={speaker.speaking && speakingId === m.id}
            onRegenerate={regenerate}
            onSpeak={(txt) => { setSpeakingId(m.id); speaker.speak(txt); }}
            onStopSpeak={() => { speaker.stop(); setSpeakingId(null); }}
          />
        ))}
        <div ref={bottomRef} />
      </div>

      {(notice || micError || !online || (config && !config.configured)) && (
        <div className="notice" role="alert">
          <span>{!online ? t.offlineNote : notice || micError || t.serverNotConfigured}</span>
          {canRetry && online && notice && <button onClick={regenerate}>{t.regenerate}</button>}
          <button aria-label={t.close} onClick={() => { setNotice(null); mic.clearError(); }}>✕</button>
        </div>
      )}

      <Composer
        t={t} mobile={!!isMobile} streaming={streaming} maxChars={config?.maxInputChars ?? 8000} maxMb={config?.maxAttachmentMb ?? 4}
        allowPdf={config?.provider === "gemini"}
        searchAvailable={canSearch} useSearch={useSearch} onToggleSearch={() => setUseSearch((v) => !v)}
        micSupported={mic.supported} listening={mic.listening} interim={mic.interim}
        seed={seed} onSeedUsed={onSeedUsed}
        onMicStart={() => { speaker.stop(); mic.start(); }} onMicStop={mic.stop} onMicCancel={mic.cancel}
        onSend={send} onStop={() => abortRef.current?.abort()} onError={setNotice}
      />
    </>
  );

  if (isMobile === null) return <div className="landing"><div className="boot" aria-label="Loading" /></div>;

  // ---------------- mobile: separate, tab-based interface ----------------
  if (isMobile) {
    const startFresh = () => { newConv(); setTab("chat"); };
    const startWith = (text: string) => { newConv(); setPending(text); setTab("chat"); };
    const startVoice = () => { newConv(); setTab("chat"); mic.start(); };
    const startFiles = async (list: File[]) => {
      const ok: Attachment[] = [];
      const errs: string[] = [];
      for (const f of list) {
        try { ok.push(await readAttachment(f, config?.maxAttachmentMb ?? 4, config?.provider === "gemini")); }
        catch (e) { errs.push((e as Error).message); }
      }
      newConv();
      setSeed(ok.slice(0, 4));
      setTab("chat");
      if (errs.length) setNotice(errs.join(" "));
    };
    const openFromList = (id: string) => { setTab("chat"); void openConv(id); };
    const status = !online ? "offline" : config && !config.configured ? "unavailable" : "online";

    return (
      <div className="m-shell" data-kb={kbOpen ? "1" : "0"}>
        {tab === "home" && (
          <HomeScreen
            t={t} lang={prefs.ui} name={user!.displayName || ""} avatarOn={prefs.avatarOn} status={status}
            allowPdf={config?.provider === "gemini"} micSupported={mic.supported} convs={convs}
            onNew={startFresh} onPrompt={startWith} onOpen={openFromList} onSeeAll={() => setTab("chats")}
            onVoice={startVoice} onFiles={startFiles}
          />
        )}
        {tab === "chats" && (
          <ChatsScreen
            t={t} lang={prefs.ui} items={convs} onOpen={openFromList} onNew={startFresh}
            onRename={(id, v) => store.renameConversation(userId, id, v).catch((e) => setNotice(firebaseMessage(e)))}
            onDelete={removeConv}
          />
        )}
        {tab === "explore" && (
          <ExploreScreen
            t={t} lang={prefs.ui} searchEnabled={canSearch} pdf={config?.provider === "gemini"}
            voiceServer={!!config?.ttsServer} onPrompt={startWith}
          />
        )}
        {tab === "settings" && (
          <SettingsDialog
            variant="screen" t={t} prefs={prefs} config={config} memory={memory} getToken={getToken}
            onChange={changePrefs} onClose={() => setTab("home")}
            userName={user!.displayName || user!.email || ""} onLogout={logout}
            onAddMemory={(x) => store.addMemory(userId, x).catch(() => setNotice("Could not save memory."))}
            onUpdateMemory={(id, patch) => store.updateMemory(userId, id, patch).catch(() => setNotice("Could not update memory."))}
            onDeleteMemory={(id) => store.deleteMemory(userId, id).catch(() => {})}
          />
        )}
        {tab === "chat" && (
          <div className="m-chat">
            <header className="m-chat-head">
              <button className="m-icon-btn" onClick={() => setTab("home")} aria-label={t.back}><Icon name="back" /></button>
              <span className="m-orb" data-state={avatarState} aria-hidden="true" />
              <h1 title={title}>{title}</h1>
              {speaker.speaking && <button className="chip" onClick={() => { speaker.stop(); setSpeakingId(null); }}>{t.stopSpeaking}</button>}
              <button className="m-icon-btn" onClick={() => { newConv(); }} aria-label={t.newChat}><Icon name="plus" /></button>
            </header>
            {chatBody}
          </div>
        )}
        {tab !== "chat" && <BottomNav t={t} tab={tab} onTab={setTab} />}
      </div>
    );
  }

  // ---------------- desktop ----------------
  return (
    <div className={`shell ${prefs.sidebarCollapsed ? "collapsed" : ""}`}>
      <Sidebar
        t={t} items={convs} activeId={activeId} open={menu} userName={user!.displayName || user!.email || ""}
        onClose={() => setMenu(false)} onNew={newConv} onSelect={openConv}
        onRename={(id, v) => store.renameConversation(userId, id, v).catch((e) => setNotice(firebaseMessage(e)))}
        onDelete={removeConv} onSettings={() => setSettings(true)} onLogout={logout}
      />
      <main className="main">
        <header className="topbar">
          <button className="mini menu-btn" onClick={toggleSidebar} aria-label="Menu" title="Ctrl+/">
            <Icon name="menu" size={18} />
          </button>
          <h1 title={title}>{title}</h1>
          <InstallButton label={t.install} />
          <button className="mini" onClick={() => setSettings(true)} aria-label={t.settings} title={t.settings}>
            <Icon name="settings" size={18} />
          </button>
        </header>

        <div className="workspace">
          {prefs.avatarOn && (
            <AvatarPanel state={avatarState} speaking={speaker.speaking} source={speaker.source} onStopSpeaking={() => { speaker.stop(); setSpeakingId(null); }} info={config ? { provider: config.provider, model: prefs.model || config.model, search: config.searchEnabled } : undefined} t={t} />
          )}
          <section className="chat">{chatBody}</section>
        </div>
      </main>

      {settings && (
        <SettingsDialog
          t={t} prefs={prefs} config={config} memory={memory} getToken={getToken}
          onChange={changePrefs} onClose={() => setSettings(false)}
          userName={user!.displayName || user!.email || ""} onLogout={logout}
          onAddMemory={(x) => store.addMemory(userId, x).catch(() => setNotice("Could not save memory."))}
          onUpdateMemory={(id, patch) => store.updateMemory(userId, id, patch).catch(() => setNotice("Could not update memory."))}
            onDeleteMemory={(id) => store.deleteMemory(userId, id).catch(() => {})}
        />
      )}
    </div>
  );
}
