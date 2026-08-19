/* Atlas — headless test for the reminder scheduler.
 *
 *   node test/notify.test.mjs
 *
 * Loads the real js/util.js, js/store.js and js/notify.js inside a stub browser
 * so the deadline logic can be checked without a live OS notification prompt.
 */
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import assert from 'node:assert/strict';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/* ------------------------------------------------------------- stub DOM */

function makeWindow() {
  const store = new Map();
  const sent = [];

  const win = {
    isSecureContext: true,
    location: { protocol: 'http:', hostname: 'localhost', href: 'http://localhost/' },
    localStorage: {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: (k) => store.delete(k)
    },
    document: { addEventListener() {}, hidden: false },
    navigator: {},
    console,
    setTimeout, clearTimeout, setInterval, clearInterval,
    addEventListener() {},
    Intl,
    Date, Math, JSON, Promise, Object, Array, String, Number, isNaN, parseInt,
    __sent: sent
  };

  class FakeNotification {
    constructor(title, opts) {
      sent.push({ title, body: (opts && opts.body) || '', tag: (opts && opts.tag) || '' });
    }
    close() {}
  }
  FakeNotification.permission = 'granted';
  FakeNotification.requestPermission = () => Promise.resolve('granted');

  win.Notification = FakeNotification;
  win.window = win;
  win.self = win;
  return win;
}

function loadAtlas() {
  const win = makeWindow();
  const ctx = createContext(win);
  for (const f of ['js/util.js', 'js/store.js', 'js/managebac.js', 'js/notify.js']) {
    runInContext(readFileSync(join(ROOT, f), 'utf8'), ctx, { filename: f });
  }
  return win;
}

/* ----------------------------------------------------------------- tests */

const MIN = 60 * 1000;
const results = [];
function test(name, fn) {
  try { fn(); results.push(['pass', name]); }
  catch (e) { results.push(['FAIL', name + ' — ' + e.message]); }
}

test('a reminder fires once inside its lead window, and never again', () => {
  const win = loadAtlas();
  const { store, notify } = win.Atlas;
  store.load();
  store.setSettings({ leadTimes: [1440, 60], notificationsEnabled: true });

  const a = store.create({ title: 'Lab report', course: 'Biology HL', dueAt: new Date(Date.now() + 30 * MIN).toISOString() });

  assert.equal(notify.runDeadlineCheck(), 1, 'first pass should fire one reminder');
  assert.equal(win.__sent.length, 1);
  assert.match(win.__sent[0].title, /Due in 1 hour/);
  assert.match(win.__sent[0].body, /Lab report/);

  assert.equal(notify.runDeadlineCheck(), 0, 'second pass must be silent');
  assert.equal(store.byId(a.id).notified.lead_60, true);
});

test('an assignment far out stays quiet until its window opens', () => {
  const win = loadAtlas();
  const { store, notify } = win.Atlas;
  store.load();
  store.setSettings({ leadTimes: [1440, 60] });

  const a = store.create({ title: 'Essay', course: 'English', dueAt: new Date(Date.now() + 5 * 24 * 60 * MIN).toISOString() });
  assert.equal(notify.runDeadlineCheck(), 0, 'five days out: nothing');

  store.update(a.id, { dueAt: new Date(Date.now() + 20 * 60 * MIN).toISOString() });   // now inside 1 day
  assert.equal(notify.runDeadlineCheck(), 1, 'inside the 1-day window: one reminder');
  assert.match(win.__sent[0].title, /Due in 1 day/);
});

test('overdue work is announced exactly once', () => {
  const win = loadAtlas();
  const { store, notify } = win.Atlas;
  store.load();

  store.create({ title: 'Problem set', course: 'Physics SL', dueAt: new Date(Date.now() - 90 * MIN).toISOString() });
  notify.runDeadlineCheck();
  const overdue = win.__sent.filter((n) => /Overdue/.test(n.title));
  assert.equal(overdue.length, 1);
  notify.runDeadlineCheck();
  assert.equal(win.__sent.filter((n) => /Overdue/.test(n.title)).length, 1, 'must not repeat');
});

test('completed work never triggers a reminder', () => {
  const win = loadAtlas();
  const { store, notify } = win.Atlas;
  store.load();
  store.create({ title: 'Done already', course: 'History', status: 'done', dueAt: new Date(Date.now() + 10 * MIN).toISOString() });
  assert.equal(notify.runDeadlineCheck(), 0);
  assert.equal(win.__sent.length, 0);
});

test('the master switch silences everything', () => {
  const win = loadAtlas();
  const { store, notify } = win.Atlas;
  store.load();
  store.setSettings({ notificationsEnabled: false });
  store.create({ title: 'Quiz', course: 'Spanish B SL', dueAt: new Date(Date.now() + 5 * MIN).toISOString() });
  assert.equal(notify.runDeadlineCheck(), 0);
  assert.equal(win.__sent.length, 0);
});

test('quiet hours hold reminders back', () => {
  const win = loadAtlas();
  const { store, notify } = win.Atlas;
  store.load();
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  /* A window that definitely contains "now". */
  const from = pad((now.getHours() + 23) % 24) + ':00';
  const to = pad((now.getHours() + 2) % 24) + ':00';
  store.setSettings({ quietHours: { enabled: true, from, to } });

  assert.equal(notify.inQuietHours(), true, 'now should be inside the quiet window');
  store.create({ title: 'Reading', course: 'TOK', dueAt: new Date(Date.now() + 5 * MIN).toISOString() });
  notify.runDeadlineCheck();
  assert.equal(win.__sent.length, 0, 'nothing should reach the OS during quiet hours');
});

test('moving a deadline re-arms the reminders for that assignment', () => {
  const win = loadAtlas();
  const { store, notify, managebac } = win.Atlas;
  store.load();
  store.setSettings({ leadTimes: [60] });

  const first = managebac.parse([{ id: 'mb_1', title: 'Draft', class: { name: 'History HL' }, due_at: new Date(Date.now() + 30 * MIN).toISOString() }]);
  managebac.merge(first);
  assert.equal(notify.runDeadlineCheck(), 1);
  assert.equal(notify.runDeadlineCheck(), 0);

  /* Teacher pushes the deadline back a week, then it comes round again. */
  managebac.merge(managebac.parse([{ id: 'mb_1', title: 'Draft', class: { name: 'History HL' }, due_at: new Date(Date.now() + 40 * MIN).toISOString() }]));
  assert.equal(notify.runDeadlineCheck(), 1, 'a moved deadline should be able to alert again');
});

/* ------------------------------------------------- ManageBac parser tests */

test('the parser maps ManageBac field names onto Atlas assignments', () => {
  const win = loadAtlas();
  const { managebac } = win.Atlas;
  win.Atlas.store.load();

  const parsed = managebac.parse({
    assignments: [
      { id: 'mb_7', title: 'Paper 2 mock', class: { name: 'English A Literature', code: 'ENG-A-1' }, assignment_type: 'Summative', due_at: '2026-09-01T23:59:00Z', max_points: 25, labels: ['Paper 2'], description: '<p>1,200 words</p>' },
      { assignment_id: 'mb_8', name: 'Vocab quiz', subject: 'Spanish B SL', category: 'Quiz', due_date: '2026-09-03' },
      { title: 'no due date', class: 'Maths' }
    ]
  });

  assert.equal(parsed.length, 2, 'records without a due date are dropped');
  assert.equal(parsed[0].type, 'assessment', 'Summative maps to assessment');
  assert.equal(parsed[0].course, 'English A Literature');
  assert.equal(parsed[0].courseCode, 'ENG-A-1');
  assert.equal(parsed[0].points, 25);
  assert.equal(parsed[0].description, '1,200 words', 'HTML is stripped');
  assert.equal(parsed[1].externalId, 'mb_8', 'alternate id field is honoured');
  assert.equal(parsed[1].course, 'Spanish B SL', 'a plain-string class is accepted');
  const dateOnly = new Date(parsed[1].dueAt);
  assert.equal(dateOnly.getFullYear(), 2026);
  assert.equal(dateOnly.getMonth(), 8);
  assert.equal(dateOnly.getDate(), 3, 'a date-only field must stay on its own local day');
  assert.equal(dateOnly.getHours(), 23, 'and land at end of day, not midnight UTC');
});

test('re-syncing the same feed adds nothing the second time', () => {
  const win = loadAtlas();
  const { store, managebac } = win.Atlas;
  store.load();
  const feed = [{ id: 'mb_9', title: 'Lab', class: { name: 'Chemistry HL' }, due_at: new Date(Date.now() + 3600e3).toISOString() }];

  const a = managebac.merge(managebac.parse(feed));
  assert.equal(a.added.length, 1);
  assert.equal(a.added[0].isNew, true, 'freshly synced work is flagged as new');

  const b = managebac.merge(managebac.parse(feed));
  assert.equal(b.added.length, 0);
  assert.equal(b.unchanged, 1);
  assert.equal(store.all().length, 1, 'no duplicate rows');
});

/* ---------------------------------------------------------------- report */

let failed = 0;
for (const [status, name] of results) {
  if (status === 'FAIL') failed++;
  console.log((status === 'pass' ? '  ok  ' : '  FAIL') + '  ' + name);
}
console.log('\n' + (results.length - failed) + '/' + results.length + ' passing');
process.exit(failed ? 1 : 0);
