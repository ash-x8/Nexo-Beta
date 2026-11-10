import {
  addDoc, collection, deleteDoc, doc, getDocs, onSnapshot, orderBy, query, setDoc, updateDoc, writeBatch
} from "firebase/firestore";
import { db } from "./firebase";
import type { ChatMessage, Conversation, MemoryItem } from "./types";

const convCol = (uid: string) => collection(db(), `users/${uid}/conversations`);
const msgCol = (uid: string, cid: string) => collection(db(), `users/${uid}/conversations/${cid}/messages`);
const memCol = (uid: string) => collection(db(), `users/${uid}/memory`);

/** Firestore rejects `undefined`, so drop it. */
const clean = <T extends object>(o: T) => JSON.parse(JSON.stringify(o)) as T;

export function subscribeConversations(uid: string, cb: (c: Conversation[]) => void, onErr: (e: Error) => void) {
  return onSnapshot(query(convCol(uid), orderBy("updatedAt", "desc")),
    (s) => cb(s.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Conversation, "id">) }))), onErr);
}

export async function createConversation(uid: string, title: string): Promise<Conversation> {
  const now = Date.now();
  const ref = await addDoc(convCol(uid), { title, createdAt: now, updatedAt: now });
  return { id: ref.id, title, createdAt: now, updatedAt: now };
}

export const renameConversation = (uid: string, cid: string, title: string) =>
  updateDoc(doc(db(), `users/${uid}/conversations/${cid}`), { title, updatedAt: Date.now() });

export const touchConversation = (uid: string, cid: string) =>
  updateDoc(doc(db(), `users/${uid}/conversations/${cid}`), { updatedAt: Date.now() });

export async function deleteConversation(uid: string, cid: string) {
  const snap = await getDocs(msgCol(uid, cid));
  for (let i = 0; i < snap.docs.length; i += 400) {
    const batch = writeBatch(db());
    snap.docs.slice(i, i + 400).forEach((d) => batch.delete(d.ref));
    await batch.commit();
  }
  await deleteDoc(doc(db(), `users/${uid}/conversations/${cid}`));
}

export async function loadMessages(uid: string, cid: string): Promise<ChatMessage[]> {
  const snap = await getDocs(query(msgCol(uid, cid), orderBy("createdAt", "asc")));
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<ChatMessage, "id">) }));
}

export const saveMessage = (uid: string, cid: string, m: ChatMessage) =>
  setDoc(doc(db(), `users/${uid}/conversations/${cid}/messages/${m.id}`), clean({ ...m, id: undefined, error: undefined }));

export const removeMessage = (uid: string, cid: string, mid: string) =>
  deleteDoc(doc(db(), `users/${uid}/conversations/${cid}/messages/${mid}`));

export function subscribeMemory(uid: string, cb: (m: MemoryItem[]) => void) {
  return onSnapshot(query(memCol(uid), orderBy("createdAt", "asc")),
    (s) => cb(s.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<MemoryItem, "id">) }))), () => cb([]));
}
export const addMemory = (uid: string, text: string) => addDoc(memCol(uid), { text, createdAt: Date.now() });
export const deleteMemory = (uid: string, id: string) => deleteDoc(doc(db(), `users/${uid}/memory/${id}`));
