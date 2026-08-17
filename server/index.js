'use strict';

require('dotenv').config();

const path = require('path');
const express = require('express');
const { chatGemini, getModel, hasKey } = require('./gemini');
const { chatSarvam, hasKey: hasSarvamKey, getModel: getSarvamModel } = require('./sarvam-llm');
const { webSearch, fetchPage } = require('./search');
const { buildSystemPrompt } = require('./prompt');
const { calc } = require('./calc');
const { synthesize, ttsStatus, SARVAM_VOICES } = require('./tts');

// Provider fallback order (configurable). Gemini is skipped when no key is set.
const PROVIDER_ORDER = (process.env.CHAT_PROVIDERS || 'gemini,sarvam')
  .split(',')
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);

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

// Active chat provider: Gemini if its key is set, otherwise Sarvam AI (both can coexist; Gemini wins).
function activeProvider() {
  if (hasKey()) return { name: 'gemini', model: getModel() };
  if (hasSarvamKey()) return { name: 'sarvam', model: getSarvamModel() };
  return { name: 'none', model: null };
}

/* ---------- Health ---------- */
app.get('/api/health', (_req, res) => {
  const provider = activeProvider();
  res.json({
    status: 'ok',
    model: provider.model,
    configured: provider.name !== 'none',
    provider: provider.name,
    providers: PROVIDER_ORDER
  });
});

/* ---------- Chat ---------- */
// Live-search trigger words ("current information" questions)
const SEARCH_RE =
  /(latest|current|today|now|this year|news|headlines|version|release|pricing|price|cost|free tier|free tier|supported|documentation|docs|api|error|bug|fix|update|download|install|how to|what is|compare|difference|guide|tutorial|2024|2025|2026)/i;

// "create a report/file" intent → produces a downloadable file
const DOWNLOAD_RE =
  /(create|make|generate|save|download|write|banao|bana de|create karo|download karo|bana do).{0,40}(report|file|document|summary|notes?|guide|list)/i;

function isPureMath(s) {
  return (
    /[0-9]/.test(s) &&
    /[+\-*/%^×÷]/.test(s) &&
    /^[\d\s.()+\-*/%^×÷]+$/.test(s)
  );
}

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

    /* ---------- Tool routing ---------- */
    let toolResult = null; // { text } direct answer (no LLM needed)

    // !calc <expr>
    let calcMatch = cleanMessage.match(/^!calc\s+([\s\S]+)$/i);
    if (!calcMatch && isPureMath(cleanMessage)) calcMatch = ['', cleanMessage];

    if (calcMatch) {
      const r = calc(calcMatch[1]);
      if (r.ok) {
        toolResult = { text: `🧮 ${r.expr} = **${r.value}**` };
      } else {
        toolResult = { text: 'That expression is not a valid math expression. Try e.g. `!calc (1245*87) + 2^10`.' };
      }
    }

    // !open <url> → read a public page
    const openMatch = cleanMessage.match(/^!open\s+(\S+)$/i);
    if (!toolResult && openMatch) {
      const page = await fetchPage(openMatch[1]);
      toolResult = {
        text: `I read the page "${page.title}" (${page.url}) — summary below.`,
        context: `PAGE CONTENT (fetched just now from ${page.url}):\n${page.text}`
      };
    }

    /* ---------- Optional live web search ---------- */
    let sources = [];
    let searched = false;
    let searchStatus = 'none';
    let searchContext = '';

    const explicitSearch = cleanMessage.match(/^!search\s+([\s\S]+)$/i);
    const wantsSearch = !!explicitSearch || (!!useWebSearch && SEARCH_RE.test(cleanMessage));

    if (!toolResult && wantsSearch) {
      const q = explicitSearch ? explicitSearch[1] : cleanMessage;
      try {
        sources = await webSearch(q, 5);
        searched = sources.length > 0;
        if (searched) {
          searchStatus = 'ok';
          searchContext = sources
            .map((s, i) => `[${i + 1}] ${s.title}\n    URL: ${s.url}\n    ${s.snippet || ''}`)
            .join('\n');
        } else {
          searchStatus = 'failed';
        }
      } catch (e) {
        console.error('search failed:', e.message);
        searchStatus = 'failed';
      }
    }

    /* ---------- Direct tool answers (no LLM call) ---------- */
    if (toolResult) {
      return res.json({
        reply: toolResult.text,
        sources,
        searched,
        tool: true,
        provider: 'tool',
        model: null,
        searchStatus
      });
    }

    /* ---------- AI response with provider fallback ---------- */
    const system = buildSystemPrompt({ mode, lang, searchContext, searchStatus });
    const messages = [...cleanHistory.map((m) => ({ role: m.role, content: m.content })), { role: 'user', content: cleanMessage }];
    if (toolResult && toolResult.context) messages.push({ role: 'user', content: toolResult.context });

    const configured = PROVIDER_ORDER.filter(
      (name) => (name === 'gemini' && hasKey()) || (name === 'sarvam' && hasSarvamKey())
    );
    if (configured.length === 0) {
      const err = new Error('No AI service configured on the server.');
      err.status = 503;
      err.code = 'MISSING_KEY';
      throw err;
    }

    let reply = '';
    let usedProvider = null;
    let lastError = null;

    for (const name of configured) {
      const call = name === 'gemini' ? chatGemini : chatSarvam;
      for (let attempt = 0; attempt < 2; attempt++) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 30000);
        try {
          const { text } = await call({ system, messages, temperature: 0.7, signal: controller.signal });
          clearTimeout(timer);
          reply = text;
          usedProvider = name;
          break;
        } catch (e) {
          clearTimeout(timer);
          lastError = e;
          // retry once on transient failures (rate limit / 5xx / network), else move to next provider
          const transient = e.status === 429 || (e.status >= 500 && e.status <= 599) || e.status === 502;
          if (attempt === 0 && transient) continue;
          break;
        }
      }
      if (reply) break;
    }

    if (!reply) {
      const err = new Error(
        lastError && lastError.message
          ? lastError.message
          : 'All AI services are temporarily unavailable. Please try again in a moment.'
      );
      err.status = lastError && lastError.status ? lastError.status : 503;
      throw err;
    }

    /* ---------- Optional downloadable report ---------- */
    let download = null;
    if (!openMatch && DOWNLOAD_RE.test(cleanMessage)) {
      download = {
        filename: `priya-${new Date().toISOString().slice(0, 10)}.md`,
        content: reply
      };
    }

    res.json({
      reply,
      sources,
      searched,
      provider: usedProvider,
      model: usedProvider === 'gemini' ? getModel() : getSarvamModel(),
      searchStatus,
      download
    });
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
    return res.status(503).json({ error: 'AI service is not configured yet. Please set the GEMINI_API_KEY or SARVAM_API_KEY on the server.' });
  }
  const status = typeof err.status === 'number' && err.status >= 400 && err.status < 600 ? err.status : 500;
  res.status(status).json({
    error: err.message || 'Priya is temporarily unable to connect to the AI service. Please try again.'
  });
});

app.listen(PORT, () => {
  console.log(`Priya AI backend running on http://localhost:${PORT}`);
  const provider = activeProvider();
  console.log(`Chat provider: ${provider.name} (${provider.model || 'none'})`);
  console.log(`Gemini key configured: ${hasKey()} | Sarvam key configured: ${hasSarvamKey()}`);
});
