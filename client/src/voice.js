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

  const { text } = prepareForSpeech(rawText, { lang });

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

/**
 * Create a speech recognizer bound to callbacks.
 * @returns {object|null} {start(lang), stop(), on(cb)}
 */
export function createRecognizer() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) return null;
  recognition = new SR();
  recognition.interimResults = true;
  recognition.continuous = false;
  recognition.maxAlternatives = 1;
  return {
    start(lang) {
      recognition.lang = lang || 'en-IN';
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
        let transcript = '';
        for (let i = e.resultIndex; i < e.results.length; i++) {
          transcript += e.results[i][0].transcript;
        }
        cb.onResult(transcript);
      };
      recognition.onend = () => cb.onEnd && cb.onEnd();
      recognition.onerror = (e) => cb.onError && cb.onError(e.error);
    }
  };
}