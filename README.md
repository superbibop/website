# Atlas

A homework tracker for students: one dashboard of everything due, a ManageBac
sync that highlights what is new, and native OS notifications before each
deadline.

HTML + Tailwind CSS + vanilla JavaScript. No build step, no dependencies,
no framework. Identical in Chrome and Edge.

---

## Running it

```bash
node server.mjs
```

Then open <http://localhost:5173>.

Use the server rather than double-clicking `index.html`. Browsers only expose
the Notifications API and service workers on a **secure context** — `https` or
`localhost`. Over `file://` the dashboard still works, but every alert is
disabled. The server is ~70 lines of Node with zero dependencies.

Run the tests with:

```bash
node test/notify.test.mjs
```

---

## What is here

| Path | What it does |
| --- | --- |
| `index.html` | Markup, Tailwind config, dialogs |
| `assets/styles.css` | The few things utilities can't express: scrollbars, dialogs, form controls |
| `js/util.js` | Dates, urgency classification, formatting |
| `js/store.js` | State, `localStorage` persistence, filters, counts |
| `js/managebac.js` | The ManageBac adapter — parser, merge, mock transport |
| `js/notify.js` | Permission, OS notifications, the reminder scheduler |
| `js/ui.js` | All rendering |
| `js/app.js` | Boot and event delegation |
| `sw.js` | Offline shell, background deadline checks, notification clicks |
| `data/managebac-feed.json` | The mock feed |
| `test/notify.test.mjs` | Headless tests for the scheduler and parser |

---

## The three core features

### 1. Assignment dashboard

Two views, toggled in the toolbar (or with `c`):

- **List** — grouped by due day, sorted by urgency. Overdue floats to the top in
  rose, due-today in amber, within three days in teal, everything else muted.
- **Calendar** — month grid with per-day pills; click a day for its agenda.

Filters (Upcoming / Today / This week / Overdue / Completed / All), live search,
and a stat row across the top. Everything persists to `localStorage`.

Keyboard: `n` new · `/` search · `s` sync · `c` toggle view.

### 2. ManageBac integration

Student-level ManageBac API access is restricted, so `js/managebac.js` is written
as a **real adapter with a mock transport**. The parsing half is production code
— it takes records shaped like ManageBac's assignment payloads and CSV/JSON
exports, and maps them onto Atlas assignments:

```json
{
  "id": "mb_9001",
  "title": "Chapter 7 problem set",
  "class": { "name": "Mathematics AA HL", "code": "MAA-HL-2" },
  "assignment_type": "Formative",
  "due_at": "2026-08-22T23:59:00Z",
  "max_points": 20,
  "labels": ["Unit 3"],
  "description": "Questions 1-14, show all working."
}
```

The parser is deliberately forgiving: it accepts `due_at` / `due_date` /
`deadline`, date-only values (treated as end of day), `class` as an object or a
plain string, an envelope of `{assignments|data|items|results}` or a bare array,
and it strips HTML out of descriptions. Records without a title or a due date
are dropped rather than half-imported.

**Three ways in:**

1. **Sync now** — runs the mock transport. Each sync releases another batch, so
   you can watch new work arrive and the notification fire.
2. **Import** — paste a ManageBac export, or drop a `.json` file on the dialog.
   Same parser, same merge.
3. **A real endpoint**, when you have one. Replace the transport and nothing
   else in the app changes:

   ```js
   Atlas.managebac.transport = {
     name: 'api',
     fetch: () => fetch('/api/managebac/assignments', { credentials: 'include' })
                    .then(r => r.json())
   };
   ```

Merging is by `externalId`, so re-syncing never duplicates. Anything unseen is
flagged `isNew` and surfaces in the glowing **New from ManageBac** panel at the
top of the dashboard. A changed due date counts as news too: it re-flags the
assignment *and* re-arms its reminders, because a moved deadline is exactly the
thing a student needs telling about.

### 3. OS-level notifications

Atlas asks for permission at the moment it has something to say — during a sync
you started — rather than ambushing you on first paint. It sends:

- **New from ManageBac**, the moment a sync finds unseen work
- **A deadline reminder** at each configured lead time (1 day and 1 hour by
  default; 1 week / 2 days / 6 hours / 15 min also available)
- **An overdue notice**, once, within a day of a deadline passing

Each alert fires exactly once per assignment — the state is stamped on the
assignment and persisted. When several lead windows are open at once (you open
Atlas for the first time on something due in 30 minutes) it sends the *tightest*
one and quietly retires the wider ones, so you get one useful alert instead of a
stack of stale ones. Quiet hours hold reminders back overnight.

Delivery goes through the service worker's `showNotification` where available,
which is what puts the alert in the Windows Action Center / macOS Notification
Centre; clicking it focuses Atlas and opens that assignment. Without a service
worker it falls back to `new Notification()`.

**On timing, honestly:** deadlines are re-checked once a minute while a tab is
open, and again whenever the tab regains focus or the machine wakes — so opening
your laptop fires anything that came due while it was asleep. For alerts with
**every tab closed**, install Atlas as an app (Chrome/Edge: the install icon in
the address bar). Installed, it registers Periodic Background Sync and `sw.js`
wakes on a schedule to check deadlines against a snapshot of your assignments.
Chrome and Edge grant that based on how often you engage with the app. Truly
guaranteed background delivery needs the Push API and a server holding a VAPID
key — `sw.js` already has the `push` handler wired for that day; there is just
no server behind it yet.

---

## Data and privacy

Everything lives in `localStorage` in your browser. No account, no backend, no
telemetry. **Reset all data** in Settings clears it.

## Built to extend

- Colour and urgency logic is centralised in `Atlas.util.URGENCY` — one place.
- The store emits changes; rendering is a pure function of state.
- Every interaction is a `data-act` attribute handled by one delegated listener.
- Swapping the mock transport for a live one touches exactly one object.

Natural next steps: a push server for guaranteed background alerts, workload
estimates per assignment, and a weekly summary view.
