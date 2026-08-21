/* atlas — the deadline cascading engine.
 *
 * A big deliverable ("History IA, 20 hours, due in 3 weeks") is broken into
 * micro-task blocks of `term.blockHours` hours. The blocks are spread evenly
 * over the WORKING days between "now" and the due date. Every recomputation
 * starts from the later of (term start | last delayed flag | today), so:
 *
 *   - completing blocks today  -> tomorrow's share stays the same
 *   - skipping / flagging late -> the SAME remaining blocks redistribute over
 *                                 the days that are left. No work is lost,
 *                                 no day quietly overflows — the daily load
 *     rises exactly as much as the remaining time allows.
 *
 * Blocks pinned by drag & drop (`deliverable.manual`) keep their date if it
 * still lies between today and the due date.
 */

import { dateKey, datesUntil, daysBetween, maxKey, todayKey } from './dates.ts';
import type { Block, Deliverable, Schedule, Term } from './types';

export function totalBlocks(d: Deliverable, term: Term): number {
  const bh = term.blockHours || 1.5;
  return Math.max(1, Math.round(d.estHours / bh));
}

export function scheduleDeliverable(d: Deliverable, term: Term, today: string = todayKey()): Schedule {
  const total = totalBlocks(d, term);
  const done = Math.min(d.completedBlocks, total);
  const remaining = Math.max(0, total - done);
  const overdue = remaining > 0 && daysBetween(today, d.dueAt) <= 0;

  /* The cascade always restarts from "now": the later of the term start,
     the moment the student last flagged themselves behind, and today. */
  const from = maxKey(d.startAt, term.startsAt, d.delayedAt, today);

  const days = datesUntil(from, d.dueAt, term.includeWeekends);
  const perDay = days.length ? Math.ceil(remaining / days.length) : remaining;

  const blocks: Block[] = [];
  let next = 0; // cursor over block indices
  /* A drag & drop pin only counts if its day is still part of the plan;
     pins to days the regeneration has passed are quietly forgiven. */
  const dayKeys = new Set(days.map(dateKey));
  const pinOf = (i: number): string | null => {
    const p = d.manual[i];
    return p && dayKeys.has(p) ? p : null;
  };
  const put = (i: number, k: string, pinned: boolean) => {
    blocks.push({
      id: d.id + '#' + i,
      deliverableId: d.id,
      index: i,
      total,
      date: k,
      hours: term.blockHours || 1.5,
      pinned
    });
  };

  for (const day of days) {
    const k = dateKey(day);

    /* Pinned blocks land on this day regardless of the algorithmic share. */
    for (let i = done; i < total; i++) {
      if (pinOf(i) === k) put(i, k, true);
    }

    /* Then the day's even share, skipping blocks pinned elsewhere. */
    let placed = 0;
    while (placed < perDay && next < total) {
      const i = next;
      if (i < done || pinOf(i)) { next++; continue; } // completed, or pinned to another day
      put(i, k, false);
      next++;
      placed++;
    }
  }

  /* If the due date has passed (or no days remain), everything piles onto
     today so it stays visible instead of vanishing. */
  if (overdue && !blocks.length && remaining) {
    for (let i = done; i < total; i++) {
      blocks.push({
        id: d.id + '#' + i, deliverableId: d.id, index: i, total,
        date: today, hours: term.blockHours || 1.5, pinned: false
      });
    }
  }

  blocks.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.index - b.index));

  return {
    deliverableId: d.id,
    total,
    done,
    remaining,
    blocks,
    daysLeft: days.length,
    perDay,
    overdue,
    hoursPerDay: Math.round(((perDay * (term.blockHours || 1.5)) + Number.EPSILON) * 10) / 10
  };
}

export function scheduleAll(deliverables: Deliverable[], term: Term, today: string = todayKey()): Schedule[] {
  return deliverables.map((d) => scheduleDeliverable(d, term, today));
}

/** Blocks scheduled for a given day, across all deliverables. */
export function blocksOn(schedules: Schedule[], day: string): Block[] {
  return schedules.flatMap((s) => s.blocks.filter((b) => b.date === day));
}

/** Total cascaded hours on a day — used for the calendar heat shading. */
export function loadOn(schedules: Schedule[], day: string): number {
  return Math.round((blocksOn(schedules, day).reduce((n, b) => n + b.hours, 0) + Number.EPSILON) * 10) / 10;
}
