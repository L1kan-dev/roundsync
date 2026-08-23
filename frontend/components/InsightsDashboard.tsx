'use client';

import React, { useEffect, useState } from 'react';
import { ResponsiveContainer, LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Cell } from 'recharts';
import {
  Loader2, Sparkles, Coins, Flame, Ear, Users, MapPinned, Crosshair, MessageCircleQuestion,
} from 'lucide-react';
import { formatMapName } from '@/app/page';
import { RankBandTakeover, RankDeltaBadge, type RankChangeEvent } from '@/components/RankChangeOverlay';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

// --- Types (mirror services/api/server.js buildDashboardPayload) ---
interface AdaptationDetail {
  occurrences: number;
  no_visible_reaction_within_3s_pct: number;
  avg_reaction_time_seconds: number | null;
}
interface FactSummary {
  economy: { rounds_tracked: number; buy_decisions_against_team_economy_pct: number } | null;
  utility: {
    total_throws: number; flashbangs_thrown: number; team_flash_count: number; team_flash_pct: number | null;
    flash_assist_count: number; avg_enemies_blinded_per_flash: number | null; avg_damage_per_he_or_molotov: number | null;
  } | null;
  adaptation: Record<string, AdaptationDetail> | null;
  positioning: {
    isolated_commitments: number; died_pct: number; survived_pct: number;
    of_deaths_teammate_was_in_trade_range_pct: number | null; of_deaths_actually_traded_pct: number | null;
    survived_or_tradeable_pct: number;
  } | null;
  duels: {
    engagements_tracked: number; won: number; lost: number;
    avg_angle_deviation_deg_when_won: number | null; avg_angle_deviation_deg_when_lost: number | null;
    avg_angle_deviation_deg_overall: number | null; avg_time_to_damage_seconds_when_won: number | null;
  } | null;
  engage: {
    outnumbered_moments: number; chose_to_engage_pct: number;
    round_win_pct_when_engaged: number | null; survived_pct_when_disengaged: number | null;
  } | null;
}
interface MapBreakdownRow { map: string; games: number; avg_kd: number; avg_adr: number; avg_hs_pct: number; avg_performance: number }
interface TrendPoint { match_id: string; map: string | null; reaction_pct?: number; good_decision_pct?: number }
interface DashboardPayload {
  matchesTracked: number;
  rankNew: number | null;
  rankTypeId: number | null;
  factSummary: FactSummary;
  categoryScores: Record<string, number>;
  mapBreakdown: MapBreakdownRow[];
  trends: { reaction: TrendPoint[]; positioning: TrendPoint[] };
  loadoutMix: Record<string, number>;
}

// Same real, current (2026) Premier CS Rating bands used server-side for the AI Coach's tone.
const RANK_BANDS = [
  { max: 4999, label: 'Grey', color: '#9ca3af' },
  { max: 9999, label: 'Light Blue', color: '#7dd3fc' },
  { max: 14999, label: 'Blue', color: '#60a5fa' },
  { max: 19999, label: 'Purple', color: '#a78bfa' },
  { max: 24999, label: 'Pink', color: '#f472b6' },
  { max: 29999, label: 'Red', color: '#ef4444' },
  { max: Infinity, label: 'Gold', color: '#fbbf24' },
];
function rankBand(rankNew: number | null) {
  if (rankNew === null || rankNew === undefined) return null;
  return RANK_BANDS.find((b) => rankNew <= b.max) || RANK_BANDS[RANK_BANDS.length - 1];
}
function rankBandIndex(rankNew: number): number {
  const idx = RANK_BANDS.findIndex((b) => rankNew <= b.max);
  return idx === -1 ? RANK_BANDS.length - 1 : idx;
}
const LAST_KNOWN_RANK_KEY = 'roundsync_last_known_rank';

const CATEGORY_META: Record<string, { label: string; askPrompt: string }> = {
  economic_discipline: { label: 'Economic Discipline', askPrompt: 'Which rounds was I buying against my team\'s economy?' },
  utility_iq: { label: 'Utility IQ', askPrompt: 'Which of my flashbangs blinded my own team?' },
  awareness: { label: 'Awareness', askPrompt: 'When do I react slowest to new information?' },
  trade_discipline: { label: 'Trade Discipline', askPrompt: 'Which isolated pushes got me killed with no trade nearby?' },
  aim_placement: { label: 'Aim Placement', askPrompt: 'How is my crosshair placement compared to my rank?' },
  engage_iq: { label: 'Engage IQ', askPrompt: 'Am I engaging too often when I\'m outnumbered?' },
};
const CATEGORY_ORDER = ['economic_discipline', 'utility_iq', 'awareness', 'trade_discipline', 'aim_placement', 'engage_iq'];

const TRIGGER_LABELS: Record<string, string> = {
  teammate_death: 'Teammate died',
  bomb_plant: 'Bomb planted',
  enemy_audible_movement: 'Heard footsteps',
};
const TRIGGER_COLORS = ['var(--series-cyan)', 'var(--series-violet)', 'var(--series-amber)'];

const LOADOUT_ORDER = ['full_buy', 'half_buy', 'force_buy', 'eco', 'carried_over'];
const LOADOUT_LABELS: Record<string, string> = {
  full_buy: 'Full buy', half_buy: 'Half buy', force_buy: 'Force buy', eco: 'Eco', carried_over: 'Carried over',
};
const LOADOUT_COLORS: Record<string, string> = {
  full_buy: 'var(--series-cyan)', half_buy: 'var(--series-violet)', force_buy: 'var(--series-rose)',
  eco: 'var(--series-amber)', carried_over: 'var(--edge-bright)',
};

function useCountUp(target: number, active: boolean, durationMs = 900) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (!active) return;
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / durationMs);
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(Math.round(target * eased));
      if (progress < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, target, durationMs]);
  return value;
}

function ScoreBar({ label, value, delayMs, onAsk }: { label: string; value: number; delayMs: number; onAsk: () => void }) {
  const [filled, setFilled] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setFilled(true), delayMs);
    return () => clearTimeout(t);
  }, [delayMs]);
  const displayed = useCountUp(value, filled, 900);
  const color = value < 50 ? 'var(--amber)' : 'var(--cyan)';
  return (
    <button type="button" onClick={onAsk} className="w-full text-left group">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-sm font-medium text-[var(--text)] group-hover:text-[var(--cyan)] transition-colors">{label}</span>
        <span className="font-tel text-sm font-bold" style={{ color }}>
          {displayed}<span className="text-[var(--text-dim)] font-normal">/100</span>
        </span>
      </div>
      <div className="h-2.5 rounded-full bg-[var(--panel-raised)] border border-[var(--edge)] overflow-hidden">
        <div
          className="h-full rounded-full transition-all ease-out"
          style={{ width: filled ? `${value}%` : '0%', background: color, transitionDuration: '1100ms' }}
        />
      </div>
    </button>
  );
}

function EmptyCard({ label }: { label: string }) {
  return (
    <div className="text-sm text-[var(--text-dim)] py-6 text-center">
      No {label} data yet — this fills in as your next matches sync.
    </div>
  );
}

function AskCoachChip({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="mt-3 inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border border-[var(--edge)] bg-[var(--panel-raised)] text-[var(--text-dim)] hover:border-[var(--cyan-dim)] hover:text-[var(--cyan)] transition-colors"
    >
      <MessageCircleQuestion className="w-3.5 h-3.5" /> Ask the coach about this
    </button>
  );
}

function EmphasisBar({ goodLabel, goodValue, badLabel, badValue }: { goodLabel: string; goodValue: number; badLabel: string; badValue: number }) {
  return (
    <div>
      <div className="flex justify-between text-xs text-[var(--text-dim)] mb-1.5">
        <span>{goodLabel}</span><span>{badLabel}</span>
      </div>
      <div className="flex h-3 rounded-full overflow-hidden border border-[var(--edge)]">
        <div className="bg-[var(--cyan)] transition-all duration-1000" style={{ width: `${goodValue}%` }} />
        <div className="bg-[var(--edge-bright)] transition-all duration-1000" style={{ width: `${badValue}%` }} />
      </div>
      <div className="flex justify-between font-tel text-sm font-bold mt-1.5">
        <span className="text-[var(--cyan)]">{goodValue}%</span><span className="text-[var(--text-dim)]">{badValue}%</span>
      </div>
    </div>
  );
}

function StatTile({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="bg-[var(--panel-raised)] border border-[var(--edge)] rounded-xl p-4">
      <p className="text-[10px] uppercase tracking-wider text-[var(--text-dim)] mb-1.5">{label}</p>
      <p className={`font-tel text-xl font-bold ${accent ? 'text-[var(--cyan)]' : 'text-[var(--text)]'}`}>{value}</p>
    </div>
  );
}

function LoadoutMixBar({ mix }: { mix: Record<string, number> }) {
  const total = Object.values(mix).reduce((a, b) => a + b, 0);
  if (total === 0) return <EmptyCard label="economy" />;
  const entries = LOADOUT_ORDER.filter((k) => mix[k]).map((k) => [k, mix[k]] as const);
  return (
    <div>
      <div className="flex h-4 rounded-full overflow-hidden border border-[var(--edge)] mb-3">
        {entries.map(([key, count]) => (
          <div key={key} style={{ width: `${(count / total) * 100}%`, background: LOADOUT_COLORS[key] }} title={`${LOADOUT_LABELS[key]}: ${count}`} />
        ))}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs">
        {entries.map(([key, count]) => (
          <div key={key} className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: LOADOUT_COLORS[key] }} />
            <span className="text-[var(--text-dim)]">{LOADOUT_LABELS[key]}</span>
            <span className="font-tel font-semibold">{count}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ReactionByTriggerChart({ adaptation }: { adaptation: Record<string, AdaptationDetail> }) {
  const data = Object.entries(adaptation).map(([type, d]) => ({
    name: TRIGGER_LABELS[type] || type,
    reacted_pct: Math.round(100 - d.no_visible_reaction_within_3s_pct),
  }));
  return (
    <div className="h-48">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ left: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1c242e" horizontal={false} />
          <XAxis type="number" domain={[0, 100]} stroke="#8592a1" tick={{ fontSize: 11 }} />
          <YAxis type="category" dataKey="name" stroke="#8592a1" width={110} tick={{ fontSize: 11 }} />
          <Tooltip contentStyle={{ backgroundColor: '#0c1015', borderColor: '#2a3644' }} formatter={(v: any) => [`${v}%`, 'Reacted within 3s']} />
          <Bar dataKey="reacted_pct" radius={[0, 4, 4, 0]}>
            {data.map((_, i) => <Cell key={i} fill={TRIGGER_COLORS[i % TRIGGER_COLORS.length]} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function TrendChart({ data, dataKey, color, label }: { data: TrendPoint[]; dataKey: 'reaction_pct' | 'good_decision_pct'; color: string; label: string }) {
  if (data.length < 2) return <EmptyCard label="trend" />;
  return (
    <div className="h-48">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1c242e" />
          <XAxis dataKey="map" stroke="#8592a1" tick={false} />
          <YAxis stroke="#8592a1" domain={[0, 100]} tick={{ fontSize: 11 }} />
          <Tooltip
            contentStyle={{ backgroundColor: '#0c1015', borderColor: '#2a3644' }}
            formatter={(v: any) => [`${v}%`, label]}
            labelFormatter={(_, payload) => (payload?.[0]?.payload?.map ? formatMapName(payload[0].payload.map) : '')}
          />
          <Line type="monotone" dataKey={dataKey} stroke={color} strokeWidth={3} dot={{ r: 3 }} activeDot={{ r: 7 }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function MapHeatmap({ rows }: { rows: MapBreakdownRow[] }) {
  if (rows.length === 0) return <EmptyCard label="map" />;
  const metrics: { key: keyof MapBreakdownRow; label: string; suffix?: string }[] = [
    { key: 'avg_kd', label: 'K/D' },
    { key: 'avg_adr', label: 'ADR' },
    { key: 'avg_hs_pct', label: 'HS%', suffix: '%' },
    { key: 'avg_performance', label: 'Perf' },
  ];
  const maxByMetric: Record<string, number> = {};
  metrics.forEach((m) => {
    maxByMetric[m.key] = Math.max(...rows.map((r) => Number(r[m.key]) || 0), 0.001);
  });
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm border-separate border-spacing-1">
        <thead>
          <tr>
            <th className="text-left text-xs text-[var(--text-dim)] font-medium px-2 pb-1">Map</th>
            {metrics.map((m) => <th key={m.key} className="text-xs text-[var(--text-dim)] font-medium pb-1">{m.label}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.map}>
              <td className="text-sm font-medium px-2 py-1.5 whitespace-nowrap">
                {formatMapName(r.map)} <span className="text-[var(--text-dim)] text-xs">({r.games})</span>
              </td>
              {metrics.map((m) => {
                const val = Number(r[m.key]) || 0;
                const intensity = Math.min(1, val / maxByMetric[m.key]);
                return (
                  <td
                    key={m.key}
                    className="text-center rounded-lg font-tel text-sm font-semibold py-1.5"
                    style={{ background: `rgba(8, 145, 178, ${0.12 + intensity * 0.55})` }}
                  >
                    {val}{m.suffix || ''}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

type SubTab = 'overview' | 'aim' | 'decisions' | 'resources';

const SUB_TABS: { key: SubTab; label: string; icon: React.ElementType }[] = [
  { key: 'overview', label: 'Overview', icon: Sparkles },
  { key: 'aim', label: 'Aim & Reaction', icon: Crosshair },
  { key: 'decisions', label: 'Decision-Making', icon: Users },
  { key: 'resources', label: 'Economy & Utility', icon: Coins },
];

export function InsightsDashboard({ jwtToken, onAskCoach }: { jwtToken: string; onAskCoach: (question: string) => void }) {
  const [data, setData] = useState<DashboardPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [subTab, setSubTab] = useState<SubTab>('overview');
  const [rankChangeEvent, setRankChangeEvent] = useState<RankChangeEvent | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/api/stats/dashboard`, {
          headers: { Authorization: `Bearer ${jwtToken}` },
        });
        const json = await response.json();
        if (!cancelled) setData(json);
      } catch (err) {
        console.error('Error fetching dashboard stats:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [jwtToken]);

  // Detects a real rank change since the last time this player loaded Insights (tracked
  // per-browser via localStorage, not a server-side history table — this is purely a
  // presentation flourish, not data the rest of the app depends on). Fires the full-screen
  // takeover only when the player crossed into a different Premier band; a same-band move
  // gets the small inline badge instead.
  useEffect(() => {
    if (!data || data.rankNew === null || data.rankNew === undefined) return;
    let stored: string | null = null;
    try {
      stored = localStorage.getItem(LAST_KNOWN_RANK_KEY);
    } catch {
      return;
    }
    const prevRank = stored !== null ? parseInt(stored, 10) : null;
    if (prevRank !== null && !Number.isNaN(prevRank) && prevRank !== data.rankNew) {
      const prevBandIdx = rankBandIndex(prevRank);
      const newBandIdx = rankBandIndex(data.rankNew);
      setRankChangeEvent({
        direction: data.rankNew > prevRank ? 'up' : 'down',
        crossedBand: prevBandIdx !== newBandIdx,
        prevRank,
        newRank: data.rankNew,
        prevBandLabel: RANK_BANDS[prevBandIdx].label,
        newBandLabel: RANK_BANDS[newBandIdx].label,
        prevBandColor: RANK_BANDS[prevBandIdx].color,
        newBandColor: RANK_BANDS[newBandIdx].color,
      });
    }
    try {
      localStorage.setItem(LAST_KNOWN_RANK_KEY, String(data.rankNew));
    } catch {
      // best-effort only — a private window or cleared storage just means no celebration next time
    }
  }, [data]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[50vh] text-[var(--text-dim)] gap-3">
        <Loader2 className="w-6 h-6 animate-spin" /> Building your insights...
      </div>
    );
  }
  if (!data) {
    return <div className="max-w-3xl mx-auto px-6 py-16 text-center text-[var(--text-dim)]">Couldn't load your insights right now.</div>;
  }

  const band = rankBand(data.rankNew);
  const { factSummary } = data;

  return (
    <div className="max-w-7xl mx-auto px-6 py-10 space-y-8">
      {rankChangeEvent && rankChangeEvent.crossedBand && (
        <RankBandTakeover event={rankChangeEvent} onDone={() => setRankChangeEvent(null)} />
      )}

      {/* Hero: rank + headline */}
      <div className="hud-corners glass border border-[var(--edge)] rounded-2xl p-6 flex flex-wrap items-center justify-between gap-4 card-in">
        <div>
          <h2 className="font-display text-2xl font-bold mb-1">Decision Quality Snapshot</h2>
          <p className="text-xs text-[var(--text-dim)]">
            An early scoring convention built from your own {data.matchesTracked} tracked games — not a population benchmark.
          </p>
        </div>
        {band && (
          <div className="flex items-center gap-2 px-4 py-2 rounded-full border border-[var(--edge)]" style={{ borderColor: band.color + '55' }}>
            <span className="w-2.5 h-2.5 rounded-full" style={{ background: band.color }} />
            <span className="text-sm font-semibold">{band.label} · {data.rankNew?.toLocaleString()} CS Rating</span>
            {rankChangeEvent && !rankChangeEvent.crossedBand && <RankDeltaBadge event={rankChangeEvent} />}
          </div>
        )}
      </div>

      {/* Sub-nav */}
      <div className="flex flex-wrap gap-1 bg-[var(--panel)]/60 border border-[var(--edge)] rounded-full p-1 w-fit">
        {SUB_TABS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setSubTab(key)}
            className={`flex items-center gap-2 px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
              subTab === key ? 'bg-[var(--cyan)] text-[#03141a]' : 'text-[var(--text-dim)] hover:text-[var(--text)]'
            }`}
          >
            <Icon className="w-4 h-4" /> {label}
          </button>
        ))}
      </div>

      {subTab === 'overview' && (
        <div className="space-y-6">
          <div className="hud-corners bg-[var(--panel)] border border-[var(--edge)] rounded-2xl p-6 card-in" style={{ animationDelay: '80ms' }}>
            <h3 className="font-display font-bold text-lg mb-5">Category Scores</h3>
            {CATEGORY_ORDER.some((k) => data.categoryScores[k] !== undefined) ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-5">
                {CATEGORY_ORDER.filter((k) => data.categoryScores[k] !== undefined).map((key, i) => (
                  <ScoreBar
                    key={key}
                    label={CATEGORY_META[key].label}
                    value={data.categoryScores[key]}
                    delayMs={150 + i * 80}
                    onAsk={() => onAskCoach(CATEGORY_META[key].askPrompt)}
                  />
                ))}
              </div>
            ) : (
              <EmptyCard label="category score" />
            )}
          </div>

          <div className="hud-corners bg-[var(--panel)] border border-[var(--edge)] rounded-2xl p-6 card-in" style={{ animationDelay: '160ms' }}>
            <h3 className="font-display font-bold text-lg mb-4">Performance by Map</h3>
            <MapHeatmap rows={data.mapBreakdown} />
          </div>
        </div>
      )}

      {subTab === 'aim' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="hud-corners bg-[var(--panel)] border border-[var(--edge)] rounded-2xl p-6 card-in">
            <div className="flex items-center gap-2 mb-4">
              <Crosshair className="w-4 h-4 text-[var(--cyan)]" />
              <h3 className="font-display font-bold text-lg">Crosshair Placement</h3>
            </div>
            {factSummary.duels ? (
              <>
                <div className="grid grid-cols-2 gap-3 mb-4">
                  <StatTile label="Avg. deviation (won)" value={`${factSummary.duels.avg_angle_deviation_deg_when_won ?? '—'}°`} accent />
                  <StatTile label="Avg. deviation (lost)" value={`${factSummary.duels.avg_angle_deviation_deg_when_lost ?? '—'}°`} />
                  <StatTile label="Engagements" value={`${factSummary.duels.engagements_tracked}`} />
                  <StatTile label="Time to damage (won)" value={factSummary.duels.avg_time_to_damage_seconds_when_won !== null ? `${factSummary.duels.avg_time_to_damage_seconds_when_won}s` : '—'} />
                </div>
                <p className="text-xs text-[var(--text-dim)]">Smaller deviation = your crosshair was already closer to the enemy the instant you fired.</p>
                <AskCoachChip onClick={() => onAskCoach('Why is my crosshair placement worse when I lose a duel?')} />
              </>
            ) : <EmptyCard label="aim" />}
          </div>

          <div className="hud-corners bg-[var(--panel)] border border-[var(--edge)] rounded-2xl p-6 card-in" style={{ animationDelay: '80ms' }}>
            <div className="flex items-center gap-2 mb-4">
              <Ear className="w-4 h-4 text-[var(--cyan)]" />
              <h3 className="font-display font-bold text-lg">Reaction to Information</h3>
            </div>
            {factSummary.adaptation ? (
              <>
                <ReactionByTriggerChart adaptation={factSummary.adaptation} />
                <AskCoachChip onClick={() => onAskCoach('Which trigger type do I react to slowest — deaths, plants, or footsteps?')} />
              </>
            ) : <EmptyCard label="reaction" />}
          </div>

          <div className="hud-corners bg-[var(--panel)] border border-[var(--edge)] rounded-2xl p-6 lg:col-span-2 card-in" style={{ animationDelay: '160ms' }}>
            <h3 className="font-display font-bold text-lg mb-4">Reaction Rate Over Time</h3>
            <TrendChart data={data.trends.reaction} dataKey="reaction_pct" color="#22d3ee" label="Reacted within 3s" />
          </div>
        </div>
      )}

      {subTab === 'decisions' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="hud-corners bg-[var(--panel)] border border-[var(--edge)] rounded-2xl p-6 card-in">
            <div className="flex items-center gap-2 mb-4">
              <MapPinned className="w-4 h-4 text-[var(--cyan)]" />
              <h3 className="font-display font-bold text-lg">Isolated Pushes</h3>
            </div>
            {factSummary.positioning ? (
              <>
                <EmphasisBar goodLabel="Survived" goodValue={factSummary.positioning.survived_pct} badLabel="Died" badValue={factSummary.positioning.died_pct} />
                <div className="grid grid-cols-2 gap-3 mt-4">
                  <StatTile label="Isolated pushes" value={`${factSummary.positioning.isolated_commitments}`} />
                  <StatTile label="Deaths that were tradeable" value={factSummary.positioning.of_deaths_teammate_was_in_trade_range_pct !== null ? `${factSummary.positioning.of_deaths_teammate_was_in_trade_range_pct}%` : '—'} />
                </div>
                <AskCoachChip onClick={() => onAskCoach('Which of my isolated pushes had no teammate nearby to trade?')} />
              </>
            ) : <EmptyCard label="positioning" />}
          </div>

          <div className="hud-corners bg-[var(--panel)] border border-[var(--edge)] rounded-2xl p-6 card-in" style={{ animationDelay: '80ms' }}>
            <div className="flex items-center gap-2 mb-4">
              <Users className="w-4 h-4 text-[var(--cyan)]" />
              <h3 className="font-display font-bold text-lg">Engage vs. Save</h3>
            </div>
            {factSummary.engage ? (
              <>
                <div className="grid grid-cols-2 gap-3 mb-4">
                  <StatTile label="Outnumbered moments" value={`${factSummary.engage.outnumbered_moments}`} />
                  <StatTile label="Chose to engage" value={`${factSummary.engage.chose_to_engage_pct}%`} />
                  <StatTile label="Round win % (engaged)" value={factSummary.engage.round_win_pct_when_engaged !== null ? `${factSummary.engage.round_win_pct_when_engaged}%` : '—'} accent />
                  <StatTile label="Survived (disengaged)" value={factSummary.engage.survived_pct_when_disengaged !== null ? `${factSummary.engage.survived_pct_when_disengaged}%` : '—'} accent />
                </div>
                <AskCoachChip onClick={() => onAskCoach('Should I have engaged or saved when I was last outnumbered?')} />
              </>
            ) : <EmptyCard label="engage-decision" />}
          </div>

          <div className="hud-corners bg-[var(--panel)] border border-[var(--edge)] rounded-2xl p-6 lg:col-span-2 card-in" style={{ animationDelay: '160ms' }}>
            <h3 className="font-display font-bold text-lg mb-4">Positioning Decisions Over Time</h3>
            <TrendChart data={data.trends.positioning} dataKey="good_decision_pct" color="#fb923c" label="Survived or tradeable" />
          </div>
        </div>
      )}

      {subTab === 'resources' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="hud-corners bg-[var(--panel)] border border-[var(--edge)] rounded-2xl p-6 card-in">
            <div className="flex items-center gap-2 mb-4">
              <Coins className="w-4 h-4 text-[var(--cyan)]" />
              <h3 className="font-display font-bold text-lg">Buy Decisions</h3>
            </div>
            <LoadoutMixBar mix={data.loadoutMix} />
            {factSummary.economy && (
              <div className="grid grid-cols-2 gap-3 mt-4">
                <StatTile label="Rounds tracked" value={`${factSummary.economy.rounds_tracked}`} />
                <StatTile label="Against team economy" value={`${factSummary.economy.buy_decisions_against_team_economy_pct}%`} />
              </div>
            )}
            <AskCoachChip onClick={() => onAskCoach('Which rounds did I buy against my team\'s economy?')} />
          </div>

          <div className="hud-corners bg-[var(--panel)] border border-[var(--edge)] rounded-2xl p-6 card-in" style={{ animationDelay: '80ms' }}>
            <div className="flex items-center gap-2 mb-4">
              <Flame className="w-4 h-4 text-[var(--cyan)]" />
              <h3 className="font-display font-bold text-lg">Utility Effectiveness</h3>
            </div>
            {factSummary.utility ? (
              <>
                <EmphasisBar
                  goodLabel="Enemy-blinding flashes"
                  goodValue={Math.round(100 - (factSummary.utility.team_flash_pct || 0))}
                  badLabel="Team-flashes"
                  badValue={Math.round(factSummary.utility.team_flash_pct || 0)}
                />
                <div className="grid grid-cols-2 gap-3 mt-4">
                  <StatTile label="Flash assists" value={`${factSummary.utility.flash_assist_count}`} accent />
                  <StatTile label="Avg. HE/molotov dmg" value={factSummary.utility.avg_damage_per_he_or_molotov !== null ? `${factSummary.utility.avg_damage_per_he_or_molotov}` : '—'} />
                </div>
                <AskCoachChip onClick={() => onAskCoach('Which of my flashbangs blinded my own team?')} />
              </>
            ) : <EmptyCard label="utility" />}
          </div>
        </div>
      )}
    </div>
  );
}
