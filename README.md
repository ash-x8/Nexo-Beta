# NEXO AI 2.0: mobile-first personal AI assistant

Next.js 14 + TypeScript. Server-side AI gateway (Gemini or any OpenAI-compatible provider), Firebase Auth + Firestore,
streaming chat, a procedural 3D JARVIS-style holographic core, manual-only voice, web search (Tavily), memory, themes,
and an installable **PWA**. A PWA is *not* a native APK; it installs from the browser and opens full screen.

> **Verification status, read first.** This rebuild was written in a sandbox with **no internet**, so `npm install`,
> `npm run typecheck`, `npm run lint`, `npm run build` and live calls to Gemini / Firebase / Tavily were **not run**.
> What *was* done: syntax/undefined-name checks over every file, a strict type-check + runtime tests of the pure-logic
> modules (`prefs`, `memory`, `prompts`, `i18n` en/si key parity). Run the checklist under "Verify" before relying on it.

## Environment variables (unchanged, no new ones)
All names are identical to the previous version, so your existing Vercel configuration keeps working.

| Variable | Purpose |
|---|---|
| `AI_PROVIDER` (`gemini` \| `openai-compatible`), `GEMINI_API_KEY`, `GEMINI_MODEL`, `GEMINI_TTS_MODEL`, `GEMINI_TTS_VOICE` | Gemini chat + server voice |
| `OPENAI_COMPAT_BASE_URL`, `OPENAI_COMPAT_API_KEY`, `OPENAI_COMPAT_MODEL` | any `/chat/completions` provider |
| `TAVILY_API_KEY` | web search (toggle appears only when set) |
| `RATE_LIMIT_PER_MINUTE`, `DAILY_REQUEST_LIMIT`, `DAILY_TTS_LIMIT`, `MAX_INPUT_CHARS`, `MAX_HISTORY_MESSAGES`, `MAX_ATTACHMENT_MB`, `REQUEST_TIMEOUT_MS` | limits |
| `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY` | Admin SDK (server only) |
| `NEXT_PUBLIC_FIREBASE_API_KEY/AUTH_DOMAIN/PROJECT_ID/APP_ID` | Firebase web config (public by design) |

Only the four Firebase web values are `NEXT_PUBLIC_`. No secret is exposed to the browser.
Model defaults when `GEMINI_MODEL` / `GEMINI_TTS_MODEL` are unset: `gemini-2.5-flash` / `gemini-2.5-flash-preview-tts`.

## What's in 2.0
- **Mobile interface** (≤768px and installed touch PWAs): bottom navigation (Home · Chats · NEXO · Explore · Settings), Home
  with the 3D core, full-screen chat, bottom sheets (chat actions, attach menu), safe-area + on-screen-keyboard handling.
- **Desktop interface:** collapsible sidebar, centred conversation, AI info panel, shortcuts
  (`Ctrl/⌘+Shift+O` new chat · `Ctrl/⌘+/` sidebar · `Ctrl/⌘+,` settings · `Esc` stop generating).
- **3D JARVIS core** (`JarvisCore.tsx`, three.js, no model file): idle / listening / thinking / speaking states; while speaking
  it pulses with the real audio level. Pauses when the tab is hidden, honours reduced-motion, falls back to CSS rings if WebGL is unavailable.
- **Chat:** streaming (NDJSON), stop, regenerate, copy, timestamps, Markdown + highlighted code, retry, offline notice, conversation search / rename / delete.
- **Providers:** `Provider` interface in `src/server/providers.ts` (Gemini, OpenAI-compatible). Users can pick a model in Settings;
  `/api/models` lists what the provider reports and `/api/chat` rejects any model not on that list.
- **Memory:** add / edit / enable-disable / delete (max 20), refuses text that looks like passwords, keys or card numbers; only the
  8 most relevant enabled memories are sent per message. Nothing is saved automatically.
- **Settings:** language, theme (dark / light / match device), assistant on/off, reply language, model, voice language, reading voice,
  memory, usage, install, account, about. Synced to Firestore (`users/{uid}/settings/prefs`) except device-specific options.
- **Voice:** manual mic only; cancel / stop-and-send; server TTS (Gemini) with browser-voice fallback; voice picker where the browser has voices.
- **Attachments:** images, text/code files, PDF (Gemini only); preview thumbnail, name, size, reading indicator, validation, size cap.
- **PWA:** versioned service worker (`nexo-v2`). HTML is never cached, hashed bundles are cache-first, `/api/*` and authenticated
  requests are never touched. New versions wait for the user to tap **Update** (no surprise reloads). Offline page, install
  button (Android/desktop), iOS "Add to Home Screen" instructions, standalone display.
- **Security:** token-verified API routes, Zod validation, request-size guard, per-minute + daily limits, one generation at a time,
  Firestore rules with ownership **and** field validation, security headers (HSTS, frame-deny, COOP allow-popups, minimal CSP directives).
- **Sign-in:** Google popup with automatic redirect fallback (blocked popups / installed PWAs).

## Setup
```bash
npm install
cp .env.example .env.local   # fill in; never commit
npm run dev                  # http://localhost:3000
```
Firebase: enable **Authentication → Google**, add your domains under *Authorized domains*, create Firestore, then
**publish the updated `firestore.rules`** (required: they now validate fields). `npx firebase-tools deploy --only firestore:rules`.

## Verify (run before deploying)
```bash
npm install && npm run typecheck && npm run lint && npm run build
```
Then, on a real phone (installed PWA) and a desktop:
1. Sign in → send a message (streams) → reload (history persists) → rename / delete → stop mid-answer → regenerate.
2. Attach an image, a text file and (Gemini) a PDF. Try an oversize file and an unsupported type.
3. Tap the mic (permission prompt only then) → speak → stop-and-send; cancel discards.
4. Open the keyboard in chat: composer stays above it, no horizontal scroll. Check light and dark themes.
5. Settings → change theme/language → reload on another device: they follow your account.
6. Memory: add, edit, disable, delete; try "my password is…" (must be refused).
7. DevTools › Application: manifest, service worker, toggle Offline → offline page. Deploy a change → "Update" toast appears.
8. Model picker lists models; pick one and chat. Lighthouse PWA audit.

## Known limits (honest list)
- Not a native APK. iOS has no install prompt (manual Add to Home Screen); iOS splash screens use the manifest colour only.
- Browser speech recognition is provider-dependent (Chrome/Edge use their cloud); Sinhala support varies. Singlish is typed text.
- Rate limiting per minute is per warm serverless instance; the Firestore daily counter is authoritative.
- Chat history is stored in Firestore and not encrypted client-side. The service worker never caches it.
- Light theme covers the whole UI, but code blocks stay dark by design.
- A strict Content-Security-Policy for scripts was deliberately **not** added: it could not be tested here and would likely break Firebase sign-in.
- Everything marked "not run" above is unverified until you run the checklist.

## Structure
```
src/app/                    layout, globals.css (desktop), mobile.css (design tokens + mobile), theme.css (light theme, toasts, gate)
src/app/api/{chat,tts,config,usage,models}   server routes
src/server/                 env, firebase-admin, limits, providers (abstraction), search, prompt
src/lib/                    firebase, store (Firestore), api, prefs, memory, prompts, i18n (en/si), speech hooks, viewport/install hooks
src/components/             Shell, Composer, MessageView, Settings, JarvisCore, AvatarPanel, Sidebar, App (sign-in gate)
src/components/mobile/      BottomNav, BottomSheet, Home / Chats / Explore screens, icons
public/                     manifest, sw.js (nexo-v2), offline.html, icons
```
