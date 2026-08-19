/* Atlas — rendering. Pure-ish: reads the store, writes HTML, wires nothing.
 * All interaction is delegated in app.js via data-act attributes. */
(function (global) {
  'use strict';

  var U = global.Atlas.util;
  var store = global.Atlas.store;
  var notify = global.Atlas.notify;
  var esc = U.escapeHtml;

  var $ = function (sel, root) { return (root || document).querySelector(sel); };

  /* ------------------------------------------------------------- icons */

  var ICONS = {
    check: '<svg viewBox="0 0 24 24" class="h-3.5 w-3.5" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12.5 4.5 4.5L19 7"/></svg>',
    spark: '<svg viewBox="0 0 24 24" class="h-3.5 w-3.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M18.4 5.6l-2.8 2.8M8.4 15.6l-2.8 2.8"/></svg>',
    clock: '<svg viewBox="0 0 24 24" class="h-3.5 w-3.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 1.8"/></svg>',
    empty: '<svg viewBox="0 0 24 24" class="h-7 w-7" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7.5A2.5 2.5 0 0 1 6.5 5H10l2 2.5h5.5A2.5 2.5 0 0 1 20 10v6.5a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 16.5z"/><path d="m9.5 13 2 2 3.5-3.5"/></svg>',
    chevL: '<svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m14 6-6 6 6 6"/></svg>',
    chevR: '<svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m10 6 6 6-6 6"/></svg>'
  };

  var NAV = [
    { key: 'upcoming', label: 'Upcoming', count: 'upcoming' },
    { key: 'today',    label: 'Today',    count: 'today' },
    { key: 'week',     label: 'This week', count: 'week' },
    { key: 'overdue',  label: 'Overdue',  count: 'overdue' },
    { key: 'done',     label: 'Completed', count: 'done' },
    { key: 'all',      label: 'All',      count: 'all' }
  ];

  /* -------------------------------------------------------------- chrome */

  function renderSideNav(ctx) {
    var c = store.counts();
    $('#sideNav').innerHTML = NAV.map(function (item) {
      var on = ctx.filter === item.key;
      var n = c[item.count] || 0;
      var alert = item.key === 'overdue' && n > 0;
      return '<button data-act="filter" data-filter="' + item.key + '" ' +
        'class="w-full h-9 px-3 rounded-lg flex items-center gap-2.5 text-[13px] transition ' +
        (on ? 'bg-white/[0.06] text-slate-100 font-medium ring-1 ring-white/10' : 'text-haze-400 hover:text-slate-200 hover:bg-white/[0.03]') + '">' +
        '<span class="h-1.5 w-1.5 rounded-full ' + (on ? 'bg-atlas-400' : (alert ? 'bg-rose-400/80' : 'bg-transparent')) + '"></span>' +
        '<span class="flex-1 text-left">' + item.label + '</span>' +
        '<span class="text-[11.5px] tabular-nums ' + (alert ? 'text-rose-300' : 'text-haze-500') + '">' + n + '</span>' +
        '</button>';
    }).join('');
  }

  function renderFilterChips(ctx) {
    var c = store.counts();
    $('#filterChips').innerHTML = NAV.map(function (item) {
      var on = ctx.filter === item.key;
      var n = c[item.count] || 0;
      return '<button data-act="filter" data-filter="' + item.key + '" ' +
        'class="shrink-0 h-8 px-3 rounded-lg text-[12.5px] font-medium transition whitespace-nowrap ' +
        (on ? 'bg-atlas-500/15 text-atlas-200 ring-1 ring-atlas-500/30'
            : 'bg-ink-850 text-haze-400 ring-1 ring-white/[0.06] hover:text-slate-200 hover:ring-white/12') + '">' +
        item.label + '<span class="ml-1.5 tabular-nums ' + (on ? 'text-atlas-300/70' : 'text-haze-600') + '">' + n + '</span></button>';
    }).join('');
  }

  function statCard(value, label, tone, accent) {
    return '<div class="rounded-xl bg-ink-900 ring-1 ring-white/[0.06] shadow-card p-4 relative overflow-hidden">' +
      '<div class="absolute -right-6 -top-6 h-16 w-16 rounded-full ' + accent + ' blur-2xl opacity-60"></div>' +
      '<div class="relative">' +
      '<div class="text-2xl font-semibold tabular-nums ' + tone + '">' + value + '</div>' +
      '<div class="text-[12px] text-haze-500 mt-0.5">' + label + '</div>' +
      '</div></div>';
  }

  function renderStats() {
    var c = store.counts();
    $('#stats').innerHTML =
      statCard(c.overdue, 'Overdue', c.overdue ? 'text-rose-300' : 'text-slate-300', c.overdue ? 'bg-rose-500/30' : 'bg-white/5') +
      statCard(c.today, 'Due today', c.today ? 'text-amber-300' : 'text-slate-300', c.today ? 'bg-amber-500/25' : 'bg-white/5') +
      statCard(c.week, 'Next 7 days', 'text-slate-100', 'bg-atlas-500/20') +
      statCard(c.done, 'Completed', 'text-slate-400', 'bg-white/5');
  }

  function renderSyncStatus() {
    var el = $('#mbStatus'), dot = $('#mbDot');
    if (!el) return;
    var last = store.state.lastSyncAt;
    if (!last) {
      el.textContent = 'Not synced yet';
      if (dot) dot.className = 'h-1.5 w-1.5 rounded-full bg-haze-500';
      return;
    }
    var mins = Math.round((Date.now() - new Date(last)) / U.MIN);
    el.textContent = 'Synced ' + (mins < 1 ? 'just now' : mins < 60 ? mins + ' min ago' : Math.round(mins / 60) + 'h ago');
    if (dot) dot.className = 'h-1.5 w-1.5 rounded-full bg-atlas-400 shadow-[0_0_8px_rgba(95,211,188,.9)]';
  }

  function renderNotifStatus() {
    var el = $('#notifStatus');
    if (!el) return;
    el.textContent = notify.statusText();
    var granted = notify.permission() === 'granted';
    el.className = 'text-[12px] leading-snug ' + (granted ? 'text-atlas-300/90' : 'text-haze-400');
  }

  /* ------------------------------------------------- new from managebac */

  function renderManageBacBanner() {
    var section = $('#mbNewSection');
    var items = store.newFromManageBac();

    if (!items.length) { section.classList.add('hidden'); section.innerHTML = ''; return; }
    section.classList.remove('hidden');

    var rows = items.slice(0, 6).map(function (a) {
      var u = U.URGENCY[U.urgency(a)];
      return '<button data-act="open" data-id="' + a.id + '" ' +
        'class="w-full text-left rounded-xl bg-ink-900/80 ring-1 ring-white/[0.07] hover:ring-atlas-500/35 p-3 transition flex items-center gap-3">' +
          '<span class="h-8 w-8 shrink-0 rounded-lg grid place-items-center text-[10.5px] font-semibold ring-1 ' + U.courseTone(a.course) + '">' + esc(U.initials(a.course)) + '</span>' +
          '<span class="min-w-0 flex-1">' +
            '<span class="block text-[13.5px] font-medium text-slate-100 truncate">' + esc(a.title) + '</span>' +
            '<span class="block text-[11.5px] text-haze-500 truncate">' + esc(a.course) + ' · ' + esc(U.TYPE_LABEL[a.type] || 'Task') + '</span>' +
          '</span>' +
          '<span class="shrink-0 text-[11.5px] font-medium ' + u.text + ' tabular-nums">' + esc(U.relativeDue(a.dueAt)) + '</span>' +
        '</button>';
    }).join('');

    var more = items.length > 6
      ? '<p class="text-[12px] text-haze-500 pt-1">+ ' + (items.length - 6) + ' more</p>' : '';

    section.innerHTML =
      '<div class="animate-rise relative rounded-2xl ring-1 ring-atlas-500/25 shadow-glow overflow-hidden">' +
        '<div class="absolute inset-0 bg-gradient-to-br from-atlas-500/[0.10] via-atlas-500/[0.03] to-transparent"></div>' +
        '<div class="relative p-4 sm:p-5">' +
          '<div class="flex items-center gap-2.5 mb-3.5">' +
            '<span class="relative flex h-2 w-2">' +
              '<span class="absolute inline-flex h-full w-full rounded-full bg-atlas-400 opacity-70 animate-ping"></span>' +
              '<span class="relative inline-flex h-2 w-2 rounded-full bg-atlas-400"></span>' +
            '</span>' +
            '<h2 class="text-[14px] font-semibold text-atlas-200 tracking-tight">New from ManageBac</h2>' +
            '<span class="h-5 px-1.5 rounded-md bg-atlas-500/15 text-atlas-300 text-[11px] font-semibold grid place-items-center tabular-nums">' + items.length + '</span>' +
            '<div class="flex-1"></div>' +
            '<button data-act="mark-all-seen" class="h-7 px-2.5 rounded-md text-[12px] text-haze-400 hover:text-slate-100 hover:bg-white/5 transition">Mark all seen</button>' +
          '</div>' +
          '<div class="grid gap-2 sm:grid-cols-2">' + rows + '</div>' + more +
        '</div>' +
      '</div>';
  }

  /* ---------------------------------------------------------- list view */

  function assignmentCard(a, now) {
    var key = U.urgency(a, now);
    var u = U.URGENCY[key];
    var done = a.status === 'done';
    var rel = U.relativeDue(a.dueAt, now);
    var clock = U.formatTime(a.dueAt);

    var newBadge = a.isNew
      ? '<span class="shrink-0 inline-flex items-center gap-1 h-5 px-1.5 rounded-md bg-atlas-500/15 text-atlas-300 ring-1 ring-atlas-500/25 text-[10.5px] font-semibold uppercase tracking-wide">' + ICONS.spark + 'New</span>'
      : '';

    var points = (a.points != null && !isNaN(a.points))
      ? '<span class="text-haze-600">·</span><span class="text-haze-500">' + a.points + ' pts</span>' : '';

    var source = a.source === 'managebac'
      ? '<span class="text-haze-600" title="Synced from ManageBac">·</span><span class="text-haze-500">ManageBac</span>' : '';

    var desc = a.description
      ? '<p class="mt-1.5 text-[12.5px] text-haze-500 leading-relaxed line-clamp-2">' + esc(a.description) + '</p>' : '';

    var labels = (a.labels && a.labels.length)
      ? '<div class="mt-2 flex flex-wrap gap-1">' + a.labels.slice(0, 3).map(function (l) {
          return '<span class="h-5 px-1.5 rounded-md bg-white/[0.04] ring-1 ring-white/[0.06] text-[10.5px] text-haze-400 grid place-items-center">' + esc(l) + '</span>';
        }).join('') + '</div>' : '';

    return '<article data-id="' + a.id + '" class="assignment-card ' + (done ? 'card-done ' : '') +
      'relative rounded-xl bg-ink-900 ring-1 ' + u.ring + ' ' + u.glow + ' shadow-card p-3.5 flex gap-3 hover:ring-white/15">' +
      '<button data-act="toggle" data-id="' + a.id + '" class="tick mt-0.5" role="checkbox" aria-checked="' + done + '" aria-label="Mark complete">' + ICONS.check + '</button>' +
      '<div class="min-w-0 flex-1 cursor-pointer" data-act="open" data-id="' + a.id + '">' +
        '<div class="flex items-start gap-2">' +
          '<h3 class="card-title min-w-0 flex-1 text-[14px] font-medium text-slate-100 leading-snug">' + esc(a.title) + '</h3>' +
          newBadge +
        '</div>' +
        '<div class="mt-1.5 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[12px]">' +
          '<span class="h-5 px-1.5 rounded-md ring-1 text-[11px] font-medium grid place-items-center ' + U.courseTone(a.course) + '">' + esc(a.course) + '</span>' +
          '<span class="text-haze-500">' + esc(U.TYPE_LABEL[a.type] || 'Task') + '</span>' +
          points + source +
        '</div>' +
        desc + labels +
      '</div>' +
      '<div class="shrink-0 flex flex-col items-end justify-between gap-1">' +
        '<span class="text-[12px] font-medium ' + u.text + ' whitespace-nowrap">' + esc(rel) + '</span>' +
        /* Only spell out the clock time when the relative phrase left it out. */
        (rel.indexOf(clock) === -1
          ? '<span class="text-[11px] text-haze-600 tabular-nums whitespace-nowrap">' + esc(clock) + '</span>'
          : '') +
      '</div>' +
    '</article>';
  }

  function dayHeading(date, now) {
    var d = U.daysUntil(date, now);
    var name = d === 0 ? 'Today' : d === 1 ? 'Tomorrow' : d === -1 ? 'Yesterday' : U.formatLongDate(date);
    var tone = d < 0 ? 'text-rose-300' : d === 0 ? 'text-amber-300' : 'text-slate-200';
    var sub = (d === 0 || d === 1 || d === -1) ? U.formatDate(date) : '';
    return '<div class="flex items-baseline gap-2.5 px-0.5">' +
      '<h2 class="text-[13px] font-semibold tracking-tight ' + tone + '">' + esc(name) + '</h2>' +
      (sub ? '<span class="text-[11.5px] text-haze-600">' + esc(sub) + '</span>' : '') +
      '<span class="flex-1 h-px bg-white/[0.06]"></span>' +
      '</div>';
  }

  function emptyState(ctx) {
    var msgs = {
      upcoming: ['All clear', 'Nothing due ahead. Sync ManageBac to pull in new work.'],
      today:    ['Nothing due today', 'Enjoy it — check the week view for what is coming.'],
      week:     ['Quiet week', 'No deadlines in the next seven days.'],
      overdue:  ['Nothing overdue', 'You are caught up.'],
      done:     ['Nothing completed yet', 'Tick something off and it will show up here.'],
      all:      ['No assignments yet', 'Sync ManageBac or add one manually to get started.']
    };
    var m = msgs[ctx.filter] || msgs.all;
    if (ctx.search) m = ['No matches', 'Nothing matches "' + ctx.search + '".'];

    return '<div class="rounded-2xl border border-dashed border-white/[0.08] py-14 px-6 text-center">' +
      '<div class="mx-auto h-12 w-12 rounded-xl bg-ink-850 ring-1 ring-white/[0.06] grid place-items-center text-haze-500 mb-3.5">' + ICONS.empty + '</div>' +
      '<h3 class="text-[14px] font-medium text-slate-200">' + esc(m[0]) + '</h3>' +
      '<p class="text-[12.5px] text-haze-500 mt-1 max-w-xs mx-auto leading-relaxed">' + esc(m[1]) + '</p>' +
      (ctx.search ? '' : '<button data-act="sync" class="mt-4 h-9 px-4 rounded-lg bg-atlas-500/10 text-atlas-300 ring-1 ring-atlas-500/25 hover:bg-atlas-500/20 text-[13px] font-medium transition">Sync ManageBac</button>') +
      '</div>';
  }

  function renderList(ctx) {
    var host = $('#listView');
    var now = new Date();
    var items = store.query({ filter: ctx.filter, search: ctx.search, now: now });

    if (!items.length) { host.innerHTML = emptyState(ctx); return; }

    var groups = store.groupByDay(items, now);
    host.innerHTML = groups.map(function (g) {
      return '<div class="space-y-2.5">' + dayHeading(g.date, now) +
        '<div class="space-y-2">' + g.items.map(function (a) { return assignmentCard(a, now); }).join('') + '</div>' +
      '</div>';
    }).join('');
  }

  /* ------------------------------------------------------ calendar view */

  var MONTH_FMT = new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' });
  var WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  function renderCalendar(ctx) {
    var host = $('#calendarView');
    var now = new Date();
    var cursor = ctx.calMonth ? new Date(ctx.calMonth) : new Date(now.getFullYear(), now.getMonth(), 1);
    cursor = new Date(cursor.getFullYear(), cursor.getMonth(), 1);

    /* Grid starts on Monday. */
    var offset = (cursor.getDay() + 6) % 7;
    var gridStart = U.addDays(cursor, -offset);

    var visible = store.query({ filter: ctx.filter === 'done' ? 'done' : 'all', search: ctx.search, now: now });
    var byDay = {};
    visible.forEach(function (a) {
      var k = U.dateKey(a.dueAt);
      (byDay[k] = byDay[k] || []).push(a);
    });

    var cells = '';
    for (var i = 0; i < 42; i++) {
      var day = U.addDays(gridStart, i);
      var key = U.dateKey(day);
      var inMonth = day.getMonth() === cursor.getMonth();
      var isToday = U.sameDay(day, now);
      var selected = ctx.selectedDay === key;
      var list = (byDay[key] || []).sort(function (a, b) { return new Date(a.dueAt) - new Date(b.dueAt); });

      var pills = list.slice(0, 3).map(function (a) {
        var u = U.URGENCY[U.urgency(a, now)];
        return '<button data-act="open" data-id="' + a.id + '" class="w-full text-left truncate rounded px-1.5 py-[3px] text-[10.5px] leading-tight ring-1 ' + u.chip + ' hover:brightness-125 transition">' + esc(a.title) + '</button>';
      }).join('');

      var overflow = list.length > 3
        ? '<div class="text-[10px] text-haze-500 px-1.5">+' + (list.length - 3) + ' more</div>' : '';

      cells +=
        '<div data-act="pick-day" data-day="' + key + '" class="cal-cell p-1.5 border-r border-b border-white/[0.05] cursor-pointer transition ' +
          (inMonth ? '' : 'opacity-35 ') +
          (selected ? 'bg-atlas-500/[0.07] ' : 'hover:bg-white/[0.02] ') + '">' +
          '<div class="flex items-center justify-between mb-1">' +
            '<span class="text-[11px] tabular-nums ' + (isToday ? 'h-5 w-5 grid place-items-center rounded-full bg-atlas-500 text-ink-950 font-semibold' : 'text-haze-500 px-0.5') + '">' + day.getDate() + '</span>' +
            (list.length ? '<span class="text-[10px] text-haze-600 tabular-nums">' + list.length + '</span>' : '') +
          '</div>' +
          '<div class="space-y-1">' + pills + overflow + '</div>' +
        '</div>';
    }

    var agenda = '';
    if (ctx.selectedDay && byDay[ctx.selectedDay]) {
      var dayItems = byDay[ctx.selectedDay].sort(function (a, b) { return new Date(a.dueAt) - new Date(b.dueAt); });
      agenda = '<div class="mt-4 space-y-2.5 animate-rise">' +
        dayHeading(new Date(dayItems[0].dueAt), now) +
        '<div class="space-y-2">' + dayItems.map(function (a) { return assignmentCard(a, now); }).join('') + '</div>' +
      '</div>';
    }

    host.innerHTML =
      '<div class="rounded-2xl bg-ink-900 ring-1 ring-white/[0.06] shadow-card overflow-hidden">' +
        '<div class="flex items-center gap-2 px-4 py-3 border-b border-white/[0.06]">' +
          '<h2 class="text-[14px] font-semibold text-slate-100 tracking-tight">' + esc(MONTH_FMT.format(cursor)) + '</h2>' +
          '<div class="flex-1"></div>' +
          '<button data-act="cal-today" class="h-8 px-2.5 rounded-lg text-[12px] text-haze-400 hover:text-slate-100 hover:bg-white/5 transition">Today</button>' +
          '<button data-act="cal-prev" class="h-8 w-8 rounded-lg grid place-items-center text-haze-400 hover:text-slate-100 hover:bg-white/5 transition">' + ICONS.chevL + '</button>' +
          '<button data-act="cal-next" class="h-8 w-8 rounded-lg grid place-items-center text-haze-400 hover:text-slate-100 hover:bg-white/5 transition">' + ICONS.chevR + '</button>' +
        '</div>' +
        /* Below ~600px the seven columns stop being readable, so the grid
           scrolls sideways inside the card instead of the page. */
        '<div class="overflow-x-auto"><div class="min-w-[560px]">' +
          '<div class="grid grid-cols-7 border-b border-white/[0.06]">' +
            WEEKDAYS.map(function (d) {
              return '<div class="px-2 py-2 text-[10.5px] font-medium uppercase tracking-[0.1em] text-haze-600 text-center">' + d + '</div>';
            }).join('') +
          '</div>' +
          '<div class="grid grid-cols-7 border-l border-t border-white/[0.05] -ml-px -mt-px">' + cells + '</div>' +
        '</div></div>' +
      '</div>' + agenda;
  }

  /* --------------------------------------------------------- view toggle */

  function renderViewToggle(ctx) {
    Array.prototype.forEach.call(document.querySelectorAll('.view-btn'), function (btn) {
      var on = btn.getAttribute('data-view') === ctx.view;
      btn.className = 'view-btn h-7 px-2.5 rounded-md text-[12px] font-medium inline-flex items-center gap-1.5 transition ' +
        (on ? 'bg-white/[0.07] text-slate-100' : 'text-haze-500 hover:text-slate-300');
    });
    $('#listView').classList.toggle('hidden', ctx.view !== 'list');
    $('#calendarView').classList.toggle('hidden', ctx.view !== 'calendar');
  }

  /* ------------------------------------------------------------ settings */

  function toggleRow(id, label, hint, on) {
    return '<button data-act="toggle-setting" data-key="' + id + '" class="w-full flex items-start gap-3 text-left group">' +
      '<span class="mt-0.5 h-5 w-9 shrink-0 rounded-full p-0.5 transition ' + (on ? 'bg-atlas-500' : 'bg-ink-700') + '">' +
        '<span class="block h-4 w-4 rounded-full bg-white transition-transform ' + (on ? 'translate-x-4' : '') + '"></span>' +
      '</span>' +
      '<span class="min-w-0">' +
        '<span class="block text-[13.5px] text-slate-200">' + esc(label) + '</span>' +
        '<span class="block text-[12px] text-haze-500 leading-snug mt-0.5">' + esc(hint) + '</span>' +
      '</span></button>';
  }

  var LEAD_CHOICES = [
    { mins: 10080, label: '1 week' },
    { mins: 2880, label: '2 days' },
    { mins: 1440, label: '1 day' },
    { mins: 360, label: '6 hours' },
    { mins: 60, label: '1 hour' },
    { mins: 15, label: '15 min' }
  ];

  function renderSettings() {
    var s = store.state.settings;
    var perm = notify.permission();

    var permBox =
      '<div class="rounded-xl bg-ink-850 ring-1 ring-white/[0.06] p-3.5 flex items-start gap-3">' +
        '<span class="mt-0.5 h-2 w-2 rounded-full ' + (perm === 'granted' ? 'bg-atlas-400' : perm === 'denied' ? 'bg-rose-400' : 'bg-amber-400') + '"></span>' +
        '<div class="min-w-0 flex-1">' +
          '<p class="text-[13px] text-slate-200">Browser permission: <span class="font-medium">' + esc(perm) + '</span></p>' +
          '<p class="text-[12px] text-haze-500 mt-0.5 leading-snug">' + esc(notify.statusText()) + '</p>' +
        '</div>' +
        (perm === 'granted'
          ? '<button data-act="test-notification" class="shrink-0 h-8 px-3 rounded-lg bg-ink-800 ring-1 ring-white/10 text-[12.5px] text-haze-200 hover:ring-white/20 transition">Send test</button>'
          : '<button data-act="enable-notifications" class="shrink-0 h-8 px-3 rounded-lg bg-atlas-500 text-ink-950 text-[12.5px] font-semibold hover:bg-atlas-400 transition">Enable</button>') +
      '</div>';

    var leads = '<div class="flex flex-wrap gap-1.5">' + LEAD_CHOICES.map(function (c) {
      var on = (s.leadTimes || []).indexOf(c.mins) !== -1;
      return '<button data-act="toggle-lead" data-mins="' + c.mins + '" class="h-8 px-3 rounded-lg text-[12.5px] font-medium transition ' +
        (on ? 'bg-atlas-500/15 text-atlas-200 ring-1 ring-atlas-500/30' : 'bg-ink-850 text-haze-400 ring-1 ring-white/[0.06] hover:text-slate-200') + '">' + c.label + '</button>';
    }).join('') + '</div>';

    $('#settingsBody').innerHTML =
      '<section class="space-y-3">' +
        '<h3 class="text-[11px] font-medium uppercase tracking-[0.13em] text-haze-500">Notifications</h3>' +
        permBox +
        toggleRow('notificationsEnabled', 'Deadline alerts', 'Master switch for every OS notification Atlas sends.', s.notificationsEnabled) +
        toggleRow('notifyOnNewAssignment', 'Alert on new ManageBac items', 'Fires the moment a sync finds work you have not seen.', s.notifyOnNewAssignment) +
        toggleRow('notifyOnOverdue', 'Alert when something goes overdue', 'One notice per assignment, within a day of the deadline passing.', s.notifyOnOverdue) +
      '</section>' +
      '<section class="space-y-2.5">' +
        '<h3 class="text-[11px] font-medium uppercase tracking-[0.13em] text-haze-500">Remind me before a deadline</h3>' +
        leads +
        '<p class="text-[12px] text-haze-500 leading-snug">Each assignment gets one alert per selected window.</p>' +
      '</section>' +
      '<section class="space-y-3">' +
        '<h3 class="text-[11px] font-medium uppercase tracking-[0.13em] text-haze-500">Quiet hours</h3>' +
        toggleRow('quietHours', 'Silence alerts overnight', 'Reminders are held back between the times below.', s.quietHours && s.quietHours.enabled) +
        '<div class="flex items-center gap-2 pl-12">' +
          '<input type="time" data-act="quiet-from" value="' + esc((s.quietHours || {}).from || '22:00') + '" class="atlas-input w-28" />' +
          '<span class="text-[12px] text-haze-500">to</span>' +
          '<input type="time" data-act="quiet-to" value="' + esc((s.quietHours || {}).to || '07:00') + '" class="atlas-input w-28" />' +
        '</div>' +
      '</section>' +
      '<section class="space-y-3">' +
        '<h3 class="text-[11px] font-medium uppercase tracking-[0.13em] text-haze-500">ManageBac</h3>' +
        toggleRow('autoSyncOnOpen', 'Sync when Atlas opens', 'Pulls the feed automatically each time you open the dashboard.', s.autoSyncOnOpen) +
        '<div class="rounded-xl bg-ink-850 ring-1 ring-white/[0.06] p-3.5">' +
          '<p class="text-[12.5px] text-haze-400 leading-relaxed">Running against the <span class="text-atlas-300">mock</span> transport. Student API access is restricted, so Atlas parses ManageBac-shaped records instead — swap <code class="text-atlas-300/80">Atlas.managebac.transport</code> for a live endpoint and nothing else changes.</p>' +
        '</div>' +
      '</section>';
  }

  /* --------------------------------------------------------------- toast */

  function toast(message, tone) {
    var host = $('#toasts');
    var tones = {
      ok:    'ring-atlas-500/30 text-atlas-200',
      info:  'ring-white/10 text-slate-200',
      warn:  'ring-amber-500/30 text-amber-200',
      error: 'ring-rose-500/30 text-rose-200'
    };
    var el = document.createElement('div');
    el.className = 'toast pointer-events-auto max-w-xs rounded-xl bg-ink-850/95 backdrop-blur ring-1 shadow-2xl px-3.5 py-2.5 text-[12.5px] leading-snug ' + (tones[tone] || tones.info);
    el.textContent = message;
    host.appendChild(el);
    setTimeout(function () {
      el.classList.add('leaving');
      setTimeout(function () { el.remove(); }, 220);
    }, 3600);
  }

  /* --------------------------------------------------------------- main */

  function renderAll(ctx) {
    renderSideNav(ctx);
    renderFilterChips(ctx);
    renderStats();
    renderManageBacBanner();
    renderViewToggle(ctx);
    if (ctx.view === 'calendar') renderCalendar(ctx); else renderList(ctx);
    renderSyncStatus();
    renderNotifStatus();
    renderCourseList();
  }

  function renderCourseList() {
    var dl = $('#courseList');
    if (dl) dl.innerHTML = store.courses().map(function (c) { return '<option value="' + esc(c) + '"></option>'; }).join('');
  }

  global.Atlas.ui = {
    renderAll: renderAll,
    renderSettings: renderSettings,
    renderNotifStatus: renderNotifStatus,
    renderSyncStatus: renderSyncStatus,
    toast: toast
  };
})(window);
