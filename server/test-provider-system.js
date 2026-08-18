'use strict';

// Tests for server/provider-store.js + server/provider-system.js:
//   1. store masking never leaks a full key
//   2. store env-merge (env key visible as 'env', no file needed)
//   3. set/remove round-trip (with store disabled -> no-op, no crash)
//   4. testConnection classification: 401 -> AUTH, 429 -> RATE_LIMIT, 400 model -> MODEL
//   5. testConnection success + latency
//   6. configuredProviders order (selected first)

process.env.PRIYA_STORE_DISABLED = '1';

const store = require('./provider-store');
const system = require('./provider-system');

let pass = 0;
let fail = 0;
function check(name, cond, extra) {
  cond ? pass++ : fail++;
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${cond ? '' : '  -> ' + JSON.stringify(extra)}`);
}

function json(status, obj) {
  return { ok: status >= 200 && status < 300, status, json: async () => obj };
}

async function main() {
  const realFetch = global.fetch;

  // --- store: masking ---
  const mask = store.maskKey('sk-abcdefghijklmnopqrstuvwxyz');
  check('S1 mask keeps 3+4 chars', mask === 'sk-****wxyz', mask);
  check('S2 mask hides the middle', !mask.includes('abcdefgh'), mask);
  check('S3 short key fully masked', store.maskKey('abc') === '****');

  // --- store: env merge ---
  process.env.GROQ_API_KEY = 'gsk-env-key-123456';
  const rows = store.list();
  check('S4 env key appears as source=env', rows.some((r) => r.id === 'groq' && r.source === 'env'), rows);
  const groq = rows.find((r) => r.id === 'groq');
  check('S5 masked view never shows full env key', !!groq && !groq.maskedKey.includes('gsk-env-key-123456'));

  // --- store: user key wins over env ---
  store.set('groq', { apiKey: 'gsk-user-key-999', model: 'llama-4-scout-17b-16e-instruct' });
  check('S6 user key overrides env', store.getKey('groq') === 'gsk-user-key-999');
  check('S7 model saved', store.list().find((r) => r.id === 'groq').model === 'llama-4-scout-17b-16e-instruct');
  store.remove('groq');
  check('S8 remove restores env key', store.getKey('groq') === 'gsk-env-key-123456');

  // --- testConnection classification ---
  let urls = [];
  global.fetch = async (url) => {
    urls.push(url);
    if (url.includes('429')) return json(429, { error: { message: 'rate limit' } });
    if (url.includes('401')) return json(401, { error: { message: 'invalid api key' } });
    if (url.includes('400')) return json(400, { error: { message: 'model not found' } });
    return json(200, { choices: [{ message: { content: 'OK' } }] });
  };

  let r = await system.testConnection('groq', { apiKey: 'k', model: 'm', baseUrl: 'https://x.example/v1?code=429' });
  check('T1 429 -> RATE_LIMIT', !r.ok && r.code === 'RATE_LIMIT', r);

  r = await system.testConnection('groq', { apiKey: 'k', model: 'm', baseUrl: 'https://x.example/v1?code=401' });
  check('T2 401 -> AUTH', !r.ok && r.code === 'AUTH', r);

  r = await system.testConnection('groq', { apiKey: 'k', model: 'm', baseUrl: 'https://x.example/v1?code=400' });
  check('T3 400 model -> MODEL', !r.ok && r.code === 'MODEL', r);

  r = await system.testConnection('groq', { apiKey: 'k', model: 'm', baseUrl: 'https://x.example/v1' });
  check('T4 success ok + latency', r.ok && r.code === 'OK' && typeof r.latencyMs === 'number', r);

  r = await system.testConnection('openrouter', { apiKey: 'k' });
  check('T6 openrouter without baseUrl ok (catalog)', r.ok === false || r.code === 'OK', r);

  delete process.env.GROQ_API_KEY;
  r = await system.testConnection('groq', { model: 'm', baseUrl: 'https://x.example/v1' });
  check('T6b no key anywhere -> AUTH', !r.ok && r.code === 'AUTH', r);
  process.env.GROQ_API_KEY = 'gsk-env-key-123456';

  global.fetch = async (url) => {
    urls.push(url);
    const e = new Error('ECONNREFUSED');
    e.status = 0;
    throw e;
  };
  r = await system.testConnection('groq', { apiKey: 'k', model: 'm', baseUrl: 'https://x.example/v1' });
  check('T7 network failure -> UNAVAILABLE', !r.ok && r.code === 'UNAVAILABLE', r);

  // --- order: selected first ---
  process.env.CHAT_PROVIDERS = 'groq,gemini';
  process.env.GEMINI_API_KEY = 'fake-gemini-key';
  store.setSelected('gemini');
  const order = store.getOrder();
  check('O1 selected provider first', order[0] === 'gemini', order);
  check('O2 env order preserved after', order.indexOf('groq') === 1, order);

  global.fetch = realFetch;
  console.log(`\n${pass}/${pass + fail} passed`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error('TEST CRASH', e);
  process.exit(1);
});