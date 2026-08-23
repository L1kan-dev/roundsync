// Real CS2 Premier CS Rating bands — corrected against a clear, exact in-game reference
// screenshot of the full rank-up ladder (1,000-4,999 / 5,000-9,999 / 10,000-14,999 /
// 15,000-19,999 / 20,000-24,999 / 25,000-29,999 / 30,000+). An earlier "fix" based on a
// blurrier screenshot got this wrong a second time — this is the ground-truth version.
// Same bands the AI Coach's tone and the Insights dashboard use server-side — keep
// services/api/server.js's rankTierInstruction() in sync if these ever change again.
export const RANK_BANDS = [
  { max: 4999, label: 'Grey', color: '#d1d5db' },
  { max: 9999, label: 'Light Blue', color: '#7dd3fc' },
  { max: 14999, label: 'Blue', color: '#818cf8' },
  { max: 19999, label: 'Purple', color: '#a855f7' },
  { max: 24999, label: 'Pink', color: '#d946ef' },
  { max: 29999, label: 'Red', color: '#ef4444' },
  { max: Infinity, label: 'Gold', color: '#eab308' },
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
