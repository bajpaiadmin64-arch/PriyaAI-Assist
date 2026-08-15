const BASE = '';

export async function fetchHealth() {
  const res = await fetch(`${BASE}/api/health`, { method: 'GET' });
  if (!res.ok) throw new Error('health check failed');
  return res.json();
}

/**
 * Send a chat message to the backend (which talks to Gemini).
 * @param {object} p
 * @param {string} p.message
 * @param {Array<{role:string,content:string}>} p.history
 * @param {string} p.mode  'simple' | 'balanced' | 'tech'
 * @param {boolean} p.useWebSearch
 * @param {string} p.lang   'hi' | 'en' | 'auto'
 * @returns {Promise<{reply:string, sources:Array, searched:boolean}>}
 */
export async function sendChat({ message, history, mode, useWebSearch, lang }) {
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
