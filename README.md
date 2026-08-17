# Priya AI — Personal AI Technology Assistant

**Priya** is your personal female AI technology expert. She speaks **Hindi, English and Hinglish**, helps with web development, hosting, Git, databases, AI tools and computer troubleshooting — and she is honest: **Accuracy > Agreement**. She will tell you when you are wrong and will never pretend to know something she doesn't.

## Architecture

```
User
 ↓
Priya AI Frontend (React + Vite)
 ↓
Backend /api/chat (Node.js + Express)
 ↓
Gemini API (Google)
 ↓
Backend → Frontend → User
```

The **API key lives only on the server** (environment variable). It is never sent to the browser and never committed to the repository.

| Layer | Tech |
|---|---|
| Frontend | React 19 + Vite 8 (`client/`) |
| Backend | Node.js + Express (`server/`) — no frameworks beyond Express |
| AI model | Sarvam `sarvam-105b` (Indian-first, native Hindi) or Gemini `gemini-3.5-flash` when its key is set |
| Live web search | Server-side (Bing → DuckDuckGo fallback) |

## Features

- 💬 **Hindi / English / Hinglish** — Priya detects your language and replies in it
- 🎙️ **Voice input** (mic, Web Speech API) + 🔊 **voice replies** (female voice)
- ⏸️ **Interruptible conversation (barge-in)** — Priya keeps listening while she speaks; say **"Ruko!"** or just start talking and she stops instantly, waits for your full sentence, then answers
- ⚙️ **Simple / Balanced / Tech** modes
- 🔎 **Live web search** with source links + "✓ Information updated" indicator for current-information questions
- 🧮 **Calculator tool** (`!calc 1245*87` or just type a math expression)
- 🌐 **Page reader tool** (`!open https://…` to read a public page's current content)
- 📄 **Report download** — ask Priya to "create a report" and she saves it as a file
- ⚡ **Provider fallback** — Gemini → Sarvam chain (configurable via `CHAT_PROVIDERS`), with retry, timeouts, and an honest "Priya is using …" indicator
- 🪪 **Core identity** — owner/developer is Utkarsh Bajpai; "I was designed and developed by Utkarsh Bajpai."
- 📋 Copy / code-copy buttons, markdown rendering, multi-turn context
- 🧹 New conversation, clear, export chat (.md)
- 🌙 Dark / light mode, fully responsive (desktop → mobile)
- 🛡️ Clean error messages — no stack traces, no secrets, no crashes

## Priya AI Local Companion (optional, designed for later)

Some PC capabilities cannot run inside a browser (local files, system info, approved commands). The design for an optional companion app, which can be built later:

```
Priya Web App (browser)
   ↓  WebSocket + per-session token (only localhost, never the public server)
Secure Local Companion (small Node/Python app, runs on the user's PC)
   ↓  permission checks + allowlist
User-approved PC capabilities
```

Security model (mandatory):
- **Never unrestricted remote access.** The companion only listens on `127.0.0.1`, requires a one-time pairing token, and serves only the web app that requested it.
- **Allowlisted actions** — every capability (read file, clipboard, system info, notifications, run approved command) is individually enabled in a config file.
- **Explicit confirmation** — destructive or sensitive actions require the user to click "Approve" in a native dialog every time.
- **Never auto-run AI-generated commands** — commands are shown to the user for review; the AI cannot execute anything by itself.
- **Logging** — every action is logged locally so the user can audit what happened.
- The browser already asks permission for mic / camera / clipboard / notifications through its own permission prompts.

Until the companion exists, Priya honestly says what the browser can and cannot do, and never pretends to have accessed the PC.

## Getting started (local)

Prerequisites: Node.js 18+ (tested on 20/22/24).

```bash
# 1. install all dependencies (root + client workspace)
npm install

# 2. configure the secret
cp .env.example .env
# -> open .env and set SARVAM_API_KEY=your_real_key_here (chat + voice)
# -> optional: GEMINI_API_KEY for Gemini as the preferred chat model

# 3. run backend (port 3000)
npm run dev:server

# 4. in another terminal, run frontend dev server (port 5173, proxies /api)
npm run dev:client
```

Open http://localhost:5173

### Production build + run

```bash
npm run build     # builds client/dist
npm start         # serves API + built frontend on PORT (default 3000)
```

## Environment variables

| Variable | Required | Description |
|---|---|---|
| `GEMINI_API_KEY` | ✅ | Google Gemini API key — get a free one at https://aistudio.google.com/apikey |
| `GEMINI_MODEL` | ❌ | Override model, e.g. `gemini-3.5-flash` (default: `gemini-3.6-flash`) |
| `PORT` | ❌ | Backend port (Render sets it automatically) |

Never commit `.env`. It is ignored by `.gitignore`.

## API

### `GET /api/health`
```json
{ "status": "ok", "model": "gemini-3.6-flash", "configured": true }
```

### `POST /api/chat`
Request:
```json
{
  "message": "Meri website deploy nahi ho rahi",
  "history": [ { "role": "user", "content": "..." }, { "role": "assistant", "content": "..." } ],
  "mode": "balanced",
  "useWebSearch": true,
  "lang": "hi"
}
```
Response:
```json
{ "reply": "...", "sources": [ { "title": "...", "url": "...", "snippet": "..." } ], "searched": true }
```

## Deploy to Render

The repository includes `render.yaml` (Blueprint). Either:

1. **Dashboard:** New → Blueprint → select this repo — Render creates a free Web Service automatically.
2. **Manual:** New → Web Service → repo → Runtime Node:
   - Build command: `npm install && npm run build`
   - Start command: `npm start`
   - Instance type: **Free**
3. Set the secret environment variable `GEMINI_API_KEY` in **Environment → Secret Files / Secrets**.

Pushing to `main` triggers an automatic redeploy.

## Security notes

- `GEMINI_API_KEY` is read only by the backend from `process.env`.
- The frontend never receives or sends the key.
- The server never logs the key.
- Free tier note: enabling billing on a Gemini project removes its free tier. Keep the key's project billing-free for free usage.
- Render free web services spin down after 15 minutes idle and spin back up on the next request (a few seconds).
