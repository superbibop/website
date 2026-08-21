/* atlas — Group Sync hub: shared deliverables, owners, live status alerts.
 *
 * Peers are simulated locally (their "sync" mutates the same store), which
 * keeps the hub honest end-to-end: status is derived, never hand-set. */

import { useMemo } from 'react';
import { useStore } from '../store';
import { groupAlerts, milestoneStatus, totalBlocksOf } from '../lib/group';
import { fmtMed, relativeDay, todayKey } from '../lib/dates';
import { Icons, Progress } from '../ui/atoms';

const STATUS_STYLE: Record<string, { chip: string; label: string }> = {
  done: { chip: 'bg-emerald-500/10 text-emerald-300 ring-emerald-500/25', label: 'done' },
  'on-track': { chip: 'bg-white/[0.05] text-fog-300 ring-white/10', label: 'on track' },
  'at-risk': { chip: 'bg-amber-500/10 text-amber-300 ring-amber-500/25', label: 'at risk' },
  behind: { chip: 'bg-rose-500/10 text-rose-300 ring-rose-500/25', label: 'behind' }
};

export function GroupSync() {
  const { state, dispatch } = useStore();
  const today = todayKey();
  const alerts = useMemo(() => groupAlerts(state.groups, today), [state.groups, today]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-fog-500">Group Sync</p>
          <h1 className="text-2xl font-bold text-white mt-1">Shared deliverables</h1>
          <p className="text-[13px] text-fog-400 mt-1 max-w-xl">
            Milestone health is computed from logged progress vs. the calendar — when a teammate falls
            behind the straight-line expectation, the hub raises an alert automatically.
          </p>
        </div>
        <div className="flex-1" />
        {!!alerts.length && (
          <span className="h-9 px-3.5 rounded-xl bg-rose-500/10 ring-1 ring-rose-500/25 text-rose-300 text-[12.5px] font-semibold inline-flex items-center gap-2">
            {Icons.warn('h-4 w-4')} {alerts.length} alert{alerts.length === 1 ? '' : 's'}
          </span>
        )}
      </div>

      <div className="space-y-6">
        {state.groups.map((g) => (
          <section key={g.id} className="rounded-2xl bg-ink-900/60 ring-1 ring-white/[0.06] shadow-card p-6">
            {/* header + members */}
            <div className="flex flex-wrap items-center gap-4 mb-6">
              <div>
                <h2 className="text-[15px] font-bold text-white">{g.name}</h2>
                <p className="text-[11.5px] text-fog-500 mt-0.5">{g.milestones.length} milestones · {g.members.length} members</p>
              </div>
              <div className="flex-1" />
              <div className="flex items-center gap-1.5">
                {g.members.map((m) => (
                  <span key={m.id} title={m.name}
                    className="h-8 w-8 rounded-full grid place-items-center text-[10px] font-bold ring-2 -ml-2 first:ml-0"
                    style={{ backgroundColor: m.hue + '22', color: m.hue, boxShadow: `0 0 0 2px #09090b, inset 0 0 0 1px ${m.hue}44` }}>
                    {m.initials}
                  </span>
                ))}
              </div>
            </div>

            {/* milestones */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {g.milestones.map((m) => {
                const st = milestoneStatus(m, today);
                const total = totalBlocksOf(m);
                const owner = g.members.find((x) => x.id === m.ownerId);
                const style = STATUS_STYLE[st.status];
                return (
                  <div key={m.id} className="rounded-xl bg-ink-950/50 ring-1 ring-white/[0.05] p-5">
                    <div className="flex items-start gap-3 mb-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-[13.5px] font-semibold text-fog-100 leading-snug">{m.title}</p>
                        <p className="text-[11.5px] text-fog-500 mt-1">
                          due {fmtMed(m.dueAt)} · {relativeDay(m.dueAt, today)} · {m.estHours} h est
                        </p>
                      </div>
                      <span className={`shrink-0 h-6 px-2 rounded-md text-[10.5px] font-bold uppercase tracking-wide ring-1 grid place-items-center ${style.chip}`}>
                        {style.label}
                      </span>
                    </div>

                    <div className="flex items-center gap-2.5 mb-3">
                      <span className="h-6 w-6 rounded-full grid place-items-center text-[9px] font-bold"
                        style={{ backgroundColor: (owner?.hue || '#a1a1aa') + '22', color: owner?.hue || '#a1a1aa' }}>
                        {owner?.initials || '?'}
                      </span>
                      <select
                        value={m.ownerId}
                        onChange={(e) => dispatch({ type: 'milestone-owner', groupId: g.id, milestoneId: m.id, ownerId: e.target.value })}
                        className="h-7 rounded-md bg-transparent text-[12px] text-fog-300 outline-none cursor-pointer hover:text-white border-b border-white/10 focus:border-white/30 transition">
                        {g.members.map((mem) => <option key={mem.id} value={mem.id} className="bg-ink-900">{mem.name}</option>)}
                      </select>
                      <div className="flex-1" />
                      <span className="text-[11px] text-fog-500 font-mono">{m.completedBlocks}/{total} blocks</span>
                    </div>

                    <Progress value={total ? m.completedBlocks / total : 0}
                      tone={st.status === 'behind' ? 'rose' : st.status === 'at-risk' ? 'amber' : 'white'} className="mb-3" />

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => dispatch({ type: 'milestone-progress', groupId: g.id, milestoneId: m.id, delta: 1 })}
                        className="h-7 px-2.5 rounded-lg bg-white/[0.05] ring-1 ring-white/10 text-[11.5px] font-semibold text-fog-200 hover:bg-white/10 hover:text-white transition">
                        + log block
                      </button>
                      <button
                        onClick={() => dispatch({ type: 'milestone-progress', groupId: g.id, milestoneId: m.id, delta: -1 })}
                        className="h-7 px-2.5 rounded-lg text-[11.5px] font-semibold text-fog-500 hover:text-fog-200 hover:bg-white/[0.05] transition">
                        − undo
                      </button>
                      {st.status !== 'done' && st.expected > m.completedBlocks && (
                        <span className="text-[10.5px] text-fog-600 ml-1">
                          expected {st.expected} by now
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        ))}

        {!state.groups.length && (
          <section className="rounded-2xl border border-dashed border-white/[0.08] py-14 text-center">
            <p className="text-[13.5px] text-fog-300">No group projects yet</p>
            <p className="text-[12px] text-fog-600 mt-1">Load the demo term from Term Setup to explore the hub with a sample group.</p>
          </section>
        )}
      </div>
    </div>
  );
}
