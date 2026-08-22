export function LogoMark({ className = 'w-8 h-8' }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" className={className} fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="rs-grad" x1="0" y1="0" x2="40" y2="40" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#22d3ee" />
          <stop offset="1" stopColor="#fb923c" />
        </linearGradient>
      </defs>
      {/* Sync arcs — two open arcs standing in for "round" rotation/sync */}
      <path
        d="M6 14a15 15 0 0 1 26-8"
        stroke="url(#rs-grad)"
        strokeWidth="2.6"
        strokeLinecap="round"
      />
      <path d="M32 6l1.4 7.6-7.6-1.2" fill="url(#rs-grad)" />
      <path
        d="M34 26a15 15 0 0 1-26 8"
        stroke="url(#rs-grad)"
        strokeWidth="2.6"
        strokeLinecap="round"
      />
      <path d="M8 34l-1.4-7.6 7.6 1.2" fill="url(#rs-grad)" />
      {/* Crosshair core */}
      <circle cx="20" cy="20" r="5.5" stroke="#e7edf3" strokeWidth="2" />
      <path d="M20 11v4M20 25v4M11 20h4M25 20h4" stroke="#e7edf3" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function LogoLockup({ className = '' }: { className?: string }) {
  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      <LogoMark className="w-8 h-8 shrink-0" />
      <span className="font-display font-bold text-xl tracking-wide text-[var(--text)]">
        Round<span className="text-[var(--cyan)]">Sync</span>
      </span>
    </div>
  );
}
