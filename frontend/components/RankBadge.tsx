'use client';

import React from 'react';

// Real CS2 Premier rank badge geometry, reverse-engineered from Valve's own game files
// (github.com/ItzArty/csgo-rank-icons, premier/premier_rating_bg.svg) — a plain slanted
// parallelogram with two accent bars to its left, NOT an arbitrary design. See the base
// viewBox below: main box top edge x:34-178, bottom edge x:22-166 (same 144px width,
// shifted 12px left going down), no chamfers/curves/points.
const VIEWBOX_WIDTH = 190;
const VIEWBOX_HEIGHT = 76;

function clamp255(n: number): number {
  return Math.max(0, Math.min(255, Math.round(n)));
}

function mix(hex: string, targetHex: string, amount: number): string {
  const a = hexToRgb(hex);
  const b = hexToRgb(targetHex);
  const r = clamp255(a.r + (b.r - a.r) * amount);
  const g = clamp255(a.g + (b.g - a.g) * amount);
  const bl = clamp255(a.b + (b.b - a.b) * amount);
  return `#${[r, g, bl].map((n) => n.toString(16).padStart(2, '0')).join('')}`;
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const clean = hex.replace('#', '');
  const full = clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean;
  const int = parseInt(full, 16);
  return { r: (int >> 16) & 255, g: (int >> 8) & 255, b: int & 255 };
}

interface Tones {
  fillTop: string;
  fillBottom: string;
  strokeLight: string;
  strokeDark: string;
  bar: string;
}

// Hand-tuned per-band tones (not a generic formula) — pulled straight from the approved design
// reference (all 7 CS Rating bands + unranked grey), because auto-mixing a single gradient
// formula off of each band's base color didn't hold up visually for every hue (cooler colors
// like Light Blue came out muddy/grey instead of reading as blue). Keyed by the exact hex each
// band uses in lib/rank.ts's RANK_BANDS.
const TONE_MAP: Record<string, Tones> = {
  '#d1d5db': { fillTop: '#3f4551', fillBottom: '#16181d', strokeLight: '#f1f2f5', strokeDark: '#9ca3af', bar: '#e5e7eb' }, // Grey
  '#7dd3fc': { fillTop: '#0c3a4d', fillBottom: '#061620', strokeLight: '#c7ecfd', strokeDark: '#0ea5e9', bar: '#bae6fd' }, // Light Blue
  '#818cf8': { fillTop: '#2a2470', fillBottom: '#10102e', strokeLight: '#e0e7ff', strokeDark: '#4f46e5', bar: '#c7d2fe' }, // Blue
  '#a855f7': { fillTop: '#3a1f66', fillBottom: '#150b2a', strokeLight: '#f3e8ff', strokeDark: '#7e22ce', bar: '#d8b4fe' }, // Purple
  '#d946ef': { fillTop: '#4a1152', fillBottom: '#1c0620', strokeLight: '#fae8ff', strokeDark: '#a21caf', bar: '#f5d0fe' }, // Pink
  '#ef4444': { fillTop: '#4a1010', fillBottom: '#1c0505', strokeLight: '#fee2e2', strokeDark: '#b91c1c', bar: '#fecaca' }, // Red
  '#eab308': { fillTop: '#453000', fillBottom: '#1c1200', strokeLight: '#fef9c3', strokeDark: '#a16207', bar: '#fef08a' }, // Gold
  '#9ca3af': { fillTop: '#3f4551', fillBottom: '#16181d', strokeLight: '#f1f2f5', strokeDark: '#6b7280', bar: '#e5e7eb' }, // Unranked
};

// Fallback for a color outside the 7 real bands (shouldn't normally happen) — approximates the
// same look via mixing instead of leaving the badge uncolored.
function derivedTones(hex: string): Tones {
  return {
    fillTop: mix(hex, '#000000', 0.65),
    fillBottom: mix(hex, '#000000', 0.9),
    strokeLight: mix(hex, '#ffffff', 0.85),
    strokeDark: mix(hex, '#000000', 0.25),
    bar: mix(hex, '#ffffff', 0.55),
  };
}

const UNRANKED_COLOR = '#9ca3af';

export function RankBadge({ color, rankNew, size = 92 }: { color: string; rankNew: number | null; size?: number }) {
  const uid = React.useId().replace(/[^a-zA-Z0-9]/g, '');
  const boxGradId = `rb-box-${uid}`;
  const strokeGradId = `rb-stroke-${uid}`;

  const isUnranked = rankNew === null || rankNew === undefined;
  const bandColor = isUnranked ? UNRANKED_COLOR : color;
  const tones = TONE_MAP[bandColor] ?? derivedTones(bandColor);

  const width = (size * VIEWBOX_WIDTH) / VIEWBOX_HEIGHT;

  return (
    <svg width={width} height={size} viewBox="-6 -6 190 76" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id={boxGradId} x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor={tones.fillTop} />
          <stop offset="100%" stopColor={tones.fillBottom} />
        </linearGradient>
        <linearGradient id={strokeGradId} x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor={tones.strokeLight} />
          <stop offset="50%" stopColor={bandColor} />
          <stop offset="100%" stopColor={tones.strokeDark} />
        </linearGradient>
      </defs>

      {/* Contact-shadow sliver between the second bar and the box */}
      <polygon points="25,0 21,0 9,64 13,64" fill="#000000" opacity="0.35" />

      {/* Accent bars */}
      <polygon points="12,0 20,0 8,64 0,64" fill={tones.bar} />
      <polygon points="25,0 33,0 21,64 13,64" fill={tones.bar} />

      {/* Main body */}
      <polygon
        points="178,0 34,0 22,64 166,64"
        fill={`url(#${boxGradId})`}
        stroke={`url(#${strokeGradId})`}
        strokeWidth="2"
        strokeLinejoin="miter"
      />
      {/* Inner trim */}
      <polygon
        points="172,4 40,4 27,60 160,60"
        fill="none"
        stroke={tones.strokeLight}
        strokeOpacity="0.3"
        strokeWidth="1"
        strokeLinejoin="miter"
      />

      {/* y=32 is the box's true vertical center (it spans 0-64); dominantBaseline="central" centers
          on the em-box rather than the font's "middle" metric, which for numerals (no descenders)
          reads as noticeably low — this is what made the number look bottom-heavy before. */}
      <text
        x="100"
        y="32"
        textAnchor="middle"
        dominantBaseline="central"
        fontFamily="var(--font-display), ui-sans-serif, system-ui, sans-serif"
        fontWeight="700"
        fontSize="42"
        letterSpacing="-1.5"
        fill={bandColor}
      >
        {isUnranked ? '—' : rankNew!.toLocaleString()}
      </text>
    </svg>
  );
}
