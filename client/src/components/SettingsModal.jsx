import React from 'react';

const MODELS = ['gemini-3.6-flash', 'gemini-3.5-flash', 'gemini-3.5-flash-lite', 'gemini-2.5-flash'];

export default function SettingsModal({ open, settings, onChange, onClose }) {
  if (!open) return null;

  const set = (patch) => onChange({ ...settings, ...patch });

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
          </div>

          <div className="field">
            <div className="toggle-row">
              <div>
                <strong>Voice replies</strong>
                <p className="field-hint">Priya bolkar jawab de (text-to-speech).</p>
              </div>
              <label className="switch">
                <input type="checkbox" checked={settings.voiceOut} onChange={(e) => set({ voiceOut: e.target.checked })} />
                <span className="slider" />
              </label>
            </div>
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
