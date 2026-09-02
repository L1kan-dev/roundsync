'use client';

import React, { useEffect, useState, CSSProperties } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ChevronLeft, Loader2, ShieldAlert, Info } from 'lucide-react';
import { LogoLockup } from '@/components/Logo';
import { RankBadge } from '@/components/RankBadge';
import { rankBand } from '@/lib/rank';
import { formatMapName, mapScreenshotUrl } from '@/lib/mapDisplay';
import { type Telemetry, performanceIndex, formatMatchDate } from '@/lib/matchStats';
import { STAT_GLOSSARY } from '@/lib/statGlossary';
import { useHoverTooltip } from '@/lib/useHoverTooltip';
import { ctTAccent, duelLerp } from '@/lib/duelColors';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface MatchDetail {
  match_id: string;
  parsed_at: string;
  match_data: { telemetry: Telemetry };
}

interface DuelRow {
  round_number: number;
  engagement_tick: number;
  engagement_result: 'won' | 'lost' | 'no_result';
  angle_deviation_deg: number | null;
  time_to_damage_seconds: number | null;
}
interface PositioningRow {
  round_number: number;
  outcome: 'died' | 'survived';
  was_traded: boolean | null;
  teammate_within_trade_range_at_death: boolean | null;
}
interface EngageDecisionRow {
  round_number: number;
  teammates_alive: number;
  enemies_alive: number;
  player_engaged: boolean;
  target_died: boolean;
  round_won: boolean;
  is_isolated: boolean | null;
  current_health: number | null;
  current_weapon: string | null;
}
interface RoundGroup {
  round_number: number;
  duels: DuelRow[];
  positioning: PositioningRow[];
  engage_decisions: EngageDecisionRow[];
}

// Every metric on this page reuses data already computed by sync_pipeline.py — nothing new
// extracted just for this view. weapon_segmented_stats / kills_damage_by_round_outcome /
// kill_distance_buckets have been stored on every match since 2026-08-30 (NEXT_STEPS.md
// Tier 5) but had no UI anywhere until this page — the actual gap the drill-down page was
// meant to close, found during the metrics-placement review.
// Was a native `title=` popup — swapped for the app's one custom styled tooltip so this
// page matches Home/Matches/Insights instead of being the odd one out (NEXT_STEPS.md
// Band 0 / Tier 15's tooltip-consistency item).
// Was a flat `bg-[var(--panel)]` box — every other page's stat tiles (Home's KPI row,
// every Insights StatTile, the Matches-tab cards) use the shared `chip3d` embossed
// treatment colored by the tile's own position (`ctTAccent`), so this page's grids read
// noticeably flatter than the rest of the app right next to them (NEXT_STEPS.md Band 0 /
// Tier 15's tile-gradient-consistency + round-by-round-3D items — same root cause, this
// page never adopted the convention the rest of the app already settled on).
// `onAsk`, when passed, turns the tile into a real click target (matching Home/Insights'
// "click a tile to ask the coach about it" convention) instead of an inert display box —
// this whole page had none of that before (2026-09-02 live-testing feedback: "everything
// below the scoreboard is not clickable to AI Coach"). Falls back to a plain div when no
// handler is given (rare — only for tiles with nothing sensible to ask about).
function StatTile({ label, value, title, color, onAsk }: { label: string; value: React.ReactNode; title?: string; color: string; onAsk?: () => void }) {
  const glossary = useHoverTooltip(title || '');
  const className = `chip3d border border-[var(--edge)] rounded-xl p-3.5 text-center${onAsk ? ' cursor-pointer transition-transform hover:-translate-y-0.5' : ''}`;
  const inner = (
    <>
      <p className="font-tel text-xl font-bold" style={{ color }}>{value}</p>
      <div className="flex items-center justify-center gap-1 mt-1">
        <p className="text-[10px] uppercase tracking-wider text-[var(--text-dim)]">{label}</p>
        {title && <Info className="w-2.5 h-2.5 opacity-50 text-[var(--text-dim)]" />}
      </div>
      {title && glossary.tooltip}
    </>
  );
  return onAsk ? (
    <button type="button" onClick={onAsk} className={className} style={{ '--c': color } as CSSProperties} {...(title ? glossary.handlers : {})}>
      {inner}
    </button>
  ) : (
    <div className={className} style={{ '--c': color } as CSSProperties} {...(title ? glossary.handlers : {})}>
      {inner}
    </div>
  );
}

// Was a native `title=` popup on the "Isolated" tag — the one holdout on this page still
// using the plain browser tooltip instead of the app's shared custom one, caught while
// already rebuilding this section for the horizontal layout.
function RoundCard({ round: r, mapLabel, onAsk }: { round: RoundGroup; mapLabel: string; onAsk: (question: string) => void }) {
  const decision = r.engage_decisions[0];
  const positioning = r.positioning[0];
  const wonRound = decision?.round_won;
  const accent = wonRound === true ? 'var(--cyan)' : wonRound === false ? 'var(--danger)' : 'var(--panel-raised)';
  const isolated = useHoverTooltip(STAT_GLOSSARY.isolatedPush);
  return (
    <button
      type="button"
      onClick={() => onAsk(`Break down round ${r.round_number} on ${mapLabel} for me — what happened and what could I have done better?`)}
      className="chip3d border border-[var(--edge)] rounded-2xl p-3.5 flex flex-col items-center gap-2 shrink-0 w-36 text-center cursor-pointer transition-transform hover:-translate-y-0.5"
      style={{ '--c': accent } as CSSProperties}
    >
      <div
        className="w-9 h-9 rounded-full flex items-center justify-center font-tel text-sm font-bold shrink-0"
        style={{
          background: wonRound === true ? 'var(--cyan)' : wonRound === false ? 'var(--danger)' : 'var(--panel-raised)',
          color: wonRound !== undefined ? '#03141a' : 'var(--text-dim)',
        }}
      >
        {r.round_number}
      </div>
      <div className="flex flex-col gap-1 text-xs text-[var(--text-dim)]">
        {r.duels.length > 0 && (
          <span>
            {r.duels.filter((d) => d.engagement_result === 'won').length}W /{' '}
            {r.duels.filter((d) => d.engagement_result === 'lost').length}L
            <span className="block text-[10px]">
              in {r.duels.length} engagement{r.duels.length === 1 ? '' : 's'}
            </span>
          </span>
        )}
        {positioning && (
          <span>{positioning.outcome === 'died' ? (positioning.was_traded ? 'Died (traded)' : 'Died') : 'Survived'}</span>
        )}
        {decision && <span>{decision.enemies_alive}v{decision.teammates_alive + 1} at decision</span>}
        {decision?.is_isolated && (
          <span className="text-[var(--amber)] font-semibold" {...isolated.handlers}>
            Isolated
          </span>
        )}
      </div>
      {isolated.tooltip}
    </button>
  );
}

// NEXT_STEPS.md Band 0 / Tier 15's per-player stat table — researched 2026-08-31
// (CS2_ANALYTICS_STANDARDS.md's "Match Detail: full per-player stat table" section) before
// building. Scope deliberately matches that research exactly: basic scoreboard stats only
// (Kills, Deaths, Assists, ADR, HS%) for all 10 players, grouped 5-and-5 by team — the one
// layout convention confirmed across every reachable source, including the native CS2
// scoreboard itself. Does NOT surface RoundSync's own deep coaching metrics (KAST, trade-kill
// %, positioning risk) for non-tracked players — those stay tracked-player-only, same
// compute-cost reasoning as fact_economy/fact_positioning_risk/etc.
// Team accents reuse the app's existing CT-cyan/T-amber convention (duelLerp(0)/duelLerp(1)),
// not new colors invented for this table.
// Stacked top-down (one column, both squads), not the earlier side-by-side CT/T layout —
// user feedback, 2026-09-02: sides swap at halftime, so labeling a whole-match table
// "Counter-Terrorists"/"Terrorists" misrepresents any player who spent half the match on
// the other side. Still visually groups the two rosters (a divider + each group keeping
// its own accent color, cyan first group / amber second — the app's existing team-accent
// convention) without naming which side is which.
function ScoreboardTable({
  players,
  trackedSteamId,
}: {
  players: NonNullable<Telemetry['player_scoreboard']>;
  trackedSteamId: string | null;
}) {
  const groups = (['CT', 'T'] as const)
    .map((team, i) => ({ team, accent: duelLerp(i), rows: players.filter((p) => p.team === team) }))
    .filter((g) => g.rows.length > 0);

  return (
    <div className="chip3d border border-[var(--edge)] rounded-xl overflow-hidden" style={{ '--c': duelLerp(0.5) } as CSSProperties}>
      <div className="grid grid-cols-[1fr_repeat(5,2.5rem)] gap-x-2 px-4 pb-1 pt-3 text-[10px] uppercase tracking-wider text-[var(--text-dim)]">
        <span>Player</span>
        <span className="text-right">K</span>
        <span className="text-right">D</span>
        <span className="text-right">A</span>
        <span className="text-right">ADR</span>
        <span className="text-right">HS%</span>
      </div>
      {groups.map((group, gi) => (
        <div key={group.team} className={gi > 0 ? 'border-t-2 border-[var(--edge-bright)]' : ''}>
          {group.rows.map((p) => {
            const isTracked = trackedSteamId != null && p.steam_id64 === trackedSteamId;
            return (
              <div
                key={p.steam_id64}
                className="grid grid-cols-[1fr_repeat(5,2.5rem)] gap-x-2 px-4 py-2 text-sm border-t border-[var(--edge)]"
                style={isTracked ? { color: group.accent, fontWeight: 700, background: 'rgba(255,255,255,0.03)' } : undefined}
              >
                <span className="truncate">{p.name}</span>
                <span className="text-right font-tel">{p.kills}</span>
                <span className="text-right font-tel">{p.deaths}</span>
                <span className="text-right font-tel">{p.assists}</span>
                <span className="text-right font-tel">{p.adr}</span>
                <span className="text-right font-tel">{p.headshot_pct}%</span>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

const WEAPON_CLASS_LABELS: Record<string, string> = {
  pistol: 'Pistols', smg: 'SMGs', rifle: 'Rifles', shotgun: 'Shotguns', sniper: 'Snipers', awp: 'AWP',
};

export default function MatchDetailPage() {
  const params = useParams();
  const router = useRouter();
  const matchId = params.matchId as string;

  const [match, setMatch] = useState<MatchDetail | null>(null);
  const [rounds, setRounds] = useState<RoundGroup[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('jwtToken');
    if (!token) {
      router.replace('/');
      return;
    }
    const headers = { Authorization: `Bearer ${token}` };

    (async () => {
      try {
        const [matchRes, roundsRes] = await Promise.all([
          fetch(`${API_BASE_URL}/api/matches/${matchId}`, { headers }),
          fetch(`${API_BASE_URL}/api/matches/${matchId}/rounds`, { headers }),
        ]);
        if (!matchRes.ok) {
          setError(matchRes.status === 404 ? 'Match not found.' : 'Failed to load match.');
          return;
        }
        const matchJson = await matchRes.json();
        setMatch(matchJson.match);
        if (roundsRes.ok) {
          const roundsJson = await roundsRes.json();
          setRounds(roundsJson.rounds);
        }
      } catch {
        setError('Failed to load match.');
      } finally {
        setLoading(false);
      }
    })();
  }, [matchId, router]);

  // Declared before the loading/error early returns below, same rule as InsightsDashboard's
  // reactionTrendTooltip — hooks must run every render regardless of which branch a
  // component ends up taking. Fixed 3-bucket tuple, so calling all 3 unconditionally here
  // instead of inside the "Kills by Distance" .map() below (hooks can't be called inside a
  // callback, even one that always iterates the same 3 times).
  const distanceTooltips = {
    close: useHoverTooltip(STAT_GLOSSARY.killDistanceClose),
    medium: useHoverTooltip(STAT_GLOSSARY.killDistanceMedium),
    long: useHoverTooltip(STAT_GLOSSARY.killDistanceLong),
  };

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 text-[var(--text-dim)]">
        <Loader2 className="w-10 h-10 animate-spin text-[var(--cyan)]" />
        <p>Loading match...</p>
      </div>
    );
  }

  if (error || !match) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 text-[var(--text-dim)] px-6">
        <ShieldAlert className="w-10 h-10 text-[var(--amber)]" />
        <p>{error || 'Match not found.'}</p>
        <button onClick={() => router.back()} className="text-[var(--cyan)] hover:underline">Back to RoundSync</button>
      </div>
    );
  }

  const t = match.match_data.telemetry;
  const index = performanceIndex(t);
  const matchRankBand = rankBand(t.rank_at_match_start);
  const bg = mapScreenshotUrl(t.map);
  const multiKills = t.multi_kill_rounds;
  const weaponStats = t.weapon_segmented_stats;
  const byOutcome = t.kills_damage_by_round_outcome;
  const distanceBuckets = t.kill_distance_buckets;
  const scoreboard = t.player_scoreboard;
  const trackedSteamId = typeof window !== 'undefined' ? localStorage.getItem('steamId') : null;

  // Hands a question off to Home's Coach tab via a `q` URL param, since this page's tiles
  // had no way to reach the coach at all before (2026-09-02 live-testing feedback) — Home's
  // own promptCoach() is local state that only exists on that route.
  const askCoach = (question: string) => router.push(`/?tab=coach&q=${encodeURIComponent(question)}`);
  const mapLabel = formatMapName(t.map);

  return (
    <div className="min-h-screen text-[var(--text)]">
      <header className="glass sticky top-0 z-40 border-b border-[var(--edge)]">
        <div className="max-w-5xl mx-auto px-6 h-16 flex items-center justify-between">
          <button
            onClick={() => router.back()}
            className="flex items-center gap-1.5 text-sm text-[var(--text-dim)] hover:text-[var(--text)] transition-colors cursor-pointer"
          >
            <ChevronLeft className="w-4 h-4" /> Back
          </button>
          <LogoLockup />
          <div className="w-14" />
        </div>
      </header>

      <div className="relative h-56 overflow-hidden">
        {bg ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={bg} alt="" className="absolute inset-0 w-full h-full object-cover" />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-[var(--panel-raised)] to-[var(--void)]" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-[var(--void)] via-black/40 to-transparent" />
        <div className="absolute inset-0 flex items-end">
          <div className="max-w-5xl mx-auto px-6 pb-6 w-full flex items-end justify-between">
            <div>
              <h1 className="font-display text-4xl font-bold">{formatMapName(t.map)}</h1>
              <p className="text-[var(--text-dim)] mt-1">{formatMatchDate(t)}</p>
            </div>
            {matchRankBand && typeof t.rank_at_match_start === 'number' && (
              <div title={`Premier rank at kickoff: ${t.rank_at_match_start} (${matchRankBand.label})`}>
                <RankBadge color={matchRankBand.color} rankNew={t.rank_at_match_start} size={48} />
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-8 space-y-8">
        {/* Core stats — everything the Matches-tab card already shows, plus the fields that
            never had a home anywhere: entry success, utility dmg/rd, clutches, KAST,
            trade-kill%, HS accuracy. */}
        <section>
          <h2 className="font-display text-lg font-bold mb-3">Overview</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {(() => {
              const tiles: { label: string; value: React.ReactNode; title?: string; onAsk: () => void }[] = [
                { label: 'K/D', value: t.kd_ratio, title: STAT_GLOSSARY.kd, onAsk: () => askCoach(`My K/D on ${mapLabel} was ${t.kd_ratio}. What drove that number this match?`) },
                { label: 'Kills', value: t.kills, onAsk: () => askCoach(`I got ${t.kills} kills on ${mapLabel}. Walk me through the ones that mattered most.`) },
                { label: 'Deaths', value: t.deaths, onAsk: () => askCoach(`I died ${t.deaths} times on ${mapLabel}. Which of those deaths were avoidable?`) },
                { label: 'Assists', value: t.assists ?? '—', onAsk: () => askCoach(`I had ${t.assists ?? 'some'} assists on ${mapLabel}. How am I setting up kills for my team?`) },
                { label: 'ADR', value: t.adr, title: STAT_GLOSSARY.adr, onAsk: () => askCoach(`My ADR on ${mapLabel} was ${t.adr}. Is that damage output solid for this match?`) },
                { label: 'Headshot %', value: `${t.headshot_pct}%`, title: STAT_GLOSSARY.hsPct, onAsk: () => askCoach(`My headshot % on ${mapLabel} was ${t.headshot_pct}%. What does that say about my aim this match?`) },
                { label: 'Performance', value: `${index}/100`, title: STAT_GLOSSARY.performanceIndex, onAsk: () => askCoach(`My Performance Index on ${mapLabel} was ${index}/100. What pulled it up or down?`) },
                { label: 'Rounds Played', value: t.rounds_played ?? '—', onAsk: () => askCoach(`This match on ${mapLabel} went ${t.rounds_played ?? 'several'} rounds. How did the pace of the match affect how I played?`) },
                { label: 'KAST %', value: t.kast_pct != null ? `${t.kast_pct}%` : '—', title: STAT_GLOSSARY.kast, onAsk: () => askCoach(`My KAST on ${mapLabel} was ${t.kast_pct ?? '—'}%. Which rounds did I contribute nothing in?`) },
                { label: 'HS Accuracy', value: t.headshot_accuracy_pct != null ? `${t.headshot_accuracy_pct}%` : '—', title: STAT_GLOSSARY.hsAccuracy, onAsk: () => askCoach(`My headshot accuracy on ${mapLabel} was ${t.headshot_accuracy_pct ?? '—'}%. How's my crosshair placement looking this match?`) },
                { label: 'Trade Kill %', value: t.trade_kill_pct != null ? `${t.trade_kill_pct}%` : '—', title: STAT_GLOSSARY.tradeKillPct, onAsk: () => askCoach(`My trade kill % on ${mapLabel} was ${t.trade_kill_pct ?? '—'}%. Was I playing close enough to my team this match?`) },
                { label: 'Entry Success %', value: t.entry_success_pct != null ? `${t.entry_success_pct}%` : '—', title: STAT_GLOSSARY.entrySuccessPct, onAsk: () => askCoach(`My entry success % on ${mapLabel} was ${t.entry_success_pct ?? '—'}%. How were my opening duels this match?`) },
                { label: 'Utility Dmg/Rd', value: t.utility_dmg_per_round != null ? t.utility_dmg_per_round : '—', title: STAT_GLOSSARY.utilityDmgPerRound, onAsk: () => askCoach(`My utility damage per round on ${mapLabel} was ${t.utility_dmg_per_round ?? '—'}. Was my grenade usage effective this match?`) },
                { label: 'Clutches Won', value: t.clutches_won ?? '—', title: STAT_GLOSSARY.clutchesWon, onAsk: () => askCoach(`I won ${t.clutches_won ?? 'some'} clutches on ${mapLabel}. Walk me through how those played out.`) },
              ];
              return tiles.map((tile, i) => (
                <StatTile key={tile.label} {...tile} color={ctTAccent(i, tiles.length)} />
              ));
            })()}
          </div>
        </section>

        <section>
          <h2 className="font-display text-lg font-bold mb-3">Full Scoreboard</h2>
          {scoreboard && scoreboard.length > 0 ? (
            <ScoreboardTable players={scoreboard} trackedSteamId={trackedSteamId} />
          ) : (
            <p className="text-sm text-[var(--text-dim)]">
              Full scoreboard unavailable for this match — this is normal for matches parsed before this table was
              added; re-sync to include it.
            </p>
          )}
        </section>

        {multiKills && (
          <section>
            <h2 className="font-display text-lg font-bold mb-3">Multi-Kill Rounds</h2>
            <div className="grid grid-cols-4 gap-3">
              <StatTile label="2K" value={multiKills['2k']} color={ctTAccent(0, 4)} onAsk={() => askCoach(`I got ${multiKills['2k']} 2-kill rounds on ${mapLabel}. Walk me through those.`)} />
              <StatTile label="3K" value={multiKills['3k']} color={ctTAccent(1, 4)} onAsk={() => askCoach(`I got ${multiKills['3k']} 3-kill rounds on ${mapLabel}. Walk me through those.`)} />
              <StatTile label="4K" value={multiKills['4k']} color={ctTAccent(2, 4)} onAsk={() => askCoach(`I got ${multiKills['4k']} 4-kill rounds on ${mapLabel}. Walk me through those.`)} />
              <StatTile label="Ace" value={multiKills.ace} color={ctTAccent(3, 4)} onAsk={() => askCoach(`I got ${multiKills.ace} aces on ${mapLabel}. Walk me through ${multiKills.ace === 1 ? 'it' : 'those'}.`)} />
            </div>
          </section>
        )}

        {byOutcome && (
          <section>
            <h2 className="font-display text-lg font-bold mb-3">Wins vs. Losses</h2>
            <div className="grid grid-cols-2 gap-4">
              <button
                type="button"
                onClick={() => askCoach(`On ${mapLabel}, I got ${byOutcome.wins.kills} kills and ${Math.round(byOutcome.wins.damage)} damage in rounds we won. What was I doing right in those rounds?`)}
                className="chip3d border border-[var(--edge)] rounded-xl p-4 text-left cursor-pointer transition-transform hover:-translate-y-0.5"
                style={{ '--c': 'var(--cyan)' } as CSSProperties}
              >
                <p className="text-xs uppercase tracking-wider text-[var(--cyan)] mb-2">Round Wins</p>
                <p className="font-tel text-2xl font-bold">{byOutcome.wins.kills} kills</p>
                <p className="text-sm text-[var(--text-dim)]">{Math.round(byOutcome.wins.damage)} damage</p>
              </button>
              <button
                type="button"
                onClick={() => askCoach(`On ${mapLabel}, I got ${byOutcome.losses.kills} kills and ${Math.round(byOutcome.losses.damage)} damage in rounds we lost. What went wrong in those rounds?`)}
                className="chip3d border border-[var(--edge)] rounded-xl p-4 text-left cursor-pointer transition-transform hover:-translate-y-0.5"
                style={{ '--c': 'var(--danger)' } as CSSProperties}
              >
                <p className="text-xs uppercase tracking-wider text-[var(--danger)] mb-2">Round Losses</p>
                <p className="font-tel text-2xl font-bold">{byOutcome.losses.kills} kills</p>
                <p className="text-sm text-[var(--text-dim)]">{Math.round(byOutcome.losses.damage)} damage</p>
              </button>
            </div>
          </section>
        )}

        {distanceBuckets && (
          <section>
            <h2 className="font-display text-lg font-bold mb-3">Kills by Distance</h2>
            <div className="grid grid-cols-3 gap-3">
              {(['close', 'medium', 'long'] as const).map((bucket, i) => {
                const tooltip = distanceTooltips[bucket];
                return (
                  <button
                    type="button"
                    key={bucket}
                    onClick={() => askCoach(`On ${mapLabel}, ${distanceBuckets[bucket].kills} of my kills were at ${bucket} range. How's my positioning at that range?`)}
                    className="chip3d border border-[var(--edge)] rounded-xl p-3.5 text-center cursor-pointer transition-transform hover:-translate-y-0.5"
                    style={{ '--c': ctTAccent(i, 3) } as CSSProperties}
                    {...tooltip.handlers}
                  >
                    <p className="font-tel text-xl font-bold" style={{ color: ctTAccent(i, 3) }}>{distanceBuckets[bucket].kills}</p>
                    <div className="flex items-center justify-center gap-1 mt-1">
                      <p className="text-[10px] uppercase tracking-wider text-[var(--text-dim)] capitalize">{bucket}</p>
                      <Info className="w-2.5 h-2.5 opacity-50 text-[var(--text-dim)]" />
                    </div>
                    <p className="text-xs text-[var(--text-dim)] mt-1">
                      {distanceBuckets[bucket].kills > 0
                        ? `${Math.round((100 * distanceBuckets[bucket].headshots) / distanceBuckets[bucket].kills)}% HS`
                        : '—'}
                    </p>
                    {tooltip.tooltip}
                  </button>
                );
              })}
            </div>
          </section>
        )}

        {weaponStats && Object.keys(weaponStats).length > 0 && (
          <section>
            <h2 className="font-display text-lg font-bold mb-3">Weapon Breakdown</h2>
            <div className="hud-corners chip3d border border-[var(--edge)] rounded-xl overflow-hidden" style={{ '--c': ctTAccent(0, 1) } as CSSProperties}>
              {Object.entries(weaponStats)
                .sort(([, a], [, b]) => b.kills - a.kills)
                .map(([weapon, stats], i) => (
                  <button
                    type="button"
                    key={weapon}
                    onClick={() => askCoach(`On ${mapLabel}, I got ${stats.kills} kills and ${Math.round(stats.damage)} damage with ${(WEAPON_CLASS_LABELS[weapon] || weapon).toLowerCase()}. How effective was I with that weapon class this match?`)}
                    className={`w-full flex items-center justify-between px-4 py-3 text-left cursor-pointer transition-colors hover:bg-white/5 ${i > 0 ? 'border-t border-[var(--edge)]' : ''}`}
                  >
                    <span className="font-medium">{WEAPON_CLASS_LABELS[weapon] || weapon}</span>
                    <span className="font-tel text-sm text-[var(--text-dim)]">
                      {stats.kills} kills · {Math.round(stats.damage)} dmg
                    </span>
                  </button>
                ))}
            </div>
          </section>
        )}

        <section>
          <h2 className="font-display text-lg font-bold mb-3">Round by Round</h2>
          {rounds === null ? (
            <p className="text-sm text-[var(--text-dim)]">Round-level detail unavailable for this match.</p>
          ) : rounds.length === 0 ? (
            <p className="text-sm text-[var(--text-dim)]">
              No round-level detail captured for this match — this is normal for matches parsed before the round-level
              extraction (positioning, engagement, and decision tracking) was added.
            </p>
          ) : (
            // Was a vertical stack of flat rows — user asked for a horizontal timeline instead
            // (rounds read left-to-right the way they were actually played) with every card
            // reading as "3D" like the rest of the app, via the shared `chip3d` bevel treatment
            // instead of a plain flat panel. Win/loss keeps its own semantic color (cyan/danger)
            // as `--c` rather than a purely positional duel accent, since a round's color here
            // means something (who won it), not just where it sits in the row.
            <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1">
              {rounds.map((r) => (
                <RoundCard key={r.round_number} round={r} mapLabel={mapLabel} onAsk={askCoach} />
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
