/* atlas — Dashboard: today's cascaded blocks, alerts, term pulse. */

import { useMemo } from 'react';
import { useStore } from '../store';
import { blocksOn, loadOn, scheduleAll } from '../lib/cascade';
import { groupAlerts } from '../lib/group';
import { fmtMed, relativeDay, todayKey } from '../lib/dates';
import { Icons, Progress, subjectColor } from '../ui/atoms';
import type { Schedule } from '../lib/types';

export function Dashboard({ onNav }: { onNav: (v: 'calendar' | 'cascader' | 'group') => void }) {
  const { state, dispatch } = useStore();
  const today = todayKey();

  const schedules = useMemo(
    () => scheduleAll(state.deliverables, state.term, today),
    [state.deliverables, state.term, today]
  );
  const todays = blocksOn(schedules, today);
  const load = loadOn(schedules, today);
  const alerts = groupAlerts(state.groups, today);

  const doneBlocks = schedules.reduce((n, s) => n + s.done, 0);
  const totalBlocks = schedules.reduce((n, s) => n + s.total, 0);
  const overdue = schedules.filter((s) => s.overdue);
  const subject = (id: string) => state.subjects.find((s) => s.id === id);

  return (
    <div className="space-y-6">
      {/* header */}
      <div className="flex flex-wrap items-end gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-fog-500">{fmtMed(today)}</p>
          <h1 className="text-2xl font-bold text-white mt-1">Today</h1>
          <p className="text-[13px] text-fog-400 mt-1">
            {todays.length
              ? <>The cascader wants <span className="text-white font-semibold">{todays.length} block{todays.length === 1 ? '' : 's'}</span> from you today · ~{load} h</>
              : 'Nothing cascaded for today. Enjoy it — or get ahead in the Cascader.'}
          </p>
        </div>
        <div className="flex-1" />
        <div className="w-64">
          <div className="flex items-center justify-between text-[11.5px] text-fog-400 mb-1.5">
            <span>Term progress · {doneBlocks}/{totalBlocks} blocks</span>
            <span className="font-mono">{totalBlocks ? Math.round((doneBlocks / totalBlocks) * 100) : 0}%</span>
          </div>
          <Progress value={totalBlocks ? doneBlocks / totalBlocks : 0} />
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* today's blocks */}
        <section className="xl:col-span-2 rounded-2xl bg-ink-900/60 ring-1 ring-white/[0.06] shadow-card p-6">
          <div className="flex items-center gap-2.5 mb-5">
            {Icons.bolt('h-4 w-4 text-white')}
            <h2 className="text-[13.5px] font-semibold text-fog-200">Today's micro-tasks</h2>
            <div className="flex-1" />
            <span className="text-[11px] text-fog-500 font-mono">{todays.length} blocks · {load} h</span>
          </div>

          {!todays.length && (
            <div className="rounded-xl border border-dashed border-white/[0.08] py-10 text-center">
              <p className="text-[13px] text-fog-400">No blocks scheduled for today</p>
              <p className="text-[12px] text-fog-600 mt-1">Weekend? {state.term.includeWeekends ? 'No — your day is clear.' : 'The cascader skips weekends.'}</p>
            </div>
          )}

          <ul className="space-y-2.5">
            {todays.map((b) => {
              const d = state.deliverables.find((x) => x.id === b.deliverableId)!;
              const sub = subject(d.subjectId);
              const c = subjectColor(sub?.color);
              return (
                <li key={b.id}
                  className="group rounded-xl bg-ink-950/60 ring-1 ring-white/[0.05] p-4 flex items-center gap-4 hover:ring-white/[0.12] transition">
                  <button onClick={() => dispatch({ type: 'block-done', id: d.id })}
                    title="Mark this block done (adds one completed block)"
                    className="h-9 w-9 shrink-0 rounded-xl ring-1 ring-white/15 grid place-items-center text-fog-400 hover:text-white hover:bg-white hover:text-ink-950 active:scale-95 transition">
                    {Icons.check('h-4 w-4')}
                  </button>
                  <div className="min-w-0 flex-1">
                    <p className="text-[13.5px] font-medium text-fog-100 truncate">{d.title}</p>
                    <p className="text-[11.5px] text-fog-500 mt-0.5 flex items-center gap-2">
                      <span className={`h-1.5 w-1.5 rounded-full ${c.dot}`} />
                      {sub?.name || 'General'}
                      <span className="text-fog-600">·</span> block {b.index + 1}/{b.total}
                      <span className="text-fog-600">·</span> {b.hours} h
                      {b.pinned && <span className="text-fog-400">· pinned</span>}
                    </p>
                  </div>
                  <span className="text-[11px] text-fog-600 font-mono shrink-0 hidden sm:block">due {fmtMed(d.dueAt)}</span>
                </li>
              );
            })}
          </ul>
        </section>

        {/* alerts column */}
        <div className="space-y-6">
          <section className="rounded-2xl bg-ink-900/60 ring-1 ring-white/[0.06] shadow-card p-6">
            <div className="flex items-center gap-2.5 mb-4">
              {Icons.warn('h-4 w-4 text-amber-300')}
              <h2 className="text-[13.5px] font-semibold text-fog-200">Alerts</h2>
              <span className="h-5 px-1.5 rounded-md bg-white/[0.06] text-fog-400 text-[11px] font-semibold grid place-items-center">{overdue.length + alerts.length}</span>
            </div>

            {!overdue.length && !alerts.length && (
              <p className="text-[12.5px] text-fog-500 py-3">All clear. Nothing overdue, no group milestones behind.</p>
            )}

            <ul className="space-y-2">
              {overdue.map((s: Schedule) => (
                <li key={s.deliverableId} className="rounded-xl bg-rose-500/[0.06] ring-1 ring-rose-500/20 p-3.5">
                  <p className="text-[12.5px] text-rose-200 font-medium leading-snug">
                    {state.deliverables.find((d) => d.id === s.deliverableId)?.title}
                  </p>
                  <p className="text-[11.5px] text-rose-300/70 mt-1">
                    {s.remaining} blocks left · {relativeDay(state.deliverables.find((d) => d.id === s.deliverableId)!.dueAt, today)}
                  </p>
                  <button onClick={() => onNav('cascader')}
                    className="mt-2 h-7 px-2.5 rounded-lg text-[11.5px] font-semibold text-rose-200 hover:bg-rose-500/10 transition">
                    Recascade →
                  </button>
                </li>
              ))}
              {alerts.map((a) => (
                <li key={a.milestoneId} className={`rounded-xl p-3.5 ring-1 ${
                  a.status === 'overdue' ? 'bg-rose-500/[0.06] ring-rose-500/20'
                    : a.status === 'behind' ? 'bg-amber-500/[0.06] ring-amber-500/20'
                    : 'bg-white/[0.03] ring-white/10'}`}>
                  <p className="text-[12.5px] font-medium text-fog-100 leading-snug">{a.title}</p>
                  <p className="text-[11.5px] text-fog-500 mt-1">
                    {a.groupName} · <span className="text-fog-300">{a.owner}</span> · {a.detail}
                  </p>
                </li>
              ))}
              {!!alerts.length && (
                <li>
                  <button onClick={() => onNav('group')}
                    className="mt-1 h-8 px-3 rounded-lg text-[12px] font-semibold text-fog-300 hover:text-white hover:bg-white/[0.05] ring-1 ring-white/10 transition">
                    Open Group Sync →
                  </button>
                </li>
              )}
            </ul>
          </section>

          {/* deliverable pulse */}
          <section className="rounded-2xl bg-ink-900/60 ring-1 ring-white/[0.06] shadow-card p-6">
            <div className="flex items-center gap-2.5 mb-4">
              {Icons.clock('h-4 w-4 text-fog-400')}
              <h2 className="text-[13.5px] font-semibold text-fog-200">Deliverables</h2>
            </div>
            <ul className="space-y-3.5">
              {schedules.map((s) => {
                const d = state.deliverables.find((x) => x.id === s.deliverableId)!;
                const sub = subject(d.subjectId);
                return (
                  <li key={s.deliverableId}>
                    <div className="flex items-center gap-2 text-[12px] mb-1.5">
                      <span className={`h-1.5 w-1.5 rounded-full ${subjectColor(sub?.color).dot}`} />
                      <span className="text-fog-200 truncate flex-1">{d.title}</span>
                      <span className="text-fog-500 font-mono text-[11px]">{s.done}/{s.total}</span>
                    </div>
                    <Progress value={s.total ? s.done / s.total : 0} tone={s.overdue ? 'rose' : 'white'} />
                  </li>
                );
              })}
              {!schedules.length && <p className="text-[12.5px] text-fog-500">No deliverables mapped yet.</p>}
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}
