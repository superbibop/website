/* atlas — Deadline Cascader: the time-math engine made visible.
 *
 * Left: deliverables with progress + the "delayed" flag that triggers a
 * dynamic re-shift. Right: the remaining workdays as columns; blocks are
 * draggable between days (pins survive recascades), double-click completes.
 */

import { useMemo, useState } from 'react';
import { useStore } from '../store';
import { scheduleDeliverable } from '../lib/cascade';
import { dateKey, fmtMed, relativeDay, todayKey, weekdayShort } from '../lib/dates';
import { Icons, Modal, Progress, subjectColor, Field, inputCls, PrimaryButton, GhostButton } from '../ui/atoms';
import type { Block, Deliverable } from '../lib/types';

export function Cascader() {
  const { state, dispatch } = useStore();
  const today = todayKey();
  const [selectedId, setSelectedId] = useState<string | null>(state.deliverables[0]?.id ?? null);
  const [dragBlock, setDragBlock] = useState<Block | null>(null);
  const [editing, setEditing] = useState<Deliverable | 'new' | null>(null);
  const [toast, setToast] = useState('');

  const selected = state.deliverables.find((d) => d.id === selectedId) || null;
  const schedule = useMemo(
    () => (selected ? scheduleDeliverable(selected, state.term, today) : null),
    [selected, state.term, today]
  );

  const subject = (id: string) => state.subjects.find((s) => s.id === id);

  /* group remaining blocks by day for the column strip */
  const columns = useMemo(() => {
    if (!schedule) return [];
    const byDay = new Map<string, Block[]>();
    schedule.blocks.forEach((b) => {
      if (!byDay.has(b.date)) byDay.set(b.date, []);
      byDay.get(b.date)!.push(b);
    });
    return [...byDay.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1));
  }, [schedule]);

  const flash = (msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(''), 2600);
  };

  const flagDelayed = (d: Deliverable) => {
    const s = scheduleDeliverable(d, state.term, today);
    dispatch({ type: 'flag-delayed', id: d.id });
    flash(`Recascaded — ${s.remaining} block${s.remaining === 1 ? '' : 's'} re-spread over ${Math.max(s.daysLeft, 1)} remaining workday${s.daysLeft === 1 ? '' : 's'} (~${s.hoursPerDay} h/day).`);
  };

  const dropOn = (dayKey: string) => {
    if (!dragBlock || !selected) return;
    if (dragBlock.date !== dayKey) {
      dispatch({ type: 'pin-block', id: selected.id, index: dragBlock.index, date: dayKey });
      flash(`Block ${dragBlock.index + 1} pinned to ${fmtMed(dayKey)} — it keeps this date through future recascades.`);
    }
    setDragBlock(null);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-fog-500">Deadline Cascader</p>
          <h1 className="text-2xl font-bold text-white mt-1">Break it down, shift it forward</h1>
          <p className="text-[13px] text-fog-400 mt-1 max-w-xl">
            Each deliverable becomes daily micro-task blocks spread over the remaining workdays.
            Flag something delayed and the engine redistributes everything left — drag blocks to fine-tune.
          </p>
        </div>
        <div className="flex-1" />
        {state.subjects.length > 0 && (
          <PrimaryButton onClick={() => setEditing('new')}>{Icons.plus('h-4 w-4')} New deliverable</PrimaryButton>
        )}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[360px_1fr] gap-6 items-start">
        {/* deliverable list */}
        <section className="rounded-2xl bg-ink-900/60 ring-1 ring-white/[0.06] shadow-card p-4 space-y-2">
          {state.deliverables.map((d) => {
            const s = scheduleDeliverable(d, state.term, today);
            const sub = subject(d.subjectId);
            const on = d.id === selectedId;
            return (
              <button key={d.id} onClick={() => setSelectedId(d.id)}
                className={`w-full text-left rounded-xl p-4 ring-1 transition ${
                  on ? 'bg-white/[0.05] ring-white/15' : 'bg-ink-950/50 ring-white/[0.04] hover:ring-white/[0.1]'}`}>
                <div className="flex items-center gap-2 mb-2">
                  <span className={`h-1.5 w-1.5 rounded-full ${subjectColor(sub?.color).dot}`} />
                  <span className="text-[10.5px] font-semibold uppercase tracking-wide text-fog-500">{sub?.name}</span>
                  <div className="flex-1" />
                  {s.overdue ? (
                    <span className="text-[10px] font-bold text-rose-300 bg-rose-500/10 ring-1 ring-rose-500/25 rounded px-1.5 py-0.5">OVERDUE</span>
                  ) : d.delayedAt ? (
                    <span className="text-[10px] font-bold text-amber-300 bg-amber-500/10 ring-1 ring-amber-500/25 rounded px-1.5 py-0.5">SHIFTED</span>
                  ) : null}
                </div>
                <p className="text-[13.5px] font-semibold text-fog-100 leading-snug">{d.title}</p>
                <div className="flex items-center gap-3 text-[11px] text-fog-500 mt-1 mb-2.5">
                  <span className="font-mono">{relativeDay(d.dueAt, today)}</span>
                  <span>· {s.done}/{s.total} blocks</span>
                  <span>· ~{s.hoursPerDay} h/day</span>
                </div>
                <Progress value={s.total ? s.done / s.total : 0} tone={s.overdue ? 'rose' : 'white'} />
              </button>
            );
          })}
          {!state.deliverables.length && (
            <div className="py-10 text-center px-4">
              <p className="text-[13px] text-fog-400">No deliverables yet</p>
              <p className="text-[12px] text-fog-600 mt-1 mb-4">Map your finals in Term Setup, or add one here.</p>
              <PrimaryButton onClick={() => setEditing('new')}>{Icons.plus('h-4 w-4')} New deliverable</PrimaryButton>
            </div>
          )}
        </section>

        {/* timeline strip */}
        <section className="rounded-2xl bg-ink-900/60 ring-1 ring-white/[0.06] shadow-card p-6 min-h-[300px]">
          {selected && schedule ? (
            <>
              <div className="flex flex-wrap items-center gap-3 mb-5">
                <div className="min-w-0">
                  <h2 className="text-[15px] font-bold text-white truncate">{selected.title}</h2>
                  <p className="text-[11.5px] text-fog-500 mt-0.5">
                    {subject(selected.subjectId)?.name} · due {fmtMed(selected.dueAt)} ({relativeDay(selected.dueAt, today)}) · {selected.estHours} h est
                    {selected.weight != null ? ` · ${selected.weight}% of grade` : ''}
                  </p>
                </div>
                <div className="flex-1" />
                <GhostButton title="Recalculate from today: remaining blocks re-spread across remaining days"
                  onClick={() => flagDelayed(selected)} className="!text-amber-300 hover:!bg-amber-500/10">
                  {Icons.warn('h-4 w-4')} I'm behind — recascade
                </GhostButton>
                <GhostButton onClick={() => setEditing(selected)} title="Edit deliverable">Edit</GhostButton>
                <GhostButton onClick={() => {
                  if (window.confirm(`Delete "${selected.title}" and its cascade?`)) {
                    dispatch({ type: 'deliverable-remove', id: selected.id });
                    setSelectedId(state.deliverables.find((d) => d.id !== selected.id)?.id ?? null);
                  }
                }} className="!text-rose-300/80 hover:!bg-rose-500/10">Delete</GhostButton>
              </div>

              <div className="flex gap-3 overflow-x-auto pb-3 -mx-1 px-1">
                {columns.map(([day, blocks]) => {
                  const isToday = day === today;
                  return (
                    <div key={day}
                      onDragOver={(e) => { e.preventDefault(); }}
                      onDrop={() => dropOn(day)}
                      className={`min-w-[150px] flex-1 rounded-xl ring-1 p-3 transition ${
                        dragBlock ? 'ring-white/25 bg-white/[0.03]' : isToday ? 'ring-white/15 bg-white/[0.02]' : 'ring-white/[0.05] bg-ink-950/40'}`}>
                      <div className="flex items-baseline justify-between mb-2.5 px-0.5">
                        <span className={`text-[11px] font-bold ${isToday ? 'text-white' : 'text-fog-400'}`}>
                          {isToday ? 'Today' : weekdayShort(day)}
                        </span>
                        <span className="text-[10px] text-fog-600 font-mono">{fmtMed(day)}</span>
                      </div>
                      <div className="space-y-2">
                        {blocks.map((b) => (
                          <div key={b.id} draggable
                            onDragStart={() => setDragBlock(b)}
                            onDragEnd={() => setDragBlock(null)}
                            onDoubleClick={() => {
                              dispatch({ type: 'block-done', id: selected.id });
                              flash(`Block logged as done — ${Math.max(schedule.remaining - 1, 0)} to go.`);
                            }}
                            title="Drag to another day · double-click to log done"
                            className={`cursor-grab active:cursor-grabbing rounded-lg p-2.5 ring-1 text-left transition select-none ${
                              b.pinned ? 'bg-white/[0.07] ring-white/20' : 'bg-ink-850 ring-white/[0.06] hover:ring-white/[0.15]'}`}>
                            <div className="flex items-center justify-between mb-1">
                              <span className={`text-[10px] font-bold font-mono ${subjectColor(subject(selected.subjectId)?.color).text}`}>
                                #{b.index + 1}/{b.total}
                              </span>
                              <span className="text-[10px] text-fog-600 font-mono">{b.hours}h</span>
                            </div>
                            <p className="text-[11px] text-fog-300 leading-snug">{b.pinned ? '📌 pinned' : 'work block'}</p>
                          </div>
                        ))}
                        {!blocks.length && (
                          <div className="rounded-lg border border-dashed border-white/[0.08] py-4 text-center text-[10.5px] text-fog-600">
                            drop here
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
                {!columns.length && (
                  <div className="w-full py-10 text-center">
                    <p className="text-[13px] text-fog-400">Nothing left to cascade{schedule.overdue ? ' before the due date' : ''}.</p>
                    {schedule.overdue && <p className="text-[12px] text-rose-300/80 mt-1">This deliverable is overdue — {schedule.remaining} blocks remain.</p>}
                  </div>
                )}
              </div>
              <p className="mt-2 text-[11px] text-fog-600">
                {schedule.daysLeft} workday{schedule.daysLeft === 1 ? '' : 's'} left · {schedule.perDay} block{schedule.perDay === 1 ? '' : 's'}/day · drag blocks between days · double-click logs a block done
              </p>
            </>
          ) : (
            <div className="py-16 text-center">
              <p className="text-[13px] text-fog-400">Select a deliverable to see its cascade</p>
            </div>
          )}
        </section>
      </div>

      {editing && <DeliverableModal draft={editing} onClose={() => setEditing(null)} />}

      {toast && (
        <div className="fixed bottom-6 right-6 z-50 pointer-events-auto rounded-xl bg-ink-800/95 backdrop-blur ring-1 ring-white/15 shadow-2xl px-4 py-3 max-w-md text-[12.5px] text-fog-100 flex items-start gap-2.5 animate-fade-up">
          {Icons.bolt('h-4 w-4 text-white mt-0.5 shrink-0')} <span>{toast}</span>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------ modal */

function DeliverableModal({ draft, onClose }: { draft: Deliverable | 'new'; onClose: () => void }) {
  const { state, dispatch } = useStore();
  const isNew = draft === 'new';
  const d = isNew ? null : draft;

  const [title, setTitle] = useState(d?.title ?? '');
  const [subjectId, setSubjectId] = useState(d?.subjectId ?? state.subjects[0]?.id ?? '');
  const [dueAt, setDueAt] = useState(d?.dueAt ?? dateKey(new Date(Date.now() + 14 * 86400000)));
  const [estHours, setEstHours] = useState(String(d?.estHours ?? 10));
  const [weight, setWeight] = useState(d?.weight != null ? String(d.weight) : '');

  const submit = () => {
    if (!title.trim() || !subjectId) return;
    const est = Math.max(1, Number(estHours) || 1);
    const w = weight.trim() === '' ? null : Math.max(0, Math.min(100, Number(weight)));
    if (isNew) {
      dispatch({ type: 'deliverable-add', d: { subjectId, title: title.trim(), dueAt, estHours: est, weight: w, startAt: null } });
    } else if (d) {
      dispatch({ type: 'deliverable-update', id: d.id, patch: { subjectId, title: title.trim(), dueAt, estHours: est, weight: w } });
    }
    onClose();
  };

  return (
    <Modal title={isNew ? 'New deliverable' : 'Edit deliverable'} onClose={onClose}>
      <div className="space-y-4">
        <Field label="Title">
          <input className={inputCls} value={title} onChange={(e) => setTitle(e.target.value)}
            placeholder="Historical Investigation (IA)" autoFocus />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Subject">
            <select className={inputCls} value={subjectId} onChange={(e) => setSubjectId(e.target.value)}>
              {state.subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </Field>
          <Field label="Due date">
            <input type="date" className={inputCls} value={dueAt} onChange={(e) => setDueAt(e.target.value)} />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Estimated hours">
            <input type="number" min="1" step="0.5" className={inputCls} value={estHours}
              onChange={(e) => setEstHours(e.target.value)} />
          </Field>
          <Field label="Weight (% of grade, optional)">
            <input type="number" min="0" max="100" className={inputCls} value={weight}
              onChange={(e) => setWeight(e.target.value)} placeholder="20" />
          </Field>
        </div>
        <p className="text-[11.5px] text-fog-500 leading-relaxed">
          ≈ {Math.max(1, Math.round((Number(estHours) || 1) / (state.term.blockHours || 1.5)))} micro-task blocks of {state.term.blockHours} h,
          spread over the workdays before the due date.
        </p>
        <div className="flex justify-end gap-2 pt-1">
          <GhostButton onClick={onClose}>Cancel</GhostButton>
          <PrimaryButton onClick={submit}>{isNew ? 'Add & cascade' : 'Save'}</PrimaryButton>
        </div>
      </div>
    </Modal>
  );
}
