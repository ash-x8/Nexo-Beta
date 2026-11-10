import type { Lang } from "./types";

const en = {
  tagline: "Your Intelligent Digital Companion",
  signIn: "Continue with Google", signOut: "Sign out",
  newChat: "New conversation", search: "Search conversations", noChats: "No conversations yet. Start one below.",
  rename: "Rename", delete: "Delete", confirmDelete: "Delete this conversation and all its messages?",
  placeholder: "Ask NEXO anything…", send: "Send", stop: "Stop generating", regenerate: "Regenerate", copy: "Copy", copied: "Copied",
  attach: "Attach file or image", webSearch: "Search the web", mic: "Start voice input", micStop: "Finish and send", micCancel: "Cancel voice input",
  listening: "Listening… speak now", readAloud: "Read aloud", stopSpeaking: "Stop speaking",
  settings: "Settings", close: "Close", uiLang: "Interface language", replyLang: "Reply language", voiceLang: "Voice input language",
  replyAuto: "Match my message", speakReplies: "Read replies aloud automatically", showAvatar: "Show assistant",
  memory: "Memory", memoryOn: "Use memory in conversations", memoryHint: "Facts you add here are sent with your messages so NEXO can personalize answers. Nothing is added automatically.",
  addMemory: "Add", memoryPlaceholder: "e.g. I'm learning Python", usageToday: "Today's usage", messages: "messages", voiceClips: "voice clips",
  install: "Install app", thinking: "Thinking", you: "You", assistantName: "NEXO", sources: "Sources", empty: "What can I help you with?",
  modelMissing: "3D model not installed", modelMissingHelp: "Add a rigged human GLB at public/models/assistant.glb. See README, section “3D assistant”.",
  noMorphs: "This model has no facial blend shapes, so lip-sync is unavailable.", state_idle: "Ready", state_listening: "Listening", state_thinking: "Thinking", state_speaking: "Speaking",
  setupTitle: "Firebase isn't configured", setupBody: "Add the NEXT_PUBLIC_FIREBASE_* variables to your environment (see .env.example) and restart.",
  serverNotConfigured: "The AI provider isn't configured on the server yet.",
  offlineNote: "You're offline. Reconnect to chat.", account: "Account", regenNoFiles: "Attachments from earlier are not re-sent when regenerating after a reload."
};
export type Dict = typeof en;

const si: Dict = {
  tagline: "ඔබේ බුද්ධිමත් ඩිජිටල් සහකරු",
  signIn: "Google සමඟ ඉදිරියට", signOut: "පිටවන්න",
  newChat: "නව සංවාදය", search: "සංවාද සොයන්න", noChats: "තවම සංවාද නැත. පහතින් ආරම්භ කරන්න.",
  rename: "නම වෙනස් කරන්න", delete: "මකන්න", confirmDelete: "මෙම සංවාදය සහ එහි සියලු පණිවිඩ මකන්නද?",
  placeholder: "NEXO ගෙන් ඕනෑම දෙයක් අසන්න…", send: "යවන්න", stop: "නවත්වන්න", regenerate: "නැවත උත්පාදනය", copy: "පිටපත් කරන්න", copied: "පිටපත් කළා",
  attach: "ගොනුවක් හෝ රූපයක් ඇමුණන්න", webSearch: "වෙබ් සෙවුම", mic: "හඬ ආදානය ආරම්භ කරන්න", micStop: "අවසන් කර යවන්න", micCancel: "හඬ ආදානය අවලංගු කරන්න",
  listening: "ඇහුම්කන් දෙමින්… දැන් කතා කරන්න", readAloud: "හඬින් කියවන්න", stopSpeaking: "කතාව නවත්වන්න",
  settings: "සැකසුම්", close: "වසන්න", uiLang: "අතුරු මුහුණතේ භාෂාව", replyLang: "පිළිතුරු භාෂාව", voiceLang: "හඬ ආදාන භාෂාව",
  replyAuto: "මගේ පණිවිඩයට ගැළපෙන", speakReplies: "පිළිතුරු ස්වයංක්‍රීයව හඬින් කියවන්න", showAvatar: "සහායකයා පෙන්වන්න",
  memory: "මතකය", memoryOn: "සංවාද වලදී මතකය භාවිතා කරන්න", memoryHint: "ඔබ මෙහි එකතු කරන කරුණු ඔබේ පණිවිඩ සමඟ යවනු ලැබේ. කිසිවක් ස්වයංක්‍රීයව එකතු නොවේ.",
  addMemory: "එකතු කරන්න", memoryPlaceholder: "උදා: මම Python ඉගෙන ගනිමින් සිටිමි", usageToday: "අදට භාවිතය", messages: "පණිවිඩ", voiceClips: "හඬ කොටස්",
  install: "යෙදුම ස්ථාපනය කරන්න", thinking: "සිතමින්", you: "ඔබ", assistantName: "NEXO", sources: "මූලාශ්‍ර", empty: "මට ඔබට උදව් කළ හැක්කේ කුමක්ද?",
  modelMissing: "3D ආකෘතිය ස්ථාපනය කර නැත", modelMissingHelp: "public/models/assistant.glb ලෙස rigged මිනිස් GLB ගොනුවක් එක් කරන්න. README හි “3D assistant” කොටස බලන්න.",
  noMorphs: "මෙම ආකෘතියේ මුහුණු blend shapes නොමැති නිසා ලිප්-සින්ක් නොමැත.", state_idle: "සූදානම්", state_listening: "ඇහුම්කන් දෙයි", state_thinking: "සිතයි", state_speaking: "කතා කරයි",
  setupTitle: "Firebase සකසා නැත", setupBody: "NEXT_PUBLIC_FIREBASE_* විචල්‍යයන් එක් කර නැවත ආරම්භ කරන්න (.env.example බලන්න).",
  serverNotConfigured: "AI සපයන්නා සේවාදායකයේ තවම සකසා නැත.",
  offlineNote: "ඔබ ජාලයෙන් බැහැරයි. සංවාදයට නැවත සම්බන්ධ වන්න.", account: "ගිණුම", regenNoFiles: "නැවත පූරණයෙන් පසු නැවත උත්පාදනයේදී පෙර ඇමුණුම් නැවත නොයැවේ."
};

export const dictionaries: Record<Lang, Dict> = { en, si };
