'use strict';

/**
 * Server-side AI provider key store.
 *
 * Keys added from the Settings UI live in server/data/providers.json
 * (gitignored — never committed). Keys from environment variables are merged
 * as read-only "env" entries so Render-style deployments keep working too.
 * The client NEVER sees a full key: list() returns masked versions only.
 */

const fs = require('fs');
const path = require('path');

const { findProvider } = require('./model-catalog');

const DATA_DIR = path.join(__dirname, 'data');
const STORE_FILE = path.join(DATA_DIR, 'providers.json');

const DEFAULT_ORDER = ['gemini', 'groq', 'openrouter', 'mistral', 'huggingface', 'pollinations', 'ollama', 'lmstudio', 'sarvam', 'deepseek', 'openai', 'anthropic', 'xai', 'together', 'cerebras', 'perplexity'];

let cache = null; // { providers: {id: {apiKey, model, baseUrl, name}}, selected: id, order: [] }

// Tests set PRIYA_STORE_DISABLED=1 to make the store read-only + empty.
const DISABLED = process.env.PRIYA_STORE_DISABLED === '1';

function load() {
  if (DISABLED) {
    if (!cache) cache = { providers: {}, selected: null, order: [] };
    return cache;
  }
  if (cache) return cache;
  try {
    cache = JSON.parse(fs.readFileSync(STORE_FILE, 'utf8'));
  } catch (e) {
    cache = { providers: {}, selected: null, order: [] };
  }
  if (!cache.providers) cache.providers = {};
  if (!Array.isArray(cache.order)) cache.order = [];
  return cache;
}

function persist() {
  if (DISABLED) return;
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(STORE_FILE, JSON.stringify(cache, null, 2));
  } catch (e) {
    console.error('provider store write failed:', e.message);
  }
}

/** Mask a key for display: keep first 3 + last 4 chars. */
function maskKey(key) {
  if (!key) return '';
  const k = String(key);
  if (k.length <= 8) return '****';
  return `${k.slice(0, 3)}****${k.slice(-4)}`;
}

/** Env variables that can carry keys per provider id. */
const ENV_MAP = {
  gemini: 'GEMINI_API_KEY',
  sarvam: 'SARVAM_API_KEY',
  openai: 'OPENAI_API_KEY',
  anthropic: 'ANTHROPIC_API_KEY',
  xai: 'XAI_API_KEY',
  deepseek: 'DEEPSEEK_API_KEY',
  mistral: 'MISTRAL_API_KEY',
  groq: 'GROQ_API_KEY',
  openrouter: 'OPENROUTER_API_KEY',
  together: 'TOGETHER_API_KEY',
  cerebras: 'CEREBRAS_API_KEY',
  huggingface: 'HF_API_KEY',
  perplexity: 'PERPLEXITY_API_KEY'
};

/** Full key for a provider: user-stored wins over env. */
function getKey(providerId) {
  const s = load();
  if (s.providers[providerId] && s.providers[providerId].apiKey) {
    return s.providers[providerId].apiKey;
  }
  const env = ENV_MAP[providerId];
  if (env && process.env[env]) return process.env[env];
  return null;
}

/** Public view: never includes full keys. */
function list() {
  const s = load();
  const out = [];
  const allIds = new Set([...Object.keys(s.providers), ...Object.keys(ENV_MAP)]);
  for (const id of allIds) {
    const stored = s.providers[id];
    const env = ENV_MAP[id];
    const envKey = env ? process.env[env] : null;
    const source = stored && stored.apiKey ? 'user' : envKey ? 'env' : null;
    if (!source) continue;
    out.push({
      id,
      source,
      apiKey: stored && stored.apiKey ? stored.apiKey : envKey,
      maskedKey: maskKey(stored && stored.apiKey ? stored.apiKey : envKey),
      model: stored && stored.model ? stored.model : envModel(id) || null,
      baseUrl: stored && stored.baseUrl ? stored.baseUrl : null,
      name: stored && stored.name ? stored.name : null
    });
  }
  return out;
}

function envModel(id) {
  switch (id) {
    case 'gemini': return process.env.GEMINI_MODEL || null;
    case 'sarvam': return process.env.SARVAM_LLM_MODEL || null;
    case 'groq': return process.env.GROQ_MODEL || null;
    case 'openrouter': return process.env.OPENROUTER_MODEL || null;
    case 'openai': return process.env.OPENAI_MODEL || null;
    default: return null;
  }
}

function isConfigured(id) {
  return !!getKey(id);
}

/** Save/replace a provider's credentials. */
function set(id, { apiKey, model, baseUrl, name }) {
  const s = load();
  if (!s.providers[id]) s.providers[id] = {};
  if (apiKey) s.providers[id].apiKey = String(apiKey).trim();
  if (model) s.providers[id].model = String(model).trim();
  if (baseUrl !== undefined) s.providers[id].baseUrl = baseUrl ? String(baseUrl).trim() : '';
  if (name !== undefined) s.providers[id].name = name ? String(name).trim() : '';
  persist();
  return maskKey(s.providers[id].apiKey);
}

function remove(id) {
  const s = load();
  if (s.providers[id]) delete s.providers[id];
  if (s.selected === id) s.selected = null;
  persist();
}

/** Selected (active) provider id. */
function getSelected() {
  return load().selected || null;
}

function setSelected(id) {
  const s = load();
  if (!id) {
    s.selected = null;
    persist();
    return null;
  }
  const entry = findProvider(id);
  // No-key providers (pollinations / local servers) can be selected without a key.
  const usable = isConfigured(id) || (s.providers[id] && s.providers[id].apiKey) || (entry && entry.keyRequired === false);
  if (usable) {
    s.selected = id;
    persist();
    return id;
  }
  return null;
}

/** Resolved fallback order: selected first, then stored order, then env, then default. */
function getOrder() {
  const s = load();
  const env = (process.env.CHAT_PROVIDERS || '')
    .split(',')
    .map((x) => x.trim().toLowerCase())
    .filter(Boolean);
  const order = [];
  const push = (id) => { if (id && !order.includes(id)) order.push(id); };
  if (s.selected) push(s.selected);
  for (const id of s.order) push(id);
  for (const id of env) push(id);
  for (const id of DEFAULT_ORDER) push(id);
  return order;
}

function setOrder(order) {
  const s = load();
  s.order = order.filter(Boolean);
  persist();
}

module.exports = {
  load, list, getKey, isConfigured, set, remove, getSelected, setSelected, getOrder, setOrder, maskKey, ENV_MAP, STORE_FILE
};
