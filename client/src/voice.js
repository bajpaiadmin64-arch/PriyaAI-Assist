/* Voice engine — Priya natural Indian voice.
 * Primary:   backend /api/tts (Sarvam AI Bulbul v3, ElevenLabs fallback)
 * Fallback:  browser speech synthesis (hi-IN / en-IN voices)
 */

import { prepareForSpeech } from './tts-normalize.js';

let voicesCache = [];
let recognition = null;

let audioEl = null;
let backendUnavailableUntil = 0; // retry cooldown after a "no provider" response
let browserQueue = [];
let browserPlaying = false;

const SPEED_RATE = { slow: 0.9, normal: 1.0, fast: 1.15 };
const SPEED_BACKEND = { slow: 0.85, normal: 1.0, fast: 1.25 };

export function voiceSupported() {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

export function speechSupported() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  return !!SR;
}

export function loadVoices() {
  if (!voiceSupported()) return;
  voicesCache = speechSynthesis.getVoices();
}
if (typeof window !== 'undefined') {
  loadVoices();
  if (voiceSupported()) speechSynthesis.onvoiceschanged = loadVoices;
}

function pickVoice(lang) {
  const want = lang === 'hi' ? 'hi-IN' : 'en-IN';
  const fallback = lang === 'hi' ? 'hi' : 'en';
  const byTag = voicesCache.filter((v) => v.lang && v.lang.toLowerCase() === want.toLowerCase());
  if (byTag.length) return byTag[0];
  const byPref = voicesCache.filter((v) => v.lang && v.lang.toLowerCase().startsWith(fallback));
  if (byPref.length) return byPref[0];
  return voicesCache[0] || null;
}

function getAudio() {
  if (!audioEl) {
    audioEl = new Audio();
    audioEl.preload = 'auto';
  }
  return audioEl;
}

/* ---------- Backend (premium) voice ---------- */

async function speakBackend(text, lang, speed, voice) {
  const res = await fetch('/api/tts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text,
      lang: lang === 'hi' ? 'hi' : 'en',
      speed: speed || 'normal',
      voice: voice || undefined
    })
  });

  if (res.ok) {
    const blob = await res.blob();
    const a = getAudio();
    if (a.src) URL.revokeObjectURL(a.src);
    a.src = URL.createObjectURL(blob);
    await a.play();
    return { ok: true, provider: res.headers.get('X-TTS-Provider') || 'backend', prepared: null };
  }

  let body = null;
  try { body = await res.json(); } catch (e) { /* non-json */ }

  if (body && body.fallback) {
    backendUnavailableUntil = Date.now() + 5 * 60 * 1000; // don't hammer a keyless server
    return { ok: false, fallback: true, prepared: body.preparedText || null };
  }
  throw new Error('Voice service error ' + res.status);
}

/* ---------- Browser fallback voice ---------- */

function browserSpeakNext() {
  if (browserPlaying || !browserQueue.length) return;
  browserPlaying = true;
  const { text, lang, rate, voice } = browserQueue.shift();

  const u = new SpeechSynthesisUtterance(text);
  const v = voice || pickVoice(lang || 'en');
  if (v) u.voice = v;
  u.lang = v && v.lang ? v.lang : lang === 'hi' ? 'hi-IN' : 'en-IN';
  u.rate = rate;
  u.pitch = 1.02;
  u.onend = () => {
    browserPlaying = false;
    browserSpeakNext();
  };
  u.onerror = () => {
    browserPlaying = false;
    browserSpeakNext();
  };
  speechSynthesis.speak(u);
}

function browserSpeak(text, lang, speed) {
  if (!voiceSupported()) return false;
  const clean = text.slice(0, 3000);
  const rate = SPEED_RATE[speed] || 1.0;
  const v = pickVoice(lang || 'en');

  speechSynthesis.cancel();
  browserPlaying = false;

  // chunk by sentences so long replies never get cut off
  const sentences = clean.match(/[^.!?।]+[.!?।]?/g) || [clean];
  let chunk = '';
  for (const s of sentences) {
    if ((chunk + s).length > 180 && chunk) {
      browserQueue.push({ text: chunk.trim(), lang, rate, voice: v });
      chunk = s;
    } else {
      chunk += s;
    }
  }
  if (chunk.trim()) browserQueue.push({ text: chunk.trim(), lang, rate, voice: v });
  browserSpeakNext();
  return true;
}

/* ---------- Public API ---------- */

/**
 * Speak a Priya reply with the best available voice.
 * @param {string} rawText markdown reply
 * @param {'hi'|'en'} lang
 * @param {{speed?: 'slow'|'normal'|'fast'}} opts
 * @returns {Promise<boolean>} started
 */
export async function speak(rawText, lang, opts = {}) {
  stopSpeaking();

  const { text: prepared } = prepareForSpeech(rawText, { lang });

  // TTS quota cap: long replies are truncated to the first ~900 chars
  // so voice never drains the server TTS budget.
  const text = prepared.length > 900 ? prepared.slice(0, 900) : prepared;

  // 1) Premium backend voice (Sarvam AI -> ElevenLabs on the server)
  if (Date.now() >= backendUnavailableUntil) {
    try {
      const r = await speakBackend(text, lang, opts.speed, opts.voice);
      return r.ok;
    } catch (e) {
      // network/server error — fall through to browser voice
    }
  }

  // 2) Browser native voice (hi-IN / en-IN)
  return browserSpeak(text, lang, opts.speed);
}

export function stopSpeaking() {
  if (audioEl) {
    audioEl.pause();
    audioEl.currentTime = 0;
  }
  if (voiceSupported()) speechSynthesis.cancel();
  browserQueue = [];
  browserPlaying = false;
}

export function pauseSpeaking() {
  if (audioEl && !audioEl.paused && !audioEl.ended) audioEl.pause();
  else if (voiceSupported()) speechSynthesis.pause();
}

export function resumeSpeaking() {
  if (audioEl && audioEl.paused && audioEl.src && !audioEl.ended) audioEl.play();
  else if (voiceSupported()) speechSynthesis.resume();
}

export function isSpeaking() {
  if (audioEl && audioEl.src && !audioEl.ended) return !audioEl.paused;
  return voiceSupported() && speechSynthesis.speaking;
}

export function isPaused() {
  if (audioEl && audioEl.src && !audioEl.ended) return audioEl.paused;
  return voiceSupported() && speechSynthesis.paused;
}

export function pickSTTLang(lastLang) {
  return lastLang === 'hi' ? 'hi-IN' : 'en-IN';
}

/* ---------- Barge-in / interruptible conversation ---------- */

const STOP_WORDS_RE =
  /^(ruko|ruk|rukja|ruko jao|wait|stop|bas|bas kar|chup|chup ho|ek minute|one minute|one moment|hold on|hold up|suno|sun|yeh nahi|nahi nahi|no no|wait wait|thoda ruko|pakdo|arey|are|woh nahi|woh mat karo)/i;

/**
 * Stop words the user can say to interrupt Priya ("Ruko", "Wait", "Stop", "Bas"...).
 */
export function isStopWord(t) {
  const s = (t || '').trim().toLowerCase().replace(/[.!?,।]+$/g, '');
  if (!s) return false;
  if (s.length <= 2) return true; // "no", "na", "bas", "ruk"...
  return STOP_WORDS_RE.test(s) || s === 'nahi' || s === 'no' || s === 'stop it';
}

let bargeInRec = null;

/**
 * Start a continuous listening session used while Priya is speaking.
 * - First words spoken while she talks → onInterrupt (caller should stop her audio instantly).
 * - Full sentence (end of speech / silence) → onFinal with the complete transcript.
 * - Stop words ("Ruko", "Wait"...) → onStopWord (just stop her, do not answer).
 */
export function startBargeIn(lang, cb) {
  if (bargeInRec) stopBargeIn();
  const r = createRecognizer();
  if (!r) return false;
  let interrupted = false;
  r.on({
    onResult: (t, final) => {
      if (final) {
        stopBargeIn();
        if (t && isStopWord(t)) {
          cb.onStopWord && cb.onStopWord();
          return;
        }
        if (t) cb.onFinal && cb.onFinal(t);
        return;
      }
      if (!interrupted) {
        interrupted = true;
        cb.onInterrupt && cb.onInterrupt();
      }
    },
    onEnd: () => cb.onEnd && cb.onEnd(),
    onError: () => cb.onEnd && cb.onEnd()
  });
  r.start(lang || 'en-IN', { continuous: true });
  bargeInRec = r;
  return true;
}

export function stopBargeIn() {
  if (bargeInRec) {
    try { bargeInRec.stop(); } catch (e) { /* ignore */ }
    bargeInRec = null;
  }
}

/**
 * Create a speech recognizer bound to callbacks.
 * @returns {object|null} {start(lang, opts), stop(), on(cb)}
 * cb.onResult(transcript, isFinal)
 */
export function createRecognizer() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) return null;
  recognition = new SR();
  recognition.interimResults = true;
  recognition.continuous = false;
  recognition.maxAlternatives = 1;
  return {
    start(lang, opts) {
      recognition.lang = lang || 'en-IN';
      recognition.continuous = !!(opts && opts.continuous);
      try {
        recognition.start();
      } catch (e) {
        /* already started */
      }
    },
    stop() {
      try { recognition.stop(); } catch (e) { /* ignore */ }
    },
    on(cb) {
      recognition.onresult = (e) => {
        let interim = '';
        let finalText = '';
        for (let i = e.resultIndex; i < e.results.length; i++) {
          if (e.results[i].isFinal) finalText += e.results[i][0].transcript;
          else interim += e.results[i][0].transcript;
        }
        const transcript = (finalText + ' ' + interim).trim();
        if (transcript) cb.onResult(transcript, finalText.length > 0);
      };
      recognition.onend = () => cb.onEnd && cb.onEnd();
      recognition.onerror = (e) => cb.onError && cb.onError(e.error);
    }
  };
}