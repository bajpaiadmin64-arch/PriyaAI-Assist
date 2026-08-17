'use strict';

/**
 * Generic OpenAI-compatible chat client (Groq, OpenRouter, OpenAI, ...).
 * Keeps errors friendly and never exposes secrets.
 */

function friendlyError(status, body, providerLabel) {
  const message = (body && body.error && body.error.message) || '';
  if (status === 401 || status === 403) {
    return `Priya cannot authenticate with ${providerLabel}. The API key appears to be invalid or expired — check the provider key setting on the server.`;
  }
  if (status === 429 || /rate limit|quota|resource exhausted/i.test(message)) {
    return `Priya hit a temporary rate limit on ${providerLabel}. Switching to another provider if available.`;
  }
  if (status >= 500) {
    return `Priya is temporarily unable to reach ${providerLabel}. Trying the next provider if available.`;
  }
  return `Priya is temporarily unable to connect to ${providerLabel}. Please try again.`;
}

/**
 * @param {object} cfg
 * @param {string} cfg.label         human name, e.g. 'Groq'
 * @param {string} cfg.baseUrl       e.g. 'https://api.groq.com/openai/v1'
 * @param {string} cfg.apiKey
 * @param {string} cfg.model
 * @param {object} opts
 * @param {string} opts.system
 * @param {Array<{role:string,content:string}>} opts.messages
 * @param {number} [opts.temperature]
 * @param {number} [opts.maxTokens]
 * @param {AbortSignal} [opts.signal]
 */
async function chatCompat(cfg, { system, messages, temperature, maxTokens, signal }) {
  const url = cfg.baseUrl.replace(/\/+$/, '') + '/chat/completions';
  const chatMessages = [
    { role: 'system', content: system },
    ...messages.map((m) => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content }))
  ];

  const body = {
    model: cfg.model,
    messages: chatMessages,
    temperature: typeof temperature === 'number' ? temperature : 0.7
  };
  if (maxTokens) body.max_tokens = maxTokens;

  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${cfg.apiKey}`
      },
      body: JSON.stringify(body),
      signal
    });
  } catch (e) {
    const err = new Error(`Priya is temporarily unable to connect to ${cfg.label} (network issue).`);
    err.status = 502;
    err.code = 'NETWORK';
    throw err;
  }

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    const err = new Error(friendlyError(res.status, data, cfg.label));
    err.status = res.status;
    err.code = data && data.error && data.error.code;
    throw err;
  }

  const text = (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || '';

  if (!text || !text.trim()) {
    const err = new Error(`Priya could not generate a response from ${cfg.label}. Please rephrase your message.`);
    err.status = 200;
    throw err;
  }

  return { text: text.trim(), model: cfg.model };
}

module.exports = { chatCompat };