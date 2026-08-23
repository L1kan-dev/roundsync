'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { ResponsiveContainer, LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import { Brain, BarChart2, ShieldAlert, LogOut, CheckCircle2, ChevronRight, Loader2, Settings, Target, Crosshair, Radar, Download } from 'lucide-react';
import { LogoMark, LogoLockup } from '@/components/Logo';
import { Toast } from '@/components/Toast';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface Match {
  match_id: string;
  created_at: string;
  match_data: {
    telemetry: {
      status: string;
      kd_ratio: number;
      adr: number;
      kills: number;
      deaths: number;
      headshot_pct: number;
    };
  };
}

export default function Home() {
  const [activeTab, setActiveTab] = useState<'home' | 'coach' | 'settings'>('home');
  const [steamId, setSteamId] = useState<string | null>(null);
  const [jwtToken, setJwtToken] = useState<string | null>(null);
  const [matches, setMatches] = useState<Match[]>([]);
  const [isLoadingMatches, setIsLoadingMatches] = useState(false);

  // Onboarding status — null while unknown, then a real true/false from the server
  const [isOnboarded, setIsOnboarded] = useState<boolean | null>(null);
  const [gameAuthCode, setGameAuthCode] = useState('');
  const [recentShareCode, setRecentShareCode] = useState('');
  const [isOnboarding, setIsOnboarding] = useState(false);

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
  const parsedMatches = matches.filter(m => m.match_data.telemetry?.status === 'fully_parsed');
  const avgKd = parsedMatches.length > 0
    ? (parsedMatches.reduce((acc, m) => acc + m.match_data.telemetry.kd_ratio, 0) / parsedMatches.length).toFixed(2)
    : '0.00';
  const avgAdr = parsedMatches.length > 0
    ? (parsedMatches.reduce((acc, m) => acc + m.match_data.telemetry.adr, 0) / parsedMatches.length).toFixed(1)
    : '0.0';
  const avgHs = parsedMatches.length > 0
    ? (parsedMatches.reduce((acc, m) => acc + m.match_data.telemetry.headshot_pct, 0) / parsedMatches.length).toFixed(1)
    : '0.0';

  const chartData = parsedMatches.map(m => ({
    name: m.match_id.substring(5, 12),
    kd: m.match_data.telemetry.kd_ratio,
    adr: m.match_data.telemetry.adr
  })).reverse();

  const isLive = isOnboarded === true;

  // Sync progress math
  const syncCounts = syncStatus?.counts;
  const totalTracked = syncCounts
    ? syncCounts.pending_url + syncCounts.pending_download + syncCounts.downloading + syncCounts.fully_parsed + syncCounts.parse_failed
    : 0;
  const readyCount = syncCounts?.fully_parsed ?? 0;
  const failedCount = syncCounts?.parse_failed ?? 0;
  const queuedCount = syncCounts ? syncCounts.pending_url + syncCounts.pending_download : 0;
  const hasActiveSync = queuedCount > 0 || (syncCounts?.downloading ?? 0) > 0 || failedCount > 0;
  const currentElapsed = syncStatus?.current ? Math.max(0, nowSeconds - syncStatus.current.startedAt) : 0;
  const currentPct = syncStatus?.avgSeconds
    ? Math.min(96, Math.round((currentElapsed / syncStatus.avgSeconds) * 100))
    : null;

  // ---------- LOGGED-OUT LANDING ----------
  if (!steamId) {
    return (
      <div className="relative min-h-screen bg-[var(--void)] text-[var(--text)] overflow-hidden flex flex-col items-center justify-center px-6">
        <div className="radar-backdrop" />
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
    <div className="flex h-screen bg-[var(--void)] text-[var(--text)]">
      {showWelcomeToast && (
        <Toast
          message="Successfully signed in"
          subtext="Your Steam account is authenticated."
          onDone={() => setShowWelcomeToast(false)}
        />
      )}

      {/* Sidebar Navigation */}
      <aside className="w-64 bg-[var(--panel)] border-r border-[var(--edge)] flex flex-col justify-between p-6">
        <div>
          <LogoLockup className="mb-2" />
          {isLive && (
            <div className="flex items-center gap-2 mb-8 text-xs text-[var(--cyan)] font-medium">
              <span className="w-2 h-2 rounded-full bg-[var(--cyan)] live-dot" />
              Live Sync Active
            </div>
          )}
          {!isLive && <div className="mb-8" />}

          <nav className="space-y-2">
            <button
              onClick={() => setActiveTab('home')}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg font-medium transition-colors ${
                activeTab === 'home' ? 'bg-[var(--cyan)]/15 text-[var(--cyan)] border border-[var(--cyan-dim)]' : 'text-[var(--text-dim)] hover:bg-[var(--panel-raised)] hover:text-[var(--text)]'
              }`}
            >
              <BarChart2 className="w-5 h-5" />
              Home
            </button>
            <button
              onClick={() => setActiveTab('coach')}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg font-medium transition-colors ${
                activeTab === 'coach' ? 'bg-[var(--cyan)]/15 text-[var(--cyan)] border border-[var(--cyan-dim)]' : 'text-[var(--text-dim)] hover:bg-[var(--panel-raised)] hover:text-[var(--text)]'
              }`}
            >
              <Brain className="w-5 h-5" />
              AI Coach
            </button>
            <button
              onClick={() => setActiveTab('settings')}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg font-medium transition-colors ${
                activeTab === 'settings' ? 'bg-[var(--cyan)]/15 text-[var(--cyan)] border border-[var(--cyan-dim)]' : 'text-[var(--text-dim)] hover:bg-[var(--panel-raised)] hover:text-[var(--text)]'
              }`}
            >
              <Settings className="w-5 h-5" />
              Integration Settings
            </button>
          </nav>
        </div>

        <div className="bg-[var(--panel-raised)] p-4 rounded-xl border border-[var(--edge)] flex items-center justify-between">
          <div className="truncate pr-2">
            <p className="text-xs text-[var(--text-dim)]">Authenticated SteamID</p>
            <p className="text-sm font-tel font-semibold truncate text-[var(--cyan)]">{steamId}</p>
          </div>
          <button
            onClick={handleLogout}
            className="p-2 text-[var(--text-dim)] hover:text-[var(--danger)] hover:bg-[var(--panel)] rounded-lg transition-all"
            title="Sign Out"
          >
            <LogOut className="w-5 h-5" />
          </button>
        </div>
      </aside>

      {/* Main Panel Content */}
      <main className="flex-1 overflow-y-auto p-10">

        {/* HOME: onboarding gate, then the real dashboard */}
        {activeTab === 'home' && (
          isOnboarded === null ? (
            <div className="flex items-center justify-center h-full text-[var(--text-dim)] gap-3">
              <Loader2 className="w-6 h-6 animate-spin" /> Checking your setup...
            </div>
          ) : !isOnboarded ? (
            <div className="max-w-xl mx-auto mt-12">
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
              <h1 className="font-display text-3xl font-bold mb-8">Performance Overview</h1>

              {hasActiveSync && (
                <div className="hud-corners bg-[var(--panel)] border border-[var(--edge)] rounded-2xl p-6 mb-8">
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
                <div className="hud-corners bg-[var(--panel)] border border-[var(--edge)] p-8 rounded-2xl text-center text-[var(--text-dim)]">
                  <BarChart2 className="w-12 h-12 mx-auto mb-3 text-[var(--edge-bright)]" />
                  <p className="font-bold mb-1 text-[var(--text)]">No parsed match stats found yet</p>
                  <p className="text-sm">RoundSync is watching for your next match — this updates automatically.</p>
                </div>
              ) : (
                <div className="space-y-8">
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                    <div className="hud-corners bg-[var(--panel)] p-6 rounded-2xl border border-[var(--edge)]">
                      <p className="text-sm font-semibold text-[var(--text-dim)] mb-1">Matches Parsed</p>
                      <p className="text-3xl font-tel font-extrabold text-[var(--cyan)]">{parsedMatches.length}</p>
                    </div>
                    <div className="hud-corners bg-[var(--panel)] p-6 rounded-2xl border border-[var(--edge)]">
                      <p className="text-sm font-semibold text-[var(--text-dim)] mb-1">Avg K/D Ratio</p>
                      <p className="text-3xl font-tel font-extrabold text-[var(--cyan)]">{avgKd}</p>
                    </div>
                    <div className="hud-corners bg-[var(--panel)] p-6 rounded-2xl border border-[var(--edge)]">
                      <p className="text-sm font-semibold text-[var(--text-dim)] mb-1">Avg ADR</p>
                      <p className="text-3xl font-tel font-extrabold text-[var(--cyan)]">{avgAdr}</p>
                    </div>
                    <div className="hud-corners bg-[var(--panel)] p-6 rounded-2xl border border-[var(--edge)]">
                      <p className="text-sm font-semibold text-[var(--text-dim)] mb-1">Avg Headshot %</p>
                      <p className="text-3xl font-tel font-extrabold text-[var(--cyan)]">{avgHs}%</p>
                    </div>
                  </div>

                  <div className="flex items-center justify-end">
                    <button
                      onClick={fetchMatches}
                      disabled={isLoadingMatches}
                      className="px-4 py-2 bg-[var(--panel-raised)] hover:bg-[var(--edge)] text-[var(--text)] font-medium rounded-xl transition-all flex items-center gap-2 border border-[var(--edge)]"
                    >
                      {isLoadingMatches ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                      Refresh
                    </button>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    <div className="hud-corners bg-[var(--panel)] p-6 rounded-2xl border border-[var(--edge)]">
                      <h3 className="font-display font-bold text-lg mb-4">K/D Ratio Progression</h3>
                      <div className="h-64">
                        <ResponsiveContainer width="100%" height="100%">
                          <LineChart data={chartData}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#1c242e" />
                            <XAxis dataKey="name" stroke="#8592a1" />
                            <YAxis stroke="#8592a1" />
                            <Tooltip contentStyle={{ backgroundColor: '#0c1015', borderColor: '#2a3644' }} />
                            <Line type="monotone" dataKey="kd" stroke="#22d3ee" strokeWidth={3} activeDot={{ r: 8 }} />
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                    </div>

                    <div className="hud-corners bg-[var(--panel)] p-6 rounded-2xl border border-[var(--edge)]">
                      <h3 className="font-display font-bold text-lg mb-4">Average Damage per Round (ADR)</h3>
                      <div className="h-64">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={chartData}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#1c242e" />
                            <XAxis dataKey="name" stroke="#8592a1" />
                            <YAxis stroke="#8592a1" />
                            <Tooltip contentStyle={{ backgroundColor: '#0c1015', borderColor: '#2a3644' }} />
                            <Bar dataKey="adr" fill="#fb923c" radius={[4, 4, 0, 0]} />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  </div>

                  <div className="bg-[var(--panel)] rounded-2xl border border-[var(--edge)] overflow-hidden">
                    <div className="px-6 py-4 border-b border-[var(--edge)]">
                      <h3 className="font-display font-bold">Match Breakdown</h3>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-sm text-[var(--text-dim)]">
                        <thead className="bg-[var(--void)] text-[var(--text)] font-semibold uppercase text-xs">
                          <tr>
                            <th className="px-6 py-3">Match Share ID</th>
                            <th className="px-6 py-3 text-center">Kills</th>
                            <th className="px-6 py-3 text-center">Deaths</th>
                            <th className="px-6 py-3 text-center">K/D</th>
                            <th className="px-6 py-3 text-center">ADR</th>
                            <th className="px-6 py-3 text-center">Headshot %</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[var(--edge)]">
                          {parsedMatches.map((m) => {
                            const t = m.match_data.telemetry;
                            return (
                              <tr key={m.match_id} className="hover:bg-[var(--panel-raised)] transition-colors">
                                <td className="px-6 py-4 font-tel text-[var(--cyan)] text-xs">{m.match_id}</td>
                                <td className="px-6 py-4 text-center font-tel text-[var(--text)]">{t.kills}</td>
                                <td className="px-6 py-4 text-center font-tel text-[var(--text)]">{t.deaths}</td>
                                <td className="px-6 py-4 text-center font-tel font-bold text-[var(--text)]">{t.kd_ratio}</td>
                                <td className="px-6 py-4 text-center font-tel text-[var(--text)]">{t.adr}</td>
                                <td className="px-6 py-4 text-center font-tel text-[var(--text)]">{t.headshot_pct}%</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )
        )}

        {/* AI COACH CHAT */}
        {activeTab === 'coach' && (
          <div className="h-[calc(100vh-140px)] flex flex-col justify-between">
            <div className="mb-4">
              <h1 className="font-display text-3xl font-bold mb-1">Conversational AI Coach</h1>
              <p className="text-[var(--text-dim)]">Ask about a specific moment in your last match — not a generic tip.</p>
            </div>

            {!isOnboarded ? (
              <div className="bg-[var(--panel)] border border-[var(--edge)] p-8 rounded-2xl flex items-center gap-4 text-[var(--amber)] flex-1 justify-center max-h-[200px]">
                <ShieldAlert className="w-6 h-6" /> Finish the one-time setup on Home before consulting your Coach.
              </div>
            ) : (
              <div className="flex-1 bg-[var(--panel)] border border-[var(--edge)] rounded-2xl overflow-hidden flex flex-col justify-between h-[80%]">
                <div className="flex-1 overflow-y-auto p-6 space-y-4">
                  {messages.length === 0 ? (
                    <div className="flex flex-col items-center justify-center text-center h-full text-[var(--text-dim)] py-12">
                      <Brain className="w-16 h-16 text-[var(--edge-bright)] mb-3" />
                      <p className="font-bold text-lg text-[var(--text)]">Your AI Coach is ready</p>
                      <p className="text-sm max-w-md">Ask questions like: "Why is my ADR dropping?" or "How can I improve my utility usage?"</p>
                    </div>
                  ) : (
                    messages.map((m, idx) => (
                      <div key={idx} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                        <div
                          className={`max-w-[80%] rounded-2xl px-5 py-3 text-sm leading-relaxed ${
                            m.role === 'user'
                              ? 'bg-[var(--cyan)] text-[#03141a] rounded-tr-none font-medium'
                              : 'bg-[var(--panel-raised)] text-[var(--text)] rounded-tl-none border border-[var(--edge)]'
                          }`}
                        >
                          <p className="whitespace-pre-wrap">{m.content}</p>
                        </div>
                      </div>
                    ))
                  )}
                  {isSendingMessage && (
                    <div className="flex justify-start">
                      <div className="bg-[var(--panel-raised)] text-[var(--text-dim)] rounded-2xl rounded-tl-none border border-[var(--edge)] px-5 py-3 text-sm flex items-center gap-2">
                        <Loader2 className="w-4 h-4 animate-spin text-[var(--cyan)]" />
                        AI Coach is studying your match telemetry...
                      </div>
                    </div>
                  )}
                  <div ref={messagesEndRef} />
                </div>

                <form onSubmit={askCoach} className="bg-[var(--void)] p-4 border-t border-[var(--edge)] flex gap-3">
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
        )}

        {/* INTEGRATION SETTINGS — always reachable, pre-fillable re-entry point */}
        {activeTab === 'settings' && (
          <div className="max-w-xl">
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
      </main>
    </div>
  );
}
