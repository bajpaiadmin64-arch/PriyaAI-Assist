import React from 'react';
import { speechSupported, createRecognizer } from '../voice.js';

export default function Composer({ onSend, disabled, voiceLang, onListeningChange }) {
  const [text, setText] = React.useState('');
  const [listening, setListening] = React.useState(false);
  const inputRef = React.useRef(null);
  const recognizerRef = React.useRef(null);

  const setListeningBoth = (v) => {
    setListening(v);
    onListeningChange && onListeningChange(v);
  };

  const autosize = () => {
    const ta = inputRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight, 140) + 'px';
  };

  const submit = () => {
    const t = text.trim();
    if (!t || disabled) return;
    onSend(t);
    setText('');
    requestAnimationFrame(autosize);
  };

  const toggleMic = () => {
    if (!speechSupported()) {
      toast('Voice input needs Chrome or Edge');
      return;
    }
    if (listening) {
      recognizerRef.current && recognizerRef.current.stop();
      return;
    }
    if (!recognizerRef.current) {
      const r = createRecognizer();
      if (!r) { toast('Voice input is not supported in this browser'); return; }
      r.on({
        onResult: (t) => {
          setText(t);
          requestAnimationFrame(autosize);
        },
        onEnd: () => setListeningBoth(false),
        onError: (e) => {
          setListeningBoth(false);
          if (e === 'not-allowed') toast('Microphone access denied. Allow mic in browser settings.');
          else if (e !== 'aborted') toast('Voice error: ' + e);
        }
      });
      recognizerRef.current = r;
    }
    const lang = voiceLang === 'auto'
      ? (navigator.language && /^(hi|en)/i.test(navigator.language) ? navigator.language : 'en-IN')
      : voiceLang;
    recognizerRef.current.start(lang);
    setListeningBoth(true);
  };

  return (
    <div className="input-bar-wrap">
      <div className="input-bar">
        <button className={`icon-btn mic-btn ${listening ? 'recording' : ''}`} onClick={toggleMic} title="Speak (voice input)" type="button">
          <svg viewBox="0 0 24 24" className="ic"><path d="M12 14a3 3 0 0 0 3-3V5a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V21h2v-3.08A7 7 0 0 0 19 11h-2z" /></svg>
          {listening && <span className="mic-ripple" />}
        </button>
        <textarea
          ref={inputRef}
          value={text}
          onChange={(e) => { setText(e.target.value); autosize(); }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          placeholder="Type your message… (Hindi / English / Hinglish)"
          rows={1}
        />
        <button className="icon-btn send-btn" onClick={submit} disabled={disabled || !text.trim()} title="Send" type="button">
          <svg viewBox="0 0 24 24" className="ic"><path d="M3.4 20.4l20-8.4-20-8.4v6.6L17 12 3.4 13.8v6.6z" /></svg>
        </button>
      </div>
      {listening && <p className="input-note listening-note">🎙️ Listening… Priya sun rahi hai</p>}
      <p className="input-note">Priya samajhti hai Hindi, English aur Hinglish.</p>
    </div>
  );
}

let toastEl = null;
export function toast(msg) {
  if (!toastEl) {
    toastEl = document.createElement('div');
    toastEl.className = 'toast';
    document.body.appendChild(toastEl);
  }
  toastEl.textContent = msg;
  toastEl.hidden = false;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => { toastEl.hidden = true; }, 2200);
}
