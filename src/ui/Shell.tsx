/* atlas — the persistent Windows-app shell: fixed sidebar + routed views. */

import { useStore } from '../store';
import { Icons } from './atoms';

export type View = 'dashboard' | 'calendar' | 'cascader' | 'group' | 'setup';

export const NAV: { key: View; label: string; icon: (c?: string) => JSX.Element; hint: string }[] = [
  { key: 'dashboard', label: 'Dashboard', icon: Icons.dashboard, hint: '1' },
  { key: 'calendar', label: 'Calendar', icon: Icons.calendar, hint: '2' },
  { key: 'cascader', label: 'Deadline Cascader', icon: Icons.cascade, hint: '3' },
  { key: 'group', label: 'Group Sync', icon: Icons.group, hint: '4' },
  { key: 'setup', label: 'Term Setup', icon: Icons.settings, hint: '5' }
];

export function Sidebar({ view, onNav }: { view: View; onNav: (v: View) => void }) {
  const { state } = useStore();

  return (
    <aside className="fixed inset-y-0 left-0 z-30 w-60 flex flex-col border-r border-white/[0.06] bg-ink-900">
      {/* brand */}
      <div className="h-16 px-5 flex items-center gap-3 border-b border-white/[0.06] shrink-0">
        <span className="h-9 w-9 rounded-xl bg-ink-800 ring-1 ring-white/10 grid place-items-center font-mono text-[13px] font-bold text-white">{'{ }'}</span>
        <div className="min-w-0">
          <p className="text-[14px] font-bold text-white leading-tight">atlas</p>
          <p className="text-[10.5px] text-fog-500 truncate">{state.term.name || 'study control'}</p>
        </div>
      </div>

      {/* nav */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
        <p className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-fog-600">Workspace</p>
        {NAV.map((n) => {
          const on = view === n.key;
          return (
            <button key={n.key} onClick={() => onNav(n.key)}
              className={`w-full h-10 px-3 rounded-lg flex items-center gap-3 text-[13.5px] transition group ${
                on ? 'bg-white/[0.08] text-white font-semibold ring-1 ring-white/10'
                   : 'text-fog-400 hover:text-fog-100 hover:bg-white/[0.04]'}`}
              title={`${n.label} (${n.hint})`}>
              <span className={on ? 'text-white' : 'text-fog-500 group-hover:text-fog-300'}>{n.icon('h-[17px] w-[17px]')}</span>
              <span className="flex-1 text-left truncate">{n.label}</span>
              <kbd className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${on ? 'bg-white/10 text-fog-300' : 'text-fog-600 group-hover:text-fog-500'}`}>{n.hint}</kbd>
            </button>
          );
        })}
      </nav>

      {/* term footer */}
      <div className="p-3 border-t border-white/[0.06] shrink-0">
        <div className="rounded-xl bg-ink-850/60 ring-1 ring-white/[0.05] p-3.5">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-fog-600 mb-2">Term</p>
          <p className="text-[12.5px] text-fog-300 leading-snug">{state.term.name}</p>
          <p className="text-[11px] text-fog-600 mt-1 font-mono">
            {state.term.startsAt} → {state.term.endsAt}
          </p>
          <p className="text-[11px] text-fog-500 mt-2">
            {state.subjects.length} subjects · {state.deliverables.length} deliverables
          </p>
        </div>
      </div>
    </aside>
  );
}
