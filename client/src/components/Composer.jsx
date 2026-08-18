import React from 'react';
import { speechSupported, createRecognizer, pickSTTLang, stopBargeIn } from '../voice.js';

export default function Composer({ onSend, disabled, voiceLang, conversationLang, onListeningChange }) {
  const [text, setText] = React.useState('');
  const [listening, setListening] = React.useState(false);
  const [attached, setAttached] = React.useState(null); // { name, size, content }
  const inputRef = React.useRef(null);
  const fileRef = React.useRef(null);
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

  const pickFile = () => {
    const f = fileRef.current && fileRef.current.files && fileRef.current.files[0];
    if (!f) return;
    // Text attachments only; content is read locally and sent with the message.
    const MAX = 50 * 1024;
    const reader = new FileReader();
    reader.onload = () => {
      let content = String(reader.result || '');
      if (content.length > MAX) {
        content = content.slice(0, MAX) + `\n…(file was larger; only the first ${MAX} characters were included)`;
      }
      setAttached({ name: f.name, size: f.size, content });
      fileRef.current.value = '';
    };
    reader.onerror = () => toast('Could not read that file.');
    reader.readAsText(f);
  };

  const submit = () => {
    const t = text.trim();
    if ((!t && !attached) || disabled) return;
    onSend(t, attached);
    setText('');
    setAttached(null);
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
    stopBargeIn();
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
      ? (conversationLang
          ? pickSTTLang(conversationLang)
          : (navigator.language && /^(hi|en)/i.test(navigator.language) ? navigator.language : 'en-IN'))
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
        <input ref={fileRef} type="file" accept=".txt,.md,.csv,.json,.log,.js,.jsx,.ts,.tsx,.html,.css,.py,.sh,.yml,.yaml,.env,.env.example" hidden onChange={pickFile} />
        <button className={`icon-btn attach-btn ${attached ? 'has-file' : ''}`} onClick={() => fileRef.current && fileRef.current.click()} title="Attach a file (text/csv/log)" type="button">
          <svg viewBox="0 0 24 24" className="ic"><path d="M16.5 6v11.5a4 4 0 0 1-8 0V5a2.5 2.5 0 0 1 5 0v10.5a1 1 0 0 1-2 0V6H10v9.5a2.5 2.5 0 0 0 5 0V5a4 4 0 0 0-8 0v12.5a5.5 5.5 0 0 0 11 0V6h-1.5z" /></svg>
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
        <button className="icon-btn send-btn" onClick={submit} disabled={disabled || (!text.trim() && !attached)} title="Send" type="button">
          <svg viewBox="0 0 24 24" className="ic"><path d="M3.4 20.4l20-8.4-20-8.4v6.6L17 12 3.4 13.8v6.6z" /></svg>
        </button>
      </div>
      {attached && (
        <div className="attach-chip">
          📎 {attached.name} <span className="attach-size">({(attached.size / 1024).toFixed(1)} KB)</span>
          <button type="button" className="attach-x" onClick={() => setAttached(null)} title="Remove">×</button>
        </div>
      )}
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
