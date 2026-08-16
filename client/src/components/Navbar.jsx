import React from 'react';
import PriyaOrb from './PriyaOrb.jsx';

export default function Navbar({ onNav, onStartChat, themeDark, onToggleTheme, statusLabel }) {
  const [open, setOpen] = React.useState(false);
  const [scrolled, setScrolled] = React.useState(false);

  React.useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const go = (target) => {
    setOpen(false);
    onNav(target);
  };

  return (
    <header className={`navbar ${scrolled ? 'scrolled' : ''}`}>
      <div className="navbar-inner">
        <button className="nav-brand" type="button" onClick={() => go('home')} aria-label="Priya AI home">
          <PriyaOrb size="sm" state="idle" />
          <span className="nav-brand-name">Priya <em>AI</em></span>
          <span className="nav-credit">Designed &amp; developed by Utkarsh Bajpai</span>
        </button>

        <nav className="nav-links" aria-label="Main navigation">
          <button type="button" className="nav-link" onClick={() => go('home')}>Home</button>
          <button type="button" className="nav-link" onClick={() => go('features')}>Features</button>
          <button type="button" className="nav-link" onClick={() => go('capabilities')}>Capabilities</button>
          <button type="button" className="nav-link" onClick={() => go('chat')}>Chat</button>
          <button type="button" className="nav-link" onClick={() => go('about')}>About</button>
        </nav>

        <div className="nav-actions">
          <button className="icon-btn theme-btn" type="button" onClick={onToggleTheme} title="Toggle theme" aria-label="Toggle theme">
            <svg viewBox="0 0 24 24" className="ic" style={{ display: themeDark ? 'none' : '' }}>
              <path d="M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10zm0-4a1 1 0 0 1 1 1v1a1 1 0 0 1-2 0V4a1 1 0 0 1 1-1zM4 11a1 1 0 0 1 1 1 1 1 0 0 1-1 1H3a1 1 0 0 1 0-2h1zm16 0a1 1 0 0 1 1 1 1 1 0 0 1-1 1h-1a1 1 0 0 1 0-2h1zm-4.6-6.4a1 1 0 0 1 1.4 0l.7.7a1 1 0 0 1-1.4 1.4l-.7-.7a1 1 0 0 1 0-1.4zM7.2 17.2a1 1 0 0 1 1.4 0 1 1 0 0 1 0 1.4l-.7.7a1 1 0 0 1-1.4-1.4l.7-.7zm12.1-12.1a1 1 0 0 1 0 1.4l-.7.7a1 1 0 0 1-1.4-1.4l.7-.7a1 1 0 0 1 1.4 0zM7.2 6.8a1 1 0 0 1 0 1.4 1 1 0 0 1-1.4 0l-.7-.7a1 1 0 0 1 1.4-1.4l.7.7z" />
            </svg>
            <svg viewBox="0 0 24 24" className="ic" style={{ display: themeDark ? '' : 'none' }}>
              <path d="M12 3a9 9 0 1 0 9 9c0-.46-.04-.92-.1-1.36a5.4 5.4 0 0 1-6.6 5.7 5.4 5.4 0 0 1-4-6.54A5.4 5.4 0 0 1 12 3z" />
            </svg>
          </button>
          <button className="btn primary nav-cta" type="button" onClick={onStartChat}>
            Talk to Priya
          </button>
          <button className="icon-btn burger" type="button" onClick={() => setOpen((o) => !o)}
            aria-label="Toggle menu" aria-expanded={open}>
            <svg viewBox="0 0 24 24" className="ic"><path d="M3 18h18v-2H3v2zm0-5h18v-2H3v2zm0-7v2h18V6H3z" /></svg>
          </button>
        </div>
      </div>

      {open && (
        <div className="nav-mobile">
          <button type="button" className="nav-link" onClick={() => go('home')}>Home</button>
          <button type="button" className="nav-link" onClick={() => go('features')}>Features</button>
          <button type="button" className="nav-link" onClick={() => go('capabilities')}>Capabilities</button>
          <button type="button" className="nav-link" onClick={() => go('chat')}>Chat</button>
          <button type="button" className="nav-link" onClick={() => go('about')}>About</button>
          <button type="button" className="btn primary" onClick={onStartChat}>Talk to Priya</button>
          <p className="nav-mobile-status">{statusLabel}</p>
        </div>
      )}
    </header>
  );
}