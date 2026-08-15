import React from 'react';

const gradientId = 'priyaGrad';

export default function Avatar({ size = 'md', className = '' }) {
  return (
    <div className={`avatar avatar-${size} ${className}`} aria-hidden="true">
      <svg viewBox="0 0 64 64" className="avatar-svg">
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#ff7ab8" />
            <stop offset="1" stopColor="#7c4dff" />
          </linearGradient>
        </defs>
        <circle cx="32" cy="32" r="30" fill={`url(#${gradientId})`} />
        <path
          d="M32 14c-6.9 0-12.5 5.6-12.5 12.5 0 6.4 4.9 11.7 11.2 12.4v4.1h-6.6c-1.2 0-2.2 1-2.2 2.2v2.3c0 1.2 1 2.2 2.2 2.2h8.8c1.2 0 2.2-1 2.2-2.2V26.5c0-6.9-5.6-12.5-12.5-12.5z"
          fill="#fff"
          opacity="0.9"
        />
      </svg>
    </div>
  );
}
