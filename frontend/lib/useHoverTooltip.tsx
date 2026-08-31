'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

// The one custom, styled, cursor-following tooltip mechanism for the whole app — extracted
// 2026-08-31 (NEXT_STEPS.md Band 0 / Tier 15's "tooltip styling inconsistency" item) from
// where it was originally built inline, once, just for the Home dashboard's Performance
// tile. Every other stat explanation across the app had drifted onto the browser's plain
// native `title=` attribute instead of this — this file lets every page reuse the exact
// same look/feel rather than re-implementing it or falling back to `title=`.
//
// Call this once per distinct piece of hover text your component needs (usually once per
// component render, same as any other hook) — `handlers` can then be spread onto as many
// DOM elements as share that same explanation (e.g. every card in a .map() showing the
// same stat), and `tooltip` only needs to be rendered once anywhere in the tree, since it's
// portal-mounted to document.body regardless of where the trigger element sits.
export function useHoverTooltip(text: string) {
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [mounted, setMounted] = useState(false);
  const [shown, setShown] = useState(false);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const onMouseEnter = (e: React.MouseEvent) => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    setPos({ x: e.clientX, y: e.clientY });
    setMounted(true);
    requestAnimationFrame(() => setShown(true));
  };
  const onMouseMove = (e: React.MouseEvent) => setPos({ x: e.clientX, y: e.clientY });
  const onMouseLeave = () => {
    setShown(false);
    hideTimer.current = setTimeout(() => setMounted(false), 1000);
  };

  useEffect(() => () => { if (hideTimer.current) clearTimeout(hideTimer.current); }, []);

  const tooltip = mounted ? createPortal(
    <div
      className="fixed z-50 pointer-events-none px-3.5 py-2.5 rounded-xl text-xs leading-snug font-medium text-[var(--text)] transition-opacity"
      style={{
        left: Math.min(pos.x + 18, (typeof window !== 'undefined' ? window.innerWidth : 1920) - 280),
        top: pos.y + 18,
        maxWidth: 260,
        background: 'rgba(12,16,21,0.95)',
        backdropFilter: 'blur(6px)',
        border: '1px solid var(--edge-bright)',
        boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
        opacity: shown ? 1 : 0,
        transitionDuration: '1000ms',
      }}
    >
      {text}
    </div>,
    document.body
  ) : null;

  return { handlers: { onMouseEnter, onMouseMove, onMouseLeave }, tooltip };
}
