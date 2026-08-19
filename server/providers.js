'use strict';

const store = require('./provider-store');
const { findProvider } = require('./model-catalog');
const { chatWith, classify } = require('./provider-system');
const health = require('./provider-health');

/**
 * Provider registry + FREE-FIRST automatic fallback router.
 *
 * Providers come from the dynamic store (Settings UI) + environment keys.
 * Candidates run in this order (free-first, verified Aug 2026):
 *   1. the user's selected provider (explicit choice — always first),
 *   2. FREE-tier providers with a configured key (gemini, groq, openrouter,
 *      mistral, huggingface),
 *   3. NO-KEY providers (pollinations public endpoint; local Ollama / LM
 *      Studio when a local server is detected),
 *   4. PAID providers — ONLY when the user has explicitly configured a key;
 *      they are never auto-chosen on their own.
 *
 * Health tracking (provider-health.js, persisted on disk):
 *   - 429 / 5xx / network → short cooldown (60s → 5min → 30min → 2h for
 *     repeated rate limits) then automatic fallback to the next provider.
 *   - 401/403/quota/model/endpoint → 12h block (no point retrying a dead
 *     config); clearing/saving a key resets it instantly.
 *   - A success resets the provider and records it as lastWorking.
 */

function buildRegistry() {
  const reg = {};
  const ids = store.getOrder();
  // Also include every catalog provider (for status display), even unconfigured.
  for (const id of ids) {
    const entry = findProvider(id);
    reg[id] = {
      label: entry ? entry.name : id,
      configured: () => !!store.getKey(id) || (entry ? entry.keyRequired === false : false),
      model: () => {
        const row = store.list().find((p) => p.id === id);
        return (row && row.model) || (entry && entry.models && entry.models[0] && entry.models[0].id) || null;
      },
      call: (o) => chatWith(id, o)
    };
  }
  return reg;
}

const registry = buildRegistry();

function isTransient(e) {
  return (
    e &&
    (e.status === 429 ||
      e.status === 502 ||
      e.status === 503 ||
      e.status === 504 ||
      (e.status >= 500 && e.status <= 599) ||
      /rate.?limit|resource.?exhausted|quota|unavailable|network/i.test(e.message || ''))
  );
}

/** Local providers are only candidates when their server is detected running. */
function isLocalLive(name) {
  const entry = findProvider(name);
  if (!entry || !entry.local) return true;
  const local = health.localStatus();
  return name === 'ollama' ? !!local.ollama : name === 'lmstudio' ? !!local.lmstudio : true;
}

/**
 * Available providers in configured order (skips unconfigured, in-cooldown,
 * blocked and undetected-local providers).
 * @returns {Array<{name:string, def:object}>}
 */
function availableProviders() {
  return store
    .getOrder()
    .filter((name) => registry[name])
    .filter((name) => registry[name].configured())
    .filter((name) => health.isAvailable(name))
    .filter((name) => isLocalLive(name))
    .map((name) => ({ name, def: registry[name] }));
}

/**
 * Call the best available provider, falling back automatically.
 * @param {object} opts
 * @param {string} opts.system
 * @param {Array<{role:string,content:string}>} opts.messages
 * @param {number} [opts.temperature]
 * @param {number} [opts.maxTokens]
 * @param {AbortSignal} [opts.signal]
 * @param {string} [opts.providerId]  force a specific provider (must be configured)
 * @returns {Promise<{text:string, provider:string, model:string}>}
 * @throws {Error} code 'MISSING_KEY' when nothing is configured,
 *                 code 'ALL_UNAVAILABLE' when everything failed.
 */
async function callWithFallback({ system, messages, temperature, maxTokens, signal, providerId }) {
  let candidates = availableProviders();
  if (providerId) {
    const forced = candidates.find((c) => c.name === providerId);
    if (forced) candidates = [forced];
    else {
      const entry = findProvider(providerId);
      const configured = !!store.getKey(providerId) || (entry && entry.keyRequired === false);
      if (!configured) {
        const err = new Error(`The selected model provider is not configured (${providerId}). Add its API key in Settings → AI Models & API.`);
        err.status = 503;
        err.code = 'MISSING_KEY';
        throw err;
      }
      // Forced provider configured but cooldown/blocked/local-offline → it is
      // skipped by availableProviders() above; fall back to the rest of the chain.
    }
  }
  if (candidates.length === 0) {
    const err = new Error('No AI provider is configured or reachable. Add a free API key in Settings → AI Models & API (Gemini, Groq, OpenRouter, Mistral), or start Ollama / LM Studio locally.');
    err.status = 503;
    err.code = 'MISSING_KEY';
    throw err;
  }

  const backoff = [500, 1500]; // ms per retry round (transient only)
  let lastError = null;

  for (const { name, def } of candidates) {
    for (let attempt = 0; attempt < backoff.length; attempt++) {
      if (attempt > 0 && backoff[attempt - 1] > 0 && !signal) {
        await new Promise((r) => setTimeout(r, backoff[attempt - 1]));
      }
      try {
        const { text, model, remaining } = await def.call({
          system,
          messages,
          temperature,
          maxTokens,
          signal
        });
        health.recordSuccess(name);
        if (remaining) health.setRemaining(name, remaining);
        return { text, provider: name, model: model || def.model() };
      } catch (e) {
        lastError = e;
        if (isTransient(e) && attempt < backoff.length - 1) {
          continue; // retry same provider once with backoff
        }
        health.recordFailure(name, { code: classify(e.status, e.code, e.message), status: e.status, message: e.message });
        break; // move to next provider
      }
    }
  }

  if (lastError) {
    // Every candidate failed — all-unavailable is the honest answer.
    const err = new Error('All currently configured AI providers are unavailable. Please add another API key or try again later.');
    err.status = 503;
    err.code = 'ALL_UNAVAILABLE';
    throw err;
  }

  const err = new Error('All currently configured AI providers are unavailable. Please add another API key or try again later.');
  err.status = 503;
  err.code = 'ALL_UNAVAILABLE';
  throw err;
}

/** Status for /api/health + /api/providers: tier, configured, model, health. */
function providerStatus() {
  return store
    .getOrder()
    .filter((name) => registry[name])
    .map((name) => {
      const entry = findProvider(name);
      const h = health.statusFor(name);
      return {
        name,
        label: registry[name].label,
        configured: registry[name].configured(),
        model: registry[name].configured() ? registry[name].model() : null,
        tier: entry ? entry.tier : 'custom',
        freeLabel: entry ? entry.freeLabel : null,
        keyRequired: entry ? entry.keyRequired !== false : true,
        local: entry ? !!entry.local : false,
        state: h.state,
        errorCode: h.errorCode,
        reason: h.reason,
        cooldownSec: h.cooldownSec,
        failures: h.failures,
        lastSuccess: h.lastSuccess,
        remaining: h.remaining
      };
    });
}

module.exports = { callWithFallback, providerStatus, availableProviders, registry, isTransient }; // registry exported for tests