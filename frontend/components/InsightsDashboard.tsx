'use client';

import React, { useEffect, useState, CSSProperties } from 'react';
import { ResponsiveContainer, LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Cell } from 'recharts';
import {
  Loader2, Coins, Flame, Ear, Users, MapPinned, Crosshair, MessageCircleQuestion,
} from 'lucide-react';
import { formatMapName, mapScreenshotUrl } from '@/app/page';
import { shadeHex, Bar3DShape, ctTAccent, hexToRgba, duelLerp } from '@/lib/duelColors';

// Every panel on this page picks up one flat "duel" color from which side of the page it
// sits on (left = CT cyan, right = T amber, full-width = neutral grey) — and everything
// inside that panel (stat tiles, bars, chart lines) inherits that same color, the same way
// the Home dashboard's tiles do. Not a per-category palette.
const SIDE_LEFT = ctTAccent(0, 2);
const SIDE_RIGHT = ctTAccent(1, 2);
const SIDE_CENTER = ctTAccent(0, 1);

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

const LOADOUT_ORDER = ['full_buy', 'half_buy', 'force_buy', 'eco', 'carried_over'];
const LOADOUT_LABELS: Record<string, string> = {
  full_buy: 'Full buy', half_buy: 'Half buy', force_buy: 'Force buy', eco: 'Eco', carried_over: 'Carried over',
};

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

function EmphasisBar({ goodLabel, goodValue, badLabel, badValue, color }: { goodLabel: string; goodValue: number; badLabel: string; badValue: number; color: string }) {
  return (
    <div>
      <div className="flex justify-between text-xs text-[var(--text-dim)] mb-1.5">
        <span>{goodLabel}</span><span>{badLabel}</span>
      </div>
      <div className="flex h-3.5 rounded-full overflow-hidden border border-[var(--edge)] shadow-[inset_0_1px_3px_rgba(0,0,0,0.5)]">
        <div className="bar3d-h transition-all duration-1000" style={{ '--c': color, width: `${goodValue}%` } as CSSProperties} />
        <div className="bar3d-h transition-all duration-1000" style={{ '--c': 'var(--edge-bright)', width: `${badValue}%` } as CSSProperties} />
      </div>
      <div className="flex justify-between font-tel text-sm font-bold mt-1.5">
        <span style={{ color }}>{goodValue}%</span><span className="text-[var(--text-dim)]">{badValue}%</span>
      </div>
    </div>
  );
}

// Every stat tile is a bold embossed "chip" colored by whichever side of the page its
// panel sits on — same treatment as the Home dashboard's KPI tiles.
function StatTile({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="chip3d border border-[var(--edge)] rounded-xl p-4 text-center" style={{ '--c': color } as CSSProperties}>
      <p className="text-[10px] uppercase tracking-wider text-[var(--text-dim)] mb-1.5">{label}</p>
      <p className="font-tel text-xl font-bold" style={{ color }}>{value}</p>
    </div>
  );
}

function LoadoutMixBar({ mix, color }: { mix: Record<string, number>; color: string }) {
  const total = Object.values(mix).reduce((a, b) => a + b, 0);
  if (total === 0) return <EmptyCard label="economy" />;
  const entries = LOADOUT_ORDER.filter((k) => mix[k]).map((k) => [k, mix[k]] as const);
  // Segments share the panel's one side color, shaded lighter/darker per segment so the
  // mix is still legible without introducing a separate, unrelated hue per category. Wide
  // shade spread + a hard divider between segments — a narrow spread with only the soft
  // top-lit 3D bevel to separate segments read as one solid blended bar, not five.
  const shades = [0.65, 0.2, -0.3, -0.55, -0.75];
  return (
    <div>
      <div className="flex h-5 rounded-full overflow-hidden border border-[var(--edge)] mb-3 shadow-[inset_0_1px_3px_rgba(0,0,0,0.5)]">
        {entries.map(([key, count], i) => (
          <div
            key={key}
            className="bar3d-h"
            style={{
              '--c': shadeHex(color, shades[i % shades.length]),
              width: `${(count / total) * 100}%`,
              borderRight: i < entries.length - 1 ? '2px solid rgba(0,0,0,0.55)' : undefined,
            } as CSSProperties}
            title={`${LOADOUT_LABELS[key]}: ${count}`}
          />
        ))}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs">
        {entries.map(([key, count], i) => (
          <div key={key} className="flex items-center gap-1.5">
            <span className="sphere3d w-2.5 h-2.5 rounded-full shrink-0" style={{ '--c': shadeHex(color, shades[i % shades.length]) } as CSSProperties} />
            <span className="text-[var(--text-dim)]">{LOADOUT_LABELS[key]}</span>
            <span className="font-tel font-semibold">{count}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ReactionByTriggerChart({ adaptation, color }: { adaptation: Record<string, AdaptationDetail>; color: string }) {
  const data = Object.entries(adaptation).map(([type, d]) => ({
    name: TRIGGER_LABELS[type] || type,
    reacted_pct: Math.round(100 - d.no_visible_reaction_within_3s_pct),
  }));
  // Same shading approach as the loadout mix — each bar is a shade of the panel's one
  // side color, not an unrelated per-trigger hue.
  const shades = [0.3, -0.05, -0.4];
  return (
    <div className="h-48">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ left: 8 }}>
          <defs>
            <filter id="reaction-bar-shadow" x="-20%" y="-40%" width="140%" height="220%">
              <feDropShadow dx="2" dy="2" stdDeviation="1.6" floodColor="#000000" floodOpacity="0.4" />
            </filter>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#1c242e" horizontal={false} />
          <XAxis type="number" domain={[0, 100]} stroke="#8592a1" tick={{ fontSize: 11 }} />
          <YAxis type="category" dataKey="name" stroke="#8592a1" width={110} tick={{ fontSize: 11 }} />
          <Tooltip contentStyle={{ backgroundColor: '#0c1015', borderColor: '#2a3644' }} formatter={(v: any) => [`${v}%`, 'Reacted within 3s']} />
          <Bar dataKey="reacted_pct" style={{ filter: 'url(#reaction-bar-shadow)' }} shape={(p: any) => <Bar3DShape {...p} baseColor={p.fill} />}>
            {data.map((_, i) => <Cell key={i} fill={shadeHex(color, shades[i % shades.length])} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// These two trend charts always live in a full-width, both-columns panel, so — like the
// Home dashboard's own trend charts — they sweep the full CT cyan → grey → T amber range
// across their own width rather than sitting at one flat "side" color.
function TrendChart({ data, dataKey, label }: { data: TrendPoint[]; dataKey: 'reaction_pct' | 'good_decision_pct'; label: string }) {
  if (data.length < 2) return <EmptyCard label="trend" />;
  return (
    <div className="h-48">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data}>
          <defs>
            <linearGradient id={`trend-line-${dataKey}`} x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor={duelLerp(0)} />
              <stop offset="50%" stopColor={duelLerp(0.5)} />
              <stop offset="100%" stopColor={duelLerp(1)} />
            </linearGradient>
            <filter id={`trend-glow-${dataKey}`} x="-30%" y="-60%" width="160%" height="220%">
              <feDropShadow dx="0" dy="2.5" stdDeviation="2.2" floodColor={duelLerp(0.5)} floodOpacity="0.4" />
            </filter>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#1c242e" />
          <XAxis dataKey="map" stroke="#8592a1" tick={false} />
          <YAxis stroke="#8592a1" domain={[0, 100]} tick={{ fontSize: 11 }} />
          <Tooltip
            contentStyle={{ backgroundColor: '#0c1015', borderColor: '#2a3644' }}
            formatter={(v: any) => [`${v}%`, label]}
            labelFormatter={(_, payload) => (payload?.[0]?.payload?.map ? formatMapName(payload[0].payload.map) : '')}
          />
          <Line
            type="monotone"
            dataKey={dataKey}
            stroke={`url(#trend-line-${dataKey})`}
            strokeWidth={3.5}
            style={{ filter: `url(#trend-glow-${dataKey})` }}
            dot={(dotProps: any) => {
              const c = duelLerp(data.length > 1 ? dotProps.index / (data.length - 1) : 0.5);
              return <circle key={dotProps.index} cx={dotProps.cx} cy={dotProps.cy} r={3} fill="#fff" stroke={c} strokeWidth={2} />;
            }}
            activeDot={{ r: 7 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

const MAP_ROW_COLUMNS = '84px 1fr repeat(4, 88px)';

// One card per map — a real map thumbnail (falling back to a gradient panel for maps
// without a saved screenshot, same as the Recent Matches/Match History cards), name and
// game count aligned in their own column, and four intensity-shaded metric chips. A plain
// <table> here let cell padding drift row-to-row so the metric columns never quite lined
// up with the map name; a single shared CSS Grid template guarantees every row's columns
// share the exact same edges.
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
  const sorted = [...rows].sort((a, b) => b.games - a.games);
  // The metric columns only occupy the right two-thirds of each row (the thumbnail + map
  // name column takes the left third), so they never actually reach the panel's true left
  // edge — scoped to the grey→amber half of the duel range instead of the full cyan→amber
  // sweep, so the leftmost column (K/D) reads neutral grey rather than a jarring pure cyan
  // that has no matching blue content anywhere near it. Each cell's own value still shades
  // that column's hue by intensity, same as the old single-hue heatmap did.
  const columnColors = metrics.map((_, i) => duelLerp(0.5 + (i / (metrics.length - 1)) * 0.5));

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[620px]">
        <div className="grid items-center gap-3 px-1 pb-2" style={{ gridTemplateColumns: MAP_ROW_COLUMNS }}>
          <div />
          <div className="text-xs text-[var(--text-dim)] font-medium">Map</div>
          {metrics.map((m) => (
            <div key={m.key} className="text-xs text-[var(--text-dim)] font-medium text-center">{m.label}</div>
          ))}
        </div>

        <div className="flex flex-col gap-2">
          {sorted.map((r) => {
            const bg = mapScreenshotUrl(r.map);
            return (
              <div
                key={r.map}
                className="grid items-center gap-3 border border-[var(--edge)] rounded-xl p-2"
                style={{
                  gridTemplateColumns: MAP_ROW_COLUMNS,
                  backgroundColor: 'var(--panel-raised)',
                  backgroundImage: `linear-gradient(90deg, ${hexToRgba(duelLerp(0), 0.16)} 0%, ${hexToRgba(duelLerp(0.5), 0.04)} 50%, ${hexToRgba(duelLerp(1), 0.16)} 100%)`,
                }}
              >
                <div className="relative w-[76px] h-[52px] rounded-lg overflow-hidden shrink-0 border border-[var(--edge)]">
                  {bg ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={bg} alt="" className="absolute inset-0 w-full h-full object-cover" />
                  ) : (
                    <div className="absolute inset-0 bg-gradient-to-br from-[var(--panel-raised)] to-[var(--void)]" />
                  )}
                </div>
                <div className="min-w-0">
                  <p className="font-display font-bold text-sm truncate">{formatMapName(r.map)}</p>
                  <p className="text-[11px] text-[var(--text-dim)]">{r.games} game{r.games === 1 ? '' : 's'}</p>
                </div>
                {metrics.map((m, colIndex) => {
                  const val = Number(r[m.key]) || 0;
                  const intensity = Math.min(1, val / maxByMetric[m.key]);
                  return (
                    <div
                      key={m.key}
                      className="text-center rounded-lg font-tel text-sm font-semibold py-2.5"
                      style={{
                        background: hexToRgba(columnColors[colIndex], 0.12 + intensity * 0.55),
                        boxShadow: `inset 0 1px 0 rgba(255,255,255,${0.06 + intensity * 0.1}), inset 0 -3px 6px rgba(0,0,0,0.35), 0 2px 4px rgba(0,0,0,0.3)`,
                      }}
                    >
                      {val}{m.suffix || ''}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

type SubTab = 'aim' | 'decisions' | 'resources' | 'maps';

const SUB_TABS: { key: SubTab; label: string; icon: React.ElementType }[] = [
  { key: 'aim', label: 'Aim & Reaction', icon: Crosshair },
  { key: 'decisions', label: 'Decision-Making', icon: Users },
  { key: 'resources', label: 'Economy & Utility', icon: Coins },
  { key: 'maps', label: 'Performance by Map', icon: MapPinned },
];

// Always-visible pill tab bar — replaces a hidden dropdown so every category is one
// click away instead of two, matching the segmented-control pattern the top nav uses.
function CategoryTabs({ value, onChange }: { value: SubTab; onChange: (v: SubTab) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {SUB_TABS.map(({ key, label, icon: Icon }) => (
        <button
          key={key}
          type="button"
          onClick={() => onChange(key)}
          className={`flex items-center gap-2 pl-4 pr-4 py-2.5 rounded-xl border font-display font-bold text-sm transition-colors ${
            key === value
              ? 'border-[var(--cyan)] bg-[var(--panel-raised)] text-[var(--cyan)]'
              : 'border-[var(--edge)] bg-[var(--panel)] text-[var(--text-dim)] hover:border-[var(--cyan-dim)] hover:text-[var(--text)]'
          }`}
        >
          <Icon className="w-4 h-4" /> {label}
        </button>
      ))}
    </div>
  );
}

export function InsightsDashboard({ jwtToken, onAskCoach }: { jwtToken: string; onAskCoach: (question: string) => void }) {
  const [data, setData] = useState<DashboardPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [subTab, setSubTab] = useState<SubTab>('aim');

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

  const { factSummary } = data;
  const hasScores = CATEGORY_ORDER.some((k) => data.categoryScores[k] !== undefined);

  return (
    <div className="max-w-7xl mx-auto px-6 py-10 space-y-6">
      {/* Compact score strip — the one thing unique to Insights vs. Home's raw match stats:
          the synthesized decision-quality scores, not another copy of K/D/ADR/HS. Colored
          by each tile's position in the row (left = CT cyan, right = T amber), the same
          "duel" rule every KPI tile on the app uses now. */}
      {hasScores && (() => {
        const visibleKeys = CATEGORY_ORDER.filter((k) => data.categoryScores[k] !== undefined);
        return (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 card-in">
            {visibleKeys.map((key, i) => {
              const value = data.categoryScores[key];
              const meta = CATEGORY_META[key];
              const color = ctTAccent(i, visibleKeys.length);
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => onAskCoach(meta.askPrompt)}
                  className="chip3d border border-[var(--edge)] rounded-2xl p-3.5 text-center transition-transform hover:-translate-y-0.5"
                  style={{ '--c': color } as CSSProperties}
                >
                  <p className="text-[10px] uppercase tracking-wider text-[var(--text-dim)] mb-1.5 leading-tight">{meta.label}</p>
                  <p className="font-tel text-xl font-extrabold" style={{ color }}>{value}</p>
                </button>
              );
            })}
          </div>
        );
      })()}

      {/* Always-visible category tabs — pick one, see it full screen */}
      <CategoryTabs value={subTab} onChange={setSubTab} />

      {subTab === 'maps' && (
        <div
          className="hud-corners tile3d border border-[var(--edge)] rounded-2xl p-8 card-in"
          style={{
            backgroundColor: 'var(--panel)',
            backgroundImage: `linear-gradient(90deg, ${hexToRgba(duelLerp(0), 0.22)} 0%, ${hexToRgba(duelLerp(0.5), 0.05)} 50%, ${hexToRgba(duelLerp(1), 0.22)} 100%)`,
          }}
        >
          <h3 className="font-display font-bold text-2xl mb-6">Performance by Map</h3>
          <MapHeatmap rows={data.mapBreakdown} />
        </div>
      )}

      {subTab === 'aim' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="hud-corners chip3d border border-[var(--edge)] rounded-2xl p-6 card-in" style={{ '--c': SIDE_LEFT } as CSSProperties}>
            <div className="flex items-center gap-2 mb-4">
              <Crosshair className="w-4 h-4" style={{ color: SIDE_LEFT }} />
              <h3 className="font-display font-bold text-lg">Crosshair Placement</h3>
            </div>
            {factSummary.duels ? (
              <>
                <div className="grid grid-cols-2 gap-3 mb-4">
                  <StatTile label="Avg. deviation (won)" value={`${factSummary.duels.avg_angle_deviation_deg_when_won ?? '—'}°`} color={SIDE_LEFT} />
                  <StatTile label="Avg. deviation (lost)" value={`${factSummary.duels.avg_angle_deviation_deg_when_lost ?? '—'}°`} color={SIDE_LEFT} />
                  <StatTile label="Engagements" value={`${factSummary.duels.engagements_tracked}`} color={SIDE_LEFT} />
                  <StatTile label="Time to damage (won)" value={factSummary.duels.avg_time_to_damage_seconds_when_won !== null ? `${factSummary.duels.avg_time_to_damage_seconds_when_won}s` : '—'} color={SIDE_LEFT} />
                </div>
                <p className="text-xs text-[var(--text-dim)]">Smaller deviation = your crosshair was already closer to the enemy the instant you fired.</p>
                <AskCoachChip onClick={() => onAskCoach('Why is my crosshair placement worse when I lose a duel?')} />
              </>
            ) : <EmptyCard label="aim" />}
          </div>

          <div className="hud-corners chip3d border border-[var(--edge)] rounded-2xl p-6 card-in" style={{ '--c': SIDE_RIGHT, animationDelay: '80ms' } as CSSProperties}>
            <div className="flex items-center gap-2 mb-4">
              <Ear className="w-4 h-4" style={{ color: SIDE_RIGHT }} />
              <h3 className="font-display font-bold text-lg">Reaction to Information</h3>
            </div>
            {factSummary.adaptation ? (
              <>
                <ReactionByTriggerChart adaptation={factSummary.adaptation} color={SIDE_RIGHT} />
                <AskCoachChip onClick={() => onAskCoach('Which trigger type do I react to slowest — deaths, plants, or footsteps?')} />
              </>
            ) : <EmptyCard label="reaction" />}
          </div>

          <div className="hud-corners chip3d border border-[var(--edge)] rounded-2xl p-6 lg:col-span-2 card-in" style={{ '--c': SIDE_CENTER, animationDelay: '160ms' } as CSSProperties}>
            <h3 className="font-display font-bold text-lg mb-4">Reaction Rate Over Time</h3>
            <TrendChart data={data.trends.reaction} dataKey="reaction_pct" label="Reacted within 3s" />
          </div>
        </div>
      )}

      {subTab === 'decisions' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="hud-corners chip3d border border-[var(--edge)] rounded-2xl p-6 card-in" style={{ '--c': SIDE_LEFT } as CSSProperties}>
            <div className="flex items-center gap-2 mb-4">
              <MapPinned className="w-4 h-4" style={{ color: SIDE_LEFT }} />
              <h3 className="font-display font-bold text-lg">Isolated Pushes</h3>
            </div>
            {factSummary.positioning ? (
              <>
                <EmphasisBar goodLabel="Survived" goodValue={factSummary.positioning.survived_pct} badLabel="Died" badValue={factSummary.positioning.died_pct} color={SIDE_LEFT} />
                <div className="grid grid-cols-2 gap-3 mt-4">
                  <StatTile label="Isolated pushes" value={`${factSummary.positioning.isolated_commitments}`} color={SIDE_LEFT} />
                  <StatTile label="Deaths that were tradeable" value={factSummary.positioning.of_deaths_teammate_was_in_trade_range_pct !== null ? `${factSummary.positioning.of_deaths_teammate_was_in_trade_range_pct}%` : '—'} color={SIDE_LEFT} />
                </div>
                <AskCoachChip onClick={() => onAskCoach('Which of my isolated pushes had no teammate nearby to trade?')} />
              </>
            ) : <EmptyCard label="positioning" />}
          </div>

          <div className="hud-corners chip3d border border-[var(--edge)] rounded-2xl p-6 card-in" style={{ '--c': SIDE_RIGHT, animationDelay: '80ms' } as CSSProperties}>
            <div className="flex items-center gap-2 mb-4">
              <Users className="w-4 h-4" style={{ color: SIDE_RIGHT }} />
              <h3 className="font-display font-bold text-lg">Engage vs. Save</h3>
            </div>
            {factSummary.engage ? (
              <>
                <div className="grid grid-cols-2 gap-3 mb-4">
                  <StatTile label="Outnumbered moments" value={`${factSummary.engage.outnumbered_moments}`} color={SIDE_RIGHT} />
                  <StatTile label="Chose to engage" value={`${factSummary.engage.chose_to_engage_pct}%`} color={SIDE_RIGHT} />
                  <StatTile label="Round win % (engaged)" value={factSummary.engage.round_win_pct_when_engaged !== null ? `${factSummary.engage.round_win_pct_when_engaged}%` : '—'} color={SIDE_RIGHT} />
                  <StatTile label="Survived (disengaged)" value={factSummary.engage.survived_pct_when_disengaged !== null ? `${factSummary.engage.survived_pct_when_disengaged}%` : '—'} color={SIDE_RIGHT} />
                </div>
                <AskCoachChip onClick={() => onAskCoach('Should I have engaged or saved when I was last outnumbered?')} />
              </>
            ) : <EmptyCard label="engage-decision" />}
          </div>

          <div className="hud-corners chip3d border border-[var(--edge)] rounded-2xl p-6 lg:col-span-2 card-in" style={{ '--c': SIDE_CENTER, animationDelay: '160ms' } as CSSProperties}>
            <h3 className="font-display font-bold text-lg mb-4">Positioning Decisions Over Time</h3>
            <TrendChart data={data.trends.positioning} dataKey="good_decision_pct" label="Survived or tradeable" />
          </div>
        </div>
      )}

      {subTab === 'resources' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="hud-corners chip3d border border-[var(--edge)] rounded-2xl p-6 card-in" style={{ '--c': SIDE_LEFT } as CSSProperties}>
            <div className="flex items-center gap-2 mb-4">
              <Coins className="w-4 h-4" style={{ color: SIDE_LEFT }} />
              <h3 className="font-display font-bold text-lg">Buy Decisions</h3>
            </div>
            <LoadoutMixBar mix={data.loadoutMix} color={SIDE_LEFT} />
            {factSummary.economy && (
              <div className="grid grid-cols-2 gap-3 mt-4">
                <StatTile label="Rounds tracked" value={`${factSummary.economy.rounds_tracked}`} color={SIDE_LEFT} />
                <StatTile label="Against team economy" value={`${factSummary.economy.buy_decisions_against_team_economy_pct}%`} color={SIDE_LEFT} />
              </div>
            )}
            <AskCoachChip onClick={() => onAskCoach('Which rounds did I buy against my team\'s economy?')} />
          </div>

          <div className="hud-corners chip3d border border-[var(--edge)] rounded-2xl p-6 card-in" style={{ '--c': SIDE_RIGHT, animationDelay: '80ms' } as CSSProperties}>
            <div className="flex items-center gap-2 mb-4">
              <Flame className="w-4 h-4" style={{ color: SIDE_RIGHT }} />
              <h3 className="font-display font-bold text-lg">Utility Effectiveness</h3>
            </div>
            {factSummary.utility ? (
              <>
                <EmphasisBar
                  goodLabel="Enemy-blinding flashes"
                  goodValue={Math.round(100 - (factSummary.utility.team_flash_pct || 0))}
                  badLabel="Team-flashes"
                  badValue={Math.round(factSummary.utility.team_flash_pct || 0)}
                  color={SIDE_RIGHT}
                />
                <div className="grid grid-cols-2 gap-3 mt-4">
                  <StatTile label="Flash assists" value={`${factSummary.utility.flash_assist_count}`} color={SIDE_RIGHT} />
                  <StatTile label="Avg. HE/molotov dmg" value={factSummary.utility.avg_damage_per_he_or_molotov !== null ? `${factSummary.utility.avg_damage_per_he_or_molotov}` : '—'} color={SIDE_RIGHT} />
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
