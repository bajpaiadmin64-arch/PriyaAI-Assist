import React from 'react';
import PriyaOrb from './PriyaOrb.jsx';
import Markdown from '../markdown.jsx';
import { speak, isSpeaking, stopSpeaking } from '../voice.js';

function timeStr() {
  return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
  } catch (e) {
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
  }
}

const PROVIDER_LABELS = {
  gemini: 'Gemini', sarvam: 'Sarvam AI', openai: 'OpenAI', anthropic: 'Claude',
  xai: 'Grok', deepseek: 'DeepSeek', mistral: 'Mistral', groq: 'Groq',
  openrouter: 'OpenRouter', together: 'Together AI', cerebras: 'Cerebras',
  huggingface: 'Hugging Face', perplexity: 'Perplexity', custom: 'Custom model'
};

export default function Message({ msg, speed = 'normal', voice = 'priya' }) {
  const isUser = msg.role === 'user';

  if (msg.note) {
    return (
      <div className="msg-note msg-enter">
        <Markdown text={msg.content} />
      </div>
    );
  }
  const [speakingState, setSpeakingState] = React.useState(false);

  React.useEffect(() => {
    const t = setInterval(() => {
      setSpeakingState((prev) => {
        const now = isSpeaking();
        return prev !== now ? now : prev;
      });
    }, 500);
    return () => clearInterval(t);
  }, []);

  const handleSpeak = () => {
    if (isSpeaking()) {
      stopSpeaking();
    } else {
      speak(msg.content, msg.lang, { speed, voice });
    }
  };

  const handleCopy = async () => {
    await copyText(msg.content);
    toast('Copied to clipboard');
  };

  return (
    <div className={`msg ${isUser ? 'user' : 'priya'} msg-enter`}>
      {!isUser && <PriyaOrb size="sm" state="idle" />}
      <div className="msg-main">
        <div className={`msg-bubble ${isUser ? '' : 'priya-bubble'}`}>
          {isUser ? (
            <>
              {msg.file && <div className="file-chip">📎 {msg.file}</div>}
              {msg.display != null ? msg.display : msg.content}
            </>
          ) : (
            <Markdown text={msg.content} />
          )}
          {msg.error && <div className="msg-error">{msg.error}</div>}
        </div>

        {msg.sources && msg.sources.length > 0 && (
          <div className="sources">
            <span className="sources-title">Sources (live web)</span>
            {msg.sources.map((s, i) => (
              <a key={i} className="source-link" href={s.url} target="_blank" rel="noopener noreferrer">
                ↗ {s.title || s.url}
              </a>
            ))}
          </div>
        )}

        {!isUser && msg.searched && <div className="info-updated">✓ Information updated</div>}
        {!isUser && msg.provider && msg.provider !== 'tool' && (
          <div className="provider-chip">
            ⚡ {PROVIDER_LABELS[msg.provider] || msg.provider}
            {msg.model ? ` (${msg.model})` : ''}
          </div>
        )}

        <div className="msg-meta">
          <span className="msg-time">{msg.time || timeStr()}</span>
          <div className="msg-actions">
            <button className="action-btn" title="Copy" onClick={handleCopy}>
              <svg viewBox="0 0 24 24" className="ic"><path d="M16 1H4a2 2 0 0 0-2 2v14h2V3h12V1zm3 4H8a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2zm0 16H8V7h11v14z" /></svg>
            </button>
            {!isUser && (
              <button className={`action-btn ${speakingState ? 'active' : ''}`} title={speakingState ? 'Stop speaking' : 'Speak'} onClick={handleSpeak}>
                {speakingState ? (
                  <svg viewBox="0 0 24 24" className="ic"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" /></svg>
                ) : (
                  <svg viewBox="0 0 24 24" className="ic"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3a4.5 4.5 0 0 0-2.5-4.03v8.05A4.5 4.5 0 0 0 16.5 12zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z" /></svg>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
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
  toast._t = setTimeout(() => {
    toastEl.hidden = true;
  }, 2200);
}
