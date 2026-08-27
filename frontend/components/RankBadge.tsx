'use client';

import React from 'react';

// Real CS2 Premier rank badge geometry — path data is the exact d= coordinates from
// github.com/Juknum/counter-strike-icons's premier_rating_bg.svg (auto-updates from CS2's
// own live game files), confirmed live 2026-08-27 against a real user screenshot and a
// real gameplay recording. See CS2_ANALYTICS_STANDARDS.md's "Premier rank badge" section
// for the full verification record (what was directly confirmed vs. derived) before
// changing anything here — rank display gets extra research rigor on this project.
const VIEWBOX_WIDTH = 178;
const VIEWBOX_HEIGHT = 64;

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
  rimLight: string;
  rimDark: string;
  bar: string;
  barShadow: string;
  text: string;
  textShadow: string;
}

// Every band's tones are derived from its one base hex via the same formula — a bright,
// fairly saturated fill (confirmed against a real Gold screenshot: NOT the near-black
// gradient this component used before this pass) and light-tinted bars/text matching the
// band's own hue (confirmed against a real Light Blue gameplay recording: NOT pure white).
// Only Gold and Light Blue were directly verified against real sources; the other 5 bands
// + Unranked apply the same confirmed principle uniformly rather than being independently
// hand-picked per band. If a future session gets a real screenshot of another band and
// finds the derived version off, that's the thing to fix — see CS2_ANALYTICS_STANDARDS.md.
function bandTones(hex: string): Tones {
  return {
    // Fill brightness lowered from the original 0.35/0.35 (user feedback, 2026-08-27: the
    // rank number was hard to read against the deployed badge) — widens the gap against
    // the text tone below (still 0.6 toward white) instead of touching the text itself.
    fillTop: mix(hex, '#ffffff', 0.2),
    fillBottom: mix(hex, '#000000', 0.45),
    rimLight: mix(hex, '#ffffff', 0.75),
    rimDark: mix(hex, '#000000', 0.55),
    bar: mix(hex, '#ffffff', 0.55),
    barShadow: mix(hex, '#000000', 0.35),
    text: mix(hex, '#ffffff', 0.6),
    textShadow: mix(hex, '#000000', 0.6),
  };
}

const UNRANKED_COLOR = '#9ca3af';

export function RankBadge({ color, rankNew, size = 92 }: { color: string; rankNew: number | null; size?: number }) {
  const uid = React.useId().replace(/[^a-zA-Z0-9]/g, '');
  const boxGradId = `rb-box-${uid}`;
  const rimGradId = `rb-rim-${uid}`;
  const barGradId = `rb-bar-${uid}`;
  const barGradId2 = `rb-bar2-${uid}`;

  const isUnranked = rankNew === null || rankNew === undefined;
  const bandColor = isUnranked ? UNRANKED_COLOR : color;
  const tones = bandTones(bandColor);

  const width = (size * VIEWBOX_WIDTH) / VIEWBOX_HEIGHT;

  // Splits "18,420" into "18" (rendered larger) and ",420" (smaller) — confirmed via real
  // footage that the leading digits genuinely render bigger, though the exact ratio below
  // is a deliberate stylization on top of that (the real footage showed a subtler jump;
  // this was intentionally pushed further per direct feedback after seeing the subtle
  // version). No comma (e.g. a sub-1,000 rank, or the unranked "—") means the whole string
  // is just the "big" part, which renders correctly with no special-casing needed.
  const formatted = isUnranked ? '—' : rankNew!.toLocaleString();
  const commaIndex = formatted.indexOf(',');
  const bigPart = commaIndex === -1 ? formatted : formatted.slice(0, commaIndex);
  const restPart = commaIndex === -1 ? '' : formatted.slice(commaIndex);

  return (
    <svg width={width} height={size} viewBox="0 0 178 64" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id={boxGradId} x1="187.49" y1="48.7288" x2="30.4973" y2="20.5012" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor={tones.fillTop} />
          <stop offset="0.55" stopColor={bandColor} />
          <stop offset="1" stopColor={tones.fillBottom} />
        </linearGradient>
        <linearGradient id={rimGradId} x1="185.411" y1="47.9446" x2="26.5628" y2="33.7951" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor={tones.rimLight} stopOpacity="0.55" />
          <stop offset="1" stopColor={tones.rimDark} />
        </linearGradient>
        <linearGradient id={barGradId} x1="23.4998" y1="1" x2="23.4998" y2="63" gradientUnits="userSpaceOnUse">
          <stop stopColor={tones.rimLight} />
          <stop offset="1" stopColor={tones.bar} />
        </linearGradient>
        <linearGradient id={barGradId2} x1="10.4998" y1="1" x2="10.4998" y2="63" gradientUnits="userSpaceOnUse">
          <stop stopColor={tones.rimLight} />
          <stop offset="1" stopColor={tones.bar} />
        </linearGradient>
      </defs>

      {/* Every path below is the literal d= from Juknum/counter-strike-icons'
          premier_rating_bg.svg — only fill colors and the text differ from the raw asset.
          3 left bars (a dark shadow bar between two bright ones) and 2 diagonal glare
          streaks across the main face — both confirmed against real footage; the previous
          version of this component had 2 bars and no glare at all. */}
      <path d="M25 0H21L9 64H13L25 0Z" fill={tones.barShadow} />
      <path d="M178 0H33.9996L22 64H166L178 0Z" fill={`url(#${boxGradId})`} />
      <path d="M176.25 1.5H33.24L21.6562 62.5H164.666L176.25 1.5Z" fill={`url(#${rimGradId})`} />
      <path opacity="0.35" d="M46.1141 4L54 4L40.8859 61H33L46.1141 4Z" fill="#ffffff" />
      <path d="M36.7301 4L42 4L30.2699 61H25L36.7301 4Z" fill={tones.barShadow} />
      <path opacity="0.35" d="M56.8737 4L72 4L59.1263 61H44L56.8737 4Z" fill="#ffffff" />
      <path opacity="0.22" d="M75.7813 4L110 4L97.2187 61H63L75.7813 4Z" fill="#ffffff" />
      <path d="M18 0H27L18 64H3.25L18 0Z" fill={tones.barShadow} />
      <path d="M12 0H21L9 64H0L12 0Z" fill={tones.rimLight} />
      <path d="M24.9997 0H33.9997L22 64H13L24.9997 0Z" fill={tones.rimLight} />
      <path d="M25 0H33L21 64H13L25 0Z" fill={`url(#${barGradId})`} />
      <path d="M12 0H20L8 64H0L12 0Z" fill={`url(#${barGradId2})`} />

      {/* Embossed look: a dark, semi-transparent copy of the text offset down-right, then
          the real light text on top — confirmed real vs. this component's previous flat
          solid-color text. x/y values here were measured against real rendered pixels
          (not eyeballed) to correct a real off-center bug found during review. */}
      <text
        x="107" y="31"
        textAnchor="middle" dominantBaseline="central"
        fontFamily="var(--font-display), ui-sans-serif, system-ui, sans-serif"
        fontWeight="800" letterSpacing="-1.5"
        fill={tones.textShadow} opacity="0.5"
      >
        <tspan fontSize="42">{bigPart}</tspan><tspan fontSize="32">{restPart}</tspan>
      </text>
      <text
        x="106" y="29"
        textAnchor="middle" dominantBaseline="central"
        fontFamily="var(--font-display), ui-sans-serif, system-ui, sans-serif"
        fontWeight="800" letterSpacing="-1.5"
        fill={tones.text}
      >
        <tspan fontSize="42">{bigPart}</tspan><tspan fontSize="32">{restPart}</tspan>
      </text>
    </svg>
  );
}
