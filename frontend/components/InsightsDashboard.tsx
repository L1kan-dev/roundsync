'use client';

import React, { useEffect, useState, CSSProperties } from 'react';
import { ResponsiveContainer, LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Cell } from 'recharts';
import {
  Loader2, Coins, Flame, Ear, Users, MapPinned, Crosshair, MessageCircleQuestion,
  CheckCircle2,
} from 'lucide-react';
import { formatMapName, mapScreenshotUrl } from '@/lib/mapDisplay';
import { shadeHex, Bar3DShape, ctTAccent, hexToRgba, duelLerp } from '@/lib/duelColors';
import { STAT_GLOSSARY } from '@/lib/statGlossary';
import { statTier, adaptivePrompt } from '@/lib/promptTone';

// Every panel on this page picks up one flat "duel" color from which side of the page it
// sits on (left = CT cyan, right = T amber, full-width = neutral grey) — and everything
// inside that panel (stat tiles, bars, chart lines) inherits that same color, the same way
// the Home dashboard's tiles do. Not a per-category palette.
const SIDE_LEFT = ctTAccent(0, 2);
const SIDE_RIGHT = ctTAccent(1, 2);
const SIDE_CENTER = ctTAccent(0, 1);

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

// Matches services/api/server.js's round1() exactly — used only where a value gets
// derived here (e.g. 100 - x), not for values the backend already rounded to 1 decimal,
// which should be passed through as-is rather than re-rounded to a coarser grain.
const round1 = (n: number) => Math.round(n * 10) / 10;

// --- Types (mirror services/api/server.js buildDashboardPayload) ---
interface AdaptationDetail {
  occurrences: number;
  no_visible_reaction_within_3s_pct: number;
  avg_reaction_time_ms: number | null;
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
    avg_angle_deviation_deg_overall: number | null; avg_time_to_damage_ms_when_won: number | null;
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
  avgKastPct: number | null;
  avgHeadshotAccuracyPct: number | null;
  totalMultiKillRounds: number | null;
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

// A small caption, not a button — the tiles themselves are the click targets now,
// this just tells a first-time viewer that they're interactive.
function AskCoachHint() {
  return (
    <p className="mt-3 flex items-center gap-1.5 text-[10px] text-[var(--text-dim)]">
      <MessageCircleQuestion className="w-3 h-3" /> Click a stat to ask the coach about it
    </p>
  );
}

function EmphasisBar({ goodLabel, goodValue, badLabel, badValue, color, onAsk }: { goodLabel: string; goodValue: number; badLabel: string; badValue: number; color: string; onAsk: () => void }) {
  return (
    <button type="button" onClick={onAsk} className="w-full text-left cursor-pointer transition-transform hover:-translate-y-0.5">
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
    </button>
  );
}

// Every stat tile is a bold embossed "chip" colored by whichever side of the page its
// panel sits on — same treatment as the Home dashboard's KPI tiles. Each one is its own
// click target now, firing a prompt specific to that exact stat (not the card it lives
// in) — e.g. "Time to damage (won)" asks a different question than "Engagements" right
// next to it, even though both live inside the same Crosshair Placement card.
function StatTile({ label, value, color, onAsk, title }: { label: string; value: string; color: string; onAsk: () => void; title?: string }) {
  return (
    <button
      type="button"
      onClick={onAsk}
      title={title}
      className="chip3d border border-[var(--edge)] rounded-xl p-4 text-center cursor-pointer transition-transform hover:-translate-y-0.5"
      style={{ '--c': color } as CSSProperties}
    >
      <p className="text-[10px] uppercase tracking-wider text-[var(--text-dim)] mb-1.5">{label}</p>
      <p className="font-tel text-xl font-bold" style={{ color }}>{value}</p>
    </button>
  );
}

const LOADOUT_QUESTION: Record<string, (count: number) => string> = {
  full_buy: (n) => `I've had ${n} full-buy rounds. Am I making the most of them, or wasting the equipment advantage?`,
  half_buy: (n) => `I've had ${n} half-buy rounds. Am I choosing the right gear for a half-buy, or should these be full buys or ecos instead?`,
  force_buy: (n) => `I've force-bought ${n} times. Were those force buys worth it, or costing my team more than they won?`,
  eco: (n) => `I've had ${n} eco rounds. Am I ecoing at the right times, or costing my team by not saving enough?`,
  carried_over: (n) => `I've carried over gear from a previous round ${n} times. Is that working out for me?`,
};

function LoadoutMixBar({ mix, color, onAsk }: { mix: Record<string, number>; color: string; onAsk: (question: string) => void }) {
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
          <button
            type="button"
            key={key}
            onClick={() => onAsk(LOADOUT_QUESTION[key](count))}
            className="bar3d-h cursor-pointer transition-opacity hover:opacity-80"
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
          <button
            type="button"
            key={key}
            onClick={() => onAsk(LOADOUT_QUESTION[key](count))}
            className="flex items-center gap-1.5 cursor-pointer hover:opacity-80"
          >
            <span className="sphere3d w-2.5 h-2.5 rounded-full shrink-0" style={{ '--c': shadeHex(color, shades[i % shades.length]) } as CSSProperties} />
            <span className="text-[var(--text-dim)]">{LOADOUT_LABELS[key]}</span>
            <span className="font-tel font-semibold">{count}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function ReactionByTriggerChart({ adaptation, color, onAsk }: { adaptation: Record<string, AdaptationDetail>; color: string; onAsk: (triggerLabel: string, reactedPct: number) => void }) {
  const data = Object.entries(adaptation).map(([type, d]) => ({
    name: TRIGGER_LABELS[type] || type,
    reacted_pct: round1(100 - d.no_visible_reaction_within_3s_pct),
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
          <Tooltip
            cursor={false}
            contentStyle={{ backgroundColor: '#0c1015', borderColor: '#2a3644' }}
            labelStyle={{ color: '#e7edf3' }}
            itemStyle={{ color: '#e7edf3' }}
            formatter={(v: any) => [`${v}%`, 'Reacted within 3s']}
          />
          <Bar
            dataKey="reacted_pct"
            style={{ filter: 'url(#reaction-bar-shadow)', cursor: 'pointer' }}
            shape={(p: any) => <Bar3DShape {...p} baseColor={p.fill} />}
            onClick={(d: any) => onAsk(d.name, d.reacted_pct)}
          >
            {data.map((d, i) => <Cell key={i} fill={shadeHex(color, shades[i % shades.length])} style={{ cursor: 'pointer' }} onClick={() => onAsk(d.name, d.reacted_pct)} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// These two trend charts always live in a full-width, both-columns panel, so — like the
// Home dashboard's own trend charts — they sweep the full CT cyan → grey → T amber range
// across their own width rather than sitting at one flat "side" color.
function TrendChart({ data, dataKey, label, onAsk }: { data: TrendPoint[]; dataKey: 'reaction_pct' | 'good_decision_pct'; label: string; onAsk: (point: TrendPoint) => void }) {
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
          {/* match_id, not map — several points can share the same map, and a non-unique
              x-axis key made Recharts' hover/click resolve to the first match with that
              map instead of the one actually under the cursor. */}
          <XAxis dataKey="match_id" stroke="#8592a1" tick={false} />
          <YAxis stroke="#8592a1" domain={[0, 100]} tick={{ fontSize: 11 }} />
          <Tooltip
            cursor={false}
            contentStyle={{ backgroundColor: '#0c1015', borderColor: '#2a3644' }}
            labelStyle={{ color: '#e7edf3' }}
            itemStyle={{ color: '#e7edf3' }}
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
              return (
                <circle
                  key={dotProps.index}
                  cx={dotProps.cx}
                  cy={dotProps.cy}
                  r={3}
                  fill="#fff"
                  stroke={c}
                  strokeWidth={2}
                  style={{ cursor: 'pointer' }}
                  onClick={() => onAsk(dotProps.payload)}
                />
              );
            }}
            activeDot={{ r: 7, style: { cursor: 'pointer' }, onClick: (_: any, e: any) => onAsk(e.payload) }}
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
// One phrase per metric column so a clicked cell asks about that stat specifically,
// not a generic "how am I doing on this map" — same K/D metric asks a different
// question here (map-scoped) than the Home tile or the Aim & Reaction tiles do.
const MAP_METRIC_QUESTION: Record<string, (map: string, val: number, games: number) => string> = {
  avg_kd: (map, val, games) => `My K/D on ${map} is ${val} across ${games} game${games === 1 ? '' : 's'} — how can I improve it specifically on this map?`,
  avg_adr: (map, val, games) => `My ADR on ${map} is ${val} across ${games} game${games === 1 ? '' : 's'} — what's limiting my damage output on this map?`,
  avg_hs_pct: (map, val, games) => `My headshot percentage on ${map} is ${val}% across ${games} game${games === 1 ? '' : 's'} — is that low for this map's engagement distances?`,
  avg_performance: (map, val, games) => `My performance index on ${map} is ${val}/100 across ${games} game${games === 1 ? '' : 's'} — what's holding it back on this specific map?`,
};

function MapHeatmap({ rows, onAsk }: { rows: MapBreakdownRow[]; onAsk: (question: string) => void }) {
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
                    <button
                      type="button"
                      key={m.key}
                      onClick={() => onAsk(MAP_METRIC_QUESTION[m.key](formatMapName(r.map), val, r.games))}
                      className="text-center rounded-lg font-tel text-sm font-semibold py-2.5 cursor-pointer transition-transform hover:-translate-y-0.5"
                      style={{
                        background: hexToRgba(columnColors[colIndex], 0.12 + intensity * 0.55),
                        boxShadow: `inset 0 1px 0 rgba(255,255,255,${0.06 + intensity * 0.1}), inset 0 -3px 6px rgba(0,0,0,0.35), 0 2px 4px rgba(0,0,0,0.3)`,
                      }}
                    >
                      {val}{m.suffix || ''}
                    </button>
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

// Shared shell for the 6 icon-header stat cards across the aim/decisions/resources
// sub-tabs — every one of them used the exact same outer box + header-row markup, only
// differing in icon/title/color/delay and (genuinely, not boilerplate) their own inner
// content. The two full-width trend-chart cards are a different shape (no icon, spans
// both columns) and aren't forced into this — only the true matches are.
function InsightCard({ icon: Icon, title, color, delay, children }: {
  icon: React.ElementType; title: string; color: string; delay?: string; children: React.ReactNode;
}) {
  return (
    <div className="hud-corners chip3d border border-[var(--edge)] rounded-2xl p-6 card-in" style={{ '--c': color, animationDelay: delay } as CSSProperties}>
      <div className="flex items-center gap-2 mb-4">
        <Icon className="w-4 h-4" style={{ color }} />
        <h3 className="font-display font-bold text-lg">{title}</h3>
      </div>
      {children}
    </div>
  );
}

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
        // An error response's body is just {error: "..."} — still a truthy object, so
        // without this check `data` would get set to it and every categoryScores/
        // factSummary access below would crash instead of showing the "couldn't load"
        // fallback the !data check further down is meant to catch.
        if (!response.ok) throw new Error(`Dashboard API returned ${response.status}`);
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
          <MapHeatmap rows={data.mapBreakdown} onAsk={onAskCoach} />
        </div>
      )}

      {subTab === 'aim' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <InsightCard icon={Crosshair} title="Crosshair Placement" color={SIDE_LEFT}>
            {factSummary.duels ? (
              <>
                <div className="grid grid-cols-2 gap-3 mb-4">
                  <StatTile
                    label="Avg. deviation (won)"
                    value={`${factSummary.duels.avg_angle_deviation_deg_when_won ?? '—'}°`}
                    color={SIDE_LEFT}
                    onAsk={() => onAskCoach(`My average crosshair deviation when I win a duel is ${factSummary.duels?.avg_angle_deviation_deg_when_won ?? '—'}°. What does that number say about my crosshair placement?`)}
                  />
                  <StatTile
                    label="Avg. deviation (lost)"
                    value={`${factSummary.duels.avg_angle_deviation_deg_when_lost ?? '—'}°`}
                    color={SIDE_LEFT}
                    onAsk={() => onAskCoach(`Why is my crosshair deviation ${factSummary.duels?.avg_angle_deviation_deg_when_lost ?? '—'}° when I lose a duel — what am I doing differently than when I win?`)}
                  />
                  <StatTile
                    label="Engagements"
                    value={`${factSummary.duels.engagements_tracked}`}
                    color={SIDE_LEFT}
                    onAsk={() => onAskCoach(`I've had ${factSummary.duels?.engagements_tracked} tracked duel engagements. Walk me through a few — what separated the wins from the losses?`)}
                  />
                  <StatTile
                    label="Time to damage (won)"
                    value={factSummary.duels.avg_time_to_damage_ms_when_won !== null ? `${factSummary.duels.avg_time_to_damage_ms_when_won}ms` : '—'}
                    color={SIDE_LEFT}
                    onAsk={() => onAskCoach(`It takes me ${factSummary.duels?.avg_time_to_damage_ms_when_won ?? '—'}ms to land damage after winning a duel. Is that fast or slow for my rank?`)}
                  />
                </div>
                <p className="text-xs text-[var(--text-dim)]">Smaller deviation = your crosshair was already closer to the enemy the instant you fired.</p>
                <AskCoachHint />
              </>
            ) : <EmptyCard label="aim" />}
          </InsightCard>

          <InsightCard icon={Ear} title="Reaction to Information" color={SIDE_RIGHT} delay="80ms">
            {factSummary.adaptation ? (
              <>
                <ReactionByTriggerChart
                  adaptation={factSummary.adaptation}
                  color={SIDE_RIGHT}
                  onAsk={(triggerLabel, reactedPct) => onAskCoach(`I react within 3 seconds ${reactedPct}% of the time after "${triggerLabel}". What's actually happening in that window?`)}
                />
                <AskCoachHint />
              </>
            ) : <EmptyCard label="reaction" />}
          </InsightCard>

          <InsightCard icon={CheckCircle2} title="Consistency & Impact" color={SIDE_LEFT} delay="120ms">
            <div className="grid grid-cols-3 gap-3 mb-4">
              <StatTile
                label="KAST"
                value={data.avgKastPct !== null ? `${data.avgKastPct}%` : '—'}
                color={SIDE_LEFT}
                onAsk={() => onAskCoach(adaptivePrompt(statTier('kast', data.avgKastPct), {
                  weak: `My KAST is ${data.avgKastPct ?? '—'}% — which rounds am I contributing nothing at all, no kill, no assist, no survival, no trade?`,
                  neutral: `My KAST is ${data.avgKastPct ?? '—'}%. What would push it toward being a genuinely reliable contributor?`,
                  strong: `My KAST is ${data.avgKastPct ?? '—'}% — already a reliable, floor-level number. What's the ceiling above this?`,
                }))}
              />
              <StatTile
                label="HS Accuracy"
                value={data.avgHeadshotAccuracyPct !== null ? `${data.avgHeadshotAccuracyPct}%` : '—'}
                color={SIDE_LEFT}
                onAsk={() => onAskCoach(`Of all my shots that actually land, ${data.avgHeadshotAccuracyPct ?? '—'}% hit the head. What does that say about my crosshair placement?`)}
              />
              <StatTile
                label="Multi-Kills"
                value={data.totalMultiKillRounds !== null ? `${data.totalMultiKillRounds}` : '—'}
                color={SIDE_LEFT}
                onAsk={() => onAskCoach(`I've had ${data.totalMultiKillRounds ?? '—'} multi-kill rounds (2K or more). What am I doing right in those rounds?`)}
              />
            </div>
            <p className="text-xs text-[var(--text-dim)]">KAST: % of rounds with a Kill, Assist, Survival, or Trade — the floor-level "did I contribute something" stat.</p>
            <AskCoachHint />
          </InsightCard>

          <div className="hud-corners chip3d border border-[var(--edge)] rounded-2xl p-6 lg:col-span-2 card-in" style={{ '--c': SIDE_CENTER, animationDelay: '160ms' } as CSSProperties}>
            <h3 className="font-display font-bold text-lg mb-4">Reaction Rate Over Time</h3>
            <TrendChart
              data={data.trends.reaction}
              dataKey="reaction_pct"
              label="Reacted within 3s"
              onAsk={(point) => onAskCoach(`On ${point.map ? formatMapName(point.map) : 'that match'}, my reaction rate was ${point.reaction_pct}%. What happened in that match that affected it?`)}
            />
          </div>
        </div>
      )}

      {subTab === 'decisions' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <InsightCard icon={MapPinned} title="Isolated Pushes" color={SIDE_LEFT}>
            {factSummary.positioning ? (
              <>
                <EmphasisBar
                  goodLabel="Survived"
                  goodValue={factSummary.positioning.survived_pct}
                  badLabel="Died"
                  badValue={factSummary.positioning.died_pct}
                  color={SIDE_LEFT}
                  onAsk={() => onAskCoach(`I died ${factSummary.positioning?.died_pct}% of the time on isolated pushes. Which of those pushes had no teammate nearby to trade?`)}
                />
                <div className="grid grid-cols-2 gap-3 mt-4">
                  <StatTile
                    label="Isolated pushes"
                    value={`${factSummary.positioning.isolated_commitments}`}
                    color={SIDE_LEFT}
                    onAsk={() => onAskCoach(`I've made ${factSummary.positioning?.isolated_commitments} isolated pushes. What's the right balance for how often to push alone?`)}
                    title={STAT_GLOSSARY.isolatedPush}
                  />
                  <StatTile
                    label="Deaths that were tradeable"
                    value={factSummary.positioning.of_deaths_teammate_was_in_trade_range_pct !== null ? `${factSummary.positioning.of_deaths_teammate_was_in_trade_range_pct}%` : '—'}
                    color={SIDE_LEFT}
                    onAsk={() => onAskCoach(`${factSummary.positioning?.of_deaths_teammate_was_in_trade_range_pct ?? '—'}% of my deaths had a teammate in trade range. What actually determines whether those turn into a trade?`)}
                  />
                </div>
                <AskCoachHint />
              </>
            ) : <EmptyCard label="positioning" />}
          </InsightCard>

          <InsightCard icon={Users} title="Engage vs. Save" color={SIDE_RIGHT} delay="80ms">
            {factSummary.engage ? (
              <>
                <div className="grid grid-cols-2 gap-3 mb-4">
                  <StatTile
                    label="Outnumbered moments"
                    value={`${factSummary.engage.outnumbered_moments}`}
                    color={SIDE_RIGHT}
                    onAsk={() => onAskCoach(`I've been outnumbered ${factSummary.engage?.outnumbered_moments} times. What should I generally do in that situation?`)}
                    title={STAT_GLOSSARY.outnumberedMoment}
                  />
                  <StatTile
                    label="Chose to engage"
                    value={`${factSummary.engage.chose_to_engage_pct}%`}
                    color={SIDE_RIGHT}
                    onAsk={() => onAskCoach(`I choose to engage when outnumbered ${factSummary.engage?.chose_to_engage_pct}% of the time. Is that too aggressive?`)}
                  />
                  <StatTile
                    label="Round win % (engaged)"
                    value={factSummary.engage.round_win_pct_when_engaged !== null ? `${factSummary.engage.round_win_pct_when_engaged}%` : '—'}
                    color={SIDE_RIGHT}
                    onAsk={() => onAskCoach(`When I engage while outnumbered, my round win rate is ${factSummary.engage?.round_win_pct_when_engaged ?? '—'}%. Is that worth the risk?`)}
                  />
                  <StatTile
                    label="Survived (disengaged)"
                    value={factSummary.engage.survived_pct_when_disengaged !== null ? `${factSummary.engage.survived_pct_when_disengaged}%` : '—'}
                    color={SIDE_RIGHT}
                    onAsk={() => onAskCoach(`When I disengage instead of fighting outnumbered, I survive ${factSummary.engage?.survived_pct_when_disengaged ?? '—'}% of the time. Should I be disengaging more often?`)}
                  />
                </div>
                <AskCoachHint />
              </>
            ) : <EmptyCard label="engage-decision" />}
          </InsightCard>

          <div className="hud-corners chip3d border border-[var(--edge)] rounded-2xl p-6 lg:col-span-2 card-in" style={{ '--c': SIDE_CENTER, animationDelay: '160ms' } as CSSProperties}>
            <h3 className="font-display font-bold text-lg mb-4">Positioning Decisions Over Time</h3>
            <TrendChart
              data={data.trends.positioning}
              dataKey="good_decision_pct"
              label="Good Push Rate"
              onAsk={(point) => onAskCoach(`On ${point.map ? formatMapName(point.map) : 'that match'}, my Good Push Rate was ${point.good_decision_pct}%. What happened in that match?`)}
            />
            <p className="text-xs text-[var(--text-dim)] mt-3">
              Judges the decision, not just the death: counts as "good" if you survived an isolated push,
              OR a teammate was close enough to trade your death — not just whether you lived.
            </p>
          </div>
        </div>
      )}

      {subTab === 'resources' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <InsightCard icon={Coins} title="Buy Decisions" color={SIDE_LEFT}>
            <LoadoutMixBar mix={data.loadoutMix} color={SIDE_LEFT} onAsk={onAskCoach} />
            {factSummary.economy && (
              <div className="grid grid-cols-2 gap-3 mt-4">
                <StatTile
                  label="Rounds tracked"
                  value={`${factSummary.economy.rounds_tracked}`}
                  color={SIDE_LEFT}
                  onAsk={() => onAskCoach(`You've tracked ${factSummary.economy?.rounds_tracked} of my rounds' buy decisions. What patterns do you see in how I spend?`)}
                />
                <StatTile
                  label="Against team economy"
                  value={`${factSummary.economy.buy_decisions_against_team_economy_pct}%`}
                  color={SIDE_LEFT}
                  onAsk={() => onAskCoach(`I bought against my team's economy ${factSummary.economy?.buy_decisions_against_team_economy_pct}% of the time. What was the situation in those rounds?`)}
                />
              </div>
            )}
            <AskCoachHint />
          </InsightCard>

          <InsightCard icon={Flame} title="Utility Effectiveness" color={SIDE_RIGHT} delay="80ms">
            {factSummary.utility ? (
              <>
                <EmphasisBar
                  goodLabel="Enemy-blinding flashes"
                  goodValue={round1(100 - (factSummary.utility.team_flash_pct || 0))}
                  badLabel="Team-flashes"
                  badValue={factSummary.utility.team_flash_pct || 0}
                  color={SIDE_RIGHT}
                  onAsk={() => onAskCoach(`${factSummary.utility?.team_flash_pct || 0}% of my flashes are team-flashes. Which of my flashbangs blinded my own team?`)}
                />
                <div className="grid grid-cols-2 gap-3 mt-4">
                  <StatTile
                    label="Flash assists"
                    value={`${factSummary.utility.flash_assist_count}`}
                    color={SIDE_RIGHT}
                    onAsk={() => onAskCoach(`I have ${factSummary.utility?.flash_assist_count} flash assists. How can I set up more of these?`)}
                  />
                  <StatTile
                    label="Avg. HE/molotov dmg"
                    value={factSummary.utility.avg_damage_per_he_or_molotov !== null ? `${factSummary.utility.avg_damage_per_he_or_molotov}` : '—'}
                    color={SIDE_RIGHT}
                    onAsk={() => onAskCoach(`My average HE/molotov damage is ${factSummary.utility?.avg_damage_per_he_or_molotov ?? '—'}. Am I throwing my grenades effectively?`)}
                  />
                </div>
                <AskCoachHint />
              </>
            ) : <EmptyCard label="utility" />}
          </InsightCard>
        </div>
      )}
    </div>
  );
}
