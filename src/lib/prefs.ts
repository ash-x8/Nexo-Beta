import type {
  AccentPreset,
  ChatDensity,
  FontSizePref,
  Lang,
  ReplyLang,
  ResponseStyle,
  ResponseTone,
  Theme,
  VoiceInputLang
} from "./types";

export type {
  AccentPreset,
  ChatDensity,
  FontSizePref,
  ResponseStyle,
  ResponseTone,
  Theme,
  VoiceInputLang
};

export interface Prefs {
  ui: Lang;
  reply: ReplyLang;
  responseStyle: ResponseStyle;
  responseTone: ResponseTone;
  voiceLang: VoiceInputLang;
  voiceSpeed: number;
  speak: boolean;
  jarvisContinuous: boolean;
  enterToSend: boolean;
  memoryOn: boolean;
  avatarOn: boolean;
  theme: Theme;
  accentColor: AccentPreset;
  fontSize: FontSizePref;
  chatDensity: ChatDensity;
  /** Optional display name for personalization */
  nickname: string;
  /** Optional brief user instructions for personalization */
  customInstructions: string;
  /** Browser voice (voiceURI); device specific, never synced */
  voiceName: string;
  /** Desktop sidebar; device specific, never synced */
  sidebarCollapsed: boolean;
  /** Desktop assistant info panel; device specific, never synced */
  infoPanelOpen: boolean;
}

export const DEFAULT_PREFS: Prefs = {
  ui: "en",
  reply: "auto",
  responseStyle: "balanced",
  responseTone: "natural",
  voiceLang: "auto",
  voiceSpeed: 1,
  speak: false,
  jarvisContinuous: false,
  enterToSend: true,
  memoryOn: true,
  avatarOn: true,
  theme: "dark",
  accentColor: "teal",
  fontSize: "md",
  chatDensity: "comfortable",
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
  "responseTone",
  "voiceLang",
  "voiceSpeed",
  "speak",
  "jarvisContinuous",
  "enterToSend",
  "memoryOn",
  "avatarOn",
  "theme",
  "accentColor",
  "fontSize",
  "chatDensity",
  "nickname",
  "customInstructions"
] as const;

/** Accepts untrusted input (localStorage / Firestore) and keeps only valid values. */
export function sanitizePrefs(raw: unknown): Partial<Prefs> {
  if (!raw || typeof raw !== "object") return {};
  const r = raw as Record<string, unknown>;
  const out: Partial<Prefs> = {};

  if (r.ui === "en" || r.ui === "si") out.ui = r.ui;
  if (r.reply === "auto" || r.reply === "en" || r.reply === "si" || r.reply === "ta" || r.reply === "hi") {
    out.reply = r.reply;
  }
  if (r.responseStyle === "balanced" || r.responseStyle === "concise" || r.responseStyle === "detailed") {
    out.responseStyle = r.responseStyle;
  }
  if (
    r.responseTone === "natural" ||
    r.responseTone === "professional" ||
    r.responseTone === "friendly" ||
    r.responseTone === "technical"
  ) {
    out.responseTone = r.responseTone;
  }
  if (
    r.voiceLang === "auto" ||
    r.voiceLang === "en-US" ||
    r.voiceLang === "si-LK" ||
    r.voiceLang === "ta-IN" ||
    r.voiceLang === "hi-IN"
  ) {
    out.voiceLang = r.voiceLang;
  }
  if (typeof r.voiceSpeed === "number" && Number.isFinite(r.voiceSpeed) && r.voiceSpeed >= 0.75 && r.voiceSpeed <= 1.5) {
    out.voiceSpeed = Math.round(r.voiceSpeed * 100) / 100;
  }
  if (typeof r.speak === "boolean") out.speak = r.speak;
  if (typeof r.jarvisContinuous === "boolean") out.jarvisContinuous = r.jarvisContinuous;
  if (typeof r.enterToSend === "boolean") out.enterToSend = r.enterToSend;
  if (typeof r.memoryOn === "boolean") out.memoryOn = r.memoryOn;
  if (typeof r.avatarOn === "boolean") out.avatarOn = r.avatarOn;
  if (r.theme === "dark" || r.theme === "light" || r.theme === "system") out.theme = r.theme;
  if (
    r.accentColor === "teal" ||
    r.accentColor === "sky" ||
    r.accentColor === "emerald" ||
    r.accentColor === "indigo" ||
    r.accentColor === "amber"
  ) {
    out.accentColor = r.accentColor;
  }
  if (r.fontSize === "sm" || r.fontSize === "md" || r.fontSize === "lg") out.fontSize = r.fontSize;
  if (r.chatDensity === "compact" || r.chatDensity === "comfortable" || r.chatDensity === "spacious") {
    out.chatDensity = r.chatDensity;
  }
  if (typeof r.nickname === "string") out.nickname = r.nickname.slice(0, 60);
  if (typeof r.customInstructions === "string") out.customInstructions = r.customInstructions.slice(0, 400);
  if (typeof r.voiceName === "string" && r.voiceName.length <= 200) out.voiceName = r.voiceName;
  if (typeof r.sidebarCollapsed === "boolean") out.sidebarCollapsed = r.sidebarCollapsed;
  if (typeof r.infoPanelOpen === "boolean") out.infoPanelOpen = r.infoPanelOpen;

  return out;
}
