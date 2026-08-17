'use strict';

const { chatGemini, getModel: geminiModel, hasKey: geminiConfigured } = require('./gemini');
const { chatSarvam, getModel: sarvamModel, hasKey: sarvamConfigured } = require('./sarvam-llm');
const { chatCompat } = require('./openai-compat');

/**
 * Provider registry + fallback loop.
 *
 * Chain (default): gemini → sarvam → groq → openrouter → openai
 * - Only providers with a configured key are used.
 * - On rate-limit (429) / quota / 5xx / network errors: mark the provider
 *   "in cooldown" for a short time and move to the next one automatically.
 * - Transient failures get one retry with exponential backoff.
 */

const COOLDOWN_MS = 90 * 1000; // after a 429/5xx, skip this provider for 90s

// In-memory cooldown map (per process). Restart clears it — safe.
const cooldownUntil = new Map();

function defaultOrder() {
  return (process.env.CHAT_PROVIDERS || 'gemini,sarvam,groq,openrouter,openai')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

function buildRegistry() {
  return {
    gemini: {
      label: 'Gemini',
      configured: () => geminiConfigured(),
      model: () => geminiModel(),
      call: (o) => chatGemini(o)
    },
    sarvam: {
      label: 'Sarvam AI',
      configured: () => sarvamConfigured(),
      model: () => sarvamModel(),
      call: (o) => chatSarvam(o)
    },
    groq: {
      label: 'Groq',
      configured: () => !!(process.env.GROQ_API_KEY && process.env.GROQ_API_KEY.trim()),
      model: () => process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',
      call: (o) =>
        chatCompat(
          {
            label: 'Groq',
            baseUrl: 'https://api.groq.com/openai/v1',
            apiKey: process.env.GROQ_API_KEY,
            model: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile'
          },
          o
        )
    },
    openrouter: {
      label: 'OpenRouter',
      configured: () => !!(process.env.OPENROUTER_API_KEY && process.env.OPENROUTER_API_KEY.trim()),
      model: () => process.env.OPENROUTER_MODEL || 'meta-llama/llama-3.3-70b-instruct:free',
      call: (o) =>
        chatCompat(
          {
            label: 'OpenRouter',
            baseUrl: 'https://openrouter.ai/api/v1',
            apiKey: process.env.OPENROUTER_API_KEY,
            model: process.env.OPENROUTER_MODEL || 'meta-llama/llama-3.3-70b-instruct:free'
          },
          o
        )
    },
    openai: {
      label: 'OpenAI',
      configured: () => !!(process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY.trim()),
      model: () => process.env.OPENAI_MODEL || 'gpt-4o-mini',
      call: (o) =>
        chatCompat(
          {
            label: 'OpenAI',
            baseUrl: 'https://api.openai.com/v1',
            apiKey: process.env.OPENAI_API_KEY,
            model: process.env.OPENAI_MODEL || 'gpt-4o-mini'
          },
          o
        )
    }
  };
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
      /rate.?limit|resource.?exhausted|quota/i.test(e.message || ''))
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
  return defaultOrder()
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
 * @returns {Promise<{text:string, provider:string, model:string}>}
 * @throws {Error} with a friendly message when ALL providers fail.
 */
async function callWithFallback({ system, messages, temperature, maxTokens, signal }) {
  const candidates = availableProviders();
  if (candidates.length === 0) {
    const err = new Error('No AI provider is configured. Set GEMINI_API_KEY, SARVAM_API_KEY or GROQ_API_KEY on the server.');
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
  return defaultOrder()
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