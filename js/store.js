/* Atlas — state, persistence and selectors.
 *
 * Everything lives in localStorage under two keys. The store is deliberately
 * dumb: it holds data and emits a 'change' event; rendering lives in ui.js.
 */
(function (global) {
  'use strict';

  var U = global.Atlas.util;

  var KEY_DATA = 'atlas.data.v1';
  var KEY_SETTINGS = 'atlas.settings.v1';

  var DEFAULT_SETTINGS = {
    notificationsEnabled: true,
    /* Minutes before the deadline at which to fire a reminder. */
    leadTimes: [1440, 60],
    notifyOnNewAssignment: true,
    notifyOnOverdue: true,
    autoSyncOnOpen: true,
    syncIntervalMinutes: 15,
    view: 'list',
    filter: 'upcoming',
    quietHours: { enabled: false, from: '22:00', to: '07:00' }
  };

  var state = {
    assignments: [],
    lastSyncAt: null,
    syncCursor: 0,        // how far through the mock ManageBac feed we have read
    settings: Object.assign({}, DEFAULT_SETTINGS)
  };

  var listeners = [];

  /* ------------------------------------------------------------- persist */

  function load() {
    try {
      var raw = localStorage.getItem(KEY_DATA);
      if (raw) {
        var parsed = JSON.parse(raw);
        state.assignments = Array.isArray(parsed.assignments) ? parsed.assignments.map(migrate) : [];
        state.lastSyncAt = parsed.lastSyncAt || null;
        state.syncCursor = parsed.syncCursor || 0;
      }
    } catch (e) {
      console.warn('[atlas] could not read saved assignments, starting fresh', e);
      state.assignments = [];
    }
    try {
      var s = localStorage.getItem(KEY_SETTINGS);
      if (s) state.settings = Object.assign({}, DEFAULT_SETTINGS, JSON.parse(s));
    } catch (e) {
      console.warn('[atlas] could not read settings, using defaults', e);
    }
    return state;
  }

  function save() {
    try {
      localStorage.setItem(KEY_DATA, JSON.stringify({
        assignments: state.assignments,
        lastSyncAt: state.lastSyncAt,
        syncCursor: state.syncCursor
      }));
      localStorage.setItem(KEY_SETTINGS, JSON.stringify(state.settings));
    } catch (e) {
      console.warn('[atlas] could not save (storage full or blocked)', e);
    }
  }

  /** Fill in fields added after an assignment was first stored. */
  function migrate(a) {
    a.notified = a.notified || {};
    a.status = a.status === 'done' ? 'done' : 'todo';
    a.source = a.source || 'manual';
    a.type = a.type || 'homework';
    if (typeof a.isNew !== 'boolean') a.isNew = false;
    return a;
  }

  function emit() {
    save();
    listeners.forEach(function (fn) {
      try { fn(state); } catch (e) { console.error('[atlas] listener failed', e); }
    });
  }

  function subscribe(fn) {
    listeners.push(fn);
    return function () { listeners = listeners.filter(function (f) { return f !== fn; }); };
  }

  /* ----------------------------------------------------------------- CRUD */

  function create(partial) {
    var now = new Date().toISOString();
    var a = Object.assign({
      id: U.uid('as'),
      title: 'Untitled',
      course: 'General',
      courseCode: '',
      type: 'homework',
      dueAt: now,
      assignedAt: now,
      description: '',
      source: 'manual',
      externalId: null,
      points: null,
      labels: [],
      status: 'todo',
      isNew: false,
      notified: {},
      createdAt: now,
      updatedAt: now
    }, partial);
    state.assignments.push(a);
    emit();
    return a;
  }

  function update(id, patch) {
    var a = byId(id);
    if (!a) return null;
    Object.assign(a, patch, { updatedAt: new Date().toISOString() });
    emit();
    return a;
  }

  function remove(id) {
    state.assignments = state.assignments.filter(function (a) { return a.id !== id; });
    emit();
  }

  function byId(id) {
    for (var i = 0; i < state.assignments.length; i++) {
      if (state.assignments[i].id === id) return state.assignments[i];
    }
    return null;
  }

  function byExternalId(externalId) {
    if (!externalId) return null;
    for (var i = 0; i < state.assignments.length; i++) {
      if (state.assignments[i].externalId === externalId) return state.assignments[i];
    }
    return null;
  }

  function toggleDone(id) {
    var a = byId(id);
    if (!a) return null;
    return update(id, { status: a.status === 'done' ? 'todo' : 'done', isNew: false });
  }

  /** Clear the "new from ManageBac" flag — on one item, or on all of them. */
  function markSeen(id) {
    if (id) { update(id, { isNew: false }); return; }
    var touched = false;
    state.assignments.forEach(function (a) {
      if (a.isNew) { a.isNew = false; touched = true; }
    });
    if (touched) emit();
  }

  /** Record that a given reminder has fired, so it never fires twice. */
  function markNotified(id, kind) {
    var a = byId(id);
    if (!a) return;
    a.notified[kind] = true;
    save();
  }

  /* ------------------------------------------------------------ selectors */

  function all() { return state.assignments.slice(); }

  function newFromManageBac() {
    return state.assignments.filter(function (a) { return a.isNew && a.source === 'managebac'; })
      .sort(bySoonest);
  }

  function bySoonest(a, b) {
    return new Date(a.dueAt) - new Date(b.dueAt);
  }

  var FILTERS = {
    /* "Upcoming" is every open assignment, overdue included — urgency sorting
       floats the late work to the top rather than hiding it. */
    upcoming: { label: 'Upcoming', test: function (a) { return a.status !== 'done'; } },
    today:    { label: 'Today',    test: function (a, now) { return a.status !== 'done' && U.daysUntil(a.dueAt, now) === 0; } },
    week:     { label: 'This week', test: function (a, now) { var d = U.daysUntil(a.dueAt, now); return a.status !== 'done' && d >= 0 && d <= 7; } },
    overdue:  { label: 'Overdue',  test: function (a, now) { return a.status !== 'done' && new Date(a.dueAt) < now; } },
    done:     { label: 'Completed', test: function (a) { return a.status === 'done'; } },
    all:      { label: 'All',      test: function () { return true; } }
  };

  /** The list the dashboard renders: filter + search + sorted by urgency. */
  function query(opts) {
    opts = opts || {};
    var now = opts.now || new Date();
    var filter = FILTERS[opts.filter] ? opts.filter : 'upcoming';
    var term = (opts.search || '').trim().toLowerCase();

    return state.assignments
      .filter(function (a) { return FILTERS[filter].test(a, now); })
      .filter(function (a) {
        if (!term) return true;
        return (a.title + ' ' + a.course + ' ' + (a.description || '') + ' ' + (a.labels || []).join(' '))
          .toLowerCase().indexOf(term) !== -1;
      })
      .sort(function (a, b) {
        var ua = U.URGENCY[U.urgency(a, now)].rank;
        var ub = U.URGENCY[U.urgency(b, now)].rank;
        if (ua !== ub) return ua - ub;
        return bySoonest(a, b);
      });
  }

  function counts(now) {
    now = now || new Date();
    var c = { overdue: 0, today: 0, week: 0, upcoming: 0, done: 0, all: state.assignments.length, newCount: 0 };
    state.assignments.forEach(function (a) {
      if (a.status === 'done') { c.done++; return; }
      var d = U.daysUntil(a.dueAt, now);
      c.upcoming++;
      if (new Date(a.dueAt) < now) c.overdue++;
      if (d === 0) c.today++;
      if (d >= 0 && d <= 7) c.week++;
      if (a.isNew) c.newCount++;
    });
    return c;
  }

  function courses() {
    var seen = {};
    state.assignments.forEach(function (a) { if (a.course) seen[a.course] = true; });
    return Object.keys(seen).sort();
  }

  /** Group a list by due-day for the list view. */
  function groupByDay(list, now) {
    now = now || new Date();
    var groups = [];
    var index = {};
    list.forEach(function (a) {
      var key = U.dateKey(a.dueAt);
      if (!index[key]) {
        index[key] = { key: key, date: new Date(a.dueAt), items: [] };
        groups.push(index[key]);
      }
      index[key].items.push(a);
    });
    return groups;
  }

  function setSettings(patch) {
    state.settings = Object.assign({}, state.settings, patch);
    emit();
  }

  function resetAll() {
    localStorage.removeItem(KEY_DATA);
    localStorage.removeItem(KEY_SETTINGS);
    state.assignments = [];
    state.lastSyncAt = null;
    state.syncCursor = 0;
    state.settings = Object.assign({}, DEFAULT_SETTINGS);
    emit();
  }

  global.Atlas.store = {
    state: state,
    DEFAULT_SETTINGS: DEFAULT_SETTINGS,
    FILTERS: FILTERS,
    load: load, save: save, emit: emit, subscribe: subscribe,
    create: create, update: update, remove: remove,
    byId: byId, byExternalId: byExternalId,
    toggleDone: toggleDone, markSeen: markSeen, markNotified: markNotified,
    all: all, query: query, counts: counts, courses: courses,
    groupByDay: groupByDay, newFromManageBac: newFromManageBac,
    setSettings: setSettings, resetAll: resetAll
  };
})(window);
