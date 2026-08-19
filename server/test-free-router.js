'use strict';

/**
 * Free-first multi-provider router tests.
 * Run:  node --test test-free-router.js
 * (or together with the rest: node --test test-provider-system.js test-fallback.js test-csv.js test-free-router.js)
 *
 * Covers: tier metadata, free-first ordering, health cooldown escalation,
 * hard blocks (401/403/quota/model/endpoint), key-update resets, no-key
 * providers (Pollinations / local), local-provider detection gating, paid
 * providers never auto-first, persistence, and the ALL_UNAVAILABLE contract.
 */

process.env.PRIYA_STORE_DISABLED = '1'; // store read-only + empty
process.env.PRIYA_HEALTH_DISABLED = '1'; // health in-memory (no disk writes)

const { test } = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

const catalog = require('./model-catalog');
const store = require('./provider-store');
const health = require('./provider-health');
const providers = require('./providers');

const ALL_UNAVAILABLE_MSG = 'All currently configured AI providers are unavailable. Please add another API key or try again later.';

/* ---------- fetch mock: route by URL, never touches the network ---------- */
const routes = new Map(); // url-substring -> () => Response

function mockResponse(body, { status = 200, headers = {} } = {}) {
  return new Response(JSON.stringify(body), { status, headers });
}

function installFetchMock() {
  global.fetch = async (url) => {
    for (const [key, fn] of routes) {
      if (String(url).includes(key)) return fn();
    }
    return mockResponse({ error: { message: 'unmocked URL: ' + url } }, { status: 500 });
  };
}

function resetRoutes() {
  routes.clear();
  installFetchMock();
}

function okReply(provider) {
  routes.set(provider, () =>
    mockResponse(
      { choices: [{ message: { role: 'assistant', content: `hello from ${provider}` } }] },
      { headers: { 'x-ratelimit-remaining-requests': '42' } }
    )
  );
}

function failWith(provider, status, message) {
  routes.set(provider, () => mockResponse({ error: { message } }, { status }));
}

resetRoutes();

/* ---------- helpers ---------- */
function clearEnvProviders() {
  delete process.env.CHAT_PROVIDERS;
  for (const k of Object.keys(process.env)) {
    if (/_(API_KEY|MODEL)$/.test(k)) delete process.env[k];
  }
}

/* ================================================================== */
test('catalog: every provider has tier metadata, no-key entries marked', () => {
  for (const p of catalog.CATALOG) {
    assert.ok(['free', 'nokey', 'paid'].includes(p.tier), `${p.id} tier`);
    if (p.tier !== 'free') assert.ok(!p.freeLabel || typeof p.freeLabel === 'string');
  }
  const poll = catalog.findProvider('pollinations');
  assert.strictEqual(poll.tier, 'nokey');
  assert.strictEqual(poll.keyRequired, false);
  assert.strictEqual(catalog.findProvider('ollama').local, true);
  assert.strictEqual(catalog.findProvider('lmstudio').local, true);
  assert.strictEqual(catalog.findProvider('gemini').tier, 'free');
  assert.strictEqual(catalog.findProvider('deepseek').tier, 'paid');
  // openrouter default model = the free router
  assert.strictEqual(catalog.findProvider('openrouter').models[0].id, 'openrouter/free');
});

test('catalog: default order is free-first (free -> nokey -> paid)', () => {
  const order = catalog.defaultOrder();
  const rank = order.map((id) => catalog.tierRank(id));
  const maxFree = Math.max(...order.map((id, i) => (rank[i] === 1 ? i : -1)));
  const minNokey = Math.min(...order.map((id, i) => (rank[i] === 2 ? i : Infinity)));
  const minPaid = Math.min(...order.map((id, i) => (rank[i] === 3 ? i : Infinity)));
  assert.ok(maxFree < minNokey, 'free before nokey');
  assert.ok(minNokey < minPaid, 'nokey before paid');
  assert.strictEqual(order[0], 'gemini');
});

test('store: selected first, then env, then free-first default', () => {
  clearEnvProviders();
  process.env.GROQ_API_KEY = 'grok-key';
  process.env.DEEPSEEK_API_KEY = 'deep-key';
  const order = store.getOrder();
  assert.ok(order.indexOf('groq') < order.indexOf('deepseek'), 'free before paid');
  assert.ok(order.indexOf('gemini') < order.indexOf('sarvam'), 'gemini before paid sarvam');
  // selected provider goes first
  store.setSelected('deepseek');
  assert.strictEqual(store.getOrder()[0], 'deepseek');
  store.setSelected(null);
});

test('router: paid provider is never auto-selected before free ones', () => {
  clearEnvProviders();
  process.env.GROQ_API_KEY = 'grok-key';
  process.env.DEEPSEEK_API_KEY = 'deep-key';
  const names = providers.availableProviders().map((c) => c.name);
  assert.ok(names.indexOf('groq') < names.indexOf('deepseek'), `order was ${names}`);
  assert.ok(names.includes('groq') && names.includes('deepseek'));
});

test('router: local providers are excluded when no local server is detected', () => {
  clearEnvProviders();
  process.env.GROQ_API_KEY = 'grok-key';
  health.setLocalStatus({ ollama: false, lmstudio: false });
  process.env.CHAT_PROVIDERS = 'ollama,lmstudio,groq';
  const names = providers.availableProviders().map((c) => c.name);
  assert.ok(!names.includes('ollama'), `got ${names}`);
  assert.ok(!names.includes('lmstudio'), `got ${names}`);
  assert.strictEqual(names[0], 'groq', `got ${names}`);
});

test('router: local providers are included when detected running', () => {
  clearEnvProviders();
  process.env.GROQ_API_KEY = 'grok-key';
  health.setLocalStatus({ ollama: true, lmstudio: false });
  process.env.CHAT_PROVIDERS = 'ollama,groq';
  const names = providers.availableProviders().map((c) => c.name);
  assert.strictEqual(names[0], 'ollama', `got ${names}`);
  assert.ok(names.includes('groq'), `got ${names}`);
  health.setLocalStatus({ ollama: false, lmstudio: false });
});

test('router: no-key mode — Pollinations works with ZERO keys configured', async () => {
  clearEnvProviders();
  process.env.CHAT_PROVIDERS = 'pollinations';
  routes.set('text.pollinations.ai', () =>
    mockResponse({ choices: [{ message: { role: 'assistant', content: 'free answer' } }] })
  );
  const res = await providers.callWithFallback({ system: 's', messages: [{ role: 'user', content: 'hi' }] });
  assert.strictEqual(res.provider, 'pollinations');
  assert.strictEqual(res.text, 'free answer');
  assert.strictEqual(health.lastWorking(), 'pollinations');
});

test('router: rate limit (429) falls back to next provider + records cooldown + remaining quota', async () => {
  health.resetAll();
  clearEnvProviders();
  process.env.CHAT_PROVIDERS = 'groq,openai';
  process.env.GROQ_API_KEY = 'grok-key';
  process.env.OPENAI_API_KEY = 'oai-key';
  failWith('api.groq.com', 429, 'rate limited');
  okReply('api.openai.com');

  const res = await providers.callWithFallback({ system: 's', messages: [{ role: 'user', content: 'hi' }] });
  assert.strictEqual(res.provider, 'openai');
  assert.strictEqual(res.text, 'hello from api.openai.com');

  const g = health.statusFor('groq');
  assert.strictEqual(g.state, 'cooldown');
  assert.ok(g.cooldownSec >= 58 && g.cooldownSec <= 60, `cooldown ${g.cooldownSec}s`);
  assert.strictEqual(g.errorCode, 'RATE_LIMIT');
  // rate-limit header captured from the successful provider
  assert.strictEqual(health.statusFor('openai').remaining, 42);
  // groq now skipped from the chain
  assert.ok(!providers.availableProviders().some((c) => c.name === 'groq'));
  // success reset the previous cooldown of groq? no — but a success elsewhere
  // must NOT have cleared it; a later groq success would.
});

test('router: repeated 429s escalate the cooldown (60s -> 5min -> 30min -> 2h)', () => {
  health.resetAll();
  health.recordFailure('groq', { code: 'RATE_LIMIT', status: 429, message: 'x' });
  assert.strictEqual(health.statusFor('groq').state, 'cooldown');
  const c1 = health.statusFor('groq').cooldownSec;
  health.recordFailure('groq', { code: 'RATE_LIMIT', status: 429, message: 'x' });
  const c2 = health.statusFor('groq').cooldownSec;
  health.recordFailure('groq', { code: 'RATE_LIMIT', status: 429, message: 'x' });
  const c3 = health.statusFor('groq').cooldownSec;
  health.recordFailure('groq', { code: 'RATE_LIMIT', status: 429, message: 'x' });
  const c4 = health.statusFor('groq').cooldownSec;
  assert.ok(c2 > c1, `${c1} -> ${c2}`);
  assert.ok(c3 > c2, `${c2} -> ${c3}`);
  assert.ok(c4 > c3, `${c3} -> ${c4}`);
  assert.strictEqual(c4, 7200, 'caps at 2h');
  health.resetAll();
});

test('router: invalid key (401) blocks for 12h and is skipped; key update clears instantly', async () => {
  health.resetAll();
  clearEnvProviders();
  process.env.CHAT_PROVIDERS = 'groq,openai';
  process.env.GROQ_API_KEY = 'grok-key';
  process.env.OPENAI_API_KEY = 'oai-key';
  failWith('api.groq.com', 401, 'API key not valid');
  okReply('api.openai.com');

  const res = await providers.callWithFallback({ system: 's', messages: [{ role: 'user', content: 'hi' }] });
  assert.strictEqual(res.provider, 'openai');
  const g = health.statusFor('groq');
  assert.strictEqual(g.state, 'blocked');
  assert.strictEqual(g.errorCode, 'AUTH');
  assert.ok(g.cooldownSec >= 43000, `block ${g.cooldownSec}s`);

  health.keyUpdated('groq');
  assert.strictEqual(health.statusFor('groq').state, 'ok');
  assert.ok(providers.availableProviders().some((c) => c.name === 'groq'));
});

test('router: quota / model / endpoint errors block hard (12h), success resets everything', async () => {
  health.resetAll();
  health.recordFailure('gemini', { code: 'QUOTA', status: 402, message: 'out of credits' });
  assert.strictEqual(health.statusFor('gemini').state, 'blocked');
  health.recordFailure('groq', { code: 'MODEL', status: 400, message: 'model not found' });
  assert.strictEqual(health.statusFor('groq').state, 'blocked');
  health.recordFailure('openrouter', { code: 'ENDPOINT', status: 404, message: 'not found' });
  assert.strictEqual(health.statusFor('openrouter').state, 'blocked');

  // a success resets all three kinds
  health.recordSuccess('gemini');
  health.recordSuccess('groq');
  health.recordSuccess('openrouter');
  for (const id of ['gemini', 'groq', 'openrouter']) {
    const s = health.statusFor(id);
    assert.strictEqual(s.state, 'ok', id);
    assert.strictEqual(s.failures, 0, id);
  }
  assert.strictEqual(health.lastWorking(), 'openrouter');
});

test('router: ALL_UNAVAILABLE with the exact contract message when everything fails', async () => {
  health.resetAll();
  clearEnvProviders();
  process.env.CHAT_PROVIDERS = 'groq,openai';
  process.env.GROQ_API_KEY = 'grok-key';
  process.env.OPENAI_API_KEY = 'oai-key';
  failWith('api.groq.com', 429, 'rate limited');
  failWith('api.openai.com', 502, 'boom');
  failWith('text.pollinations.ai', 503, 'busy'); // no-key fallback must fail too

  await assert.rejects(
    () => providers.callWithFallback({ system: 's', messages: [{ role: 'user', content: 'hi' }] }),
    (err) => err.code === 'ALL_UNAVAILABLE' && err.message === ALL_UNAVAILABLE_MSG && err.status === 503
  );
  assert.strictEqual(health.statusFor('groq').state, 'cooldown');
  assert.strictEqual(health.statusFor('openai').state, 'cooldown');
  assert.strictEqual(health.statusFor('pollinations').state, 'cooldown');
});

test('router: MISSING_KEY when the forced provider is not configured at all', async () => {
  health.resetAll();
  clearEnvProviders();
  await assert.rejects(
    () => providers.callWithFallback({ system: 's', messages: [{ role: 'user', content: 'hi' }], providerId: 'custom' }),
    (err) => err.code === 'MISSING_KEY' && err.status === 503
  );
});

test('router: forced provider that is cooldown/blocked falls back through the chain', async () => {
  health.resetAll();
  clearEnvProviders();
  process.env.CHAT_PROVIDERS = 'groq,openai';
  process.env.GROQ_API_KEY = 'grok-key';
  process.env.OPENAI_API_KEY = 'oai-key';
  health.recordFailure('groq', { code: 'RATE_LIMIT', status: 429, message: 'x' });
  okReply('api.openai.com');
  const res = await providers.callWithFallback({
    system: 's',
    messages: [{ role: 'user', content: 'hi' }],
    providerId: 'groq'
  });
  assert.strictEqual(res.provider, 'openai');
  health.resetAll();
});

test('router: providerStatus exposes tier / health fields for the dashboard', () => {
  clearEnvProviders();
  process.env.GROQ_API_KEY = 'grok-key';
  health.recordFailure('groq', { code: 'RATE_LIMIT', status: 429, message: 'x' });
  const list = providers.providerStatus();
  const groq = list.find((p) => p.name === 'groq');
  assert.strictEqual(groq.tier, 'free');
  assert.ok(groq.freeLabel);
  assert.strictEqual(groq.keyRequired, true);
  assert.strictEqual(groq.state, 'cooldown');
  assert.ok(groq.cooldownSec > 0);
  const poll = list.find((p) => p.name === 'pollinations');
  assert.strictEqual(poll.tier, 'nokey');
  assert.strictEqual(poll.keyRequired, false);
  assert.strictEqual(poll.configured, true);
  const lm = list.find((p) => p.name === 'lmstudio');
  assert.strictEqual(lm.local, true);
  health.resetAll();
});

/* ================================================================== */
test('persistence: health state survives a fresh module load (disk file)', () => {
  const file = path.join(os.tmpdir(), `priya-health-${Date.now()}.json`);
  try {
    process.env.PRIYA_HEALTH_FILE = file;
    process.env.PRIYA_HEALTH_DISABLED = '0';

    const loadFresh = () => {
      delete require.cache[require.resolve('./provider-health')];
      return require('./provider-health');
    };

    const h1 = loadFresh();
    h1.recordFailure('groq', { code: 'RATE_LIMIT', status: 429, message: 'x' });
    h1.recordSuccess('openai');
    h1.setLocalStatus({ ollama: true, lmstudio: false });

    const h2 = loadFresh();
    assert.strictEqual(h2.statusFor('groq').state, 'cooldown');
    assert.strictEqual(h2.lastWorking(), 'openai');
    assert.deepStrictEqual(h2.localStatus(), { ollama: true, lmstudio: false });

    // blocked states persist too
    h2.recordFailure('gemini', { code: 'AUTH', status: 401, message: 'bad key' });
    const h3 = loadFresh();
    assert.strictEqual(h3.statusFor('gemini').state, 'blocked');
  } finally {
    try { fs.unlinkSync(file); } catch (e) { /* ignore */ }
    process.env.PRIYA_HEALTH_DISABLED = '1';
    delete process.env.PRIYA_HEALTH_FILE;
    delete require.cache[require.resolve('./provider-health')];
  }
});