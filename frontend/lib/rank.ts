// Real, current (2026) CS2 Premier CS Rating bands — same ones the AI Coach's tone and
// the Insights dashboard already use server-side. Single source of truth for the frontend.
export const RANK_BANDS = [
  { max: 4999, label: 'Grey', color: '#9ca3af' },
  { max: 9999, label: 'Light Blue', color: '#7dd3fc' },
  { max: 14999, label: 'Blue', color: '#60a5fa' },
  { max: 19999, label: 'Purple', color: '#a78bfa' },
  { max: 24999, label: 'Pink', color: '#f472b6' },
  { max: 29999, label: 'Red', color: '#ef4444' },
  { max: Infinity, label: 'Gold', color: '#fbbf24' },
] as const;

export function rankBand(rankNew: number | null | undefined) {
  if (rankNew === null || rankNew === undefined) return null;
  return RANK_BANDS.find((b) => rankNew <= b.max) || RANK_BANDS[RANK_BANDS.length - 1];
}

export function rankBandIndex(rankNew: number): number {
  const idx = RANK_BANDS.findIndex((b) => rankNew <= b.max);
  return idx === -1 ? RANK_BANDS.length - 1 : idx;
}

export const LAST_KNOWN_RANK_KEY = 'roundsync_last_known_rank';
