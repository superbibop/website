/* Atlas — ManageBac integration layer.
 *
 * Student-level ManageBac API access is restricted, so this module is written
 * as a *real adapter with a mock transport*. The parsing half (`normalize`) is
 * production code: it accepts records shaped like ManageBac's assignment
 * payloads / CSV-JSON exports and maps them onto Atlas assignments. Only
 * `transport.fetch` is faked.
 *
 * To go live later, replace `ManageBac.transport` with something that hits a
 * real endpoint. Nothing else in the app has to change:
 *
 *   Atlas.managebac.transport = {
 *     name: 'api',
 *     fetch: function () {
 *       return fetch('/api/managebac/assignments', { credentials: 'include' })
 *         .then(function (r) { return r.json(); });
 *     }
 *   };
 */
(function (global) {
  'use strict';

  var U = global.Atlas.util;
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

  /**
   * Map one raw ManageBac record onto an Atlas assignment.
   * Field names are matched loosely so exports and API payloads both work.
   */
  function normalize(raw) {
    if (!raw || typeof raw !== 'object') return null;

    var klass = raw['class'] || raw.klass || raw.course || raw.subject || {};
    if (typeof klass === 'string') klass = { name: klass };

    var title = pick(raw.title, raw.name, raw.assignment_title);
    var dueRaw = pick(raw.due_at, raw.due_date, raw.dueAt, raw.deadline, raw.due);
    if (!title || !dueRaw) return null;   // unusable record

    var typeRaw = String(pick(raw.assignment_type, raw.type, raw.category, 'homework')).toLowerCase();
    var externalId = String(pick(raw.id, raw.assignment_id, raw.uuid, title + '|' + dueRaw));
    var nowIso = new Date().toISOString();

    return {
      externalId: externalId,
      title: String(title).trim().slice(0, 140),
      course: String(pick(klass.name, klass.title, raw.class_name, 'Unassigned')).trim().slice(0, 80),
      courseCode: String(pick(klass.code, klass.short_name, raw.class_code, '')).trim(),
      type: TYPE_MAP[typeRaw] || 'other',
      dueAt: toIso(dueRaw, nowIso),
      assignedAt: toIso(pick(raw.assigned_at, raw.created_at, raw.published_at), nowIso),
      description: String(pick(raw.description, raw.details, raw.body, '')).replace(/<[^>]*>/g, ' ').trim().slice(0, 600),
      points: (raw.max_points != null ? Number(raw.max_points) : (raw.points != null ? Number(raw.points) : null)),
      labels: Array.isArray(raw.labels) ? raw.labels.map(String).slice(0, 4)
            : (Array.isArray(raw.tags) ? raw.tags.map(String).slice(0, 4) : []),
      source: 'managebac'
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

  /* ------------------------------------------------------- mock transport */

  /* Fallback copy of the feed, so the app still works when opened straight
     from disk (file:// blocks fetch of the JSON file). */
  var FALLBACK_FEED = [
    { id:'mb_2201', title:'Cell respiration lab report', class:{name:'Biology HL',code:'BIO-HL-1'}, assignment_type:'Summative', due_in_hours:20,  max_points:24, labels:['IA','Unit 3'], description:'Full write-up: hypothesis, method, data table, error analysis.' },
    { id:'mb_2202', title:'Paper 1 practice — calculus', class:{name:'Mathematics AA HL',code:'MAA-HL-2'}, assignment_type:'Formative', due_in_hours:44, max_points:40, labels:['Paper 1'], description:'Questions 1-12, no calculator. Show all working.' },
    { id:'mb_2203', title:'Read Chapters 9-11 + annotate', class:{name:'English A Literature',code:'ENG-A-1'}, assignment_type:'Reading', due_in_hours:8, labels:['Unit 2'], description:'Annotate for narrative voice and unreliable narration.' },
    { id:'mb_2204', title:'TOK exhibition draft', class:{name:'Theory of Knowledge',code:'TOK-1'}, assignment_type:'Project', due_in_hours:96, max_points:10, labels:['Exhibition'], description:'950 words, three objects, clear links to the IA prompt.' },
    { id:'mb_2205', title:'Vocabulary quiz — Unit 5', class:{name:'Spanish B SL',code:'SPA-B-1'}, assignment_type:'Quiz', due_in_hours:31, max_points:20, labels:['Unit 5'] },
    { id:'mb_2206', title:'Historical investigation: Section 1', class:{name:'History HL',code:'HIS-HL-1'}, assignment_type:'Summative', due_in_hours:140, max_points:6, labels:['IA'], description:'Identification and evaluation of sources, 500 words.' },
    { id:'mb_2207', title:'Problem set 4 — electricity', class:{name:'Physics SL',code:'PHY-SL-1'}, assignment_type:'Formative', due_in_hours:-14, max_points:15, labels:['Unit 4'], description:'Kirchhoff loops, questions 1-9.' },
    { id:'mb_2208', title:'CAS reflection — term 1', class:{name:'CAS',code:'CAS-1'}, assignment_type:'Assignment', due_in_hours:200, labels:['Reflection'] }
  ];

  /* Items released one batch at a time by later syncs, so "New from
     ManageBac" and the notification path are demonstrable on demand. */
  var QUEUED_FEED = [
    [
      { id:'mb_2301', title:'Unit 4 test — waves & optics', class:{name:'Physics SL',code:'PHY-SL-1'}, assignment_type:'Test', due_in_hours:52, max_points:50, labels:['Unit 4'], description:'Covers 4.1-4.5. Formula booklet provided.' },
      { id:'mb_2302', title:'Data booklet exercises 7.3', class:{name:'Chemistry HL',code:'CHE-HL-1'}, assignment_type:'Formative', due_in_hours:27, max_points:12, labels:['Unit 7'] }
    ],
    [
      { id:'mb_2303', title:'Comparative essay — final draft', class:{name:'English A Literature',code:'ENG-A-1'}, assignment_type:'Summative', due_in_hours:72, max_points:25, labels:['Paper 2'], description:'1,200-1,500 words. Turnitin submission.' }
    ],
    [
      { id:'mb_2304', title:'Oral presentation rehearsal', class:{name:'Spanish B SL',code:'SPA-B-1'}, assignment_type:'Assessment', due_in_hours:120, max_points:30, labels:['IO'] },
      { id:'mb_2305', title:'Statistics worksheet — regression', class:{name:'Mathematics AA HL',code:'MAA-HL-2'}, assignment_type:'Formative', due_in_hours:36, max_points:18 }
    ]
  ];

  /** Turn the mock's relative `due_in_hours` into real timestamps. */
  function materialize(records) {
    var now = Date.now();
    return records.map(function (r) {
      var copy = Object.assign({}, r);
      if (copy.due_in_hours != null && !copy.due_at) {
        copy.due_at = new Date(now + copy.due_in_hours * U.HOUR).toISOString();
        copy.assigned_at = new Date(now - 36 * U.HOUR).toISOString();
        delete copy.due_in_hours;
      }
      return copy;
    });
  }

  var mockTransport = {
    name: 'mock',
    /** Resolves with a raw ManageBac-shaped payload. */
    fetch: function () {
      var cursor = store.state.syncCursor || 0;

      var basePromise = cursor === 0
        ? loadSeedFile().then(function (seed) { return seed || FALLBACK_FEED; })
        : Promise.resolve([]);

      return basePromise.then(function (base) {
        var batch = base.slice();
        if (cursor > 0) {
          var queued = QUEUED_FEED[(cursor - 1) % QUEUED_FEED.length];
          batch = batch.concat(queued || []);
        }
        store.state.syncCursor = cursor + 1;
        /* Simulate a little network latency so the spinner reads as real. */
        return new Promise(function (resolve) {
          setTimeout(function () { resolve({ assignments: materialize(batch) }); }, 550);
        });
      });
    }
  };

  /* ------------------------------------------------------- live transport */

  /* Used once the student signs in through their own connector (see js/auth.js).
     Identical contract to the mock: resolve with a raw ManageBac payload. */
  var liveTransport = {
    name: 'api',
    fetch: function () {
      var auth = global.Atlas.auth;
      var base = auth.connectorBase();
      if (!base) return Promise.reject(new Error('No connector configured.'));

      return fetch(base + '/assignments', {
        headers: { 'Authorization': 'Bearer ' + (auth.token() || ''), 'Accept': 'application/json' },
        credentials: 'omit',
        cache: 'no-store'
      }).then(function (res) {
        if (res.status === 401 || res.status === 403) throw new Error('Session expired — sign in to ManageBac again.');
        if (!res.ok) throw new Error('The connector answered ' + res.status + '.');
        return res.json();
      }).catch(function (err) {
        if (err instanceof TypeError) throw new Error('Could not reach the connector at ' + base + '.');
        throw err;
      });
    }
  };

  /**
   * Which transport a sync should use.
   * `api.transport` is an explicit override for embedding Atlas elsewhere;
   * otherwise the signed-in mode decides.
   */
  function resolveTransport() {
    if (api.transport) return api.transport;
    var auth = global.Atlas.auth;
    return (auth && auth.mode() === 'live') ? liveTransport : mockTransport;
  }

  /** Try the on-disk seed file; fall back silently when running from file://. */
  function loadSeedFile() {
    if (location.protocol === 'file:') return Promise.resolve(null);
    return fetch('data/managebac-feed.json', { cache: 'no-store' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (json) { return json ? extractRecords(json) : null; })
      .catch(function () { return null; });
  }

  /* ---------------------------------------------------------------- sync */

  /**
   * Merge a parsed feed into the store.
   * Returns { added: [...], updated: [...], unchanged: n }.
   */
  function merge(parsed) {
    var added = [], updated = [], unchanged = 0;

    parsed.forEach(function (incoming) {
      var existing = store.byExternalId(incoming.externalId);

      if (!existing) {
        added.push(store.create(Object.assign({}, incoming, { isNew: true, status: 'todo' })));
        return;
      }

      /* Teachers move deadlines constantly — a changed due date is news. */
      var changedDue = existing.dueAt !== incoming.dueAt;
      var changedTitle = existing.title !== incoming.title;
      if (changedDue || changedTitle || existing.description !== incoming.description) {
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
        if (changedDue) { patch.notified = {}; patch.isNew = true; }
        store.update(existing.id, patch);
        updated.push(Object.assign(store.byId(existing.id), { _changedDue: changedDue }));
      } else {
        unchanged++;
      }
    });

    return { added: added, updated: updated, unchanged: unchanged };
  }

  /** Full sync cycle: fetch -> parse -> merge -> stamp. */
  function sync() {
    var auth = global.Atlas.auth;
    if (auth && !auth.isConnected() && !api.transport) {
      return Promise.reject(new Error('Connect a ManageBac account first.'));
    }
    return Promise.resolve(resolveTransport().fetch()).then(function (payload) {
      var parsed = parse(payload);
      var result = merge(parsed);
      store.state.lastSyncAt = new Date().toISOString();
      store.emit();
      return result;
    });
  }

  /** Import a payload the student pasted or dropped in. */
  function importPayload(payload) {
    var parsed = parse(payload);
    if (!parsed.length) throw new Error('No usable assignments found. Each record needs at least a title and a due date.');
    var result = merge(parsed);
    store.state.lastSyncAt = new Date().toISOString();
    store.emit();
    return result;
  }

  var SAMPLE_SHAPE = [
    {
      id: 'mb_9001',
      title: 'Chapter 7 problem set',
      'class': { id: 'c_math', name: 'Mathematics AA HL', code: 'MAA-HL-2' },
      assignment_type: 'Formative',
      assigned_at: '2026-08-18T08:00:00Z',
      due_at: '2026-08-22T23:59:00Z',
      max_points: 20,
      labels: ['Unit 3'],
      description: 'Questions 1-14, show all working.'
    }
  ];

  var api = {
    /* null = let the signed-in mode choose. Set this to force a transport. */
    transport: null,
    mockTransport: mockTransport,
    liveTransport: liveTransport,
    resolveTransport: resolveTransport,
    normalize: normalize,
    parse: parse,
    merge: merge,
    sync: sync,
    importPayload: importPayload,
    SAMPLE_SHAPE: SAMPLE_SHAPE
  };

  global.Atlas.managebac = api;
})(window);
