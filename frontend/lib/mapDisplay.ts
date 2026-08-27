// Map name/thumbnail helpers — lives here, not in app/page.tsx, so InsightsDashboard.tsx
// (which page.tsx renders) can import these without a circular module-eval dependency.
// Same reasoning as lib/duelColors.ts's own header comment: a same-file circular import
// between a page and a component it renders has already caused a real temporal-dead-zone
// crash once before, for a different pair of helpers.

export function formatMapName(map?: string | null): string {
  if (!map) return 'Unknown Map';
  return map.replace(/^de_/, '').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

// Real in-game screenshots, sourced from github.com/MurkyYT/cs2-map-icons (verified real,
// legible, correct per-map before being added — not assumed from the filename alone),
// resized to 800px wide and re-encoded as JPEG (originals were ~3MB PNGs; these are
// ~50-80KB) since these are photographic content, not sprites needing transparency.
// NOT a verified-complete list — de_cache was missing on the first pass (caught by the
// user after deploy) and there are ~40 more maps in the source repo (mostly community/
// operation maps unlikely to appear in real Premier matches). A map missing here falls
// back to the plain gradient panel instead of a broken <img>, so it's a safe default, not
// a crash — but if a real tracked match shows up with no thumbnail, that's the fix: pull
// the map's `_png.png` from the same repo, verify it visually, add it here.
const MAPS_WITH_SCREENSHOTS = new Set<string>([
  'de_dust2', 'de_inferno', 'de_mirage', 'de_nuke', 'de_ancient',
  'de_anubis', 'de_overpass', 'de_train', 'de_vertigo', 'de_cache',
]);
export function mapScreenshotUrl(map?: string | null): string | null {
  if (!map || !MAPS_WITH_SCREENSHOTS.has(map)) return null;
  return `/maps/screens/${map}.jpg`;
}
