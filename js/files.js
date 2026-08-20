/* Atlas — universal file handling.
 *
 * Every import path in the app funnels through here. A file is classified,
 * read once, and then routed:
 *
 *   feed   .json          -> parsed as an assignment payload into tasks
 *   table  .csv .tsv      -> converted to feed records, then the same parser
 *   text   .txt .md ...   -> handed to the assistant as text
 *   image  .png .jpg ...  -> handed to the assistant as an image block
 *   pdf    .pdf           -> handed to the assistant as a document block
 *   other  anything else  -> stored as an attachment, not parsed
 */
(function (global) {
  'use strict';

  var U = global.Atlas.util;

  var IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
  var TEXT_EXT = ['txt', 'md', 'markdown', 'rtf', 'log'];

  var MAX_FILE = 20 * 1024 * 1024;     // 20 MB per file

  function extensionOf(name) {
    var m = /\.([a-z0-9]+)$/i.exec(String(name || ''));
    return m ? m[1].toLowerCase() : '';
  }

  /** Browsers are inconsistent about File.type — fall back to the extension. */
  function classify(file) {
    var ext = extensionOf(file.name);
    var type = (file.type || '').toLowerCase();

    if (ext === 'json' || type === 'application/json') return { kind: 'feed', mediaType: 'application/json' };
    if (ext === 'csv' || type === 'text/csv') return { kind: 'table', mediaType: 'text/csv' };
    if (ext === 'tsv') return { kind: 'table', mediaType: 'text/tab-separated-values' };
    if (ext === 'pdf' || type === 'application/pdf') return { kind: 'pdf', mediaType: 'application/pdf' };

    if (type.indexOf('image/') === 0 || ['png', 'jpg', 'jpeg', 'webp', 'gif'].indexOf(ext) !== -1) {
      /* Claude accepts png/jpeg/webp/gif; normalise jpg and anything odd. */
      var media = IMAGE_TYPES.indexOf(type) !== -1 ? type
        : ext === 'png' ? 'image/png'
        : ext === 'webp' ? 'image/webp'
        : ext === 'gif' ? 'image/gif'
        : 'image/jpeg';
      return { kind: 'image', mediaType: media };
    }

    if (type.indexOf('text/') === 0 || TEXT_EXT.indexOf(ext) !== -1) return { kind: 'text', mediaType: 'text/plain' };
    return { kind: 'other', mediaType: type || 'application/octet-stream' };
  }

  function humanSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return Math.round(bytes / 1024) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }

  /* ---------------------------------------------------------------- read */

  function readAsText(file) {
    return new Promise(function (resolve, reject) {
      var r = new FileReader();
      r.onload = function () { resolve(String(r.result)); };
      r.onerror = function () { reject(new Error('Could not read ' + file.name)); };
      r.readAsText(file);
    });
  }

  function readAsDataUrl(file) {
    return new Promise(function (resolve, reject) {
      var r = new FileReader();
      r.onload = function () { resolve(String(r.result)); };
      r.onerror = function () { reject(new Error('Could not read ' + file.name)); };
      r.readAsDataURL(file);
    });
  }

  /**
   * Read a file into the shape the rest of the app expects.
   * Resolves with { name, size, kind, mediaType, text?, data?, dataUrl? }
   * where `data` is bare base64 (no data: prefix), ready for the API.
   */
  function read(file) {
    if (file.size > MAX_FILE) {
      return Promise.reject(new Error(file.name + ' is ' + humanSize(file.size) + ' — the limit is ' + humanSize(MAX_FILE) + '.'));
    }

    var meta = classify(file);
    var base = { name: file.name, size: file.size, kind: meta.kind, mediaType: meta.mediaType };

    if (meta.kind === 'feed' || meta.kind === 'table' || meta.kind === 'text') {
      return readAsText(file).then(function (text) {
        return Object.assign(base, { text: text });
      });
    }

    return readAsDataUrl(file).then(function (dataUrl) {
      var comma = dataUrl.indexOf(',');
      return Object.assign(base, { dataUrl: dataUrl, data: dataUrl.slice(comma + 1) });
    });
  }

  function readAll(fileList) {
    return Promise.all(Array.prototype.slice.call(fileList).map(function (f) {
      return read(f).catch(function (err) { return { name: f.name, error: err.message }; });
    }));
  }

  /* ----------------------------------------------------------------- CSV */

  /** Small RFC-4180-ish parser: handles quoted fields and embedded newlines. */
  function parseDelimited(text, delimiter) {
    var rows = [], row = [], field = '', inQuotes = false;
    var d = delimiter || (text.indexOf('\t') !== -1 && text.indexOf(',') === -1 ? '\t' : ',');

    for (var i = 0; i < text.length; i++) {
      var c = text[i];
      if (inQuotes) {
        if (c === '"') {
          if (text[i + 1] === '"') { field += '"'; i++; }
          else inQuotes = false;
        } else field += c;
        continue;
      }
      if (c === '"') { inQuotes = true; continue; }
      if (c === d) { row.push(field); field = ''; continue; }
      if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; continue; }
      if (c === '\r') continue;
      field += c;
    }
    if (field !== '' || row.length) { row.push(field); rows.push(row); }
    return rows.filter(function (r) { return r.some(function (v) { return String(v).trim() !== ''; }); });
  }

  var COLUMNS = {
    title: ['title', 'assignment', 'task', 'name', 'homework', 'work'],
    course: ['class', 'course', 'subject', 'group'],
    due: ['due', 'due date', 'due_at', 'due date/time', 'deadline', 'date due', 'submit by'],
    type: ['type', 'assignment type', 'category', 'kind'],
    points: ['points', 'max points', 'marks', 'score'],
    description: ['description', 'details', 'notes', 'instructions']
  };

  function matchColumn(header) {
    var h = String(header || '').trim().toLowerCase().replace(/[_-]+/g, ' ');
    for (var key in COLUMNS) {
      if (COLUMNS[key].indexOf(h) !== -1) return key;
    }
    /* Loose second pass: "Due Date (local)" should still match `due`. */
    for (var k in COLUMNS) {
      for (var i = 0; i < COLUMNS[k].length; i++) {
        if (h.indexOf(COLUMNS[k][i]) === 0) return k;
      }
    }
    return null;
  }

  /**
   * Turn a spreadsheet export into the generic record shape, so the parser
   * in js/importer.js does the real work.
   */
  function tableToFeed(text, delimiter) {
    var rows = parseDelimited(text, delimiter);
    if (rows.length < 2) throw new Error('That file has no data rows.');

    var headers = rows[0].map(matchColumn);
    if (headers.indexOf('title') === -1 || headers.indexOf('due') === -1) {
      throw new Error('Could not find a title column and a due-date column. Expected headers like: Title, Class, Due Date.');
    }

    return rows.slice(1).map(function (cells, n) {
      var rec = {};
      headers.forEach(function (key, i) {
        if (key && cells[i] != null && String(cells[i]).trim() !== '') rec[key] = String(cells[i]).trim();
      });
      if (!rec.title || !rec.due) return null;
      return {
        id: 'csv_' + n + '_' + rec.title.slice(0, 24).replace(/\s+/g, '_'),
        title: rec.title,
        'class': { name: rec.course || 'Imported' },
        assignment_type: rec.type || 'homework',
        due_at: rec.due,
        max_points: rec.points ? Number(String(rec.points).replace(/[^0-9.]/g, '')) : undefined,
        description: rec.description || ''
      };
    }).filter(Boolean);
  }

  /* ------------------------------------------------------- attachments db */

  var DB_NAME = 'atlas-files';
  var STORE = 'attachments';
  var dbPromise = null;

  function openDb() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise(function (resolve, reject) {
      if (!global.indexedDB) { reject(new Error('This browser has no IndexedDB.')); return; }
      var req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = function () {
        var db = req.result;
        if (!db.objectStoreNames.contains(STORE)) {
          var os = db.createObjectStore(STORE, { keyPath: 'id' });
          os.createIndex('assignmentId', 'assignmentId', { unique: false });
        }
      };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error); };
    });
    return dbPromise;
  }

  function tx(mode, fn) {
    return openDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var t = db.transaction(STORE, mode);
        var result = fn(t.objectStore(STORE));
        t.oncomplete = function () { resolve(result && result.result !== undefined ? result.result : result); };
        t.onerror = function () { reject(t.error); };
      });
    });
  }

  function saveAttachment(fileRecord, assignmentId) {
    var row = {
      id: U.uid('file'),
      assignmentId: assignmentId || null,
      name: fileRecord.name,
      size: fileRecord.size,
      kind: fileRecord.kind,
      mediaType: fileRecord.mediaType,
      dataUrl: fileRecord.dataUrl || null,
      text: fileRecord.text || null,
      addedAt: new Date().toISOString()
    };
    return tx('readwrite', function (os) { os.put(row); return row; }).then(function () { return row; });
  }

  function listAttachments(assignmentId) {
    return tx('readonly', function (os) { return os.getAll(); }).then(function (rows) {
      rows = rows || [];
      return assignmentId ? rows.filter(function (r) { return r.assignmentId === assignmentId; }) : rows;
    }).catch(function () { return []; });
  }

  function deleteAttachment(id) {
    return tx('readwrite', function (os) { os.delete(id); }).catch(function () {});
  }

  global.Atlas.files = {
    classify: classify,
    read: read,
    readAll: readAll,
    humanSize: humanSize,
    parseDelimited: parseDelimited,
    tableToFeed: tableToFeed,
    saveAttachment: saveAttachment,
    listAttachments: listAttachments,
    deleteAttachment: deleteAttachment,
    MAX_FILE: MAX_FILE
  };
})(window);
