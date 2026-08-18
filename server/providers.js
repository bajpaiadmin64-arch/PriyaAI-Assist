'use strict';

const store = require('./provider-store');
const { findProvider, defaultOrder } = require('./model-catalog');
const { chatWith } = require('./provider-system');

/**
 * Provider registry + fallback loop.
 *
 * Providers come from the dynamic store (Settings UI) + environment keys.
 * Chain order: selected provider first, then stored order / CHAT_PROVIDERS
 * env / catalog order. Only providers with a configured key are used.
 * - On rate-limit (429) / quota / 5xx / network errors: mark the provider
 *   "in cooldown" for a short time and move to the next one automatically.
 * - Transient failures get one retry with exponential backoff.
 * - Invalid-key (401/403) errors move on but do NOT mark cooldown; the
 *   error surfaces so the user can fix the key.
 */

const COOLDOWN_MS = 90 * 1000; // after a 429/5xx, skip this provider for 90s

// In-memory cooldown map (per process). Restart clears it — safe.
const cooldownUntil = new Map();

function buildRegistry() {
  const reg = {};
  const ids = store.getOrder();
  // Also include every catalog provider (for status display), even unconfigured.
  for (const id of ids) {
    const entry = findProvider(id);
    reg[id] = {
      label: entry ? entry.name : id,
      configured: () => !!store.getKey(id),
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

function markCooldown(name) {
  cooldownUntil.set(name, Date.now() + COOLDOWN_MS);
}

function remainingCooldown(name) {
  const until = cooldownUntil.get(name) || 0;
  return Math.max(0, Math.ceil((until - Date.now()) / 1000));
}

/**
 * Available providers in configured order (skips unconfigured + in-cooldown).
 * @returns {Array<{name:string, def:object}>}
 */
function availableProviders() {
  return store
    .getOrder()
    .filter((name) => registry[name])
    .filter((name) => remainingCooldown(name) === 0)
    .filter((name) => registry[name].configured())
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
 * @throws {Error} with a friendly message when ALL providers fail.
 */
async function callWithFallback({ system, messages, temperature, maxTokens, signal, providerId }) {
  let candidates = availableProviders();
  if (providerId) {
    const forced = candidates.find((c) => c.name === providerId);
    if (forced) candidates = [forced];
    else {
      // Forced provider not configured/available — fall back to the chain but
      // surface a clear error if nothing works.
      const configured = store.getKey(providerId) || providerId === 'custom';
      if (!configured) {
        const err = new Error(`The selected model provider is not configured (${providerId}). Add its API key in Settings → AI Models & API.`);
        err.status = 503;
        err.code = 'MISSING_KEY';
        throw err;
      }
    }
  }
  if (candidates.length === 0) {
    const err = new Error('No AI provider is configured. Add an API key in Settings → AI Models & API, or set GEMINI_API_KEY / SARVAM_API_KEY / GROQ_API_KEY on the server.');
    err.status = 503;
    err.code = 'MISSING_KEY';
    throw err;
  }

  const backoff = [500, 1500]; // ms per retry round
  let lastError = null;

  for (const { name, def } of candidates) {
    for (let attempt = 0; attempt < backoff.length; attempt++) {
      if (attempt > 0 && backoff[attempt - 1] > 0 && !signal) {
        await new Promise((r) => setTimeout(r, backoff[attempt - 1]));
      }
      try {
        const { text, model } = await def.call({
          system,
          messages,
          temperature,
          maxTokens,
          signal
        });
        return { text, provider: name, model: model || def.model() };
      } catch (e) {
        lastError = e;
        if (isTransient(e) && attempt < backoff.length - 1) {
          continue; // retry same provider with backoff
        }
        markCooldown(name); // exhausted this provider for a while
        break; // move to next provider
      }
    }
  }

  if (lastError) {
    lastError.status = lastError.status >= 400 && lastError.status < 600 ? lastError.status : 503;
    throw lastError;
  }

  const err = new Error('All AI providers are temporarily unavailable. Please try again in a moment.');
  err.status = 503;
  throw err;
}

/** Status for /api/health: every provider in order + configured + model + cooldown. */
function providerStatus() {
  return store
    .getOrder()
    .filter((name) => registry[name])
    .map((name) => ({
      name,
      label: registry[name].label,
      configured: registry[name].configured(),
      model: registry[name].configured() ? registry[name].model() : null,
      cooldownSec: remainingCooldown(name)
    }));
}

module.exports = { callWithFallback, providerStatus, availableProviders, registry }; // registry exported for tests