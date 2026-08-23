'use client';

import React, { useEffect, useState } from 'react';

export interface RankChangeEvent {
  direction: 'up' | 'down';
  crossedBand: boolean;
  prevRank: number;
  newRank: number;
  prevBandLabel: string;
  newBandLabel: string;
  prevBandColor: string;
  newBandColor: string;
}

const PARTICLE_COUNT = 20;

// Full-screen takeover — only fired when the player's rank crosses into a new Premier
// band (e.g. Grey -> Light Blue), positive or negative. Same-band moves get the much
// smaller RankDeltaBadge instead — this one is deliberately loud, on purpose.
export function RankBandTakeover({ event, onDone }: { event: RankChangeEvent; onDone: () => void }) {
  const [visible, setVisible] = useState(true);
  const isUp = event.direction === 'up';
  // Up wears the new band's own color (feels like arriving somewhere better). Down
  // deliberately does NOT use the old band's color (still cool-toned, reads too similar
  // to a celebration) — it wears the app's actual danger red so the two feel unmistakably
  // different at a glance, not just different in the headline text.
  const themeColor = isUp ? event.newBandColor : '#f87171';

  useEffect(() => {
    const dismissTimer = setTimeout(() => setVisible(false), 4200);
    const cleanupTimer = setTimeout(onDone, 4700);
    return () => { clearTimeout(dismissTimer); clearTimeout(cleanupTimer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const particles = React.useMemo(
    () => Array.from({ length: PARTICLE_COUNT }, (_, i) => ({
      id: i,
      angle: (i / PARTICLE_COUNT) * 360 + Math.random() * 10,
      distance: 200 + Math.random() * 160,
      delay: Math.random() * 0.15,
    })),
    []
  );

  return (
    <div
      className={`fixed inset-0 z-[100] flex items-center justify-center cursor-pointer transition-opacity duration-500 ${visible ? 'opacity-100' : 'opacity-0'}`}
      style={{ background: 'radial-gradient(circle at center, rgba(5,7,10,0.94), rgba(5,7,10,0.99))' }}
      onClick={() => setVisible(false)}
    >
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        {particles.map((p) => (
          <span
            key={p.id}
            className="absolute w-2 h-2 rounded-full rank-particle"
            style={{
              background: themeColor,
              boxShadow: `0 0 12px 2px ${themeColor}`,
              ['--angle' as string]: `${p.angle}deg`,
              ['--distance' as string]: `${p.distance}px`,
              animationDelay: `${p.delay}s`,
            }}
          />
        ))}
        <div className="absolute rank-ring" style={{ borderColor: themeColor }} />
        <div className="absolute rank-ring" style={{ borderColor: themeColor, animationDelay: '0.3s' }} />
      </div>

      <div className="relative z-10 text-center rank-takeover-content px-6">
        <p className={`text-sm uppercase tracking-[0.3em] font-bold mb-4 ${isUp ? 'text-[var(--cyan)]' : 'text-[var(--danger)]'}`}>
          {isUp ? 'Rank Up' : 'Rank Down'}
        </p>
        <div className="flex items-center justify-center gap-6 mb-5">
          <div className="text-center opacity-50">
            <span className="w-3 h-3 rounded-full inline-block mb-2" style={{ background: event.prevBandColor }} />
            <p className="font-display text-lg font-bold">{event.prevBandLabel}</p>
          </div>
          <span className={`text-3xl ${isUp ? 'text-[var(--cyan)]' : 'text-[var(--danger)]'}`}>→</span>
          <div className="text-center">
            <span
              className="w-4 h-4 rounded-full inline-block mb-2 rank-band-pulse"
              style={{ background: event.newBandColor, boxShadow: `0 0 20px 4px ${event.newBandColor}` }}
            />
            <p className="font-display text-2xl font-extrabold" style={{ color: event.newBandColor }}>{event.newBandLabel}</p>
          </div>
        </div>
        <p className="font-tel text-6xl font-extrabold" style={{ color: themeColor, textShadow: `0 0 40px ${themeColor}` }}>
          {event.newRank.toLocaleString()}
        </p>
        <p className="text-sm text-[var(--text-dim)] mt-3">
          CS Rating · {isUp ? '+' : ''}{(event.newRank - event.prevRank).toLocaleString()}
        </p>
        <p className="text-xs text-[var(--text-dim)] mt-6">Click anywhere to dismiss</p>
      </div>
    </div>
  );
}

// Compact version for a rank move that stays within the same band — a small pill next
// to the rank badge, not a takeover.
export function RankDeltaBadge({ event }: { event: RankChangeEvent }) {
  const [shown, setShown] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => setShown(false), 6000);
    return () => clearTimeout(t);
  }, []);
  if (!shown) return null;
  const isUp = event.direction === 'up';
  const delta = event.newRank - event.prevRank;
  return (
    <span
      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold rank-delta-pop ${
        isUp ? 'bg-[var(--cyan)]/15 text-[var(--cyan)]' : 'bg-[var(--danger)]/15 text-[var(--danger)]'
      }`}
    >
      {isUp ? '▲' : '▼'} {isUp ? '+' : ''}{delta.toLocaleString()}
    </span>
  );
}
