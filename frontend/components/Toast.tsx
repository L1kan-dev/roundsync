'use client';

import { useEffect, useState } from 'react';
import { CheckCircle2 } from 'lucide-react';

interface ToastProps {
  message: string;
  subtext?: string;
  onDone: () => void;
  durationMs?: number;
}

export function Toast({ message, subtext, onDone, durationMs = 3200 }: ToastProps) {
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    const leaveTimer = setTimeout(() => setLeaving(true), durationMs);
    const doneTimer = setTimeout(onDone, durationMs + 260);
    return () => {
      clearTimeout(leaveTimer);
      clearTimeout(doneTimer);
    };
  }, [durationMs, onDone]);

  return (
    <div
      className={`fixed top-6 right-6 z-50 ${leaving ? 'toast-exit' : 'toast-enter'}`}
    >
      <div className="flex items-center gap-3 bg-[var(--panel-raised)] border border-[var(--cyan-dim)] rounded-xl px-5 py-4 shadow-2xl shadow-black/50 max-w-sm">
        <CheckCircle2 className="w-6 h-6 text-[var(--cyan)] shrink-0" />
        <div>
          <p className="font-semibold text-[var(--text)] text-sm">{message}</p>
          {subtext && <p className="text-xs text-[var(--text-dim)] mt-0.5">{subtext}</p>}
        </div>
      </div>
    </div>
  );
}
