/* atlas — small shared UI atoms (icons, modal, progress, subject colors). */

import { useEffect } from 'react';
import type { ReactNode } from 'react';

/* ------------------------------------------------------------ colors */

export const SUBJECT_COLORS: Record<string, { dot: string; text: string; chip: string }> = {
  rose: { dot: 'bg-rose-400', text: 'text-rose-300', chip: 'bg-rose-500/10 text-rose-300 ring-rose-500/25' },
  emerald: { dot: 'bg-emerald-400', text: 'text-emerald-300', chip: 'bg-emerald-500/10 text-emerald-300 ring-emerald-500/25' },
  sky: { dot: 'bg-sky-400', text: 'text-sky-300', chip: 'bg-sky-500/10 text-sky-300 ring-sky-500/25' },
  amber: { dot: 'bg-amber-400', text: 'text-amber-300', chip: 'bg-amber-500/10 text-amber-300 ring-amber-500/25' },
  violet: { dot: 'bg-violet-400', text: 'text-violet-300', chip: 'bg-violet-500/10 text-violet-300 ring-violet-500/25' },
  zinc: { dot: 'bg-zinc-400', text: 'text-zinc-300', chip: 'bg-white/[0.06] text-zinc-300 ring-white/10' }
};

export function subjectColor(name?: string) {
  return SUBJECT_COLORS[name || 'zinc'] || SUBJECT_COLORS.zinc;
}

/* ------------------------------------------------------------ modal */

export function Modal({ title, onClose, children, wide }: {
  title: string; onClose: () => void; children: ReactNode; wide?: boolean;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-6">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className={`relative ${wide ? 'w-[min(92vw,720px)]' : 'w-[min(92vw,480px)]'} max-h-[85vh] overflow-y-auto rounded-2xl bg-ink-900 ring-1 ring-white/10 shadow-2xl`}>
        <div className="sticky top-0 z-10 flex items-center justify-between px-5 py-4 border-b border-white/[0.06] bg-ink-900/95 backdrop-blur">
          <h2 className="text-[15px] font-semibold text-white">{title}</h2>
          <button onClick={onClose}
            className="h-7 w-7 rounded-md grid place-items-center text-fog-500 hover:text-white hover:bg-white/5 transition" aria-label="Close">&#10005;</button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------ progress */

export function Progress({ value, tone = 'white', className = '' }: {
  value: number; tone?: 'white' | 'rose' | 'amber'; className?: string;
}) {
  const bar = tone === 'rose' ? 'bg-rose-400' : tone === 'amber' ? 'bg-amber-400' : 'bg-white';
  return (
    <div className={`h-1.5 rounded-full bg-white/[0.07] overflow-hidden ${className}`}>
      <div className={`h-full rounded-full ${bar} transition-all duration-500`} style={{ width: `${Math.min(100, Math.max(0, value * 100))}%` }} />
    </div>
  );
}

/* ------------------------------------------------------------ inputs */

export const inputCls =
  'h-10 w-full px-3 rounded-lg bg-ink-950/80 ring-1 ring-white/10 focus:ring-white/25 focus:bg-ink-900 outline-none text-[13.5px] text-fog-200 placeholder:text-fog-600 transition';

export const labelCls = 'block text-[12px] font-medium text-fog-400 mb-1.5';

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className={labelCls}>{label}</span>
      {children}
    </label>
  );
}

export function PrimaryButton({ children, onClick, className = '', type = 'button' }: {
  children: ReactNode; onClick?: () => void; className?: string; type?: 'button' | 'submit';
}) {
  return (
    <button type={type} onClick={onClick}
      className={`h-10 px-5 rounded-xl bg-white text-ink-950 text-[13.5px] font-bold hover:bg-fog-200 active:scale-[0.98] transition inline-flex items-center justify-center gap-2 ${className}`}>
      {children}
    </button>
  );
}

export function GhostButton({ children, onClick, className = '', title }: {
  children: ReactNode; onClick?: () => void; className?: string; title?: string;
}) {
  return (
    <button type="button" onClick={onClick} title={title}
      className={`h-10 px-4 rounded-xl text-[13px] font-semibold text-fog-400 hover:text-fog-100 hover:bg-white/[0.05] ring-1 ring-transparent hover:ring-white/10 transition inline-flex items-center gap-2 ${className}`}>
      {children}
    </button>
  );
}

/* ------------------------------------------------------------ icons */

const I = ({ d, className = 'h-4 w-4' }: { d: string; className?: string }) => (
  <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8"
    strokeLinecap="round" strokeLinejoin="round"><path d={d} /></svg>
);

export const Icons = {
  dashboard: (c?: string) => <I d="M4 13h7V4H4zM13 20h7v-9h-7zM4 20h7v-4H4zM13 8h7V4h-7z" className={c} />,
  calendar: (c?: string) => <I d="M4 6h16v14H4zM4 10h16M8 3v4M16 3v4" className={c} />,
  cascade: (c?: string) => <I d="M6 4v10M6 20v-2M12 4v2M12 20v-8M18 4v14M6 14h0m6-8h0m6 0h0M4 14h4m4-8h4m4 0h0" className={c} />,
  group: (c?: string) => <I d="M16 20v-2a4 4 0 0 0-8 0v2M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM22 20v-2a4 4 0 0 0-3-3.8M2 20v-2a4 4 0 0 1 3-3.8" className={c} />,
  settings: (c?: string) => <I d="M4 7h16M4 12h16M4 17h10" className={c} />,
  plus: (c?: string) => <I d="M12 5v14M5 12h14" className={c} />,
  check: (c?: string) => <I d="m5 12.5 4.5 4.5L19 7" className={c} />,
  clock: (c?: string) => <I d="M12 7.5V12l3 1.8M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z" className={c} />,
  warn: (c?: string) => <I d="M12 9v4M12 17h.01M10.3 3.9 2.4 18a2 2 0 0 0 1.7 3h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" className={c} />,
  bolt: (c?: string) => <I d="m13 2-9 12h7l-1 8 9-12h-7z" className={c} />,
  arrowRight: (c?: string) => <I d="M5 12h14m-6-6 6 6-6 6" className={c} />,
  chevL: (c?: string) => <I d="m14 6-6 6 6 6" className={c} />,
  chevR: (c?: string) => <I d="m10 6 6 6-6 6" className={c} />
};
