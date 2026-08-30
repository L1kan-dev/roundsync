// Every promptCoach() call across Home/Matches/Insights used to be hardcoded with deficiency
// framing ("is my X low," "what am I doing wrong") regardless of the player's actual number —
// direct user report 2026-08-31: a genuinely strong player gets asked why their strong stat
// "feels low," which reads as presumptuous and doesn't produce a useful coaching answer.
//
// Thresholds below are real published benchmarks (web-searched 2026-08-31, not guessed) —
// same external-verification standard as services/watcher/CS2_ANALYTICS_STANDARDS.md:
// - K/D: competitive players 1.1-1.3, pros 1.2-1.5+, elite 1.35+ (multiple CS2 stats guides)
// - ADR: solid 75-85, elite 90+, under 65 signals a struggling player (pley.gg, cs2bet.io)
// - Headshot %: elite 50%+, solid rifler 45-55%, under 30% signals crosshair placement issues
//   (blog.cs2.ad, pley.gg) — this is headshot% OF KILLS, not headshot accuracy (% of hits),
//   which is a different stat with no published benchmark found; kept neutral below.
// - KAST: above 75% is a reliable, floor-level contributor (leetify glossary via search)
// - Entry/opening duel win rate: 55%+ is meaningfully above average, 60%+ is elite
//   (recoilanalytics.com) — maps directly onto RoundSync's entry_success_pct.
// - Utility dmg/round: professional SUPPORT players average 5-10 (faceitfinder.io) — this is
//   a role-specific benchmark, not a general population one, so only the "strong" side is
//   used below (crediting genuinely heavy utility usage); no "weak" cutoff is applied, since
//   a rifler legitimately using little utility isn't doing anything wrong.
// No real benchmark was found anywhere for trade-kill %, clutches-won (as a rate), multi-kill
// round counts, or headshot ACCURACY (vs. kill-%) — those stay neutral rather than getting a
// fabricated threshold.
export type Tier = 'strong' | 'weak' | 'neutral';

interface Benchmark {
  weak?: number; // at or below this value -> 'weak'
  strong: number; // at or above this value -> 'strong'
}

const BENCHMARKS = {
  kd: { weak: 1.0, strong: 1.3 },
  adr: { weak: 65, strong: 90 },
  hsPct: { weak: 30, strong: 50 },
  kast: { weak: 65, strong: 75 },
  entrySuccessPct: { weak: 45, strong: 55 },
  utilityDmgPerRound: { strong: 5 },
  // NOT an external benchmark like the ones above — performanceIndex is RoundSync's own
  // already-normalized 0-100 composite (see frontend/lib/matchStats.ts), so ordinary
  // scale-reading bands are a defensible, honest interpretation of RoundSync's own number,
  // not a claim about external research that doesn't exist for a RoundSync-original score.
  performanceIndex: { weak: 40, strong: 70 },
} satisfies Record<string, Benchmark>;

export type BenchmarkedStat = keyof typeof BENCHMARKS;

export function statTier(stat: BenchmarkedStat, value: number | null | undefined): Tier {
  if (value === null || value === undefined) return 'neutral';
  const b: Benchmark = BENCHMARKS[stat];
  if (value >= b.strong) return 'strong';
  if (b.weak !== undefined && value <= b.weak) return 'weak';
  return 'neutral';
}

// Picks the right prompt for the player's actual number instead of always assuming a
// deficiency. `neutral` covers both "no real benchmark exists for this stat" and "this
// player's value is genuinely in the middle" — same wording either way, since both cases
// warrant the same non-judgmental framing.
export function adaptivePrompt(tier: Tier, templates: { weak: string; neutral: string; strong: string }): string {
  return templates[tier];
}
