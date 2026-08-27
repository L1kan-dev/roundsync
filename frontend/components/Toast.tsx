'use client';

import { useEffect, useState } from 'react';
import { CheckCircle2, AlertTriangle } from 'lucide-react';

interface ToastProps {
  message: string;
  subtext?: string;
  onDone: () => void;
  durationMs?: number;
  variant?: 'success' | 'error';
}

export function Toast({ message, subtext, onDone, durationMs, variant = 'success' }: ToastProps) {
  const [leaving, setLeaving] = useState(false);
  const isError = variant === 'error';
  // An error needs more time to actually read than "signed in successfully" does — this
  // used to be a blocking alert() with no timeout at all, so an error toast auto-dismissing
  // at the exact same speed as the success one would be a real regression, not just cosmetic.
  const effectiveDurationMs = durationMs ?? (isError ? 6000 : 3200);

  useEffect(() => {
    const leaveTimer = setTimeout(() => setLeaving(true), effectiveDurationMs);
    const doneTimer = setTimeout(onDone, effectiveDurationMs + 260);
    return () => {
      clearTimeout(leaveTimer);
      clearTimeout(doneTimer);
    };
  }, [effectiveDurationMs, onDone]);

  return (
    <div
      className={`fixed top-6 right-6 z-50 ${leaving ? 'toast-exit' : 'toast-enter'}`}
    >
      <div className={`flex items-center gap-3 bg-[var(--panel-raised)] border rounded-xl px-5 py-4 shadow-2xl shadow-black/50 max-w-sm ${isError ? 'border-[var(--danger)]' : 'border-[var(--cyan-dim)]'}`}>
        {isError ? (
          <AlertTriangle className="w-6 h-6 text-[var(--danger)] shrink-0" />
        ) : (
          <CheckCircle2 className="w-6 h-6 text-[var(--cyan)] shrink-0" />
        )}
        <div>
          <p className="font-semibold text-[var(--text)] text-sm">{message}</p>
          {subtext && <p className="text-xs text-[var(--text-dim)] mt-0.5">{subtext}</p>}
        </div>
      </div>
    </div>
  );
}
