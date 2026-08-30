// Single source of truth for "what does this stat actually mean" — added 2026-08-31 after a
// direct user report that tooltip wording/presence was inconsistent across Home, Matches, the
// match-detail drill-down page, and Insights (e.g. Performance Index explained one way on
// Home, a different way on Matches, and only via a generic "see Home dashboard" pointer on
// the drill-down page; Trade Kill % and Entry Success % had no explanation ANYWHERE despite
// being genuinely non-obvious). Every definition here is checked against
// services/watcher/CS2_ANALYTICS_STANDARDS.md's real, sourced definitions — not guessed —
// so wording stays correct even when it's reused far from the code that computes the stat.
//
// Deliberately does NOT cover self-evident stats (Kills, Deaths, Rounds Played, map names) —
// forcing a tooltip onto every single number is its own inconsistency (over-explaining what
// the label already says), which is the OTHER half of the same user report ("the small
// explanations... are not everywhere necessary").
export const STAT_GLOSSARY = {
  kd: 'Kills-to-deaths ratio',
  adr: 'Average damage per round',
  hsPct: '% of your kills that were headshots',
  hsAccuracy: '% of your hits (not just kills) that landed on the head',
  kast: 'Kill, Assist, Survive, or Traded — % of rounds you contributed something',
  tradeKillPct: "% of your kills that avenged a teammate's death within 4 seconds",
  entrySuccessPct: "Win rate of the round's first duel — the first death, whether you were the attacker or the victim",
  utilityDmgPerRound: 'Average grenade/molotov damage dealt per round',
  clutchesWon: 'Rounds won as the last player alive on your team, with at least one enemy still alive',
  performanceIndex: 'A blended score from K/D, ADR, headshot%, KAST, trade-kill%, and multi-kill bonus',
  isolatedPush: 'A commitment made with no teammate close enough to trade if you die',
  outnumberedMoment: 'A moment where more enemies were alive than teammates on your side',
} as const;
