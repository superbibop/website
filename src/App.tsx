/* atlas — root: sidebar + view routing + global keyboard shortcuts. */

import { useEffect, useRef, useState } from 'react';
import { StoreProvider, useStore } from './store';
import { Sidebar, type View } from './ui/Shell';
import { Dashboard } from './views/Dashboard';
import { CalendarView } from './views/CalendarView';
import { Cascader } from './views/Cascader';
import { GroupSync } from './views/GroupSync';
import { Setup } from './views/Setup';
import { Icons, Modal } from './ui/atoms';

const SHORTCUTS: [string, string][] = [
  ['1 – 5', 'Switch workspace (Dashboard → Term Setup)'],
  ['n', 'New deliverable (in the Cascader)'],
  ['g', 'Jump to Group Sync'],
  ['t', 'Jump to Today on the Calendar'],
  ['Esc', 'Close any modal'],
  ['?', 'This help']
];

function Workspace() {
  const { state } = useStore();
  const [view, setView] = useState<View>(state.setupDone ? 'dashboard' : 'setup');
  const [help, setHelp] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || e.metaKey || e.ctrlKey || e.altKey) return;
      const map: Record<string, View> = { '1': 'dashboard', '2': 'calendar', '3': 'cascader', '4': 'group', '5': 'setup' };
      if (map[e.key]) { setView(map[e.key]); return; }
      if (e.key === '?') { setHelp(true); return; }
      if (e.key === 'g') setView('group');
      if (e.key === 't') setView('calendar');
      if (e.key === 'n' && state.setupDone) setView('cascader');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [state.setupDone]);

  /* First run forces setup; finishing setup (or loading the demo) lands on
     the dashboard. */
  const booted = useRef(state.setupDone);
  useEffect(() => {
    if (!state.setupDone) {
      setView('setup');
      booted.current = false;
      return;
    }
    if (!booted.current) {
      booted.current = true;
      setView('dashboard');
    }
  }, [state.setupDone]);

  return (
    <div className="min-h-screen">
      <Sidebar view={view} onNav={setView} />
      <main className="pl-60">
        <div className="mx-auto max-w-[1500px] px-6 lg:px-10 py-8">
          {view === 'dashboard' && <Dashboard onNav={setView} />}
          {view === 'calendar' && <CalendarView />}
          {view === 'cascader' && <Cascader />}
          {view === 'group' && <GroupSync />}
          {view === 'setup' && <Setup />}
        </div>
      </main>

      <button onClick={() => setHelp(true)}
        className="fixed bottom-5 right-5 z-40 h-9 w-9 rounded-xl bg-ink-800/90 backdrop-blur ring-1 ring-white/10 grid place-items-center text-fog-400 hover:text-white hover:ring-white/25 transition shadow-2xl"
        title="Keyboard shortcuts (?)">
        <span className="text-[13px] font-bold font-mono">?</span>
      </button>

      {help && (
        <Modal title="Keyboard shortcuts" onClose={() => setHelp(false)}>
          <ul className="space-y-3">
            {SHORTCUTS.map(([k, d]) => (
              <li key={k} className="flex items-center gap-4">
                <kbd className="min-w-[64px] text-center h-8 px-2 rounded-lg bg-ink-950 ring-1 ring-white/10 text-[12px] font-mono text-fog-200 grid place-items-center">{k}</kbd>
                <span className="text-[13px] text-fog-300">{d}</span>
              </li>
            ))}
          </ul>
          <p className="mt-5 pt-4 border-t border-white/[0.06] text-[12px] text-fog-500 leading-relaxed">
            {Icons.bolt('h-3.5 w-3.5 inline mb-0.5 mr-1')}Built for the keyboard and the trackpad: drag cascade blocks between days, double-click to log one done, click calendar days for agendas.
          </p>
        </Modal>
      )}
    </div>
  );
}

export default function App() {
  return (
    <StoreProvider>
      <Workspace />
    </StoreProvider>
  );
}
