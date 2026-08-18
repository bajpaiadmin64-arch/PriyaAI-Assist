'use strict';

/**
 * Provider abstraction layer.
 *
 * Every provider is exposed through the same operations:
 *   chat(opts)             -> { text, model }   (non-streaming, always works)
 *   streamChat(opts)       -> AsyncGenerator<string> | null (null = no streaming)
 *   testConnection(creds)  -> { ok, message, latencyMs, code }
 *   getModels(creds)       -> [{ id, name }] (live where the API offers it)
 *
 * Priya AI -> Provider Manager -> Model Adapter -> Selected AI Model
 * Adding a provider = adding a catalog entry (+ an adapter if it is not
 * OpenAI-compatible / Gemini / Anthropic / Sarvam).
 */

const { chatCompat } = require('./openai-compat');
const { chatGemini } = require('./gemini');
const { chatSarvam } = require('./sarvam-llm');
const store = require('./provider-store');
const { CATALOG, CUSTOM_ID, findProvider } = require('./model-catalog');

/* ------------------------------------------------------------------ */
/* Error classification (used by testConnection and friendly fallback) */
/* ------------------------------------------------------------------ */

function classify(status, code, message) {
  const m = message || '';
  if (status === 401 || status === 403 || /API key not valid|invalid api key|unauthorized|permission denied/i.test(m)) {
    return 'AUTH';
  }
  if (status === 429 || /rate.?limit|RESOURCE_EXHAUSTED|quota|out of credits/i.test(m)) {
    return 'RATE_LIMIT';
  }
  if (status === 402) return 'QUOTA';
  if (status === 404) return 'ENDPOINT';
  if (status === 400 && /model|not found|does not exist|unknown/i.test(m)) return 'MODEL';
  if (status >= 500 || status === 0) return 'UNAVAILABLE';
  return status === 400 ? 'BAD_REQUEST' : 'UNKNOWN';
}

const CODE_MESSAGES = {
  AUTH: 'Authentication failed — the API key appears to be invalid or expired.',
  RATE_LIMIT: 'Rate limited — the provider is temporarily busy (or its free quota is exhausted).',
  QUOTA: 'Quota exhausted — the provider account has no remaining credits.',
  MODEL: 'Model not found — the model ID does not exist for this provider (or the key cannot access it).',
  ENDPOINT: 'Endpoint not found — check the Base URL.',
  UNAVAILABLE: 'Provider unavailable — network error or server problem. Try again later.',
  BAD_REQUEST: 'The provider rejected the request — verify the model ID and Base URL.',
  UNKNOWN: 'The provider returned an unexpected response.'
};

/* ------------------------------------------------------------------ */
/* Credential resolution                                                */
/* ------------------------------------------------------------------ */

/** Resolve the effective credentials for a provider id. */
function credsFor(providerId) {
  const entry = findProvider(providerId);
  const stored = store.list().find((p) => p.id === providerId);
  const apiKey = store.getKey(providerId);
  const model =
    (stored && stored.model) ||
    (entry && entry.models && entry.models[0] && entry.models[0].id) ||
    null;
  const baseUrl =
    (stored && stored.baseUrl) ||
    (entry && entry.baseUrl) ||
    null;
  return { providerId, apiKey, model, baseUrl, apiFormat: entry ? entry.apiFormat : 'openai', name: entry ? entry.name : providerId };
}

/** List of providers with a usable key, in fallback order (selected first). */
function configuredProviders() {
  const order = store.getOrder();
  const out = [];
  for (const id of order) {
    const c = credsFor(id);
    if (c.apiKey) out.push(c);
  }
  // Custom providers stored by the user come last (they are user-specific).
  for (const row of store.list()) {
    if (row.id === CUSTOM_ID && row.apiKey) {
      const c = credsFor(CUSTOM_ID);
      if (c.apiKey && !out.some((x) => x.providerId === CUSTOM_ID)) out.push(c);
    }
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Chat dispatch                                                        */
/* ------------------------------------------------------------------ */

function chatOpenAI(cfg, opts) {
  return chatCompat(
    {
      label: cfg.name || cfg.providerId,
      baseUrl: cfg.baseUrl,
      apiKey: cfg.apiKey,
      model: cfg.model
    },
    opts
  );
}

function chatAnthropic(cfg, { system, messages, temperature, maxTokens, signal }) {
  const url = `${(cfg.baseUrl || 'https://api.anthropic.com/v1').replace(/\/+$/, '')}/messages`;
  const body = {
    model: cfg.model,
    max_tokens: maxTokens || 4096,
    system,
    temperature: typeof temperature === 'number' ? temperature : 0.7,
    messages: messages.map((m) => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content }))
  };
  return fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': cfg.apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify(body),
    signal
  }).then(async (res) => {
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(friendlyProviderError(cfg.name || 'Anthropic', res.status, data));
      err.status = res.status;
      err.code = classify(res.status, null, (data.error && data.error.message) || '');
      throw err;
    }
    const text = (data.content || []).map((p) => (p.type === 'text' ? p.text : '')).join('').trim();
    if (!text) {
      const err = new Error('Priya could not generate a response. Please rephrase your message.');
      err.status = 200;
      throw err;
    }
    return { text, model: cfg.model };
  }).catch((e) => {
    if (e && e.status) throw e;
    const err = new Error('Priya is temporarily unable to connect to the AI service (network issue). Please try again.');
    err.status = 502;
    err.code = 'NETWORK';
    throw err;
  });
}

function friendlyProviderError(label, status, data) {
  const message = (data && data.error && data.error.message) || '';
  if (status === 401 || status === 403) return `Priya cannot authenticate with ${label}. The API key appears to be invalid or expired.`;
  if (status === 429) return `Priya hit a temporary rate limit on ${label}.`;
  if (status === 400) return `Priya could not use ${label}: ${message || 'the request was rejected.'}`;
  if (status >= 500) return `Priya is temporarily unable to reach ${label}.`;
  return `Priya is temporarily unable to connect to ${label}. Please try again.`;
}

/** Unified chat call for a configured provider. */
async function chatWith(providerId, opts) {
  const cfg = credsFor(providerId);
  if (!cfg.apiKey) {
    const err = new Error(`${cfg.name || providerId} is not configured (no API key).`);
    err.status = 503;
    err.code = 'MISSING_KEY';
    throw err;
  }
  switch (cfg.apiFormat) {
    case 'gemini': return chatGemini(opts, { apiKey: cfg.apiKey, model: cfg.model, baseUrl: cfg.baseUrl });
    case 'anthropic': return chatAnthropic(cfg, opts);
    case 'sarvam': return chatSarvam(opts, { apiKey: cfg.apiKey, model: cfg.model, baseUrl: cfg.baseUrl });
    default: return chatOpenAI(cfg, opts);
  }
}

/* ------------------------------------------------------------------ */
/* Streaming                                                            */
/* ------------------------------------------------------------------ */

async function* streamOpenAI(cfg, { system, messages, temperature, maxTokens, signal }) {
  const url = `${(cfg.baseUrl || '').replace(/\/+$/, '')}/chat/completions`;
  const body = {
    model: cfg.model,
    messages: [
      { role: 'system', content: system },
      ...messages.map((m) => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content }))
    ],
    temperature: typeof temperature === 'number' ? temperature : 0.7,
    max_tokens: maxTokens || 4096,
    stream: true
  };
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.apiKey}` },
    body: JSON.stringify(body),
    signal
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    const err = new Error(friendlyProviderError(cfg.name || cfg.providerId, res.status, data));
    err.status = res.status;
    throw err;
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split('\n');
    buf = lines.pop();
    for (const line of lines) {
      const t = line.trim();
      if (!t.startsWith('data:')) continue;
      const payload = t.slice(5).trim();
      if (payload === '[DONE]') return;
      try {
        const j = JSON.parse(payload);
        const delta = j.choices && j.choices[0] && j.choices[0].delta && j.choices[0].delta.content;
        if (delta) yield delta;
      } catch (e) { /* skip malformed chunk */ }
    }
  }
}

async function* streamGemini(cfg, { system, messages, temperature, maxTokens, signal }) {
  const base = (cfg.baseUrl || 'https://generativelanguage.googleapis.com/v1beta').replace(/\/+$/, '');
  const url = `${base}/models/${encodeURIComponent(cfg.model)}:streamGenerateContent?alt=sse`;
  const body = {
    contents: messages.map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] })),
    systemInstruction: { parts: [{ text: system }] },
    generationConfig: { temperature: typeof temperature === 'number' ? temperature : 0.7, maxOutputTokens: maxTokens || 4096 }
  };
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': cfg.apiKey },
    body: JSON.stringify(body),
    signal
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    const err = new Error(friendlyProviderError('Gemini', res.status, data));
    err.status = res.status;
    throw err;
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const parts = buf.split('\n');
    buf = parts.pop();
    for (const line of parts) {
      const t = line.trim();
      if (!t.startsWith('data:')) continue;
      try {
        const j = JSON.parse(t.slice(5).trim());
        const text = j.candidates && j.candidates[0] && j.candidates[0].content &&
          (j.candidates[0].content.parts || []).map((p) => p.text || '').join('');
        if (text) yield text;
      } catch (e) { /* skip */ }
    }
  }
}

async function* streamAnthropic(cfg, { system, messages, temperature, maxTokens, signal }) {
  const url = `${(cfg.baseUrl || 'https://api.anthropic.com/v1').replace(/\/+$/, '')}/messages`;
  const body = {
    model: cfg.model,
    max_tokens: maxTokens || 4096,
    system,
    temperature: typeof temperature === 'number' ? temperature : 0.7,
    messages: messages.map((m) => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content })),
    stream: true
  };
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': cfg.apiKey, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify(body),
    signal
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    const err = new Error(friendlyProviderError('Anthropic', res.status, data));
    err.status = res.status;
    throw err;
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split('\n');
    buf = lines.pop();
    for (const line of lines) {
      const t = line.trim();
      if (!t.startsWith('data:')) continue;
      try {
        const j = JSON.parse(t.slice(5).trim());
        if (j.type === 'content_block_delta' && j.delta && j.delta.type === 'text_delta' && j.delta.text) yield j.delta.text;
      } catch (e) { /* skip */ }
    }
  }
}

/** Streaming generator for a provider, or null when it cannot stream. */
function streamChatWith(providerId, opts) {
  const cfg = credsFor(providerId);
  if (!cfg.apiKey) return null;
  switch (cfg.apiFormat) {
    case 'gemini': return streamGemini(cfg, opts);
    case 'anthropic': return streamAnthropic(cfg, opts);
    case 'sarvam': return null;
    default: return streamOpenAI(cfg, opts);
  }
}

function supportsStreaming(providerId) {
  const cfg = credsFor(providerId);
  const entry = findProvider(providerId);
  if (cfg.apiFormat === 'sarvam') return false;
  const modelEntry = entry && entry.models.find((m) => m.id === cfg.model);
  return modelEntry ? !!modelEntry.streaming : cfg.apiFormat !== 'sarvam';
}

/* ------------------------------------------------------------------ */
/* Test connection                                                      */
/* ------------------------------------------------------------------ */

async function testConnection(providerId, creds = {}) {
  const entry = findProvider(providerId);
  const stored = store.list().find((p) => p.id === providerId);
  const apiKey = creds.apiKey || store.getKey(providerId);
  const model = creds.model || (stored && stored.model) || (entry && entry.models[0] && entry.models[0].id);
  const baseUrl = creds.baseUrl || (stored && stored.baseUrl) || (entry && entry.baseUrl) || '';
  const apiFormat = entry ? entry.apiFormat : 'openai';
  const label = creds.name || (entry ? entry.name : providerId);

  if (!apiKey) return { ok: false, message: 'No API key provided.', code: 'AUTH', latencyMs: 0 };
  if (!model) return { ok: false, message: 'No model selected.', code: 'MODEL', latencyMs: 0 };
  if (apiFormat !== 'gemini' && apiFormat !== 'anthropic' && apiFormat !== 'sarvam' && !baseUrl) {
    return { ok: false, message: 'No Base URL configured.', code: 'ENDPOINT', latencyMs: 0 };
  }

  const t0 = Date.now();
  try {
    let res;
    let data = {};
    if (apiFormat === 'gemini') {
      res = await fetch(`${baseUrl.replace(/\/+$/, '')}/models/${encodeURIComponent(model)}:generateContent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: 'Reply with exactly: OK' }] }],
          generationConfig: { maxOutputTokens: 8 }
        })
      });
    } else if (apiFormat === 'anthropic') {
      res = await fetch(`${baseUrl.replace(/\/+$/, '')}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model, max_tokens: 8, messages: [{ role: 'user', content: 'Reply with exactly: OK' }] })
      });
    } else {
      // openai / sarvam (both OpenAI-shaped bodies; Sarvam adds its own headers)
      const headers = { 'Content-Type': 'application/json' };
      if (apiFormat === 'sarvam') headers['api-subscription-key'] = apiKey;
      else headers.Authorization = `Bearer ${apiKey}`;
      const body = { model, messages: [{ role: 'user', content: 'Reply with exactly: OK' }] };
      const path = apiFormat === 'sarvam' ? '/v1/chat/completions' : '/chat/completions';
      res = await fetch(`${baseUrl.replace(/\/+$/, '')}${path}`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body)
      });
    }
    data = await res.json().catch(() => ({}));
    const latencyMs = Date.now() - t0;
    if (res.ok) {
      return { ok: true, message: 'Connection successful.', code: 'OK', latencyMs };
    }
    const msg = (data && data.error && data.error.message) || (data && data.message) || '';
    const code = classify(res.status, null, msg);
    return { ok: false, message: `${CODE_MESSAGES[code]} (${res.status})`, code, latencyMs };
  } catch (e) {
    const latencyMs = Date.now() - t0;
    return { ok: false, message: `${CODE_MESSAGES.UNAVAILABLE} (${e.message})`, code: 'UNAVAILABLE', latencyMs };
  }
}

/* ------------------------------------------------------------------ */
/* Model list                                                           */
/* ------------------------------------------------------------------ */

/** Live model list where the API offers it, otherwise the catalog models. */
async function getModels(providerId, apiKey) {
  const entry = findProvider(providerId);
  const catalogModels = entry ? entry.models.map((m) => ({ id: m.id, name: m.name })) : [];
  if (providerId === 'openrouter' && (apiKey || store.getKey('openrouter'))) {
    try {
      const res = await fetch('https://openrouter.ai/api/v1/models', {
        headers: { Authorization: `Bearer ${apiKey || store.getKey('openrouter')}` }
      });
      if (res.ok) {
        const data = await res.json();
        const models = (data.data || []).map((m) => ({ id: m.id, name: m.id }));
        if (models.length) return models;
      }
    } catch (e) { /* fall back to catalog */ }
  }
  return catalogModels;
}

module.exports = {
  credsFor, configuredProviders, chatWith, streamChatWith, supportsStreaming,
  testConnection, getModels, classify, CODE_MESSAGES
};