'use client';

import React from 'react';

// An original faceted "gem/shield" badge — evokes the cut-gem rank-icon language used
// across competitive shooters generally (not a trace of any one game's specific asset),
// colored per Premier band with a metallic gradient and glow, so a promotion actually
// reads as "you got a shinier badge," not just a different colored dot.
export function RankBadge({ color, size = 96 }: { color: string; size?: number }) {
  const uid = React.useId().replace(/[^a-zA-Z0-9]/g, '');
  const gradId = `rb-grad-${uid}`;
  const glossId = `rb-gloss-${uid}`;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 110"
      style={{ filter: `drop-shadow(0 0 ${size * 0.18}px ${color}aa)` }}
    >
      <defs>
        <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor={color} stopOpacity="1" />
          <stop offset="55%" stopColor={color} stopOpacity="0.72" />
          <stop offset="100%" stopColor="#05070a" stopOpacity="0.92" />
        </linearGradient>
        <linearGradient id={glossId} x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.5" />
          <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* Outer faceted shield outline */}
      <polygon
        points="50,4 88,24 88,66 50,106 12,66 12,24"
        fill={`url(#${gradId})`}
        stroke={color}
        strokeWidth="2"
        strokeLinejoin="round"
      />
      {/* Top gloss facet */}
      <polygon points="50,4 88,24 50,52 12,24" fill={`url(#${glossId})`} opacity="0.65" />
      {/* Internal cut lines for the gem-facet look */}
      <polyline points="12,24 50,52 88,24" stroke="#05070a" strokeWidth="1" opacity="0.35" fill="none" />
      <polyline points="12,66 50,52 88,66" stroke="#05070a" strokeWidth="1" opacity="0.35" fill="none" />
      <line x1="50" y1="4" x2="50" y2="106" stroke="#05070a" strokeWidth="1" opacity="0.2" />
    </svg>
  );
}
