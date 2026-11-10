# NEXO AI — Your Intelligent Digital Companion

A multilingual (Sinhala · English · Singlish) personal AI assistant: Next.js 14 + TypeScript, a secure server-side AI gateway
(Gemini by default, any OpenAI-compatible provider via config), Firebase Auth + Firestore, streaming chat, a 3D human assistant
slot with audio-driven lip-sync, manual-only voice input, and an installable PWA.

> **Status you should know up front.** The code was written from scratch in a sandbox with no internet access, so
> `npm install`, `npm run build` and live calls to Gemini/Firebase were **not run there**. Only a TypeScript *syntax* pass was done.
> Run the checklist in "Verify" below on your machine before deploying. The 3D model file is **not included** (see "3D assistant").

## What is implemented

| Area | Status |
|---|---|
| Streaming chat via `/api/chat` (NDJSON), stop, regenerate, copy, timestamps, Markdown, code highlighting + copy, auto-scroll | Implemented |
| Conversations: create, rename, delete, search, persisted in Firestore per user | Implemented |
| Context-aware follow-ups (last `MAX_HISTORY_MESSAGES` messages sent every turn) | Implemented |
| Providers: `gemini` or `openai-compatible` (Groq, OpenRouter, OpenAI, …) | Implemented |
| Auth: Firebase Google sign-in; server verifies ID tokens with Admin SDK; Firestore rules isolate each user | Implemented |
| Limits: per-minute throttle, daily request/voice quotas in Firestore, one generation at a time per user, input/attachment size caps | Implemented |
| Error handling: timeout, provider rate-limit, quota, bad key, missing model, safety block, offline | Implemented |
| Image understanding + file analysis (images, text/code files; PDFs on Gemini) | Implemented |
| Web search (Tavily) with cited sources — toggle shown only when `TAVILY_API_KEY` is set | Implemented |
| Memory: facts the user adds manually, on/off switch, delete (nothing is added automatically) | Implemented |
| Voice input: manual mic button only; no wake word, no auto-start, no background recording | Implemented |
| Voice output: Gemini TTS → real audio → AnalyserNode drives mouth morphs; falls back to browser voice (approximate lip-sync) | Implemented |
| PWA: manifest, icons, service worker, offline page, install button | Implemented |
| 3D human assistant: rig/animation/lip-sync system | Implemented — **needs your GLB asset** |

Not included: code execution sandbox, long-term automatic memory, native APK (a PWA is not an APK).

## Setup

```bash
npm install
cp .env.example .env.local   # fill in values; never commit .env.local
npm run dev                  # http://localhost:3000
```

### 1. Gemini (or another provider)
Create a key in Google AI Studio and set `GEMINI_API_KEY`. `GEMINI_MODEL` defaults to `gemini-3.8-flash` (if your key can't use it, try `gemini-2.5-flash`); model names
change over time, so check the current list. To use another provider set `AI_PROVIDER=openai-compatible` plus
`OPENAI_COMPAT_BASE_URL`, `OPENAI_COMPAT_API_KEY`, `OPENAI_COMPAT_MODEL` (PDF analysis and server voice need Gemini).

### 2. Firebase
1. Create a Firebase project; enable **Authentication → Google** and add your domains under *Authorized domains*.
2. Create a **Cloud Firestore** database.
3. Project settings → *Your apps* → Web app: copy the four `NEXT_PUBLIC_FIREBASE_*` values.
4. Project settings → *Service accounts* → generate a private key; copy `project_id`, `client_email`, `private_key` into
   `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY` (keep the quotes and `\n` escapes).
5. Deploy rules: `npx firebase-tools deploy --only firestore:rules` (uses `firestore.rules`).

### 3. Optional: web search
Set `TAVILY_API_KEY`. Without it the search button is hidden.

## Environment variables

| Variable | Required | Purpose |
|---|---|---|
| `AI_PROVIDER` | no (`gemini`) | `gemini` or `openai-compatible` |
| `GEMINI_API_KEY`, `GEMINI_MODEL` | for Gemini | chat model |
| `GEMINI_TTS_MODEL`, `GEMINI_TTS_VOICE` | no | server voice (preview model names may change) |
| `OPENAI_COMPAT_BASE_URL/API_KEY/MODEL` | for that provider | any `/chat/completions` API |
| `TAVILY_API_KEY` | no | web search |
| `RATE_LIMIT_PER_MINUTE` (10), `DAILY_REQUEST_LIMIT` (100), `DAILY_TTS_LIMIT` (40) | no | per-user limits |
| `MAX_INPUT_CHARS`, `MAX_HISTORY_MESSAGES`, `MAX_ATTACHMENT_MB`, `REQUEST_TIMEOUT_MS` | no | size/time caps |
| `FIREBASE_PROJECT_ID/CLIENT_EMAIL/PRIVATE_KEY` | yes | server token verification + usage counters |
| `NEXT_PUBLIC_FIREBASE_*` (4 values) | yes | browser Firebase SDK (public by design; protected by Auth + rules) |

## Cost and free tiers
Everything is configurable and nothing paid is activated by the app. Free-tier allowances for Gemini, Firebase and Tavily
change and differ per model/region, so **check each provider's current pricing page** and set the limits above below them.
- Firebase Auth + Firestore: use the Spark (free) plan; the app's reads/writes are small, but Spark has daily quotas.
- Gemini chat/TTS and Tavily search consume provider quota per request; a quota error is shown as a clear message, never retried automatically.
- Paid-only needs: higher Gemini limits or non-preview TTS, Firebase Blaze if you outgrow Spark, larger Tavily plans.
- The in-memory per-minute throttle is per server instance (serverless caveat); the Firestore daily counter is authoritative.

## 3D assistant
The app looks for **`public/models/assistant.glb`**. Without it the panel says so plainly — no placeholder is shown as a human.
Requirements for the animation system to work fully:
- A rigged humanoid GLB with bones named like `Head`, `Neck`, `Spine1/Spine2`, `LeftEye`, `RightEye` (Mixamo-style naming works).
- Face meshes with ARKit blend shapes: `eyeBlinkLeft/Right`, `jawOpen`, `mouthSmileLeft/Right`, `browInnerUp`, `mouthFunnel`,
  and optionally Oculus visemes `viseme_aa/O/E/I`. Ready Player Me shut down on 31 Jan 2026, so use another source (e.g. Avaturn or MetaPerson exports, a purchased/licensed Sketchfab model, or your own Blender model with ARKit shape keys). Previously exported RPM GLB files still work.
- Keep it under ~5 MB for mobile (Draco/Meshopt-compress textures and geometry).
- Check the licence of whichever model you use. If the model has no blend shapes the UI says lip-sync is unavailable.

Lip-sync: server TTS audio is decoded with the Web Audio API; its live loudness drives jaw/viseme morphs every frame.
Browser-voice fallback exposes no audio, so the mouth follows word boundaries (approximate, and labelled in the UI).

## Voice notes
The mic starts only when the user presses it and stops on silence, the stop button (sends) or cancel (discards). Chrome/Edge
send speech audio to their own cloud recognizer; Sinhala (`si-LK`) support depends on the browser. Singlish is typed text, not speech.

## Deploy (Vercel)
1. Push the repo, import it in Vercel (framework: Next.js).
2. Add every variable from `.env.example` (Production + Preview). Paste the private key with its `\n` escapes.
3. Add the Vercel domain to Firebase *Authorized domains*, deploy Firestore rules.
4. Open the site, sign in, send a message. Check `/api/config` shows `"configured": true`.
Any Node 18+ host works (`npm run build && npm start`). `/api/chat` streams, so avoid hosts that buffer responses.

## Verify (run locally before deploying)
```bash
npm install && npm run typecheck && npm run build
```
Then: sign in → send a message (streams) → reload (history persists) → rename/delete → stop mid-answer → regenerate →
attach an image → press the mic (permission prompt appears only then) → DevTools › Application: manifest, service worker,
offline page (toggle Offline) → Lighthouse PWA check → resize to phone width.

## Structure
```
src/app/api/{chat,tts,config,usage}   server routes (token-verified, rate-limited)
src/server/                            env, firebase-admin, limits, providers, search, prompt
src/lib/                               client: firebase, store (Firestore), api stream, speech hooks, i18n
src/components/                        Shell, Sidebar, Composer, MessageView, Avatar3D, AvatarPanel, Settings
public/                                manifest, sw.js, offline.html, icons, models/ (put assistant.glb here)
```
