// Real CS2 Premier CS Rating bands, corrected against an actual in-game reference
// screenshot the user provided (an earlier web-research-sourced 7-band guess was wrong
// on both the thresholds AND the count — it's 6 real bands, not 7). Same bands the AI
// Coach's tone and the Insights dashboard use server-side — keep services/api/server.js's
// rankTierInstruction() in sync if these ever change again.
export const RANK_BANDS = [
  { max: 1999, label: 'Grey', color: '#9ca3af' },
  { max: 5999, label: 'White', color: '#e5e7eb' },
  { max: 8999, label: 'Light Blue', color: '#7dd3fc' },
  { max: 12999, label: 'Blue', color: '#60a5fa' },
  { max: 14999, label: 'Violet', color: '#a78bfa' },
  { max: 29999, label: 'Purple', color: '#c084fc' },
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
