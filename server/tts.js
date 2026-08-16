'use strict';

/**
 * Priya voice engine.
 * Primary:   Sarvam AI Bulbul v3 — native Hindi voices, Hinglish code-switching,
 *            Indian name pronunciation, pace control, free tier.
 * Secondary: ElevenLabs multilingual Flash — low-latency multilingual TTS.
 * Fallback:  Browser speech synthesis (handled on the client).
 */

const { prepareForTTS } = require('./tts-normalize');

const SARVAM_BASE = 'https://api.sarvam.ai';
const ELEVEN_BASE = 'https://api.elevenlabs.io';
const ELEVEN_DEFAULT_VOICE = '21m00Tcm4TlvDq8ikWAM'; // Rachel (library default)

// Sarvam Bulbul v3 female voices — priya & ishita are Tier 1 (CER <= 0.20%).
const SARVAM_VOICES = [
  { id: 'priya', name: 'Priya', note: 'Best-quality female — recommended' },
  { id: 'ishita', name: 'Ishita', note: 'Best-quality female' },
  { id: 'suhani', name: 'Suhani', note: 'Warm, clear female' },
  { id: 'roopa', name: 'Roopa', note: 'Natural female' },
  { id: 'shreya', name: 'Shreya', note: 'Friendly female' },
  { id: 'neha', name: 'Neha', note: 'Conversational female' },
  { id: 'pooja', name: 'Pooja', note: 'Calm female' },
  { id: 'simran', name: 'Simran', note: 'Expressive female' },
  { id: 'kavya', name: 'Kavya', note: 'Soft female' },
  { id: 'ritu', name: 'Ritu', note: 'Lively female' }
];

const SPEED_PACE = { slow: 0.85, normal: 1.0, fast: 1.25 };
const SARVAM_MAX_CHARS = 2000;

function langCode(lang) {
  return lang === 'hi' ? 'hi-IN' : 'en-IN';
}

function splitChunks(text, max = SARVAM_MAX_CHARS) {
  if (text.length <= max) return [text];
  const parts = text.split(/(?<=[.!?।])\s+/);
  const chunks = [];
  let cur = '';
  for (const s of parts) {
    const next = (cur ? cur + ' ' : '') + s;
    if (next.length > max && cur) {
      chunks.push(cur.trim());
      cur = s;
    } else {
      cur = next;
    }
  }
  if (cur.trim()) chunks.push(cur.trim());
  return chunks;
}

function joinWav(buffers) {
  if (buffers.length === 1) return buffers[0];
  let dataLen = 0;
  const datas = [];
  for (const b of buffers) {
    if (b.length < 44 || b.toString('ascii', 0, 4) !== 'RIFF') {
      datas.push(b);
      dataLen += b.length;
      continue;
    }
    const size = b.readUInt32LE(40);
    datas.push(b.subarray(44, 44 + size));
    dataLen += size;
  }
  const first = buffers[0];
  const channels = first.readUInt16LE(22);
  const sampleRate = first.readUInt32LE(24);
  const bits = first.readUInt16LE(34);
  const byteRate = sampleRate * channels * (bits / 8);
  const blockAlign = channels * (bits / 8);
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + dataLen, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bits, 34);
  header.write('data', 36);
  header.writeUInt32LE(dataLen, 40);
  return Buffer.concat([header, ...datas]);
}

async function sarvamTTS(text, { lang, pace, speaker }) {
  const key = process.env.SARVAM_API_KEY;
  if (!key) throw new Error('SARVAM_API_KEY not set');

  const chunks = splitChunks(text);
  const audios = [];

  for (const chunk of chunks) {
    const res = await fetch(`${SARVAM_BASE}/text-to-speech`, {
      method: 'POST',
      headers: {
        'api-subscription-key': key,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        text: chunk,
        model: 'bulbul:v3',
        language_code: langCode(lang),
        speaker: speaker || 'priya',
        pace
      })
    });

    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      const detail = (body.error && (body.error.message || JSON.stringify(body.error))) || res.statusText;
      throw new Error(`Sarvam TTS ${res.status}: ${detail}`);
    }
    const list = body.audios || [];
    if (!list.length) throw new Error('Sarvam TTS: empty audio response');
    audios.push(Buffer.from(list.join(''), 'base64'));
  }

  return { audio: joinWav(audios), mime: 'audio/wav', provider: 'sarvam' };
}

let elevenVoiceCache = null;
async function pickElevenVoice() {
  if (elevenVoiceCache) return elevenVoiceCache;
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) return ELEVEN_DEFAULT_VOICE;
  try {
    const res = await fetch(`${ELEVEN_BASE}/v1/voices`, { headers: { 'xi-api-key': key } });
    if (!res.ok) return ELEVEN_DEFAULT_VOICE;
    const data = await res.json();
    const voices = data.voices || [];
    const indianFemale =
      voices.find((v) => /^(anika|priya|neha|riya|diya|aarohi|kavya|ishita|meera|monika|nisha|pooja|simran)/i.test(v.name)) ||
      voices.find((v) => /indian/i.test((v.labels && (v.labels.accent || '')) + ' ' + v.name)) ||
      voices.find((v) => /female/i.test(v.labels && v.labels.gender || ''));
    elevenVoiceCache = indianFemale ? indianFemale.voice_id : ELEVEN_DEFAULT_VOICE;
  } catch (e) {
    elevenVoiceCache = ELEVEN_DEFAULT_VOICE;
  }
  return elevenVoiceCache;
}

async function elevenTTS(text, { lang }) {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) throw new Error('ELEVENLABS_API_KEY not set');

  const voiceId = await pickElevenVoice();
  const res = await fetch(
    `${ELEVEN_BASE}/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`,
    {
      method: 'POST',
      headers: {
        'xi-api-key': key,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        text,
        model_id: 'eleven_flash_v2_5', // multilingual, low-latency
        voice_settings: {
          stability: 0.45,
          similarity_boost: 0.7,
          style: 0.2,
          use_speaker_boost: true
        }
      })
    }
  );
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`ElevenLabs TTS ${res.status}: ${body.slice(0, 200)}`);
  }
  return { audio: Buffer.from(await res.arrayBuffer()), mime: 'audio/mpeg', provider: 'elevenlabs' };
}

/**
 * Synthesize speech for an AI reply.
 * @param {string} rawText full AI reply (markdown allowed)
 * @param {{ lang?: 'hi'|'en', speed?: 'slow'|'normal'|'fast', voice?: string }} opts
 * @returns {Promise<{audio: Buffer, mime: string, provider: string, hadCode: boolean, text: string}>}
 */
async function synthesize(rawText, opts = {}) {
  const lang = opts.lang === 'hi' ? 'hi' : 'en';
  const speed = SPEED_PACE[opts.speed] ? opts.speed : 'normal';
  const pace = SPEED_PACE[speed];

  const { text, hadCode } = prepareForTTS(rawText, { lang });
  if (!text) throw new Error('Nothing to speak');

  const errors = [];

  if (process.env.SARVAM_API_KEY) {
    try {
      const out = await sarvamTTS(text, { lang, pace, speaker: opts.voice });
      return { ...out, hadCode, text, speed };
    } catch (e) {
      errors.push('sarvam: ' + e.message);
    }
  }

  if (process.env.ELEVENLABS_API_KEY) {
    try {
      const out = await elevenTTS(text, { lang });
      return { ...out, hadCode, text, speed };
    } catch (e) {
      errors.push('elevenlabs: ' + e.message);
    }
  }

  const err = new Error('No TTS provider configured or all providers failed');
  err.fallback = true; // client should use browser speech synthesis
  err.providerErrors = errors;
  err.preparedText = text;
  throw err;
}

function ttsStatus() {
  return {
    providers: {
      sarvam: { configured: !!process.env.SARVAM_API_KEY, label: 'Sarvam AI (Bulbul v3)' },
      elevenlabs: { configured: !!process.env.ELEVENLABS_API_KEY, label: 'ElevenLabs (multilingual flash)' }
    },
    defaultVoice: 'priya'
  };
}

module.exports = { synthesize, ttsStatus, SARVAM_VOICES };