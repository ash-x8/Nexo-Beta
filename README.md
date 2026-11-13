# NEXO AI 2.1: Personal AI Assistant Platform

Next.js 14 + TypeScript. Server-side AI gateway (Gemini or any OpenAI-compatible provider), Firebase Auth + Firestore, streaming chat, a procedural 3D holographic core (with automatic CSS orbital fallback), manual-only voice, web search (Tavily), memory, themes, and an installable **PWA**.

## Environment variables
All existing Vercel environment variable names are preserved:

| Variable | Purpose |
|---|---|
| `AI_PROVIDER` (`gemini` \| `openai-compatible`), `GEMINI_API_KEY`, `GEMINI_MODEL`, `GEMINI_TTS_MODEL`, `GEMINI_TTS_VOICE` | Gemini chat + server voice |
| `OPENAI_COMPAT_BASE_URL`, `OPENAI_COMPAT_API_KEY`, `OPENAI_COMPAT_MODEL` | Any `/chat/completions` provider |
| `TAVILY_API_KEY` | Web search (toggle appears only when set) |
| `RATE_LIMIT_PER_MINUTE`, `DAILY_REQUEST_LIMIT`, `DAILY_TTS_LIMIT`, `MAX_INPUT_CHARS`, `MAX_HISTORY_MESSAGES`, `MAX_ATTACHMENT_MB`, `REQUEST_TIMEOUT_MS` | Quotas & limits |
| `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY` | Firebase Admin SDK (server only) |
| `NEXT_PUBLIC_FIREBASE_API_KEY`, `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`, `NEXT_PUBLIC_FIREBASE_PROJECT_ID`, `NEXT_PUBLIC_FIREBASE_APP_ID` | Firebase web config (public by design) |

Only the `NEXT_PUBLIC_FIREBASE_*` values are exposed to the browser. Model defaults when `GEMINI_MODEL` / `GEMINI_TTS_MODEL` are unset: `gemini-2.5-flash` / `gemini-2.5-flash-preview-tts`.

## Features
- **Mobile interface** (`<=768px` and installed touch PWAs): bottom navigation (Home, Chats, New Chat, Explore, Settings), Home with orbital core, full-screen chat, bottom sheets, safe-area + on-screen keyboard handling.
- **Desktop interface:** collapsible sidebar, centered conversation, collapsible assistant panel, keyboard shortcuts (`Ctrl/Cmd+Shift+O` new chat, `Ctrl/Cmd+/` sidebar, `Ctrl/Cmd+,` settings, `Esc` stop).
- **3D Core (`JarvisCore.tsx`):** Three.js procedural lattice + rings with reactive idle/listening/thinking/speaking states and automatic CSS orbital fallback when WebGL is unavailable or constrained.
- **Chat:** NDJSON streaming, stop generation, regenerate/retry, copy, timestamps, Markdown + highlighted code, paginated Firestore history, search/rename/delete.
- **Providers:** `Provider` interface in `src/server/providers.ts` (`gemini` and `openai-compatible`). Zod schema validation and allow-listed model selection.
- **Memory & Personalization:** Add/edit/toggle/delete up to 20 facts (secret detection blocks passwords/keys/cards), response style, nickname, and custom instructions.
- **Voice:** Manual-only SpeechRecognition (stop-and-send or cancel), server TTS (Gemini PCM->WAV / audio) with browser voice fallback.
- **PWA (`public/sw.js` `nexo-v3`):** HTML is never cached, immutable `/_next/static/*` cache-first, `/api/*` bypassed, user-confirmed update toast, offline page (`/offline.html`).
- **Security:** Firebase ID token verification on every protected API route, Zod validation, per-minute rate limit, single-inflight lock, atomic Firestore daily quota, hardened `firestore.rules`.

## Setup
```bash
npm install
cp .env.example .env.local   # fill in values; never commit
npm run dev                  # http://localhost:3000
```
Firebase: enable **Authentication -> Google**, add authorized domains, create Firestore database, and deploy `firestore.rules`:
```bash
npx firebase-tools deploy --only firestore:rules
```

## Verification Commands
```bash
npm run typecheck
npm run lint
npm test
npm run build
```

## Structure
```text
src/app/               Root layout, page, and API routes (chat, tts, config, usage, models)
src/components/        App gate, Workspace, Composer, MessageBubble, JarvisCore, SettingsFields, InstallButton
src/components/desktop/ DesktopSidebar, DesktopAssistantPanel, DesktopSettingsModal, DesktopApp
src/components/mobile/  BottomNav, BottomSheet, MobileHome, MobileChats, MobileChat, MobileExplore, MobileSettings, MobileApp
src/hooks/             useChatEngine, usePreferences
src/lib/               firebase, auth, store, api, prefs, memory, prompts, i18n (en/si), schemas, speech/viewport/install hooks
src/server/            env, firebaseAdmin, limits, providers, search, prompt
src/styles/            tokens.css, base.css, mobile.css, desktop.css
public/                manifest.webmanifest, sw.js (nexo-v3), offline.html, icons/
tests/                 Vitest unit and API route tests
```

