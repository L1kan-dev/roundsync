'use client';

import React, { useState, useEffect, useRef, useCallback, CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { ResponsiveContainer, LineChart, Line, Area, AreaChart, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Cell } from 'recharts';
import { Brain, ShieldAlert, CheckCircle2, ChevronRight, Loader2, Target, Crosshair, Radar, Download, Plus, TrendingUp, Zap, LogIn, Flame, Users, Repeat, MapPinned, Coins, Clock, Trash2, X, Info } from 'lucide-react';
import { LogoMark } from '@/components/Logo';
import ReactMarkdown from 'react-markdown';
import { Toast } from '@/components/Toast';
import { TopNav } from '@/components/TopNav';
import { InsightsDashboard } from '@/components/InsightsDashboard';
import { RankBadge } from '@/components/RankBadge';
import { RankBandTakeover, RankDeltaBadge, type RankChangeEvent } from '@/components/RankChangeOverlay';
import { rankBand, rankBandIndex, RANK_BANDS, LAST_KNOWN_RANK_KEY } from '@/lib/rank';
import { ctTAccent, shadeHex, Bar3DShape, duelLerp } from '@/lib/duelColors';
import { formatMapName, mapScreenshotUrl } from '@/lib/mapDisplay';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface Match {
  match_id: string;
  parsed_at: string;
  match_data: {
    telemetry: {
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
    };
  };
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
// principle as avgWeighted() above.
function performanceIndex(t: Match['match_data']['telemetry']): number {
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
function formatMatchDate(t: Match['match_data']['telemetry']): string {
  if (!t.match_time) return 'Date unavailable';
  return new Date(t.match_time * 1000).toLocaleString(undefined, {
    month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
  });
}

// Sorts most-recent-played first when we know match_time, falling back to parse
// order for older matches that predate that field — see formatMatchDate above.
function matchSortKey(m: Match): number {
  return m.match_data.telemetry.match_time ? m.match_data.telemetry.match_time * 1000 : new Date(m.parsed_at).getTime();
}

function sumOptionalField(matches: Match[], pick: (t: Match['match_data']['telemetry']) => number | null | undefined): number | null {
  const values = matches.map((m) => pick(m.match_data.telemetry)).filter((v): v is number => typeof v === 'number');
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0);
}

// True weighted average — each match's own percentage/rate weighted by its real sample size
// (rounds played, kills, whichever the stat's actual denominator is), not averaged as if every
// match carried equal weight regardless of how many rounds/kills it actually represents. Same
// "pool the real counts, don't average the percentages" principle as the already-fixed
// awareness-score bug, generalized here since the frontend only has each match's final
// percentage, not its raw numerator/denominator — weighting by the real per-match sample size
// is the closest true pooling gets without a backend schema change.
function avgWeighted(
  matches: Match[],
  pickValue: (t: Match['match_data']['telemetry']) => number | null | undefined,
  pickWeight: (t: Match['match_data']['telemetry']) => number | null | undefined
): number | null {
  const pairs = matches
    .map((m) => ({ value: pickValue(m.match_data.telemetry), weight: pickWeight(m.match_data.telemetry) }))
    .filter((p): p is { value: number; weight: number } => typeof p.value === 'number' && typeof p.weight === 'number' && p.weight > 0);
  if (pairs.length === 0) return null;
  const totalWeight = pairs.reduce((s, p) => s + p.weight, 0);
  return pairs.reduce((s, p) => s + p.value * p.weight, 0) / totalWeight;
}

interface ChatHistoryEntry { question: string; response: string; created_at: string }
interface ConversationGroup { id: string; entries: ChatHistoryEntry[]; startedAt: string; lastAt: string }

// coaching_history has no explicit thread/session concept — it's one flat log per player.
// Group it into browsable "conversations" the same way most chat apps do when they lack
// real thread boundaries: a long gap since the last message starts a new one.
const CONVERSATION_GAP_MS = 3 * 60 * 60 * 1000; // 3 hours

function groupIntoConversations(history: ChatHistoryEntry[]): ConversationGroup[] {
  const groups: ConversationGroup[] = [];
  for (const entry of history) {
    const last = groups[groups.length - 1];
    const gap = last ? new Date(entry.created_at).getTime() - new Date(last.lastAt).getTime() : Infinity;
    if (last && gap < CONVERSATION_GAP_MS) {
      last.entries.push(entry);
      last.lastAt = entry.created_at;
    } else {
      groups.push({ id: entry.created_at, entries: [entry], startedAt: entry.created_at, lastAt: entry.created_at });
    }
  }
  return groups;
}

function conversationToMessages(group: ConversationGroup): { role: 'user' | 'assistant'; content: string }[] {
  const messages: { role: 'user' | 'assistant'; content: string }[] = [];
  group.entries.forEach((e) => {
    messages.push({ role: 'user', content: e.question });
    messages.push({ role: 'assistant', content: e.response });
  });
  return messages;
}

function conversationPreview(group: ConversationGroup): string {
  const first = group.entries[0]?.question || '';
  return first.length > 48 ? first.slice(0, 48) + '…' : first;
}

function conversationDateLabel(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();
  const yesterday = new Date(now); yesterday.setDate(now.getDate() - 1);
  const isYesterday = date.toDateString() === yesterday.toDateString();
  if (isToday) return date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  if (isYesterday) return 'Yesterday';
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

const markdownComponents = {
  h1: (p: React.ComponentProps<'h3'>) => <h3 className="font-display font-bold text-base mt-2 mb-1" {...p} />,
  h2: (p: React.ComponentProps<'h3'>) => <h3 className="font-display font-bold text-base mt-2 mb-1" {...p} />,
  h3: (p: React.ComponentProps<'h4'>) => <h4 className="font-display font-bold text-sm mt-2 mb-1" {...p} />,
  strong: (p: React.ComponentProps<'strong'>) => <strong className="text-[var(--cyan)] font-semibold" {...p} />,
  hr: () => <hr className="border-[var(--edge)] my-2" />,
  ul: (p: React.ComponentProps<'ul'>) => <ul className="list-disc list-inside space-y-1 my-1" {...p} />,
  ol: (p: React.ComponentProps<'ol'>) => <ol className="list-decimal list-inside space-y-1 my-1" {...p} />,
  p: (p: React.ComponentProps<'p'>) => <p className="mb-2 last:mb-0" {...p} />,
};

const TYPEWRITER_CHARS_PER_TICK = 3;
const TYPEWRITER_TICK_MS = 15;

// Reveals a finished AI reply a few characters at a time instead of it appearing all at
// once ("teleporting" onto screen). skipAnimation lets an already-seen message render
// instantly on re-render, so the effect only ever plays once per message.
function TypedAssistantMessage({ content, skipAnimation, onDone }: { content: string; skipAnimation: boolean; onDone: () => void }) {
  const [visibleChars, setVisibleChars] = useState(skipAnimation ? content.length : 0);

  useEffect(() => {
    if (skipAnimation) return;
    let shown = 0;
    const interval = setInterval(() => {
      shown = Math.min(shown + TYPEWRITER_CHARS_PER_TICK, content.length);
      setVisibleChars(shown);
      if (shown >= content.length) {
        clearInterval(interval);
        onDone();
      }
    }, TYPEWRITER_TICK_MS);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <ReactMarkdown components={markdownComponents}>{content.slice(0, visibleChars)}</ReactMarkdown>;
}

// Renders an icon twice, each half clipped away, so it reads as one icon split CT-cyan
// (left) / T-amber (right) instead of one flat color — same duel motif as everything
// else, applied to a single glyph. The wrapper needs an explicit size AND its own
// `position` (pass e.g. "w-8 h-8 absolute top-1/2 left-1/2 -translate-x-1/2
// -translate-y-1/2" as className) since the two clipped copies are positioned
// absolutely inside it — this deliberately does NOT default to `relative` itself:
// an earlier version did, and a caller centering the whole icon via `absolute` +
// `top/left/translate` fought that default (two `position` values on one element,
// whichever wins the cascade), which silently broke the centering math entirely
// rather than erroring — that's the bug that put the empty-state badge's icon
// visibly off-center. `inline-block` alone is a safe default; it doesn't compete.
function DuelIcon({ icon: Icon, className }: { icon: React.ElementType; className?: string }) {
  return (
    <span className={`inline-block shrink-0 ${className || ''}`}>
      <Icon className="absolute inset-0 w-full h-full text-[var(--cyan)]" style={{ clipPath: 'inset(0 50% 0 0)' }} />
      <Icon className="absolute inset-0 w-full h-full text-[var(--amber)]" style={{ clipPath: 'inset(0 0 0 50%)' }} />
    </span>
  );
}

// Half-transparent radial popup — the CS2-buymenu-style replacement for the old row of
// pill-shaped example prompts. Segments are laid out on a circle around a center hub
// with basic trig instead of hardcoded per-segment positions, so the count/spacing stay
// easy to change. Clicking a segment (or its spoke) fills the chat input and closes;
// clicking the dimmed backdrop closes without picking anything.
function TopicWheel({ segments, onPick }: { segments: { id: string; label: string; icon: React.ElementType; prompt: string | null }[]; onPick: (prompt: string | null) => void }) {
  // A takeover-sized wheel, not a small popup — radius is expressed in vmin so it scales
  // with the actual screen instead of a small fixed pixel size that read as "unreadable"
  // on a real monitor. `calc(<number> * Xvmin)` is valid CSS: a plain-number × length.
  const radiusVmin = 27;

  // Opens like a white hole spewing the segments outward from a point, closes like a
  // black hole sucking them back in — 'opening' starts everything collapsed at the
  // center, flips to 'open' one frame later so the CSS transition actually plays, and
  // any pick/close request goes through 'closing' (collapsing back to center, hub
  // showing a spinning event-horizon ring) BEFORE `onPick` actually fires — so the
  // parent only unmounts this once the implode animation has actually finished.
  const [phase, setPhase] = useState<'opening' | 'open' | 'closing'>('opening');
  const pickedRef = useRef<string | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const id = requestAnimationFrame(() => setPhase('open'));
    return () => {
      cancelAnimationFrame(id);
      if (closeTimer.current) clearTimeout(closeTimer.current);
    };
  }, []);

  const requestClose = (prompt: string | null) => {
    if (phase === 'closing') return;
    pickedRef.current = prompt;
    setPhase('closing');
    closeTimer.current = setTimeout(() => onPick(pickedRef.current), 480);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') requestClose(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  const collapsed = phase !== 'open';

  // Rendered via a portal straight to <body>, fixed to the viewport — not nested inside
  // the chat panel, whose own `overflow-hidden` (needed for its rounded corners) was
  // silently clipping any wheel segment that extended past the panel's edges.
  return createPortal(
    <div className="fixed inset-0 z-50" onClick={() => requestClose(null)}>
      {/* No `backdrop-filter` here — same root cause as the chat panel's earlier fix, but
          worse: this scrim covers the FULL viewport and stays mounted the entire time the
          wheel is open (not just during a transition), continuously re-blurring the
          always-animating background behind it on every frame while the user's hovering
          segments — that's what read as "200ms behind what I'm doing." A darker flat
          scrim reads close enough to dimmed-and-blurred without the resample cost. */}
      <div
        className="absolute inset-0 transition-opacity duration-500"
        style={{ background: 'rgba(5,7,10,0.9)', opacity: phase === 'opening' ? 0 : 1 }}
      />

      {/* the "white hole" flash on open / afterglow on close. Deliberately NO
          `-translate-x-1/2 -translate-y-1/2` classes here — Tailwind v4 compiles those to
          the standalone CSS `translate` property, not `transform`, so they don't get
          overridden by an inline/keyframe `transform` the way earlier Tailwind versions'
          translate utilities did. Having both applies BOTH shifts (they compose instead of
          one replacing the other), which is exactly what put this hub/flash off-center by
          a consistent half-its-own-size offset before this was caught. When a translate is
          already baked into an inline `transform` or a `@keyframes` rule, leave these
          utility classes off entirely. */}
      <div
        key={phase === 'closing' ? 'closing-flash' : 'opening-flash'}
        className="absolute top-1/2 left-1/2 rounded-full pointer-events-none wheel-flash"
        style={{ width: '15vmin', height: '15vmin', minWidth: 120, minHeight: 120, border: '2px solid var(--cyan)', animationDirection: phase === 'closing' ? 'reverse' : 'normal' }}
      />

      <svg className="absolute inset-0 w-full h-full pointer-events-none" style={{ overflow: 'visible' }}>
        {segments.map((seg, i) => {
          const angle = (i / segments.length) * 2 * Math.PI - Math.PI / 2;
          const x2 = `calc(50% + calc(${Math.cos(angle)} * ${radiusVmin}vmin))`;
          const y2 = `calc(50% + calc(${Math.sin(angle)} * ${radiusVmin}vmin))`;
          return (
            <line
              key={seg.id}
              x1="50%"
              y1="50%"
              x2={collapsed ? '50%' : x2}
              y2={collapsed ? '50%' : y2}
              stroke="rgba(34,211,238,0.25)"
              strokeWidth={2}
              style={{
                transition: (() => {
                  const dur = phase === 'closing' ? 340 : 380;
                  const delay = phase === 'open' ? i * 22 : 0;
                  return `x2 ${dur}ms ease-in-out ${delay}ms, y2 ${dur}ms ease-in-out ${delay}ms`;
                })(),
              }}
            />
          );
        })}
      </svg>

      {/* center hub — spins up a bright event-horizon ring while sucking everything back
          in on close, same idea in reverse (a quick outward flash) on open. The icon sits
          alone, truly centered in the circle — the "ASK COACH" label used to be stacked
          inside the same circle underneath it, which pulled the icon itself off-center
          (visually above the circle's real middle, since the label's row claimed space
          below it). Moved the label outside the circle instead, same pattern the
          empty-state badge already uses correctly. */}
      <div
        className="absolute top-1/2 left-1/2 rounded-full flex items-center justify-center transition-transform duration-[350ms]"
        style={{
          width: '15vmin',
          height: '15vmin',
          minWidth: 120,
          minHeight: 120,
          background: 'radial-gradient(circle at 34% 30%, color-mix(in srgb, var(--cyan) 35%, #0c1015) 0%, #0c1015 70%)',
          border: '2px solid var(--cyan)',
          boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.1), 0 8px 28px rgba(0,0,0,0.6)',
          transform: `translate(-50%,-50%) scale(${phase === 'open' ? 1 : phase === 'closing' ? 0.4 : 0.15})`,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {phase === 'closing' && (
          <div
            className="absolute -inset-2 rounded-full animate-spin pointer-events-none"
            style={{ borderWidth: 3, borderStyle: 'solid', borderColor: 'var(--cyan) var(--amber) var(--cyan) var(--amber)', animationDuration: '0.5s' }}
          />
        )}
        <Brain className="w-8 h-8 text-[var(--cyan)]" />
        <span
          className="absolute left-1/2 -translate-x-1/2 top-full mt-2 font-display text-xs font-bold tracking-wider text-[var(--cyan)] whitespace-nowrap"
          style={{ opacity: phase === 'open' ? 1 : 0, transition: 'opacity 200ms ease-in-out' }}
        >
          ASK COACH
        </span>
      </div>

      {segments.map((seg, i) => {
        const angle = (i / segments.length) * 2 * Math.PI - Math.PI / 2;
        const x = collapsed ? '0px' : `calc(${Math.cos(angle)} * ${radiusVmin}vmin)`;
        const y = collapsed ? '0px' : `calc(${Math.sin(angle)} * ${radiusVmin}vmin)`;
        const Icon = seg.icon;
        // Same duel read as the rest of the app: left side of the wheel reads CT cyan,
        // right side T amber, top/bottom (dead center horizontally) neutral grey —
        // driven by the segment's actual horizontal position (cos of its angle), not
        // just its index, so it's really "which side of the page" and not just order.
        const glow = duelLerp((Math.cos(angle) + 1) / 2);
        return (
          <button
            key={seg.id}
            type="button"
            onClick={(e) => { e.stopPropagation(); requestClose(seg.prompt); }}
            className={`group absolute top-1/2 left-1/2 flex items-center gap-3 px-6 py-4 rounded-full whitespace-nowrap hover:[--hover-scale:1.05] cursor-pointer border-[1.5px] shadow-[0_6px_20px_rgba(0,0,0,0.5)] hover:shadow-[0_0_30px_var(--glow)] hover:border-[color:var(--glow)] ${
              seg.id === 'custom' ? 'border-dashed border-white/20' : 'border-solid border-white/10'
            }`}
            style={{
              '--glow': glow,
              '--hover-scale': 1,
              // The base transform (position + collapse-scale) is fully dynamic/inline, so
              // a plain `hover:scale-105` utility class can never win against it (inline
              // styles always beat stylesheet rules, hover or not) — folding the hover bump
              // in as its own var, set only by the `hover:` class above, sidesteps that.
              transform: `translate(calc(-50% + ${x}), calc(-50% + ${y})) scale(${collapsed ? 0.1 : 1}) scale(var(--hover-scale))`,
              opacity: collapsed ? 0 : 1,
              // No per-segment `backdrop-filter` — 8 of them each re-sampling a blurred
              // background WHILE animating transform every frame was the real source of
              // the lag (backdrop-filter is expensive to recompute on a moving/resizing
              // element; doing it 8x at once compounds badly). A slightly more opaque flat
              // background reads almost the same without the per-frame blur cost — only
              // the one big scrim behind everything still blurs, and it isn't moving.
              background: 'rgba(16,21,28,0.88)',
              transition: (() => {
                const dur = phase === 'closing' ? 340 : 380;
                const delay = phase === 'open' ? i * 22 : 0;
                return `transform ${dur}ms cubic-bezier(0.2,0.8,0.3,1) ${delay}ms, opacity 280ms ease-in-out ${delay}ms, box-shadow 0.2s, border-color 0.2s`;
              })(),
            } as CSSProperties}
          >
            <Icon className="w-6 h-6 shrink-0 text-[var(--cyan)] transition-colors group-hover:text-[var(--glow)]" />
            <span className="font-display text-base font-bold text-[var(--text)] transition-colors group-hover:text-[var(--glow)]">{seg.label}</span>
          </button>
        );
      })}

      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); requestClose(null); }}
        title="Close"
        className="absolute top-6 right-6 w-11 h-11 rounded-full flex items-center justify-center bg-[var(--panel-raised)] border border-[var(--edge)] text-[var(--text-dim)] hover:text-[var(--text)] cursor-pointer transition-opacity duration-300"
        style={{ opacity: phase === 'opening' ? 0 : 1 }}
      >
        <X className="w-5 h-5" />
      </button>
    </div>,
    document.body
  );
}

// A themed bubble that follows the cursor instead of the browser's plain native `title`
// tooltip (unstyled, positioned wherever the OS wants, easily clipped) — fades in over
// ~1s on hover and fades back out over ~1s after the cursor leaves, staying mounted
// through the fade-out instead of vanishing instantly so the transition actually plays.
function useHoverTooltip(text: string) {
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [mounted, setMounted] = useState(false);
  const [shown, setShown] = useState(false);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const onMouseEnter = (e: React.MouseEvent) => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    setPos({ x: e.clientX, y: e.clientY });
    setMounted(true);
    requestAnimationFrame(() => setShown(true));
  };
  const onMouseMove = (e: React.MouseEvent) => setPos({ x: e.clientX, y: e.clientY });
  const onMouseLeave = () => {
    setShown(false);
    hideTimer.current = setTimeout(() => setMounted(false), 1000);
  };

  useEffect(() => () => { if (hideTimer.current) clearTimeout(hideTimer.current); }, []);

  const tooltip = mounted ? createPortal(
    <div
      className="fixed z-50 pointer-events-none px-3.5 py-2.5 rounded-xl text-xs leading-snug font-medium text-[var(--text)] transition-opacity"
      style={{
        left: Math.min(pos.x + 18, (typeof window !== 'undefined' ? window.innerWidth : 1920) - 280),
        top: pos.y + 18,
        maxWidth: 260,
        background: 'rgba(12,16,21,0.95)',
        backdropFilter: 'blur(6px)',
        border: '1px solid var(--edge-bright)',
        boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
        opacity: shown ? 1 : 0,
        transitionDuration: '1000ms',
      }}
    >
      {text}
    </div>,
    document.body
  ) : null;

  return { handlers: { onMouseEnter, onMouseMove, onMouseLeave }, tooltip };
}

// The one-time setup form (Home) and the Settings "Update Codes" form were copy-pasted
// verbatim except for the submit button's width/label — shared here instead.
function OnboardingForm({
  gameAuthCode, setGameAuthCode, recentShareCode, setRecentShareCode,
  isOnboarding, onSubmit, submitLabel, fullWidthButton, shareCodeHint,
}: {
  gameAuthCode: string; setGameAuthCode: (v: string) => void;
  recentShareCode: string; setRecentShareCode: (v: string) => void;
  isOnboarding: boolean; onSubmit: (e: React.FormEvent) => void;
  submitLabel: string; fullWidthButton?: boolean; shareCodeHint?: boolean;
}) {
  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-semibold text-[var(--text-dim)] mb-2">CS2 Game Authentication Code</label>
        <input
          type="password"
          required
          value={gameAuthCode}
          onChange={(e) => setGameAuthCode(e.target.value)}
          placeholder="••••••••••••"
          className="w-full bg-[var(--void)] border border-[var(--edge)] focus:border-[var(--cyan)] outline-none rounded-xl px-4 py-3 text-[var(--text)] transition-colors"
        />
      </div>
      <div>
        <label className="block text-sm font-semibold text-[var(--text-dim)] mb-2">
          Recent Match Share Code{shareCodeHint ? ' (CSGO-XXXXX-...)' : ''}
        </label>
        <input
          type="text"
          required
          value={recentShareCode}
          onChange={(e) => setRecentShareCode(e.target.value)}
          placeholder="CSGO-abc12-def34-..."
          className="w-full bg-[var(--void)] border border-[var(--edge)] focus:border-[var(--cyan)] outline-none rounded-xl px-4 py-3 text-[var(--text)] font-tel transition-colors"
        />
      </div>
      <button
        type="submit"
        disabled={isOnboarding}
        className={`px-5 py-3 bg-[var(--cyan)] hover:bg-[#5eead4] disabled:bg-[var(--edge)] disabled:text-[var(--text-dim)] font-bold text-[#03141a] rounded-xl transition-all flex items-center gap-2 ${fullWidthButton ? 'w-full justify-center' : ''}`}
      >
        {isOnboarding && <Loader2 className="w-5 h-5 animate-spin" />}
        {submitLabel}
      </button>
    </form>
  );
}

const CAROUSEL_AUTO_MS = 4500;
const CAROUSEL_PER_PAGE = 5;
const CAROUSEL_GAP = 12;
const CAROUSEL_PANEL_PADDING = 32; // p-4 on both sides

// Replaces the old separate "Recent Form" win/loss dot strip AND the old static
// 5-card "Recent Matches" row with one merged, cycleable section — every match card
// clickable (routes to Coach with a match-specific prompt), paged through most-recent
// to oldest. Auto-advances on a timer AND has manual arrows/dots ("both", per the
// user's explicit choice) — auto-cycling pauses the moment you hover the carousel, so
// it never fights a viewer who's actually trying to read or click something.
function RecentMatchesCarousel({ matches, recentWins, recentLosses, onAskMatch }: { matches: Match[]; recentWins: number; recentLosses: number; onAskMatch: (m: Match) => void }) {
  const [page, setPage] = useState(0);
  const [paused, setPaused] = useState(false);
  // Always exactly 5 cards per page — but their WIDTH is measured, not fixed, so the 5
  // cards fill the panel edge to edge with no leftover gap on the right (a fixed 200px
  // card left empty space whenever the real panel was wider than exactly 5*212px).
  const outerRef = useRef<HTMLDivElement>(null);
  const [cardWidth, setCardWidth] = useState(200);

  useEffect(() => {
    const el = outerRef.current;
    if (!el) return;
    const measure = () => {
      const usable = el.clientWidth - CAROUSEL_PANEL_PADDING;
      const gapTotal = (CAROUSEL_PER_PAGE - 1) * CAROUSEL_GAP;
      setCardWidth(Math.max(120, (usable - gapTotal) / CAROUSEL_PER_PAGE));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const slideWidth = CAROUSEL_PER_PAGE * (cardWidth + CAROUSEL_GAP);
  const viewportWidth = slideWidth - CAROUSEL_GAP;
  const totalPages = Math.max(1, Math.ceil(matches.length / CAROUSEL_PER_PAGE));

  useEffect(() => {
    if (paused || totalPages <= 1) return;
    const id = setInterval(() => setPage((p) => (p + 1) % totalPages), CAROUSEL_AUTO_MS);
    return () => clearInterval(id);
  }, [paused, totalPages]);

  // Matches (or perPage, on resize) can change between renders — keep the current page in bounds.
  useEffect(() => {
    if (page >= totalPages) setPage(0);
  }, [totalPages, page]);

  return (
    <div
      ref={outerRef}
      className="glass tile3d border border-[var(--edge)] rounded-2xl p-4 mb-3.5"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <h2 className="font-display text-lg font-bold">Recent Matches</h2>
          <p className="font-tel text-sm font-bold">
            <span className="text-[var(--cyan)]">{recentWins}W</span>
            <span className="text-[var(--text-dim)]">–</span>
            <span className="text-[var(--danger)]">{recentLosses}L</span>
          </p>
        </div>
        {totalPages > 1 && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPage((p) => (p - 1 + totalPages) % totalPages)}
              className="w-7 h-7 rounded-full flex items-center justify-center bg-[var(--panel-raised)] border border-[var(--edge)] text-[var(--text-dim)] hover:text-[var(--text)] hover:border-[var(--cyan-dim)] transition-colors cursor-pointer"
              title="Previous"
            >
              <ChevronRight className="w-3.5 h-3.5 rotate-180" />
            </button>
            <div className="flex items-center gap-1.5">
              {Array.from({ length: totalPages }).map((_, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setPage(i)}
                  className="rounded-full transition-all cursor-pointer"
                  style={{ width: i === page ? 16 : 6, height: 6, background: i === page ? 'var(--cyan)' : 'var(--edge-bright)' }}
                  title={`Page ${i + 1}`}
                />
              ))}
            </div>
            <button
              type="button"
              onClick={() => setPage((p) => (p + 1) % totalPages)}
              className="w-7 h-7 rounded-full flex items-center justify-center bg-[var(--panel-raised)] border border-[var(--edge)] text-[var(--text-dim)] hover:text-[var(--text)] hover:border-[var(--cyan-dim)] transition-colors cursor-pointer"
              title="Next"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>

      {/* A single continuous track that slides via `transform`, not a remounted page per
          click — remounting (the old `key={page}` approach) just replayed a fade-in,
          which read as an instant "blink" instead of movement. One real slide animation
          instead. Cards keep a fixed width so a partially-filled last page never stretches
          a lone card to fill the row. Viewport is sized to exactly `perPage` cards, never
          the panel's full width, so a partial card can never peek in at the edge either. */}
      <div className="overflow-hidden" style={{ width: viewportWidth }}>
        <div
          className="flex gap-3 transition-transform duration-500 ease-in-out"
          style={{ transform: `translateX(-${page * slideWidth}px)` }}
        >
        {matches.map((m, i) => {
          const t = m.match_data.telemetry;
          // Colored by position WITHIN its own page (not the whole match list) so every
          // page sweeps its own CT-cyan-to-T-amber gradient across its visible cards,
          // same as before — keying off the full list's length instead made most of a
          // long history read as flat cyan with only the very last couple of cards amber.
          const accent = ctTAccent(i % CAROUSEL_PER_PAGE, CAROUSEL_PER_PAGE);
          const bg = mapScreenshotUrl(t.map);
          const matchRankBand = rankBand(t.rank_at_match_start);
          return (
            <div
              key={m.match_id}
              role="button"
              tabIndex={0}
              onClick={() => onAskMatch(m)}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onAskMatch(m); } }}
              style={{ width: cardWidth }}
              className="relative flex-none rounded-2xl overflow-hidden border border-[var(--edge)] flex flex-col cursor-pointer transition-transform hover:-translate-y-0.5"
            >
              <div className="relative h-20 shrink-0">
                {bg ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={bg} alt="" className="absolute inset-0 w-full h-full object-cover" />
                ) : (
                  <div className="absolute inset-0 bg-gradient-to-br from-[var(--panel-raised)] to-[var(--void)]" />
                )}
                {matchRankBand && typeof t.rank_at_match_start === 'number' && (
                  <div
                    className="absolute top-2 right-2 drop-shadow-md"
                    title={`Premier rank at kickoff: ${t.rank_at_match_start} (${matchRankBand.label})`}
                  >
                    <RankBadge color={matchRankBand.color} rankNew={t.rank_at_match_start} size={20} />
                  </div>
                )}
              </div>
              {/* Redesigned 2026-08-30 (NEXT_STEPS.md Band 7) — used to show only K/D; now
                  every stat the Matches tab card shows, packed into a 4-col grid since these
                  cards are ~5x narrower. Performance Index spans 2 cells (its own number is
                  wider: "NN/100") so it doesn't wrap inside a single narrow cell. */}
              <div
                className="flex flex-col gap-1 px-3 py-2 chip3d"
                style={{ borderTop: `2px solid ${accent}`, '--c': accent } as CSSProperties}
              >
                <div className="min-w-0">
                  <p className="font-display font-bold text-xs leading-none truncate">{formatMapName(t.map)}</p>
                  <p className="text-[8px] text-[var(--text-dim)] mt-1 truncate">{formatMatchDate(t)}</p>
                </div>
                <div className="grid grid-cols-4 gap-x-1 gap-y-1 text-center mt-0.5">
                  <div title="Kills-to-deaths ratio">
                    <p className="font-tel text-xs font-extrabold leading-none" style={{ color: accent }}>{t.kd_ratio}</p>
                    <p className="text-[7px] uppercase tracking-wide text-[var(--text-dim)] mt-1">K/D</p>
                  </div>
                  <div>
                    <p className="font-tel text-xs font-extrabold leading-none text-[var(--text)]">{t.kills}</p>
                    <p className="text-[7px] uppercase tracking-wide text-[var(--text-dim)] mt-1">Kills</p>
                  </div>
                  <div>
                    <p className="font-tel text-xs font-extrabold leading-none text-[var(--text)]">{t.deaths}</p>
                    <p className="text-[7px] uppercase tracking-wide text-[var(--text-dim)] mt-1">Deaths</p>
                  </div>
                  <div>
                    <p className="font-tel text-xs font-extrabold leading-none text-[var(--text)]">{t.assists ?? '—'}</p>
                    <p className="text-[7px] uppercase tracking-wide text-[var(--text-dim)] mt-1">Assists</p>
                  </div>
                  <div>
                    <p className="font-tel text-xs font-extrabold leading-none text-[var(--text)]">{t.adr}</p>
                    <p className="text-[7px] uppercase tracking-wide text-[var(--text-dim)] mt-1">ADR</p>
                  </div>
                  <div>
                    <p className="font-tel text-xs font-extrabold leading-none text-[var(--text)]">{t.headshot_pct}%</p>
                    <p className="text-[7px] uppercase tracking-wide text-[var(--text-dim)] mt-1">HS</p>
                  </div>
                  <div className="col-span-2" title="Performance Index">
                    <p className="font-tel text-xs font-extrabold leading-none text-[var(--amber)]">{performanceIndex(t)}/100</p>
                    <p className="text-[7px] uppercase tracking-wide text-[var(--text-dim)] mt-1">Performance</p>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
        </div>
      </div>
    </div>
  );
}

type TabId = 'home' | 'matches' | 'insights' | 'coach' | 'settings';
const TAB_IDS: TabId[] = ['home', 'matches', 'insights', 'coach', 'settings'];

export default function Home() {
  const [activeTab, setActiveTabState] = useState<TabId>('home');

  // Tab switches used to be pure React state with zero browser-history entries, so
  // pressing Back (or a mouse "Back" side button, which the browser treats identically)
  // had nothing of ours to return to and fell straight through to whatever page was open
  // before RoundSync — closing/leaving the app entirely instead of just switching tabs.
  // Pushing a real history entry per tab, and listening for the browser's own back/forward
  // navigation, makes Back move between RoundSync's tabs first, same as any real multi-page site.
  const setActiveTab = useCallback((tab: TabId) => {
    setActiveTabState(tab);
    const url = new URL(window.location.href);
    url.searchParams.set('tab', tab);
    window.history.pushState({ tab }, '', url.toString());
  }, []);

  useEffect(() => {
    const fromUrl = new URLSearchParams(window.location.search).get('tab');
    if (fromUrl && (TAB_IDS as string[]).includes(fromUrl)) {
      setActiveTabState(fromUrl as TabId);
    } else {
      // Establish a baseline history entry so the very first Back press has an in-app
      // state to land on, instead of immediately leaving.
      const url = new URL(window.location.href);
      url.searchParams.set('tab', 'home');
      window.history.replaceState({ tab: 'home' }, '', url.toString());
    }

    const onPopState = (e: PopStateEvent) => {
      const tab = (e.state?.tab as TabId | undefined) || (new URLSearchParams(window.location.search).get('tab') as TabId | null) || 'home';
      setActiveTabState(tab);
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);
  const [steamId, setSteamId] = useState<string | null>(null);
  const [jwtToken, setJwtToken] = useState<string | null>(null);
  const [matches, setMatches] = useState<Match[]>([]);
  const [isLoadingMatches, setIsLoadingMatches] = useState(false);
  const typedMessageIndices = useRef<Set<number>>(new Set());

  // Onboarding status — null while unknown, then a real true/false from the server
  const [isOnboarded, setIsOnboarded] = useState<boolean | null>(null);
  const [gameAuthCode, setGameAuthCode] = useState('');
  const [recentShareCode, setRecentShareCode] = useState('');
  const [isOnboarding, setIsOnboarding] = useState(false);

  // Real Steam identity — fetched from the server, not just the raw SteamID
  const [personaName, setPersonaName] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [rankNew, setRankNew] = useState<number | null>(null);
  const [rankChangeEvent, setRankChangeEvent] = useState<RankChangeEvent | null>(null);

  // Replaces the old showWelcomeToast boolean — one generic toast slot now covers both
  // the success message and any error that used to be a jarring browser alert() instead.
  const [toast, setToast] = useState<{ message: string; subtext?: string; variant?: 'success' | 'error' } | null>(null);

  // Sync progress — how many matches are queued/downloading/done, and how long the current one has taken
  interface SyncStatus {
    counts: { pending_url: number; pending_download: number; downloading: number; fully_parsed: number; parse_failed: number };
    current: { matchId: string; startedAt: number } | null;
    avgSeconds: number | null;
  }
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null);
  const [nowSeconds, setNowSeconds] = useState(() => Date.now() / 1000);

  // Lifetime Steam stats (career totals, not RoundSync-tracked matches) — fills the empty
  // state with something real on day one, before any match has finished parsing.
  interface LifetimeStats {
    available: boolean;
    careerKd: number | null;
    winRatePct: number | null;
    headshotPct: number | null;
    bestWeapon: { label: string; kills: number; accuracyPct: number | null } | null;
  }
  const [lifetimeStats, setLifetimeStats] = useState<LifetimeStats | null>(null);
  // Read by the match/sync-status polling effect below to decide its next delay without
  // needing to re-run (and re-subscribe) that effect on every syncStatus update.
  const hasActiveSyncRef = useRef(false);
  useEffect(() => {
    const counts = syncStatus?.counts;
    const queued = counts ? counts.pending_url + counts.pending_download : 0;
    hasActiveSyncRef.current = queued > 0 || (counts?.downloading ?? 0) > 0;
  }, [syncStatus]);

  // Tracks how many matches were still queued/downloading when the CURRENT sync batch
  // began, so the "ready"/"failed" counts below reflect only matches finished during this
  // sync — not the player's entire lifetime match history. Without this, an old,
  // already-parsed match count made a fresh sync look far more "done" than it actually was.
  const [syncBatchBaseline, setSyncBatchBaseline] = useState<{ total: number; readyAtStart: number; failedAtStart: number } | null>(null);
  useEffect(() => {
    const counts = syncStatus?.counts;
    if (!counts) return;
    const active = hasActiveSyncRef.current;
    if (active && !syncBatchBaseline) {
      setSyncBatchBaseline({
        total: counts.pending_url + counts.pending_download + counts.downloading,
        readyAtStart: counts.fully_parsed,
        failedAtStart: counts.parse_failed,
      });
    } else if (!active && syncBatchBaseline) {
      setSyncBatchBaseline(null);
    }
  }, [syncStatus, syncBatchBaseline]);

  // Chat State
  const [chatInput, setChatInput] = useState('');
  const [messages, setMessages] = useState<{ role: 'user' | 'assistant'; content: string }[]>([]);
  const [isSendingMessage, setIsSendingMessage] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  // Conversations for the recent-chats sidebar. Initial grouping comes from a gap-based
  // heuristic over server history (coaching_history has no real thread concept); once
  // loaded, groups are managed as real client state (not re-derived), so "New Chat"
  // followed immediately by a message reliably starts its own group instead of silently
  // merging into the previous one because they happened to be close in time.
  const [conversations, setConversations] = useState<ConversationGroup[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [showTopicWheel, setShowTopicWheel] = useState(false);

  const performanceTooltip = useHoverTooltip(
    'Performance Index: a single 0-100 score blending your K/D ratio, damage per round, and headshot percentage. Click to ask the coach about it.'
  );
  const matchPerformanceTooltip = useHoverTooltip(
    'Performance: a single 0-100 score blending K/D ratio, damage per round, and headshot percentage for this match.'
  );

  const fetchProfile = useCallback(async (token: string) => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/user/profile`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.status === 401 || response.status === 403) { handleLogout(); return; }
      const data = await response.json();
      setIsOnboarded(Boolean(data.onboarded));
      setPersonaName(data.personaName || null);
      setAvatarUrl(data.avatarUrl || null);
      setRankNew(typeof data.rankNew === 'number' ? data.rankNew : null);
    } catch (err) {
      console.error('Error fetching profile:', err);
    }
  }, []);

  // Loads past coaching Q&A on page load so a refresh doesn't wipe the conversation.
  // Every loaded message is marked as already-typed so the typewriter effect only ever
  // plays for a genuinely new reply, not on every past message when history is restored.
  const fetchChatHistory = useCallback(async (token: string) => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/coaching/history`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.status === 401 || response.status === 403) { handleLogout(); return; }
      const data = await response.json();
      if (!Array.isArray(data.history)) return;
      // Only populates the recent-chats sidebar — the chat pane itself starts blank on
      // a fresh page load. The player picks a past conversation to continue, or starts new.
      setConversations(groupIntoConversations(data.history));
    } catch (err) {
      console.error('Error fetching chat history:', err);
    }
  }, []);

  const fetchSyncStatus = useCallback(async (token: string) => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/matches/sync-status`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.status === 401 || response.status === 403) { handleLogout(); return; }
      const data = await response.json();
      if (data.counts) setSyncStatus(data);
    } catch (err) {
      console.error('Error fetching sync status:', err);
    }
  }, []);

  const fetchLifetimeStats = useCallback(async (token: string) => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/user/lifetime-stats`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.status === 401 || response.status === 403) { handleLogout(); return; }
      const data = await response.json();
      setLifetimeStats(data);
    } catch (err) {
      console.error('Error fetching lifetime stats:', err);
    }
  }, []);

  const fetchMatches = useCallback(async () => {
    if (!jwtToken) return;
    setIsLoadingMatches(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/matches`, {
        headers: { 'Authorization': `Bearer ${jwtToken}` }
      });
      if (response.status === 401 || response.status === 403) {
        handleLogout();
        return;
      }
      const data = await response.json();
      if (data.matches) {
        setMatches(data.matches);
      }
    } catch (err) {
      console.error('Error fetching matches:', err);
    } finally {
      setIsLoadingMatches(false);
    }
  }, [jwtToken]);

  // Load Session on Mount (silent — no welcome toast on a page refresh)
  useEffect(() => {
    const savedSteamId = localStorage.getItem('steamId');
    const savedToken = localStorage.getItem('jwtToken');
    if (savedSteamId && savedToken) {
      setSteamId(savedSteamId);
      setJwtToken(savedToken);
    }
  }, []);


  // Fetch match history + onboarding status whenever the token changes, then poll matches
  useEffect(() => {
    if (jwtToken) {
      fetchProfile(jwtToken);
      fetchMatches();
      fetchSyncStatus(jwtToken);
      fetchChatHistory(jwtToken);
      fetchLifetimeStats(jwtToken);

      // Poll every 10s only while something's actually in flight — once idle, back off to
      // every 60s. A real CS2 match takes 30+ minutes to play, so nothing meaningful ever
      // changes between one idle 10s poll and the next; hammering the API/DB that often
      // forever, for a tab just left open, was pure waste against this project's own
      // $0-cost constraint. setTimeout (not setInterval) so the delay can change each cycle
      // based on the latest known sync state, via hasActiveSyncRef below.
      let cancelled = false;
      let timer: ReturnType<typeof setTimeout>;
      const scheduleNext = (delayMs: number) => {
        timer = setTimeout(async () => {
          if (cancelled) return;
          await Promise.all([fetchMatches(), fetchSyncStatus(jwtToken)]);
          if (cancelled) return;
          scheduleNext(hasActiveSyncRef.current ? 10000 : 60000);
        }, delayMs);
      };
      scheduleNext(10000);
      return () => { cancelled = true; clearTimeout(timer); };
    }
  }, [jwtToken, fetchProfile, fetchMatches, fetchSyncStatus, fetchChatHistory, fetchLifetimeStats]);

  // Detects a real rank change since the last time this player loaded Home (tracked
  // per-browser via localStorage, not a server-side history table — this is purely a
  // presentation flourish, not data the rest of the app depends on). Fires the full-screen
  // takeover only when the player crossed into a different Premier band; a same-band move
  // gets the small inline badge instead. Lives on Home (not Insights) since this is where
  // the player's rank badge is actually shown.
  useEffect(() => {
    if (rankNew === null || rankNew === undefined) return;
    let stored: string | null = null;
    try {
      stored = localStorage.getItem(LAST_KNOWN_RANK_KEY);
    } catch {
      return;
    }
    const prevRank = stored !== null ? parseInt(stored, 10) : null;
    if (prevRank !== null && !Number.isNaN(prevRank) && prevRank !== rankNew) {
      const prevBandIdx = rankBandIndex(prevRank);
      const newBandIdx = rankBandIndex(rankNew);
      setRankChangeEvent({
        direction: rankNew > prevRank ? 'up' : 'down',
        crossedBand: prevBandIdx !== newBandIdx,
        prevRank,
        newRank: rankNew,
        prevBandLabel: RANK_BANDS[prevBandIdx].label,
        newBandLabel: RANK_BANDS[newBandIdx].label,
        prevBandColor: RANK_BANDS[prevBandIdx].color,
        newBandColor: RANK_BANDS[newBandIdx].color,
      });
    }
    try {
      localStorage.setItem(LAST_KNOWN_RANK_KEY, String(rankNew));
    } catch {
      // best-effort only — a private window or cleared storage just means no celebration next time
    }
  }, [rankNew]);

  // Tick every second so the "elapsed" timer on the currently-downloading match moves smoothly
  // between the 10-second polls, instead of jumping.
  useEffect(() => {
    if (!syncStatus?.current) return;
    const tick = setInterval(() => setNowSeconds(Date.now() / 1000), 1000);
    return () => clearInterval(tick);
  }, [syncStatus?.current]);

  // Scroll Chat to Bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Handle cross-window Steam callback listener
  useEffect(() => {
    const handleSteamMessage = async (event: MessageEvent) => {
      if (event.data?.type === 'STEAM_LOGIN' && event.data?.proof) {
        try {
          const response = await fetch(`${API_BASE_URL}/api/auth/token`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ proof: event.data.proof })
          });
          const data = await response.json();
          if (data.token && data.steamId) {
            setSteamId(data.steamId);
            setJwtToken(data.token);
            localStorage.setItem('steamId', data.steamId);
            localStorage.setItem('jwtToken', data.token);
            setToast({ message: 'Successfully signed in', subtext: 'Your Steam account is authenticated.' });
          }
        } catch (err) {
          setToast({ message: 'Failed to obtain authenticated token from API Gateway.', variant: 'error' });
        }
      }
    };
    window.addEventListener('message', handleSteamMessage);
    return () => window.removeEventListener('message', handleSteamMessage);
  }, []);

  const loginWithSteam = () => {
    const width = 600, height = 600;
    const left = window.screen.width / 2 - width / 2;
    const top = window.screen.height / 2 - height / 2;
    window.open(
      '/api/auth/steam',
      'Steam Login',
      `width=${width},height=${height},left=${left},top=${top}`
    );
  };

  const handleLogout = () => {
    setSteamId(null);
    setJwtToken(null);
    setMatches([]);
    setMessages([]);
    typedMessageIndices.current.clear();
    setIsOnboarded(null);
    setPersonaName(null);
    setAvatarUrl(null);
    localStorage.removeItem('steamId');
    localStorage.removeItem('jwtToken');
    setActiveTab('home');
  };

  const handleOnboarding = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!jwtToken) return;
    setIsOnboarding(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/user/onboard`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${jwtToken}`
        },
        body: JSON.stringify({ gameAuthCode, recentShareCode })
      });
      const data = await response.json();
      if (data.success) {
        setIsOnboarded(true);
        setActiveTab('home');
      } else {
        setToast({ message: `Onboarding error: ${data.error || 'Unknown error'}`, variant: 'error' });
      }
    } catch (err) {
      setToast({ message: 'Failed to connect to API Gateway for onboarding.', variant: 'error' });
    } finally {
      setIsOnboarding(false);
    }
  };

  // The one bridge every clickable tile in the app (Home tiles, chart points, match cards,
  // Insights stat tiles, map-breakdown cells) routes through: fill the chat input with a
  // question specific to whatever was clicked and jump to the Coach tab — never auto-send,
  // so the player can edit or add context before asking.
  const promptCoach = (question: string) => {
    setChatInput(question);
    setActiveTab('coach');
  };

  // Fills the chat input from the topic wheel without navigating (we're already on
  // Coach) and closes the popup — still never auto-sends.
  const fillFromWheel = (question: string | null) => {
    if (question) setChatInput(question);
    setShowTopicWheel(false);
  };

  const askCoach = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim() || !jwtToken || isSendingMessage) return;

    const userMsg = chatInput;
    setChatInput('');
    setMessages(prev => [...prev, { role: 'user', content: userMsg }]);
    setIsSendingMessage(true);

    try {
      const response = await fetch(`${API_BASE_URL}/api/coaching/ask`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${jwtToken}`
        },
        body: JSON.stringify({ question: userMsg })
      });
      const data = await response.json();
      if (data.response) {
        setMessages(prev => [...prev, { role: 'assistant', content: data.response }]);

        // File this real exchange into the active conversation (or start a new one if
        // there isn't one — first message ever, or right after "New Chat").
        const newEntry: ChatHistoryEntry = { question: userMsg, response: data.response, created_at: new Date().toISOString() };
        const existingIdx = activeConversationId ? conversations.findIndex((g) => g.id === activeConversationId) : -1;
        if (existingIdx !== -1) {
          setConversations((prev) => {
            const updated = [...prev];
            const group = updated[existingIdx];
            updated[existingIdx] = { ...group, entries: [...group.entries, newEntry], lastAt: newEntry.created_at };
            return updated;
          });
        } else {
          const newGroup: ConversationGroup = { id: newEntry.created_at, entries: [newEntry], startedAt: newEntry.created_at, lastAt: newEntry.created_at };
          setConversations((prev) => [...prev, newGroup]);
          setActiveConversationId(newGroup.id);
        }
      } else {
        setMessages(prev => [...prev, { role: 'assistant', content: `⚠️ Error: ${data.error || 'Server error'}` }]);
      }
    } catch (err) {
      setMessages(prev => [...prev, { role: 'assistant', content: '⚠️ Failed to connect to API Gateway.' }]);
    } finally {
      setIsSendingMessage(false);
    }
  };

  const switchConversation = (group: ConversationGroup) => {
    const restored = conversationToMessages(group);
    restored.forEach((m, idx) => { if (m.role === 'assistant') typedMessageIndices.current.add(idx); });
    setMessages(restored);
    setActiveConversationId(group.id);
  };

  const startNewChat = () => {
    setMessages([]);
    setActiveConversationId(null);
  };

  // Front-end only — removes a conversation from this browser's sidebar list. The
  // underlying coaching_history rows aren't touched, so it comes back on next login;
  // that's fine, this is a "declutter my view" control, not real deletion.
  const deleteConversation = (e: React.MouseEvent, groupId: string) => {
    e.stopPropagation();
    setConversations((prev) => prev.filter((g) => g.id !== groupId));
    if (activeConversationId === groupId) {
      setMessages([]);
      setActiveConversationId(null);
    }
  };

  // Compute Dashboard Metrics
  const parsedMatches = matches
    .filter(m => m.match_data.telemetry?.status === 'fully_parsed')
    .sort((a, b) => matchSortKey(b) - matchSortKey(a));
  // Dashboard-only: a true combined K/D (total kills ÷ total deaths across recent
  // matches), not an average of each match's individual ratio — this specifically
  // does NOT apply to the per-match K/D shown in the Matches tab or trend chart,
  // which are already each match's own real ratio and need no change.
  const avgKd = parsedMatches.length > 0
    ? (
        parsedMatches.reduce((acc, m) => acc + m.match_data.telemetry.kills, 0) /
        Math.max(1, parsedMatches.reduce((acc, m) => acc + m.match_data.telemetry.deaths, 0))
      ).toFixed(2)
    : '0.00';
  // Prefer a true weighted average (sum of raw damage / sum of real rounds played) using
  // matches that captured those raw components — only matches parsed after the /24
  // hardcoded-rounds bug was fixed have them. Falls back to the old average-of-rates
  // method when none of the recent matches have raw data yet, so the tile never goes blank.
  const matchesWithRawAdr = parsedMatches.filter(m => m.match_data.telemetry.rounds_played);
  const avgAdr = matchesWithRawAdr.length > 0
    ? (
        matchesWithRawAdr.reduce((acc, m) => acc + (m.match_data.telemetry.total_damage || 0), 0) /
        Math.max(1, matchesWithRawAdr.reduce((acc, m) => acc + (m.match_data.telemetry.rounds_played || 0), 0))
      ).toFixed(1)
    // Fallback weighted by rounds_played (ADR's own real denominator) instead of a flat
    // average of each match's already-computed rate — a 13-round match no longer counts
    // exactly as much as a 30-round one.
    : (avgWeighted(parsedMatches, (t) => t.adr, (t) => t.rounds_played) ?? 0).toFixed(1);
  const matchesWithRawHs = parsedMatches.filter(m => typeof m.match_data.telemetry.headshots === 'number');
  const avgHs = matchesWithRawHs.length > 0
    ? (
        (matchesWithRawHs.reduce((acc, m) => acc + (m.match_data.telemetry.headshots || 0), 0) /
        Math.max(1, matchesWithRawHs.reduce((acc, m) => acc + m.match_data.telemetry.kills, 0))) * 100
      ).toFixed(1)
    // Fallback weighted by kills (headshot_pct's real denominator is kills, not rounds).
    : (avgWeighted(parsedMatches, (t) => t.headshot_pct, (t) => t.kills) ?? 0).toFixed(1);
  const avgPerformanceIndex = parsedMatches.length > 0
    ? Math.round(parsedMatches.reduce((acc, m) => acc + performanceIndex(m.match_data.telemetry), 0) / parsedMatches.length)
    : 0;

  // Secondary KPI row (Part 3 backend fields) — each is null when no recent match has that
  // field yet (older matches parsed before this shipped), in which case the tile shows "—".
  // Weighted by each stat's real denominator (rounds for a per-round rate, kills for a
  // per-kill rate) instead of averaged as if every match carried equal weight — see
  // avgWeighted's own comment for why this isn't just cosmetic.
  const avgEntrySuccessPct = avgWeighted(parsedMatches, (t) => t.entry_success_pct, (t) => t.rounds_played);
  const avgUtilityDmgPerRound = avgWeighted(parsedMatches, (t) => t.utility_dmg_per_round, (t) => t.rounds_played);
  const totalClutchesWon = sumOptionalField(parsedMatches, (t) => t.clutches_won);
  const avgTradeKillPct = avgWeighted(parsedMatches, (t) => t.trade_kill_pct, (t) => t.kills);
  const avgKastPct = avgWeighted(parsedMatches, (t) => t.kast_pct, (t) => t.rounds_played);
  const avgHeadshotAccuracyPct = avgWeighted(parsedMatches, (t) => t.headshot_accuracy_pct, (t) => t.rounds_played);
  const totalMultiKillRounds = sumOptionalField(parsedMatches, (t) =>
    t.multi_kill_rounds ? t.multi_kill_rounds['2k'] + t.multi_kill_rounds['3k'] + t.multi_kill_rounds['4k'] + t.multi_kill_rounds.ace : null
  );

  // Recent Form strip — same kd_ratio >= 1 win/loss proxy the Matches tab already uses for
  // match-card accent color, just tallied here instead of colored per-card.
  const recentForm = parsedMatches.slice(0, 10);
  const recentWins = recentForm.filter((m) => m.match_data.telemetry.kd_ratio >= 1).length;
  const recentLosses = recentForm.length - recentWins;

  // `uid` (a plain index) is the chart's x-axis key instead of `name` — two matches on the
  // same map share a `name`, and Recharts resolves hover/click position by matching the
  // x-axis category value, so a non-unique key made it snap to the first match with that
  // name instead of the one actually under the cursor.
  const chartData = parsedMatches.map((m, i) => ({
    uid: i,
    name: m.match_data.telemetry.map ? formatMapName(m.match_data.telemetry.map) : m.match_id.substring(5, 12),
    date: formatMatchDate(m.match_data.telemetry),
    kd: m.match_data.telemetry.kd_ratio,
    adr: m.match_data.telemetry.adr,
    hs: m.match_data.telemetry.headshot_pct,
    perf: performanceIndex(m.match_data.telemetry),
  })).reverse();

  const isLive = isOnboarded === true;

  // The Coach tab's "Choose a Topic" radial wheel — one spoke per category. These are
  // deliberately NOT the same questions as the Home/Insights/Matches tile prompts (which
  // each ask about one exact stat's exact number) — the wheel is a broader, open-ended
  // conversation starter per area of the game, so its wording stays genuinely distinct
  // even where the topic overlaps a tile elsewhere. A dynamic "Last Match" spoke and a
  // "type my own" spoke (null prompt = doesn't send anything) round it out.
  const lastParsedMatch = parsedMatches[0];
  const wheelSegments: { id: string; label: string; icon: React.ElementType; prompt: string | null }[] = [
    { id: 'aim', label: 'Aim & Reaction', icon: Crosshair, prompt: 'Where is my aim actually costing me rounds — not just in general, but in specific moments?' },
    { id: 'positioning', label: 'Positioning', icon: MapPinned, prompt: 'Walk me through my worst positioning habit right now.' },
    { id: 'engage', label: 'Engage vs. Save', icon: Users, prompt: 'Give me a rule of thumb for when I should fight outnumbered versus back off.' },
    { id: 'economy', label: 'Buy Decisions', icon: Coins, prompt: 'Is my buy pattern actually hurting my team, or does it just feel that way?' },
    { id: 'utility', label: 'Utility', icon: Flame, prompt: "What's the single biggest upgrade I could make to how I use my grenades?" },
    {
      id: 'last-match',
      label: 'Last Match',
      icon: Clock,
      prompt: lastParsedMatch
        ? `Break down my last match on ${formatMapName(lastParsedMatch.match_data.telemetry.map)} (${formatMatchDate(lastParsedMatch.match_data.telemetry)}) like you were coaching me live.`
        : 'Break down my last match like you were coaching me live.',
    },
    { id: 'trade', label: 'Trade Discipline', icon: Repeat, prompt: 'Am I actually bad at trading kills, or just unlucky with timing?' },
    { id: 'custom', label: 'Type my own', icon: Plus, prompt: null },
  ];

  // Sync progress math — scoped to the CURRENT sync batch (see syncBatchBaseline above),
  // not the player's lifetime match count.
  const syncCounts = syncStatus?.counts;
  const batchTotal = syncBatchBaseline?.total ?? 0;
  const batchReadyCount = syncBatchBaseline ? Math.max(0, (syncCounts?.fully_parsed ?? 0) - syncBatchBaseline.readyAtStart) : 0;
  const batchFailedCount = syncBatchBaseline ? Math.max(0, (syncCounts?.parse_failed ?? 0) - syncBatchBaseline.failedAtStart) : 0;
  const queuedCount = syncCounts ? syncCounts.pending_url + syncCounts.pending_download : 0;
  const hasActiveSync = queuedCount > 0 || (syncCounts?.downloading ?? 0) > 0;
  const currentElapsed = syncStatus?.current ? Math.max(0, nowSeconds - syncStatus.current.startedAt) : 0;
  const currentPct = syncStatus?.avgSeconds
    ? Math.min(96, Math.round((currentElapsed / syncStatus.avgSeconds) * 100))
    : null;

  // ---------- LOGGED-OUT LANDING ----------
  if (!steamId) {
    return (
      <div className="relative min-h-screen overflow-hidden text-[var(--text)] flex flex-col items-center justify-center px-6">
        {/* A failed Steam login callback can fire while still on this logged-out landing
            page (steamId isn't set yet at that point), so this needs its own toast render,
            not just the logged-in shell's below. */}
        {toast && (
          <Toast
            message={toast.message}
            subtext={toast.subtext}
            variant={toast.variant}
            onDone={() => setToast(null)}
          />
        )}
        <div className="relative z-10 max-w-2xl w-full text-center">
          <div className="flex justify-center mb-8">
            <LogoMark className="w-20 h-20" />
          </div>
          <h1 className="font-display text-5xl font-bold tracking-wide mb-4">
            Round<span className="text-[var(--cyan)]">Sync</span>
          </h1>
          <p className="text-lg text-[var(--text-dim)] mb-3 max-w-xl mx-auto">
            Every other CS2 tracker tells you <em>what</em> happened. RoundSync's AI tells you exactly
            <span className="text-[var(--amber)] font-semibold"> why </span>
            it happened — the specific peek, the specific decision — not a generic tip.
          </p>

          <button
            onClick={loginWithSteam}
            className="mt-6 px-8 py-4 bg-[var(--cyan)] hover:bg-[#5eead4] text-[#03141a] font-bold rounded-xl shadow-lg shadow-cyan-500/20 transition-all inline-flex items-center gap-3 text-lg"
          >
            Sign In With Steam
            <ChevronRight className="w-5 h-5" />
          </button>

          {/* HUD-style readout strip — thin dividers between columns instead of 3 boxy cards */}
          <div className="hud-corners relative mt-12 bg-[var(--panel)]/80 border border-[var(--edge)] rounded-xl grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-[var(--edge)] text-left">
            <div className="p-5">
              <div className="flex items-center gap-2 mb-1.5">
                <Crosshair className="w-4 h-4 text-[var(--cyan)] shrink-0" />
                <p className="font-semibold text-sm">Moment-level analysis</p>
              </div>
              <p className="text-xs text-[var(--text-dim)]">Not match averages — the exact peek, duel, and decision.</p>
            </div>
            <div className="p-5">
              <div className="flex items-center gap-2 mb-1.5">
                <Radar className="w-4 h-4 text-[var(--cyan)] shrink-0" />
                <p className="font-semibold text-sm">Personalized, not generic</p>
              </div>
              <p className="text-xs text-[var(--text-dim)]">No population benchmarks — coaching built from your own games.</p>
            </div>
            <div className="p-5">
              <div className="flex items-center gap-2 mb-1.5">
                <Brain className="w-4 h-4 text-[var(--cyan)] shrink-0" />
                <p className="font-semibold text-sm">A coach that explains why</p>
              </div>
              <p className="text-xs text-[var(--text-dim)]">Ask it anything about your last match, in plain language.</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ---------- LOGGED-IN APP SHELL ----------
  return (
    <div className="min-h-screen text-[var(--text)]">
      {toast && (
        <Toast
          message={toast.message}
          subtext={toast.subtext}
          variant={toast.variant}
          onDone={() => setToast(null)}
        />
      )}

      <TopNav
        activeTab={activeTab}
        onTabChange={setActiveTab}
        isLive={isLive}
        personaName={personaName}
        avatarUrl={avatarUrl}
        steamId={steamId}
        onLogout={handleLogout}
      />

      {/* HOME: onboarding gate, then the real hero dashboard */}
      {activeTab === 'home' && (
        isOnboarded === null ? (
          <div className="flex items-center justify-center h-[60vh] text-[var(--text-dim)] gap-3">
            <Loader2 className="w-6 h-6 animate-spin" /> Checking your setup...
          </div>
        ) : !isOnboarded ? (
          <div className="max-w-xl mx-auto px-6 py-16">
            <div className="hud-corners bg-[var(--panel)] border border-[var(--edge)] p-8 rounded-2xl">
              <div className="flex justify-center mb-4">
                <Target className="w-12 h-12 text-[var(--cyan)]" />
              </div>
              <h3 className="text-xl font-display font-bold mb-2 text-center">One-time setup</h3>
              <p className="text-sm text-[var(--text-dim)] text-center mb-6">
                Give RoundSync your CS2 game authentication code and one recent match share code, and it'll sync your matches automatically from here on.
              </p>
              <OnboardingForm
                gameAuthCode={gameAuthCode} setGameAuthCode={setGameAuthCode}
                recentShareCode={recentShareCode} setRecentShareCode={setRecentShareCode}
                isOnboarding={isOnboarding} onSubmit={handleOnboarding}
                submitLabel="Activate Auto-Sync" fullWidthButton shareCodeHint
              />
            </div>
          </div>
        ) : (
          <div>
            {rankChangeEvent && rankChangeEvent.crossedBand && (
              <RankBandTakeover event={rankChangeEvent} onDone={() => setRankChangeEvent(null)} />
            )}

            <div className="max-w-7xl mx-auto px-6 py-6">
              <p className="text-xs text-[var(--text-dim)] mb-3">
                Stats based on your last {parsedMatches.length} recent games
              </p>

              {/* Top row: profile tile sits as a peer of K/D, ADR, Headshot % — same height/style.
                  Each tile gets one flat "duel" color from its position in the row (leftmost =
                  CT cyan, rightmost = T amber), same bold embossed treatment as the Insights
                  category tiles — not a gradient within any one tile. */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5 mb-3.5">
                <div className="chip3d border border-[var(--edge)] rounded-2xl p-5 flex items-center gap-3.5" style={{ '--c': ctTAccent(0, 4) } as CSSProperties}>
                  {avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={avatarUrl} alt="" className="w-14 h-14 rounded-full border-2 border-[var(--edge-bright)] shrink-0" />
                  ) : (
                    <div className="w-14 h-14 rounded-full bg-[var(--panel-raised)] border-2 border-[var(--edge-bright)] shrink-0" />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-display text-base font-bold truncate">{personaName || 'Player'}</p>
                      {/* The Profile tile's identity (avatar/name/rank) stays a non-clickable
                          block, but the Performance metric embedded in it is its own click
                          target — plus an Info icon + a custom cursor-following tooltip
                          (not the browser's plain native `title` popup) since "Performance"
                          alone doesn't explain what's being measured. */}
                      <button
                        type="button"
                        onClick={() => promptCoach(`My performance index is ${avgPerformanceIndex}/100 — a blended score from my K/D ratio, ADR, and headshot percentage. What's dragging it down the most?`)}
                        className="group flex items-center gap-1 text-[11px] uppercase tracking-wider text-[var(--text-dim)] shrink-0 cursor-pointer hover:text-[var(--text)] transition-colors"
                        {...performanceTooltip.handlers}
                      >
                        Performance <span className="font-tel font-bold text-[var(--amber)]">{avgPerformanceIndex}</span>
                        <Info className="w-3 h-3 opacity-60 group-hover:opacity-100" />
                      </button>
                      {performanceTooltip.tooltip}
                    </div>
                    <div className="flex items-center gap-1.5 mt-1.5">
                      <RankBadge color={rankBand(rankNew)?.color ?? '#9ca3af'} rankNew={rankNew} size={26} />
                      {rankChangeEvent && !rankChangeEvent.crossedBand && <RankDeltaBadge event={rankChangeEvent} />}
                    </div>
                    <div className="w-full h-2 bg-[var(--void)] rounded-full overflow-hidden mt-2 shadow-[inset_0_1px_3px_rgba(0,0,0,0.6)]">
                      <div
                        className="h-full bar3d-h rounded-full transition-all duration-500"
                        style={{ '--c': 'var(--amber)', width: `${Math.max(4, Math.min(100, avgPerformanceIndex))}%` } as CSSProperties}
                      />
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => promptCoach(`My average K/D over my last ${parsedMatches.length} games is ${avgKd}. Is that good for my rank, and what's dragging it down?`)}
                  className="chip3d border border-[var(--edge)] rounded-2xl p-5 text-center transition-transform hover:-translate-y-0.5 cursor-pointer"
                  style={{ '--c': ctTAccent(1, 4) } as CSSProperties}
                >
                  <div className="flex items-center justify-center gap-1.5 mb-2">
                    <Target className="w-4 h-4 text-[var(--cyan)]" />
                    <p className="text-[11px] uppercase tracking-wider text-[var(--text-dim)]">K/D Ratio</p>
                  </div>
                  <p className="font-tel text-3xl font-bold text-[var(--cyan)]">{avgKd}</p>
                </button>
                <button
                  type="button"
                  onClick={() => promptCoach(`My average ADR over my last ${parsedMatches.length} games is ${avgAdr}. What's the biggest thing holding my damage output back?`)}
                  className="chip3d border border-[var(--edge)] rounded-2xl p-5 text-center transition-transform hover:-translate-y-0.5 cursor-pointer"
                  style={{ '--c': ctTAccent(2, 4) } as CSSProperties}
                >
                  <div className="flex items-center justify-center gap-1.5 mb-2">
                    <Zap className="w-4 h-4 text-[var(--amber)]" />
                    <p className="text-[11px] uppercase tracking-wider text-[var(--text-dim)]">Avg ADR</p>
                  </div>
                  <p className="font-tel text-3xl font-bold">{avgAdr}</p>
                </button>
                <button
                  type="button"
                  onClick={() => promptCoach(`My headshot percentage is ${avgHs}%. How can I improve it?`)}
                  className="chip3d border border-[var(--edge)] rounded-2xl p-5 text-center transition-transform hover:-translate-y-0.5 cursor-pointer"
                  style={{ '--c': ctTAccent(3, 4) } as CSSProperties}
                >
                  <div className="flex items-center justify-center gap-1.5 mb-2">
                    <Crosshair className="w-4 h-4 text-[var(--cyan)]" />
                    <p className="text-[11px] uppercase tracking-wider text-[var(--text-dim)]">Headshot %</p>
                  </div>
                  <p className="font-tel text-3xl font-bold">{avgHs}%</p>
                </button>
              </div>

              {/* Secondary metrics — real per-match fields from the demo parser */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5 mb-3.5">
                <button
                  type="button"
                  onClick={() => promptCoach('How is my entry success rate — am I trading my life for enough value when I open a site?')}
                  className="chip3d border border-[var(--edge)] rounded-2xl p-4 flex flex-col items-center justify-center text-center transition-transform hover:-translate-y-0.5 cursor-pointer"
                  style={{ '--c': ctTAccent(0, 4) } as CSSProperties}
                >
                  <div className="flex items-center justify-center gap-1.5 mb-1.5">
                    <LogIn className="w-3.5 h-3.5 text-[var(--cyan)]" />
                    <p className="text-[11px] uppercase tracking-wider text-[var(--text-dim)]">Entry Success</p>
                  </div>
                  <p className="font-tel text-2xl font-bold">{avgEntrySuccessPct !== null ? `${avgEntrySuccessPct.toFixed(1)}%` : '—'}</p>
                </button>
                <button
                  type="button"
                  onClick={() => promptCoach('Is my utility damage per round low? What am I doing wrong with my grenades?')}
                  className="chip3d border border-[var(--edge)] rounded-2xl p-4 flex flex-col items-center justify-center text-center transition-transform hover:-translate-y-0.5 cursor-pointer"
                  style={{ '--c': ctTAccent(1, 4) } as CSSProperties}
                >
                  <div className="flex items-center justify-center gap-1.5 mb-1.5">
                    <Flame className="w-3.5 h-3.5 text-[var(--amber)]" />
                    <p className="text-[11px] uppercase tracking-wider text-[var(--text-dim)]">Utility Dmg/Rd</p>
                  </div>
                  <p className="font-tel text-2xl font-bold">{avgUtilityDmgPerRound !== null ? avgUtilityDmgPerRound.toFixed(1) : '—'}</p>
                </button>
                <button
                  type="button"
                  onClick={() => promptCoach("Walk me through my clutch rounds — what am I doing right or wrong when I'm the last one alive?")}
                  className="chip3d border border-[var(--edge)] rounded-2xl p-4 flex flex-col items-center justify-center text-center transition-transform hover:-translate-y-0.5 cursor-pointer"
                  style={{ '--c': ctTAccent(2, 4) } as CSSProperties}
                >
                  <div className="flex items-center justify-center gap-1.5 mb-1.5">
                    <Users className="w-3.5 h-3.5 text-[var(--cyan)]" />
                    <p className="text-[11px] uppercase tracking-wider text-[var(--text-dim)]">Clutches Won</p>
                  </div>
                  <p className="font-tel text-2xl font-bold">{totalClutchesWon !== null ? totalClutchesWon : '—'}</p>
                </button>
                <button
                  type="button"
                  onClick={() => promptCoach("My trade kill percentage feels low — which of my deaths had a teammate nearby who could have traded but didn't?")}
                  className="chip3d border border-[var(--edge)] rounded-2xl p-4 flex flex-col items-center justify-center text-center transition-transform hover:-translate-y-0.5 cursor-pointer"
                  style={{ '--c': ctTAccent(3, 4) } as CSSProperties}
                >
                  <div className="flex items-center justify-center gap-1.5 mb-1.5">
                    <Repeat className="w-3.5 h-3.5 text-[var(--amber)]" />
                    <p className="text-[11px] uppercase tracking-wider text-[var(--text-dim)]">Trade Kill %</p>
                  </div>
                  <p className="font-tel text-2xl font-bold">{avgTradeKillPct !== null ? `${avgTradeKillPct.toFixed(1)}%` : '—'}</p>
                </button>
              </div>

              {/* KAST, headshot accuracy, multi-kill rounds — added 2026-08-27 */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3.5 mb-3.5">
                <button
                  type="button"
                  onClick={() => promptCoach('My KAST is what it is — which rounds am I contributing nothing at all, no kill, no assist, no survival, no trade?')}
                  className="chip3d border border-[var(--edge)] rounded-2xl p-4 flex flex-col items-center justify-center text-center transition-transform hover:-translate-y-0.5 cursor-pointer"
                  style={{ '--c': ctTAccent(0, 3) } as CSSProperties}
                >
                  <div className="flex items-center justify-center gap-1.5 mb-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-[var(--cyan)]" />
                    <p className="text-[11px] uppercase tracking-wider text-[var(--text-dim)]">KAST</p>
                  </div>
                  <p className="font-tel text-2xl font-bold">{avgKastPct !== null ? `${avgKastPct.toFixed(1)}%` : '—'}</p>
                </button>
                <button
                  type="button"
                  onClick={() => promptCoach('Of all my shots that actually land, what fraction are hitting the head versus body? Is my crosshair placement the issue?')}
                  className="chip3d border border-[var(--edge)] rounded-2xl p-4 flex flex-col items-center justify-center text-center transition-transform hover:-translate-y-0.5 cursor-pointer"
                  style={{ '--c': ctTAccent(1, 3) } as CSSProperties}
                >
                  <div className="flex items-center justify-center gap-1.5 mb-1.5">
                    <Target className="w-3.5 h-3.5 text-[var(--amber)]" />
                    <p className="text-[11px] uppercase tracking-wider text-[var(--text-dim)]">HS Accuracy</p>
                  </div>
                  <p className="font-tel text-2xl font-bold">{avgHeadshotAccuracyPct !== null ? `${avgHeadshotAccuracyPct.toFixed(1)}%` : '—'}</p>
                </button>
                <button
                  type="button"
                  onClick={() => promptCoach('Walk me through my multi-kill rounds — what am I doing right in the rounds where I pick up 2 or more kills?')}
                  className="chip3d border border-[var(--edge)] rounded-2xl p-4 flex flex-col items-center justify-center text-center transition-transform hover:-translate-y-0.5 cursor-pointer"
                  style={{ '--c': ctTAccent(2, 3) } as CSSProperties}
                >
                  <div className="flex items-center justify-center gap-1.5 mb-1.5">
                    <Zap className="w-3.5 h-3.5 text-[var(--cyan)]" />
                    <p className="text-[11px] uppercase tracking-wider text-[var(--text-dim)]">Multi-Kill Rounds</p>
                  </div>
                  <p className="font-tel text-2xl font-bold">{totalMultiKillRounds !== null ? totalMultiKillRounds : '—'}</p>
                </button>
              </div>

              {hasActiveSync && (
                <div className="hud-corners bg-[var(--panel)] border border-[var(--edge)] rounded-2xl p-4 mb-3">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2 text-sm font-semibold">
                      <Download className="w-4 h-4 text-[var(--cyan)]" />
                      Syncing your matches
                    </div>
                    <span className="text-xs font-tel text-[var(--text-dim)]">
                      {batchReadyCount} ready
                      {batchFailedCount > 0 && <span className="text-[var(--danger)]"> · {batchFailedCount} failed</span>}
                      {' '}· {queuedCount + (syncCounts?.downloading ?? 0)} remaining
                    </span>
                  </div>

                  <div className="w-full h-2 bg-[var(--void)] rounded-full overflow-hidden mb-2 flex">
                    <div
                      className="h-full bg-[var(--cyan)] transition-all duration-500"
                      style={{ width: `${batchTotal > 0 ? (batchReadyCount / batchTotal) * 100 : 0}%` }}
                    />
                    <div
                      className="h-full bg-[var(--danger)] transition-all duration-500"
                      style={{ width: `${batchTotal > 0 ? (batchFailedCount / batchTotal) * 100 : 0}%` }}
                    />
                  </div>

                  {syncStatus?.current ? (
                    <div>
                      <div className="flex items-center justify-between text-xs text-[var(--text-dim)] mb-1.5">
                        <span className="font-tel">{syncStatus.current.matchId}</span>
                        <span className="font-tel">
                          {Math.floor(currentElapsed)}s elapsed
                          {syncStatus.avgSeconds ? ` · ~${syncStatus.avgSeconds}s avg` : ''}
                        </span>
                      </div>
                      <div className="w-full h-1.5 bg-[var(--void)] rounded-full overflow-hidden">
                        <div
                          className="h-full bg-[var(--amber)] transition-all duration-1000"
                          style={{ width: `${currentPct ?? 30}%`, ...(currentPct === null ? { animation: 'pulse-dot 1.6s ease-in-out infinite' } : {}) }}
                        />
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs text-[var(--text-dim)]">
                      {queuedCount} match{queuedCount === 1 ? '' : 'es'} queued — downloading and parsing one at a time.
                    </p>
                  )}
                </div>
              )}

              {isLoadingMatches && matches.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 gap-3 text-[var(--text-dim)]">
                  <Loader2 className="w-10 h-10 animate-spin text-[var(--cyan)]" />
                  <p>Loading match history...</p>
                </div>
              ) : parsedMatches.length === 0 ? (
                <div className="hud-corners relative overflow-hidden bg-[var(--panel)] border border-[var(--edge)] rounded-2xl text-center text-[var(--text-dim)] py-20">
                  <div className="radar-backdrop opacity-60" />
                  <div className="relative z-10 px-8">
                    <div className="w-20 h-20 mx-auto mb-5 rounded-full border-2 border-[var(--cyan-dim)] flex items-center justify-center">
                      <Radar className="w-9 h-9 text-[var(--cyan)]" />
                    </div>
                    <p className="font-display text-xl font-bold mb-2 text-[var(--text)]">Scanning for your matches</p>
                    <p className="text-sm max-w-sm mx-auto">RoundSync is watching for your next match — this dashboard fills in automatically the moment one finishes parsing.</p>
                  </div>
                </div>
              ) : null}

              {parsedMatches.length === 0 && lifetimeStats?.available && (
                <div className="hud-corners bg-[var(--panel)] border border-[var(--edge)] rounded-2xl p-4 mt-3">
                  <p className="text-xs uppercase tracking-wider text-[var(--text-dim)] mb-3">
                    While you wait — your lifetime CS2 stats (from Steam, not RoundSync-tracked yet)
                  </p>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="chip3d border border-[var(--edge)] rounded-2xl p-4 flex flex-col items-center justify-center text-center">
                      <p className="text-[11px] uppercase tracking-wider text-[var(--text-dim)] mb-1.5">Career K/D</p>
                      <p className="font-tel text-2xl font-bold">{lifetimeStats.careerKd ?? '—'}</p>
                    </div>
                    <div className="chip3d border border-[var(--edge)] rounded-2xl p-4 flex flex-col items-center justify-center text-center">
                      <p className="text-[11px] uppercase tracking-wider text-[var(--text-dim)] mb-1.5">Win Rate</p>
                      <p className="font-tel text-2xl font-bold">{lifetimeStats.winRatePct !== null ? `${lifetimeStats.winRatePct}%` : '—'}</p>
                    </div>
                    <div className="chip3d border border-[var(--edge)] rounded-2xl p-4 flex flex-col items-center justify-center text-center">
                      <p className="text-[11px] uppercase tracking-wider text-[var(--text-dim)] mb-1.5">Headshot %</p>
                      <p className="font-tel text-2xl font-bold">{lifetimeStats.headshotPct !== null ? `${lifetimeStats.headshotPct}%` : '—'}</p>
                    </div>
                    <div className="chip3d border border-[var(--edge)] rounded-2xl p-4 flex flex-col items-center justify-center text-center">
                      <p className="text-[11px] uppercase tracking-wider text-[var(--text-dim)] mb-1.5">Best Weapon</p>
                      <p className="font-tel text-lg font-bold">{lifetimeStats.bestWeapon?.label ?? '—'}</p>
                      {lifetimeStats.bestWeapon?.accuracyPct !== null && lifetimeStats.bestWeapon?.accuracyPct !== undefined && (
                        <p className="text-[11px] text-[var(--text-dim)]">{lifetimeStats.bestWeapon.accuracyPct}% accuracy</p>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {parsedMatches.length > 0 && (
                <>
                  <RecentMatchesCarousel
                    matches={parsedMatches}
                    recentWins={recentWins}
                    recentLosses={recentLosses}
                    onAskMatch={(m) => {
                      const t = m.match_data.telemetry;
                      promptCoach(`What went wrong in my match on ${formatMapName(t.map)} (${formatMatchDate(t)})? I went ${t.kills}/${t.deaths}/${t.assists ?? '?'} (K/D/A), ${t.kd_ratio} K/D, ${t.adr} ADR, ${t.headshot_pct}% HS.`);
                    }}
                  />

                  <div className="mb-4">
                    <div className="flex items-center justify-between mb-2">
                      <h2 className="font-display text-lg font-bold">Trends</h2>
                      <span className="text-[10px] text-[var(--text-dim)]">Hover any chart for match details</span>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                      {([
                        { key: 'kd' as const, title: 'K/D Ratio', type: 'line' as const, decimals: 2, metricLabel: 'K/D ratio', unit: '' },
                        { key: 'adr' as const, title: 'Average Damage per Round', type: 'bar' as const, decimals: 0, metricLabel: 'ADR', unit: '' },
                        { key: 'hs' as const, title: 'Headshot %', type: 'line' as const, decimals: 0, metricLabel: 'headshot percentage', unit: '%' },
                        { key: 'perf' as const, title: 'Performance Index', type: 'bar' as const, decimals: 0, metricLabel: 'performance index', unit: '/100' },
                      ]).map(({ key, title, type, decimals, metricLabel, unit }, chartIndex) => {
                        const recent = chartData.slice(-5);
                        const prior = chartData.slice(-10, -5);
                        const avg = (arr: typeof chartData) => arr.reduce((s, d) => s + (Number(d[key]) || 0), 0) / arr.length;
                        const recentAvg = chartData.length > 0 ? avg(recent) : 0;
                        const priorAvg = prior.length > 0 ? avg(prior) : recentAvg;
                        const delta = recentAvg - priorAvg;
                        const isUp = delta > 0.001;
                        const isDown = delta < -0.001;
                        const gradId = `grad-${key}`;
                        // Every chart shares the same "duel" read, but scoped to whichever half of
                        // the 2-column grid it sits in — the left column only ever sweeps CT cyan
                        // to neutral grey, the right column only grey to T amber. A chart that swept
                        // its own full 0%-100% range regardless of column would end in amber on the
                        // left and start in cyan on the right, clashing right at the page's own
                        // grey center instead of blending into it.
                        const col = chartIndex % 2;
                        const colorAt = (t: number) => duelLerp(col === 0 ? t * 0.5 : 0.5 + t * 0.5);
                        const askAboutPoint = (d: any) => promptCoach(`Why was my ${metricLabel} ${d[key]} on ${d.name} (${d.date})?`);
                        return (
                          <div key={key} className="hud-corners bg-[var(--panel)] tile3d p-4.5 rounded-2xl border border-[var(--edge)] flex flex-col" style={{ height: 236 }}>
                            <div className="flex items-center justify-between shrink-0 mb-2">
                              <h3 className="font-display font-bold text-sm">{title}</h3>
                              {chartData.length >= 6 && (isUp || isDown) && (
                                <span className={`text-xs font-tel font-semibold flex items-center gap-1 ${isUp ? 'text-[var(--cyan)]' : 'text-[var(--danger)]'}`}>
                                  {recentAvg.toFixed(decimals)} {isUp ? '▲' : '▼'} {Math.abs(delta).toFixed(decimals)}
                                </span>
                              )}
                            </div>
                            <div className="flex-1 min-h-0">
                              <ResponsiveContainer width="100%" height="100%">
                                {type === 'line' ? (
                                  <AreaChart data={chartData}>
                                    <defs>
                                      <linearGradient id={gradId} x1="0" y1="0" x2="1" y2="0">
                                        <stop offset="0%" stopColor={colorAt(0)} stopOpacity={0.55} />
                                        <stop offset="50%" stopColor={colorAt(0.5)} stopOpacity={0.15} />
                                        <stop offset="100%" stopColor={colorAt(1)} stopOpacity={0.55} />
                                      </linearGradient>
                                      <linearGradient id={`line-${key}`} x1="0" y1="0" x2="1" y2="0">
                                        <stop offset="0%" stopColor={colorAt(0)} />
                                        <stop offset="50%" stopColor={colorAt(0.5)} />
                                        <stop offset="100%" stopColor={colorAt(1)} />
                                      </linearGradient>
                                      <filter id={`glow-${key}`} x="-30%" y="-60%" width="160%" height="220%">
                                        <feDropShadow dx="0" dy="2.5" stdDeviation="2.2" floodColor={colorAt(0.5)} floodOpacity="0.4" />
                                      </filter>
                                    </defs>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#1c242e" />
                                    <XAxis dataKey="uid" stroke="#8592a1" tick={false} />
                                    <YAxis stroke="#8592a1" width={32} tick={{ fontSize: 11 }} />
                                    <Tooltip
                                      cursor={false}
                                      contentStyle={{ backgroundColor: '#0c1015', borderColor: '#2a3644' }}
                                      labelStyle={{ color: '#e7edf3' }}
                                      itemStyle={{ color: '#e7edf3' }}
                                      labelFormatter={(_, payload) => payload?.[0]?.payload ? `${payload[0].payload.name} · ${payload[0].payload.date}` : ''}
                                      formatter={(value: any) => [`${Number(value).toFixed(decimals)}${unit}`, title]}
                                    />
                                    <Area
                                      type="monotone"
                                      dataKey={key}
                                      stroke={`url(#line-${key})`}
                                      strokeWidth={3}
                                      style={{ filter: `url(#glow-${key})` }}
                                      fill={`url(#${gradId})`}
                                      dot={(dotProps: any) => {
                                        const c = colorAt(chartData.length > 1 ? dotProps.index / (chartData.length - 1) : 0.5);
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
                                            onClick={() => askAboutPoint(dotProps.payload)}
                                          />
                                        );
                                      }}
                                      activeDot={{ r: 7, style: { cursor: 'pointer' }, onClick: (_: any, e: any) => askAboutPoint(e.payload) }}
                                    />
                                  </AreaChart>
                                ) : (
                                  <BarChart data={chartData}>
                                    <defs>
                                      <filter id={`bar-shadow-${key}`} x="-40%" y="-10%" width="180%" height="140%">
                                        <feDropShadow dx="2" dy="3" stdDeviation="2" floodColor="#000000" floodOpacity="0.45" />
                                      </filter>
                                    </defs>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#1c242e" />
                                    <XAxis dataKey="uid" stroke="#8592a1" tick={false} />
                                    <YAxis stroke="#8592a1" width={32} tick={{ fontSize: 11 }} domain={key === 'perf' ? [0, 100] : undefined} />
                                    <Tooltip
                                      cursor={false}
                                      contentStyle={{ backgroundColor: '#0c1015', borderColor: '#2a3644' }}
                                      labelStyle={{ color: '#e7edf3' }}
                                      itemStyle={{ color: '#e7edf3' }}
                                      labelFormatter={(_, payload) => payload?.[0]?.payload ? `${payload[0].payload.name} · ${payload[0].payload.date}` : ''}
                                      formatter={(value: any) => [`${Number(value).toFixed(decimals)}${unit}`, title]}
                                    />
                                    <Bar
                                      dataKey={key}
                                      style={{ filter: `url(#bar-shadow-${key})`, cursor: 'pointer' }}
                                      shape={(p: any) => <Bar3DShape {...p} baseColor={p.fill} />}
                                      onClick={(d: any) => askAboutPoint(d)}
                                    >
                                      {chartData.map((d, i) => (
                                        <Cell key={i} fill={colorAt(chartData.length > 1 ? i / (chartData.length - 1) : 0.5)} style={{ cursor: 'pointer' }} onClick={() => askAboutPoint(d)} />
                                      ))}
                                    </Bar>
                                  </BarChart>
                                )}
                              </ResponsiveContainer>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                </>
              )}
            </div>
          </div>
        )
      )}

      {/* MATCHES: full history, one tile per match with map/date/performance */}
      {activeTab === 'matches' && (
        <div className="max-w-7xl mx-auto px-6 py-10">
          <h1 className="font-display text-3xl font-bold mb-8">Match History</h1>
          {/* One shared tooltip instance for every card's Performance stat (rendered once
              here, not per-card in the map below — it's the same portal-mounted node
              either way, and mounting it 30 times would stack 30 duplicate bubbles). */}
          {matchPerformanceTooltip.tooltip}

          {isLoadingMatches && matches.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3 text-[var(--text-dim)]">
              <Loader2 className="w-10 h-10 animate-spin text-[var(--cyan)]" />
              <p>Loading match history...</p>
            </div>
          ) : parsedMatches.length === 0 ? (
            <div className="hud-corners relative overflow-hidden bg-[var(--panel)] border border-[var(--edge)] rounded-2xl text-center text-[var(--text-dim)] py-24 px-8">
              <p className="font-display text-xl font-bold mb-2 text-[var(--text)]">No matches yet</p>
              <p className="text-sm max-w-sm mx-auto">Once RoundSync finishes parsing a match, it'll show up here.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {parsedMatches.map((m, i, arr) => {
                const t = m.match_data.telemetry;
                // Column-scoped, not list-scoped: with a 3-column grid, a card's color comes
                // from which column it falls in (i % 3), not its index in the full match list —
                // otherwise the accent drifts out of sync with the page's own left/right theme
                // every time the grid wraps to a new row (row 2's leftmost card would pick up
                // whatever color came next in the list instead of the same "left column" cyan).
                const col = i % 3;
                const accent = duelLerp(col === 0 ? 1 / 6 : col === 1 ? 0.5 : 5 / 6);
                const bg = mapScreenshotUrl(t.map);
                const matchRankBand = rankBand(t.rank_at_match_start);
                const index = performanceIndex(t);
                const matchPrompt = `What went wrong in my match on ${formatMapName(t.map)} (${formatMatchDate(t)})? I went ${t.kills}/${t.deaths}/${t.assists ?? '?'} (K/D/A), ${t.kd_ratio} K/D, ${t.adr} ADR, ${t.headshot_pct}% HS, with a performance index of ${index}/100.`;
                return (
                  <div
                    key={m.match_id}
                    role="button"
                    tabIndex={0}
                    onClick={() => promptCoach(matchPrompt)}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); promptCoach(matchPrompt); } }}
                    className="hud-corners border border-[var(--edge)] rounded-2xl overflow-hidden flex flex-col cursor-pointer transition-transform hover:-translate-y-0.5"
                  >
                    <div className="relative h-44">
                      {bg ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={bg} alt="" className="absolute inset-0 w-full h-full object-cover" />
                      ) : (
                        <div className="absolute inset-0 bg-gradient-to-br from-[var(--panel-raised)] to-[var(--void)]" />
                      )}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/10 to-transparent" />
                      {matchRankBand && typeof t.rank_at_match_start === 'number' && (
                        <div
                          className="absolute top-3 right-3 drop-shadow-md"
                          title={`Premier rank at kickoff: ${t.rank_at_match_start} (${matchRankBand.label})`}
                        >
                          <RankBadge color={matchRankBand.color} rankNew={t.rank_at_match_start} size={24} />
                        </div>
                      )}
                      {/* Map name/date are the only things that live on the image itself —
                          everything else (K/D included) lives in the footer below so nothing
                          crowds the image/footer seam. */}
                      <div className="absolute left-4 bottom-3">
                        <p className="font-display font-bold text-lg leading-none">{formatMapName(t.map)}</p>
                        <p className="text-xs text-[var(--text-dim)] mt-1">{formatMatchDate(t)}</p>
                      </div>
                    </div>

                    <div className="chip3d p-4.5" style={{ borderTop: `2px solid ${accent}`, '--c': accent } as CSSProperties}>
                      <div className="grid grid-cols-3 gap-2 text-center mb-3.5">
                        <div title="Kills-to-deaths ratio">
                          <p className="font-tel font-bold text-lg" style={{ color: accent }}>{t.kd_ratio}</p>
                          <p className="text-[10px] text-[var(--text-dim)] uppercase tracking-wide">K/D</p>
                        </div>
                        <div>
                          <p className="font-tel font-bold text-lg text-[var(--text)]">{t.kills}</p>
                          <p className="text-[10px] text-[var(--text-dim)] uppercase tracking-wide">Kills</p>
                        </div>
                        <div>
                          <p className="font-tel font-bold text-lg text-[var(--text)]">{t.deaths}</p>
                          <p className="text-[10px] text-[var(--text-dim)] uppercase tracking-wide">Deaths</p>
                        </div>
                        <div>
                          <p className="font-tel font-bold text-lg text-[var(--text)]">{t.assists ?? '—'}</p>
                          <p className="text-[10px] text-[var(--text-dim)] uppercase tracking-wide">Assists</p>
                        </div>
                        <div>
                          <p className="font-tel font-bold text-lg text-[var(--text)]">{t.adr}</p>
                          <p className="text-[10px] text-[var(--text-dim)] uppercase tracking-wide">ADR</p>
                        </div>
                        <div>
                          <p className="font-tel font-bold text-lg text-[var(--text)]">{t.headshot_pct}%</p>
                          <p className="text-[10px] text-[var(--text-dim)] uppercase tracking-wide">HS</p>
                        </div>
                      </div>
                      <div
                        className="flex items-center justify-between bg-[var(--void)] rounded-xl px-3.5 py-2.5"
                        {...matchPerformanceTooltip.handlers}
                      >
                        <span className="text-[10px] uppercase tracking-wide text-[var(--text-dim)]">Performance</span>
                        <span className="font-tel font-bold text-[var(--amber)]">{index}<span className="text-[var(--text-dim)] text-xs">/100</span></span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* INSIGHTS DASHBOARD */}
      {activeTab === 'insights' && (
        isOnboarded ? (
          jwtToken && <InsightsDashboard jwtToken={jwtToken} onAskCoach={promptCoach} />
        ) : (
          <div className="max-w-3xl mx-auto px-6 py-16">
            <div className="bg-[var(--panel)] border border-[var(--edge)] p-8 rounded-2xl flex items-center gap-4 text-[var(--amber)] justify-center">
              <ShieldAlert className="w-6 h-6" /> Finish the one-time setup on Home before viewing Insights.
            </div>
          </div>
        )
      )}

      {/* AI COACH CHAT */}
      {activeTab === 'coach' && (
        <div className="flex flex-col h-[calc(100vh-4rem)]">
          <div className="relative shrink-0">
            <div className="relative z-10 max-w-5xl mx-auto px-6 py-8">
              <h1 className="font-display text-3xl font-bold mb-1">Conversational AI Coach</h1>
              <p className="text-[var(--text-dim)]">Ask about a specific moment in your last match — not a generic tip.</p>
            </div>
          </div>

          <div className="max-w-6xl mx-auto px-6 py-6 w-full flex-1 min-h-0 flex flex-col">
            {!isOnboarded ? (
              <div className="bg-[var(--panel)] border border-[var(--edge)] p-8 rounded-2xl flex items-center gap-4 text-[var(--amber)] justify-center">
                <ShieldAlert className="w-6 h-6" /> Finish the one-time setup on Home before consulting your Coach.
              </div>
            ) : (
              <div className="flex-1 min-h-0 flex gap-4">
              {/* Recent chats sidebar */}
              <div
                className="w-64 shrink-0 hud-corners chip3d border rounded-2xl flex flex-col overflow-hidden"
                style={{ '--c': ctTAccent(0, 2), borderColor: 'color-mix(in srgb, var(--c) 45%, var(--edge))' } as CSSProperties}
              >
                <div className="p-3 border-b border-[var(--edge)]">
                  <button
                    onClick={startNewChat}
                    className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl bg-[var(--cyan)] hover:bg-[#5eead4] text-[#03141a] font-bold text-sm transition-colors"
                  >
                    <Plus className="w-4 h-4" /> New Chat
                  </button>
                </div>
                <div className="flex-1 overflow-y-auto p-2 space-y-1">
                  {conversations.length === 0 ? (
                    <p className="text-xs text-[var(--text-dim)] text-center py-6 px-3">Your past conversations will show up here.</p>
                  ) : (
                    [...conversations].reverse().map((group) => (
                      <div
                        key={group.id}
                        role="button"
                        tabIndex={0}
                        onClick={() => switchConversation(group)}
                        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); switchConversation(group); } }}
                        className={`group relative w-full text-left pl-3 pr-8 py-2.5 rounded-xl text-xs transition-colors border cursor-pointer ${
                          activeConversationId === group.id
                            ? 'bg-[var(--panel-raised)] border-[var(--cyan-dim)]'
                            : 'border-transparent hover:bg-[var(--panel-raised)]'
                        }`}
                      >
                        <p className="font-medium text-[var(--text)] truncate">{conversationPreview(group)}</p>
                        <p className="text-[10px] text-[var(--text-dim)] mt-0.5">{conversationDateLabel(group.lastAt)}</p>
                        <button
                          type="button"
                          title="Remove from this list"
                          onClick={(e) => deleteConversation(e, group.id)}
                          className="absolute top-1/2 right-2 -translate-y-1/2 p-1 rounded-md text-[var(--text-dim)] opacity-0 group-hover:opacity-100 hover:text-[var(--danger)] hover:bg-[var(--void)] transition-opacity"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div
                className="hud-corners chip3d flex-1 border rounded-2xl overflow-hidden flex flex-col min-h-0 relative"
                style={{
                  '--c': ctTAccent(1, 2),
                  // A plain flat rgba() here (the earlier "make it more transparent" fix)
                  // silently threw away the amber duel-accent `chip3d` would otherwise mix
                  // in via `--c` — this panel sits on the right (`ctTAccent(1, 2)` = pure
                  // T-amber), so it should read as an amber-tinted glass panel next to the
                  // sidebar's cyan one, matching the app's own cyan-left/amber-right
                  // background glow, not read as flat blue-tinted glass.
                  // Slightly less transparent (was 0.35) with NO `backdrop-filter` at all —
                  // measured directly: this panel's blur, sitting in front of the app's
                  // always-animating background mesh/operators, was THE cause of "the whole
                  // page is slow" on Coach (proved via a frame-time trace — with just this
                  // one blur forcibly disabled, an otherwise-idle Coach page went from
                  // ~22ms/frame with ~30 dropped frames per 90 to a clean 16.5ms/frame with
                  // zero drops, even with those background animations left running
                  // untouched). A plain semi-opaque gradient reads close enough to "glass"
                  // without ever needing to resample what's moving behind it.
                  background: 'linear-gradient(180deg, color-mix(in srgb, var(--c) 18%, rgba(12,16,21,0.55)) 0%, rgba(12,16,21,0.55) 60%)',
                  borderColor: 'color-mix(in srgb, var(--c) 45%, var(--edge))',
                } as CSSProperties}
              >
                <div className="flex-1 overflow-y-auto p-6 space-y-4">
                  {messages.length === 0 ? (
                    <div className="flex flex-col items-center justify-center text-center h-full text-[var(--text-dim)] py-12">
                      <div className="relative w-[84px] h-[84px] mx-auto mb-5">
                        <div
                          className="absolute inset-0 rounded-full"
                          style={{
                            border: '1.5px solid transparent',
                            backgroundImage:
                              'radial-gradient(circle at 34% 30%, color-mix(in srgb, #6b7280 35%, #0c1015) 0%, #0c1015 70%), linear-gradient(90deg, var(--cyan) 0%, var(--amber) 100%)',
                            backgroundOrigin: 'border-box',
                            backgroundClip: 'padding-box, border-box',
                            boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.1), 0 4px 16px rgba(0,0,0,0.5)',
                          }}
                        />
                        <DuelIcon icon={Brain} className="w-8 h-8 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
                      </div>
                      <p className="font-display font-bold text-lg text-[var(--text)]">Your AI Coach is ready</p>
                      <p className="text-sm max-w-md mb-6">
                        Specific questions get specific answers — vague ones like "am I good?" just waste a question.
                      </p>
                      <button
                        type="button"
                        onClick={() => setShowTopicWheel(true)}
                        className="inline-flex items-center gap-2.5 px-6 py-3 rounded-full cursor-pointer transition-transform hover:-translate-y-0.5"
                        style={{
                          background: 'linear-gradient(180deg, color-mix(in srgb, #6b7280 22%, var(--panel-raised)) 0%, var(--panel-raised) 65%)',
                          border: '1px solid transparent',
                          backgroundImage:
                            'linear-gradient(180deg, color-mix(in srgb, #6b7280 22%, var(--panel-raised)) 0%, var(--panel-raised) 65%), linear-gradient(90deg, var(--cyan-dim) 0%, var(--amber-dim) 100%)',
                          backgroundOrigin: 'border-box',
                          backgroundClip: 'padding-box, border-box',
                          boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.08), 0 3px 8px rgba(0,0,0,0.4)',
                        }}
                      >
                        <DuelIcon icon={Radar} className="w-4 h-4 relative" />
                        <span
                          className="font-display font-bold text-sm tracking-wide"
                          style={{ background: 'linear-gradient(90deg, var(--cyan) 0%, var(--amber) 100%)', WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }}
                        >
                          CHOOSE A TOPIC
                        </span>
                      </button>
                      <p className="mt-3.5 text-[11px] text-[var(--text-dim)]">or type your own question below</p>
                    </div>
                  ) : (
                    messages.map((m, idx) => (
                      <div key={idx} className={`flex items-end gap-2.5 ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                        {m.role === 'assistant' && (
                          <div
                            className="w-7 h-7 rounded-full flex items-center justify-center shrink-0"
                            style={{ background: 'radial-gradient(circle at 34% 30%, color-mix(in srgb, var(--cyan) 40%, white) 0%, var(--cyan) 48%, color-mix(in srgb, var(--cyan) 75%, black) 100%)', boxShadow: '0 2px 3px rgba(0,0,0,0.5)' }}
                          >
                            <Brain className="w-3.5 h-3.5 text-[#03141a]" />
                          </div>
                        )}
                        <div
                          className={`max-w-[75%] rounded-2xl px-5 py-3 text-sm leading-relaxed ${
                            m.role === 'user' ? 'text-[#03141a] rounded-br-none font-medium' : 'text-[var(--text)] rounded-bl-none border border-[var(--edge)] border-l-[3px] border-l-[var(--cyan)]'
                          }`}
                          style={
                            m.role === 'user'
                              ? { background: 'linear-gradient(180deg, color-mix(in srgb, var(--cyan) 45%, white) 0%, var(--cyan) 48%, color-mix(in srgb, var(--cyan) 68%, black) 100%)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.35), inset 0 -2px 4px rgba(0,0,0,0.22), 0 3px 8px rgba(0,0,0,0.4)' }
                              : { background: 'linear-gradient(180deg, color-mix(in srgb, var(--cyan-dim) 22%, var(--panel-raised)) 0%, var(--panel-raised) 55%)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.08), inset 0 -6px 10px -6px rgba(0,0,0,0.5), 0 4px 8px rgba(0,0,0,0.35)' }
                          }
                        >
                          {m.role === 'assistant' ? (
                            <TypedAssistantMessage
                              content={m.content}
                              skipAnimation={typedMessageIndices.current.has(idx)}
                              onDone={() => typedMessageIndices.current.add(idx)}
                            />
                          ) : (
                            <p className="whitespace-pre-wrap">{m.content}</p>
                          )}
                        </div>
                        {m.role === 'user' && (
                          avatarUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={avatarUrl} alt="" className="w-7 h-7 rounded-full border border-[var(--edge-bright)] shrink-0" />
                          ) : (
                            <div className="w-7 h-7 rounded-full bg-[var(--panel-raised)] border border-[var(--edge-bright)] shrink-0" />
                          )
                        )}
                      </div>
                    ))
                  )}
                  {isSendingMessage && (
                    <div className="flex items-center gap-2.5 justify-start">
                      <div
                        className="w-7 h-7 rounded-full flex items-center justify-center shrink-0"
                        style={{ background: 'radial-gradient(circle at 34% 30%, color-mix(in srgb, var(--cyan) 40%, white) 0%, var(--cyan) 48%, color-mix(in srgb, var(--cyan) 75%, black) 100%)', boxShadow: '0 2px 3px rgba(0,0,0,0.5)' }}
                      >
                        <Brain className="w-3.5 h-3.5 text-[#03141a]" />
                      </div>
                      <div
                        className="flex items-center gap-1.5 px-5 py-3.5 rounded-2xl rounded-bl-none border border-[var(--edge)] border-l-[3px] border-l-[var(--cyan)]"
                        style={{ background: 'linear-gradient(180deg, color-mix(in srgb, var(--cyan-dim) 22%, var(--panel-raised)) 0%, var(--panel-raised) 55%)' }}
                      >
                        <span className="live-dot w-1.5 h-1.5 rounded-full bg-[var(--cyan)]" />
                        <span className="live-dot w-1.5 h-1.5 rounded-full bg-[var(--cyan)]" style={{ animationDelay: '0.15s' }} />
                        <span className="live-dot w-1.5 h-1.5 rounded-full bg-[var(--cyan)]" style={{ animationDelay: '0.3s' }} />
                      </div>
                    </div>
                  )}
                  <div ref={messagesEndRef} />
                </div>

                {showTopicWheel && <TopicWheel segments={wheelSegments} onPick={fillFromWheel} />}

                <form onSubmit={askCoach} className="bg-[var(--void)]/60 p-4 border-t border-[var(--edge)] flex gap-3 shrink-0">
                  <input
                    type="text"
                    required
                    value={chatInput}
                    disabled={isSendingMessage}
                    onChange={(e) => setChatInput(e.target.value)}
                    placeholder="Ask about your utility, aim, or how to improve..."
                    className="flex-1 bg-[var(--panel)] border border-[var(--edge)] focus:border-[var(--cyan)] outline-none rounded-xl px-4 py-3 text-sm text-[var(--text)] transition-colors disabled:opacity-50"
                  />
                  <button
                    type="submit"
                    disabled={isSendingMessage || !chatInput.trim()}
                    className="px-6 py-3 bg-[var(--cyan)] hover:bg-[#5eead4] disabled:bg-[var(--edge)] disabled:text-[var(--text-dim)] font-bold text-[#03141a] rounded-xl text-sm transition-all shadow-md"
                  >
                    Ask Coach
                  </button>
                </form>
              </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* INTEGRATION SETTINGS — always reachable, pre-fillable re-entry point */}
      {activeTab === 'settings' && (
        <div className="max-w-4xl mx-auto px-6 py-12">
          <h1 className="font-display text-3xl font-bold mb-6">Account &amp; Integration</h1>

          <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-4">
            <div className="glass chip3d border border-[var(--edge)] rounded-2xl p-5 flex flex-col items-center text-center gap-2" style={{ '--c': ctTAccent(0, 2) } as CSSProperties}>
              {avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={avatarUrl} alt="" className="w-20 h-20 rounded-full border-2 border-[var(--edge-bright)]" />
              ) : (
                <div className="w-20 h-20 rounded-full bg-[var(--panel-raised)] border-2 border-[var(--edge-bright)]" />
              )}
              <p className="font-display text-base font-bold mt-1">{personaName || 'Player'}</p>
              <RankBadge color={rankBand(rankNew)?.color ?? '#9ca3af'} rankNew={rankNew} size={36} />
              <p className="text-[11px] text-[var(--text-dim)] mt-1">Signed in with Steam</p>
            </div>

            <div className="flex flex-col gap-3">
              <div className="hud-corners chip3d border border-[var(--edge)] p-6 rounded-2xl" style={{ '--c': ctTAccent(1, 2) } as CSSProperties}>
                {isOnboarded && (
                  <div className="flex items-center gap-3 text-[var(--cyan)] font-medium mb-5 text-sm">
                    <CheckCircle2 className="w-5 h-5" /> Auto-Sync is currently active.
                  </div>
                )}
                <OnboardingForm
                  gameAuthCode={gameAuthCode} setGameAuthCode={setGameAuthCode}
                  recentShareCode={recentShareCode} setRecentShareCode={setRecentShareCode}
                  isOnboarding={isOnboarding} onSubmit={handleOnboarding}
                  submitLabel={isOnboarded ? 'Update Codes' : 'Activate Auto-Sync'}
                />
              </div>

              <div className="hud-corners chip3d border border-[var(--edge)] rounded-2xl p-5 flex items-center justify-between gap-4" style={{ '--c': ctTAccent(1, 2) } as CSSProperties}>
                <div>
                  <p className="font-semibold text-sm">Sign out of RoundSync</p>
                  <p className="text-xs text-[var(--text-dim)] mt-0.5">You'll need to sign in with Steam again to reconnect.</p>
                </div>
                <button
                  onClick={handleLogout}
                  className="shrink-0 px-4 py-2.5 bg-transparent text-[var(--danger)] border border-[var(--danger)] rounded-xl text-sm font-semibold hover:bg-[var(--danger)]/10 transition-colors"
                >
                  Sign Out
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
