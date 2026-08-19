'use strict';

/**
 * Persistent per-provider health state for the free-first automatic router.
 *
 * What it tracks:
 *   - cooldown (soft, transient errors): rate limits and network/5xx errors
 *     cool a provider down for a while. Rate limits ESCALATE on repeats:
 *     60s -> 5min -> 30min -> 2h (reset after a success or a key change).
 *   - blocked (hard, durable errors): invalid/expired keys (401/403), quota
 *     exhaustion, unknown models and missing endpoints block the provider for
 *     12h — no point hammering a dead config.
 *   - lastWorking: the last provider that produced a successful reply.
 *   - local: whether local AI servers (Ollama / LM Studio) are reachable.
 *
 * State persists to server/data/provider-health.json (gitignored) so outages
 * survive restarts. For tests set PRIYA_HEALTH_DISABLED=1 (in-memory only)
 * and/or PRIYA_HEALTH_FILE=<path>.
 */

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data');
const HEALTH_FILE = process.env.PRIYA_HEALTH_FILE || path.join(DATA_DIR, 'provider-health.json');
const DISABLED = process.env.PRIYA_HEALTH_DISABLED === '1';

const RATE_LIMIT_STEPS = [60 * 1000, 5 * 60 * 1000, 30 * 60 * 1000, 2 * 60 * 60 * 1000]; // 429 escalation
const TRANSIENT_STEPS = [90 * 1000, 5 * 60 * 1000, 15 * 60 * 1000, 60 * 60 * 1000];      // network/5xx
const HARD_BLOCK_MS = 12 * 60 * 60 * 1000; // auth / quota / model / endpoint

let state = { providers: {}, lastWorking: null, local: { ollama: false, lmstudio: false } };

function load() {
  if (DISABLED) return;
  try {
    if (fs.existsSync(HEALTH_FILE)) {
      const raw = JSON.parse(fs.readFileSync(HEALTH_FILE, 'utf8'));
      if (raw && raw.providers) state = raw;
    }
  } catch (e) {
    // corrupted file -> start fresh
  }
}

function persist() {
  if (DISABLED) return;
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(HEALTH_FILE, JSON.stringify(state, null, 2), 'utf8');
  } catch (e) {
    // persistence is best-effort — never crash the router over a write
  }
}

function now() {
  return Date.now();
}

function blank(id) {
  return {
    state: 'ok',
    consecutiveRateLimits: 0,
    failures: 0,
    lastSuccess: null,
    lastError: null,
    errorCode: null,
    reason: null,
    cooldownUntil: 0,
    blockedUntil: 0,
    remaining: null
  };
}

/** Mark a successful call for `id`; resets cooldowns and remembers it. */
function recordSuccess(id) {
  const entry = state.providers[id] || blank(id);
  entry.state = 'ok';
  entry.consecutiveRateLimits = 0;
  entry.failures = 0;
  entry.lastSuccess = now();
  entry.lastError = null;
  entry.errorCode = null;
  entry.reason = null;
  entry.cooldownUntil = 0;
  entry.blockedUntil = 0;
  state.providers[id] = entry;
  state.lastWorking = id;
  persist();
}

/**
 * Record a failure for `id`.
 * @param {string} id
 * @param {{code?:string,status?:number,message?:string}} info  classify() output
 */
function recordFailure(id, info) {
  const code = (info && info.code) || 'UNKNOWN';
  const status = info && info.status;
  const message = (info && info.message) || '';
  const entry = state.providers[id] || blank(id);
  entry.failures += 1;
  entry.lastError = message;
  entry.errorCode = code;

  if (code === 'AUTH' || status === 401 || status === 403) {
    entry.state = 'blocked';
    entry.reason = 'invalid or expired API key';
    entry.blockedUntil = now() + HARD_BLOCK_MS;
    entry.cooldownUntil = 0;
  } else if (code === 'RATE_LIMIT' || status === 429) {
    entry.consecutiveRateLimits += 1;
    entry.state = 'cooldown';
    entry.reason = 'rate limited';
    const step = Math.min(entry.consecutiveRateLimits - 1, RATE_LIMIT_STEPS.length - 1);
    entry.cooldownUntil = now() + RATE_LIMIT_STEPS[step];
    entry.blockedUntil = 0;
  } else if (code === 'QUOTA') {
    entry.state = 'blocked';
    entry.reason = 'daily/credit quota exhausted';
    entry.blockedUntil = now() + HARD_BLOCK_MS;
    entry.cooldownUntil = 0;
  } else if (code === 'MODEL') {
    entry.state = 'blocked';
    entry.reason = 'model not available on this account';
    entry.blockedUntil = now() + HARD_BLOCK_MS;
    entry.cooldownUntil = 0;
  } else if (code === 'ENDPOINT') {
    entry.state = 'blocked';
    entry.reason = 'endpoint not found (check base URL)';
    entry.blockedUntil = now() + HARD_BLOCK_MS;
    entry.cooldownUntil = 0;
  } else if (code === 'UNAVAILABLE' || status >= 500) {
    entry.consecutiveRateLimits = 0;
    entry.state = 'cooldown';
    entry.reason = 'temporarily unavailable';
    const step = Math.min(entry.failures - 1, TRANSIENT_STEPS.length - 1);
    entry.cooldownUntil = now() + TRANSIENT_STEPS[step];
    entry.blockedUntil = 0;
  } else {
    // BAD_REQUEST / UNKNOWN — don't block, but a short cooldown avoids loops
    entry.consecutiveRateLimits = 0;
    entry.state = 'cooldown';
    entry.reason = 'request failed';
    entry.cooldownUntil = now() + 60 * 1000;
    entry.blockedUntil = 0;
  }

  state.providers[id] = entry;
  persist();
}

/** Capture rate-limit headers (e.g. Groq/OpenRouter x-ratelimit-remaining). */
function recordRateHeaders(id, headers) {
  if (!headers) return;
  const entry = state.providers[id];
  if (!entry) return;
  const remaining =
    headers.get('x-ratelimit-remaining-requests') ||
    headers.get('x-ratelimit-remaining') ||
    null;
  if (remaining) {
    entry.remaining = Number(remaining) || null;
    state.providers[id] = entry;
    persist();
  }
}

/** Store the provider-reported remaining requests (from a successful call). */
function setRemaining(id, remaining) {
  const n = Number(remaining);
  if (!Number.isFinite(n)) return;
  const entry = state.providers[id] || blank(id);
  entry.remaining = n;
  state.providers[id] = entry;
  persist();
}

/** True when the provider is allowed to be called right now. */
function isAvailable(id) {
  const entry = state.providers[id];
  if (!entry) return true; // never seen -> healthy
  if (entry.blockedUntil && now() < entry.blockedUntil) return false;
  if (entry.cooldownUntil && now() < entry.cooldownUntil) return false;
  return true;
}

/** Human-readable state for the settings dashboard. */
function statusFor(id) {
  const entry = state.providers[id];
  if (!entry) {
    return { state: 'ok', errorCode: null, reason: null, cooldownSec: 0, failures: 0, lastSuccess: null, remaining: null };
  }
  let stateLabel = entry.state;
  let cooldownSec = 0;
  if (entry.state === 'cooldown') {
    cooldownSec = Math.max(0, Math.ceil((entry.cooldownUntil - now()) / 1000));
    if (cooldownSec === 0) stateLabel = 'ok';
  }
  if (entry.state === 'blocked') {
    const blockedSec = Math.ceil((entry.blockedUntil - now()) / 1000);
    cooldownSec = Math.max(0, blockedSec);
    if (blockedSec <= 0) stateLabel = 'ok';
  }
  return {
    state: stateLabel,
    errorCode: entry.errorCode,
    reason: entry.reason,
    cooldownSec,
    failures: entry.failures,
    lastSuccess: entry.lastSuccess,
    remaining: entry.remaining
  };
}

/** Called whenever a key is saved/deleted — a fresh key deserves a fresh slate. */
function keyUpdated(id) {
  if (state.providers[id]) delete state.providers[id];
  if (state.lastWorking === id) state.lastWorking = null;
  persist();
}

function lastWorking() {
  return state.lastWorking;
}

function setLocalStatus(status) {
  state.local = status || { ollama: false, lmstudio: false };
  persist();
}

function localStatus() {
  return state.local || { ollama: false, lmstudio: false };
}

function hasAvailable(ids) {
  return (ids || []).some((id) => isAvailable(id));
}

function resetAll() {
  state = { providers: {}, lastWorking: null, local: { ollama: false, lmstudio: false } };
  persist();
}

load();

module.exports = {
  recordSuccess,
  recordFailure,
  recordRateHeaders,
  setRemaining,
  isAvailable,
  statusFor,
  keyUpdated,
  lastWorking,
  setLocalStatus,
  localStatus,
  hasAvailable,
  resetAll,
  _state: () => state
};