// Shared between app/page.tsx and the match-detail drill-down page (app/matches/[matchId]) —
// extracted 2026-08-31 while building the drill-down page rather than duplicating
// performanceIndex/formatMatchDate a second time. The Telemetry type here is the single
// source of truth for what a match's match_data.telemetry blob can contain; keep it in sync
// with the real payload sync_pipeline.py writes (see real_payload.telemetry there).
export interface Telemetry {
  status: string;
  kd_ratio: number;
  adr: number;
  kills: number;
  deaths: number;
  assists?: number | null;
  headshot_pct: number;
  map?: string | null;
  match_time?: number | null;
  total_damage?: number | null;
  headshots?: number | null;
  rounds_played?: number | null;
  rank_at_match_start?: number | null;
  entry_success_pct?: number | null;
  utility_dmg_per_round?: number | null;
  clutches_won?: number | null;
  trade_kill_pct?: number | null;
  kast_pct?: number | null;
  headshot_accuracy_pct?: number | null;
  multi_kill_rounds?: { '2k': number; '3k': number; '4k': number; ace: number } | null;
  weapon_segmented_stats?: Record<string, { kills: number; damage: number }> | null;
  kills_damage_by_round_outcome?: {
    wins: { kills: number; damage: number };
    losses: { kills: number; damage: number };
  } | null;
  kill_distance_buckets?: {
    close: { kills: number; headshots: number };
    medium: { kills: number; headshots: number };
    long: { kills: number; headshots: number };
  } | null;
}

export interface Match {
  match_id: string;
  parsed_at: string;
  match_data: { telemetry: Telemetry };
}

// Impact weight per multi-kill type — the EXTRA kills a multi-kill round contributes beyond a
// normal 1-kill round (already credited via K/D and ADR), i.e. (kill count − 1): 2k=2-1=1,
// 3k=3-1=2, 4k=4-1=3, ace=5 kills-1=4. A RoundSync original construction, no external source —
// see performanceIndex's own comment.
const MULTI_KILL_BONUS_WEIGHT: Record<string, number> = { '2k': 1, '3k': 2, '4k': 3, ace: 4 };
// Cap for "bonus kills from multi-kill rounds, per round played" before the component maxes
// out at 1.0 — same style as the existing K/D (cap 3) and ADR (cap 150) component caps below.
const MULTI_KILL_BONUS_PER_ROUND_CAP = 0.5;

function multiKillBonusComponent(
  multiKillRounds: Record<string, number> | null | undefined,
  roundsPlayed: number | null | undefined
): number | null {
  if (!multiKillRounds || !roundsPlayed) return null;
  const bonusKills = Object.entries(MULTI_KILL_BONUS_WEIGHT)
    .reduce((sum, [key, weight]) => sum + (multiKillRounds[key] || 0) * weight, 0);
  return Math.min(bonusKills / roundsPlayed, MULTI_KILL_BONUS_PER_ROUND_CAP) / MULTI_KILL_BONUS_PER_ROUND_CAP;
}

// A composite score from what we have today — not the full round-by-round Impact formula
// discussed for later; labeled as such in the UI. Weights reflect real published research on
// which classic stats actually correlate with round-outcome impact (checked 2026-08-30, not
// guessed): ADR and KAST are the two most predictive individual stats; K/D is explicitly the
// LEAST correlated with actual impact among the common stats (it ignores damage/trades/
// survival). Headshot% is a mechanics/aim indicator, not an outcome predictor, so it stays
// small. Trade-kill% and the multi-kill bonus are secondary teamplay/impact signals.
// Components missing on an older already-parsed match (KAST/trade-kill%/multi-kill weren't
// always captured) don't get penalized as 0 — their weight is redistributed proportionally
// across whichever components ARE present, same "don't average against a fake baseline"
// principle as avgWeighted() in page.tsx.
export function performanceIndex(t: Telemetry): number {
  const components: [number | null | undefined, number][] = [
    [t.kd_ratio != null ? Math.min(t.kd_ratio, 3) / 3 : null, 0.15],
    [t.adr != null ? Math.min(t.adr, 150) / 150 : null, 0.30],
    [t.headshot_pct != null ? Math.min(t.headshot_pct, 100) / 100 : null, 0.07],
    [t.kast_pct != null ? Math.min(t.kast_pct, 100) / 100 : null, 0.30],
    [t.trade_kill_pct != null ? Math.min(t.trade_kill_pct, 100) / 100 : null, 0.10],
    [multiKillBonusComponent(t.multi_kill_rounds, t.rounds_played), 0.08],
  ];
  const present = components.filter((c): c is [number, number] => c[0] !== null && c[0] !== undefined);
  if (present.length === 0) return 0;
  const totalWeight = present.reduce((sum, [, w]) => sum + w, 0);
  const score = present.reduce((sum, [v, w]) => sum + v * (w / totalWeight), 0);
  return Math.round(score * 100);
}

// Only claims a date when we have the real match_time from the Game Coordinator —
// falling back to parsed_at would show "when RoundSync processed it," which for a
// backlog of older matches processed in one sitting looks like a false play date.
export function formatMatchDate(t: Telemetry): string {
  if (!t.match_time) return 'Date unavailable';
  return new Date(t.match_time * 1000).toLocaleString(undefined, {
    month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
  });
}
