'use strict';

require('dotenv').config();

const path = require('path');
const express = require('express');
const { callWithFallback, providerStatus } = require('./providers');
const { webSearch, fetchPage } = require('./search');
const { buildSystemPrompt } = require('./prompt');
const { calc } = require('./calc');
const { replyToCsv } = require('./markdown-csv');
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
  const providers = providerStatus();
  const configured = providers.find((p) => p.configured);
  res.json({
    status: 'ok',
    model: configured ? configured.model : null,
    configured: !!configured,
    provider: configured ? configured.name : 'none',
    providers
  });
});

/* ---------- Chat ---------- */
// Live-search trigger words ("current information" questions)
const SEARCH_RE =
  /(latest|current|today|now|this year|news|headlines|version|release|pricing|price|cost|free tier|free tier|supported|documentation|docs|api|error|bug|fix|update|download|install|how to|what is|compare|difference|guide|tutorial|2024|2025|2026)/i;

// "create a report/file" intent → produces a downloadable file
const DOWNLOAD_RE =
  /(create|make|generate|save|download|write|banao|bana de|create karo|download karo|bana do).{0,40}(report|file|document|summary|notes?|guide|list)/i;

// Token diet: cap how much conversation history is sent to the model.
// Recent turns are kept whole; older turns are dropped beyond the budget.
const HISTORY_BUDGET_CHARS = 6000; // ~1500 tokens
const HISTORY_MAX_TURNS = 12;

function trimHistory(messages) {
  const recent = messages.slice(-HISTORY_MAX_TURNS);
  let total = 0;
  const kept = [];
  for (let i = recent.length - 1; i >= 0; i--) {
    const content = recent[i].content || '';
    if (total + content.length > HISTORY_BUDGET_CHARS && kept.length >= 2) break;
    kept.unshift(recent[i]);
    total += content.length;
  }
  return kept;
}

// Output budget per mode — shorter replies = far lower token burn.
function maxTokensFor(mode) {
  return mode === 'tech' ? 1024 : mode === 'simple' ? 384 : 512;
}

function isPureMath(s) {
  return (
    /[0-9]/.test(s) &&
    /[+\-*/%^×÷]/.test(s) &&
    /^[\d\s.()+\-*/%^×÷]+$/.test(s)
  );
}

// Some reasoning models reply with a "tool-call stub" ("Let me research…")
// instead of answering. Detect it so we can force a final direct answer.
function isStub(text) {
  const t = (text || '').trim();
  if (t.length > 200) return false;
  return /^(let me|i'?ll|i will|i can|ok(ay)?,?|sure,?|of course|i need to|just a moment|give me a moment)/i.test(t) &&
    /(search|research|gather|look up|find out|start|check)/i.test(t);
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
    // Token diet: fewer results, short snippets — search context stays small.
    let sources = [];
    let searched = false;
    let searchStatus = 'none';
    let searchContext = '';

    const explicitSearch = cleanMessage.match(/^!search\s+([\s\S]+)$/i);
    const wantsSearch = !!explicitSearch || (!!useWebSearch && SEARCH_RE.test(cleanMessage));

    if (!toolResult && wantsSearch) {
      const q = explicitSearch ? explicitSearch[1] : cleanMessage;
      try {
        sources = await webSearch(q, 4);
        searched = sources.length > 0;
        if (searched) {
          searchStatus = 'ok';
          searchContext = sources
            .map(
              (s, i) =>
                `[${i + 1}] ${s.title}\n    URL: ${s.url}\n    ${(s.snippet || '').slice(0, 160)}`
            )
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

    /* ---------- Optional downloadable report ---------- */
    const wantsDownload = !!toolResult || (!!openMatch ? false : DOWNLOAD_RE.test(cleanMessage));
    const wantsCsv = !toolResult && !openMatch && /csv|spreadsheet|excel|\.csv|table banao|list banao|sari cheezein/i.test(cleanMessage);

    /* ---------- AI response with provider fallback ---------- */
    const system = buildSystemPrompt({ mode, lang, searchContext, searchStatus });
    // Token diet: bounded history instead of the full conversation.
    const messages = [...trimHistory(cleanHistory).map((m) => ({ role: m.role, content: m.content })), { role: 'user', content: cleanMessage }];
    if (toolResult && toolResult.context) messages.push({ role: 'user', content: toolResult.context });

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 90000);
    try {
      let result = await callWithFallback({
        system,
        messages,
        temperature: 0.7,
        maxTokens: maxTokensFor(mode),
        signal: controller.signal
      });

      // The model asked for a web search in its reply (Sarvam emits tool-call
      // markup as text). Run the real search and retry once with results.
      let retriedTool = false;
      if (result.requestedTool && result.toolQuery && !searched && !retriedTool) {
        retriedTool = true;
        try {
          const results = await webSearch(result.toolQuery, 4);
          if (results.length > 0) {
            sources = results;
            searched = true;
            searchStatus = 'ok';
            searchContext = results
              .map((s, i) => `[${i + 1}] ${s.title}\n    URL: ${s.url}\n    ${(s.snippet || '').slice(0, 160)}`)
              .join('\n');
            result = await callWithFallback({
              system: buildSystemPrompt({ mode, lang, searchContext, searchStatus }),
              messages,
              temperature: 0.7,
              maxTokens: maxTokensFor(mode),
              signal: controller.signal
            });
          }
        } catch (e) {
          console.error('tool-search retry failed:', e.message);
        }
      }

      // Force-answer round: if the model only produced a stub ("Let me
      // research…") or kept asking for tools, append an explicit instruction
      // and ask once more so the user actually gets an answer.
      let forcedAnswer = false;
      if ((isStub(result.text) || result.requestedTool) && !forcedAnswer) {
        forcedAnswer = true;
        try {
          const pushMsg =
            'IMPORTANT: Do NOT call or mention any tool and do NOT say you will search/research first. The web search has already been completed (results are in your context if relevant). Answer the user\'s original request DIRECTLY now, in full, without any introduction stub.';
          result = await callWithFallback({
            system: buildSystemPrompt({ mode, lang, searchContext, searchStatus }),
            messages: [...messages, { role: 'user', content: pushMsg }],
            temperature: 0.7,
            maxTokens: maxTokensFor(mode),
            signal: controller.signal
          });
        } catch (e) {
          console.error('force-answer retry failed:', e.message);
        }
      }
      const { text, provider, model } = result;
      clearTimeout(timer);

      // Never deliver a tool-call stub as an answer, and never attach it as a
      // download: if the model still did not answer, say so honestly.
      if (!text || !text.trim() || isStub(text)) {
        return res.json({
          reply:
            'Priya ko aapka jawab banate waqt AI service se incomplete response mila — please ek baar phir se poochiye, ya thoda alag tareeke se likhiye. (Priya got an incomplete response from the AI service — please ask again.)',
          sources,
          searched,
          tool: false,
          provider,
          model,
          searchStatus,
          download: null,
          incomplete: true
        });
      }

      // CSV / spreadsheet requests: turn any markdown tables in the reply into a .csv download.
      const csv = wantsCsv ? replyToCsv(text) : null;
      return res.json({
        reply: text,
        sources,
        searched,
        tool: false,
        provider,
        model,
        searchStatus,
        download: wantsDownload
          ? {
              filename: `priya-${new Date().toISOString().slice(0, 10)}.md`,
              content: text,
              kind: 'md'
            }
          : csv
            ? {
                filename: `priya-${new Date().toISOString().slice(0, 10)}.csv`,
                content: csv,
                kind: 'csv'
              }
            : null
      });
    } catch (e) {
      clearTimeout(timer);
      throw e;
    }
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
    return res.status(503).json({
      error:
        'No AI provider is configured on the server. Set GEMINI_API_KEY, SARVAM_API_KEY or GROQ_API_KEY in the server .env file and restart.'
    });
  }
  const status = typeof err.status === 'number' && err.status >= 400 && err.status < 600 ? err.status : 500;
  res.status(status).json({
    error: err.message || 'Priya is temporarily unable to connect to the AI service. Please try again.'
  });
});

app.listen(PORT, () => {
  console.log(`Priya AI backend running on http://localhost:${PORT}`);
  for (const p of providerStatus()) {
    console.log(`  ${p.name.padEnd(11)} configured=${p.configured} model=${p.model || '-'}`);
  }
});
