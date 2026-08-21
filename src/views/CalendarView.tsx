/* atlas — Calendar: month grid with cascaded-load heat shading + day agenda. */

import { useMemo, useState } from 'react';
import { useStore } from '../store';
import { blocksOn, loadOn, scheduleAll } from '../lib/cascade';
import { fmtLong, fmtMonth, monthGrid, todayKey, WEEKDAYS } from '../lib/dates';
import { Icons, subjectColor } from '../ui/atoms';
import type { Block } from '../lib/types';

function heat(hours: number): string {
  if (hours <= 0) return '';
  if (hours < 2) return 'bg-white/[0.03]';
  if (hours < 3.5) return 'bg-white/[0.06]';
  if (hours < 5) return 'bg-white/[0.09]';
  return 'bg-white/[0.13]';
}

export function CalendarView() {
  const { state } = useStore();
  const today = todayKey();
  const [anchor, setAnchor] = useState(() => new Date());
  const [selected, setSelected] = useState<string | null>(today);

  const schedules = useMemo(
    () => scheduleAll(state.deliverables, state.term, today),
    [state.deliverables, state.term, today]
  );

  const grid = useMemo(() => monthGrid(anchor), [anchor]);
  const month = anchor.getMonth();

  const loadFor = (k: string) => loadOn(schedules, k);
  const blocksFor = (k: string) => blocksOn(schedules, k);
  const dueFor = (k: string) => state.deliverables.filter((d) => d.dueAt === k);
  const subject = (id?: string) => state.subjects.find((s) => s.id === id);

  const shift = (n: number) => setAnchor(new Date(anchor.getFullYear(), anchor.getMonth() + n, 1));

  const selectedBlocks: Block[] = selected ? blocksFor(selected) : [];
  const selectedDue = selected ? dueFor(selected) : [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-fog-500">Calendar</p>
          <h1 className="text-2xl font-bold text-white mt-1">{fmtMonth(anchor)}</h1>
        </div>
        <div className="flex-1" />
        <div className="flex items-center gap-1.5">
          <button onClick={() => setAnchor(new Date())}
            className="h-9 px-3 rounded-lg text-[12.5px] font-semibold text-fog-400 hover:text-white hover:bg-white/[0.05] transition">Today</button>
          <button onClick={() => shift(-1)} className="h-9 w-9 rounded-lg grid place-items-center text-fog-400 hover:text-white hover:bg-white/[0.05] transition">{Icons.chevL()}</button>
          <button onClick={() => shift(1)} className="h-9 w-9 rounded-lg grid place-items-center text-fog-400 hover:text-white hover:bg-white/[0.05] transition">{Icons.chevR()}</button>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_340px] gap-6 items-start">
        {/* grid */}
        <section className="rounded-2xl bg-ink-900/60 ring-1 ring-white/[0.06] shadow-card overflow-hidden">
          <div className="grid grid-cols-7 border-b border-white/[0.06]">
            {WEEKDAYS.map((d) => (
              <div key={d} className="px-2 py-2.5 text-[10.5px] font-semibold uppercase tracking-[0.1em] text-fog-600 text-center">{d}</div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {grid.map((day) => {
              const k = day.getFullYear() + '-' + String(day.getMonth() + 1).padStart(2, '0') + '-' + String(day.getDate()).padStart(2, '0');
              const inMonth = day.getMonth() === month;
              const isToday = k === today;
              const load = loadFor(k);
              const blocks = blocksFor(k);
              const due = dueFor(k);
              const on = selected === k;
              return (
                <button key={k} onClick={() => setSelected(on ? null : k)}
                  className={`relative min-h-[86px] p-1.5 border-r border-b border-white/[0.04] text-left transition ${heat(load)} ${
                    inMonth ? '' : 'opacity-35'} ${on ? 'ring-1 ring-inset ring-white/25' : 'hover:bg-white/[0.02]'}`}>
                  <div className="flex items-center justify-between mb-1">
                    <span className={`text-[11px] font-mono px-1 rounded ${isToday ? 'h-5 w-5 grid place-items-center rounded-full bg-white text-ink-950 font-bold' : 'text-fog-500'}`}>
                      {day.getDate()}
                    </span>
                    {!!blocks.length && (
                      <span className="text-[9.5px] text-fog-500 font-mono">{load}h</span>
                    )}
                  </div>
                  <div className="space-y-1">
                    {due.slice(0, 2).map((d) => (
                      <div key={d.id} className={`truncate rounded px-1.5 py-[2px] text-[9.5px] leading-tight ring-1 ${subjectColor(subject(d.subjectId)?.color).chip}`}>
                        ⚑ {d.title}
                      </div>
                    ))}
                    {!due.length && !!blocks.length && (
                      <div className="flex flex-wrap gap-0.5 px-0.5">
                        {blocks.slice(0, 8).map((b) => (
                          <span key={b.id} className={`h-1.5 w-1.5 rounded-full ${subjectColor(subject(state.deliverables.find((x) => x.id === b.deliverableId)?.subjectId)?.color).dot}`} />
                        ))}
                        {blocks.length > 8 && <span className="text-[9px] text-fog-600">+{blocks.length - 8}</span>}
                      </div>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        {/* day agenda */}
        <section className="rounded-2xl bg-ink-900/60 ring-1 ring-white/[0.06] shadow-card p-6 xl:sticky xl:top-6">
          {selected ? (
            <>
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-fog-500">{fmtLong(selected)}</p>
              <h2 className="text-[15px] font-bold text-white mt-1.5 mb-5">
                {selectedBlocks.length} block{selectedBlocks.length === 1 ? '' : 's'} · {loadFor(selected)} h
              </h2>

              {!!selectedDue.length && (
                <div className="mb-5 space-y-2">
                  {selectedDue.map((d) => (
                    <div key={d.id} className="rounded-xl bg-rose-500/[0.07] ring-1 ring-rose-500/20 p-3.5">
                      <p className="text-[13px] font-semibold text-rose-200">⚑ Due — {d.title}</p>
                      <p className="text-[11.5px] text-rose-300/70 mt-0.5">{subject(d.subjectId)?.name} · {d.estHours} h total</p>
                    </div>
                  ))}
                </div>
              )}

              <ul className="space-y-2">
                {selectedBlocks.map((b) => {
                  const d = state.deliverables.find((x) => x.id === b.deliverableId)!;
                  const sub = subject(d.subjectId);
                  return (
                    <li key={b.id} className="rounded-xl bg-ink-950/60 ring-1 ring-white/[0.05] p-3.5 flex items-center gap-3">
                      <span className={`h-8 w-8 shrink-0 rounded-lg ring-1 grid place-items-center text-[10px] font-bold ${subjectColor(sub?.color).chip}`}>
                        {b.index + 1}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-[12.5px] font-medium text-fog-100 truncate">{d.title}</p>
                        <p className="text-[11px] text-fog-500 mt-0.5">{sub?.name} · {b.hours} h{b.pinned ? ' · pinned' : ''}</p>
                      </div>
                    </li>
                  );
                })}
                {!selectedBlocks.length && !selectedDue.length && (
                  <p className="text-[12.5px] text-fog-500">Nothing scheduled. A clear day.</p>
                )}
              </ul>
            </>
          ) : (
            <div className="py-8 text-center">
              <p className="text-[13px] text-fog-400">Click a day</p>
              <p className="text-[12px] text-fog-600 mt-1.5">Its cascaded workload and due items appear here.</p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
