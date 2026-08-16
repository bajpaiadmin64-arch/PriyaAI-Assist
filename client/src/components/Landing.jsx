import React from 'react';
import PriyaOrb from './PriyaOrb.jsx';
import useReveal from '../hooks/useReveal.js';
import useParallax from '../hooks/useParallax.js';

const FLOAT_CARDS = [
  { icon: '💻', label: 'Coding', cls: 'fc-coding' },
  { icon: '🌐', label: 'Web Research', cls: 'fc-research' },
  { icon: '🧠', label: 'AI', cls: 'fc-ai' },
  { icon: '⚡', label: 'Troubleshooting', cls: 'fc-fix' },
  { icon: '🎙️', label: 'Voice', cls: 'fc-voice' },
  { icon: '🔧', label: 'Technology', cls: 'fc-tech' }
];

const FEATURES = [
  { icon: '🧠', title: 'AI Technology Expert', desc: 'Solves coding and technology problems with real, practical solutions.' },
  { icon: '🌐', title: 'Real-Time Research', desc: 'Searches current sources for latest models, pricing and documentation when web access is available.' },
  { icon: '🗣️', title: 'Hindi + English', desc: 'Understands Hindi, English and Hinglish — and replies in the language you use.' },
  { icon: '🎙️', title: 'Voice Assistant', desc: 'Talk to Priya naturally. Speak, and she will answer with her voice too.' },
  { icon: '💻', title: 'Coding Assistant', desc: 'Debugs, explains and improves your code without breaking what works.' },
  { icon: '⚡', title: 'Smart Troubleshooting', desc: 'Problem → Cause → Solution → Steps → Verification. No random guesses.' }
];

const CAPABILITIES = [
  'React', 'JavaScript', 'HTML', 'CSS', 'Node.js', 'Express', 'APIs', 'REST',
  'Git', 'GitHub', 'GitHub Actions', 'Netlify', 'Vercel', 'Render', 'Firebase',
  'Supabase', 'Databases', 'DNS', 'Hosting', 'Deployment', 'VS Code', 'Windows',
  'Gemini', 'OpenAI', 'Claude', 'DeepSeek', 'LLMs', 'Prompt Engineering', 'AI Agents',
  'Automation', 'Excel', 'Google Sheets', 'Data Processing', 'Troubleshooting'
];

export default function Landing({ onStartChat, statusLabel, orbState }) {
  const rootRef = React.useRef(null);
  const heroRef = React.useRef(null);
  useReveal(rootRef);
  useParallax(heroRef);

  return (
    <div className="landing" ref={rootRef}>
      {/* ============ HERO ============ */}
      <section className="hero" id="home">
        <div className="hero-bg" aria-hidden="true">
          <div className="bg-orb bg-orb-1" />
          <div className="bg-orb bg-orb-2" />
          <div className="bg-grid" />
          <div className="bg-particles"><i /><i /><i /><i /><i /><i /><i /><i /></div>
        </div>

        <div className="hero-scene" ref={heroRef}>
          <div className="hero-copy">
            <span className="hero-badge reveal">
              <span className="badge-dot" />
              Your Personal AI Technology Expert
            </span>
            <h1 className="hero-title reveal" style={{ '--d': '0.08s' }}>
              Meet <span className="grad-text">Priya</span>
            </h1>
            <h2 className="hero-subtitle reveal" style={{ '--d': '0.16s' }}>
              Your Personal AI Technology Expert
            </h2>
            <p className="hero-desc reveal" style={{ '--d': '0.24s' }}>
              Solve technology problems, build and debug code, research current information,
              and understand complex tech — in <strong>Hindi</strong>, <strong>English</strong> and <strong>Hinglish</strong>, even by voice.
            </p>
            <div className="hero-actions reveal" style={{ '--d': '0.32s' }}>
              <button className="btn primary hero-cta" type="button" onClick={onStartChat}>
                Start Conversation
              </button>
              <a className="btn ghost hero-cta" href="#features">Explore Features</a>
            </div>
            <div className="hero-trust reveal" style={{ '--d': '0.4s' }}>
              <span>🗣️ Hindi · English · Hinglish</span>
              <span>🎙️ Voice</span>
              <span>🔎 Live Web Search</span>
            </div>
          </div>

          <div className="hero-visual" aria-hidden="true">
            <div className="orb-wrap" data-depth="0.5">
              <PriyaOrb state={orbState} size="lg" />
            </div>

            <div className="float-card fc-coding" data-depth="1.4">
              <div className="float-in"><span className="fc-icon">💻</span><span className="fc-label">Coding</span></div>
            </div>
            <div className="float-card fc-research" data-depth="1.0">
              <div className="float-in"><span className="fc-icon">🌐</span><span className="fc-label">Web Research</span></div>
            </div>
            <div className="float-card fc-ai" data-depth="1.8">
              <div className="float-in"><span className="fc-icon">🧠</span><span className="fc-label">AI</span></div>
            </div>
            <div className="float-card fc-fix" data-depth="0.8">
              <div className="float-in"><span className="fc-icon">⚡</span><span className="fc-label">Troubleshooting</span></div>
            </div>
            <div className="float-card fc-voice" data-depth="1.6">
              <div className="float-in"><span className="fc-icon">🎙️</span><span className="fc-label">Voice</span></div>
            </div>
            <div className="float-card fc-tech" data-depth="1.2">
              <div className="float-in"><span className="fc-icon">🔧</span><span className="fc-label">Technology</span></div>
            </div>
          </div>
        </div>

        <div className="hero-status reveal">
          <span className={`status-dot ${orbState === 'error' ? 'off' : ''}`} />
          {statusLabel}
        </div>
      </section>

      {/* ============ FEATURES ============ */}
      <section className="section features" id="features">
        <div className="section-head reveal">
          <span className="section-eyebrow">Capabilities</span>
          <h2 className="section-title">Built to <span className="grad-text">think like an expert</span></h2>
          <p className="section-desc">Not a generic chatbot — a senior developer and research assistant in your pocket.</p>
        </div>

        <div className="features-grid">
          {FEATURES.map((f, i) => (
            <div key={f.title} className={`feature-card reveal feature-${i + 1}`} style={{ '--d': `${0.05 * i}s` }}>
              <div className="feature-icon">{f.icon}</div>
              <h3>{f.title}</h3>
              <p>{f.desc}</p>
              <span className="feature-glow" aria-hidden="true" />
            </div>
          ))}
        </div>
      </section>

      {/* ============ CAPABILITIES ============ */}
      <section className="section capabilities" id="capabilities">
        <div className="section-head reveal">
          <span className="section-eyebrow">Tech Stack</span>
          <h2 className="section-title">Comfortable with your <span className="grad-text">entire stack</span></h2>
          <p className="section-desc">From a single HTML page to full-stack deployments and AI integrations.</p>
        </div>

        <div className="tech-cloud reveal">
          {CAPABILITIES.map((t, i) => (
            <span key={t} className="tech-chip" style={{ '--i': i }}>
              {t}
            </span>
          ))}
        </div>
      </section>

      {/* ============ ABOUT ============ */}
      <section className="section about" id="about">
        <div className="about-card reveal">
          <PriyaOrb size="md" state="idle" />
          <div className="about-copy">
            <span className="section-eyebrow">About</span>
            <h2 className="section-title">Honest by design.<br /><span className="grad-text">Accurate over agreeable.</span></h2>
            <p className="section-desc">
              Priya never blindly agrees. If you are wrong, she will tell you — clearly and kindly — and explain
              the correct facts. She distinguishes fact from assumption, never fabricates sources, warns you before
              you expose secrets, and always says so when she genuinely doesn't know.
            </p>
            <div className="about-stats">
              <div><strong>2</strong><span>languages + Hinglish</span></div>
              <div><strong>40+</strong><span>technologies</span></div>
              <div><strong>5-step</strong><span>troubleshooting</span></div>
              <div><strong>100%</strong><span>honest</span></div>
            </div>
          </div>
        </div>
      </section>

      {/* ============ CTA ============ */}
      <section className="section cta">
        <div className="cta-card reveal">
          <h2 className="cta-title">Talk to Priya</h2>
          <p className="cta-sub">Your personal AI technology expert is ready.</p>
          <button className="btn primary cta-btn" type="button" onClick={onStartChat}>
            Start Conversation
          </button>
          <div className="cta-orb" aria-hidden="true"><PriyaOrb state="idle" size="md" /></div>
        </div>
      </section>

      <footer className="footer">
        <div className="footer-inner">
          <span className="nav-brand-name">Priya <em>AI</em></span>
          <p>Personal AI technology expert · Hindi · English · Hinglish</p>
          <p className="footer-note">© {new Date().getFullYear()} Priya AI — v2.0</p>
        </div>
      </footer>
    </div>
  );
}