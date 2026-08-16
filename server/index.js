'use strict';

require('dotenv').config();

const path = require('path');
const express = require('express');
const { chatGemini, getModel, hasKey } = require('./gemini');
const { webSearch } = require('./search');
const { buildSystemPrompt } = require('./prompt');
const { synthesize, ttsStatus, SARVAM_VOICES } = require('./tts');

const app = express();
const PORT = process.env.PORT || 3000;
const DIST = path.join(__dirname, '..', 'client', 'dist');

app.disable('x-powered-by');
app.use(express.json({ limit: '256kb' }));

// Simple request log (never logs the API key)
app.use((req, _res, next) => {
  if (req.path.startsWith('/api/')) {
    console.log(`${new Date().toISOString()} ${req.method} ${req.path}`);
  }
  next();
});

/* ---------- Health ---------- */
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', model: getModel(), configured: hasKey() });
});

/* ---------- Chat ---------- */
app.post('/api/chat', async (req, res, next) => {
  try {
    const { message, history, mode, useWebSearch, lang } = req.body || {};

    if (!message || typeof message !== 'string' || !message.trim()) {
      return res.status(400).json({ error: 'Message is required.' });
    }
    if (message.trim().length > 20000) {
      return res.status(400).json({ error: 'Message is too long (max 20000 characters).' });
    }

    const cleanMessage = message.trim();
    const cleanHistory = Array.isArray(history)
      ? history
          .filter((m) => m && typeof m.content === 'string' && typeof m.role === 'string')
          .slice(-30)
      : [];

    // Optional live web search for "current information" queries
    let sources = [];
    let searched = false;
    let searchContext = '';

    const wantsSearch = !!(useWebSearch) && /(latest|current|today|now|new version|pricing|price|cost|supported|release|update|news|2024|2025|2026|how to|tutorial|documentation|docs|error|bug|fix|download|install)/i.test(cleanMessage);

    if (wantsSearch) {
      try {
        sources = await webSearch(cleanMessage, 5);
        searched = sources.length > 0;
        if (searched) {
          searchContext = sources
            .map((s, i) => `[${i + 1}] ${s.title}\n    URL: ${s.url}\n    ${s.snippet || ''}`)
            .join('\n');
        }
      } catch (e) {
        console.error('search failed:', e.message);
        sources = [];
      }
    }

    const system = buildSystemPrompt({ mode, lang, searchContext });
    const messages = [...cleanHistory.map((m) => ({ role: m.role, content: m.content })), { role: 'user', content: cleanMessage }];

    const { text } = await chatGemini({ system, messages, temperature: 0.7 });

    res.json({ reply: text, sources, searched });
  } catch (e) {
    next(e);
  }
});

/* ---------- Web search (explicit endpoint, optional) ---------- */
app.post('/api/search', async (req, res, next) => {
  try {
    const { q } = req.body || {};
    if (!q || typeof q !== 'string' || !q.trim()) {
      return res.status(400).json({ error: 'Query is required.' });
    }
    const results = await webSearch(q.trim(), 5);
    res.json({ results });
  } catch (e) {
    next(e);
  }
});

/* ---------- Text-to-speech (voice engine) ---------- */
app.get('/api/tts/voices', (_req, res) => {
  res.json({
    defaultVoice: ttsStatus().defaultVoice,
    speedOptions: ['slow', 'normal', 'fast'],
    providers: ttsStatus().providers,
    voices: SARVAM_VOICES
  });
});

app.post('/api/tts', async (req, res, next) => {
  try {
    const { text, lang, speed, voice } = req.body || {};
    if (!text || typeof text !== 'string' || !text.trim()) {
      return res.status(400).json({ error: 'Text is required.' });
    }
    if (text.length > 20000) {
      return res.status(400).json({ error: 'Text is too long (max 20000 characters).' });
    }
    const result = await synthesize(text, {
      lang: lang === 'hi' ? 'hi' : 'en',
      speed: speed || 'normal',
      voice: voice || undefined
    });
    res.setHeader('Content-Type', result.mime);
    res.setHeader('X-TTS-Provider', result.provider);
    res.setHeader('X-TTS-Speed', result.speed);
    res.setHeader('Cache-Control', 'no-store');
    res.send(result.audio);
  } catch (e) {
    if (e.fallback) {
      // Graceful degradation: tell the client to use browser speech synthesis.
      return res.status(503).json({
        error: 'Voice service unavailable, using browser voice.',
        fallback: true,
        providerErrors: e.providerErrors || [],
        preparedText: e.preparedText
      });
    }
    next(e);
  }
});

/* ---------- Static frontend (production build) ---------- */
if (process.env.NODE_ENV === 'production' || require('fs').existsSync(path.join(DIST, 'index.html'))) {
  app.use(express.static(DIST));
  app.get(/^(?!\/api\/).*/, (_req, res) => {
    res.sendFile(path.join(DIST, 'index.html'));
  });
}

/* ---------- Error handler: never leak internals ---------- */
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  console.error('api error:', err.message);
  if (err.status === 503 && err.code === 'MISSING_KEY') {
    return res.status(503).json({ error: 'AI service is not configured yet. Please set the GEMINI_API_KEY on the server.' });
  }
  const status = typeof err.status === 'number' && err.status >= 400 && err.status < 600 ? err.status : 500;
  res.status(status).json({
    error: err.message || 'Priya is temporarily unable to connect to the AI service. Please try again.'
  });
});

app.listen(PORT, () => {
  console.log(`Priya AI backend running on http://localhost:${PORT}`);
  console.log(`Model: ${getModel()}`);
  console.log(`Gemini key configured: ${hasKey()}`);
});
