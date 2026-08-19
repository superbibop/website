/* Atlas — small shared helpers. Loaded first; everything else may assume it exists. */
(function (global) {
  'use strict';

  var MIN = 60 * 1000;
  var HOUR = 60 * MIN;
  var DAY = 24 * HOUR;

  /* ---------------------------------------------------------------- ids */

  function uid(prefix) {
    var rand = (global.crypto && global.crypto.randomUUID)
      ? global.crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10);
    return (prefix || 'a') + '_' + Date.now().toString(36) + rand;
  }

  /* -------------------------------------------------------------- dates */

  function startOfDay(d) {
    var x = new Date(d);
    x.setHours(0, 0, 0, 0);
    return x;
  }

  function addDays(d, n) {
    var x = new Date(d);
    x.setDate(x.getDate() + n);
    return x;
  }

  /** Whole calendar days between today and the given date. 0 = today, 1 = tomorrow. */
  function daysUntil(date, now) {
    return Math.round((startOfDay(date) - startOfDay(now || new Date())) / DAY);
  }

  function sameDay(a, b) {
    return startOfDay(a).getTime() === startOfDay(b).getTime();
  }

  /** Local `YYYY-MM-DD` — never use toISOString() for this, it shifts by timezone. */
  function dateKey(d) {
    var x = new Date(d);
    return x.getFullYear() + '-' + pad(x.getMonth() + 1) + '-' + pad(x.getDate());
  }

  function pad(n) { return (n < 10 ? '0' : '') + n; }

  var TIME_FMT = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' });
  var DATE_FMT = new Intl.DateTimeFormat(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  var LONG_FMT = new Intl.DateTimeFormat(undefined, { weekday: 'long', month: 'long', day: 'numeric' });

  function formatTime(d) { return TIME_FMT.format(new Date(d)); }
  function formatDate(d) { return DATE_FMT.format(new Date(d)); }
  function formatLongDate(d) { return LONG_FMT.format(new Date(d)); }

  /** "Due in 3h", "Due tomorrow, 11:59 PM", "2 days overdue". */
  function relativeDue(due, now) {
    var d = new Date(due);
    var n = now || new Date();
    var diff = d - n;
    var days = daysUntil(d, n);

    if (diff < 0) {
      var late = -diff;
      if (late < HOUR) return Math.max(1, Math.round(late / MIN)) + ' min overdue';
      if (late < DAY) return Math.round(late / HOUR) + 'h overdue';
      var lateDays = Math.round(late / DAY);
      return lateDays + (lateDays === 1 ? ' day overdue' : ' days overdue');
    }
    if (diff < HOUR) return 'Due in ' + Math.max(1, Math.round(diff / MIN)) + ' min';
    if (days === 0) return 'Due today, ' + formatTime(d);
    if (days === 1) return 'Due tomorrow, ' + formatTime(d);
    if (days < 7) return 'Due ' + formatDate(d) + ', ' + formatTime(d);
    return 'Due ' + formatDate(d);
  }

  /** Short countdown used on cards: "3h", "2d", "-1d". */
  function shortCountdown(due, now) {
    var diff = new Date(due) - (now || new Date());
    var sign = diff < 0 ? '-' : '';
    var abs = Math.abs(diff);
    if (abs < HOUR) return sign + Math.max(1, Math.round(abs / MIN)) + 'm';
    if (abs < DAY) return sign + Math.round(abs / HOUR) + 'h';
    return sign + Math.round(abs / DAY) + 'd';
  }

  /* ------------------------------------------------------------ urgency */

  /**
   * Urgency drives every colour in the UI. One function, one source of truth.
   * overdue < today < soon (<= 3 days) < later
   */
  function urgency(assignment, now) {
    if (assignment.status === 'done') return 'done';
    var due = new Date(assignment.dueAt);
    var n = now || new Date();
    if (due < n) return 'overdue';
    var days = daysUntil(due, n);
    if (days === 0) return 'today';
    if (days <= 3) return 'soon';
    return 'later';
  }

  var URGENCY = {
    overdue: { label: 'Overdue',  rank: 0, text: 'text-rose-300',   dot: 'bg-rose-400',   ring: 'ring-rose-500/25',   glow: 'shadow-[0_0_26px_-14px_rgba(251,113,133,.9)]', chip: 'bg-rose-500/10 text-rose-300 ring-rose-500/25' },
    today:   { label: 'Today',    rank: 1, text: 'text-amber-300',  dot: 'bg-amber-400',  ring: 'ring-amber-500/25',  glow: 'shadow-[0_0_26px_-14px_rgba(251,191,36,.9)]',  chip: 'bg-amber-500/10 text-amber-300 ring-amber-500/25' },
    soon:    { label: 'Soon',     rank: 2, text: 'text-atlas-300',  dot: 'bg-atlas-400',  ring: 'ring-atlas-500/20',  glow: '',                                             chip: 'bg-atlas-500/10 text-atlas-300 ring-atlas-500/25' },
    later:   { label: 'Upcoming', rank: 3, text: 'text-haze-400',   dot: 'bg-haze-500',   ring: 'ring-white/[0.06]',  glow: '',                                             chip: 'bg-white/5 text-haze-300 ring-white/10' },
    done:    { label: 'Done',     rank: 4, text: 'text-slate-500',  dot: 'bg-slate-600',  ring: 'ring-white/[0.04]',  glow: '',                                             chip: 'bg-white/5 text-slate-400 ring-white/10' }
  };

  var TYPE_LABEL = {
    homework: 'Homework', assessment: 'Assessment', project: 'Project',
    reading: 'Reading', lab: 'Lab', other: 'Task'
  };

  /* -------------------------------------------------------------- misc */

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function debounce(fn, wait) {
    var t;
    return function () {
      var args = arguments, self = this;
      clearTimeout(t);
      t = setTimeout(function () { fn.apply(self, args); }, wait);
    };
  }

  /** Deterministic accent per class name, so each subject keeps its colour. */
  var COURSE_TONES = [
    'text-sky-300 bg-sky-500/10 ring-sky-500/20',
    'text-violet-300 bg-violet-500/10 ring-violet-500/20',
    'text-emerald-300 bg-emerald-500/10 ring-emerald-500/20',
    'text-amber-300 bg-amber-500/10 ring-amber-500/20',
    'text-rose-300 bg-rose-500/10 ring-rose-500/20',
    'text-cyan-300 bg-cyan-500/10 ring-cyan-500/20',
    'text-fuchsia-300 bg-fuchsia-500/10 ring-fuchsia-500/20',
    'text-lime-300 bg-lime-500/10 ring-lime-500/20'
  ];

  function courseTone(name) {
    var h = 0, s = String(name || '');
    for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
    return COURSE_TONES[h % COURSE_TONES.length];
  }

  function initials(name) {
    return String(name || '?').trim().split(/\s+/).slice(0, 2)
      .map(function (w) { return w[0]; }).join('').toUpperCase();
  }

  function plural(n, one, many) { return n + ' ' + (n === 1 ? one : (many || one + 's')); }

  global.Atlas = global.Atlas || {};
  global.Atlas.util = {
    MIN: MIN, HOUR: HOUR, DAY: DAY,
    uid: uid,
    startOfDay: startOfDay, addDays: addDays, daysUntil: daysUntil, sameDay: sameDay,
    dateKey: dateKey, pad: pad,
    formatTime: formatTime, formatDate: formatDate, formatLongDate: formatLongDate,
    relativeDue: relativeDue, shortCountdown: shortCountdown,
    urgency: urgency, URGENCY: URGENCY, TYPE_LABEL: TYPE_LABEL,
    escapeHtml: escapeHtml, debounce: debounce,
    courseTone: courseTone, initials: initials, plural: plural
  };
})(window);
