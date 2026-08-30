'use client';

import React, { useEffect, useState, CSSProperties } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ChevronLeft, Loader2, ShieldAlert } from 'lucide-react';
import { LogoLockup } from '@/components/Logo';
import { RankBadge } from '@/components/RankBadge';
import { rankBand } from '@/lib/rank';
import { formatMapName, mapScreenshotUrl } from '@/lib/mapDisplay';
import { type Telemetry, performanceIndex, formatMatchDate } from '@/lib/matchStats';
import { STAT_GLOSSARY } from '@/lib/statGlossary';

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
function StatTile({ label, value, title }: { label: string; value: React.ReactNode; title?: string }) {
  return (
    <div className="bg-[var(--panel)] border border-[var(--edge)] rounded-xl p-3.5 text-center" title={title}>
      <p className="font-tel text-xl font-bold text-[var(--text)]">{value}</p>
      <p className="text-[10px] uppercase tracking-wider text-[var(--text-dim)] mt-1">{label}</p>
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
        <button onClick={() => router.push('/')} className="text-[var(--cyan)] hover:underline">Back to RoundSync</button>
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

  return (
    <div className="min-h-screen text-[var(--text)]">
      <header className="glass sticky top-0 z-40 border-b border-[var(--edge)]">
        <div className="max-w-5xl mx-auto px-6 h-16 flex items-center justify-between">
          <button
            onClick={() => router.push('/')}
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
            <StatTile label="K/D" value={t.kd_ratio} title={STAT_GLOSSARY.kd} />
            <StatTile label="Kills" value={t.kills} />
            <StatTile label="Deaths" value={t.deaths} />
            <StatTile label="Assists" value={t.assists ?? '—'} />
            <StatTile label="ADR" value={t.adr} title={STAT_GLOSSARY.adr} />
            <StatTile label="Headshot %" value={`${t.headshot_pct}%`} title={STAT_GLOSSARY.hsPct} />
            <StatTile label="Performance" value={`${index}/100`} title={STAT_GLOSSARY.performanceIndex} />
            <StatTile label="Rounds Played" value={t.rounds_played ?? '—'} />
            <StatTile label="KAST %" value={t.kast_pct != null ? `${t.kast_pct}%` : '—'} title={STAT_GLOSSARY.kast} />
            <StatTile label="HS Accuracy" value={t.headshot_accuracy_pct != null ? `${t.headshot_accuracy_pct}%` : '—'} title={STAT_GLOSSARY.hsAccuracy} />
            <StatTile label="Trade Kill %" value={t.trade_kill_pct != null ? `${t.trade_kill_pct}%` : '—'} title={STAT_GLOSSARY.tradeKillPct} />
            <StatTile label="Entry Success %" value={t.entry_success_pct != null ? `${t.entry_success_pct}%` : '—'} title={STAT_GLOSSARY.entrySuccessPct} />
            <StatTile label="Utility Dmg/Rd" value={t.utility_dmg_per_round != null ? t.utility_dmg_per_round : '—'} title={STAT_GLOSSARY.utilityDmgPerRound} />
            <StatTile label="Clutches Won" value={t.clutches_won ?? '—'} title={STAT_GLOSSARY.clutchesWon} />
          </div>
        </section>

        {multiKills && (
          <section>
            <h2 className="font-display text-lg font-bold mb-3">Multi-Kill Rounds</h2>
            <div className="grid grid-cols-4 gap-3">
              <StatTile label="2K" value={multiKills['2k']} />
              <StatTile label="3K" value={multiKills['3k']} />
              <StatTile label="4K" value={multiKills['4k']} />
              <StatTile label="Ace" value={multiKills.ace} />
            </div>
          </section>
        )}

        {byOutcome && (
          <section>
            <h2 className="font-display text-lg font-bold mb-3">Wins vs. Losses</h2>
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-[var(--panel)] border border-[var(--edge)] rounded-xl p-4">
                <p className="text-xs uppercase tracking-wider text-[var(--cyan)] mb-2">Round Wins</p>
                <p className="font-tel text-2xl font-bold">{byOutcome.wins.kills} kills</p>
                <p className="text-sm text-[var(--text-dim)]">{Math.round(byOutcome.wins.damage)} damage</p>
              </div>
              <div className="bg-[var(--panel)] border border-[var(--edge)] rounded-xl p-4">
                <p className="text-xs uppercase tracking-wider text-[var(--danger)] mb-2">Round Losses</p>
                <p className="font-tel text-2xl font-bold">{byOutcome.losses.kills} kills</p>
                <p className="text-sm text-[var(--text-dim)]">{Math.round(byOutcome.losses.damage)} damage</p>
              </div>
            </div>
          </section>
        )}

        {distanceBuckets && (
          <section>
            <h2 className="font-display text-lg font-bold mb-3">Kills by Distance</h2>
            <div className="grid grid-cols-3 gap-3">
              {(['close', 'medium', 'long'] as const).map((bucket) => (
                <div key={bucket} className="bg-[var(--panel)] border border-[var(--edge)] rounded-xl p-3.5 text-center">
                  <p className="font-tel text-xl font-bold">{distanceBuckets[bucket].kills}</p>
                  <p className="text-[10px] uppercase tracking-wider text-[var(--text-dim)] mt-1 capitalize">{bucket}</p>
                  <p className="text-xs text-[var(--text-dim)] mt-1">
                    {distanceBuckets[bucket].kills > 0
                      ? `${Math.round((100 * distanceBuckets[bucket].headshots) / distanceBuckets[bucket].kills)}% HS`
                      : '—'}
                  </p>
                </div>
              ))}
            </div>
          </section>
        )}

        {weaponStats && Object.keys(weaponStats).length > 0 && (
          <section>
            <h2 className="font-display text-lg font-bold mb-3">Weapon Breakdown</h2>
            <div className="bg-[var(--panel)] border border-[var(--edge)] rounded-xl overflow-hidden">
              {Object.entries(weaponStats)
                .sort(([, a], [, b]) => b.kills - a.kills)
                .map(([weapon, stats], i) => (
                  <div
                    key={weapon}
                    className={`flex items-center justify-between px-4 py-3 ${i > 0 ? 'border-t border-[var(--edge)]' : ''}`}
                  >
                    <span className="font-medium">{WEAPON_CLASS_LABELS[weapon] || weapon}</span>
                    <span className="font-tel text-sm text-[var(--text-dim)]">
                      {stats.kills} kills · {Math.round(stats.damage)} dmg
                    </span>
                  </div>
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
            <div className="space-y-2">
              {rounds.map((r) => {
                const decision = r.engage_decisions[0];
                const positioning = r.positioning[0];
                const wonRound = decision?.round_won;
                return (
                  <div
                    key={r.round_number}
                    className="flex items-center gap-4 bg-[var(--panel)] border border-[var(--edge)] rounded-xl px-4 py-3"
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
                    <div className="flex-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-[var(--text-dim)]">
                      {r.duels.length > 0 && (
                        <span>
                          {r.duels.filter((d) => d.engagement_result === 'won').length}W /{' '}
                          {r.duels.filter((d) => d.engagement_result === 'lost').length}L in {r.duels.length} engagement
                          {r.duels.length === 1 ? '' : 's'}
                        </span>
                      )}
                      {positioning && (
                        <span>
                          {positioning.outcome === 'died'
                            ? positioning.was_traded ? 'Died (traded)' : 'Died'
                            : 'Survived'}
                        </span>
                      )}
                      {decision?.is_isolated && (
                        <span className="text-[var(--amber)]" title={STAT_GLOSSARY.isolatedPush}>Isolated</span>
                      )}
                      {decision && (
                        <span>
                          {decision.enemies_alive}v{decision.teammates_alive + 1} at decision
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
