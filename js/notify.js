/* Atlas — native OS notifications.
 *
 * Two delivery paths, picked automatically:
 *   1. Through the service worker registration (`showNotification`) — this is
 *      what puts the toast in the Windows Action Center / macOS Notification
 *      Centre with working buttons, and it survives the tab being backgrounded.
 *   2. `new Notification(...)` directly — the fallback when no service worker
 *      is available (e.g. the page was opened straight from disk over file://).
 *
 * Reminders are scheduled in-page: a ticker re-checks every deadline once a
 * minute, and again whenever the tab regains focus, so re-opening the laptop
 * fires anything that came due while it was asleep. Installed as a PWA in
 * Chrome/Edge, Periodic Background Sync also wakes the worker with the app
 * fully closed (see sw.js).
 */
(function (global) {
  'use strict';

  var U = global.Atlas.util;
  var store = global.Atlas.store;

  var swReg = null;
  var ticker = null;
  var handlers = { onChange: function () {} };

  var ICON = 'assets/icon.svg';

  /* --------------------------------------------------------- capability */

  function supported() { return 'Notification' in global; }

  function permission() {
    return supported() ? Notification.permission : 'unsupported';
  }

  /** Insecure origins (plain http on a non-localhost host) block notifications. */
  function secureEnough() {
    return global.isSecureContext || location.hostname === 'localhost' || location.hostname === '127.0.0.1';
  }

  function statusText() {
    if (!supported()) return 'Not supported in this browser.';
    if (!secureEnough()) return 'Needs https or localhost. Run the local server.';
    switch (Notification.permission) {
      case 'granted': return 'On — deadline alerts will appear in your action center.';
      case 'denied':  return 'Blocked. Re-allow it in the padlock menu of the address bar.';
      default:        return 'Off — click to allow desktop alerts.';
    }
  }

  /* ------------------------------------------------------ service worker */

  function registerServiceWorker() {
    if (!('serviceWorker' in navigator) || location.protocol === 'file:') {
      return Promise.resolve(null);
    }
    return navigator.serviceWorker.register('sw.js', { scope: './' })
      .then(function (reg) {
        swReg = reg;
        requestPeriodicSync(reg);
        return reg;
      })
      .catch(function (err) {
        console.warn('[atlas] service worker registration failed; using in-page notifications', err);
        return null;
      });
  }

  /**
   * Chrome/Edge only, and only once the app is installed: lets the worker wake
   * up on a schedule and check deadlines with every tab closed.
   */
  function requestPeriodicSync(reg) {
    if (!reg || !('periodicSync' in reg)) return;
    navigator.permissions.query({ name: 'periodic-background-sync' })
      .then(function (status) {
        if (status.state !== 'granted') return;
        return reg.periodicSync.register('atlas-deadline-check', {
          minInterval: 60 * 60 * 1000
        });
      })
      .catch(function () { /* not installed, or unsupported — expected */ });
  }

  /* ---------------------------------------------------------- permission */

  /**
   * @param {boolean} interactive true when called straight from a click, which
   *        is when browsers are willing to show the permission prompt.
   */
  function ensurePermission(interactive) {
    if (!supported() || !secureEnough()) return Promise.resolve(permission());
    if (Notification.permission !== 'default') return Promise.resolve(Notification.permission);
    if (!interactive) return Promise.resolve('default');

    return Notification.requestPermission().then(function (result) {
      handlers.onChange(result);
      return result;
    }).catch(function () { return Notification.permission; });
  }

  /* -------------------------------------------------------------- quiet */

  function toMinutes(hhmm) {
    var p = String(hhmm || '').split(':');
    return (+p[0] || 0) * 60 + (+p[1] || 0);
  }

  function inQuietHours(now) {
    var q = store.state.settings.quietHours;
    if (!q || !q.enabled) return false;
    var n = now || new Date();
    var mins = n.getHours() * 60 + n.getMinutes();
    var from = toMinutes(q.from), to = toMinutes(q.to);
    return from <= to ? (mins >= from && mins < to) : (mins >= from || mins < to);
  }

  /* --------------------------------------------------------------- show */

  /**
   * Fire one OS notification.
   * @param {{title:string, body:string, tag:string, data?:object, requireInteraction?:boolean, force?:boolean}} opts
   */
  function show(opts) {
    if (!supported() || permission() !== 'granted') return Promise.resolve(false);
    if (!opts.force && !store.state.settings.notificationsEnabled) return Promise.resolve(false);
    if (!opts.force && inQuietHours()) return Promise.resolve(false);

    var payload = {
      body: opts.body || '',
      icon: ICON,
      badge: ICON,
      tag: opts.tag || U.uid('n'),
      renotify: true,
      requireInteraction: !!opts.requireInteraction,
      silent: false,
      timestamp: Date.now(),
      data: Object.assign({ url: location.href.split('#')[0] }, opts.data || {})
    };

    if (swReg && swReg.showNotification) {
      if (Array.isArray(opts.actions) && opts.actions.length) payload.actions = opts.actions;
      return swReg.showNotification(opts.title, payload)
        .then(function () { return true; })
        .catch(function (e) { console.warn('[atlas] showNotification failed', e); return fallbackShow(opts, payload); });
    }
    return Promise.resolve(fallbackShow(opts, payload));
  }

  function fallbackShow(opts, payload) {
    try {
      var n = new Notification(opts.title, payload);
      n.onclick = function () { global.focus(); n.close(); };
      return true;
    } catch (e) {
      console.warn('[atlas] notification failed', e);
      return false;
    }
  }

  /* ------------------------------------------------- sync announcements */

  /** Announce what a ManageBac sync brought in. */
  function announceSync(result) {
    if (!store.state.settings.notifyOnNewAssignment) return Promise.resolve(false);

    var added = result.added || [];
    var movedDeadlines = (result.updated || []).filter(function (a) { return a._changedDue; });
    if (!added.length && !movedDeadlines.length) return Promise.resolve(false);

    var title, body;

    if (added.length === 1 && !movedDeadlines.length) {
      var a = added[0];
      title = 'New from ManageBac — ' + a.course;
      body = a.title + '\n' + U.relativeDue(a.dueAt);
    } else {
      var bits = [];
      if (added.length) bits.push(U.plural(added.length, 'new assignment'));
      if (movedDeadlines.length) bits.push(U.plural(movedDeadlines.length, 'changed deadline'));
      title = 'New from ManageBac';
      body = bits.join(' · ') + '\n' +
        added.concat(movedDeadlines).slice(0, 3).map(function (x) {
          return '• ' + x.title + ' — ' + U.relativeDue(x.dueAt);
        }).join('\n');
    }

    return show({
      title: title,
      body: body,
      tag: 'atlas-sync',
      requireInteraction: true,
      data: { kind: 'sync' },
      actions: [{ action: 'open', title: 'Open Atlas' }]
    });
  }

  /* --------------------------------------------------- deadline reminders */

  /**
   * Walk every open assignment and fire whichever reminders are now due.
   * Each reminder is stamped on the assignment so it can only ever fire once.
   */
  function runDeadlineCheck() {
    if (permission() !== 'granted' || !store.state.settings.notificationsEnabled) return 0;

    var now = new Date();
    /* Ascending, so the tightest window wins when several are open at once. */
    var leads = (store.state.settings.leadTimes || []).slice().sort(function (a, b) { return a - b; });
    var fired = 0;

    store.all().forEach(function (a) {
      if (a.status === 'done') return;
      var due = new Date(a.dueAt);
      var msLeft = due - now;

      /* Overdue notice — once, and only within a day of the deadline passing. */
      if (msLeft < 0) {
        if (store.state.settings.notifyOnOverdue && !a.notified.overdue && msLeft > -U.DAY) {
          store.markNotified(a.id, 'overdue');
          show({
            title: 'Overdue — ' + a.course,
            body: a.title + '\n' + U.relativeDue(a.dueAt, now),
            tag: 'atlas-overdue-' + a.id,
            requireInteraction: true,
            data: { kind: 'overdue', id: a.id }
          });
          fired++;
        }
        return;
      }

      /* Several windows can be open at once — say, when Atlas is first opened
         on work due in 30 minutes. Alert with the tightest one, and retire the
         wider windows silently so they cannot fire late. */
      var toFire = null;
      for (var i = 0; i < leads.length; i++) {
        var lead = leads[i];
        if (msLeft > lead * U.MIN) continue;          // window not open yet
        var key = 'lead_' + lead;
        if (a.notified[key]) continue;                // already handled
        if (toFire === null) toFire = lead;           // smallest open window
        store.markNotified(a.id, key);
      }

      if (toFire !== null) {
        show({
          title: leadLabel(toFire) + ' — ' + a.course,
          body: a.title + '\n' + U.relativeDue(a.dueAt, now),
          tag: 'atlas-lead-' + a.id + '-' + toFire,
          requireInteraction: toFire <= 60,
          data: { kind: 'reminder', id: a.id }
        });
        fired++;
      }
    });

    return fired;
  }

  function leadLabel(mins) {
    if (mins >= 1440) return 'Due in ' + Math.round(mins / 1440) + (mins >= 2880 ? ' days' : ' day');
    if (mins >= 60) return 'Due in ' + Math.round(mins / 60) + (mins >= 120 ? ' hours' : ' hour');
    return 'Due in ' + mins + ' min';
  }

  /* ------------------------------------------------------------ lifecycle */

  function startScheduler() {
    stopScheduler();
    runDeadlineCheck();
    ticker = setInterval(runDeadlineCheck, 60 * 1000);

    /* Catch up after the laptop was asleep or the tab was in the background. */
    document.addEventListener('visibilitychange', function () {
      if (!document.hidden) runDeadlineCheck();
    });
    global.addEventListener('focus', runDeadlineCheck);
    global.addEventListener('online', runDeadlineCheck);
  }

  function stopScheduler() {
    if (ticker) clearInterval(ticker);
    ticker = null;
  }

  /** Hand the worker a snapshot so it can alert while every tab is closed. */
  function pushSnapshotToWorker() {
    if (!swReg || !navigator.serviceWorker.controller) return;
    var upcoming = store.all()
      .filter(function (a) { return a.status !== 'done'; })
      .map(function (a) {
        return { id: a.id, title: a.title, course: a.course, dueAt: a.dueAt, notified: a.notified };
      });
    navigator.serviceWorker.controller.postMessage({
      type: 'atlas:snapshot',
      assignments: upcoming,
      settings: store.state.settings
    });
  }

  function testNotification() {
    return ensurePermission(true).then(function (p) {
      if (p !== 'granted') return false;
      return show({
        title: 'Atlas is watching your deadlines',
        body: 'This is what a deadline alert looks like. You will get one before every due date.',
        tag: 'atlas-test',
        force: true,
        data: { kind: 'test' }
      });
    });
  }

  global.Atlas.notify = {
    supported: supported,
    secureEnough: secureEnough,
    permission: permission,
    statusText: statusText,
    registerServiceWorker: registerServiceWorker,
    ensurePermission: ensurePermission,
    show: show,
    announceSync: announceSync,
    runDeadlineCheck: runDeadlineCheck,
    startScheduler: startScheduler,
    stopScheduler: stopScheduler,
    pushSnapshotToWorker: pushSnapshotToWorker,
    testNotification: testNotification,
    inQuietHours: inQuietHours,
    onChange: function (fn) { handlers.onChange = fn; }
  };
})(window);
