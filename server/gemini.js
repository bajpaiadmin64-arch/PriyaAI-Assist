'use strict';

const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta';
const DEFAULT_MODEL = 'gemini-3.5-flash';

function getModel() {
  return (process.env.GEMINI_MODEL || DEFAULT_MODEL).trim();
}

function hasKey() {
  return !!(process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.trim());
}

// Map provider errors to clean, user-friendly messages (never expose secrets/stack traces).
function friendlyError(status, body) {
  const code = body && body.error && body.error.code;
  const message = (body && body.error && body.error.message) || '';
  if (status === 400 && /API key not valid|API key expired/i.test(message)) {
    return 'Priya is unable to authenticate with the AI service. The Gemini API key appears to be invalid or expired. Please check the GEMINI_API_KEY setting.';
  }
  if (status === 403) {
    return 'Priya is unable to access the AI service (permission denied). Please verify the API key is enabled for the Gemini API.';
  }
  if (status === 429 || code === 429 || /RESOURCE_EXHAUSTED|rate limit/i.test(message)) {
    return 'Priya has hit the AI service rate limit for now (free tier has daily limits). Please wait a bit and try again.';
  }
  if (status >= 500) {
    return 'Priya is temporarily unable to reach the AI service. Please try again in a moment.';
  }
  return 'Priya is temporarily unable to connect to the AI service. Please try again.';
}

/**
 * Call Gemini generateContent.
 * @param {object} opts
 * @param {string} opts.system   system prompt
 * @param {Array<{role:string,content:string}>} opts.messages  history + latest (roles 'user'/'model')
 * @param {number} [opts.temperature]
 * @param {number} [opts.maxTokens]
 * @param {AbortSignal} [opts.signal]
 * @returns {Promise<{text:string}>}
 */
async function chatGemini({ system, messages, temperature, maxTokens, signal }) {
  if (!hasKey()) {
    const err = new Error('Gemini API key is not configured on the server.');
    err.status = 503;
    err.code = 'MISSING_KEY';
    throw err;
  }

  const url = `${GEMINI_BASE}/models/${encodeURIComponent(getModel())}:generateContent`;
  const contents = messages.map((m) => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }]
  }));

  const body = {
    contents,
    systemInstruction: { parts: [{ text: system }] },
    generationConfig: {
      temperature: typeof temperature === 'number' ? temperature : 0.7,
      maxOutputTokens: maxTokens || 4096
    }
  };

  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY },
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
    err.code = data && data.error && data.error.status;
    throw err;
  }

  const parts =
    (data.candidates &&
      data.candidates[0] &&
      data.candidates[0].content &&
      data.candidates[0].content.parts) ||
    [];
  const text = parts.map((p) => p.text || '').join('').trim();

  if (!text) {
    // Safety-blocked or empty output
    const blockReason =
      data.promptFeedback &&
      data.promptFeedback.blockReason
        ? ` (${data.promptFeedback.blockReason})`
        : '';
    const err = new Error(`Priya could not generate a response${blockReason}. Please rephrase your message.`);
    err.status = 200;
    throw err;
  }

  return { text, model: getModel() };
}

module.exports = { chatGemini, getModel, hasKey };
