// Shared "duel" color helpers — CT cyan (left) / neutral grey (center) / T amber (right),
// used by every KPI tile and chart across the app so a tile's color always reflects its
// position in its row, not any per-category meaning. Lives outside app/page.tsx so
// InsightsDashboard.tsx (which page.tsx renders) can import it without a circular
// module-eval dependency — these are called at module scope in InsightsDashboard.tsx,
// and a same-file circular import there triggered a temporal-dead-zone crash at build time.
import React from 'react';

const DUEL_CT = { r: 0x22, g: 0xd3, b: 0xee };
const DUEL_GREY = { r: 0x6b, g: 0x72, b: 0x80 };
const DUEL_T = { r: 0xfb, g: 0x92, b: 0x3c };

// t in [0,1]: 0 = pure CT cyan, 0.5 = neutral grey, 1 = pure T amber.
export function duelLerp(t: number): string {
  const lerp = (a: typeof DUEL_CT, b: typeof DUEL_CT, u: number) => ({
    r: Math.round(a.r + (b.r - a.r) * u),
    g: Math.round(a.g + (b.g - a.g) * u),
    b: Math.round(a.b + (b.b - a.b) * u),
  });
  const c = t < 0.5 ? lerp(DUEL_CT, DUEL_GREY, t / 0.5) : lerp(DUEL_GREY, DUEL_T, (t - 0.5) / 0.5);
  return `#${[c.r, c.g, c.b].map((n) => n.toString(16).padStart(2, '0')).join('')}`;
}

// "Duel" position accent — not win/loss or any other meaning, purely where something sits
// left-to-right: leftmost reads CT cyan, dead center reads neutral grey, rightmost reads T
// amber, fading through grey in between.
export function ctTAccent(index: number, total: number): string {
  const t = total > 1 ? index / (total - 1) : 0.5;
  return duelLerp(t);
}

// Hex -> "rgba(r,g,b,a)" — lets a heatmap-style intensity shading (alpha) share the same
// per-column "duel" hue instead of one fixed color for every column.
export function hexToRgba(hex: string, alpha: number): string {
  const clean = hex.replace('#', '');
  const num = parseInt(clean, 16);
  const r = (num >> 16) & 255, g = (num >> 8) & 255, b = num & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// Lightens (positive amt) or darkens (negative amt) a hex color toward white/black —
// used to fake a top/side face on trend-chart bars so they read as extruded 3D blocks.
export function shadeHex(hex: string, amt: number): string {
  const clean = hex.replace('#', '');
  const num = parseInt(clean, 16);
  const target = amt >= 0 ? 255 : 0;
  const mix = (v: number) => Math.round(v + (target - v) * Math.abs(amt));
  const r = mix((num >> 16) & 255), g = mix((num >> 8) & 255), b = mix(num & 255);
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

// Custom Recharts <Bar> shape — draws a lit top face + shaded side face behind the
// gradient-filled front face, turning the flat trend bars into extruded 3D blocks.
export function Bar3DShape(props: any) {
  const { x, y, width, height, fill, baseColor } = props;
  if (height <= 0 || width <= 0) return null;
  const depth = Math.min(7, width * 0.32);
  const topColor = shadeHex(baseColor, 0.55);
  const sideColor = shadeHex(baseColor, -0.5);
  return React.createElement(
    'g',
    null,
    React.createElement('polygon', { points: `${x},${y} ${x + depth},${y - depth * 0.85} ${x + width + depth},${y - depth * 0.85} ${x + width},${y}`, fill: topColor }),
    React.createElement('polygon', { points: `${x + width},${y} ${x + width + depth},${y - depth * 0.85} ${x + width + depth},${y + height - depth * 0.85} ${x + width},${y + height}`, fill: sideColor }),
    React.createElement('rect', { x, y, width, height, fill }),
  );
}
