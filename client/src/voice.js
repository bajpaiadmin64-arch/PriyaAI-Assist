/* Voice helpers — browser-native Web Speech APIs only. */

let voicesCache = [];
let recognition = null;

export function voiceSupported() {
  return 'speechSynthesis' in window;
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

function stripMarkdown(s) {
  return s
    .replace(/```[\w-]*\n?[\s\S]*?```/g, ' ')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/[*_#>|]/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

export function speak(text, lang) {
  if (!voiceSupported()) return false;
  const clean = stripMarkdown(text).slice(0, 2200);
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(clean);
  const v = pickVoice(lang || 'en');
  if (v) u.voice = v;
  u.lang = v && v.lang ? v.lang : lang === 'hi' ? 'hi-IN' : 'en-IN';
  u.rate = 1.0;
  u.pitch = 1.05;
  speechSynthesis.speak(u);
  return true;
}

export function stopSpeaking() {
  if (voiceSupported()) speechSynthesis.cancel();
}

export function isSpeaking() {
  return voiceSupported() && speechSynthesis.speaking;
}

/**
 * Create a speech recognizer bound to callbacks.
 * @returns {object|null} {start(lang), stop(), setListeners}
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
