'use strict';

// Fallback simulation tests for server/providers.js.
// Runs the REAL fallback code path with a stubbed global fetch:
//   1. gemini 429 -> falls back to groq (200) -> success
//   2. all providers 429 -> friendly error, gemini put in cooldown
//   3. cooldown: gemini is skipped after a 429
//   4. first provider succeeds -> no fallback needed
//   5. 401 (bad key) -> moves to next provider without treating as rate limit

const { callWithFallback, availableProviders } = require('./providers');

process.env.CHAT_PROVIDERS = 'gemini,groq,openrouter';

function json(status, obj) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => obj
  };
}

function geminiOk() {
  return json(200, { candidates: [{ content: { parts: [{ text: 'hi from gemini' }] } }] });
}
function groqOk() {
  return json(200, { choices: [{ message: { content: 'hi from groq' } }] });
}
function rl() {
  return json(429, { error: { message: 'rate limit exceeded', status: 'RESOURCE_EXHAUSTED' } });
}
function unauth() {
  return json(401, { error: { message: 'invalid api key' } });
}

let results = [];
let pass = 0;
let fail = 0;

function check(name, cond, extra) {
  results.push({ name, ok: !!cond, extra });
  cond ? pass++ : fail++;
}

async function main() {
  const realFetch = global.fetch;

  // --- Test 1: gemini 429 -> groq succeeds ---
  let calls = [];
  global.fetch = async (url) => {
    calls.push(url.includes('generativelanguage') ? 'gemini' : 'groq');
    return url.includes('generativelanguage') ? rl() : groqOk();
  };
  process.env.GEMINI_API_KEY = 'fake-gemini';
  process.env.GROQ_API_KEY = 'fake-groq';
  let r = await callWithFallback({ system: 's', messages: [{ role: 'user', content: 'hi' }], maxTokens: 512 });
  check('T1 gemini 429 falls back to groq', r.provider === 'groq' && r.text.includes('groq'), r);
  check('T1 gemini retried once then groq', calls.join(',') === 'gemini,gemini,groq', calls);

  // --- Test 3: cooldown — gemini skipped after its 429 ---
  // (gemini got cooled in T1; groq is still fresh)
  global.fetch = async (url) => (url.includes('generativelanguage') ? geminiOk() : groqOk());
  r = await callWithFallback({ system: 's', messages: [{ role: 'user', content: 'hi' }] });
  check('T3 gemini in cooldown -> groq used', r.provider === 'groq', r);
  const avail = availableProviders().map((p) => p.name);
  check('T3 availableProviders excludes gemini', !avail.includes('gemini'), avail);

  // --- Test 5: 401 on gemini -> groq succeeds (not cooldown-eligible, still moves on) ---
  global.fetch = async (url) => (url.includes('generativelanguage') ? unauth() : groqOk());
  r = await callWithFallback({ system: 's', messages: [{ role: 'user', content: 'hi' }] });
  check('T5 401 moves to next provider', r.provider === 'groq', r);

  // --- Test 2: all providers 429 -> friendly error ---
  global.fetch = async () => rl();
  let threw = false;
  try {
    await callWithFallback({ system: 's', messages: [{ role: 'user', content: 'hi' }] });
  } catch (e) {
    threw = true;
    check('T2 friendly rate-limit error', /rate limit/i.test(e.message), e.message);
    check('T2 status preserved', e.status === 429, e.status);
  }
  check('T2 all-down throws', threw);

  // --- Test 4: first provider succeeds directly ---
  // openrouter is the only one not in cooldown now; give it a fresh config via env check
  global.fetch = async (url) => (url.includes('openrouter') ? groqOk() : geminiOk());
  process.env.OPENROUTER_API_KEY = 'fake-or';
  r = await callWithFallback({ system: 's', messages: [{ role: 'user', content: 'hi' }] });
  check('T4 openrouter succeeds directly', r.provider === 'openrouter' && r.text.includes('groq'), r);

  // --- Test 6: nothing configured -> MISSING_KEY ---
  delete process.env.GEMINI_API_KEY;
  delete process.env.GROQ_API_KEY;
  delete process.env.OPENROUTER_API_KEY;
  threw = false;
  try {
    await callWithFallback({ system: 's', messages: [{ role: 'user', content: 'hi' }] });
  } catch (e) {
    threw = true;
    check('T6 MISSING_KEY code', e.code === 'MISSING_KEY' && e.status === 503, e);
  }
  check('T6 throws when nothing configured', threw);

  global.fetch = realFetch;

  for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${r.ok ? '' : '  -> ' + JSON.stringify(r.extra)}`);
  console.log(`\n${pass}/${pass + fail} passed`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error('TEST CRASH', e);
  process.exit(1);
});
