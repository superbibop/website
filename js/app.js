/* Atlas — wiring. Boots the app, owns view state, delegates every event. */
(function (global) {
  'use strict';

  var U = global.Atlas.util;
  var store = global.Atlas.store;
  var mb = global.Atlas.managebac;
  var notify = global.Atlas.notify;
  var ui = global.Atlas.ui;

  var $ = function (sel) { return document.querySelector(sel); };

  /* View state that does not belong in the store. */
  var ctx = {
    filter: 'upcoming',
    search: '',
    view: 'list',
    calMonth: null,
    selectedDay: null
  };

  var editingId = null;
  var syncing = false;

  function render() { ui.renderAll(ctx); }

  /* ------------------------------------------------------------- dialogs */

  function openDialog(el) { if (!el.open) el.showModal(); }
  function closeDialog(el) { if (el.open) el.close(); }

  function openEditor(id) {
    var dlg = $('#dlgEdit');
    var form = $('#formEdit');
    editingId = id || null;
    form.reset();

    if (id) {
      var a = store.byId(id);
      if (!a) return;
      store.markSeen(id);
      $('#editTitle').textContent = a.source === 'managebac' ? 'ManageBac assignment' : 'Edit assignment';
      form.title.value = a.title;
      form.course.value = a.course;
      form.type.value = a.type;
      var d = new Date(a.dueAt);
      form.dueDate.value = U.dateKey(d);
      form.dueTime.value = U.pad(d.getHours()) + ':' + U.pad(d.getMinutes());
      form.description.value = a.description || '';
      $('#btnDelete').classList.remove('hidden');
    } else {
      $('#editTitle').textContent = 'New assignment';
      form.dueDate.value = U.dateKey(U.addDays(new Date(), 1));
      form.dueTime.value = '23:59';
      $('#btnDelete').classList.add('hidden');
    }

    openDialog(dlg);
    setTimeout(function () { form.title.focus(); }, 40);
  }

  function saveEditor(e) {
    e.preventDefault();
    var form = $('#formEdit');
    var parts = form.dueDate.value.split('-');
    var time = form.dueTime.value.split(':');
    var due = new Date(+parts[0], +parts[1] - 1, +parts[2], +time[0] || 0, +time[1] || 0, 0);

    var patch = {
      title: form.title.value.trim() || 'Untitled',
      course: form.course.value.trim() || 'General',
      type: form.type.value,
      dueAt: due.toISOString(),
      description: form.description.value.trim()
    };

    if (editingId) {
      var prev = store.byId(editingId);
      /* Moving the deadline re-arms that assignment's reminders. */
      if (prev && prev.dueAt !== patch.dueAt) patch.notified = {};
      store.update(editingId, patch);
      ui.toast('Assignment updated', 'ok');
    } else {
      store.create(patch);
      ui.toast('Assignment added', 'ok');
    }

    editingId = null;
    closeDialog($('#dlgEdit'));
    afterDataChange();
  }

  /* ---------------------------------------------------------------- sync */

  function runSync(interactive) {
    if (syncing) return Promise.resolve();
    syncing = true;
    document.body.classList.add('syncing');

    /* The moment work arrives is exactly when asking for permission makes
       sense — so ask here, while the click that started the sync is still
       counted as user activation. */
    var permissionStep = interactive
      ? notify.ensurePermission(true).then(function () { ui.renderNotifStatus(); })
      : Promise.resolve();

    return permissionStep
      .then(function () { return mb.sync(); })
      .then(function (result) {
        var added = result.added.length;
        var moved = result.updated.filter(function (a) { return a._changedDue; }).length;

        if (added || moved) {
          var bits = [];
          if (added) bits.push(U.plural(added, 'new assignment'));
          if (moved) bits.push(U.plural(moved, 'deadline change'));
          ui.toast('ManageBac: ' + bits.join(' and '), 'ok');
          notify.announceSync(result);
        } else if (interactive) {
          ui.toast('ManageBac: already up to date', 'info');
        }

        afterDataChange();
        return result;
      })
      .catch(function (err) {
        console.error('[atlas] sync failed', err);
        ui.toast('Sync failed — ' + (err.message || 'unknown error'), 'error');
      })
      .then(function () {
        syncing = false;
        document.body.classList.remove('syncing');
      });
  }

  /** Re-render, re-check deadlines, and refresh the worker's copy. */
  function afterDataChange() {
    render();
    notify.runDeadlineCheck();
    notify.pushSnapshotToWorker();
  }

  /* -------------------------------------------------------------- import */

  function openImport() {
    $('#importMsg').textContent = '';
    $('#importMsg').className = 'text-[12px] text-haze-500 min-h-[18px]';
    openDialog($('#dlgImport'));
  }

  function doImport() {
    var msg = $('#importMsg');
    var raw = $('#importText').value.trim();
    if (!raw) {
      msg.textContent = 'Paste a feed, or choose a .json file.';
      msg.className = 'text-[12px] text-amber-300 min-h-[18px]';
      return;
    }
    var payload;
    try {
      payload = JSON.parse(raw);
    } catch (e) {
      msg.textContent = 'That is not valid JSON: ' + e.message;
      msg.className = 'text-[12px] text-rose-300 min-h-[18px]';
      return;
    }
    try {
      var result = mb.importPayload(payload);
      closeDialog($('#dlgImport'));
      $('#importText').value = '';
      ui.toast('Imported ' + U.plural(result.added.length, 'assignment') +
        (result.updated.length ? ', updated ' + result.updated.length : ''), 'ok');
      notify.announceSync(result);
      afterDataChange();
    } catch (e) {
      msg.textContent = e.message;
      msg.className = 'text-[12px] text-rose-300 min-h-[18px]';
    }
  }

  function readFile(file) {
    var reader = new FileReader();
    reader.onload = function () {
      $('#importText').value = String(reader.result);
      $('#importMsg').textContent = 'Loaded ' + file.name + '. Review it, then press Import.';
      $('#importMsg').className = 'text-[12px] text-haze-400 min-h-[18px]';
    };
    reader.readAsText(file);
  }

  /* ------------------------------------------------------------- actions */

  var actions = {
    'new': function () { openEditor(null); },
    'open': function (el) { openEditor(el.getAttribute('data-id')); },
    'toggle': function (el) {
      var a = store.toggleDone(el.getAttribute('data-id'));
      if (a) ui.toast(a.status === 'done' ? 'Nice — ' + a.title + ' done' : 'Marked as still to do', 'ok');
      afterDataChange();
    },
    'delete-current': function () {
      if (!editingId) return;
      store.remove(editingId);
      editingId = null;
      closeDialog($('#dlgEdit'));
      ui.toast('Assignment deleted', 'info');
      afterDataChange();
    },
    'filter': function (el) {
      ctx.filter = el.getAttribute('data-filter');
      store.setSettings({ filter: ctx.filter });
      render();
    },
    'mark-all-seen': function () { store.markSeen(); render(); },
    'sync': function () { runSync(true); },
    'import': openImport,
    'do-import': doImport,
    'pick-file': function () { $('#fileInput').click(); },
    'load-sample': function () {
      $('#importText').value = JSON.stringify(mb.SAMPLE_SHAPE, null, 2);
      $('#importMsg').textContent = 'This is the record shape Atlas parses. Edit it, then press Import.';
    },
    'settings': function () { ui.renderSettings(); openDialog($('#dlgSettings')); },
    'enable-notifications': function () {
      if (!notify.supported()) { ui.toast('This browser has no Notifications API.', 'warn'); return; }
      if (!notify.secureEnough()) { ui.toast('Notifications need https or localhost — run the local server.', 'warn'); return; }
      if (notify.permission() === 'denied') {
        ui.toast('Blocked by the browser. Re-allow Atlas in the padlock menu.', 'warn');
        return;
      }
      notify.ensurePermission(true).then(function (p) {
        ui.renderNotifStatus();
        ui.renderSettings();
        if (p === 'granted') {
          ui.toast('Desktop alerts are on', 'ok');
          notify.show({
            title: 'Atlas notifications are on',
            body: 'You will be alerted before every deadline, and whenever ManageBac has something new.',
            tag: 'atlas-welcome', force: true
          });
          notify.runDeadlineCheck();
          notify.pushSnapshotToWorker();
        } else {
          ui.toast('Permission not granted', 'warn');
        }
      });
    },
    'test-notification': function () {
      notify.testNotification().then(function (ok) {
        ui.toast(ok ? 'Test notification sent' : 'Could not send — check permission', ok ? 'ok' : 'warn');
      });
    },
    'toggle-setting': function (el) {
      var key = el.getAttribute('data-key');
      var s = store.state.settings;
      if (key === 'quietHours') {
        store.setSettings({ quietHours: Object.assign({}, s.quietHours, { enabled: !(s.quietHours && s.quietHours.enabled) }) });
      } else {
        var patch = {}; patch[key] = !s[key];
        store.setSettings(patch);
      }
      ui.renderSettings();
      notify.pushSnapshotToWorker();
    },
    'toggle-lead': function (el) {
      var mins = +el.getAttribute('data-mins');
      var leads = (store.state.settings.leadTimes || []).slice();
      var i = leads.indexOf(mins);
      if (i === -1) leads.push(mins); else leads.splice(i, 1);
      store.setSettings({ leadTimes: leads.sort(function (a, b) { return b - a; }) });
      ui.renderSettings();
      notify.pushSnapshotToWorker();
    },
    'reset-data': function () {
      if (!confirm('Delete every assignment and setting stored in this browser?')) return;
      store.resetAll();
      closeDialog($('#dlgSettings'));
      ui.toast('Atlas has been reset', 'info');
      ctx.filter = 'upcoming';
      afterDataChange();
    },
    'cal-prev': function () { shiftMonth(-1); },
    'cal-next': function () { shiftMonth(1); },
    'cal-today': function () { ctx.calMonth = null; ctx.selectedDay = U.dateKey(new Date()); render(); },
    'pick-day': function (el) {
      var day = el.getAttribute('data-day');
      ctx.selectedDay = ctx.selectedDay === day ? null : day;
      render();
    }
  };

  function shiftMonth(delta) {
    var base = ctx.calMonth ? new Date(ctx.calMonth) : new Date();
    ctx.calMonth = new Date(base.getFullYear(), base.getMonth() + delta, 1).toISOString();
    render();
  }

  /* -------------------------------------------------------------- events */

  function wire() {
    document.addEventListener('click', function (e) {
      var closer = e.target.closest('[data-close]');
      if (closer) {
        var dlg = closer.closest('dialog');
        if (dlg) { closeDialog(dlg); return; }
      }

      var el = e.target.closest('[data-act],[data-view]');
      if (!el) return;

      var view = el.getAttribute('data-view');
      if (view) {
        ctx.view = view;
        store.setSettings({ view: view });
        render();
        return;
      }

      var fn = actions[el.getAttribute('data-act')];
      if (fn) { e.preventDefault(); fn(el, e); }
    });

    $('#formEdit').addEventListener('submit', saveEditor);

    $('#search').addEventListener('input', U.debounce(function (e) {
      ctx.search = e.target.value;
      render();
    }, 140));

    $('#fileInput').addEventListener('change', function (e) {
      if (e.target.files && e.target.files[0]) readFile(e.target.files[0]);
      e.target.value = '';
    });

    $('#settingsBody').addEventListener('change', function (e) {
      var act = e.target.getAttribute('data-act');
      if (act !== 'quiet-from' && act !== 'quiet-to') return;
      var q = Object.assign({}, store.state.settings.quietHours);
      q[act === 'quiet-from' ? 'from' : 'to'] = e.target.value;
      store.setSettings({ quietHours: q });
      notify.pushSnapshotToWorker();
    });

    /* Drag a ManageBac export anywhere onto the import dialog. */
    var importDlg = $('#dlgImport');
    ['dragover', 'drop'].forEach(function (type) {
      importDlg.addEventListener(type, function (e) {
        e.preventDefault();
        if (type === 'drop' && e.dataTransfer.files[0]) readFile(e.dataTransfer.files[0]);
      });
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') return;
      var typing = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName);
      if (typing || e.metaKey || e.ctrlKey || e.altKey) return;

      if (e.key === 'n') { e.preventDefault(); openEditor(null); }
      else if (e.key === '/') { e.preventDefault(); $('#search').focus(); }
      else if (e.key === 's') { e.preventDefault(); runSync(true); }
      else if (e.key === 'c') { e.preventDefault(); ctx.view = ctx.view === 'calendar' ? 'list' : 'calendar'; store.setSettings({ view: ctx.view }); render(); }
    });

    /* Keep relative times ("Due in 3h") honest without a full re-render storm. */
    setInterval(function () {
      if (!document.hidden) render();
    }, 60 * 1000);

    /* Another tab changed the data — pick it up. */
    global.addEventListener('storage', function (e) {
      if (e.key && e.key.indexOf('atlas.') === 0) { store.load(); render(); }
    });

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('message', function (e) {
        if (e.data && e.data.type === 'atlas:focus' && e.data.id) openEditor(e.data.id);
      });
    }
  }

  /* ---------------------------------------------------------------- boot */

  function boot() {
    store.load();

    ctx.filter = store.state.settings.filter || 'upcoming';
    ctx.view = store.state.settings.view || 'list';

    wire();
    render();

    notify.registerServiceWorker().then(function () {
      notify.startScheduler();
      notify.pushSnapshotToWorker();
      ui.renderNotifStatus();
    });

    /* Opened straight from a notification: jump to that assignment. */
    var m = /#a=([\w-]+)/.exec(location.hash);
    if (m) setTimeout(function () { openEditor(m[1]); }, 120);

    /* First run, or auto-sync enabled: pull the ManageBac feed. */
    var firstRun = !store.state.lastSyncAt;
    if (firstRun || store.state.settings.autoSyncOnOpen) {
      runSync(false).then(function () {
        if (firstRun && notify.permission() === 'default' && notify.supported() && notify.secureEnough()) {
          ui.toast('Turn on desktop alerts to be told about new deadlines', 'info');
        }
      });
    }

    store.subscribe(function () { ui.renderSyncStatus(); });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  global.Atlas.app = { ctx: ctx, render: render, sync: runSync };
})(window);
