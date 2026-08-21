/* atlas — group milestone status engine.
 *
 * A milestone is "behind" when the blocks completed by today sit more than
 * one block under the straight-line expectation between start and due date,
 * "at risk" when merely under it. Derived purely from the data, so marking
 * progress anywhere instantly re-evaluates every alert.
 */

import { daysBetween } from './dates.ts';
import type { Group, Milestone, MilestoneStatus } from './types';

export function totalBlocksOf(m: Milestone): number {
  return Math.max(1, Math.round(m.estHours / 1.5));
}

export function milestoneStatus(m: Milestone, today: string): MilestoneStatus {
  const total = totalBlocksOf(m);
  const span = Math.max(1, daysBetween(m.startsAt, m.dueAt));
  const elapsed = Math.min(Math.max(daysBetween(m.startsAt, today), 0), span);
  const expected = Math.floor((elapsed / span) * total);
  const done = m.completedBlocks;

  let status: MilestoneStatus['status'];
  if (done >= total) status = 'done';
  else if (done <= expected - 2) status = 'behind';
  else if (done < expected) status = 'at-risk';
  else status = 'on-track';

  const plan = Math.max(expected, 1);
  return { expected, status, pct: Math.min(1, Math.max(0, done / plan)) };
}

export type GroupAlert = {
  groupId: string;
  groupName: string;
  milestoneId: string;
  title: string;
  owner: string;
  status: 'behind' | 'at-risk' | 'overdue';
  detail: string;
};

export function groupAlerts(groups: Group[], today: string): GroupAlert[] {
  const out: GroupAlert[] = [];
  for (const g of groups) {
    for (const m of g.milestones) {
      const s = milestoneStatus(m, today);
      if (s.status === 'on-track' || s.status === 'done') continue;
      const owner = g.members.find((x) => x.id === m.ownerId);
      const overdue = daysBetween(today, m.dueAt) <= 0;
      out.push({
        groupId: g.id,
        groupName: g.name,
        milestoneId: m.id,
        title: m.title,
        owner: owner ? owner.name : 'unassigned',
        status: overdue ? 'overdue' : s.status,
        detail: overdue
          ? 'past due — needs attention now'
          : `expected ${s.expected} block${s.expected === 1 ? '' : 's'} done by now, ${m.completedBlocks} logged`
      });
    }
  }
  return out;
}
