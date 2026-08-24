'use client';

import { useState, useRef, useEffect } from 'react';
import { Settings, LogOut, ChevronDown, BarChart2, Brain, Swords, LayoutGrid } from 'lucide-react';
import { LogoLockup } from './Logo';

type Tab = 'home' | 'matches' | 'insights' | 'coach' | 'settings';

interface TopNavProps {
  activeTab: Tab;
  onTabChange: (tab: Tab) => void;
  isLive: boolean;
  personaName: string | null;
  avatarUrl: string | null;
  steamId: string;
  onLogout: () => void;
}

export function TopNav({ activeTab, onTabChange, isLive, personaName, avatarUrl, steamId, onLogout }: TopNavProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const displayName = personaName || `${steamId.slice(0, 6)}...${steamId.slice(-4)}`;

  return (
    <header className="glass sticky top-0 z-40 border-b border-[var(--edge)]">
      <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
        <button onClick={() => onTabChange('home')} className="cursor-pointer" aria-label="Go to Home">
          <LogoLockup />
        </button>

        <nav className="hidden sm:flex items-center gap-1 bg-[var(--panel)]/60 border border-[var(--edge)] rounded-full p-1">
          <button
            onClick={() => onTabChange('home')}
            className={`flex items-center gap-2 px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
              activeTab === 'home' ? 'bg-[var(--cyan)] text-[#03141a]' : 'text-[var(--text-dim)] hover:text-[var(--text)]'
            }`}
          >
            <BarChart2 className="w-4 h-4" /> Home
          </button>
          <button
            onClick={() => onTabChange('matches')}
            className={`flex items-center gap-2 px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
              activeTab === 'matches' ? 'bg-[var(--cyan)] text-[#03141a]' : 'text-[var(--text-dim)] hover:text-[var(--text)]'
            }`}
          >
            <Swords className="w-4 h-4" /> Matches
          </button>
          <button
            onClick={() => onTabChange('insights')}
            className={`flex items-center gap-2 px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
              activeTab === 'insights' ? 'bg-[var(--cyan)] text-[#03141a]' : 'text-[var(--text-dim)] hover:text-[var(--text)]'
            }`}
          >
            <LayoutGrid className="w-4 h-4" /> Insights
          </button>
          <button
            onClick={() => onTabChange('coach')}
            className={`flex items-center gap-2 px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
              activeTab === 'coach' ? 'bg-[var(--cyan)] text-[#03141a]' : 'text-[var(--text-dim)] hover:text-[var(--text)]'
            }`}
          >
            <Brain className="w-4 h-4" /> AI Coach
          </button>
        </nav>

        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setMenuOpen((v) => !v)}
            className="flex items-center gap-2.5 pl-1.5 pr-3 py-1.5 rounded-full border border-[var(--edge)] hover:border-[var(--cyan-dim)] transition-colors"
          >
            {isLive && <span className="w-2 h-2 rounded-full bg-[var(--cyan)] live-dot" />}
            {avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={avatarUrl} alt="" className="w-8 h-8 rounded-full border border-[var(--edge-bright)]" />
            ) : (
              <div className="w-8 h-8 rounded-full bg-[var(--panel-raised)] border border-[var(--edge-bright)]" />
            )}
            <span className="text-sm font-semibold max-w-[140px] truncate">{displayName}</span>
            <ChevronDown className={`w-4 h-4 text-[var(--text-dim)] transition-transform ${menuOpen ? 'rotate-180' : ''}`} />
          </button>

          {menuOpen && (
            <div className="dropdown-enter absolute right-0 mt-2 w-56 bg-[var(--panel)] border border-[var(--edge)] rounded-xl shadow-2xl shadow-black/50 overflow-hidden">
              <button
                onClick={() => { onTabChange('settings'); setMenuOpen(false); }}
                className="w-full flex items-center gap-3 px-4 py-3 text-sm text-left hover:bg-[var(--panel-raised)] transition-colors"
              >
                <Settings className="w-4 h-4 text-[var(--text-dim)]" /> Integration Settings
              </button>
              <button
                onClick={onLogout}
                className="w-full flex items-center gap-3 px-4 py-3 text-sm text-left text-[var(--danger)] hover:bg-[var(--panel-raised)] transition-colors border-t border-[var(--edge)]"
              >
                <LogOut className="w-4 h-4" /> Sign Out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
