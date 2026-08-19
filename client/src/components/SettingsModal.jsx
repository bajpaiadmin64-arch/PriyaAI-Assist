import React from 'react';
import {
  fetchProviders,
  testProvider,
  saveProviderKey,
  deleteProviderKey,
  selectProvider
} from '../api.js';
import { toast } from './Message.jsx';

const STATUS_DOT = {
  selected: 'on',
  configured: 'on-dim',
  none: ''
};

function maskHint(provider) {
  if (!provider.configured) return '🔒 API key required';
  return `${provider.source === 'env' ? 'env' : 'saved'} · ${provider.maskedKey}`;
}

export default function SettingsModal({ open, settings, onChange, onClose, onProviderChanged }) {
  const [voicesInfo, setVoicesInfo] = React.useState(null);
  const [providersData, setProvidersData] = React.useState(null); // {providers, selected, order}
  const [editing, setEditing] = React.useState(null); // {id, apiKey, model, baseUrl, name, showBaseUrl}
  const [testingId, setTestingId] = React.useState(null);
  const [testResult, setTestResult] = React.useState(null); // {providerId, ok, message}
  const [customOpen, setCustomOpen] = React.useState(false);
  const [custom, setCustom] = React.useState({ name: '', baseUrl: '', model: '', apiKey: '' });
  const [busy, setBusy] = React.useState(false);

  const refresh = React.useCallback(async () => {
    try {
      const data = await fetchProviders();
      setProvidersData(data);
      if (onProviderChanged) onProviderChanged(data);
    } catch (e) {
      setProvidersData(null);
    }
  }, [onProviderChanged]);

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
    refresh();
    return () => { alive = false; };
  }, [open, refresh]);

  if (!open) return null;

  const set = (patch) => onChange({ ...settings, ...patch });

  const sarvamOn = !!(voicesInfo && voicesInfo.providers && voicesInfo.providers.sarvam && voicesInfo.providers.sarvam.configured);
  const elevenOn = !!(voicesInfo && voicesInfo.providers && voicesInfo.providers.elevenlabs && voicesInfo.providers.elevenlabs.configured);
  const voices = (voicesInfo && voicesInfo.voices) || [];

  const startEdit = (p) => {
    setTestResult(null);
    setEditing({
      id: p.id,
      apiKey: '',
      model: p.model || (p.models && p.models[0] ? p.models[0].id : ''),
      baseUrl: p.baseUrl || '',
      name: p.name === 'Custom (OpenAI-compatible)' ? '' : p.name,
      showBaseUrl: p.id === 'custom'
    });
  };

  const runTest = async (p, values) => {
    setTestingId(p.id);
    setTestResult(null);
    try {
      const r = await testProvider({
        providerId: p.id,
        apiKey: values.apiKey || undefined,
        model: values.model || undefined,
        baseUrl: values.baseUrl || undefined,
        name: values.name || undefined
      });
      setTestResult({ providerId: p.id, ok: r.ok, message: r.message + (r.latencyMs ? ` (${r.latencyMs} ms)` : '') });
    } catch (e) {
      setTestResult({ providerId: p.id, ok: false, message: e.message });
    } finally {
      setTestingId(null);
    }
  };

  const saveEdit = async () => {
    if (!editing) return;
    setBusy(true);
    try {
      await saveProviderKey({
        providerId: editing.id,
        apiKey: editing.apiKey,
        model: editing.model,
        baseUrl: editing.showBaseUrl ? editing.baseUrl : undefined,
        name: editing.name
      });
      toast('API key saved');
      setEditing(null);
      await refresh();
    } catch (e) {
      toast(e.message);
    } finally {
      setBusy(false);
    }
  };

  const removeKey = async (p) => {
    if (!window.confirm(`Remove the ${p.name} API key?`)) return;
    try {
      await deleteProviderKey(p.id);
      toast('API key removed');
      await refresh();
    } catch (e) {
      toast(e.message);
    }
  };

  const useModel = async (p) => {
    try {
      const r = await selectProvider(p.id);
      toast(`Now using ${r.label} (${r.model})`);
      await refresh();
    } catch (e) {
      toast(e.message);
    }
  };

  const saveCustom = async () => {
    if (!custom.name.trim() || !custom.baseUrl.trim() || !custom.model.trim()) {
      toast('Provider name, Base URL and Model are required.');
      return;
    }
    setBusy(true);
    try {
      await saveProviderKey({
        providerId: 'custom',
        apiKey: custom.apiKey,
        model: custom.model.trim(),
        baseUrl: custom.baseUrl.trim(),
        name: custom.name.trim()
      });
      toast('Custom provider saved');
      setCustomOpen(false);
      setCustom({ name: '', baseUrl: '', model: '', apiKey: '' });
      await refresh();
    } catch (e) {
      toast(e.message);
    } finally {
      setBusy(false);
    }
  };

  const providers = (providersData && providersData.providers) || [];

  const editingProvider = editing ? providers.find((p) => p.id === editing.id) : null;

  // ---- Provider dashboard helpers ----
  const local = (providersData && providersData.local) || { ollama: false, lmstudio: false };
  const localOn = !!local.ollama || !!local.lmstudio;
  const localNames = [local.ollama && 'Ollama', local.lmstudio && 'LM Studio'].filter(Boolean).join(' + ');
  const TIER_LABEL = { free: 'FREE', nokey: 'NO-KEY', paid: 'PAID' };

  function rowStateText(p) {
    if (p.local && !local[p.id]) return 'local server not detected';
    if (!p.configured) return p.keyRequired ? 'add key' : 'ready';
    if (p.state === 'blocked') return `blocked (${p.reason || p.errorCode || 'hard error'}) — ${p.cooldownSec}s`;
    if (p.state === 'cooldown') return `rate limited — retry in ${p.cooldownSec}s`;
    if (p.selected) return 'active';
    return 'ready';
  }
  function rowStateClass(p) {
    if (p.local && !local[p.id]) return 'warn';
    if (!p.configured) return 'off';
    if (p.state === 'blocked') return 'fail';
    if (p.state === 'cooldown') return 'warn';
    return 'ok';
  }

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
          {/* ------- AI Models & API ------- */}
          <div className="field providers-field">
            <label>AI Models &amp; API</label>
            {providers.length === 0 ? (
              <p className="field-hint">Loading provider list…</p>
            ) : (
              <>
                {providers.map((p) => (
                  <div key={p.id} className={`provider-row ${p.selected ? 'selected' : ''}`}>
                    <span className={`vs-dot ${p.selected ? 'on' : p.configured ? 'on-dim' : ''}`} />
                    <div className="provider-info">
                      <strong>
                        {p.name}{' '}
                        {p.selected ? <span className="badge">active</span> : null}{' '}
                        <span className={`tier-chip tier-${p.tier || 'paid'}`}>{TIER_LABEL[p.tier] || 'CUSTOM'}</span>
                      </strong>
                      <span className="provider-meta">
                        {p.configured
                          ? `${maskHint(p)}${p.model ? ' · ' + p.model : ''}`
                          : p.keyRequired ? '🔒 API key required' : 'no key needed'}
                        {p.freeLabel && p.tier !== 'paid' ? <span className="free-label"> · {p.freeLabel}</span> : ''}
                        {' · '}
                        <span className={`state-chip state-${rowStateClass(p)}`}>{rowStateText(p)}</span>
                      </span>
                    </div>
                    <div className="provider-actions">
                      {p.configured && !p.selected && (
                        <button type="button" className="mini-btn" onClick={() => useModel(p)}>
                          Use Model
                        </button>
                      )}
                      <button type="button" className="mini-btn" onClick={() => startEdit(p)}>
                        {p.configured ? 'Edit Key' : p.keyRequired ? 'Add API Key' : 'Configure'}
                      </button>
                      {p.configured && p.source === 'user' && (
                        <button type="button" className="mini-btn danger" onClick={() => removeKey(p)} title="Delete API key">🗑</button>
                      )}
                    </div>
                  </div>
                ))}

                {/* inline key editor */}
                {editing && editingProvider && (
                  <div className="provider-edit">
                    <strong>Configure {editingProvider.name}</strong>
                    <div className="field">
                      <label>API Key</label>
                      <input
                        type="password"
                        value={editing.apiKey}
                        placeholder={editingProvider.configured ? 'Leave empty to keep the saved key' : 'Paste your API key'}
                        onChange={(e) => setEditing({ ...editing, apiKey: e.target.value })}
                      />
                      <p className="field-hint">Stored on the server only — never shown in full, never sent to the browser.</p>
                    </div>
                    <div className="field">
                      <label>Model</label>
                      {editingProvider.models && editingProvider.models.length ? (
                        <select
                          className="voice-select"
                          value={editing.model || ''}
                          onChange={(e) => setEditing({ ...editing, model: e.target.value })}
                        >
                          {editingProvider.models.map((m) => (
                            <option key={m.id} value={m.id}>{m.name} — {m.id}{m.notes ? ` (${m.notes})` : ''}</option>
                          ))}
                          {!editingProvider.models.some((m) => m.id === editing.model) && editing.model ? (
                            <option value={editing.model}>{editing.model} (custom)</option>
                          ) : null}
                        </select>
                      ) : (
                        <input
                          type="text"
                          value={editing.model}
                          placeholder={editingProvider.id === 'openrouter' ? 'e.g. google/gemini-2.5-flash:free — any model ID works' : 'Model ID'}
                          onChange={(e) => setEditing({ ...editing, model: e.target.value })}
                        />
                      )}
                      {editingProvider.id === 'openrouter' && editingProvider.models && editingProvider.models.length ? (
                        <p className="field-hint">Many models are free (…:free). The full live list appears on the provider&apos;s site with this key.</p>
                      ) : null}
                    </div>
                    {(editingProvider.id === 'custom' || editing.showBaseUrl) && (
                      <div className="field">
                        <label>Base URL</label>
                        <input
                          type="text"
                          value={editing.baseUrl}
                          placeholder="https://your-endpoint.example/v1"
                          onChange={(e) => setEditing({ ...editing, baseUrl: e.target.value })}
                        />
                      </div>
                    )}
                    {editingProvider.id === 'custom' && (
                      <div className="field">
                        <label>Provider name</label>
                        <input
                          type="text"
                          value={editing.name || ''}
                          placeholder="My Custom Provider"
                          onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                        />
                      </div>
                    )}
                    <div className="provider-edit-actions">
                      <button type="button" className="mini-btn" disabled={busy || testingId === editingProvider.id} onClick={() => runTest(editingProvider, editing)}>
                        {testingId === editingProvider.id ? 'Testing…' : 'Test Connection'}
                      </button>
                      <button type="button" className="mini-btn primary" disabled={busy} onClick={saveEdit}>Save</button>
                      <button type="button" className="mini-btn" onClick={() => setEditing(null)}>Cancel</button>
                    </div>
                    {testResult && testResult.providerId === editingProvider.id && (
                      <p className={`test-result ${testResult.ok ? 'ok' : 'fail'}`}>
                        {testResult.ok ? '✓ Connection successful' : '✕ Connection failed'} — {testResult.message}
                      </p>
                    )}
                  </div>
                )}

                {/* custom provider */}
                {!customOpen ? (
                  <button type="button" className="mini-btn wide" onClick={() => setCustomOpen(true)}>+ Add Custom AI Provider</button>
                ) : (
                  <div className="provider-edit">
                    <strong>Add Custom AI Provider (OpenAI-compatible)</strong>
                    <div className="field">
                      <label>Provider name</label>
                      <input type="text" value={custom.name} placeholder="My Provider" onChange={(e) => setCustom({ ...custom, name: e.target.value })} />
                    </div>
                    <div className="field">
                      <label>Base URL</label>
                      <input type="text" value={custom.baseUrl} placeholder="https://example.com/v1" onChange={(e) => setCustom({ ...custom, baseUrl: e.target.value })} />
                    </div>
                    <div className="field">
                      <label>Model name</label>
                      <input type="text" value={custom.model} placeholder="my-model" onChange={(e) => setCustom({ ...custom, model: e.target.value })} />
                    </div>
                    <div className="field">
                      <label>API key</label>
                      <input type="password" value={custom.apiKey} placeholder="Optional for local servers" onChange={(e) => setCustom({ ...custom, apiKey: e.target.value })} />
                    </div>
                    <div className="provider-edit-actions">
                      <button type="button" className="mini-btn" disabled={busy || testingId === 'custom'} onClick={() => runTest({ id: 'custom', name: custom.name || 'Custom' }, custom)}>
                        {testingId === 'custom' ? 'Testing…' : 'Test Connection'}
                      </button>
                      <button type="button" className="mini-btn primary" disabled={busy} onClick={saveCustom}>Save</button>
                      <button type="button" className="mini-btn" onClick={() => setCustomOpen(false)}>Cancel</button>
                    </div>
                    {testResult && testResult.providerId === 'custom' && (
                      <p className={`test-result ${testResult.ok ? 'ok' : 'fail'}`}>
                        {testResult.ok ? '✓ Connection successful' : '✕ Connection failed'} — {testResult.message}
                      </p>
                    )}
                  </div>
                )}

                <p className="field-hint">
                  <strong>Free-first fallback:</strong> the active model is tried first, then free-tier providers
                  (Gemini, Groq, OpenRouter, Mistral), then no-key sources (Pollinations, local Ollama / LM Studio),
                  and finally any paid provider you configured. On a rate limit / outage Priya cools that provider
                  down (60s → 2h for repeats) and automatically switches to the next one. Invalid keys and exhausted
                  quotas are blocked for 12h — saving a key resets this instantly.
                </p>
                <p className="field-hint">
                  Keys you add here are stored on the server (never committed to GitHub, never shown in full).
                  Keys set via environment variables (Render/&nbsp;.env) appear as <code>env</code> and cannot be edited from here.
                </p>
              </>
            )}

            {/* ------- Provider Dashboard ------- */}
            <div className="field dashboard-field">
              <label>Provider Dashboard</label>
              <div className={`local-card ${localOn ? 'on' : ''}`}>
                <span className={`vs-dot ${localOn ? 'on' : ''}`} />
                {localOn ? `● Local AI — Connected (${localNames})` : '○ Local AI — Offline'}
                <span className="field-hint inline">
                  {' '}
                  {localOn
                    ? 'Priya can chat with your local models, free — no internet needed.'
                    : 'Start Ollama or LM Studio on this computer to enable free local AI (Ollama: http://127.0.0.1:11434, LM Studio: http://127.0.0.1:1234).'}
                </span>
              </div>
              {providers.length > 0 && (
                <div className="dashboard-table">
                  <div className="dash-row dash-head">
                    <span>Provider</span>
                    <span>Tier</span>
                    <span>Status</span>
                    <span>Model</span>
                  </div>
                  {providers.map((p) => (
                    <div key={p.id} className="dash-row">
                      <span>{p.name}{p.selected ? ' ⭐' : ''}</span>
                      <span><span className={`tier-chip tier-${p.tier || 'paid'}`}>{TIER_LABEL[p.tier] || 'CUSTOM'}</span></span>
                      <span><span className={`state-chip state-${rowStateClass(p)}`}>{rowStateText(p)}</span>{p.remaining ? ` · ${p.remaining} req left` : ''}</span>
                      <span className="dash-model">{p.model || '—'}</span>
                    </div>
                  ))}
                </div>
              )}
              <p className="field-hint">
                <strong>How Priya routes requests:</strong> FREE (your key, free tier) → NO-KEY (public endpoint / local)
                → PAID (only if you added a key — never auto-spent). One failing provider never breaks the chat.
              </p>
            </div>
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
                <strong>Interrupt mode (barge-in)</strong>
                <p className="field-hint">Priya bol rahi ho toh seedha bolkar roko — "Ruko!" bolte hi woh ruk jaayegi aur sunegi.</p>
              </div>
              <label className="switch">
                <input type="checkbox" checked={settings.bargeIn} onChange={(e) => set({ bargeIn: e.target.checked })} />
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
