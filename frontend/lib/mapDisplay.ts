// Map name/thumbnail helpers — lives here, not in app/page.tsx, so InsightsDashboard.tsx
// (which page.tsx renders) can import these without a circular module-eval dependency.
// Same reasoning as lib/duelColors.ts's own header comment: a same-file circular import
// between a page and a component it renders has already caused a real temporal-dead-zone
// crash once before, for a different pair of helpers.

export function formatMapName(map?: string | null): string {
  if (!map) return 'Unknown Map';
  return map.replace(/^de_/, '').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

// No maps currently have a real in-game screenshot saved locally (see
// frontend/public/maps/screens/) — every map falls back to a plain gradient panel
// instead of a broken <img>. Add an entry here (and the matching file) once a
// verified real screenshot is available for that map.
const MAPS_WITH_SCREENSHOTS = new Set<string>([]);
export function mapScreenshotUrl(map?: string | null): string | null {
  if (!map || !MAPS_WITH_SCREENSHOTS.has(map)) return null;
  return `/maps/screens/${map}.png`;
}
