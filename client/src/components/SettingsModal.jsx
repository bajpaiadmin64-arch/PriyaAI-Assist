import React from 'react';

const MODELS = ['gemini-3.6-flash', 'gemini-3.5-flash', 'gemini-3.5-flash-lite', 'gemini-2.5-flash'];

export default function SettingsModal({ open, settings, onChange, onClose }) {
  const [voicesInfo, setVoicesInfo] = React.useState(null);

  React.useEffect(() => {
    if (!open) return;
    let alive = true;
    (async () => {
      try {
        const res = await fetch('/api/tts/voices');
        if (!res.ok) throw new Error('no voices');
        const data = await res.json();
        if (alive) setVoicesInfo(data);
      } catch (e) {
        if (alive) setVoicesInfo(null);
      }
    })();
    return () => { alive = false; };
  }, [open]);

  if (!open) return null;

  const set = (patch) => onChange({ ...settings, ...patch });

  const sarvamOn = !!(voicesInfo && voicesInfo.providers && voicesInfo.providers.sarvam && voicesInfo.providers.sarvam.configured);
  const elevenOn = !!(voicesInfo && voicesInfo.providers && voicesInfo.providers.elevenlabs && voicesInfo.providers.elevenlabs.configured);
  const voices = (voicesInfo && voicesInfo.voices) || [];

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-head">
          <h3>Settings</h3>
          <button className="icon-btn" onClick={onClose} title="Close" type="button">
            <svg viewBox="0 0 24 24" className="ic"><path d="M19 6.41 17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" /></svg>
          </button>
        </div>

        <div className="modal-body">
          <div className="field">
            <label htmlFor="model">Gemini model</label>
            <input id="model" type="text" value={settings.model} onChange={(e) => set({ model: e.target.value })} />
            <div className="model-presets">
              {MODELS.map((m) => (
                <button
                  key={m}
                  type="button"
                  className={`model-chip ${settings.model === m ? 'active' : ''}`}
                  onClick={() => set({ model: m })}
                >
                  {m}
                </button>
              ))}
            </div>
            <p className="field-hint">Default: current free-tier Flash model. The server falls back to the default if this is empty.</p>
          </div>

          <div className="field">
            <label htmlFor="temp">Creativity <span className="temp-val">{settings.temp}</span></label>
            <input id="temp" type="range" min="0" max="1" step="0.05" value={settings.temp}
              onChange={(e) => set({ temp: parseFloat(e.target.value) })} />
          </div>

          {/* ------- Voice ------- */}
          <div className="field voice-field">
            <label>Voice — speed</label>
            <div className="segmented">
              {[
                { v: 'slow', label: '🐢 Slow' },
                { v: 'normal', label: '▶️ Normal' },
                { v: 'fast', label: '🚀 Fast' }
              ].map((o) => (
                <button key={o.v} type="button"
                  className={`seg-btn ${settings.speed === o.v ? 'active' : ''}`}
                  onClick={() => set({ speed: o.v })}>
                  {o.label}
                </button>
              ))}
            </div>
            <p className="field-hint">Priya ki speaking speed (voice input aur replies dono pe lagta hai).</p>
          </div>

          <div className="field">
            <label htmlFor="voice-select">Voice</label>
            <select id="voice-select" className="voice-select" value={settings.voice}
              onChange={(e) => set({ voice: e.target.value })}>
              {voices.length ? (
                voices.map((v) => (
                  <option key={v.id} value={v.id}>{v.name} — {v.note}</option>
                ))
              ) : (
                <option value={settings.voice}>Priya (default)</option>
              )}
            </select>
            <p className="field-hint">
              {sarvamOn
                ? 'Sarvam AI natural Indian voices — priya is the best-quality female voice.'
                : 'Set SARVAM_API_KEY on the server to unlock premium natural Indian voices. Until then the browser voice is used.'}
            </p>
          </div>

          <div className="field">
            <div className="toggle-row">
              <div>
                <strong>Auto speak</strong>
                <p className="field-hint">Har jawab automatically bole. Band karne par sirf speaker button se bolegi.</p>
              </div>
              <label className="switch">
                <input type="checkbox" checked={settings.autoSpeak} onChange={(e) => set({ autoSpeak: e.target.checked })} />
                <span className="slider" />
              </label>
            </div>
          </div>

          <div className="field">
            <div className="toggle-row">
              <div>
                <strong>Voice replies</strong>
                <p className="field-hint">Priya bolkar jawab de (mute/unmute).</p>
              </div>
              <label className="switch">
                <input type="checkbox" checked={settings.voiceOut} onChange={(e) => set({ voiceOut: e.target.checked })} />
                <span className="slider" />
              </label>
            </div>
          </div>

          <div className="voice-status">
            <span className={`vs-dot ${sarvamOn ? 'on' : ''}`} />
            Sarvam AI (native Hindi) {sarvamOn ? 'connected' : 'not configured'}
            <br />
            <span className={`vs-dot ${elevenOn ? 'on' : ''}`} />
            ElevenLabs (fallback) {elevenOn ? 'connected' : 'not configured'}
          </div>

          <div className="field">
            <label>Voice input language</label>
            <div className="segmented">
              {[
                { v: 'auto', label: 'Auto' },
                { v: 'hi-IN', label: 'हिन्दी' },
                { v: 'en-IN', label: 'English' }
              ].map((o) => (
                <button key={o.v} type="button"
                  className={`seg-btn ${settings.voiceLang === o.v ? 'active' : ''}`}
                  onClick={() => set({ voiceLang: o.v })}>
                  {o.label}
                </button>
              ))}
            </div>
            <p className="field-hint">Auto = conversation ki bhasha ke hisaab se (Hindi → hi-IN, English → en-IN).</p>
          </div>

          <div className="field">
            <div className="toggle-row">
              <div>
                <strong>Auto web search</strong>
                <p className="field-hint">Latest/current questions pe live web search kare.</p>
              </div>
              <label className="switch">
                <input type="checkbox" checked={settings.webSearch} onChange={(e) => set({ webSearch: e.target.checked })} />
                <span className="slider" />
              </label>
            </div>
          </div>
        </div>

        <div className="modal-foot">
          <button className="btn primary" onClick={onClose} type="button">Done</button>
        </div>
      </div>
    </div>
  );
}