'use client';

import React, { useState, useEffect, useRef } from 'react';
import { ResponsiveContainer, LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import { Gamepad2, Brain, BarChart2, ShieldAlert, User, LogOut, CheckCircle2, ChevronRight, Loader2 } from 'lucide-react';

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
      flashes_thrown?: number;
      smokes_thrown?: number;
    };
  };
}

export default function Home() {
  const [activeTab, setActiveTab] = useState<'home' | 'dashboard' | 'coach'>('home');
  const [steamId, setSteamId] = useState<string | null>(null);
  const [jwtToken, setJwtToken] = useState<string | null>(null);
  const [matches, setMatches] = useState<Match[]>([]);
  const [isLoadingMatches, setIsLoadingMatches] = useState(false);
  
  // User Profile status (Mock setup config checks)
  const [gameAuthCode, setGameAuthCode] = useState('');
  const [recentShareCode, setRecentShareCode] = useState('');
  const [isOnboarding, setIsOnboarding] = useState(false);
  const [onboardSuccess, setOnboardSuccess] = useState(false);

  // Chat State
  const [chatInput, setChatInput] = useState('');
  const [messages, setMessages] = useState<{ role: 'user' | 'assistant'; content: string }[]>([]);
  const [isSendingMessage, setIsSendingMessage] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Load Session on Mount
  useEffect(() => {
    const savedSteamId = localStorage.getItem('steamId');
    const savedToken = localStorage.getItem('jwtToken');
    if (savedSteamId && savedToken) {
      setSteamId(savedSteamId);
      setJwtToken(savedToken);
    }
  }, []);

    // Fetch match history when token changes & auto-poll every 10 seconds
  useEffect(() => {
    if (jwtToken) {
      fetchMatches();
      const interval = setInterval(fetchMatches, 10000); // Poll every 10s
      return () => clearInterval(interval);
    }
  }, [jwtToken]);

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
    localStorage.removeItem('steamId');
    localStorage.removeItem('jwtToken');
    setActiveTab('home');
  };

  const fetchMatches = async () => {
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
        setOnboardSuccess(true);
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
    name: m.match_id.substring(5, 12), // Trim share code for label
    kd: m.match_data.telemetry.kd_ratio,
    adr: m.match_data.telemetry.adr
  })).reverse(); // Oldest to newest matches

  return (
    <div className="flex h-screen bg-slate-950 text-slate-50">
      {/* Sidebar Navigation */}
      <aside className="w-64 bg-slate-900 border-r border-slate-800 flex flex-col justify-between p-6">
        <div>
          <div className="flex items-center gap-3 mb-8">
            <span className="p-2 bg-indigo-600 rounded-lg text-white">
              <Gamepad2 className="w-6 h-6" />
            </span>
            <span className="font-bold text-xl tracking-wider">RoundSync</span>
          </div>

          <nav className="space-y-2">
            <button
              onClick={() => setActiveTab('home')}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg font-medium transition-colors ${
                activeTab === 'home' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
              }`}
            >
              <User className="w-5 h-5" />
              Home / Auth
            </button>
            <button
              onClick={() => setActiveTab('dashboard')}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg font-medium transition-colors ${
                activeTab === 'dashboard' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
              }`}
            >
              <BarChart2 className="w-5 h-5" />
              Stats Dashboard
            </button>
            <button
              onClick={() => setActiveTab('coach')}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg font-medium transition-colors ${
                activeTab === 'coach' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
              }`}
            >
              <Brain className="w-5 h-5" />
              AI Coach Chat
            </button>
          </nav>
        </div>

        {/* User Account Footer */}
        {steamId && (
          <div className="bg-slate-800/50 p-4 rounded-xl border border-slate-800 flex items-center justify-between">
            <div className="truncate pr-2">
              <p className="text-xs text-slate-500">Authenticated SteamID</p>
              <p className="text-sm font-semibold truncate text-indigo-400">{steamId}</p>
            </div>
            <button 
              onClick={handleLogout} 
              className="p-2 text-slate-400 hover:text-rose-400 hover:bg-slate-800 rounded-lg transition-all"
              title="Sign Out"
            >
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        )}
      </aside>

      {/* Main Panel Content */}
      <main className="flex-1 overflow-y-auto p-10">
        
        {/* TAB 1: HOME / AUTH */}
        {activeTab === 'home' && (
          <div className="max-w-3xl">
            <h1 className="text-3xl font-extrabold mb-2">Automated CS2 AI Coaching</h1>
            <p className="text-slate-400 mb-8">Elevate your performance with deep telemetry analysis fueled by Gemini AI models.</p>

            {!steamId ? (
              <div className="bg-slate-900 border border-slate-800 p-8 rounded-2xl flex flex-col items-center text-center">
                <Gamepad2 className="w-16 h-16 text-indigo-500 mb-4" />
                <h3 className="text-xl font-bold mb-2">Connect Your Steam Account</h3>
                <p className="text-slate-400 max-w-md mb-6">
                  Sign in securely with Steam Community OpenID to let RoundSync link and read your CS2 match telemetry history.
                </p>
                <button
                  onClick={loginWithSteam}
                  className="px-6 py-3 bg-indigo-600 hover:bg-indigo-500 font-bold text-white rounded-xl shadow-lg hover:shadow-indigo-500/20 transition-all flex items-center gap-3"
                >
                  Sign In With Steam
                  <ChevronRight className="w-5 h-5" />
                </button>
              </div>
            ) : (
              <div className="space-y-6">
                <div className="bg-emerald-950/20 border border-emerald-500/30 p-6 rounded-2xl flex items-center gap-4">
                  <CheckCircle2 className="w-8 h-8 text-emerald-400 shrink-0" />
                  <div>
                    <h3 className="font-bold text-emerald-300">Successfully Signed In</h3>
                    <p className="text-sm text-slate-400">Your Steam account is authenticated. RoundSync is syncing active matches.</p>
                  </div>
                </div>

                {/* Onboarding Setup Check */}
                <div className="bg-slate-900 border border-slate-800 p-8 rounded-2xl">
                  <h3 className="text-xl font-bold mb-4">🔑 Game Integration Setup</h3>
                  {onboardSuccess ? (
                    <div className="flex items-center gap-3 text-emerald-400 font-medium">
                      <CheckCircle2 className="w-5 h-5" /> Auto-Sync is successfully active!
                    </div>
                  ) : (
                    <form onSubmit={handleOnboarding} className="space-y-4">
                      <div>
                        <label className="block text-sm font-semibold text-slate-400 mb-2">CS2 Game Authentication Code</label>
                        <input
                          type="password"
                          required
                          value={gameAuthCode}
                          onChange={(e) => setGameAuthCode(e.target.value)}
                          placeholder="••••••••••••"
                          className="w-full bg-slate-950 border border-slate-800 focus:border-indigo-500 outline-none rounded-xl px-4 py-3 text-slate-200 transition-colors"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-semibold text-slate-400 mb-2">1 Recent Match Share Code (CSGO-XXXXX-...)</label>
                        <input
                          type="text"
                          required
                          value={recentShareCode}
                          onChange={(e) => setRecentShareCode(e.target.value)}
                          placeholder="CSGO-abc12-def34-..."
                          className="w-full bg-slate-950 border border-slate-800 focus:border-indigo-500 outline-none rounded-xl px-4 py-3 text-slate-200 transition-colors"
                        />
                      </div>
                      <button
                        type="submit"
                        disabled={isOnboarding}
                        className="px-5 py-3 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 font-bold text-white rounded-xl transition-all flex items-center gap-2"
                      >
                        {isOnboarding && <Loader2 className="w-5 h-5 animate-spin" />}
                        Activate Auto-Sync
                      </button>
                    </form>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB 2: STATS DASHBOARD */}
        {activeTab === 'dashboard' && (
          <div>
            <h1 className="text-3xl font-extrabold mb-8">Performance Dashboard</h1>

            {!steamId ? (
              <div className="bg-slate-900/50 border border-slate-800 p-8 rounded-2xl flex items-center gap-4 text-amber-400">
                <ShieldAlert className="w-6 h-6" /> Please authenticate with Steam first to fetch statistics.
              </div>
            ) : isLoadingMatches ? (
              <div className="flex flex-col items-center justify-center py-20 gap-3 text-slate-400">
                <Loader2 className="w-10 h-10 animate-spin text-indigo-500" />
                <p>Loading match history...</p>
              </div>
            ) : parsedMatches.length === 0 ? (
              <div className="bg-slate-900 border border-slate-800 p-8 rounded-2xl text-center text-slate-400">
                <BarChart2 className="w-12 h-12 mx-auto mb-3 text-slate-500" />
                <p className="font-bold mb-1">No parsed match stats found yet</p>
                <p className="text-sm">Make sure your background Watcher is running to process queued match share codes.</p>
              </div>
            ) : (
              <div className="space-y-8">
                {/* Metric cards */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                  <div className="bg-slate-900 p-6 rounded-2xl border border-slate-800">
                    <p className="text-sm font-semibold text-slate-400 mb-1">Matches Parsed</p>
                    <p className="text-3xl font-extrabold text-indigo-400">{parsedMatches.length}</p>
                  </div>
                  <div className="bg-slate-900 p-6 rounded-2xl border border-slate-800">
                    <p className="text-sm font-semibold text-slate-400 mb-1">Avg K/D Ratio</p>
                    <p className="text-3xl font-extrabold text-indigo-400">{avgKd}</p>
                  </div>
                  <div className="bg-slate-900 p-6 rounded-2xl border border-slate-800">
                    <p className="text-sm font-semibold text-slate-400 mb-1">Avg ADR</p>
                    <p className="text-3xl font-extrabold text-indigo-400">{avgAdr}</p>
                  </div>
                  <div className="bg-slate-900 p-6 rounded-2xl border border-slate-800">
                    <p className="text-sm font-semibold text-slate-400 mb-1">Avg Headshot %</p>
                    <p className="text-3xl font-extrabold text-indigo-400">{avgHs}%</p>
                  </div>
                </div>
                <div className="flex items-center justify-between mb-8">
                  <button
                    onClick={fetchMatches}
                    disabled={isLoadingMatches}
                    className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium rounded-xl transition-all flex items-center gap-2"
                  >
                    {isLoadingMatches ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                    Refresh Stats
                  </button>
                </div>
                {/* Graphical charts */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                  <div className="bg-slate-900 p-6 rounded-2xl border border-slate-800">
                    <h3 className="font-bold text-lg mb-4 text-slate-200">K/D Ratio Progression</h3>
                    <div className="h-64">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={chartData}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                          <XAxis dataKey="name" stroke="#64748b" />
                          <YAxis stroke="#64748b" />
                          <Tooltip contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155' }} />
                          <Line type="monotone" dataKey="kd" stroke="#6366f1" strokeWidth={3} activeDot={{ r: 8 }} />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  <div className="bg-slate-900 p-6 rounded-2xl border border-slate-800">
                    <h3 className="font-bold text-lg mb-4 text-slate-200">Average Damage per Round (ADR)</h3>
                    <div className="h-64">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={chartData}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                          <XAxis dataKey="name" stroke="#64748b" />
                          <YAxis stroke="#64748b" />
                          <Tooltip contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155' }} />
                          <Bar dataKey="adr" fill="#818cf8" radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </div>

                {/* Match Table */}
                <div className="bg-slate-900 rounded-2xl border border-slate-800 overflow-hidden">
                  <div className="px-6 py-4 border-b border-slate-800">
                    <h3 className="font-bold">Match Breakdown</h3>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm text-slate-400">
                      <thead className="bg-slate-950 text-slate-300 font-semibold uppercase text-xs">
                        <tr>
                          <th className="px-6 py-3">Match Share ID</th>
                          <th className="px-6 py-3 text-center">Kills</th>
                          <th className="px-6 py-3 text-center">Deaths</th>
                          <th className="px-6 py-3 text-center">K/D</th>
                          <th className="px-6 py-3 text-center">ADR</th>
                          <th className="px-6 py-3 text-center">Headshot %</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800">
                        {parsedMatches.map((m) => {
                          const t = m.match_data.telemetry;
                          return (
                            <tr key={m.match_id} className="hover:bg-slate-800/30 transition-colors">
                              <td className="px-6 py-4 font-mono text-indigo-400 text-xs">{m.match_id}</td>
                              <td className="px-6 py-4 text-center text-slate-200">{t.kills}</td>
                              <td className="px-6 py-4 text-center text-slate-200">{t.deaths}</td>
                              <td className="px-6 py-4 text-center font-bold text-slate-100">{t.kd_ratio}</td>
                              <td className="px-6 py-4 text-center text-slate-200">{t.adr}</td>
                              <td className="px-6 py-4 text-center text-slate-200">{t.headshot_pct}%</td>
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
        )}

        {/* TAB 3: AI COACH CHAT */}
        {activeTab === 'coach' && (
          <div className="h-[calc(100vh-140px)] flex flex-col justify-between">
            <div className="mb-4">
              <h1 className="text-3xl font-extrabold mb-1">Conversational AI Coach</h1>
              <p className="text-slate-400">Gemini analyzes your deep match telemetry logs directly to supply actionable adjustments.</p>
            </div>

            {!steamId ? (
              <div className="bg-slate-900/50 border border-slate-800 p-8 rounded-2xl flex items-center gap-4 text-amber-400 flex-1 justify-center max-h-[200px]">
                <ShieldAlert className="w-6 h-6" /> Please authenticate with Steam first to consult your Coach.
              </div>
            ) : (
              <div className="flex-1 bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden flex flex-col justify-between h-[80%]">
                {/* Chat Log Message Area */}
                <div className="flex-1 overflow-y-auto p-6 space-y-4">
                  {messages.length === 0 ? (
                    <div className="flex flex-col items-center justify-center text-center h-full text-slate-500 py-12">
                      <Brain className="w-16 h-16 text-slate-600 mb-3" />
                      <p className="font-bold text-lg">Your AI Coach is ready</p>
                      <p className="text-sm max-w-md">Ask questions like: "Why is my ADR dropping?" or "How can I improve my utility usage?"</p>
                    </div>
                  ) : (
                    messages.map((m, idx) => (
                      <div key={idx} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                        <div
                          className={`max-w-[80%] rounded-2xl px-5 py-3 text-sm leading-relaxed ${
                            m.role === 'user'
                              ? 'bg-indigo-600 text-white rounded-tr-none'
                              : 'bg-slate-800 text-slate-100 rounded-tl-none border border-slate-700/50'
                          }`}
                        >
                          <p className="whitespace-pre-wrap">{m.content}</p>
                        </div>
                      </div>
                    ))
                  )}
                  {isSendingMessage && (
                    <div className="flex justify-start">
                      <div className="bg-slate-800 text-slate-400 rounded-2xl rounded-tl-none border border-slate-700/50 px-5 py-3 text-sm flex items-center gap-2">
                        <Loader2 className="w-4 h-4 animate-spin text-indigo-500" />
                        AI Coach is studying your match telemetry...
                      </div>
                    </div>
                  )}
                  <div ref={messagesEndRef} />
                </div>

                {/* Input Area */}
                <form onSubmit={askCoach} className="bg-slate-950 p-4 border-t border-slate-800 flex gap-3">
                  <input
                    type="text"
                    required
                    value={chatInput}
                    disabled={isSendingMessage}
                    onChange={(e) => setChatInput(e.target.value)}
                    placeholder="Ask about your utility, aim, or how to improve..."
                    className="flex-1 bg-slate-900 border border-slate-800 focus:border-indigo-500 outline-none rounded-xl px-4 py-3 text-sm text-slate-200 transition-colors disabled:opacity-50"
                  />
                  <button
                    type="submit"
                    disabled={isSendingMessage || !chatInput.trim()}
                    className="px-6 py-3 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 font-bold text-white rounded-xl text-sm transition-all shadow-md"
                  >
                    Ask Coach
                  </button>
                </form>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
