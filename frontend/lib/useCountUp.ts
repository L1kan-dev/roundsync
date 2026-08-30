'use client';

import { useEffect, useState } from 'react';

// Shared by RankBadge and RankBandTakeover — both used to carry their own near-identical
// requestAnimationFrame count-up (not a CSS transition, since neither target is a plain
// numeric CSS property: one's SVG <text> content, the other's a formatted string). Extracted
// 2026-08-30 during a 6-lens pass on the rank-change celebration work, which introduced the
// second copy and made the duplication actually visible.
//
// `from`/`to` of `null` (or equal) skips the animation and returns `to` immediately — used
// when there's no real previous value to animate from (e.g. first load, no rank change).
export function useCountUp(from: number | null, to: number | null, durationMs = 1400): number | null {
  const [value, setValue] = useState(to);

  useEffect(() => {
    if (from === null || to === null || from === to) {
      setValue(to);
      return;
    }
    let raf: number;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      const eased = 1 - Math.pow(1 - t, 3);
      setValue(Math.round(from + (to - from) * eased));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, to, durationMs]);

  return value;
}
