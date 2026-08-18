'use strict';

/**
 * Central AI provider/model catalog.
 *
 * Every provider Priya can talk to is described here: how its API is called,
 * where keys come from, and which models it offers. Editing this file is the
 * ONLY change needed to add or update a provider (no app logic changes).
 *
 * Model IDs/limits listed below are the official public names at the time of
 * writing. They change often — verify the current model ID on the provider's
 * own site if a model is rejected. "Custom" providers use the OpenAI-compatible
 * format and take everything from the user.
 *
 * apiFormat:
 *   openai      -> POST {base}/chat/completions, Authorization: Bearer <key>
 *   gemini      -> POST {base}/models/{model}:generateContent, x-goog-api-key
 *   anthropic   -> POST {base}/messages, x-api-key + anthropic-version
 *   sarvam      -> POST {base}/v1/chat/completions, api-subscription-key (OpenAI body)
 */

const CATALOG = [
  {
    id: 'gemini',
    name: 'Google Gemini',
    apiFormat: 'gemini',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    auth: 'x-goog-api-key',
    keyEnv: 'GEMINI_API_KEY',
    docs: 'https://aistudio.google.com/apikey',
    notes: 'Free tier with generous daily limits. Best for Hindi/English mixed conversations.',
    models: [
      { id: 'gemini-3.5-flash', name: 'Gemini 3.5 Flash', context: 1000000, vision: true, tools: true, streaming: true, notes: 'Default — fast, free tier, 1M context.' },
      { id: 'gemini-3.5-flash-lite', name: 'Gemini 3.5 Flash-Lite', context: 1000000, vision: true, tools: true, streaming: true, notes: 'Cheapest/fastest.' },
      { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', context: 1000000, vision: true, tools: true, streaming: true, notes: 'Previous generation, still available.' }
    ]
  },
  {
    id: 'sarvam',
    name: 'Sarvam AI',
    apiFormat: 'sarvam',
    baseUrl: 'https://api.sarvam.ai',
    auth: 'api-subscription-key',
    keyEnv: 'SARVAM_API_KEY',
    docs: 'https://dashboard.sarvam.ai',
    notes: 'Indian-first models, best for native Hindi. Also powers Priya\u2019s voice engine.',
    models: [
      { id: 'sarvam-105b', name: 'Sarvam 105B', context: 32000, vision: false, tools: false, streaming: false, notes: 'Default. Reasoning model — hidden chain-of-thought uses output budget.' }
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
    notes: 'Grok models via OpenAI-compatible endpoint.',
    models: [
      { id: 'grok-4', name: 'Grok 4', context: 256000, vision: true, tools: true, streaming: true, notes: 'Flagship.' },
      { id: 'grok-4-mini', name: 'Grok 4 mini', context: 256000, vision: true, tools: true, streaming: true, notes: 'Cheaper/faster.' }
    ]
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    apiFormat: 'openai',
    baseUrl: 'https://api.deepseek.com/v1',
    auth: 'bearer',
    keyEnv: 'DEEPSEEK_API_KEY',
    docs: 'https://platform.deepseek.com/api_keys',
    notes: 'Very cheap, strong coding. DeepSeek-reasoner shows thinking before the answer.',
    models: [
      { id: 'deepseek-chat', name: 'DeepSeek Chat (V3.x)', context: 128000, vision: false, tools: true, streaming: true, notes: 'Default chat model.' },
      { id: 'deepseek-reasoner', name: 'DeepSeek Reasoner (R1)', context: 128000, vision: false, tools: false, streaming: true, notes: 'Reasoning model — slower; no tool calling.' }
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
    notes: 'European provider, strong multilingual support.',
    models: [
      { id: 'mistral-large-latest', name: 'Mistral Large', context: 256000, vision: false, tools: true, streaming: true, notes: 'Flagship.' },
      { id: 'mistral-medium-latest', name: 'Mistral Medium', context: 128000, vision: false, tools: true, streaming: true, notes: '' },
      { id: 'mistral-small-latest', name: 'Mistral Small', context: 128000, vision: false, tools: true, streaming: true, notes: 'Cheapest.' }
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
    notes: 'Free tier, blazing-fast inference. Model IDs change — check console.groq.com/docs/models.',
    models: [
      { id: 'llama-4-scout-17b-16e-instruct', name: 'Llama 4 Scout', context: 1000000, vision: true, tools: true, streaming: true, notes: 'Free tier likely includes it.' },
      { id: 'llama-3.3-70b-versatile', name: 'Llama 3.3 70B', context: 131072, vision: false, tools: true, streaming: true, notes: 'Reliable older default.' },
      { id: 'gemma3-27b-it', name: 'Gemma 3 27B', context: 131072, vision: true, tools: true, streaming: true, notes: 'If available on your account.' }
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
    notes: 'One key for hundreds of models, many with :free variants. Model list is fetched live from OpenRouter when you test/save a key. Any model ID works.',
    models: [
      { id: 'meta-llama/llama-3.3-70b-instruct:free', name: 'Llama 3.3 70B (free)', context: 131072, vision: false, tools: true, streaming: true, notes: 'Popular free model.' },
      { id: 'deepseek/deepseek-chat-v3-0324:free', name: 'DeepSeek V3 (free)', context: 64000, vision: false, tools: true, streaming: true, notes: 'Free variant.' }
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
    notes: 'Open-source models at cost. Model IDs use org/name format — check docs.together.ai.',
    models: [
      { id: 'meta-llama/Llama-4-Maverick-17B-128E-Instruct', name: 'Llama 4 Maverick', context: 262144, vision: true, tools: true, streaming: true, notes: '' },
      { id: 'Qwen/Qwen3-235B-A22B-Instruct', name: 'Qwen3 235B', context: 262144, vision: false, tools: true, streaming: true, notes: 'Strong multilingual (incl. Hindi).' }
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
    notes: 'Extremely fast inference.',
    models: [
      { id: 'llama-3.3-70b', name: 'Llama 3.3 70B', context: 131072, vision: false, tools: true, streaming: true, notes: 'Default fast model.' }
    ]
  },
  {
    id: 'huggingface',
    name: 'Hugging Face',
    apiFormat: 'openai',
    baseUrl: 'https://api-inference.huggingface.co/v1',
    auth: 'bearer',
    keyEnv: 'HF_API_KEY',
    docs: 'https://huggingface.co/settings/tokens',
    notes: 'Thousands of open models. Use a token with \u2018Inference provider\u2019 permission. Any model ID works, but not every model is hosted with a fast inference endpoint.',
    models: [
      { id: 'Qwen/Qwen3-235B-A22B-Instruct', name: 'Qwen3 235B', context: 262144, vision: false, tools: true, streaming: true, notes: '' },
      { id: 'meta-llama/Llama-4-Maverick-17B-128E-Instruct', name: 'Llama 4 Maverick', context: 262144, vision: true, tools: true, streaming: true, notes: '' }
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

/** Default fallback order (used when no CHAT_PROVIDERS env and no stored order). */
function defaultOrder() {
  return ['gemini', 'sarvam', 'groq', 'openrouter', 'openai', 'deepseek', 'anthropic', 'xai', 'mistral', 'together', 'cerebras', 'huggingface', 'perplexity'];
}

module.exports = { CATALOG, CUSTOM_ID, findProvider, catalogIds, defaultOrder };
