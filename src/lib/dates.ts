/* atlas — local-date math. No libraries: date keys are 'YYYY-MM-DD' strings
 * parsed in LOCAL time, never via new Date('YYYY-MM-DD') (which is UTC). */

import type { DateKey } from './types';

export const DAY_MS = 86400000;
export const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export function dateKey(d: Date): DateKey {
  const p = (n: number) => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
}

/** Parse 'YYYY-MM-DD' at local midnight. */
export function parseKey(key: DateKey): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function todayKey(): DateKey {
  return dateKey(new Date());
}

export function addDays(d: Date, n: number): Date {
  const c = new Date(d);
  c.setDate(c.getDate() + n);
  return c;
}

export function isWeekend(d: Date): boolean {
  const w = d.getDay();
  return w === 0 || w === 6;
}

export function daysBetween(a: DateKey, b: DateKey): number {
  return Math.round((parseKey(b).getTime() - parseKey(a).getTime()) / DAY_MS);
}

export function maxKey(...keys: (DateKey | null | undefined)[]): DateKey {
  return keys.filter(Boolean).sort().pop() as DateKey;
}

/** Whole calendar days from `a` to `b` (exclusive of b). */
export function datesUntil(a: DateKey, b: DateKey, includeWeekends: boolean): Date[] {
  const out: Date[] = [];
  let cur = parseKey(a);
  const end = parseKey(b);
  while (cur.getTime() < end.getTime()) {
    if (includeWeekends || !isWeekend(cur)) out.push(new Date(cur));
    cur = addDays(cur, 1);
  }
  return out;
}

/** Working days strictly before the due date, counted from `from`. */
export function workdaysLeft(from: DateKey, due: DateKey, includeWeekends: boolean): number {
  return datesUntil(from, due, includeWeekends).length;
}

const FMT_MED = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' });
const FMT_LONG = new Intl.DateTimeFormat(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
const MONTH = new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' });

export const fmtMed = (k: DateKey) => FMT_MED.format(parseKey(k));
export const fmtLong = (k: DateKey) => FMT_LONG.format(parseKey(k));
export const fmtMonth = (d: Date) => MONTH.format(d);

export function weekdayShort(k: DateKey): string {
  return WEEKDAYS[(parseKey(k).getDay() + 6) % 7];
}

/** "in 3 days" / "today" / "2 days overdue" */
export function relativeDay(k: DateKey, today: DateKey): string {
  const n = daysBetween(today, k);
  if (n === 0) return 'today';
  if (n === 1) return 'tomorrow';
  if (n === -1) return 'yesterday';
  return n > 0 ? `in ${n} days` : `${-n} days overdue`;
}

/** 42-cell month grid starting on Monday. */
export function monthGrid(anchor: Date): Date[] {
  const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  const offset = (first.getDay() + 6) % 7;
  const start = addDays(first, -offset);
  return Array.from({ length: 42 }, (_, i) => addDays(start, i));
}
