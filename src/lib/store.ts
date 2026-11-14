import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  updateDoc,
  where,
  writeBatch
} from "firebase/firestore";
import { db, firebaseReady } from "./firebase";
import { sanitizePrefs, SYNCED_KEYS, type Prefs } from "./prefs";
import type {
  ChatMessage,
  Conversation,
  LibraryItem,
  MemoryItem,
  MessageStatus,
  ProjectItem
} from "./types";
import type { UserProfile } from "./auth";

const userDoc = (uid: string) => doc(db(), `users/${uid}`);
const convCol = (uid: string) => collection(db(), `users/${uid}/conversations`);
const msgCol = (uid: string, cid: string) => collection(db(), `users/${uid}/conversations/${cid}/messages`);
const memCol = (uid: string) => collection(db(), `users/${uid}/memory`);
const projCol = (uid: string) => collection(db(), `users/${uid}/projects`);
const libCol = (uid: string) => collection(db(), `users/${uid}/library`);
const prefsDoc = (uid: string) => doc(db(), `users/${uid}/settings/prefs`);

/** Firestore rejects `undefined` values, so strip them cleanly. */
const clean = <T extends object>(o: T) => JSON.parse(JSON.stringify(o)) as T;

export async function saveUserProfile(user: UserProfile): Promise<void> {
  if (!firebaseReady) return;
  await setDoc(
    userDoc(user.uid),
    clean({
      displayName: (user.displayName || "").slice(0, 120),
      email: (user.email || "").slice(0, 200),
      photoURL: (user.photoURL || "").slice(0, 500),
      updatedAt: Date.now()
    }),
    { merge: true }
  );
}

export function subscribeConversations(
  uid: string,
  pageLimit: number,
  cb: (c: Conversation[], hasMore: boolean) => void,
  onErr: (e: Error) => void
) {
  if (!firebaseReady) {
    cb([], false);
    return () => {};
  }
  try {
    const q = query(convCol(uid), orderBy("updatedAt", "desc"), limit(pageLimit + 1));
    return onSnapshot(
      q,
      (snap) => {
        const docs = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<Conversation, "id">)
        }));
        const hasMore = docs.length > pageLimit;
        cb(hasMore ? docs.slice(0, pageLimit) : docs, hasMore);
      },
      onErr
    );
  } catch (e: unknown) {
    onErr(e as Error);
    return () => {};
  }
}

export async function createConversation(
  uid: string,
  title: string,
  opts?: { projectId?: string | null }
): Promise<Conversation> {
  const now = Date.now();
  const safeTitle = title.trim().slice(0, 120) || "New conversation";
  const payload = clean({
    title: safeTitle,
    createdAt: now,
    updatedAt: now,
    pinned: false,
    projectId: opts?.projectId ?? null
  });
  const ref = await addDoc(convCol(uid), payload);
  return { id: ref.id, ...payload };
}

export async function renameConversation(uid: string, cid: string, title: string): Promise<void> {
  const safeTitle = title.trim().slice(0, 120);
  if (!safeTitle) return;
  await updateDoc(doc(db(), `users/${uid}/conversations/${cid}`), {
    title: safeTitle,
    updatedAt: Date.now()
  });
}

export async function togglePinConversation(uid: string, cid: string, pinned: boolean): Promise<void> {
  await updateDoc(doc(db(), `users/${uid}/conversations/${cid}`), {
    pinned,
    updatedAt: Date.now()
  });
}

export async function assignConversationProject(uid: string, cid: string, projectId: string | null): Promise<void> {
  await updateDoc(doc(db(), `users/${uid}/conversations/${cid}`), {
    projectId: projectId ? projectId.slice(0, 120) : null,
    updatedAt: Date.now()
  });
}

export async function saveConversationSummary(uid: string, cid: string, summary: string): Promise<void> {
  const safe = summary.trim().slice(0, 3800);
  if (!safe) return;
  await updateDoc(doc(db(), `users/${uid}/conversations/${cid}`), {
    summary: safe,
    summaryUpdatedAt: Date.now()
  });
}

export async function touchConversation(uid: string, cid: string): Promise<void> {
  await updateDoc(doc(db(), `users/${uid}/conversations/${cid}`), { updatedAt: Date.now() });
}

export async function deleteConversation(uid: string, cid: string): Promise<void> {
  const snap = await getDocs(msgCol(uid, cid));
  for (let i = 0; i < snap.docs.length; i += 400) {
    const batch = writeBatch(db());
    snap.docs.slice(i, i + 400).forEach((d) => batch.delete(d.ref));
    await batch.commit();
  }
  await deleteDoc(doc(db(), `users/${uid}/conversations/${cid}`));
}

export async function loadMessages(
  uid: string,
  cid: string,
  pageSize = 60,
  beforeMs?: number
): Promise<{ messages: ChatMessage[]; hasMore: boolean }> {
  if (!firebaseReady) return { messages: [], hasMore: false };
  const q =
    typeof beforeMs === "number"
      ? query(msgCol(uid, cid), where("createdAt", "<", beforeMs), orderBy("createdAt", "desc"), limit(pageSize + 1))
      : query(msgCol(uid, cid), orderBy("createdAt", "desc"), limit(pageSize + 1));

  const snap = await getDocs(q);
  const hasMore = snap.docs.length > pageSize;
  const sliced = hasMore ? snap.docs.slice(0, pageSize) : snap.docs;
  const messages = sliced
    .map((d) => ({ id: d.id, ...(d.data() as Omit<ChatMessage, "id">) }))
    .reverse();

  return { messages, hasMore };
}

export async function saveMessage(uid: string, cid: string, m: ChatMessage): Promise<void> {
  // Keep document cleanly below Firestore 1MB cap even when an image artifact is attached
  const safeImages = m.images?.filter((img) => img.dataUrl.length <= 750_000).slice(0, 2);
  const payload = clean({
    role: m.role,
    content: m.content.slice(0, 100000),
    createdAt: m.createdAt,
    editedAt: m.editedAt,
    status: m.status || "complete",
    attachments: m.attachments,
    sources: m.sources,
    images: safeImages?.length ? safeImages : undefined,
    feedback: m.feedback,
    capability: m.capability,
    assistantLabel: m.assistantLabel
  });
  await setDoc(doc(db(), `users/${uid}/conversations/${cid}/messages/${m.id}`), payload);
}

export async function updateMessageContent(
  uid: string,
  cid: string,
  mid: string,
  content: string,
  editedAt: number
): Promise<void> {
  await updateDoc(doc(db(), `users/${uid}/conversations/${cid}/messages/${mid}`), {
    content: content.slice(0, 100000),
    editedAt
  });
}

export async function saveMessageFeedback(
  uid: string,
  cid: string,
  mid: string,
  feedback: "up" | "down" | null
): Promise<void> {
  await updateDoc(doc(db(), `users/${uid}/conversations/${cid}/messages/${mid}`), {
    feedback
  });
}

export async function updateMessageStatus(
  uid: string,
  cid: string,
  mid: string,
  status: MessageStatus,
  content?: string
): Promise<void> {
  const patch: Record<string, unknown> = { status };
  if (typeof content === "string") patch.content = content.slice(0, 100000);
  await updateDoc(doc(db(), `users/${uid}/conversations/${cid}/messages/${mid}`), patch);
}

export async function removeMessage(uid: string, cid: string, mid: string): Promise<void> {
  await deleteDoc(doc(db(), `users/${uid}/conversations/${cid}/messages/${mid}`));
}

export async function removeMessagesByIds(uid: string, cid: string, mids: string[]): Promise<void> {
  if (!firebaseReady || mids.length === 0) return;
  for (let i = 0; i < mids.length; i += 400) {
    const batch = writeBatch(db());
    mids.slice(i, i + 400).forEach((mid) => {
      batch.delete(doc(db(), `users/${uid}/conversations/${cid}/messages/${mid}`));
    });
    await batch.commit();
  }
}

export function subscribeMemory(uid: string, cb: (m: MemoryItem[]) => void) {
  if (!firebaseReady) {
    cb([]);
    return () => {};
  }
  try {
    return onSnapshot(
      query(memCol(uid), orderBy("createdAt", "asc")),
      (s) => cb(s.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<MemoryItem, "id">) }))),
      () => cb([])
    );
  } catch {
    cb([]);
    return () => {};
  }
}

export async function addMemory(
  uid: string,
  text: string,
  category: MemoryItem["category"] = "general"
) {
  return addDoc(memCol(uid), {
    text: text.slice(0, 300),
    category: category.slice(0, 40),
    createdAt: Date.now(),
    enabled: true
  });
}

export async function updateMemory(uid: string, id: string, patch: { text?: string; enabled?: boolean }) {
  const safe: { text?: string; enabled?: boolean } = {};
  if (typeof patch.text === "string") safe.text = patch.text.slice(0, 300);
  if (typeof patch.enabled === "boolean") safe.enabled = patch.enabled;
  return updateDoc(doc(db(), `users/${uid}/memory/${id}`), safe);
}

export async function deleteMemory(uid: string, id: string) {
  return deleteDoc(doc(db(), `users/${uid}/memory/${id}`));
}

/* ── Workspace Projects ───────────────────────────────────────────────── */

export function subscribeProjects(uid: string, cb: (items: ProjectItem[]) => void) {
  if (!firebaseReady) {
    cb([]);
    return () => {};
  }
  try {
    return onSnapshot(
      query(projCol(uid), orderBy("updatedAt", "desc")),
      (s) => cb(s.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<ProjectItem, "id">) }))),
      () => cb([])
    );
  } catch {
    cb([]);
    return () => {};
  }
}

export async function createProject(
  uid: string,
  input: { name: string; description?: string; instructions?: string; color?: string }
): Promise<ProjectItem> {
  const now = Date.now();
  const payload = clean({
    name: input.name.trim().slice(0, 100) || "Untitled project",
    description: (input.description || "").trim().slice(0, 400),
    instructions: (input.instructions || "").trim().slice(0, 1200),
    color: input.color || "teal",
    createdAt: now,
    updatedAt: now
  });
  const ref = await addDoc(projCol(uid), payload);
  return { id: ref.id, ...payload };
}

export async function updateProject(
  uid: string,
  pid: string,
  patch: Partial<Pick<ProjectItem, "name" | "description" | "instructions" | "color">>
): Promise<void> {
  const safe: Record<string, unknown> = { updatedAt: Date.now() };
  if (typeof patch.name === "string") safe.name = patch.name.trim().slice(0, 100) || "Untitled project";
  if (typeof patch.description === "string") safe.description = patch.description.trim().slice(0, 400);
  if (typeof patch.instructions === "string") safe.instructions = patch.instructions.trim().slice(0, 1200);
  if (typeof patch.color === "string") safe.color = patch.color.slice(0, 24);
  await updateDoc(doc(db(), `users/${uid}/projects/${pid}`), safe);
}

export async function deleteProject(uid: string, pid: string): Promise<void> {
  await deleteDoc(doc(db(), `users/${uid}/projects/${pid}`));
}

/* ── Saved Library Items ──────────────────────────────────────────────── */

export function subscribeLibrary(uid: string, cb: (items: LibraryItem[]) => void) {
  if (!firebaseReady) {
    cb([]);
    return () => {};
  }
  try {
    return onSnapshot(
      query(libCol(uid), orderBy("createdAt", "desc"), limit(80)),
      (s) => cb(s.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<LibraryItem, "id">) }))),
      () => cb([])
    );
  } catch {
    cb([]);
    return () => {};
  }
}

export async function saveToLibrary(
  uid: string,
  item: Omit<LibraryItem, "id" | "createdAt">
): Promise<LibraryItem> {
  const now = Date.now();
  const payload = clean({
    kind: item.kind,
    title: item.title.trim().slice(0, 160) || "Saved item",
    content: item.content?.slice(0, 100000),
    dataUrl: item.dataUrl && item.dataUrl.length <= 850_000 ? item.dataUrl : undefined,
    aspectRatio: item.aspectRatio,
    conversationId: item.conversationId,
    createdAt: now
  });
  const ref = await addDoc(libCol(uid), payload);
  return { id: ref.id, ...payload };
}

export async function deleteLibraryItem(uid: string, lid: string): Promise<void> {
  await deleteDoc(doc(db(), `users/${uid}/library/${lid}`));
}

/** Live preferences from Firestore (validated). `cb(null)` when none are saved yet. */
export function subscribePrefs(uid: string, cb: (p: Partial<Prefs> | null) => void) {
  if (!firebaseReady) {
    cb(null);
    return () => {};
  }
  try {
    return onSnapshot(
      prefsDoc(uid),
      (s) => cb(s.exists() ? sanitizePrefs(s.data()) : null),
      () => cb(null)
    );
  } catch {
    cb(null);
    return () => {};
  }
}

export async function savePrefs(uid: string, p: Prefs): Promise<void> {
  if (!firebaseReady) return;
  const data: Record<string, unknown> = {};
  for (const k of SYNCED_KEYS) data[k] = p[k];
  await setDoc(prefsDoc(uid), clean({ ...data, updatedAt: Date.now() }), { merge: true });
}
