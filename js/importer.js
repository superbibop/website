/* Atlas — assignment importer.
 *
 * Turns outside data (a pasted JSON export, a spreadsheet row set converted by
 * js/files.js) into Atlas assignments. Field names are matched loosely so most
 * homework-tracker exports work without editing. Merging is by `externalId`,
 * so re-importing the same file never duplicates.
 */
(function (global) {
  'use strict';

  var store = global.Atlas.store;

  /* ------------------------------------------------------------- parsing */

  var TYPE_MAP = {
    formative: 'homework',
    summative: 'assessment',
    homework: 'homework',
    assignment: 'homework',
    quiz: 'assessment',
    test: 'assessment',
    exam: 'assessment',
    assessment: 'assessment',
    project: 'project',
    reading: 'reading',
    lab: 'lab',
    practical: 'lab'
  };

  function pick() {
    for (var i = 0; i < arguments.length; i++) {
      var v = arguments[i];
      if (v !== undefined && v !== null && v !== '') return v;
    }
    return undefined;
  }

  function toIso(value, fallback) {
    if (!value) return fallback;

    /* Date-only fields must be handled BEFORE new Date(): JS parses a bare
       "2026-08-25" as midnight UTC, which in an eastern timezone lands mid-
       morning local and would mark the work overdue during the school day.
       A due date with no time means end of that day, locally. */
    var m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(String(value).trim());
    if (m) return new Date(+m[1], +m[2] - 1, +m[3], 23, 59, 0).toISOString();

    var d = new Date(value);
    return isNaN(d.getTime()) ? fallback : d.toISOString();
  }

  /** Map one raw record onto an Atlas assignment. Unusable records become null. */
  function normalize(raw) {
    if (!raw || typeof raw !== 'object') return null;

    var klass = raw['class'] || raw.klass || raw.course || raw.subject || {};
    if (typeof klass === 'string') klass = { name: klass };

    var title = pick(raw.title, raw.name, raw.assignment_title);
    var dueRaw = pick(raw.due_at, raw.due_date, raw.dueAt, raw.deadline, raw.due);
    if (!title || !dueRaw) return null;

    var typeRaw = String(pick(raw.assignment_type, raw.type, raw.category, 'homework')).toLowerCase();
    var externalId = String(pick(raw.id, raw.assignment_id, raw.uuid, title + '|' + dueRaw));
    var nowIso = new Date().toISOString();

    var points = (raw.max_points != null ? Number(raw.max_points) : (raw.points != null ? Number(raw.points) : null));

    return {
      externalId: externalId,
      title: String(title).trim().slice(0, 140),
      course: String(pick(klass.name, klass.title, raw.class_name) || 'Unassigned').trim().slice(0, 80),
      courseCode: String(pick(klass.code, klass.short_name, raw.class_code) || '').trim(),
      type: TYPE_MAP[typeRaw] || 'other',
      dueAt: toIso(dueRaw, nowIso),
      assignedAt: toIso(pick(raw.assigned_at, raw.created_at, raw.published_at), nowIso),
      description: String(pick(raw.description, raw.details, raw.body) || '').replace(/<[^>]*>/g, ' ').trim().slice(0, 600),
      points: (points != null && !isNaN(points)) ? points : null,
      labels: Array.isArray(raw.labels) ? raw.labels.map(String).slice(0, 4)
            : (Array.isArray(raw.tags) ? raw.tags.map(String).slice(0, 4) : []),
      source: 'import'
    };
  }

  /** Accept an array, or an envelope like { assignments: [...] } / { data: [...] }. */
  function extractRecords(payload) {
    if (Array.isArray(payload)) return payload;
    if (!payload || typeof payload !== 'object') return [];
    var keys = ['assignments', 'data', 'items', 'results', 'records'];
    for (var i = 0; i < keys.length; i++) {
      if (Array.isArray(payload[keys[i]])) return payload[keys[i]];
    }
    return [];
  }

  function parse(payload) {
    return extractRecords(payload).map(normalize).filter(Boolean);
  }

  /* --------------------------------------------------------------- merge */

  /**
   * Merge parsed records into the store.
   * Returns { added: [...], updated: [...], unchanged: n }.
   */
  function merge(parsed) {
    var added = [], updated = [], unchanged = 0;

    parsed.forEach(function (incoming) {
      var existing = store.byExternalId(incoming.externalId);

      if (!existing) {
        added.push(store.create(Object.assign({}, incoming, { status: 'todo' })));
        return;
      }

      var changedDue = existing.dueAt !== incoming.dueAt;
      if (changedDue || existing.title !== incoming.title || existing.description !== incoming.description) {
        var patch = {
          title: incoming.title,
          dueAt: incoming.dueAt,
          description: incoming.description,
          points: incoming.points,
          labels: incoming.labels,
          course: incoming.course,
          courseCode: incoming.courseCode,
          type: incoming.type
        };
        /* A moved deadline re-arms the reminders for that assignment. */
        if (changedDue) patch.notified = {};
        store.update(existing.id, patch);
        updated.push(Object.assign(store.byId(existing.id), { _changedDue: changedDue }));
      } else {
        unchanged++;
      }
    });

    return { added: added, updated: updated, unchanged: unchanged };
  }

  /** Import a payload the student pasted or dropped in. */
  function importPayload(payload) {
    var parsed = parse(payload);
    if (!parsed.length) throw new Error('No usable assignments found. Each record needs at least a title and a due date.');
    return merge(parsed);
  }

  var SAMPLE_SHAPE = [
    {
      id: 'task_9001',
      title: 'Chapter 7 problem set',
      'class': { name: 'Mathematics AA HL', code: 'MAA-HL-2' },
      assignment_type: 'Formative',
      assigned_at: '2026-08-18T08:00:00Z',
      due_at: '2026-08-22T23:59:00Z',
      max_points: 20,
      labels: ['Unit 3'],
      description: 'Questions 1-14, show all working.'
    }
  ];

  global.Atlas.importer = {
    normalize: normalize,
    parse: parse,
    merge: merge,
    importPayload: importPayload,
    SAMPLE_SHAPE: SAMPLE_SHAPE
  };
})(window);
