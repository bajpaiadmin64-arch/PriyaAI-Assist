/**
 * Text normalization for the browser speech-synthesis fallback.
 * Mirrors server/tts-normalize.js.
 */

const CODE_PLACEHOLDER = 'CODEBLOCKPLACEHOLDER';
const CODE_SAYING_HI = 'Maine code bhi diya hai, aap use screen par dekh sakte hain.';
const CODE_SAYING_EN = "I've also shared the code, you can see it on screen.";

const PRONUNCIATION_MAP = [
  { re: /\bURLs?\b/gi, to: 'you are el' },
  { re: /\bAPIs?\b/gi, to: 'ay pee eye' },
  { re: /\bJSON\b/g, to: 'jay son' },
  { re: /\bSQL\b/g, to: 'ess cue ell' },
  { re: /\bNode\.js\b/gi, to: 'node jay ess' },
  { re: /\bVS Code\b/gi, to: 'vee ess code' },
  { re: /\bGitHub\b/gi, to: 'git hub' },
  { re: /\bChatGPT\b/gi, to: 'chat gee pee tee' },
  { re: /\bFirebase\b/gi, to: 'fire base' },
  { re: /\bSupabase\b/gi, to: 'soo pa base' },
  { re: /\bNetlify\b/gi, to: 'net li fy' },
  { re: /\bVercel\b/gi, to: 'ver sel' },
  { re: /\bHTTPS?\b/g, to: 'aitch tee tee pee' },
  { re: /\bHTML\b/gi, to: 'aitch tee em el' },
  { re: /\bCSS\b/gi, to: 'see ess ess' }
];

export function stripMarkdown(src) {
  let text = src;

  text = text.replace(/```[\w-]*\n?[\s\S]*?```/g, ' ' + CODE_PLACEHOLDER + ' ');

  text = text.replace(/`([^`]+)`/g, '$1');

  text = text.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '$1');

  text = text.replace(/!\[[^\]]*\]\([^)]*\)/g, '');

  text = text.replace(/https?:\/\/[^\s<>"']+/g, ' ');

  text = text.replace(/^#{1,6}\s+/gm, '');
  text = text.replace(/(\*\*|__)(.*?)\1/g, '$2');
  text = text.replace(/(\*|_)([^*_\n]+)\1/g, '$2');
  text = text.replace(/~~(.*?)~~/g, '$1');
  text = text.replace(/^\s*(?:-{3,}|\*{3,})\s*$/gm, '');

  text = text.replace(/^\s*&gt;\s?/gm, '');
  text = text.replace(/^\s*>\s?/gm, '');

  text = text.replace(/^\s*[-*+]\s+/gm, '');
  text = text.replace(/^\s*\d+\.\s+/gm, '');

  text = text.replace(/\[\d+\]/g, '');
  text = text.replace(/\(\s*source[s]?[^)]*\)/gi, '');
  text = text.replace(/[\[\]{}<>|]/g, '');

  return text;
}

function collapseWhitespace(text) {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/ +([.,!?;:](?=\s|$))/g, '$1')
    .trim();
}

export function applyPronunciation(text) {
  let out = text;
  for (const item of PRONUNCIATION_MAP) {
    out = out.replace(item.re, item.to);
  }
  return out;
}

/**
 * @param {string} raw
 * @param {{ lang?: 'hi'|'en' }} opts
 * @returns {{ text: string, hadCode: boolean }}
 */
export function prepareForSpeech(raw, opts = {}) {
  const lang = opts.lang === 'hi' ? 'hi' : 'en';
  const cleaned = stripMarkdown(String(raw || ''));
  const hadCode = cleaned.includes(CODE_PLACEHOLDER);

  let text = cleaned.replace(
    new RegExp(CODE_PLACEHOLDER, 'g'),
    ' ' + (lang === 'hi' ? CODE_SAYING_HI : CODE_SAYING_EN) + ' '
  );

  text = text.replace(/\.{3,}/g, ', ');
  text = applyPronunciation(collapseWhitespace(text));

  return { text, hadCode };
}