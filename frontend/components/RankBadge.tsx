'use client';

import React from 'react';

// A pair of slanted parallel bars — the same simple double-chevron pictogram
// language CS2's own rank icon uses (a generic geometric motif, not a traced
// copy of Valve's specific artwork/wordmark). Icon color is passed in separately
// from the badge background so it can sit on either a solid or transparent surface.
export function RankBadge({ color, size = 64 }: { color: string; size?: number }) {
  const uid = React.useId().replace(/[^a-zA-Z0-9]/g, '');
  const gradId = `rb-grad-${uid}`;

  return (
    <svg width={size} height={size} viewBox="0 0 64 64">
      <defs>
        <linearGradient id={gradId} x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor={color} stopOpacity="1" />
          <stop offset="100%" stopColor={color} stopOpacity="0.75" />
        </linearGradient>
      </defs>
      <polygon points="18,4 28,4 22,60 12,60" fill={`url(#${gradId})`} />
      <polygon points="36,4 46,4 40,60 30,60" fill={`url(#${gradId})`} />
    </svg>
  );
}

// The full badge as CS2 actually shows it: the bar icon and the rating number
// together on one solid, saturated colored chip — bold and unmistakable, not a
// subtle tinted outline. Dark ink on top of the band color reads cleanly across
// every band from pale grey through gold, which a single fixed light/dark text
// color could not do consistently.
export function RankPill({ color, rankNew }: { color: string; rankNew: number }) {
  return (
    <div
      className="inline-flex items-center gap-2.5 px-4 py-2.5 rounded-xl"
      style={{
        background: `linear-gradient(135deg, ${color}, ${color}cc)`,
        boxShadow: `0 4px 16px -4px ${color}99`,
      }}
    >
      <RankBadge color="#0b0f14" size={24} />
      <span className="font-tel text-xl font-extrabold text-[#0b0f14]">
        {rankNew.toLocaleString()}
      </span>
    </div>
  );
}
