'use strict';

const SARVAM_BASE = 'https://api.sarvam.ai';
const DEFAULT_MODEL = 'sarvam-105b';

function getModel() {
  return (process.env.SARVAM_LLM_MODEL || DEFAULT_MODEL).trim();
}

function hasKey() {
  return !!(process.env.SARVAM_API_KEY && process.env.SARVAM_API_KEY.trim());
}

// Map provider errors to clean, user-friendly messages (never expose secrets/stack traces).
function friendlyError(status, body) {
  const code = body && body.error && body.error.code;
  const message = (body && body.error && body.error.message) || '';
  if (status === 401) {
    return 'Priya is unable to authenticate with the AI service. The Sarvam API key appears to be invalid. Please check the SARVAM_API_KEY setting.';
  }
  if (status === 402) {
    return 'Priya has run out of AI credits for now (Sarvam free tier). Please top up credits in the Sarvam dashboard and try again.';
  }
  if (status === 429 || code === 429 || /rate limit/i.test(message)) {
    return 'Priya has hit the AI service rate limit for now. Please wait a bit and try again.';
  }
  if (status >= 500) {
    return 'Priya is temporarily unable to reach the AI service. Please try again in a moment.';
  }
  return 'Priya is temporarily unable to connect to the AI service. Please try again.';
}

/**
 * Call Sarvam AI chat completions (OpenAI-compatible).
 * @param {object} opts
 * @param {string} opts.system   system prompt
 * @param {Array<{role:string,content:string}>} opts.messages  history + latest (roles 'user'/'model')
 * @param {number} [opts.temperature]
 * @param {number} [opts.maxTokens]
 * @param {AbortSignal} [opts.signal]
 * @param {object} [cfg]  overrides: {apiKey, model, baseUrl} — used by the provider system
 * @returns {Promise<{text:string, model:string, requestedTool?:string, toolQuery?:string}>}
 */
async function chatSarvam({ system, messages, temperature, maxTokens, signal }, cfg = {}) {
  const apiKey = cfg.apiKey || process.env.SARVAM_API_KEY || '';
  const model = cfg.model || getModel();
  const base = (cfg.baseUrl || SARVAM_BASE).replace(/\/+$/, '');
  if (!apiKey) {
    const err = new Error('Sarvam API key is not configured on the server.');
    err.status = 503;
    err.code = 'MISSING_KEY';
    throw err;
  }

  const url = `${base}/v1/chat/completions`;
  const chatMessages = [
    { role: 'system', content: system },
    ...messages.map((m) => ({
      role: m.role === 'assistant' ? 'assistant' : 'user',
      content: m.content
    }))
  ];

  const body = {
    model,
    messages: chatMessages,
    temperature: typeof temperature === 'number' ? temperature : 0.7
  };
  // sarvam-105b is a reasoning model: it spends output budget on hidden
  // chain-of-thought. Low reasoning effort keeps that burn small (verified:
  // 'low' cuts the CoT drastically), and the answer budget is padded so
  // replies never get cut off mid-sentence (finish_reason=length).
  body.reasoning_effort = 'low';
  body.max_tokens = maxTokens ? maxTokens + 2048 : 4096;

  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-subscription-key': apiKey
      },
      body: JSON.stringify(body),
      signal
    });
  } catch (e) {
    const err = new Error('Priya is temporarily unable to connect to the AI service (network issue). Please try again.');
    err.status = 502;
    err.code = 'NETWORK';
    throw err;
  }

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    const err = new Error(friendlyError(res.status, data));
    err.status = res.status;
    err.code = data && data.error && data.error.code;
    throw err;
  }

  const raw =
    (data.choices &&
      data.choices[0] &&
      data.choices[0].message &&
      data.choices[0].message.content) ||
    '';

  // Sarvam-105b sometimes emits its tool call as plain text markup
  // (<tool_call>live_web_search ... </tool_call>) instead of answering.
  // Detect it, strip it, and signal the server to run the real web search
  // and retry once with the results in context.
  const toolCallRe = /<tool_call>\s*([a-z_0-9]+)\s*<arg_key>\s*([a-z_0-9]+)\s*<\/arg_key>\s*<arg_value>\s*([\s\S]*?)\s*<\/arg_value>\s*<\/tool_call>/i;
  const toolMatch = raw.match(toolCallRe);
  if (toolMatch && /search/i.test(toolMatch[1]) && /query/i.test(toolMatch[2])) {
    const cleaned = raw.replace(/<tool_call>[\s\S]*?<\/tool_call>/gi, '').trim();
    return {
      text: cleaned || 'Let me search the web for that.',
      model,
      requestedTool: toolMatch[1].toLowerCase(),
      toolQuery: toolMatch[3].trim()
    };
  }

  // Strip any leftover tool-call markup so users never see raw tags.
  const text = raw.replace(/<tool_call>[\s\S]*?<\/tool_call>/gi, '').trim();

  if (!text || !text.trim()) {
    const err = new Error('Priya could not generate a response. Please rephrase your message.');
    err.status = 200;
    throw err;
  }

  return { text, model };
}

module.exports = { chatSarvam, getModel, hasKey };