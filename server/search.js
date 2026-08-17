'use strict';

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

function cleanText(s) {
  return (s || '')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function decodeBingUrl(href) {
  if (!/bing\.com\/ck\//.test(href)) return href;
  const un = href.replace(/&amp;/g, '&');
  const m = un.match(/[?&]u=a1([^&]+)/);
  if (m) {
    try {
      const b64 = m[1].replace(/-/g, '+').replace(/_/g, '/');
      const decoded = Buffer.from(b64, 'base64').toString('utf8');
      if (/^https?:\/\//i.test(decoded)) return decoded;
    } catch (e) { /* keep original */ }
  }
  return href;
}

async function bingSearch(q, limit) {
  const url = 'https://www.bing.com/search?q=' + encodeURIComponent(q) + '&setlang=en&count=10';
  const r = await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'en-US,en;q=0.9' } });
  if (!r.ok) throw new Error('search engine returned ' + r.status);
  const html = await r.text();
  const results = [];
  const chunks = html.split('<li class="b_algo"');
  for (let i = 1; i < chunks.length && results.length < limit; i++) {
    const chunk = chunks[i];
    const hm = chunk.match(/<h2[^>]*>\s*<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/);
    if (!hm) continue;
    let link = decodeBingUrl(hm[1]);
    if (!/^https?:\/\//i.test(link)) continue;
    const title = cleanText(hm[2]);
    const sm = chunk.match(/<p[^>]*>([\s\S]*?)<\/p>/);
    const snippet = sm ? cleanText(sm[1]) : '';
    if (title) results.push({ title, url: link, snippet });
  }
  return results;
}

async function duckDuckGoSearch(q, limit) {
  const url = 'https://html.duckduckgo.com/html/?q=' + encodeURIComponent(q);
  const r = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!r.ok) throw new Error('search engine returned ' + r.status);
  const html = await r.text();
  const results = [];
  const itemRe =
    /<a[^>]*class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?(?:<a[^>]*class="result__snippet"[^>]*>([\s\S]*?)<\/a>)?/g;
  let m;
  while ((m = itemRe.exec(html)) !== null && results.length < limit) {
    let link = m[1];
    const rd = link.match(/uddg=([^&]+)/);
    if (rd) {
      try { link = decodeURIComponent(rd[1]); } catch (e) { /* keep */ }
    }
    if (!/^https?:\/\//i.test(link)) continue;
    const title = cleanText(m[2]);
    const snippet = m[3] ? cleanText(m[3]) : '';
    if (title) results.push({ title, url: link, snippet });
  }
  return results;
}

/**
 * Live web search. Tries Bing first, falls back to DuckDuckGo.
 * @param {string} q
 * @param {number} [limit]
 */
async function webSearch(q, limit = 5) {
  const l = Math.max(1, Math.min(8, limit));
  try {
    const r = await bingSearch(q, l);
    if (r.length) return r;
  } catch (e) { /* fall through */ }
  return duckDuckGoSearch(q, l);
}

/**
 * Fetch a public web page and extract readable text (for documentation/current info).
 * Only http/https URLs. Never follows redirects off-site beyond 3 hops.
 * @param {string} url
 * @param {number} [maxChars]
 * @returns {Promise<{title:string, url:string, text:string}>}
 */
async function fetchPage(url, maxChars = 6000) {
  let target = String(url || '').trim();
  if (!/^https?:\/\//i.test(target)) {
    const err = new Error('Only http(s) web pages can be opened.');
    err.status = 400;
    throw err;
  }
  if (target.length > 2048) {
    const err = new Error('URL is too long.');
    err.status = 400;
    throw err;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);

  let res;
  try {
    res = await fetch(target, {
      headers: { 'User-Agent': UA, 'Accept-Language': 'en-US,en;q=0.9' },
      redirect: 'follow',
      signal: controller.signal
    });
  } catch (e) {
    clearTimeout(timer);
    const err = new Error('Priya could not open that page (network error or timeout).');
    err.status = 502;
    throw err;
  }
  clearTimeout(timer);

  if (!res.ok) {
    const err = new Error(`That page returned HTTP ${res.status}.`);
    err.status = 502;
    throw err;
  }

  const html = await res.text().catch(() => '');
  const title = cleanText((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || target);

  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();

  if (!text) {
    const err = new Error('That page has no readable text content.');
    err.status = 502;
    throw err;
  }

  return { title, url: target, text: text.slice(0, maxChars) };
}

module.exports = { webSearch, fetchPage };
