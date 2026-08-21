/* atlas — Term & Assessment Mapping: the setup wizard, editable any time. */

import { useState } from 'react';
import { useStore } from '../store';
import { uid } from '../lib/ids';
import { Field, GhostButton, Icons, PrimaryButton, inputCls, subjectColor } from '../ui/atoms';
import type { Subject } from '../lib/types';

const PALETTE = ['rose', 'emerald', 'sky', 'amber', 'violet', 'zinc'];

export function Setup() {
  const { state, dispatch } = useStore();

  const [name, setName] = useState(state.term.name);
  const [startsAt, setStartsAt] = useState(state.term.startsAt);
  const [endsAt, setEndsAt] = useState(state.term.endsAt);
  const [blockHours, setBlockHours] = useState(String(state.term.blockHours));
  const [includeWeekends, setIncludeWeekends] = useState(state.term.includeWeekends);

  const [subName, setSubName] = useState('');
  const [subColor, setSubColor] = useState(PALETTE[0]);

  const firstRun = !state.setupDone;

  const saveTerm = () => {
    dispatch({
      type: 'term',
      term: {
        name: name.trim() || 'Term 1',
        startsAt, endsAt,
        blockHours: Math.max(0.5, Number(blockHours) || 1.5),
        includeWeekends
      }
    });
  };

  const finish = () => {
    saveTerm();
    dispatch({ type: 'finish-setup', state: { ...state, setupDone: true } });
  };

  const addSubject = () => {
    const n = subName.trim();
    if (!n) return;
    const s: Subject = { id: uid('sub'), name: n, color: subColor };
    dispatch({ type: 'subject-add', subject: s });
    setSubName('');
    setSubColor(PALETTE[(PALETTE.indexOf(subColor) + 1) % PALETTE.length]);
  };

  return (
    <div className="max-w-3xl mx-auto space-y-8">
      <div className="text-center">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-fog-500">{firstRun ? 'Welcome to atlas' : 'Term Setup'}</p>
        <h1 className="text-2xl font-bold text-white mt-1">Map your term</h1>
        <p className="text-[13px] text-fog-400 mt-1.5 max-w-lg mx-auto leading-relaxed">
          {firstRun
            ? 'Three quick steps — term dates, your subjects, and the big final deliverables. The cascader turns the rest into daily work.'
            : 'Adjust term dates, subjects, and cascade settings. Schedules recompute instantly.'}
        </p>
      </div>

      {firstRun && (
        <div className="rounded-2xl bg-white/[0.03] ring-1 ring-white/10 p-5 flex flex-wrap items-center gap-4">
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-semibold text-fog-100">In a hurry?</p>
            <p className="text-[12px] text-fog-500 mt-0.5">Load a demo term (5 subjects, 5 cascading deliverables, a group project with live alerts) and explore everything first.</p>
          </div>
          <PrimaryButton onClick={() => dispatch({ type: 'load-demo' })}>
            {Icons.bolt('h-4 w-4')} Load demo term
          </PrimaryButton>
        </div>
      )}

      {/* step 1 — term */}
      <section className="rounded-2xl bg-ink-900/60 ring-1 ring-white/[0.06] shadow-card p-6">
        <StepTitle n={1} title="Term dates" />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Term name">
            <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="Term 1 · 2026/27" />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Starts">
              <input type="date" className={inputCls} value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
            </Field>
            <Field label="Ends">
              <input type="date" className={inputCls} value={endsAt} onChange={(e) => setEndsAt(e.target.value)} />
            </Field>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
          <Field label="Micro-task block size (hours)">
            <input type="number" min="0.5" step="0.5" className={inputCls} value={blockHours}
              onChange={(e) => setBlockHours(e.target.value)} onBlur={saveTerm} />
          </Field>
          <label className="flex items-end pb-2.5 cursor-pointer select-none gap-2.5">
            <input type="checkbox" checked={includeWeekends}
              onChange={(e) => { setIncludeWeekends(e.target.checked); dispatch({ type: 'term', term: { ...state.term, includeWeekends: e.target.checked } }); }}
              className="h-4 w-4 rounded border-white/20 bg-ink-900 accent-white" />
            <span className="text-[13px] text-fog-300">Cascade across weekends</span>
          </label>
        </div>
      </section>

      {/* step 2 — subjects */}
      <section className="rounded-2xl bg-ink-900/60 ring-1 ring-white/[0.06] shadow-card p-6">
        <StepTitle n={2} title="Subjects" />
        <div className="flex flex-wrap gap-2 mb-5">
          {state.subjects.map((s) => (
            <span key={s.id} className={`group inline-flex items-center gap-2 h-9 pl-3 pr-1.5 rounded-xl ring-1 text-[13px] font-medium ${subjectColor(s.color).chip}`}>
              <span className={`h-1.5 w-1.5 rounded-full ${subjectColor(s.color).dot}`} />
              {s.name}
              <button onClick={() => dispatch({ type: 'subject-remove', id: s.id })}
                className="h-6 w-6 rounded-md grid place-items-center opacity-40 group-hover:opacity-100 hover:bg-white/10 transition" title="Remove subject (and its deliverables)">&#10005;</button>
            </span>
          ))}
          {!state.subjects.length && <p className="text-[12.5px] text-fog-500">No subjects yet — add the classes that have final deliverables.</p>}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <input className={inputCls + ' !w-56 flex-1'} value={subName} onChange={(e) => setSubName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') addSubject(); }}
            placeholder="e.g. History HL" />
          <div className="flex items-center gap-1.5">
            {PALETTE.map((c) => (
              <button key={c} onClick={() => setSubColor(c)}
                className={`h-7 w-7 rounded-lg grid place-items-center ring-1 transition ${subColor === c ? 'ring-white/60 scale-110' : 'ring-white/10 hover:ring-white/30'}`}>
                <span className={`h-3 w-3 rounded-full ${subjectColor(c).dot}`} />
              </button>
            ))}
          </div>
          <GhostButton onClick={addSubject}>{Icons.plus('h-4 w-4')} Add subject</GhostButton>
        </div>
      </section>

      {/* step 3 — finals pointer */}
      <section className="rounded-2xl bg-ink-900/60 ring-1 ring-white/[0.06] shadow-card p-6">
        <StepTitle n={3} title="Final deliverables" />
        <p className="text-[12.5px] text-fog-400 leading-relaxed">
          Now map the big end-of-term pieces — IAs, lab reports, final essays. Head to the
          <span className="text-fog-100 font-semibold"> Deadline Cascader </span>
          to add each one; it breaks them into {state.term.blockHours}-hour daily blocks from the moment they're created.
          You can add more any time.
        </p>
        <div className="flex flex-wrap gap-2 mt-4">
          {state.deliverables.map((d) => {
            const s = state.subjects.find((x) => x.id === d.subjectId);
            return (
              <span key={d.id} className={`inline-flex items-center gap-2 h-9 px-3 rounded-xl ring-1 text-[12.5px] ${subjectColor(s?.color).chip}`}>
                <span className={`h-1.5 w-1.5 rounded-full ${subjectColor(s?.color).dot}`} />
                {d.title} · {d.dueAt}
              </span>
            );
          })}
          {!state.deliverables.length && <p className="text-[12.5px] text-fog-500">None mapped yet.</p>}
        </div>
      </section>

      {firstRun ? (
        <div className="flex flex-wrap justify-center gap-3 pb-4">
          <PrimaryButton onClick={finish} className="!h-11 !px-8">
            Start the term {Icons.arrowRight('h-4 w-4')}
          </PrimaryButton>
          <GhostButton onClick={() => { dispatch({ type: 'reset' }); }} className="!h-11">Start over</GhostButton>
        </div>
      ) : (
        <div className="flex flex-wrap justify-center gap-3 pb-4">
          <PrimaryButton onClick={saveTerm} className="!h-11 !px-8">Save term settings</PrimaryButton>
          <GhostButton onClick={() => { if (window.confirm('Erase everything and re-run setup?')) dispatch({ type: 'reset' }); }} className="!h-11 !text-rose-300/80 hover:!bg-rose-500/10">
            Reset all data
          </GhostButton>
        </div>
      )}
    </div>
  );
}

function StepTitle({ n, title }: { n: number; title: string }) {
  return (
    <div className="flex items-center gap-3 mb-5">
      <span className="h-7 w-7 rounded-lg bg-white/[0.06] ring-1 ring-white/10 grid place-items-center text-[12px] font-bold text-fog-200 font-mono">{n}</span>
      <h2 className="text-[14px] font-bold text-white">{title}</h2>
      <div className="flex-1 h-px bg-white/[0.06]" />
    </div>
  );
}
