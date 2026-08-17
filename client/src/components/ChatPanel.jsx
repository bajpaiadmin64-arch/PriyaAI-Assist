import React from 'react';
import PriyaOrb from './PriyaOrb.jsx';
import Message from './Message.jsx';
import Composer from './Composer.jsx';
import { pauseSpeaking, resumeSpeaking, isPaused, stopSpeaking } from '../voice.js';

const SUGGESTIONS = [
  { q: 'Meri website deploy nahi ho rahi, error aa raha hai. Kaise fix karun?', label: '🛠️ Deploy issue' },
  { q: 'Write a React component that fetches data from an API and shows a loading state.', label: '⚛️ React help' },
  { q: 'How do I push my code to GitHub from VS Code step by step?', label: '🐙 Git & GitHub' },
  { q: 'Supabase aur Firebase me kya difference hai?', label: '🔥 Databases' },
  { q: 'Meri system slow ho rahi hai, kya karun?', label: '💻 PC slow' },
  { q: 'Explain prompt engineering in simple Hindi.', label: '🤖 AI / Prompt' }
];

export default function ChatPanel({
  messages, typing, status, backend, settings, orbState,
  onSend, onNewChat, onClear, onExport, onOpenSettings,
  onToggleVoiceOut, onSpeakLast, onBack, voiceLang, onListeningChange,
  thinkingLabel = 'Priya is thinking…'
}) {
  const chatEndRef = React.useRef(null);
  const bodyRef = React.useRef(null);
  const [paused, setPaused] = React.useState(false);

  React.useEffect(() => {
    chatEndRef.current && chatEndRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, typing]);

  const togglePause = () => {
    if (isPaused()) { resumeSpeaking(); setPaused(false); }
    else { pauseSpeaking(); setPaused(true); }
  };

  const lastUserLang = React.useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'user') return messages[i].lang;
    }
    return null;
  }, [messages]);

  return (
    <div className="chat-view">
      <div className="chat-bg" aria-hidden="true">
        <div className="bg-orb bg-orb-1" />
        <div className="bg-orb bg-orb-2" />
        <div className="bg-grid" />
      </div>

      <main className="chat-panel3d">
        <header className="chat-header">
          <div className="header-left">
            <PriyaOrb size="sm" state={orbState} />
            <div className="header-title">
              <h2>Priya</h2>
              <div className="status-line">
                <span className={`status-dot ${status.state === 'off' ? 'off' : ''}`} />
                <span>{status.label}{backend && backend.ok && !backend.configured ? ' — set GEMINI_API_KEY' : ''}</span>
              </div>
            </div>
          </div>

          <div className="header-actions">
            <span className={`web-indicator ${settings.webSearch ? 'on' : ''}`} title="Web search mode">
              <svg viewBox="0 0 24 24" className="ic"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm7.93 9h-3.02a15.6 15.6 0 0 0-1.35-4.75A8.03 8.03 0 0 1 19.93 11zM12 4c.83 1.2 1.74 3.23 1.96 5H10.04C10.26 7.23 11.17 5.2 12 4zM4.07 13a8.1 8.1 0 0 1 0-2h3.02c-.03.66-.05 1.32-.05 2s.02 1.34.05 2H4.07zm.56 2h3.02c.32 1.7 1.35 3.65 1.35 4.75A8.04 8.04 0 0 1 4.63 15zM12 20c-.83-1.2-1.74-3.23-1.96-5h3.92c-.22 1.77-1.13 3.8-1.96 5zm2.98-5H9.02c-.04-.66-.07-1.32-.07-2s.03-1.34.07-2h5.96c.04.66.07 1.32.07 2s-.03 1.34-.07 2zm-.28 4.75c.83-1.1 1.35-3.05 1.35-4.75h3.02a8.04 8.04 0 0 1-4.37 4.75zM14.94 6.25c-.5 1.1-.87 2.65-1.04 3.75h-3.8c-.17-1.1-.54-2.65-1.04-3.75A8.04 8.04 0 0 1 14.94 6.25z" /></svg>
              Web: {settings.webSearch ? 'On' : 'Off'}
            </span>
            <button className="icon-btn" onClick={onBack} title="Back to home" type="button">
              <svg viewBox="0 0 24 24" className="ic"><path d="M20 11H7.8l5.6-5.6L12 4l-8 8 8 8 1.4-1.4L7.8 13H20v-2z" /></svg>
            </button>
            <button className="icon-btn" onClick={onNewChat} title="New conversation" type="button">
              <svg viewBox="0 0 24 24" className="ic"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z" /></svg>
            </button>
            <button className={`icon-btn ${settings.voiceOut ? 'active' : ''}`} onClick={onToggleVoiceOut} title="Voice replies: on/off" type="button">
              <svg viewBox="0 0 24 24" className="ic"><path d="M12 14a3 3 0 0 0 3-3V5a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V21h2v-3.08A7 7 0 0 0 19 11h-2z" /></svg>
            </button>
            <button className={`icon-btn ${paused ? 'active' : ''}`} onClick={togglePause} title={paused ? 'Resume' : 'Pause'} type="button">
              {paused ? (
                <svg viewBox="0 0 24 24" className="ic"><path d="M8 5v14l11-7z" /></svg>
              ) : (
                <svg viewBox="0 0 24 24" className="ic"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" /></svg>
              )}
            </button>
            <button className="icon-btn" onClick={stopSpeaking} title="Stop speaking" type="button">
              <svg viewBox="0 0 24 24" className="ic"><path d="M6 6h12v12H6z" /></svg>
            </button>
            <button className="icon-btn" onClick={onSpeakLast} title="Play / stop last reply" type="button">
              <svg viewBox="0 0 24 24" className="ic"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3a4.5 4.5 0 0 0-2.5-4.03v8.05A4.5 4.5 0 0 0 16.5 12zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z" /></svg>
            </button>
            <button className="icon-btn" onClick={onExport} title="Export chat as markdown" type="button">
              <svg viewBox="0 0 24 24" className="ic"><path d="M19 19H5V5h7V3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2v-7h-2v7zM14 3v2h3.6l-9.8 9.8 1.4 1.4L19 6.4V10h2V3h-7z" /></svg>
            </button>
            <button className="icon-btn" onClick={onClear} title="Clear conversation" type="button">
              <svg viewBox="0 0 24 24" className="ic"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z" /></svg>
            </button>
            <button className="icon-btn" onClick={onOpenSettings} title="Settings" type="button">
              <svg viewBox="0 0 24 24" className="ic"><path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58a.49.49 0 0 0 .12-.61l-1.92-3.32a.49.49 0 0 0-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.49.49 0 0 0-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96a.49.49 0 0 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58a.49.49 0 0 0-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6A3.6 3.6 0 1 1 12 8.4a3.6 3.6 0 0 1 0 7.2z" /></svg>
            </button>
          </div>
        </header>

        <div className="chat-body" ref={bodyRef}>
          {messages.length === 0 && (
            <div className="welcome">
              <PriyaOrb size="md" state={orbState} className="welcome-orb" />
              <h2>Namaste! I'm <span className="grad-text">Priya</span></h2>
              <p className="welcome-sub">
                Aapki personal AI technology expert — websites, coding, hosting, AI tools, troubleshooting.
                Hindi, English aur Hinglish sab samajhti hoon.
              </p>
              <div className="chips">
                {SUGGESTIONS.map((s) => (
                  <button key={s.q} type="button" className="suggest" onClick={() => onSend(s.q)}>
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((m, i) => (
            <Message key={i} msg={m} speed={settings.speed} voice={settings.voice} />
          ))}

          {typing && (
            <div className="msg priya thinking">
              <PriyaOrb size="sm" state="thinking" />
              <div className="msg-bubble priya-bubble thinking-bubble">
                <span className="tb-label">{thinkingLabel}</span>
                <span className="dots"><i /><i /><i /></span>
              </div>
            </div>
          )}
          <div ref={chatEndRef} />
        </div>

        <Composer
          onSend={onSend}
          disabled={typing}
          voiceLang={voiceLang}
          conversationLang={lastUserLang}
          onListeningChange={onListeningChange}
        />
      </main>
    </div>
  );
}