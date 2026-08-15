import React from 'react';
import Avatar from './components/Avatar.jsx';
import Message, { toast } from './components/Message.jsx';
import Composer from './components/Composer.jsx';
import SettingsModal from './components/SettingsModal.jsx';
import { fetchHealth, sendChat } from './api.js';
import { detectLang } from './lang.js';
import { speak, stopSpeaking, isSpeaking } from './voice.js';

const DEFAULT_SETTINGS = {
  model: 'gemini-3.6-flash',
  temp: 0.7,
  voiceLang: 'auto',
  voiceOut: true,
  webSearch: true,
  theme: 'auto',
  mode: 'balanced'
};

const MODE_HINTS = {
  simple: 'Very simple Hindi/Hinglish — no jargon.',
  balanced: 'Clear, practical answers.',
  tech: 'Deep technical debugging & commands.'
};

const SUGGESTIONS = [
  { q: 'Meri website deploy nahi ho rahi, error aa raha hai. Kaise fix karun?', label: '🛠️ Deploy issue' },
  { q: 'Write a React component that fetches data from an API and shows a loading state.', label: '⚛️ React help' },
  { q: 'How do I push my code to GitHub from VS Code step by step?', label: '🐙 Git & GitHub' },
  { q: 'Supabase aur Firebase me kya difference hai?', label: '🔥 Databases' },
  { q: 'Meri system slow ho rahi hai, kya karun?', label: '💻 PC slow' },
  { q: 'Explain prompt engineering in simple Hindi.', label: '🤖 AI / Prompt' }
];

function loadSettings() {
  try {
    const raw = sessionStorage.getItem('priya.settings');
    return Object.assign({}, DEFAULT_SETTINGS, raw ? JSON.parse(raw) : {});
  } catch (e) {
    return Object.assign({}, DEFAULT_SETTINGS);
  }
}
function saveSettings(s) {
  try { sessionStorage.setItem('priya.settings', JSON.stringify(s)); } catch (e) { /* ignore */ }
}
function loadHistory() {
  try {
    const raw = sessionStorage.getItem('priya.history');
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
}
function saveHistory(h) {
  try { sessionStorage.setItem('priya.history', JSON.stringify(h)); } catch (e) { /* ignore */ }
}

function timeStr() {
  return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export default function App() {
  const [settings, setSettings] = React.useState(loadSettings);
  const [messages, setMessages] = React.useState(loadHistory);
  const [typing, setTyping] = React.useState(false);
  const [status, setStatus] = React.useState({ state: 'connecting', label: 'Connecting…' });
  const [backend, setBackend] = React.useState(null); // {ok, model, configured}
  const [settingsOpen, setSettingsOpen] = React.useState(false);
  const chatEndRef = React.useRef(null);
  const busyRef = React.useRef(false);

  React.useEffect(() => {
    saveSettings(settings);
  }, [settings]);

  React.useEffect(() => {
    saveHistory(messages);
  }, [messages]);

  // theme
  React.useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      const resolved =
        settings.theme === 'auto' ? (mq.matches ? 'dark' : 'light') : settings.theme;
      document.documentElement.setAttribute('data-theme', resolved);
    };
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [settings.theme]);

  // health check
  React.useEffect(() => {
    (async () => {
      try {
        const h = await fetchHealth();
        setBackend({ ok: true, model: h.model, configured: h.configured });
        setStatus({ state: 'ready', label: h.configured ? 'Online' : 'No API key' });
      } catch (e) {
        setBackend({ ok: false });
        setStatus({ state: 'off', label: 'Backend offline' });
      }
    })();
  }, []);

  // scroll to bottom
  React.useEffect(() => {
    chatEndRef.current && chatEndRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, typing]);

  // global code-copy delegation
  React.useEffect(() => {
    const handler = async (e) => {
      const btn = e.target.closest('.copy-code-btn');
      if (!btn) return;
      const el = document.getElementById(btn.dataset.copy);
      if (el) {
        try {
          await navigator.clipboard.writeText(el.textContent);
        } catch (err) {
          const ta = document.createElement('textarea');
          ta.value = el.textContent;
          document.body.appendChild(ta);
          ta.select();
          document.execCommand('copy');
          ta.remove();
        }
        toast('Code copied');
      }
    };
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, []);

  const send = async (rawText) => {
    const text = rawText.trim();
    if (!text || busyRef.current) return;

    busyRef.current = true;
    setTyping(true);

    const lang = detectLang(text);
    const userMsg = { role: 'user', content: text, time: timeStr(), lang };
    const newHistory = [...messages, userMsg];
    setMessages(newHistory);

    setStatus({ state: 'busy', label: 'Thinking…' });

    try {
      const res = await sendChat({
        message: text,
        history: messages.map((m) => ({ role: m.role, content: m.content })),
        mode: settings.mode,
        useWebSearch: settings.webSearch,
        lang
      });
      const priyaMsg = {
        role: 'assistant',
        content: res.reply,
        time: timeStr(),
        lang,
        sources: res.sources && res.sources.length ? res.sources : undefined
      };
      setMessages((prev) => [...prev, priyaMsg]);
      setStatus({ state: 'ready', label: res.searched ? 'Web search done' : 'Online' });
      if (settings.voiceOut) speak(res.reply, lang);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: '⚠️ ' + (err.message || 'Something went wrong.'), time: timeStr(), lang, error: true }
      ]);
      setStatus({ state: 'off', label: 'Error' });
    } finally {
      busyRef.current = false;
      setTyping(false);
    }
  };

  const clearChat = () => {
    if (messages.length && !window.confirm('Clear the whole conversation?')) return;
    setMessages([]);
    stopSpeaking();
    setStatus({ state: 'ready', label: backend && backend.ok ? 'Online' : 'Backend offline' });
  };

  const newChat = () => {
    setMessages([]);
    stopSpeaking();
  };

  const exportChat = () => {
    if (!messages.length) { toast('No messages to export'); return; }
    const lines = messages.map((m) => {
      const who = m.role === 'user' ? 'You' : 'Priya';
      return `## ${who} (${m.time})\n${m.content}\n`;
    });
    const blob = new Blob([lines.join('\n')], { type: 'text/markdown' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `priya-chat-${new Date().toISOString().slice(0, 10)}.md`;
    a.click();
    URL.revokeObjectURL(a.href);
    toast('Chat exported');
  };

  const toggleTheme = () => {
    setSettings((s) => ({
      ...s,
      theme:
        document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark'
    }));
  };

  const toggleVoiceOut = () => {
    if (settings.voiceOut) stopSpeaking();
    setSettings((s) => ({ ...s, voiceOut: !s.voiceOut }));
  };

  const handleSpeakNow = () => {
    if (isSpeaking()) { stopSpeaking(); return; }
    const lastPriya = [...messages].reverse().find((m) => m.role === 'assistant' && !m.error);
    if (lastPriya) speak(lastPriya.content, lastPriya.lang);
  };

  const themeDark = document.documentElement.getAttribute('data-theme') === 'dark';

  return (
    <div className="app">
      {/* ============ SIDEBAR ============ */}
      <aside className="sidebar">
        <div className="sidebar-head">
          <div className="logo-row">
            <Avatar size="md" />
            <div className="brand">
              <h1>Priya AI</h1>
              <span className="brand-tag">Tech Expert</span>
            </div>
          </div>
        </div>

        <div className="sidebar-section">
          <span className="section-label">Mode</span>
          <div className="segmented">
            {['simple', 'balanced', 'tech'].map((m) => (
              <button key={m} type="button"
                className={`seg-btn ${settings.mode === m ? 'active' : ''}`}
                onClick={() => setSettings((s) => ({ ...s, mode: m }))}>
                {m === 'simple' ? 'Simple' : m === 'tech' ? 'Tech' : 'Balanced'}
              </button>
            ))}
          </div>
          <p className="mode-hint">{MODE_HINTS[settings.mode]}</p>
        </div>

        <div className="sidebar-section">
          <span className="section-label">Conversation</span>
          <button className="side-btn" onClick={newChat}>
            <svg viewBox="0 0 24 24" className="ic"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z" /></svg>
            New conversation
          </button>
          <button className="side-btn" onClick={clearChat}>
            <svg viewBox="0 0 24 24" className="ic"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z" /></svg>
            Clear conversation
          </button>
          <button className="side-btn" onClick={exportChat}>
            <svg viewBox="0 0 24 24" className="ic"><path d="M19 19H5V5h7V3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2v-7h-2v7zM14 3v2h3.6l-9.8 9.8 1.4 1.4L19 6.4V10h2V3h-7z" /></svg>
            Export chat
          </button>
          <button className="side-btn" onClick={() => setSettingsOpen(true)}>
            <svg viewBox="0 0 24 24" className="ic"><path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58a.49.49 0 0 0 .12-.61l-1.92-3.32a.49.49 0 0 0-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.49.49 0 0 0-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96a.49.49 0 0 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58a.49.49 0 0 0-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6A3.6 3.6 0 1 1 12 8.4a3.6 3.6 0 0 1 0 7.2z" /></svg>
            Settings
          </button>
        </div>

        <div className="sidebar-section sidebar-section-tools">
          <span className="section-label">Tools</span>
          <div className="tool-row">
            <span className="tool-chip">
              <span className="dot" /> Voice
            </span>
            <span className={`tool-chip ${settings.webSearch ? '' : 'off'}`}>
              <span className="dot" /> Web Search
            </span>
          </div>
          <div className="tool-row">
            <span className="tool-chip">{settings.mode[0].toUpperCase() + settings.mode.slice(1)} mode</span>
            <span className="tool-chip">Model: {backend ? backend.model : '…'}</span>
          </div>
          <p className="conn-status" id="connStatus">
            {status.label}{backend && !backend.configured && backend.ok ? ' — set GEMINI_API_KEY' : ''}
          </p>
        </div>

        <div className="sidebar-foot">
          <button className="side-btn" onClick={toggleTheme}>
            <svg viewBox="0 0 24 24" className="ic" style={{ display: themeDark ? 'none' : '' }}><path d="M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10zm0-4a1 1 0 0 1 1 1v1a1 1 0 0 1-2 0V4a1 1 0 0 1 1-1zM4 11a1 1 0 0 1 1 1 1 1 0 0 1-1 1H3a1 1 0 0 1 0-2h1zm16 0a1 1 0 0 1 1 1 1 1 0 0 1-1 1h-1a1 1 0 0 1 0-2h1zm-4.6-6.4a1 1 0 0 1 1.4 0l.7.7a1 1 0 0 1-1.4 1.4l-.7-.7a1 1 0 0 1 0-1.4zM7.2 17.2a1 1 0 0 1 1.4 0 1 1 0 0 1 0 1.4l-.7.7a1 1 0 0 1-1.4-1.4l.7-.7zm12.1-12.1a1 1 0 0 1 0 1.4l-.7.7a1 1 0 0 1-1.4-1.4l.7-.7a1 1 0 0 1 1.4 0zM7.2 6.8a1 1 0 0 1 0 1.4 1 1 0 0 1-1.4 0l-.7-.7a1 1 0 0 1 1.4-1.4l.7.7z" /></svg>
            <svg viewBox="0 0 24 24" className="ic" style={{ display: themeDark ? '' : 'none' }}><path d="M12 3a9 9 0 1 0 9 9c0-.46-.04-.92-.1-1.36a5.4 5.4 0 0 1-6.6 5.7 5.4 5.4 0 0 1-4-6.54A5.4 5.4 0 0 1 12 3z" /></svg>
            <span>{themeDark ? 'Light mode' : 'Dark mode'}</span>
          </button>
          <p className="foot-note">Priya AI v1.0</p>
        </div>
      </aside>

      {/* ============ MAIN CHAT ============ */}
      <main className="chat-panel">
        <header className="chat-header">
          <div className="header-left">
            <Avatar size="sm" />
            <div className="header-title">
              <h2>Priya</h2>
              <div className="status-line">
                <span className={`status-dot ${status.state}`} />
                <span>{status.label}</span>
              </div>
            </div>
          </div>

          <div className="header-actions">
            <span className={`web-indicator ${settings.webSearch ? 'on' : ''}`} title="Web search mode">
              <svg viewBox="0 0 24 24" className="ic"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm7.93 9h-3.02a15.6 15.6 0 0 0-1.35-4.75A8.03 8.03 0 0 1 19.93 11zM12 4c.83 1.2 1.74 3.23 1.96 5H10.04C10.26 7.23 11.17 5.2 12 4zM4.07 13a8.1 8.1 0 0 1 0-2h3.02c-.03.66-.05 1.32-.05 2s.02 1.34.05 2H4.07zm.56 2h3.02c.32 1.7 1.35 3.65 1.35 4.75A8.04 8.04 0 0 1 4.63 15zM12 20c-.83-1.2-1.74-3.23-1.96-5h3.92c-.22 1.77-1.13 3.8-1.96 5zm2.98-5H9.02c-.04-.66-.07-1.32-.07-2s.03-1.34.07-2h5.96c.04.66.07 1.32.07 2s-.03 1.34-.07 2zm-.28 4.75c.83-1.1 1.35-3.05 1.35-4.75h3.02a8.04 8.04 0 0 1-4.37 4.75zM14.94 6.25c-.5 1.1-.87 2.65-1.04 3.75h-3.8c-.17-1.1-.54-2.65-1.04-3.75A8.04 8.04 0 0 1 14.94 6.25z" /></svg>
              Web: {settings.webSearch ? 'On' : 'Off'}
            </span>
            <button className="icon-btn" onClick={newChat} title="New conversation">
              <svg viewBox="0 0 24 24" className="ic"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z" /></svg>
            </button>
            <button className={`icon-btn ${settings.voiceOut ? 'active' : ''}`} onClick={toggleVoiceOut} title="Voice replies: on/off">
              <svg viewBox="0 0 24 24" className="ic"><path d="M12 14a3 3 0 0 0 3-3V5a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V21h2v-3.08A7 7 0 0 0 19 11h-2z" /></svg>
            </button>
            <button className="icon-btn" onClick={handleSpeakNow} title="Play / stop last reply">
              {isSpeaking() ? (
                <svg viewBox="0 0 24 24" className="ic"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" /></svg>
              ) : (
                <svg viewBox="0 0 24 24" className="ic"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3a4.5 4.5 0 0 0-2.5-4.03v8.05A4.5 4.5 0 0 0 16.5 12zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z" /></svg>
              )}
            </button>
            <button className="icon-btn" onClick={clearChat} title="Clear conversation">
              <svg viewBox="0 0 24 24" className="ic"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z" /></svg>
            </button>
            <button className="icon-btn" onClick={() => setSettingsOpen(true)} title="Settings">
              <svg viewBox="0 0 24 24" className="ic"><path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58a.49.49 0 0 0 .12-.61l-1.92-3.32a.49.49 0 0 0-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.49.49 0 0 0-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96a.49.49 0 0 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58a.49.49 0 0 0-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6A3.6 3.6 0 1 1 12 8.4a3.6 3.6 0 0 1 0 7.2z" /></svg>
            </button>
          </div>
        </header>

        <div className="chat-body">
          {messages.length === 0 && (
            <div className="welcome">
              <Avatar size="lg" className="welcome-avatar" />
              <h2>Namaste! I'm <span className="grad">Priya</span></h2>
              <p className="welcome-sub">
                Aapki personal AI technology expert — websites, coding, hosting, AI tools, troubleshooting.
                Hindi, English aur Hinglish sab samajhti hoon.
              </p>
              <div className="chips">
                {SUGGESTIONS.map((s) => (
                  <button key={s.q} type="button" className="suggest" onClick={() => send(s.q)}>
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((m, i) => (
            <Message key={i} msg={m} />
          ))}

          {typing && (
            <div className="msg priya thinking">
              <Avatar size="sm" />
              <div className="msg-bubble priya-bubble thinking-bubble">
                <span className="tb-label">Priya is thinking</span>
                <span className="dots"><i /><i /><i /></span>
              </div>
            </div>
          )}
          <div ref={chatEndRef} />
        </div>

        <Composer onSend={send} disabled={typing} voiceLang={settings.voiceLang} />
      </main>

      <SettingsModal
        open={settingsOpen}
        settings={settings}
        onChange={setSettings}
        onClose={() => setSettingsOpen(false)}
      />
    </div>
  );
}
