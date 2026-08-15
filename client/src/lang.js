const DEVANAGARI = /[\u0900-\u097F]/;
const HINGLISH_WORDS =
  /\b(kaise|kya|karun|karu|karne|karna|karo|kijiye|meri|mera|mere|nahi|nahee|hai|hain|ho|hoga|hogi|aap|tum|mujhe|apne|website|theek|bilkul|sab|bahut|aur|toh|bhi|koi|dekh|dekhna|samjhao|samajh|error|deploy|folder|file|kaam|wala|wale|bana|banana|chahiye|paar|problem|solution|matlab|kar|kr|rakh|raha|rahi)\b/i;

export function detectLang(text) {
  if (!text) return 'en';
  if (DEVANAGARI.test(text)) return 'hi';
  const words = text.split(/\s+/).filter((w) => /[a-zA-Z]/.test(w));
  if (words.length === 0) return 'hi';
  let hits = 0;
  for (const w of words) if (HINGLISH_WORDS.test(w)) hits++;
  if (hits / words.length >= 0.18 || hits >= 2) return 'hi';
  return 'en';
}
