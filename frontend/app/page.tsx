'use client';

import React, { useState, useEffect, useRef, useCallback, CSSProperties } from 'react';
import { ResponsiveContainer, LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import { Brain, BarChart2, ShieldAlert, CheckCircle2, ChevronRight, Loader2, Target, Crosshair, Radar, Download, Plus, TrendingUp, Zap } from 'lucide-react';
import { LogoMark } from '@/components/Logo';
import ReactMarkdown from 'react-markdown';
import { Toast } from '@/components/Toast';
import { TopNav } from '@/components/TopNav';
import { InsightsDashboard } from '@/components/InsightsDashboard';
import { RankPill } from '@/components/RankBadge';
import { RankBandTakeover, RankDeltaBadge, type RankChangeEvent } from '@/components/RankChangeOverlay';
import { rankBand, rankBandIndex, RANK_BANDS, LAST_KNOWN_RANK_KEY } from '@/lib/rank';

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
      headshot_pct: number;
      map?: string | null;
      match_time?: number | null;
      total_damage?: number | null;
      headshots?: number | null;
      rounds_played?: number | null;
    };
  };
}

// A lightweight composite score from what we have today (K/D, ADR, headshot%) — not
// the full round-by-round Impact formula discussed for later; labeled as such in the UI.
function performanceIndex(t: Match['match_data']['telemetry']): number {
  const kdComponent = Math.min(t.kd_ratio, 3) / 3;
  const adrComponent = Math.min(t.adr, 150) / 150;
  const hsComponent = Math.min(t.headshot_pct, 100) / 100;
  return Math.round((kdComponent * 0.5 + adrComponent * 0.35 + hsComponent * 0.15) * 100);
}

// Only claims a date when we have the real match_time from the Game Coordinator —
// falling back to parsed_at would show "when RoundSync processed it," which for a
// backlog of older matches processed in one sitting looks like a false play date.
function formatMatchDate(t: Match['match_data']['telemetry']): string {
  if (!t.match_time) return 'Date unavailable';
  return new Date(t.match_time * 1000).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

// Sorts most-recent-played first when we know match_time, falling back to parse
// order for older matches that predate that field — see formatMatchDate above.
function matchSortKey(m: Match): number {
  return m.match_data.telemetry.match_time ? m.match_data.telemetry.match_time * 1000 : new Date(m.parsed_at).getTime();
}

export function formatMapName(map?: string | null): string {
  if (!map) return 'Unknown Map';
  return map.replace(/^de_/, '').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
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

// Shown as clickable starting points in the empty chat state — teaches good question
// shape by example (specific, tied to a real decision) instead of a wall of instructions.
const EXAMPLE_COACH_PROMPTS = [
  'Why do I keep dying early in rounds?',
  'Am I throwing away rounds by buying when the team is on an eco?',
  'Are my flashes helping my team or blinding them?',
  'How is my reaction time to information compared to my rank?',
];

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

export default function Home() {
  const [activeTab, setActiveTab] = useState<'home' | 'matches' | 'insights' | 'coach' | 'settings'>('home');
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

  const [showWelcomeToast, setShowWelcomeToast] = useState(false);

  // Sync progress — how many matches are queued/downloading/done, and how long the current one has taken
  interface SyncStatus {
    counts: { pending_url: number; pending_download: number; downloading: number; fully_parsed: number; parse_failed: number };
    current: { matchId: string; startedAt: number } | null;
    avgSeconds: number | null;
  }
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null);
  const [nowSeconds, setNowSeconds] = useState(() => Date.now() / 1000);

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

  const fetchProfile = useCallback(async (token: string) => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/user/profile`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.status === 401 || response.status === 403) return;
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
      if (response.status === 401 || response.status === 403) return;
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
      if (response.status === 401 || response.status === 403) return;
      const data = await response.json();
      if (data.counts) setSyncStatus(data);
    } catch (err) {
      console.error('Error fetching sync status:', err);
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
      const interval = setInterval(() => {
        fetchMatches();
        fetchSyncStatus(jwtToken);
      }, 10000);
      return () => clearInterval(interval);
    }
  }, [jwtToken, fetchProfile, fetchMatches, fetchSyncStatus, fetchChatHistory]);

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
            setShowWelcomeToast(true);
          }
        } catch (err) {
          alert('Failed to obtain authenticated token from API Gateway.');
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
        alert(`Onboarding error: ${data.error || 'Unknown error'}`);
      }
    } catch (err) {
      alert('Failed to connect to API Gateway for onboarding.');
    } finally {
      setIsOnboarding(false);
    }
  };

  // Lets the Insights dashboard's "Ask the coach about this" chips route a contextual
  // question straight into the chat tab, prefilled — the same bridge as the example-prompt
  // chips already use, just triggered from a different tab instead of the empty chat state.
  const askCoachFromInsights = (question: string) => {
    setChatInput(question);
    setActiveTab('coach');
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
    : parsedMatches.length > 0
      ? (parsedMatches.reduce((acc, m) => acc + m.match_data.telemetry.adr, 0) / parsedMatches.length).toFixed(1)
      : '0.0';
  const matchesWithRawHs = parsedMatches.filter(m => typeof m.match_data.telemetry.headshots === 'number');
  const avgHs = matchesWithRawHs.length > 0
    ? (
        (matchesWithRawHs.reduce((acc, m) => acc + (m.match_data.telemetry.headshots || 0), 0) /
        Math.max(1, matchesWithRawHs.reduce((acc, m) => acc + m.match_data.telemetry.kills, 0))) * 100
      ).toFixed(1)
    : parsedMatches.length > 0
      ? (parsedMatches.reduce((acc, m) => acc + m.match_data.telemetry.headshot_pct, 0) / parsedMatches.length).toFixed(1)
      : '0.0';
  const avgPerformanceIndex = parsedMatches.length > 0
    ? Math.round(parsedMatches.reduce((acc, m) => acc + performanceIndex(m.match_data.telemetry), 0) / parsedMatches.length)
    : 0;

  const chartData = parsedMatches.map(m => ({
    name: m.match_data.telemetry.map ? formatMapName(m.match_data.telemetry.map) : m.match_id.substring(5, 12),
    kd: m.match_data.telemetry.kd_ratio,
    adr: m.match_data.telemetry.adr,
    hs: m.match_data.telemetry.headshot_pct,
    perf: performanceIndex(m.match_data.telemetry),
  })).reverse();

  const isLive = isOnboarded === true;
  const kdRingPct = Math.max(4, Math.min(100, Number(avgKd) * 50));

  // Sync progress math
  const syncCounts = syncStatus?.counts;
  const totalTracked = syncCounts
    ? syncCounts.pending_url + syncCounts.pending_download + syncCounts.downloading + syncCounts.fully_parsed + syncCounts.parse_failed
    : 0;
  const readyCount = syncCounts?.fully_parsed ?? 0;
  const failedCount = syncCounts?.parse_failed ?? 0;
  const queuedCount = syncCounts ? syncCounts.pending_url + syncCounts.pending_download : 0;
  const hasActiveSync = queuedCount > 0 || (syncCounts?.downloading ?? 0) > 0;
  const currentElapsed = syncStatus?.current ? Math.max(0, nowSeconds - syncStatus.current.startedAt) : 0;
  const currentPct = syncStatus?.avgSeconds
    ? Math.min(96, Math.round((currentElapsed / syncStatus.avgSeconds) * 100))
    : null;

  // ---------- LOGGED-OUT LANDING ----------
  if (!steamId) {
    return (
      <div className="relative min-h-screen text-[var(--text)] flex flex-col items-center justify-center px-6">
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
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 my-10 text-left">
            <div className="hud-corners bg-[var(--panel)]/80 border border-[var(--edge)] rounded-xl p-5">
              <Crosshair className="w-6 h-6 text-[var(--cyan)] mb-3" />
              <p className="font-semibold text-sm mb-1">Moment-level analysis</p>
              <p className="text-xs text-[var(--text-dim)]">Not match averages — the exact peek, duel, and decision.</p>
            </div>
            <div className="hud-corners bg-[var(--panel)]/80 border border-[var(--edge)] rounded-xl p-5">
              <Radar className="w-6 h-6 text-[var(--cyan)] mb-3" />
              <p className="font-semibold text-sm mb-1">Personalized, not generic</p>
              <p className="text-xs text-[var(--text-dim)]">No population benchmarks — coaching built from your own games.</p>
            </div>
            <div className="hud-corners bg-[var(--panel)]/80 border border-[var(--edge)] rounded-xl p-5">
              <Brain className="w-6 h-6 text-[var(--cyan)] mb-3" />
              <p className="font-semibold text-sm mb-1">A coach that explains why</p>
              <p className="text-xs text-[var(--text-dim)]">Ask it anything about your last match, in plain language.</p>
            </div>
          </div>
          <button
            onClick={loginWithSteam}
            className="px-8 py-4 bg-[var(--cyan)] hover:bg-[#5eead4] text-[#03141a] font-bold rounded-xl shadow-lg shadow-cyan-500/20 transition-all inline-flex items-center gap-3 text-lg"
          >
            Sign In With Steam
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
      </div>
    );
  }

  // ---------- LOGGED-IN APP SHELL ----------
  return (
    <div className="min-h-screen text-[var(--text)]">
      {showWelcomeToast && (
        <Toast
          message="Successfully signed in"
          subtext="Your Steam account is authenticated."
          onDone={() => setShowWelcomeToast(false)}
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
              <form onSubmit={handleOnboarding} className="space-y-4">
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
                  <label className="block text-sm font-semibold text-[var(--text-dim)] mb-2">Recent Match Share Code (CSGO-XXXXX-...)</label>
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
                  className="w-full px-5 py-3 bg-[var(--cyan)] hover:bg-[#5eead4] disabled:bg-[var(--edge)] disabled:text-[var(--text-dim)] font-bold text-[#03141a] rounded-xl transition-all flex items-center justify-center gap-2"
                >
                  {isOnboarding && <Loader2 className="w-5 h-5 animate-spin" />}
                  Activate Auto-Sync
                </button>
              </form>
            </div>
          </div>
        ) : (
          <div className="h-[calc(100vh-4rem)] overflow-hidden flex flex-col">
            {rankChangeEvent && rankChangeEvent.crossedBand && (
              <RankBandTakeover event={rankChangeEvent} onDone={() => setRankChangeEvent(null)} />
            )}

            {/* Hero band — one full-width grid so every card carries equal visual weight
                instead of a cluster of small cards on the left with dead space on the right.
                Deliberately compact (shrink-0): the charts below get whatever's left. */}
            <div className="relative shrink-0">
              <div className="relative z-10 max-w-7xl mx-auto px-6 pt-6 pb-4 w-full">
                <p className="text-xs text-[var(--text-dim)] mb-3">
                  Stats based on your last {parsedMatches.length} recent games
                </p>

                <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
                  {/* Identity + rank */}
                  <div className="glass border border-[var(--edge)] rounded-2xl p-3 flex flex-col items-center justify-center gap-2 col-span-2 lg:col-span-1">
                    <div className="flex items-center gap-2.5 w-full">
                      {avatarUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={avatarUrl} alt="" className="w-9 h-9 rounded-full border-2 border-[var(--edge-bright)] shrink-0" />
                      ) : (
                        <div className="w-9 h-9 rounded-full bg-[var(--panel-raised)] border-2 border-[var(--edge-bright)] shrink-0" />
                      )}
                      <p className="font-display text-sm font-bold truncate">{personaName || 'Player'}</p>
                    </div>
                    {rankBand(rankNew) && (
                      <div className="flex flex-col items-center gap-1 w-full">
                        <RankPill color={rankBand(rankNew)!.color} rankNew={rankNew!} />
                        {rankChangeEvent && !rankChangeEvent.crossedBand && <RankDeltaBadge event={rankChangeEvent} />}
                      </div>
                    )}
                  </div>

                  {/* K/D ring */}
                  <div className="glass border border-[var(--edge)] rounded-2xl p-3 flex flex-col items-center justify-center">
                    <div className="relative w-16 h-16 stat-ring" style={{ '--pct': kdRingPct } as CSSProperties}>
                      <div className="absolute inset-1.5 rounded-full bg-[var(--panel)] flex flex-col items-center justify-center">
                        <span className="font-tel text-lg font-extrabold text-[var(--cyan)]">{avgKd}</span>
                      </div>
                    </div>
                    <span className="text-[9px] uppercase tracking-wider text-[var(--text-dim)] mt-1.5">K/D Ratio</span>
                  </div>

                  {/* Secondary stats — equal-weight tiles filling the same row */}
                  <div className="glass border border-[var(--edge)] rounded-2xl p-3 flex flex-col justify-center">
                    <div className="flex items-center gap-1.5 mb-1">
                      <Zap className="w-3 h-3 text-[var(--amber)]" />
                      <p className="text-[10px] uppercase tracking-wider text-[var(--text-dim)]">Avg ADR</p>
                    </div>
                    <p className="font-tel text-lg font-bold">{avgAdr}</p>
                  </div>
                  <div className="glass border border-[var(--edge)] rounded-2xl p-3 flex flex-col justify-center">
                    <div className="flex items-center gap-1.5 mb-1">
                      <Crosshair className="w-3 h-3 text-[var(--cyan)]" />
                      <p className="text-[10px] uppercase tracking-wider text-[var(--text-dim)]">Headshot %</p>
                    </div>
                    <p className="font-tel text-lg font-bold">{avgHs}%</p>
                  </div>
                  <div className="glass border border-[var(--edge)] rounded-2xl p-3 flex flex-col justify-center col-span-2 lg:col-span-1">
                    <div className="flex items-center gap-1.5 mb-1">
                      <TrendingUp className="w-3 h-3 text-[var(--amber)]" />
                      <p className="text-[10px] uppercase tracking-wider text-[var(--text-dim)]">Avg Performance</p>
                    </div>
                    <p className="font-tel text-lg font-bold text-[var(--amber)]">{avgPerformanceIndex}<span className="text-[var(--text-dim)] text-xs">/100</span></p>
                  </div>
                </div>
              </div>
            </div>

            <div className="max-w-7xl mx-auto px-6 pb-4 w-full flex-1 min-h-0 flex flex-col">
              {hasActiveSync && (
                <div className="hud-corners bg-[var(--panel)] border border-[var(--edge)] rounded-2xl p-4 shrink-0 mb-3">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2 text-sm font-semibold">
                      <Download className="w-4 h-4 text-[var(--cyan)]" />
                      Syncing your matches
                    </div>
                    <span className="text-xs font-tel text-[var(--text-dim)]">
                      {readyCount} ready
                      {failedCount > 0 && <span className="text-[var(--danger)]"> · {failedCount} failed</span>}
                      {' '}· {queuedCount + (syncCounts?.downloading ?? 0)} remaining
                    </span>
                  </div>

                  <div className="w-full h-2 bg-[var(--void)] rounded-full overflow-hidden mb-2 flex">
                    <div
                      className="h-full bg-[var(--cyan)] transition-all duration-500"
                      style={{ width: `${totalTracked > 0 ? (readyCount / totalTracked) * 100 : 0}%` }}
                    />
                    <div
                      className="h-full bg-[var(--danger)] transition-all duration-500"
                      style={{ width: `${totalTracked > 0 ? (failedCount / totalTracked) * 100 : 0}%` }}
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
                <div className="flex flex-col items-center justify-center flex-1 gap-3 text-[var(--text-dim)]">
                  <Loader2 className="w-10 h-10 animate-spin text-[var(--cyan)]" />
                  <p>Loading match history...</p>
                </div>
              ) : parsedMatches.length === 0 ? (
                <div className="hud-corners relative overflow-hidden bg-[var(--panel)] border border-[var(--edge)] rounded-2xl text-center text-[var(--text-dim)] flex-1 flex items-center justify-center">
                  <div className="radar-backdrop opacity-60" />
                  <div className="relative z-10 px-8">
                    <div className="w-20 h-20 mx-auto mb-5 rounded-full border-2 border-[var(--cyan-dim)] flex items-center justify-center">
                      <Radar className="w-9 h-9 text-[var(--cyan)]" />
                    </div>
                    <p className="font-display text-xl font-bold mb-2 text-[var(--text)]">Scanning for your matches</p>
                    <p className="text-sm max-w-sm mx-auto">RoundSync is watching for your next match — this dashboard fills in automatically the moment one finishes parsing.</p>
                  </div>
                </div>
              ) : (
                <div className="flex-1 min-h-0 flex flex-col">
                  <div className="flex items-center justify-between shrink-0 mb-2">
                    <h2 className="font-display text-lg font-bold">Trends</h2>
                    <span className="text-[10px] text-[var(--text-dim)]">Hover any chart for match details</span>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-2 grid-rows-2 gap-3 flex-1 min-h-0">
                    {([
                      { key: 'kd' as const, title: 'K/D Ratio', color: '#22d3ee', type: 'line' as const, decimals: 2 },
                      { key: 'adr' as const, title: 'Average Damage per Round', color: '#fb923c', type: 'bar' as const, decimals: 0 },
                      { key: 'hs' as const, title: 'Headshot %', color: '#8b5cf6', type: 'line' as const, decimals: 0 },
                      { key: 'perf' as const, title: 'Performance Index', color: '#e11d48', type: 'bar' as const, decimals: 0 },
                    ]).map(({ key, title, color, type, decimals }) => {
                      const recent = chartData.slice(-5);
                      const prior = chartData.slice(-10, -5);
                      const avg = (arr: typeof chartData) => arr.reduce((s, d) => s + (Number(d[key]) || 0), 0) / arr.length;
                      const recentAvg = chartData.length > 0 ? avg(recent) : 0;
                      const priorAvg = prior.length > 0 ? avg(prior) : recentAvg;
                      const delta = recentAvg - priorAvg;
                      const isUp = delta > 0.001;
                      const isDown = delta < -0.001;
                      return (
                        <div key={key} className="hud-corners bg-[var(--panel)] p-4 rounded-2xl border border-[var(--edge)] flex flex-col min-h-0">
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
                                <LineChart data={chartData}>
                                  <CartesianGrid strokeDasharray="3 3" stroke="#1c242e" />
                                  <XAxis dataKey="name" stroke="#8592a1" tick={false} />
                                  <YAxis stroke="#8592a1" width={32} tick={{ fontSize: 11 }} />
                                  <Tooltip contentStyle={{ backgroundColor: '#0c1015', borderColor: '#2a3644' }} />
                                  <Line type="monotone" dataKey={key} stroke={color} strokeWidth={2.5} dot={{ r: 2 }} activeDot={{ r: 6 }} />
                                </LineChart>
                              ) : (
                                <BarChart data={chartData}>
                                  <CartesianGrid strokeDasharray="3 3" stroke="#1c242e" />
                                  <XAxis dataKey="name" stroke="#8592a1" tick={false} />
                                  <YAxis stroke="#8592a1" width={32} tick={{ fontSize: 11 }} domain={key === 'perf' ? [0, 100] : undefined} />
                                  <Tooltip contentStyle={{ backgroundColor: '#0c1015', borderColor: '#2a3644' }} />
                                  <Bar dataKey={key} fill={color} radius={[3, 3, 0, 0]} />
                                </BarChart>
                              )}
                            </ResponsiveContainer>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        )
      )}

      {/* MATCHES: full history, one tile per match with map/date/performance */}
      {activeTab === 'matches' && (
        <div className="max-w-7xl mx-auto px-6 py-10">
          <h1 className="font-display text-3xl font-bold mb-8">Match History</h1>

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
              {parsedMatches.map((m) => {
                const t = m.match_data.telemetry;
                const accent = t.kd_ratio >= 1 ? 'var(--cyan)' : 'var(--danger)';
                const index = performanceIndex(t);
                return (
                  <div
                    key={m.match_id}
                    className="match-card bg-[var(--panel)] border border-[var(--edge)] rounded-2xl p-5"
                    style={{ '--accent': accent } as CSSProperties}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-display font-bold text-[var(--text)]">{formatMapName(t.map)}</span>
                      <span className="font-tel text-xl font-extrabold" style={{ color: accent }}>{t.kd_ratio}</span>
                    </div>
                    <div className="mb-4">
                      <span className="text-xs text-[var(--text-dim)]">{formatMatchDate(t)}</span>
                    </div>

                    <div className="flex items-center justify-between mb-4 bg-[var(--void)] rounded-xl px-3 py-2">
                      <span className="text-[10px] uppercase tracking-wide text-[var(--text-dim)]">Performance Index</span>
                      <span className="font-tel font-bold text-[var(--amber)]">{index}<span className="text-[var(--text-dim)] text-xs">/100</span></span>
                    </div>

                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div>
                        <p className="font-tel font-bold text-[var(--text)]">{t.kills}</p>
                        <p className="text-[10px] text-[var(--text-dim)] uppercase tracking-wide">Kills</p>
                      </div>
                      <div>
                        <p className="font-tel font-bold text-[var(--text)]">{t.adr}</p>
                        <p className="text-[10px] text-[var(--text-dim)] uppercase tracking-wide">ADR</p>
                      </div>
                      <div>
                        <p className="font-tel font-bold text-[var(--text)]">{t.headshot_pct}%</p>
                        <p className="text-[10px] text-[var(--text-dim)] uppercase tracking-wide">HS</p>
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
          jwtToken && <InsightsDashboard jwtToken={jwtToken} onAskCoach={askCoachFromInsights} />
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
              <div className="w-64 shrink-0 hud-corners bg-[var(--panel)] border border-[var(--edge)] rounded-2xl flex flex-col overflow-hidden">
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
                      <button
                        key={group.id}
                        onClick={() => switchConversation(group)}
                        className={`w-full text-left px-3 py-2.5 rounded-xl text-xs transition-colors border ${
                          activeConversationId === group.id
                            ? 'bg-[var(--panel-raised)] border-[var(--cyan-dim)]'
                            : 'border-transparent hover:bg-[var(--panel-raised)]'
                        }`}
                      >
                        <p className="font-medium text-[var(--text)] truncate">{conversationPreview(group)}</p>
                        <p className="text-[10px] text-[var(--text-dim)] mt-0.5">{conversationDateLabel(group.lastAt)}</p>
                      </button>
                    ))
                  )}
                </div>
              </div>

              <div className="hud-corners glass flex-1 border border-[var(--edge)] rounded-2xl overflow-hidden flex flex-col min-h-0">
                <div className="flex-1 overflow-y-auto p-6 space-y-4">
                  {messages.length === 0 ? (
                    <div className="flex flex-col items-center justify-center text-center h-full text-[var(--text-dim)] py-12">
                      <div className="w-16 h-16 mx-auto mb-4 rounded-full border-2 border-[var(--cyan-dim)] flex items-center justify-center">
                        <Brain className="w-8 h-8 text-[var(--cyan)]" />
                      </div>
                      <p className="font-display font-bold text-lg text-[var(--text)]">Your AI Coach is ready</p>
                      <p className="text-sm max-w-md mb-4">
                        Specific questions get specific answers — vague ones like "am I good?" just waste a question. Try one of these, or ask your own the same way:
                      </p>
                      <div className="flex flex-wrap gap-2 justify-center max-w-lg">
                        {EXAMPLE_COACH_PROMPTS.map((example) => (
                          <button
                            key={example}
                            type="button"
                            onClick={() => setChatInput(example)}
                            className="text-xs px-3 py-1.5 rounded-full border border-[var(--edge)] bg-[var(--panel-raised)] text-[var(--text)] hover:border-[var(--cyan-dim)] hover:text-[var(--cyan)] transition-colors"
                          >
                            {example}
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : (
                    messages.map((m, idx) => (
                      <div key={idx} className={`flex items-end gap-2.5 ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                        {m.role === 'assistant' && (
                          <div className="w-7 h-7 rounded-full bg-[var(--panel-raised)] border border-[var(--cyan-dim)] flex items-center justify-center shrink-0">
                            <Brain className="w-3.5 h-3.5 text-[var(--cyan)]" />
                          </div>
                        )}
                        <div
                          className={`max-w-[75%] rounded-2xl px-5 py-3 text-sm leading-relaxed ${
                            m.role === 'user'
                              ? 'bg-[var(--cyan)] text-[#03141a] rounded-br-none font-medium'
                              : 'bg-[var(--panel-raised)] text-[var(--text)] rounded-bl-none border border-[var(--edge)]'
                          }`}
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
                    <div className="flex items-end gap-2.5 justify-start">
                      <div className="w-7 h-7 rounded-full bg-[var(--panel-raised)] border border-[var(--cyan-dim)] flex items-center justify-center shrink-0">
                        <Brain className="w-3.5 h-3.5 text-[var(--cyan)]" />
                      </div>
                      <div className="bg-[var(--panel-raised)] text-[var(--text-dim)] rounded-2xl rounded-bl-none border border-[var(--edge)] px-5 py-3 text-sm flex items-center gap-2">
                        <Loader2 className="w-4 h-4 animate-spin text-[var(--cyan)]" />
                        AI Coach is studying your match telemetry...
                      </div>
                    </div>
                  )}
                  <div ref={messagesEndRef} />
                </div>

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
        <div className="max-w-xl mx-auto px-6 py-16">
          <h1 className="font-display text-3xl font-bold mb-8">Integration Settings</h1>
          <div className="hud-corners bg-[var(--panel)] border border-[var(--edge)] p-8 rounded-2xl">
            {isOnboarded && (
              <div className="flex items-center gap-3 text-[var(--cyan)] font-medium mb-6 text-sm">
                <CheckCircle2 className="w-5 h-5" /> Auto-Sync is currently active.
              </div>
            )}
            <form onSubmit={handleOnboarding} className="space-y-4">
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
                <label className="block text-sm font-semibold text-[var(--text-dim)] mb-2">Recent Match Share Code</label>
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
                className="px-5 py-3 bg-[var(--cyan)] hover:bg-[#5eead4] disabled:bg-[var(--edge)] disabled:text-[var(--text-dim)] font-bold text-[#03141a] rounded-xl transition-all flex items-center gap-2"
              >
                {isOnboarding && <Loader2 className="w-5 h-5 animate-spin" />}
                {isOnboarded ? 'Update Codes' : 'Activate Auto-Sync'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
