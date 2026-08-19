import React from 'react';

/**
 * Priya's AI energy orb — pure CSS/SVG, no heavy 3D libraries.
 * States: idle | listening | thinking | speaking | error
 * Sizes:  sm | md | lg
 */
export default function PriyaOrb({ state = 'idle', size = 'md', className = '' }) {
  return (
    <div className={`orb orb-${size} orb-state-${state} ${className}`} role="img" aria-label={`Priya AI orb — ${state}`}>
      <div className="orb-halo" aria-hidden="true" />
      <div className="orb-glow" aria-hidden="true" />
      <div className="orb-core" aria-hidden="true">
        <svg viewBox="0 0 100 100" className="orb-svg">
          <defs>
            <radialGradient id="orbBody" cx="0.35" cy="0.3" r="0.9">
              <stop offset="0%" stopColor="#f3f7fa" stopOpacity="0.95" />
              <stop offset="22%" stopColor="#aef3fa" stopOpacity="0.9" />
              <stop offset="55%" stopColor="#35d6e8" stopOpacity="0.85" />
              <stop offset="100%" stopColor="#0e7c8c" stopOpacity="0.95" />
            </radialGradient>
            <radialGradient id="orbBodyLt" cx="0.35" cy="0.3" r="0.9">
              <stop offset="0%" stopColor="#ffffff" stopOpacity="0.95" />
              <stop offset="22%" stopColor="#d9f6fb" stopOpacity="0.9" />
              <stop offset="55%" stopColor="#2fb3c8" stopOpacity="0.85" />
              <stop offset="100%" stopColor="#0c6a79" stopOpacity="0.95" />
            </radialGradient>
            <linearGradient id="orbAmber" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#f2d9a6" />
              <stop offset="100%" stopColor="#d6a85f" />
            </linearGradient>
          </defs>
          <circle cx="50" cy="50" r="46" fill="url(#orbBody)" className="orb-sphere" />
          <ellipse cx="36" cy="32" rx="20" ry="12" fill="#ffffff" opacity="0.4" className="orb-shine" />
          <circle cx="78" cy="68" r="8" fill="url(#orbAmber)" opacity="0.85" className="orb-ember" />
          <circle cx="26" cy="74" r="4" fill="#f2d9a6" opacity="0.7" className="orb-ember ember-2" />
        </svg>
      </div>
      <div className="orb-ring ring-1" aria-hidden="true" />
      <div className="orb-ring ring-2" aria-hidden="true" />
      <div className="orb-particles" aria-hidden="true">
        <i /><i /><i /><i /><i /><i />
      </div>
      <div className="orb-wave" aria-hidden="true">
        <i /><i /><i /><i /><i />
      </div>
    </div>
  );
}