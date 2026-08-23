'use client';

import React, { useState, useEffect, useRef, useCallback, CSSProperties } from 'react';
import { ResponsiveContainer, LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import { Brain, BarChart2, ShieldAlert, CheckCircle2, ChevronRight, Loader2, Target, Crosshair, Radar, Download } from 'lucide-react';
import { LogoMark } from '@/components/Logo';
import { Toast } from '@/components/Toast';
import { TopNav } from '@/components/TopNav';

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

function formatMapName(map?: string | null): string {
  if (!map) return 'Unknown Map';
  return map.replace(/^de_/, '').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function Home() {
  const [activeTab, setActiveTab] = useState<'home' | 'matches' | 'coach' | 'settings'>('home');
  const [steamId, setSteamId] = useState<string | null>(null);
  const [jwtToken, setJwtToken] = useState<string | null>(null);
  const [matches, setMatches] = useState<Match[]>([]);
  const [isLoadingMatches, setIsLoadingMatches] = useState(false);

  // Onboarding status — null while unknown, then a real true/false from the server
  const [isOnboarded, setIsOnboarded] = useState<boolean | null>(null);
  const [gameAuthCode, setGameAuthCode] = useState('');
  const [recentShareCode, setRecentShareCode] = useState('');
  const [isOnboarding, setIsOnboarding] = useState(false);

  // Real Steam identity — fetched from the server, not just the raw SteamID
  const [personaName, setPersonaName] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

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
    } catch (err) {
      console.error('Error fetching profile:', err);
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
      const interval = setInterval(() => {
        fetchMatches();
        fetchSyncStatus(jwtToken);
      }, 10000);
      return () => clearInterval(interval);
    }
  }, [jwtToken, fetchProfile, fetchMatches, fetchSyncStatus]);

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
      } else {
        setMessages(prev => [...prev, { role: 'assistant', content: `⚠️ Error: ${data.error || 'Server error'}` }]);
      }
    } catch (err) {
      setMessages(prev => [...prev, { role: 'assistant', content: '⚠️ Failed to connect to API Gateway.' }]);
    } finally {
      setIsSendingMessage(false);
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
  const avgAdr = parsedMatches.length > 0
    ? (parsedMatches.reduce((acc, m) => acc + m.match_data.telemetry.adr, 0) / parsedMatches.length).toFixed(1)
    : '0.0';
  const avgHs = parsedMatches.length > 0
    ? (parsedMatches.reduce((acc, m) => acc + m.match_data.telemetry.headshot_pct, 0) / parsedMatches.length).toFixed(1)
    : '0.0';
  const avgPerformanceIndex = parsedMatches.length > 0
    ? Math.round(parsedMatches.reduce((acc, m) => acc + performanceIndex(m.match_data.telemetry), 0) / parsedMatches.length)
    : 0;

  const chartData = parsedMatches.map(m => ({
    name: m.match_data.telemetry.map ? formatMapName(m.match_data.telemetry.map) : m.match_id.substring(5, 12),
    kd: m.match_data.telemetry.kd_ratio,
    adr: m.match_data.telemetry.adr
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
          <div>
            {/* Hero band — the featured KD ring, secondary stats. Atmosphere comes from the global app backdrop. */}
            <div className="relative">
              <div className="relative z-10 max-w-7xl mx-auto px-6 pt-12 pb-10">
                <p className="text-[var(--text-dim)] text-sm mb-1">Welcome back,</p>
                <h1 className="font-display text-4xl font-bold mb-1 truncate">{personaName || 'Player'}</h1>
                <p className="text-xs text-[var(--text-dim)] mb-8">
                  Stats based on your last {parsedMatches.length} recent games
                  {failedCount > 0 && <span className="text-[var(--danger)]"> · {failedCount} didn't load</span>}
                </p>

                <div className="flex flex-col lg:flex-row gap-6 items-center lg:items-stretch">
                  <div className="glass border border-[var(--edge)] rounded-3xl p-6 flex flex-col items-center justify-center shrink-0 relative">
                    <div
                      className="relative w-32 h-32 stat-ring"
                      style={{ '--pct': kdRingPct } as CSSProperties}
                    >
                      <div className="absolute inset-2 rounded-full bg-[var(--panel)] flex flex-col items-center justify-center">
                        <span className="font-tel text-3xl font-extrabold text-[var(--cyan)]">{avgKd}</span>
                        <span className="text-[10px] uppercase tracking-wider text-[var(--text-dim)] mt-1">K/D Ratio</span>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 flex-1">
                    <div className="glass border border-[var(--edge)] rounded-2xl p-5 flex flex-col justify-center">
                      <p className="text-xs uppercase tracking-wider text-[var(--text-dim)] mb-2">Avg ADR</p>
                      <p className="font-tel text-2xl font-bold">{avgAdr}</p>
                    </div>
                    <div className="glass border border-[var(--edge)] rounded-2xl p-5 flex flex-col justify-center">
                      <p className="text-xs uppercase tracking-wider text-[var(--text-dim)] mb-2">Headshot %</p>
                      <p className="font-tel text-2xl font-bold">{avgHs}%</p>
                    </div>
                    <div className="glass border border-[var(--edge)] rounded-2xl p-5 flex flex-col justify-center">
                      <p className="text-xs uppercase tracking-wider text-[var(--text-dim)] mb-2">Avg Performance</p>
                      <p className="font-tel text-2xl font-bold text-[var(--amber)]">{avgPerformanceIndex}<span className="text-[var(--text-dim)] text-sm">/100</span></p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="max-w-7xl mx-auto px-6 py-10 space-y-8">
              {hasActiveSync && (
                <div className="hud-corners bg-[var(--panel)] border border-[var(--edge)] rounded-2xl p-6">
                  <div className="flex items-center justify-between mb-3">
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

                  <div className="w-full h-2 bg-[var(--void)] rounded-full overflow-hidden mb-4 flex">
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
                <div className="flex flex-col items-center justify-center py-20 gap-3 text-[var(--text-dim)]">
                  <Loader2 className="w-10 h-10 animate-spin text-[var(--cyan)]" />
                  <p>Loading match history...</p>
                </div>
              ) : parsedMatches.length === 0 ? (
                <div className="hud-corners relative overflow-hidden bg-[var(--panel)] border border-[var(--edge)] rounded-2xl text-center text-[var(--text-dim)] py-24 px-8">
                  <div className="radar-backdrop opacity-60" />
                  <div className="relative z-10">
                    <div className="w-20 h-20 mx-auto mb-5 rounded-full border-2 border-[var(--cyan-dim)] flex items-center justify-center">
                      <Radar className="w-9 h-9 text-[var(--cyan)]" />
                    </div>
                    <p className="font-display text-xl font-bold mb-2 text-[var(--text)]">Scanning for your matches</p>
                    <p className="text-sm max-w-sm mx-auto">RoundSync is watching for your next match — this dashboard fills in automatically the moment one finishes parsing.</p>
                  </div>
                </div>
              ) : (
                <>
                  <h2 className="font-display text-xl font-bold">Trends</h2>

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <div className="hud-corners bg-[var(--panel)] p-6 rounded-2xl border border-[var(--edge)]">
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="font-display font-bold text-lg">K/D Ratio Progression</h3>
                        <span className="text-[10px] text-[var(--text-dim)]">Hover a point for match details</span>
                      </div>
                      <div className="h-64">
                        <ResponsiveContainer width="100%" height="100%">
                          <LineChart data={chartData}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#1c242e" />
                            <XAxis dataKey="name" stroke="#8592a1" tick={false} />
                            <YAxis stroke="#8592a1" />
                            <Tooltip contentStyle={{ backgroundColor: '#0c1015', borderColor: '#2a3644' }} />
                            <Line type="monotone" dataKey="kd" stroke="#22d3ee" strokeWidth={3} activeDot={{ r: 8 }} />
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                    </div>

                    <div className="hud-corners bg-[var(--panel)] p-6 rounded-2xl border border-[var(--edge)]">
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="font-display font-bold text-lg">Average Damage per Round (ADR)</h3>
                        <span className="text-[10px] text-[var(--text-dim)]">Hover a bar for match details</span>
                      </div>
                      <div className="h-64">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={chartData}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#1c242e" />
                            <XAxis dataKey="name" stroke="#8592a1" tick={false} />
                            <YAxis stroke="#8592a1" />
                            <Tooltip contentStyle={{ backgroundColor: '#0c1015', borderColor: '#2a3644' }} />
                            <Bar dataKey="adr" fill="#fb923c" radius={[4, 4, 0, 0]} />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
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

      {/* AI COACH CHAT */}
      {activeTab === 'coach' && (
        <div className="flex flex-col h-[calc(100vh-4rem)]">
          <div className="relative shrink-0">
            <div className="relative z-10 max-w-5xl mx-auto px-6 py-8">
              <h1 className="font-display text-3xl font-bold mb-1">Conversational AI Coach</h1>
              <p className="text-[var(--text-dim)]">Ask about a specific moment in your last match — not a generic tip.</p>
            </div>
          </div>

          <div className="max-w-5xl mx-auto px-6 py-6 w-full flex-1 min-h-0 flex flex-col">
            {!isOnboarded ? (
              <div className="bg-[var(--panel)] border border-[var(--edge)] p-8 rounded-2xl flex items-center gap-4 text-[var(--amber)] justify-center">
                <ShieldAlert className="w-6 h-6" /> Finish the one-time setup on Home before consulting your Coach.
              </div>
            ) : (
              <div className="hud-corners glass flex-1 border border-[var(--edge)] rounded-2xl overflow-hidden flex flex-col min-h-0">
                <div className="flex-1 overflow-y-auto p-6 space-y-4">
                  {messages.length === 0 ? (
                    <div className="flex flex-col items-center justify-center text-center h-full text-[var(--text-dim)] py-12">
                      <div className="w-16 h-16 mx-auto mb-4 rounded-full border-2 border-[var(--cyan-dim)] flex items-center justify-center">
                        <Brain className="w-8 h-8 text-[var(--cyan)]" />
                      </div>
                      <p className="font-display font-bold text-lg text-[var(--text)]">Your AI Coach is ready</p>
                      <p className="text-sm max-w-md">Ask questions like: "Why is my ADR dropping?" or "How can I improve my utility usage?"</p>
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
                          <p className="whitespace-pre-wrap">{m.content}</p>
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
