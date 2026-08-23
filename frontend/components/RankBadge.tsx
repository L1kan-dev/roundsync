'use client';

import React from 'react';

// A pair of slanted parallel bars, colored per Premier band — the same simple
// double-chevron pictogram language CS2's own rank icon uses (a generic geometric
// motif, not a traced copy of Valve's specific artwork/wordmark).
export function RankBadge({ color, size = 64 }: { color: string; size?: number }) {
  const uid = React.useId().replace(/[^a-zA-Z0-9]/g, '');
  const gradId = `rb-grad-${uid}`;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      style={{ filter: `drop-shadow(0 0 ${size * 0.15}px ${color}99)` }}
    >
      <defs>
        <linearGradient id={gradId} x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor={color} stopOpacity="1" />
          <stop offset="100%" stopColor={color} stopOpacity="0.65" />
        </linearGradient>
      </defs>
      {/* Left bar */}
      <polygon points="18,4 28,4 22,60 12,60" fill={`url(#${gradId})`} />
      {/* Right bar */}
      <polygon points="36,4 46,4 40,60 30,60" fill={`url(#${gradId})`} />
    </svg>
  );
}

// The full badge as CS2 actually shows it: the bar icon sitting on a colored ribbon
// (a rectangle with one angled/chevron-cut edge), with the rating number printed on
// that same ribbon — not just a bare icon floating next to plain text.
export function RankPill({ color, rankNew }: { color: string; rankNew: number }) {
  return (
    <div
      className="inline-flex items-center gap-2.5 pl-3 pr-6 py-2"
      style={{
        background: `linear-gradient(135deg, ${color}40, ${color}1f)`,
        border: `1px solid ${color}80`,
        clipPath: 'polygon(0 0, 100% 0, calc(100% - 14px) 100%, 0 100%)',
      }}
    >
      <RankBadge color={color} size={26} />
      <span className="font-tel text-lg font-extrabold" style={{ color }}>
        {rankNew.toLocaleString()}
      </span>
    </div>
  );
}
