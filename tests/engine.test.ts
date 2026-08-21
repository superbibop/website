/* atlas — engine tests. Runs on plain Node (native TS type stripping):
 *   npm test
 * Covers the cascading math (distribution, dynamic shift, pins, overdue)
 * and the group milestone status derivation. */

import assert from 'node:assert/strict';
import { scheduleDeliverable, blocksOn, loadOn } from '../src/lib/cascade.ts';
import { milestoneStatus, groupAlerts } from '../src/lib/group.ts';
import { datesUntil } from '../src/lib/dates.ts';
import type { Deliverable, Group, Term } from '../src/lib/types.ts';

const T = '2026-09-01'; // a Tuesday

const term: Term = {
  name: 'T', startsAt: '2026-08-01', endsAt: '2026-12-01',
  blockHours: 1.5, includeWeekends: false
};

const mk = (over: Partial<Deliverable>): Deliverable => ({
  id: 'd1', subjectId: 's', title: 'IA', dueAt: '2026-09-15', startAt: null,
  estHours: 15, weight: null, completedBlocks: 0, delayedAt: null, manual: {},
  createdAt: '2026-08-20', ...over
});

let passed = 0;
const ok = (name: string, fn: () => void) => {
  try { fn(); passed++; console.log('ok   ' + name); }
  catch (e) { console.log('FAIL ' + name + '\n     ' + (e as Error).message); process.exitCode = 1; }
};

/* ------------------------------------------------------------- dates */

ok('datesUntil skips weekends by default and ends before the due date', () => {
  const days = datesUntil('2026-09-04', '2026-09-08', false); // Fri -> Tue
  assert.deepEqual(days.map((d) => d.getDay()), [5, 1]); // Fri, Mon
});

ok('datesUntil includes weekends when the term says so', () => {
  const days = datesUntil('2026-09-04', '2026-09-08', true);
  assert.equal(days.length, 4);
});

/* ----------------------------------------------------------- cascade */

ok('15h / 1.5h = 10 blocks, spread evenly over workdays', () => {
  const s = scheduleDeliverable(mk({}), term, T);
  assert.equal(s.total, 10);
  assert.equal(s.remaining, 10);
  // Sep 1 (Tue) -> Sep 15: workdays = 1,2,3,4,(5,6 weekend),7,8,9,10,(11,12),13,14 = 10 days
  assert.equal(s.daysLeft, 10);
  assert.equal(s.perDay, 1);
  assert.equal(s.blocks.length, 10);
  assert.equal(loadOn([s], '2026-09-01'), 1.5);
});

ok('completion reduces remaining without changing per-day spread', () => {
  const s = scheduleDeliverable(mk({ completedBlocks: 4 }), term, T);
  assert.equal(s.remaining, 6);
  assert.equal(s.perDay, 1);
  assert.equal(s.done, 4);
});

ok('THE DYNAMIC SHIFT: a late start compresses the same work into fewer days', () => {
  // Flagged behind on Fri Sep 11; due Tue Sep 15. Workdays left: Fri 11, Mon 14 = 2.
  const late = scheduleDeliverable(mk({ delayedAt: '2026-09-11' }), term, '2026-09-11');
  assert.equal(late.remaining, 10, 'no work is lost');
  assert.equal(late.daysLeft, 2);
  assert.equal(late.perDay, 5);          // 10 blocks over 2 days
  assert.equal(late.hoursPerDay, 7.5);
});

ok('dynamic shift: fewer days -> higher per-day load', () => {
  const from = '2026-09-10';
  const s = scheduleDeliverable(mk({ delayedAt: from }), term, from);
  const days = datesUntil(from, '2026-09-15', false);
  assert.equal(s.daysLeft, days.length);
  assert.equal(s.remaining, 10);
  assert.equal(s.perDay, Math.ceil(10 / days.length));
  assert.ok(s.perDay >= 3, `perDay should rise, got ${s.perDay}`);
  assert.ok(s.hoursPerDay > scheduleDeliverable(mk({}), term, T).hoursPerDay);
});

ok('skipped days are absorbed: same remaining, redistributed from today', () => {
  // Student does nothing for a week; the engine re-spreads from the new today.
  const s1 = scheduleDeliverable(mk({}), term, '2026-09-01');
  const s2 = scheduleDeliverable(mk({}), term, '2026-09-08');
  assert.equal(s2.remaining, s1.remaining);
  assert.ok(s2.perDay > s1.perDay, `${s2.perDay} > ${s1.perDay}`);
});

ok('drag & drop pins survive a recascade; invalid pins are forgiven', () => {
  const pinned = mk({ manual: { 3: '2026-09-14' } });
  const s = scheduleDeliverable(pinned, term, T);
  const b3 = s.blocks.find((b) => b.index === 3)!;
  assert.equal(b3.date, '2026-09-14');
  assert.equal(b3.pinned, true);
  // A pin to a day already passed is ignored, and the block still gets placed.
  const stale = scheduleDeliverable(mk({ manual: { 3: '2020-01-01' } }), term, T);
  assert.ok(stale.blocks.some((b) => b.index === 3));
  assert.equal(stale.blocks.find((b) => b.index === 3)!.pinned, false);
});

ok('pinned blocks do not double-place', () => {
  const s = scheduleDeliverable(mk({ manual: { 0: '2026-09-02' } }), term, T);
  const zeros = s.blocks.filter((b) => b.index === 0);
  assert.equal(zeros.length, 1);
  assert.equal(zeros[0].date, '2026-09-02');
});

ok('overdue deliverables pile onto today instead of vanishing', () => {
  const s = scheduleDeliverable(mk({ dueAt: '2026-08-30' }), term, T);
  assert.equal(s.overdue, true);
  assert.equal(s.remaining, 10);
  assert.ok(s.blocks.every((b) => b.date === T));
});

ok('term start gates the cascade start', () => {
  // Due after term start gap: no days until term starts -> nothing scheduled yet
  const s = scheduleDeliverable(mk({ dueAt: '2026-08-20' }), { ...term, startsAt: '2026-08-18' }, '2026-08-01');
  const days = datesUntil('2026-08-18', '2026-08-20', false);
  assert.equal(s.daysLeft, days.length);
});

ok('blocksOn aggregates across schedules', () => {
  const s1 = scheduleDeliverable(mk({ id: 'a' }), term, T);
  const s2 = scheduleDeliverable(mk({ id: 'b', dueAt: '2026-09-10', estHours: 3 }), term, T);
  const today = blocksOn([s1, s2], T);
  assert.equal(today.length, s1.blocks.filter((b) => b.date === T).length + s2.blocks.filter((b) => b.date === T).length);
});

/* ------------------------------------------------------------ group */

const TODAY = '2026-09-10';

const grp: Group = {
  id: 'g', name: 'G',
  members: [{ id: 'me', name: 'You', initials: 'Y', hue: '#fff' }],
  milestones: [
    { id: 'm1', title: 'Proposal', ownerId: 'me', startsAt: '2026-09-01', dueAt: '2026-09-20', estHours: 4, completedBlocks: 1 },   // expected 1 -> on-track
    { id: 'm2', title: 'Data', ownerId: 'me', startsAt: '2026-09-01', dueAt: '2026-09-20', estHours: 4, completedBlocks: 2 },     // 2 > 1 -> on-track
    { id: 'm3', title: 'Board', ownerId: 'me', startsAt: '2026-09-01', dueAt: '2026-09-20', estHours: 7.5, completedBlocks: 0 },   // 5 blocks, expected 2 -> behind
    { id: 'm4', title: 'Done thing', ownerId: 'me', startsAt: '2026-09-01', dueAt: '2026-09-20', estHours: 3, completedBlocks: 2 } // 2/2 -> done
  ]
};

ok('milestone status: straight-line expectation with grace', () => {
  // elapsed 9/19 ≈ 0.47 of the span
  assert.equal(milestoneStatus(grp.milestones[0], TODAY).expected, 1);   // floor(0.47*3)
  assert.equal(milestoneStatus(grp.milestones[0], TODAY).status, 'on-track');
  assert.equal(milestoneStatus(grp.milestones[1], TODAY).status, 'on-track');
  assert.equal(milestoneStatus(grp.milestones[2], TODAY).status, 'behind');  // 0 <= 2-2
  assert.equal(milestoneStatus(grp.milestones[3], TODAY).status, 'done');
});

ok('alerts only fire for at-risk / behind / overdue', () => {
  const alerts = groupAlerts([grp], TODAY);
  const ids = alerts.map((a) => a.milestoneId).sort();
  assert.deepEqual(ids, ['m3']);
});

ok('overdue milestones escalate', () => {
  const late = { ...grp, milestones: [grp.milestones[2]] };
  late.milestones[0] = { ...late.milestones[0], dueAt: '2026-09-05' };
  const alerts = groupAlerts([late], TODAY);
  assert.equal(alerts[0].status, 'overdue');
});

ok('expected saturates at the due date', () => {
  const s = milestoneStatus(grp.milestones[2], '2026-09-30'); // past due: full 5 of 5 blocks expected
  assert.equal(s.expected, 5);
});

console.log(`\n${passed} assertions groups passed${process.exitCode ? ' (WITH FAILURES)' : ''}`);
