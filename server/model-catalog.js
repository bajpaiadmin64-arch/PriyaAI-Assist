'use strict';

/**
 * Central AI provider/model catalog.
 *
 * Every provider Priya can talk to is described here: how its API is called,
 * where keys come from, and which models it offers. Editing this file is the
 * ONLY change needed to add or update a provider (no app logic changes).
 *
 * FREE-FIRST design (verified against official docs, August 2026):
 *   tier 'free'  -> provider has a legitimately FREE tier usable with the
 *                   user's OWN free API key (no credit card required).
 *   tier 'nokey' -> works with NO API key at all (public endpoint or local).
 *   tier 'paid'  -> pay-per-use (or one-time trial credits). NEVER used by the
 *                   automatic router unless the user has explicitly configured
 *                   it; even then free providers are tried first.
 *
 * Verified sources (Aug 2026):
 *   - Gemini API free tier: ai.google.dev/gemini-api/docs/rate-limits — free
 *     tier, no card, 15 RPM / 1M TPM / 1,500 RPD (flash family).
 *   - Groq free plan: console.groq.com/docs/rate-limits — 30 RPM, ~1K RPD
 *     (varies per model), no card.
 *   - OpenRouter free models: openrouter.ai/docs (":free" variants +
 *     "openrouter/free" router) — 20 RPM, 50 req/day without credits.
 *   - Mistral Experiment plan: docs.mistral.ai — free, ~1B tokens/month,
 *     phone verification only. Prompts may be used for training unless opted
 *     out in the console.
 *   - Hugging Face Inference Providers: $0.10 monthly free credits (free
 *     accounts), token with "Make calls to Inference Providers" permission.
 *   - Pollinations.ai: documented public text API, anonymous tier = no key
 *     (1 req / 15s), MIT-licensed open source (pollinations/pollinations).
 *   - Ollama / LM Studio: local OpenAI-compatible servers, no key.
 *
 * Explicitly NOT included (verified): GitHub Models — fully retired 2026-07-30
 * (github.blog changelog). LM Arena — no official public API for applications
 * (third-party "bridges" require scraping browser session cookies — not used).
 * Cerebras — free trial is $5 of one-time credits (expire 30 days) requiring a
 * payment method; no recurring free tier. DeepSeek — API is pay-per-token; no
 * permanent free tier (promotional grants vary per account).
 *
 * apiFormat:
 *   openai       -> POST {base}/chat/completions, Authorization: Bearer <key>
 *   gemini       -> POST {base}/models/{model}:generateContent, x-goog-api-key
 *   anthropic    -> POST {base}/messages, x-api-key + anthropic-version
 *   sarvam       -> POST {base}/v1/chat/completions, api-subscription-key (OpenAI body)
 *   pollinations -> POST {base}/openai (OpenAI body, no auth header required)
 */

const CATALOG = [
  /* ============================================================
     FREE TIER (user's own free API key — tried first)
     ============================================================ */
  {
    id: 'gemini',
    name: 'Google Gemini',
    apiFormat: 'gemini',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    auth: 'x-goog-api-key',
    keyEnv: 'GEMINI_API_KEY',
    docs: 'https://aistudio.google.com/apikey',
    tier: 'free',
    freeLabel: 'Free tier — 1,500 req/day, no card',
    notes: 'Free tier with generous daily limits (15 RPM / 1M TPM / 1,500 RPD on flash models). Free-tier prompts may be used to improve Google products. Best for Hindi/English mixed conversations.',
    models: [
      { id: 'gemini-3.5-flash', name: 'Gemini 3.5 Flash', context: 1000000, vision: true, tools: true, streaming: true, notes: 'Default — fast, free tier, 1M context.' },
      { id: 'gemini-3.6-flash', name: 'Gemini 3.6 Flash', context: 1000000, vision: true, tools: true, streaming: true, notes: 'Newest flash on the free tier.' },
      { id: 'gemini-3.5-flash-lite', name: 'Gemini 3.5 Flash-Lite', context: 1000000, vision: true, tools: true, streaming: true, notes: 'Cheapest/fastest.' },
      { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', context: 1000000, vision: true, tools: true, streaming: true, notes: 'Previous generation, still available.' }
    ]
  },
  {
    id: 'groq',
    name: 'Groq',
    apiFormat: 'openai',
    baseUrl: 'https://api.groq.com/openai/v1',
    auth: 'bearer',
    keyEnv: 'GROQ_API_KEY',
    docs: 'https://console.groq.com/keys',
    tier: 'free',
    freeLabel: 'Free plan — 30 RPM, ~1K req/day/model, no card',
    notes: 'Blazing-fast free inference. Limits are per model (e.g. llama-3.3-70b-versatile: 30 RPM / 1K RPD / 12K TPM). Model IDs change — check console.groq.com/docs/models.',
    models: [
      { id: 'llama-3.3-70b-versatile', name: 'Llama 3.3 70B', context: 131072, vision: false, tools: true, streaming: true, notes: 'Default — strong quality, 1K req/day.' },
      { id: 'llama-3.1-8b-instant', name: 'Llama 3.1 8B', context: 131072, vision: false, tools: true, streaming: true, notes: 'Very high daily quota (14.4K req/day).' },
      { id: 'openai/gpt-oss-120b', name: 'GPT-OSS 120B', context: 131072, vision: false, tools: true, streaming: true, notes: 'OpenAI open-weight model, 1K req/day.' },
      { id: 'openai/gpt-oss-20b', name: 'GPT-OSS 20B', context: 131072, vision: false, tools: true, streaming: true, notes: 'Fast, lighter.' },
      { id: 'meta-llama/llama-4-scout-17b-16e-instruct', name: 'Llama 4 Scout', context: 1000000, vision: true, tools: true, streaming: true, notes: 'Large context, 1K req/day.' }
    ]
  },
  {
    id: 'openrouter',
    name: 'OpenRouter',
    apiFormat: 'openai',
    baseUrl: 'https://openrouter.ai/api/v1',
    auth: 'bearer',
    keyEnv: 'OPENROUTER_API_KEY',
    docs: 'https://openrouter.ai/keys',
    tier: 'free',
    freeLabel: 'Free models — 20 RPM, 50 req/day (no credits)',
    notes: 'One key for hundreds of models. "openrouter/free" = Free Models Router (auto-picks an available free model; roster changes often). Free models: 20 req/min, 50 req/day without purchased credits (1,000/day after $10 lifetime). Model list is fetched live when you test/save a key.',
    models: [
      { id: 'openrouter/free', name: 'Free Models Router (auto)', context: 131072, vision: false, tools: true, streaming: true, notes: 'Default — automatically selects a currently-free model.' },
      { id: 'meta-llama/llama-3.3-70b-instruct:free', name: 'Llama 3.3 70B (free)', context: 131072, vision: false, tools: true, streaming: true, notes: 'Popular free model (may rotate out).' },
      { id: 'openai/gpt-oss-20b:free', name: 'GPT-OSS 20B (free)', context: 131072, vision: false, tools: true, streaming: true, notes: 'Free variant (may rotate out).' }
    ]
  },
  {
    id: 'mistral',
    name: 'Mistral',
    apiFormat: 'openai',
    baseUrl: 'https://api.mistral.ai/v1',
    auth: 'bearer',
    keyEnv: 'MISTRAL_API_KEY',
    docs: 'https://console.mistral.ai/api-keys',
    tier: 'free',
    freeLabel: 'Free Experiment plan — ~1B tokens/month',
    notes: 'Free Experiment plan (~1B tokens/month, low RPM, phone verification, no card). Prompts may be used for training unless you opt out in the console. Strong multilingual support.',
    models: [
      { id: 'mistral-small-latest', name: 'Mistral Small', context: 128000, vision: false, tools: true, streaming: true, notes: 'Default — cheapest, fits the free plan.' },
      { id: 'mistral-medium-latest', name: 'Mistral Medium', context: 128000, vision: false, tools: true, streaming: true, notes: '' },
      { id: 'mistral-large-latest', name: 'Mistral Large', context: 256000, vision: false, tools: true, streaming: true, notes: 'Flagship.' }
    ]
  },
  {
    id: 'huggingface',
    name: 'Hugging Face',
    apiFormat: 'openai',
    baseUrl: 'https://router.huggingface.co/v1',
    auth: 'bearer',
    keyEnv: 'HF_API_KEY',
    docs: 'https://huggingface.co/settings/tokens',
    tier: 'free',
    freeLabel: '$0.10 free credits/month',
    notes: 'Inference Providers via a single token (permission: "Make calls to Inference Providers"). Free accounts get ~$0.10/month of credits — great for occasional use, not sustained chat. Any hosted model ID works.',
    models: [
      { id: 'Qwen/Qwen3-235B-A22B-Instruct', name: 'Qwen3 235B', context: 262144, vision: false, tools: true, streaming: true, notes: '' },
      { id: 'openai/gpt-oss-120b', name: 'GPT-OSS 120B', context: 131072, vision: false, tools: true, streaming: true, notes: '' }
    ]
  },

  /* ============================================================
     NO-KEY TIER (public endpoint / local — no API key needed)
     ============================================================ */
  {
    id: 'pollinations',
    name: 'Pollinations (no key)',
    apiFormat: 'pollinations',
    baseUrl: 'https://text.pollinations.ai',
    auth: 'none',
    keyEnv: null,
    docs: 'https://github.com/pollinations/pollinations',
    tier: 'nokey',
    keyRequired: false,
    freeLabel: 'No key — anonymous (1 req / 15s)',
    notes: 'Public free text API, no signup. Anonymous tier is limited to ~1 request per 15 seconds — used only as a last-resort fallback. Registering (free) raises the limit.',
    models: [
      { id: 'openai', name: 'Default (openai)', context: 32000, vision: false, tools: false, streaming: false, notes: 'Default anonymous model.' },
      { id: 'mistral', name: 'Mistral', context: 32000, vision: false, tools: false, streaming: false, notes: '' },
      { id: 'llama', name: 'Llama', context: 32000, vision: false, tools: false, streaming: false, notes: '' }
    ]
  },
  {
    id: 'ollama',
    name: 'Ollama (local)',
    apiFormat: 'openai',
    baseUrl: 'http://127.0.0.1:11434/v1',
    auth: 'none',
    keyEnv: null,
    docs: 'https://ollama.com',
    tier: 'nokey',
    keyRequired: false,
    local: true,
    freeLabel: 'Local — free, no internet needed',
    notes: 'OpenAI-compatible endpoint of a local Ollama server. Works only when Ollama is running (detected automatically). Any installed model works.',
    models: [
      { id: 'llama3', name: 'llama3 (default)', context: 32768, vision: false, tools: true, streaming: true, notes: 'Default if no model is picked; installed models are listed when testing.' },
      { id: 'qwen3', name: 'qwen3', context: 32768, vision: false, tools: true, streaming: true, notes: '' },
      { id: 'mistral', name: 'mistral', context: 32768, vision: false, tools: true, streaming: true, notes: '' }
    ]
  },
  {
    id: 'lmstudio',
    name: 'LM Studio (local)',
    apiFormat: 'openai',
    baseUrl: 'http://127.0.0.1:1234/v1',
    auth: 'none',
    keyEnv: null,
    docs: 'https://lmstudio.ai',
    tier: 'nokey',
    keyRequired: false,
    local: true,
    freeLabel: 'Local — free, no internet needed',
    notes: 'OpenAI-compatible endpoint of the local LM Studio server. Works only when the local server is running (detected automatically). The model id must be one currently loaded in LM Studio.',
    models: [
      { id: 'local-model', name: 'Loaded model', context: 32768, vision: false, tools: true, streaming: true, notes: 'Use the model id currently loaded in LM Studio.' }
    ]
  },

  /* ============================================================
     PAID TIER (configured by the user — tried LAST, never silently)
     ============================================================ */
  {
    id: 'sarvam',
    name: 'Sarvam AI',
    apiFormat: 'sarvam',
    baseUrl: 'https://api.sarvam.ai',
    auth: 'api-subscription-key',
    keyEnv: 'SARVAM_API_KEY',
    docs: 'https://dashboard.sarvam.ai',
    tier: 'paid',
    notes: 'Indian-first models, best for native Hindi. Also powers Priya\u2019s voice engine.',
    models: [
      { id: 'sarvam-105b', name: 'Sarvam 105B', context: 32000, vision: false, tools: false, streaming: false, notes: 'Default. Reasoning model — hidden chain-of-thought uses output budget.' }
    ]
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    apiFormat: 'openai',
    baseUrl: 'https://api.deepseek.com',
    auth: 'bearer',
    keyEnv: 'DEEPSEEK_API_KEY',
    docs: 'https://platform.deepseek.com/api_keys',
    tier: 'paid',
    notes: 'Pay-per-token (no permanent free tier; very cheap — V4 Flash ~$0.14/$0.28 per 1M tokens). Off-peak hours are cheaper.',
    models: [
      { id: 'deepseek-v4-flash', name: 'DeepSeek V4 Flash', context: 1000000, vision: false, tools: true, streaming: true, notes: 'Default — cheap workhorse, 1M context.' },
      { id: 'deepseek-v4-pro', name: 'DeepSeek V4 Pro', context: 1000000, vision: false, tools: true, streaming: true, notes: 'Frontier reasoning (75% off as of Aug 2026).' }
    ]
  },
  {
    id: 'openai',
    name: 'OpenAI',
    apiFormat: 'openai',
    baseUrl: 'https://api.openai.com/v1',
    auth: 'bearer',
    keyEnv: 'OPENAI_API_KEY',
    docs: 'https://platform.openai.com/api-keys',
    tier: 'paid',
    notes: 'Paid credits required for API use.',
    models: [
      { id: 'gpt-5', name: 'GPT-5', context: 400000, vision: true, tools: true, streaming: true, notes: 'Latest flagship.' },
      { id: 'gpt-5-mini', name: 'GPT-5 mini', context: 400000, vision: true, tools: true, streaming: true, notes: 'Cheaper, fast.' },
      { id: 'gpt-4o', name: 'GPT-4o', context: 128000, vision: true, tools: true, streaming: true, notes: 'Previous generation, still supported.' }
    ]
  },
  {
    id: 'anthropic',
    name: 'Anthropic Claude',
    apiFormat: 'anthropic',
    baseUrl: 'https://api.anthropic.com/v1',
    auth: 'x-api-key',
    keyEnv: 'ANTHROPIC_API_KEY',
    docs: 'https://console.anthropic.com/settings/keys',
    tier: 'paid',
    notes: 'Paid credits required. Excellent long-context reasoning.',
    models: [
      { id: 'claude-opus-4-5', name: 'Claude Opus 4.5', context: 1000000, vision: true, tools: true, streaming: true, notes: 'Most capable.' },
      { id: 'claude-sonnet-4-5', name: 'Claude Sonnet 4.5', context: 1000000, vision: true, tools: true, streaming: true, notes: 'Best balance.' },
      { id: 'claude-haiku-4-5', name: 'Claude Haiku 4.5', context: 1000000, vision: true, tools: true, streaming: true, notes: 'Fastest/cheapest.' }
    ]
  },
  {
    id: 'xai',
    name: 'xAI Grok',
    apiFormat: 'openai',
    baseUrl: 'https://api.x.ai/v1',
    auth: 'bearer',
    keyEnv: 'XAI_API_KEY',
    docs: 'https://console.x.ai',
    tier: 'paid',
    notes: 'Grok models via OpenAI-compatible endpoint.',
    models: [
      { id: 'grok-4', name: 'Grok 4', context: 256000, vision: true, tools: true, streaming: true, notes: 'Flagship.' },
      { id: 'grok-4-mini', name: 'Grok 4 mini', context: 256000, vision: true, tools: true, streaming: true, notes: 'Cheaper/faster.' }
    ]
  },
  {
    id: 'together',
    name: 'Together AI',
    apiFormat: 'openai',
    baseUrl: 'https://api.together.xyz/v1',
    auth: 'bearer',
    keyEnv: 'TOGETHER_API_KEY',
    docs: 'https://api.together.ai/settings/api-keys',
    tier: 'paid',
    notes: 'Pay-per-token (platform access requires a credit purchase; a few models are marked free in the catalog but accounts need a positive balance).',
    models: [
      { id: 'Qwen/Qwen3-235B-A22B-Instruct', name: 'Qwen3 235B', context: 262144, vision: false, tools: true, streaming: true, notes: 'Strong multilingual (incl. Hindi).' },
      { id: 'meta-llama/Llama-4-Maverick-17B-128E-Instruct', name: 'Llama 4 Maverick', context: 262144, vision: true, tools: true, streaming: true, notes: '' }
    ]
  },
  {
    id: 'cerebras',
    name: 'Cerebras',
    apiFormat: 'openai',
    baseUrl: 'https://api.cerebras.ai/v1',
    auth: 'bearer',
    keyEnv: 'CEREBRAS_API_KEY',
    docs: 'https://cloud.cerebras.ai',
    tier: 'paid',
    notes: 'Extremely fast inference. No recurring free tier — new accounts get $5 of trial credits that expire after 30 days (payment method required).',
    models: [
      { id: 'gpt-oss-120b', name: 'GPT-OSS 120B', context: 131072, vision: false, tools: true, streaming: true, notes: 'Default fast model.' }
    ]
  },
  {
    id: 'perplexity',
    name: 'Perplexity',
    apiFormat: 'openai',
    baseUrl: 'https://api.perplexity.ai',
    auth: 'bearer',
    keyEnv: 'PERPLEXITY_API_KEY',
    docs: 'https://www.perplexity.ai/settings/api',
    tier: 'paid',
    notes: 'Search-grounded answers. Live search is built into the model — Priya may skip its own search for these.',
    models: [
      { id: 'sonar-pro', name: 'Sonar Pro', context: 200000, vision: false, tools: false, streaming: true, notes: 'Search-grounded.' },
      { id: 'sonar', name: 'Sonar', context: 127000, vision: false, tools: false, streaming: true, notes: 'Cheaper.' }
    ]
  }
];

// Pseudo-provider for OpenAI-compatible custom endpoints (stored entries only).
const CUSTOM_ID = 'custom';

function findProvider(id) {
  return CATALOG.find((p) => p.id === id) || null;
}

/** All provider ids in catalog order. */
function catalogIds() {
  return CATALOG.map((p) => p.id);
}

/** Tier rank used by the free-first router: free(1) -> nokey(2) -> paid(3). */
function tierRank(id) {
  const entry = findProvider(id);
  if (!entry || entry.tier === 'paid') return 3;
  return entry.tier === 'nokey' ? 2 : 1;
}

/** Whether the router may auto-select this provider without extra permission. */
function isAutoRoutable(id) {
  const entry = findProvider(id);
  return !!(entry && entry.tier !== 'paid');
}

/**
 * Default fallback order (used when no CHAT_PROVIDERS env and no stored order):
 * FREE tier first, then NO-KEY (public/local), then PAID (only user-configured).
 */
function defaultOrder() {
  return [
    'gemini', 'groq', 'openrouter', 'mistral', 'huggingface',
    'pollinations', 'ollama', 'lmstudio',
    'sarvam', 'deepseek', 'openai', 'anthropic', 'xai', 'together', 'cerebras', 'perplexity'
  ];
}

module.exports = { CATALOG, CUSTOM_ID, findProvider, catalogIds, defaultOrder, tierRank, isAutoRoutable };