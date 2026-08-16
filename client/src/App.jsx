import React from 'react';
import Navbar from './components/Navbar.jsx';
import Landing from './components/Landing.jsx';
import ChatPanel from './components/ChatPanel.jsx';
import SettingsModal from './components/SettingsModal.jsx';
import { toast } from './components/Message.jsx';
import { fetchHealth, sendChat } from './api.js';
import { detectLang } from './lang.js';
import { speak, stopSpeaking, isSpeaking } from './voice.js';

const DEFAULT_SETTINGS = {
  model: 'gemini-3.6-flash',
  temp: 0.7,
  voiceLang: 'auto',
  voiceOut: true,
  autoSpeak: true,
  speed: 'normal',
  voice: 'priya',
  webSearch: true,
  theme: 'auto',
  mode: 'balanced'
};

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
  const [view, setView] = React.useState('landing'); // 'landing' | 'chat'
  const [micListening, setMicListening] = React.useState(false);
  const [speakingNow, setSpeakingNow] = React.useState(false);
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

  // orb speaking state polling
  React.useEffect(() => {
    const t = setInterval(() => setSpeakingNow(isSpeaking()), 600);
    return () => clearInterval(t);
  }, []);

  const themeDark = React.useMemo(() => {
    const resolved =
      settings.theme === 'auto'
        ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
        : settings.theme;
    return resolved === 'dark';
  }, [settings.theme]);

  const orbState = React.useMemo(() => {
    if (micListening) return 'listening';
    if (typing) return 'thinking';
    if (speakingNow) return 'speaking';
    if (!backend || !backend.ok || status.state === 'off') return 'error';
    return 'idle';
  }, [micListening, typing, speakingNow, backend, status]);

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
      if (settings.voiceOut && settings.autoSpeak) {
        speak(res.reply, lang, { speed: settings.speed, voice: settings.voice });
      }
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
    if (lastPriya) speak(lastPriya.content, lastPriya.lang, { speed: settings.speed, voice: settings.voice });
  };

  const startChat = () => {
    setView('chat');
    window.scrollTo({ top: 0 });
  };

  const goHome = () => {
    setView('landing');
    window.scrollTo({ top: 0 });
  };

  const onNav = (target) => {
    if (target === 'chat') { startChat(); return; }
    setView('landing');
    if (target === 'home') { window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
    setTimeout(() => {
      const el = document.getElementById(target);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 60);
  };

  const statusLabel =
    (status.label || '') + (backend && backend.ok && !backend.configured ? ' — set GEMINI_API_KEY' : '');

  return (
    <div className="app">
      <Navbar
        onNav={onNav}
        onStartChat={startChat}
        themeDark={themeDark}
        onToggleTheme={toggleTheme}
        statusLabel={statusLabel}
      />

      {view === 'landing' ? (
        <Landing onStartChat={startChat} statusLabel={statusLabel} orbState={orbState} />
      ) : (
        <ChatPanel
          messages={messages}
          typing={typing}
          status={status}
          backend={backend}
          settings={settings}
          orbState={orbState}
          onSend={send}
          onNewChat={newChat}
          onClear={clearChat}
          onExport={exportChat}
          onOpenSettings={() => setSettingsOpen(true)}
          onToggleVoiceOut={toggleVoiceOut}
          onSpeakLast={handleSpeakNow}
          onBack={goHome}
          voiceLang={settings.voiceLang}
          onListeningChange={setMicListening}
        />
      )}

      <SettingsModal
        open={settingsOpen}
        settings={settings}
        onChange={setSettings}
        onClose={() => setSettingsOpen(false)}
      />
    </div>
  );
}