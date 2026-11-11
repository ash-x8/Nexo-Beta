import {
  addDoc, collection, deleteDoc, doc, getDocs, onSnapshot, orderBy, query, setDoc, updateDoc, writeBatch
} from "firebase/firestore";
import { db, firebaseReady } from "./firebase";
import { sanitizePrefs, SYNCED_KEYS, type Prefs } from "./prefs";
import type { ChatMessage, Conversation, MemoryItem } from "./types";

const convCol = (uid: string) => collection(db(), `users/${uid}/conversations`);
const msgCol = (uid: string, cid: string) => collection(db(), `users/${uid}/conversations/${cid}/messages`);
const memCol = (uid: string) => collection(db(), `users/${uid}/memory`);

/** Firestore rejects `undefined`, so drop it. */
const clean = <T extends object>(o: T) => JSON.parse(JSON.stringify(o)) as T;

const isLocalMode = (uid: string) => !firebaseReady || uid === "guest-user";

// Local storage helpers
function getLocal<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function setLocal<T>(key: string, val: T): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(key, JSON.stringify(val));
  } catch {
    /* ignore storage full */
  }
}

export function subscribeConversations(uid: string, cb: (c: Conversation[]) => void, onErr: (e: Error) => void) {
  if (isLocalMode(uid)) {
    const list = getLocal<Conversation[]>(`nexo.local.convs.${uid}`, []);
    cb(list.sort((a, b) => b.updatedAt - a.updatedAt));
    // Listen for storage changes
    const handler = () => {
      const updated = getLocal<Conversation[]>(`nexo.local.convs.${uid}`, []);
      cb(updated.sort((a, b) => b.updatedAt - a.updatedAt));
    };
    window.addEventListener("nexo_convs_changed", handler);
    return () => window.removeEventListener("nexo_convs_changed", handler);
  }

  try {
    return onSnapshot(query(convCol(uid), orderBy("updatedAt", "desc")),
      (s) => cb(s.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Conversation, "id">) }))), onErr);
  } catch (e: any) {
    onErr(e);
    return () => {};
  }
}

export async function createConversation(uid: string, title: string): Promise<Conversation> {
  const now = Date.now();
  if (isLocalMode(uid)) {
    const id = crypto.randomUUID ? crypto.randomUUID() : `conv_${now}_${Math.random().toString(36).slice(2, 7)}`;
    const newConv: Conversation = { id, title, createdAt: now, updatedAt: now };
    const list = getLocal<Conversation[]>(`nexo.local.convs.${uid}`, []);
    list.unshift(newConv);
    setLocal(`nexo.local.convs.${uid}`, list);
    window.dispatchEvent(new CustomEvent("nexo_convs_changed"));
    return newConv;
  }

  const ref = await addDoc(convCol(uid), { title, createdAt: now, updatedAt: now });
  return { id: ref.id, title, createdAt: now, updatedAt: now };
}

export const renameConversation = async (uid: string, cid: string, title: string) => {
  if (isLocalMode(uid)) {
    const list = getLocal<Conversation[]>(`nexo.local.convs.${uid}`, []);
    const found = list.find((c) => c.id === cid);
    if (found) {
      found.title = title;
      found.updatedAt = Date.now();
      setLocal(`nexo.local.convs.${uid}`, list);
      window.dispatchEvent(new CustomEvent("nexo_convs_changed"));
    }
    return;
  }
  return updateDoc(doc(db(), `users/${uid}/conversations/${cid}`), { title, updatedAt: Date.now() });
};

export const touchConversation = async (uid: string, cid: string) => {
  if (isLocalMode(uid)) {
    const list = getLocal<Conversation[]>(`nexo.local.convs.${uid}`, []);
    const found = list.find((c) => c.id === cid);
    if (found) {
      found.updatedAt = Date.now();
      setLocal(`nexo.local.convs.${uid}`, list);
      window.dispatchEvent(new CustomEvent("nexo_convs_changed"));
    }
    return;
  }
  return updateDoc(doc(db(), `users/${uid}/conversations/${cid}`), { updatedAt: Date.now() });
};

export async function deleteConversation(uid: string, cid: string) {
  if (isLocalMode(uid)) {
    const list = getLocal<Conversation[]>(`nexo.local.convs.${uid}`, []).filter((c) => c.id !== cid);
    setLocal(`nexo.local.convs.${uid}`, list);
    try { localStorage.removeItem(`nexo.local.msgs.${uid}.${cid}`); } catch { /* ignore */ }
    window.dispatchEvent(new CustomEvent("nexo_convs_changed"));
    return;
  }

  const snap = await getDocs(msgCol(uid, cid));
  for (let i = 0; i < snap.docs.length; i += 400) {
    const batch = writeBatch(db());
    snap.docs.slice(i, i + 400).forEach((d) => batch.delete(d.ref));
    await batch.commit();
  }
  await deleteDoc(doc(db(), `users/${uid}/conversations/${cid}`));
}

export async function loadMessages(uid: string, cid: string): Promise<ChatMessage[]> {
  if (isLocalMode(uid)) {
    return getLocal<ChatMessage[]>(`nexo.local.msgs.${uid}.${cid}`, []);
  }

  const snap = await getDocs(query(msgCol(uid, cid), orderBy("createdAt", "asc")));
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<ChatMessage, "id">) }));
}

export const saveMessage = async (uid: string, cid: string, m: ChatMessage) => {
  if (isLocalMode(uid)) {
    const msgs = getLocal<ChatMessage[]>(`nexo.local.msgs.${uid}.${cid}`, []);
    const idx = msgs.findIndex((x) => x.id === m.id);
    const cleaned = clean({ ...m, error: undefined });
    if (idx >= 0) msgs[idx] = cleaned;
    else msgs.push(cleaned);
    setLocal(`nexo.local.msgs.${uid}.${cid}`, msgs);
    return;
  }
  return setDoc(doc(db(), `users/${uid}/conversations/${cid}/messages/${m.id}`), clean({ ...m, id: undefined, error: undefined }));
};

export const removeMessage = async (uid: string, cid: string, mid: string) => {
  if (isLocalMode(uid)) {
    const msgs = getLocal<ChatMessage[]>(`nexo.local.msgs.${uid}.${cid}`, []).filter((x) => x.id !== mid);
    setLocal(`nexo.local.msgs.${uid}.${cid}`, msgs);
    return;
  }
  return deleteDoc(doc(db(), `users/${uid}/conversations/${cid}/messages/${mid}`));
};

export function subscribeMemory(uid: string, cb: (m: MemoryItem[]) => void) {
  if (isLocalMode(uid)) {
    const list = getLocal<MemoryItem[]>(`nexo.local.mem.${uid}`, [
      { id: "mem_init", text: "Welcome to NEXO AI. You can add facts here for personalized responses.", createdAt: Date.now(), enabled: true }
    ]);
    cb(list);
    const handler = () => {
      cb(getLocal<MemoryItem[]>(`nexo.local.mem.${uid}`, []));
    };
    window.addEventListener("nexo_mem_changed", handler);
    return () => window.removeEventListener("nexo_mem_changed", handler);
  }

  try {
    return onSnapshot(query(memCol(uid), orderBy("createdAt", "asc")),
      (s) => cb(s.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<MemoryItem, "id">) }))), () => cb([]));
  } catch {
    cb([]);
    return () => {};
  }
}

export const addMemory = async (uid: string, text: string) => {
  if (isLocalMode(uid)) {
    const list = getLocal<MemoryItem[]>(`nexo.local.mem.${uid}`, []);
    const item: MemoryItem = {
      id: crypto.randomUUID ? crypto.randomUUID() : `mem_${Date.now()}`,
      text,
      createdAt: Date.now(),
      enabled: true
    };
    list.push(item);
    setLocal(`nexo.local.mem.${uid}`, list);
    window.dispatchEvent(new CustomEvent("nexo_mem_changed"));
    return;
  }
  return addDoc(memCol(uid), { text, createdAt: Date.now(), enabled: true });
};

export const updateMemory = async (uid: string, id: string, patch: { text?: string; enabled?: boolean }) => {
  if (isLocalMode(uid)) {
    const list = getLocal<MemoryItem[]>(`nexo.local.mem.${uid}`, []);
    const item = list.find((m) => m.id === id);
    if (item) {
      if (typeof patch.text === "string") item.text = patch.text;
      if (typeof patch.enabled === "boolean") item.enabled = patch.enabled;
      setLocal(`nexo.local.mem.${uid}`, list);
      window.dispatchEvent(new CustomEvent("nexo_mem_changed"));
    }
    return;
  }
  return updateDoc(doc(db(), `users/${uid}/memory/${id}`), patch);
};

export const deleteMemory = async (uid: string, id: string) => {
  if (isLocalMode(uid)) {
    const list = getLocal<MemoryItem[]>(`nexo.local.mem.${uid}`, []).filter((m) => m.id !== id);
    setLocal(`nexo.local.mem.${uid}`, list);
    window.dispatchEvent(new CustomEvent("nexo_mem_changed"));
    return;
  }
  return deleteDoc(doc(db(), `users/${uid}/memory/${id}`));
};

const prefsDoc = (uid: string) => doc(db(), `users/${uid}/settings/prefs`);

/** Live preferences from Firestore (validated). `cb(null)` when none are saved yet. */
export function subscribePrefs(uid: string, cb: (p: Partial<Prefs> | null) => void) {
  if (isLocalMode(uid)) {
    cb(getLocal<Partial<Prefs> | null>(`nexo.local.prefs.${uid}`, null));
    return () => {};
  }
  try {
    return onSnapshot(prefsDoc(uid), (s) => cb(s.exists() ? sanitizePrefs(s.data()) : null), () => cb(null));
  } catch {
    cb(null);
    return () => {};
  }
}

export function savePrefs(uid: string, p: Prefs) {
  if (isLocalMode(uid)) {
    setLocal(`nexo.local.prefs.${uid}`, p);
    return Promise.resolve();
  }
  const data: Record<string, unknown> = {};
  for (const k of SYNCED_KEYS) data[k] = p[k];
  return setDoc(prefsDoc(uid), { ...data, updatedAt: Date.now() }, { merge: true });
}
