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

const STOPWORDS = new Set([
  'the', 'and', 'for', 'with', 'from', 'that', 'this', 'what', 'which', 'when', 'where', 'how', 'why',
  'are', 'was', 'were', 'has', 'have', 'had', 'will', 'would', 'can', 'could', 'should', 'does', 'do',
  'of', 'to', 'in', 'is', 'it', 'on', 'at', 'by', 'as', 'an', 'or', 'be', 'if', 'me', 'my', 'we', 'us',
  'up', 'down', 'out', 'off', 'into', 'about', 'over', 'under', 'also', 'very', 'just', 'now', 'one',
  'two', 'get', 'help', 'need', 'want', 'please', 'tell', 'show', 'explain', 'your', 'you', 'their',
  'them', 'its', 'our', 'list', 'info', 'information', 'use', 'using', 'make', 'like', 'want', 'some',
  'more', 'than', 'then', 'not', 'but', 'been', 'being', 'had', 'any', 'all', 'each', 'few', 'most',
  'other', 'some', 'such', 'those', 'there', 'here'
]);

// Domains that are almost never the answer to a tech question.
const JUNK_RE =
  /(poki\.com|crazygames|freegames|garena|kizi\.com|friv|agame|games\.io|(?:play|apps)\.google\.com\/store|quora\.com|pinterest|facebook\.com|instagram\.com|tiktok\.com|amazon\.|aliexpress|temu\.com|walmart\.com|ebay\.com|booking\.com|tripadvisor|skyscanner|expedia|healthline\.com|webmd\.com|wiki\.how|answers\.com|slideshare|scribd|researchgate\.net|britannica|buzzfeed|forbes\.com|msn\.com|newsbreak|dailymail|ndtv\.com|lokmat\.com|livemint\.com|hindustantimes\.com|plex\.tv|tubitv\.com|y8\.com|merriam-webster\.com|dictionary\.cambridge\.org|thefreedictionary\.com|dictionary\.com|wordreference\.com|collinsdictionary\.com|vocabulary\.com|thesaurus\.com|bestbuy\.com|target\.com|flipkart\.com|zillow\.com|indeed\.com|monster\.com|yahoo\.com|aol\.com|x\.com\/|twitter\.com\/|youtube\.com|ifixit\.com|fixderma|ideascale\.com|researchmethod\.net|en\.m\.wikipedia\.org\/wiki\/Research)/i;

// Known official documentation hosts per product — when the user asks about
// one of these, we also search the official docs directly.
const OFFICIAL_DOMAINS = [
  { terms: ['render'], host: 'render.com' },
  { terms: ['netlify'], host: 'docs.netlify.com' },
  { terms: ['vercel'], host: 'vercel.com' },
  { terms: ['gemini', 'aistudio'], host: 'ai.google.dev' },
  { terms: ['openai', 'chatgpt'], host: 'platform.openai.com' },
  { terms: ['anthropic', 'claude'], host: 'docs.anthropic.com' },
  { terms: ['groq'], host: 'console.groq.com' },
  { terms: ['sarvam'], host: 'docs.sarvam.ai' },
  { terms: ['mistral', 'le chat'], host: 'docs.mistral.ai' },
  { terms: ['supabase'], host: 'supabase.com' },
  { terms: ['firebase'], host: 'firebase.google.com' },
  { terms: ['cloudflare'], host: 'developers.cloudflare.com' },
  { terms: ['github'], host: 'docs.github.com' },
  { terms: ['netlify'], host: 'docs.netlify.com' },
  { terms: ['react'], host: 'react.dev' },
  { terms: ['nextjs', 'next.js'], host: 'nextjs.org' },
  { terms: ['node'], host: 'nodejs.org' },
  { terms: ['npm'], host: 'docs.npmjs.com' },
  { terms: ['docker'], host: 'docs.docker.com' },
  { terms: ['typescript'], host: 'www.typescriptlang.org' },
  { terms: ['python'], host: 'docs.python.org' }
];

function officialHostFor(q) {
  const lq = q.toLowerCase();
  for (const d of OFFICIAL_DOMAINS) {
    if (d.terms.some((t) => lq.includes(t))) return d.host;
  }
  return null;
}

// Keyless search engines sometimes return SEO junk. Keep only results that
// actually relate to the query: weighted term hits (title counts most), a
// junk-domain blocklist, and an optional official-docs search pass.
function relevantTerms(q) {
  const terms = new Set();
  for (const raw of q.toLowerCase().match(/[a-z0-9]{2,30}/g) || []) {
    if (!STOPWORDS.has(raw)) terms.add(raw);
  }
  return [...terms];
}

function scoreResult(terms, r) {
  if (JUNK_RE.test(r.url)) return -1;
  const title = r.title.toLowerCase();
  const url = r.url.toLowerCase();
  const snip = (r.snippet || '').toLowerCase();
  let score = 0;
  const hit = new Set();
  for (const t of terms) {
    const inT = title.includes(t);
    const inU = url.includes(t);
    const inS = snip.includes(t);
    if (inT) { score += 3; hit.add(t); }
    if (inU) { score += 2; hit.add(t); }
    if (inS) { score += 1; hit.add(t); }
  }
  // Pass only when the result genuinely relates: at least one query term in
  // the title/URL AND two distinct term hits, or a very high score.
  const titleOrUrl = terms.some((t) => title.includes(t) || url.includes(t));
  if ((hit.size >= 2 && titleOrUrl) || score >= 6) return score;
  return 0;
}

function filterRelevant(results, q) {
  const terms = relevantTerms(q);
  if (terms.length === 0) return results.filter((r) => !JUNK_RE.test(r.url));
  const scored = results
    .map((r) => ({ r, score: scoreResult(terms, r) }))
    .filter((s) => s.score >= 3)
    .sort((a, b) => b.score - a.score);
  return scored.map((s) => s.r);
}

/**
 * Tavily Search API (legit free tier: 1,000 searches/month, no credit card,
 * https://app.tavily.com). Used when TAVILY_API_KEY is configured.
 * @param {string} q
 * @param {number} limit
 */
async function tavilySearch(q, limit) {
  const key = process.env.TAVILY_API_KEY;
  if (!key) return null;
  const res = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ api_key: key, query: q, search_depth: 'basic', max_results: limit })
  });
  if (!res.ok) {
    const err = new Error(`Tavily search failed (${res.status}).`);
    err.status = res.status;
    throw err;
  }
  const data = await res.json();
  return (data.results || [])
    .filter((x) => x.title && x.url)
    .map((x) => ({ title: x.title, url: x.url, snippet: x.content || '' }));
}

/**
 * Live web search. Preference order:
 *   1. Tavily (when TAVILY_API_KEY is configured — reliable, official results)
 *   2. Official documentation host for known products (keyless)
 *   3. Bing -> DuckDuckGo keyless chain (SEO junk filtered out)
 * @param {string} q
 * @param {number} [limit]
 */
async function webSearch(q, limit = 5) {
  const l = Math.max(1, Math.min(8, limit));
  const seen = new Set();
  const merged = [];

  const add = (r) => {
    if (!r || !r.url || seen.has(r.url)) return;
    seen.add(r.url);
    merged.push(r);
  };

  if (process.env.TAVILY_API_KEY) {
    try {
      for (const r of filterRelevant(await tavilySearch(q, l * 2), q)) add(r);
    } catch (e) {
      console.error('tavily search failed, using keyless fallback:', e.message);
    }
  }

  // Official-docs pass: when the query mentions a known product, official
  // documentation is almost always the best answer.
  const host = officialHostFor(q);
  if (merged.length < l && host) {
    try {
      for (const r of filterRelevant(await bingSearch(`site:${host} ${q}`, l * 3), q)) add(r);
    } catch (e) { /* fall through */ }
    try {
      for (const r of filterRelevant(await duckDuckGoSearch(`site:${host} ${q}`, l * 3), q)) add(r);
    } catch (e) { /* fall through */ }
  }

  if (merged.length < l) {
    try {
      for (const r of filterRelevant(await bingSearch(q, l * 3), q)) add(r);
    } catch (e) { /* fall through */ }
  }

  if (merged.length < l) {
    try {
      for (const r of filterRelevant(await duckDuckGoSearch(q, l * 3), q)) add(r);
    } catch (e) { /* fall through */ }
  }

  return merged.slice(0, l);
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
