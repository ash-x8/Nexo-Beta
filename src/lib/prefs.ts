import type { Lang, ReplyLang, ResponseStyle, Theme } from "./types";

export type { Theme, ResponseStyle };

export interface Prefs {
  ui: Lang;
  reply: ReplyLang;
  responseStyle: ResponseStyle;
  voiceLang: "en-US" | "si-LK";
  speak: boolean;
  memoryOn: boolean;
  avatarOn: boolean;
  theme: Theme;
  /** "" = use the server's default model */
  model: string;
  /** optional display name for AI personalization */
  nickname: string;
  /** optional brief user instructions for AI personalization */
  customInstructions: string;
  /** browser voice (voiceURI); device specific, never synced */
  voiceName: string;
  /** desktop sidebar; device specific, never synced */
  sidebarCollapsed: boolean;
  /** desktop assistant info panel; device specific, never synced */
  infoPanelOpen: boolean;
}

export const DEFAULT_PREFS: Prefs = {
  ui: "en",
  reply: "auto",
  responseStyle: "balanced",
  voiceLang: "en-US",
  speak: false,
  memoryOn: true,
  avatarOn: true,
  theme: "dark",
  model: "",
  nickname: "",
  customInstructions: "",
  voiceName: "",
  sidebarCollapsed: false,
  infoPanelOpen: true
};

/** Keys stored in Firestore (users/{uid}/settings/prefs). Device-specific keys stay local. */
export const SYNCED_KEYS = [
  "ui",
  "reply",
  "responseStyle",
  "voiceLang",
  "speak",
  "memoryOn",
  "avatarOn",
  "theme",
  "model",
  "nickname",
  "customInstructions"
] as const;

/** Accepts untrusted input (localStorage / Firestore) and keeps only valid values. */
export function sanitizePrefs(raw: unknown): Partial<Prefs> {
  if (!raw || typeof raw !== "object") return {};
  const r = raw as Record<string, unknown>;
  const out: Partial<Prefs> = {};

  if (r.ui === "en" || r.ui === "si") out.ui = r.ui;
  if (r.reply === "auto" || r.reply === "en" || r.reply === "si") out.reply = r.reply;
  if (r.responseStyle === "balanced" || r.responseStyle === "concise" || r.responseStyle === "detailed") {
    out.responseStyle = r.responseStyle;
  }
  if (r.voiceLang === "en-US" || r.voiceLang === "si-LK") out.voiceLang = r.voiceLang;
  if (typeof r.speak === "boolean") out.speak = r.speak;
  if (typeof r.memoryOn === "boolean") out.memoryOn = r.memoryOn;
  if (typeof r.avatarOn === "boolean") out.avatarOn = r.avatarOn;
  if (r.theme === "dark" || r.theme === "light" || r.theme === "system") out.theme = r.theme;
  if (typeof r.model === "string" && r.model.length <= 100) out.model = r.model;
  if (typeof r.nickname === "string") out.nickname = r.nickname.slice(0, 60);
  if (typeof r.customInstructions === "string") out.customInstructions = r.customInstructions.slice(0, 400);
  if (typeof r.voiceName === "string" && r.voiceName.length <= 200) out.voiceName = r.voiceName;
  if (typeof r.sidebarCollapsed === "boolean") out.sidebarCollapsed = r.sidebarCollapsed;
  if (typeof r.infoPanelOpen === "boolean") out.infoPanelOpen = r.infoPanelOpen;

  return out;
}
