'use strict';

require('dotenv').config();

const path = require('path');
const express = require('express');
const { callWithFallback, providerStatus } = require('./providers');
const store = require('./provider-store');
const providerSystem = require('./provider-system');
const health = require('./provider-health');
const { CATALOG, CUSTOM_ID, findProvider, defaultOrder } = require('./model-catalog');
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
  const selected = store.getSelected();
  const selInfo = selected ? providerSystem.credsFor(selected) : null;
  res.json({
    status: 'ok',
    model: configured ? configured.model : null,
    configured: !!configured,
    provider: configured ? configured.name : 'none',
    providers,
    selected: selInfo ? { provider: selected, label: selInfo.name, model: selInfo.model } : null,
    local: health.localStatus(),
    lastWorking: health.lastWorking()
  });
});

/* ---------- AI Provider Manager (Settings → AI Models & API) ---------- */

// Full provider view for the settings UI. Never contains a complete key.
function providerListView() {
  const selected = store.getSelected();
  const stored = store.list();
  const list = [];
  for (const entry of CATALOG) {
    const row = stored.find((p) => p.id === entry.id);
    list.push({
      id: entry.id,
      name: entry.name,
      apiFormat: entry.apiFormat,
      baseUrl: entry.baseUrl,
      docs: entry.docs,
      notes: entry.notes,
      keyEnv: entry.keyEnv,
      models: entry.models,
      tier: entry.tier,
      freeLabel: entry.freeLabel || null,
      keyRequired: entry.keyRequired !== false,
      local: !!entry.local,
      source: row ? row.source : null,
      maskedKey: row ? row.maskedKey : null,
      model: (row && row.model) || (entry.models && entry.models[0] && entry.models[0].id) || null,
      configured: !!store.getKey(entry.id) || entry.keyRequired === false,
      selected: selected === entry.id
    });
  }
  const customRow = stored.find((p) => p.id === CUSTOM_ID);
  list.push({
    id: CUSTOM_ID,
    name: 'Custom (OpenAI-compatible)',
    apiFormat: 'openai',
    baseUrl: customRow && customRow.baseUrl ? customRow.baseUrl : null,
    docs: null,
    notes: 'Any OpenAI-compatible endpoint: base URL, model, key. E.g. LM Studio, Ollama, local servers, or private gateways.',
    models: [],
    source: customRow ? customRow.source : null,
    maskedKey: customRow ? customRow.maskedKey : null,
    model: customRow ? customRow.model : null,
    configured: !!store.getKey(CUSTOM_ID),
    selected: selected === CUSTOM_ID
  });
  return list;
}

app.get('/api/providers', (_req, res) => {
  const cooldowns = providerStatus();
  const providers = providerListView().map((p) => {
    const cd = cooldowns.find((c) => c.name === p.id);
    return {
      ...p,
      state: cd ? cd.state : 'ok',
      errorCode: cd ? cd.errorCode : null,
      reason: cd ? cd.reason : null,
      cooldownSec: cd ? cd.cooldownSec : 0,
      failures: cd ? cd.failures : 0,
      lastSuccess: cd ? cd.lastSuccess : null,
      remaining: cd ? cd.remaining : null
    };
  });
  const selected = store.getSelected();
  res.json({ providers, selected, order: store.getOrder(), defaultOrder: defaultOrder(), local: health.localStatus(), lastWorking: health.lastWorking() });
});

app.post('/api/providers/test', async (req, res, next) => {
  try {
    const { providerId, apiKey, model, baseUrl, name } = req.body || {};
    if (!providerId || typeof providerId !== 'string') {
      return res.status(400).json({ error: 'providerId is required.' });
    }
    const result = await providerSystem.testConnection(providerId.trim(), { apiKey, model, baseUrl, name });
    res.json(result);
  } catch (e) {
    next(e);
  }
});

app.put('/api/providers/keys', async (req, res, next) => {
  try {
    const { providerId, apiKey, model, baseUrl, name } = req.body || {};
    if (!providerId || typeof providerId !== 'string') {
      return res.status(400).json({ error: 'providerId is required.' });
    }
    const id = providerId.trim();
    if (id === 'custom' && (!baseUrl || !baseUrl.trim())) {
      return res.status(400).json({ error: 'A Base URL is required for custom providers.' });
    }
    if (apiKey && typeof apiKey === 'string' && apiKey.trim().length > 400) {
      return res.status(400).json({ error: 'API key looks too long (max 400 characters).' });
    }
    const entry = findProvider(id);
    if (!entry && id !== CUSTOM_ID) {
      return res.status(400).json({ error: `Unknown provider: ${id}` });
    }
    const masked = store.set(id, { apiKey, model, baseUrl, name });
    // A fresh key deserves a fresh slate — drop cooldowns/blocks instantly.
    health.keyUpdated(id);
    res.json({ ok: true, maskedKey: masked, configured: true });
  } catch (e) {
    next(e);
  }
});

app.delete('/api/providers/keys/:providerId', (req, res) => {
  const id = (req.params.providerId || '').trim();
  store.remove(id);
  health.keyUpdated(id);
  res.json({ ok: true });
});

app.post('/api/providers/select', (req, res) => {
  const id = (req.body && req.body.providerId ? req.body.providerId : '').trim();
  if (!id) return res.status(400).json({ error: 'providerId is required.' });
  const ok = store.setSelected(id);
  if (!ok) {
    return res.status(400).json({ error: 'That provider is not usable yet — add its API key first (or start Ollama / LM Studio for local providers).' });
  }
  const cfg = providerSystem.credsFor(id);
  res.json({ ok: true, selected: id, provider: id, model: cfg.model, label: findProvider(id) ? findProvider(id).name : 'Custom' });
});

app.get('/api/providers/selection', (_req, res) => {
  const id = store.getSelected();
  if (!id) return res.json({ selected: null });
  const cfg = providerSystem.credsFor(id);
  const entry = findProvider(id);
  res.json({ selected: id, provider: id, model: cfg.model, label: entry ? entry.name : 'Custom' });
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

function trimHistory(messages, budgetChars) {
  const budget = typeof budgetChars === 'number' && budgetChars > 0 ? budgetChars : HISTORY_BUDGET_CHARS;
  const recent = messages.slice(-HISTORY_MAX_TURNS);
  let total = 0;
  const kept = [];
  for (let i = recent.length - 1; i >= 0; i--) {
    const content = recent[i].content || '';
    if (total + content.length > budget && kept.length >= 2) break;
    kept.unshift(recent[i]);
    total += content.length;
  }
  return kept;
}

// Per-model context window: small-context models get a smaller history
// budget; large ones stay within the cost-friendly token diet cap.
function contextBudgetChars() {
  const sel = store.getSelected();
  if (!sel) return HISTORY_BUDGET_CHARS;
  const cfg = providerSystem.credsFor(sel);
  const entry = findProvider(sel);
  const m = entry && entry.models.find((x) => x.id === cfg.model);
  const ctx = m && m.context ? m.context : 32768;
  return Math.min(HISTORY_BUDGET_CHARS, Math.max(1500, Math.round(ctx / 4)));
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

// Shared pipeline: validation, tool routing, optional search. Returns the
// context used by both the JSON and the streaming chat handlers.
async function prepareChat({ message, history, mode, useWebSearch, lang }) {
  const cleanMessage = message.trim();
  const cleanHistory = Array.isArray(history)
    ? history
        .filter((m) => m && typeof m.content === 'string' && typeof m.role === 'string')
        .slice(-30)
    : [];

  let toolResult = null;

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

  const openMatch = cleanMessage.match(/^!open\s+(\S+)$/i);
  if (!toolResult && openMatch) {
    const page = await fetchPage(openMatch[1]);
    toolResult = {
      text: `I read the page "${page.title}" (${page.url}) — summary below.`,
      context: `PAGE CONTENT (fetched just now from ${page.url}):\n${page.text}`
    };
  }

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
          .map((s, i) => `[${i + 1}] ${s.title}\n    URL: ${s.url}\n    ${(s.snippet || '').slice(0, 160)}`)
          .join('\n');
      } else {
        searchStatus = 'failed';
      }
    } catch (e) {
      console.error('search failed:', e.message);
      searchStatus = 'failed';
    }
  }

  const wantsDownload = !!toolResult || (!!openMatch ? false : DOWNLOAD_RE.test(cleanMessage));
  const wantsCsv = !toolResult && !openMatch && /csv|spreadsheet|excel|\.csv|table banao|list banao|sari cheezein/i.test(cleanMessage);

  const system = buildSystemPrompt({ mode, lang, searchContext, searchStatus });
  const messages = [...trimHistory(cleanHistory, contextBudgetChars()).map((m) => ({ role: m.role, content: m.content })), { role: 'user', content: cleanMessage }];
  if (toolResult && toolResult.context) messages.push({ role: 'user', content: toolResult.context });

  return {
    toolResult, openMatch, sources, searched, searchStatus, searchContext,
    system, messages, wantsDownload, wantsCsv, mode, lang
  };
}

function buildDownload(text, wantsDownload, wantsCsv) {
  const csv = wantsCsv ? replyToCsv(text) : null;
  if (wantsDownload) {
    return { filename: `priya-${new Date().toISOString().slice(0, 10)}.md`, content: text, kind: 'md' };
  }
  if (csv) {
    return { filename: `priya-${new Date().toISOString().slice(0, 10)}.csv`, content: csv, kind: 'csv' };
  }
  return null;
}

// Streaming branch: SSE deltas of the final model answer. Returns false when
// the response must be sent as normal JSON instead (no streaming support).
async function streamAnswer(res, ctx, providerId) {
  const selected = providerId || store.getSelected() || null;
  if (!selected || !providerSystem.supportsStreaming(selected)) return false;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 90000);
  try {
    const gen = providerSystem.streamChatWith(selected, {
      system: ctx.system,
      messages: ctx.messages,
      temperature: 0.7,
      maxTokens: maxTokensFor(ctx.mode),
      signal: controller.signal
    });
    if (!gen) {
      clearTimeout(timer);
      return false;
    }
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    const send = (obj) => { try { res.write(`data: ${JSON.stringify(obj)}\n\n`); } catch (e) { /* client gone */ } };
    const cfg = providerSystem.credsFor(selected);
    send({ type: 'start', provider: selected, model: cfg.model });
    let text = '';
    for await (const delta of gen) {
      text += delta;
      send({ type: 'delta', text: delta });
    }
    clearTimeout(timer);
    health.recordSuccess(selected);
    if (!text.trim() || isStub(text)) {
      send({ type: 'error', message: 'Priya got an incomplete response from the AI service — please try again.' });
      res.end();
      return true;
    }
    send({
      type: 'done',
      reply: text,
      provider: selected,
      model: cfg.model,
      sources: ctx.sources,
      searched: ctx.searched,
      searchStatus: ctx.searchStatus,
      download: buildDownload(text, ctx.wantsDownload, ctx.wantsCsv)
    });
    res.end();
    return true;
  } catch (e) {
    clearTimeout(timer);
    health.recordFailure(selected, { code: providerSystem.classify(e.status, e.code, e.message), status: e.status, message: e.message });
    if (!text) {
      // Nothing was streamed yet — continue the conversation on the next
      // available provider automatically (free-first chain).
      try {
        const fb = await callWithFallback({
          system: ctx.system,
          messages: ctx.messages,
          temperature: 0.7,
          maxTokens: maxTokensFor(ctx.mode),
          providerId
        });
        const send2 = (obj) => { try { res.write(`data: ${JSON.stringify(obj)}\n\n`); } catch (err) { /* client gone */ } };
        send2({
          type: 'done',
          reply: fb.text,
          provider: fb.provider,
          model: fb.model,
          sources: ctx.sources,
          searched: ctx.searched,
          searchStatus: ctx.searchStatus,
          download: buildDownload(fb.text, ctx.wantsDownload, ctx.wantsCsv)
        });
        res.end();
        return true;
      } catch (err2) { /* fall through to the error event below */ }
    }
    const msg = (e && e.status >= 400 && e.status < 600) ? e.message : 'Priya hit a temporary issue — please try again.';
    try { res.write(`data: ${JSON.stringify({ type: 'error', message: msg })}\n\n`); res.end(); } catch (err) { /* ignore */ }
    return true;
  }
}

app.post('/api/chat', async (req, res, next) => {
  try {
    const { message, history, mode, useWebSearch, lang, providerId, stream } = req.body || {};

    if (!message || typeof message !== 'string' || !message.trim()) {
      return res.status(400).json({ error: 'Message is required.' });
    }
    if (message.trim().length > 20000) {
      return res.status(400).json({ error: 'Message is too long (max 20000 characters).' });
    }

    const ctx = await prepareChat({ message, history, mode, useWebSearch, lang });

    /* ---------- Direct tool answers (no LLM call) ---------- */
    if (ctx.toolResult) {
      return res.json({
        reply: ctx.toolResult.text,
        sources: ctx.sources,
        searched: ctx.searched,
        tool: true,
        provider: 'tool',
        model: null,
        searchStatus: ctx.searchStatus
      });
    }

    /* ---------- Streaming (when the selected model supports it) ---------- */
    if (stream) {
      const handled = await streamAnswer(res, ctx, providerId);
      if (handled) return; // SSE was sent
      // else: fall through to the normal JSON path
    }

    /* ---------- AI response with provider fallback ---------- */
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 90000);
    try {
      let result = await callWithFallback({
        system: ctx.system,
        messages: ctx.messages,
        temperature: 0.7,
        maxTokens: maxTokensFor(ctx.mode),
        signal: controller.signal,
        providerId
      });

      // The model asked for a web search in its reply (Sarvam emits tool-call
      // markup as text). Run the real search and retry once with results.
      let retriedTool = false;
      if (result.requestedTool && result.toolQuery && !ctx.searched && !retriedTool) {
        retriedTool = true;
        try {
          const results = await webSearch(result.toolQuery, 4);
          if (results.length > 0) {
            ctx.sources = results;
            ctx.searched = true;
            ctx.searchStatus = 'ok';
            ctx.searchContext = results
              .map((s, i) => `[${i + 1}] ${s.title}\n    URL: ${s.url}\n    ${(s.snippet || '').slice(0, 160)}`)
              .join('\n');
            result = await callWithFallback({
              system: buildSystemPrompt({ mode: ctx.mode, lang: ctx.lang, searchContext: ctx.searchContext, searchStatus: ctx.searchStatus }),
              messages: ctx.messages,
              temperature: 0.7,
              maxTokens: maxTokensFor(ctx.mode),
              signal: controller.signal,
              providerId
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
            system: buildSystemPrompt({ mode: ctx.mode, lang: ctx.lang, searchContext: ctx.searchContext, searchStatus: ctx.searchStatus }),
            messages: [...ctx.messages, { role: 'user', content: pushMsg }],
            temperature: 0.7,
            maxTokens: maxTokensFor(ctx.mode),
            signal: controller.signal,
            providerId
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
          sources: ctx.sources,
          searched: ctx.searched,
          tool: false,
          provider,
          model,
          searchStatus: ctx.searchStatus,
          download: null,
          incomplete: true
        });
      }

      // CSV / spreadsheet requests: turn any markdown tables in the reply into a .csv download.
      return res.json({
        reply: text,
        sources: ctx.sources,
        searched: ctx.searched,
        tool: false,
        provider,
        model,
        searchStatus: ctx.searchStatus,
        download: buildDownload(text, ctx.wantsDownload, ctx.wantsCsv)
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
      error: 'No AI provider is configured on the server. Add an API key in Settings → AI Models & API, or set GEMINI_API_KEY / SARVAM_API_KEY / GROQ_API_KEY in the server .env file and restart.'
    });
  }
  if (err.status === 503 && err.code === 'ALL_UNAVAILABLE') {
    return res.status(503).json({
      error: 'All currently configured AI providers are unavailable. Please add another API key or try again later.'
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
    console.log(`  ${p.name.padEnd(11)} tier=${(p.tier || '?').padEnd(5)} configured=${p.configured} model=${p.model || '-'}`);
  }
  // Local AI detection (Ollama / LM Studio) — refreshed periodically so the
  // no-key tier lights up as soon as a local server starts.
  const refreshLocal = async () => {
    try {
      health.setLocalStatus(await providerSystem.detectLocal());
    } catch (e) { /* probe is best-effort */ }
  };
  refreshLocal();
  setInterval(refreshLocal, 15000);
});
