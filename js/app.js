/* Atlas — wiring. Boots the app, owns view state, delegates every event. */
(function (global) {
  'use strict';

  var U = global.Atlas.util;
  var store = global.Atlas.store;
  var importer = global.Atlas.importer;
  var files = global.Atlas.files;
  var assistant = global.Atlas.assistant;
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

  function render() { ui.renderAll(ctx); }

  /* ------------------------------------------------------------- dialogs */

  function openDialog(el) { if (!el.open) el.showModal(); }
  function closeDialog(el) { if (el.open) el.close(); }

  /** A date + "HH:MM" pair from the form, as a Date. Empty fields -> null. */
  function formDate(dateVal, timeVal) {
    if (!dateVal) return null;
    var parts = dateVal.split('-');
    var t = String(timeVal || '').split(':');
    return new Date(+parts[0], +parts[1] - 1, +parts[2], +t[0] || 0, +t[1] || 0, 0);
  }

  function dateParts(iso) {
    var d = iso ? new Date(iso) : null;
    if (!d || isNaN(d.getTime())) return { date: '', time: '' };
    return {
      date: U.dateKey(d),
      time: U.pad(d.getHours()) + ':' + U.pad(d.getMinutes())
    };
  }

  function openEditor(id) {
    var dlg = $('#dlgEdit');
    var form = $('#formEdit');
    editingId = id || null;
    form.reset();

    if (id) {
      var a = store.byId(id);
      if (!a) return;
      $('#editTitle').textContent = 'Edit task';
      form.title.value = a.title;
      form.course.value = a.course;
      form.type.value = a.type;

      var start = dateParts(a.assignedAt);
      form.startDate.value = start.date;
      form.startTime.value = start.time;

      var due = dateParts(a.dueAt);
      form.dueDate.value = due.date;
      form.dueTime.value = due.time;

      form.description.value = a.description || '';
      form.points.value = (a.points != null && !isNaN(a.points)) ? a.points : '';
      form.labels.value = (a.labels || []).join(', ');
      $('#btnDelete').classList.remove('hidden');
    } else {
      $('#editTitle').textContent = 'Add Task';
      form.dueDate.value = U.dateKey(U.addDays(new Date(), 1));
      form.dueTime.value = '23:59';
      form.startDate.value = U.dateKey(new Date());
      $('#btnDelete').classList.add('hidden');
    }

    openDialog(dlg);
    setTimeout(function () { form.title.focus(); }, 40);
  }

  function saveEditor(e) {
    e.preventDefault();
    var form = $('#formEdit');
    var due = formDate(form.dueDate.value, form.dueTime.value);
    if (!due) { ui.toast('Pick a due date', 'warn'); return; }

    var start = formDate(form.startDate.value, form.startTime.value);
    var points = form.points.value.trim();

    var patch = {
      title: form.title.value.trim() || 'Untitled',
      course: form.course.value.trim() || 'General',
      type: form.type.value,
      dueAt: due.toISOString(),
      assignedAt: (start || new Date()).toISOString(),
      description: form.description.value.trim(),
      points: points === '' ? null : Number(points),
      labels: form.labels.value.split(',').map(function (s) { return s.trim(); })
        .filter(Boolean).slice(0, 4)
    };

    if (editingId) {
      var prev = store.byId(editingId);
      /* Moving the deadline re-arms that assignment's reminders. */
      if (prev && prev.dueAt !== patch.dueAt) patch.notified = {};
      store.update(editingId, patch);
      ui.toast('Task updated', 'ok');
    } else {
      store.create(patch);
      ui.toast('Task added', 'ok');
    }

    editingId = null;
    closeDialog($('#dlgEdit'));
    afterDataChange();
  }

  /** Re-render, re-check deadlines, and refresh the worker's copy. */
  function afterDataChange() {
    render();
    notify.runDeadlineCheck();
    notify.pushSnapshotToWorker();
  }

  /* -------------------------------------------------------------- import */

  var importedFiles = [];         // files read but not yet acted on

  function importMessage(text, tone) {
    var tones = { error: 'text-rose-300', warn: 'text-amber-300', ok: 'text-atlas-300', info: 'text-haze-400' };
    var msg = $('#importMsg');
    msg.textContent = text;
    msg.className = 'text-[12px] min-h-[18px] ' + (tones[tone] || 'text-haze-500');
  }

  function openImport() {
    importMessage('');
    openDialog($('#dlgImport'));
  }

  /** Read whatever was dropped or chosen, and offer the right action for each. */
  function acceptFiles(fileList) {
    if (!fileList || !fileList.length) return;
    importMessage('Reading ' + U.plural(fileList.length, 'file') + '…', 'info');

    files.readAll(fileList).then(function (records) {
      importedFiles = records;
      ui.renderImportFiles(importedFiles);

      var usable = records.filter(function (r) { return !r.error; });
      var feeds = usable.filter(function (r) { return r.kind === 'feed' || r.kind === 'table'; });

      importMessage(
        !usable.length ? 'None of those could be read.'
          : feeds.length === usable.length ? 'Ready to turn into assignments.'
          : feeds.length ? 'Feeds can become assignments; the rest can go to the assistant.'
          : 'These are not assignment feeds — send them to the assistant to have the questions explained.',
        usable.length ? 'info' : 'error'
      );
    });
  }

  function doImport() {
    var raw = $('#importText').value.trim();
    if (!raw) { importMessage('Paste a feed, or choose a file above.', 'warn'); return; }

    var payload;
    try {
      payload = JSON.parse(raw);
    } catch (e) {
      importMessage('That is not valid JSON: ' + e.message, 'error');
      return;
    }
    try {
      var result = importer.importPayload(payload);
      closeDialog($('#dlgImport'));
      $('#importText').value = '';
      ui.toast('Imported ' + U.plural(result.added.length, 'task') +
        (result.updated.length ? ', updated ' + result.updated.length : ''), 'ok');
      afterDataChange();
    } catch (e) {
      importMessage(e.message, 'error');
    }
  }

  /* ----------------------------------------------------------- assistant */

  var assistantFiles = [];        // staged attachments for the next question
  var assistantOpen = false;

  function openAssistant(prefill) {
    assistantOpen = true;
    ui.setAssistantOpen(true);
    ui.renderAssistantThread();
    ui.renderAssistantEngine();
    if (prefill) {
      var input = $('#assistantInput');
      input.value = prefill;
      input.dispatchEvent(new Event('input'));
    }
  }

  function closeAssistant() {
    assistantOpen = false;
    ui.setAssistantOpen(false);
  }

  function stageFiles(records) {
    records.forEach(function (r) {
      if (r.error) { ui.toast(r.error, 'error'); return; }
      if (assistantFiles.length >= 5) { ui.toast('Five attachments at a time is the limit.', 'warn'); return; }
      assistantFiles.push(r);
    });
    ui.renderAssistantFiles(assistantFiles);
    updateSendState();
  }

  function updateSendState() {
    var btn = $('#assistantSend');
    if (!btn) return;
    var hasInput = $('#assistantInput').value.trim() || assistantFiles.length;
    btn.disabled = !hasInput || assistant.state.busy;
  }

  function sendToAssistant() {
    var input = $('#assistantInput');
    var question = input.value.trim();
    if (!question && !assistantFiles.length) return;

    var files = assistantFiles.slice();
    assistantFiles = [];
    input.value = '';
    ui.renderAssistantFiles(assistantFiles);
    ui.renderAssistantThread();
    updateSendState();

    var live = ui.beginAssistantReply();

    assistant.ask({ question: question, attachments: files }, {
      onDelta: function (chunk, full) { ui.updateAssistantReply(live, full); },
      onDone: function (full, meta) {
        ui.renderAssistantThread();
        updateSendState();
        if (meta.degradedFrom) ui.toast('Claude was unreachable — answered offline instead.', 'warn');
      },
      onError: function (err) {
        ui.updateAssistantReply(live, '**Could not explain that.**\n\n' + err.message);
        updateSendState();
      }
    });
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
      ui.toast('Task deleted', 'info');
      afterDataChange();
    },
    'filter': function (el) {
      ctx.filter = el.getAttribute('data-filter');
      store.setSettings({ filter: ctx.filter });
      render();
    },
    'import': openImport,
    'do-import': doImport,
    'pick-file': function () { $('#fileInput').click(); },
    'load-sample': function () {
      $('#importText').value = JSON.stringify(importer.SAMPLE_SHAPE, null, 2);
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
            body: 'You will be alerted before every deadline.',
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
    /* -------------------------------------------------------- assistant */

    'assistant': function () { if (assistantOpen) closeAssistant(); else openAssistant(); },
    'close-assistant': closeAssistant,
    'assistant-send': sendToAssistant,
    'assistant-attach': function () { $('#assistantFileInput').click(); },
    'assistant-drop-file': function (el) {
      assistantFiles.splice(+el.getAttribute('data-index'), 1);
      ui.renderAssistantFiles(assistantFiles);
      updateSendState();
    },
    'clear-thread': function () {
      assistant.clearThread();
      assistantFiles = [];
      ui.renderAssistantFiles(assistantFiles);
      ui.renderAssistantThread();
      updateSendState();
    },
    /* Ask about an assignment straight from its card. */
    'explain-assignment': function (el) {
      var a = store.byId(el.getAttribute('data-id'));
      if (!a) return;
      openAssistant([a.title, a.description].filter(Boolean).join('\n\n'));
    },

    /* ------------------------------------------------------ file import */

    'import-file-assignments': function (el) {
      var entry = importedFiles[+el.getAttribute('data-index')];
      if (!entry) return;
      try {
        var payload = entry.kind === 'table'
          ? files.tableToFeed(entry.text)
          : JSON.parse(entry.text);
        var result = importer.importPayload(payload);
        closeDialog($('#dlgImport'));
        importedFiles = [];
        ui.renderImportFiles(importedFiles);
        ui.toast('Imported ' + U.plural(result.added.length, 'task') +
          (result.updated.length ? ', updated ' + result.updated.length : '') + ' from ' + entry.name, 'ok');
        afterDataChange();
      } catch (err) {
        importMessage(err.message, 'error');
      }
    },
    'import-file-assistant': function (el) {
      var entry = importedFiles[+el.getAttribute('data-index')];
      if (!entry) return;
      closeDialog($('#dlgImport'));
      stageFiles([entry]);
      openAssistant();
      ui.toast('Attached ' + entry.name + ' — add a question or just press Explain.', 'info');
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
      acceptFiles(e.target.files);
      e.target.value = '';
    });

    $('#assistantFileInput').addEventListener('change', function (e) {
      files.readAll(e.target.files).then(stageFiles);
      e.target.value = '';
    });

    $('#assistantInput').addEventListener('input', updateSendState);
    $('#assistantInput').addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); sendToAssistant(); }
    });

    /* Paste a screenshot straight into the assistant. */
    $('#assistantInput').addEventListener('paste', function (e) {
      var items = Array.prototype.slice.call((e.clipboardData || {}).items || []);
      var imgs = items.filter(function (i) { return i.kind === 'file'; })
        .map(function (i) { return i.getAsFile(); }).filter(Boolean);
      if (imgs.length) { e.preventDefault(); files.readAll(imgs).then(stageFiles); }
    });

    /* Drop files on the assistant panel to attach them. */
    var panel = $('#assistantPanel');
    ['dragover', 'drop'].forEach(function (type) {
      panel.addEventListener(type, function (e) {
        e.preventDefault();
        if (type === 'drop' && e.dataTransfer.files.length) files.readAll(e.dataTransfer.files).then(stageFiles);
      });
    });

    $('#settingsBody').addEventListener('change', function (e) {
      var act = e.target.getAttribute('data-act');
      if (act !== 'quiet-from' && act !== 'quiet-to') return;
      var q = Object.assign({}, store.state.settings.quietHours);
      q[act === 'quiet-from' ? 'from' : 'to'] = e.target.value;
      store.setSettings({ quietHours: q });
      notify.pushSnapshotToWorker();
    });

    /* Drop anything onto the import dialog. */
    var importDlg = $('#dlgImport');
    ['dragover', 'drop'].forEach(function (type) {
      importDlg.addEventListener(type, function (e) {
        e.preventDefault();
        var zone = $('#dropZone');
        if (zone) zone.classList.toggle('border-atlas-500/50', type === 'dragover');
        if (type === 'drop' && e.dataTransfer.files.length) acceptFiles(e.dataTransfer.files);
      });
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { if (assistantOpen) closeAssistant(); return; }
      var typing = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName);
      if (typing || e.metaKey || e.ctrlKey || e.altKey) return;

      if (e.key === 'n') { e.preventDefault(); openEditor(null); }
      else if (e.key === '/') { e.preventDefault(); $('#search').focus(); }
      else if (e.key === 'a') { e.preventDefault(); actions.assistant(); }
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

    assistant.loadThread();

    wire();
    render();

    ui.renderAssistantThread();
    updateSendState();
    assistant.checkStatus().then(ui.renderAssistantEngine);

    notify.registerServiceWorker().then(function () {
      notify.startScheduler();
      notify.pushSnapshotToWorker();
      ui.renderNotifStatus();
    });

    /* Opened straight from a notification: jump to that assignment. */
    var m = /#a=([\w-]+)/.exec(location.hash);
    if (m) setTimeout(function () { openEditor(m[1]); }, 120);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  global.Atlas.app = { ctx: ctx, render: render };
})(window);
