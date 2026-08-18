const BASE = '';

export async function fetchHealth() {
  const res = await fetch(`${BASE}/api/health`, { method: 'GET' });
  if (!res.ok) throw new Error('health check failed');
  return res.json();
}

/**
 * Send a chat message to the backend (which talks to the configured AI provider).
 * @param {object} p
 * @param {string} p.message
 * @param {Array<{role:string,content:string}>} p.history
 * @param {string} p.mode  'simple' | 'balanced' | 'tech'
 * @param {boolean} p.useWebSearch
 * @param {string} p.lang   'hi' | 'en' | 'auto'
 * @param {boolean} [p.stream]  request SSE streaming when the model supports it
 * @param {(delta:string)=>void} [p.onDelta]  called with each text chunk (stream mode)
 * @returns {Promise<{reply:string, sources:Array, searched:boolean}>}
 */
export async function sendChat({ message, history, mode, useWebSearch, lang, stream, onDelta }) {
  if (stream && typeof onDelta === 'function') {
    const data = await streamChat({ message, history, mode, useWebSearch, lang, onDelta });
    if (data) return data;
    // SSE unavailable/errored → fall through to the plain JSON path
  }
  const res = await fetch(`${BASE}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, history, mode, useWebSearch, lang })
  });
  let data = {};
  try { data = await res.json(); } catch (e) { /* ignore */ }
  if (!res.ok) {
    throw new Error(data.error || 'Priya is temporarily unable to connect to the AI service. Please try again.');
  }
  return data;
}

/**
 * SSE streaming chat. Resolves with the final payload (same shape as the JSON
 * path) or null when the server answered with plain JSON or an error.
 */
async function streamChat({ message, history, mode, useWebSearch, lang, onDelta }) {
  const res = await fetch(`${BASE}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, history, mode, useWebSearch, lang, stream: true })
  });
  const ctype = (res.headers.get('content-type') || '').toLowerCase();
  if (!ctype.includes('text/event-stream')) {
    // Server fell back to JSON (provider without streaming, or tool answer)
    let data = {};
    try { data = await res.json(); } catch (e) { /* ignore */ }
    if (!res.ok) throw new Error(data.error || 'Request failed.');
    return data;
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  let result = null;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split('\n');
    buf = lines.pop();
    for (const line of lines) {
      const t = line.trim();
      if (!t.startsWith('data:')) continue;
      let ev;
      try { ev = JSON.parse(t.slice(5).trim()); } catch (e) { continue; }
      if (ev.type === 'delta') { if (onDelta) onDelta(ev.text); }
      else if (ev.type === 'done') { result = ev; }
      else if (ev.type === 'error') { throw new Error(ev.message || 'Stream failed.'); }
    }
  }
  return result; // null → caller retries with plain JSON
}

export async function fetchProviders() {
  const res = await fetch(`${BASE}/api/providers`, { method: 'GET' });
  if (!res.ok) throw new Error('provider list failed');
  return res.json();
}

export async function testProvider({ providerId, apiKey, model, baseUrl, name }) {
  const res = await fetch(`${BASE}/api/providers/test`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ providerId, apiKey, model, baseUrl, name })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Test failed.');
  return data;
}

export async function saveProviderKey({ providerId, apiKey, model, baseUrl, name }) {
  const res = await fetch(`${BASE}/api/providers/keys`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ providerId, apiKey, model, baseUrl, name })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Save failed.');
  return data;
}

export async function deleteProviderKey(providerId) {
  const res = await fetch(`${BASE}/api/providers/keys/${encodeURIComponent(providerId)}`, { method: 'DELETE' });
  if (!res.ok) throw new Error('Delete failed.');
  return res.json();
}

export async function selectProvider(providerId) {
  const res = await fetch(`${BASE}/api/providers/select`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ providerId })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Selection failed.');
  return data;
}

export async function searchWeb(q) {
  const res = await fetch(`${BASE}/api/search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ q })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'search failed');
  return data.results || [];
}
