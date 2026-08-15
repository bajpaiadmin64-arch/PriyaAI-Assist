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
| AI model | Gemini (`gemini-3.6-flash` by default, current free-tier Flash model) |
| Live web search | Server-side (Bing → DuckDuckGo fallback) |

## Features

- 💬 **Hindi / English / Hinglish** — Priya detects your language and replies in it
- 🎙️ **Voice input** (mic, Web Speech API) + 🔊 **voice replies** (female voice)
- ⚙️ **Simple / Balanced / Tech** modes
- 🔎 **Live web search** with source links for current-information questions
- 📋 Copy / code-copy buttons, markdown rendering, multi-turn context
- 🧹 New conversation, clear, export chat (.md)
- 🌙 Dark / light mode, fully responsive (desktop → mobile)
- 🛡️ Clean error messages — no stack traces, no secrets, no crashes

## Getting started (local)

Prerequisites: Node.js 18+ (tested on 20/22/24).

```bash
# 1. install all dependencies (root + client workspace)
npm install

# 2. configure the secret
cp .env.example .env
# -> open .env and set GEMINI_API_KEY=your_real_key_here

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
