# Atlas

A homework and task tracker for students: one dashboard of everything due,
native OS notifications before each deadline, and an assistant that turns a
confusing exam question into plain English.

HTML + Tailwind CSS + vanilla JavaScript. No build step, no framework.
Identical in Chrome and Edge.

---

## Running it

```bash
node server.mjs
```

Then open <http://localhost:5173>.

The dashboard needs no `npm install`. Only the Claude-backed assistant does:

```bash
npm install
```

…and the API key goes in the **server's** environment, never in the browser:

```bash
$env:ANTHROPIC_API_KEY = "sk-ant-..."
```

Without a key the assistant still runs, using its built-in offline explainer.

Use the server rather than double-clicking `index.html`. Browsers only expose
the Notifications API and service workers on a **secure context** — `https` or
`localhost`. Over `file://` the dashboard still works, but every alert is
disabled. The server is a small zero-dependency Node script.

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
| `js/importer.js` | Turns JSON records / spreadsheet exports into Atlas tasks |
| `js/files.js` | File classification, reading, CSV parsing |
| `js/assistant.js` | Assistant client, SSE streaming, offline explainer |
| `js/notify.js` | Permission, OS notifications, the reminder scheduler |
| `js/ui.js` | All rendering |
| `js/app.js` | Boot and event delegation |
| `assistant-route.mjs` | Server side of the assistant — where the API key lives |
| `sw.js` | Offline shell, background deadline checks, notification clicks |
| `test/notify.test.mjs` | Headless tests for the scheduler and parser |

---

## The core features

### 1. Task dashboard

**Add Task** sits in the left menu (or press `n`, or the New button). The form
takes a title, class, type, start date and time, due date and time, a
description, points, and comma-separated labels.

Two views, toggled in the toolbar (or with `c`):

- **List** — grouped by due day, sorted by urgency. Overdue floats to the top in
  rose, due-today in amber, within three days in teal, everything else muted.
- **Calendar** — month grid with per-day pills; click a day for its agenda.

Filters (Upcoming / Today / This week / Overdue / Completed / All), live search,
and a stat row across the top. Everything persists to `localStorage`.

Keyboard: `n` new task · `/` search · `c` toggle view · `a` assistant.

### 2. Import

The Import dialog takes anything you drop on it and routes by what it is:

| You drop | Atlas does |
| --- | --- |
| `.json` | Parses it as an assignment feed → tasks |
| `.csv` `.tsv` | Maps the columns to a feed, then the same parser → tasks |
| `.pdf` | Sends it to the assistant as a document |
| `.png` `.jpg` `.jpeg` `.webp` `.gif` | Sends it to the assistant as an image |
| `.txt` `.md` | Sends it to the assistant as text |
| anything else | Stored as an attachment, not parsed |

The CSV path is forgiving about headers — `Title`/`Assignment`/`Task`,
`Class`/`Course`/`Subject`, `Due Date`/`Deadline`, plus optional `Type`,
`Points` and `Description`. A due date with no time is read as **end of that
day, locally** (not midnight UTC, which would mark the work overdue during the
school day). You can also paste JSON directly.

### 3. OS-level notifications

Atlas asks for permission at a deliberate moment — when you enable alerts in
Settings or the sidebar — rather than ambushing you on first paint. It sends:

- **A deadline reminder** at each configured lead time (1 day and 1 hour by
  default; 1 week / 2 days / 6 hours / 15 min also available)
- **An overdue notice**, once, within a day of a deadline passing

Each alert fires exactly once per task — the state is stamped on the task and
persisted. When several lead windows are open at once you get the *tightest*
one and the wider ones are quietly retired. Quiet hours hold reminders back
overnight.

Delivery goes through the service worker's `showNotification` where available,
which is what puts the alert in the Windows Action Center / macOS Notification
Centre; clicking it focuses Atlas and opens that task.

**On timing, honestly:** deadlines are re-checked once a minute while a tab is
open, and again whenever the tab regains focus or the machine wakes — so opening
your laptop fires anything that came due while it was asleep. For alerts with
**every tab closed**, install Atlas as an app (Chrome/Edge: the install icon in
the address bar). Installed, it registers Periodic Background Sync and `sw.js`
wakes on a schedule to check deadlines against a snapshot of your tasks.
Truly guaranteed background delivery needs the Push API and a server holding a
VAPID key — `sw.js` already has the `push` handler wired for that day; there is
just no server behind it yet.

### 4. The assistant

Press **Explain** (or `a`). Paste the question you don't understand, attach a
photo of the worksheet, or paste a screenshot straight into the box. You get
back four sections:

- **In plain words** — the question restated in everyday English
- **What it's actually asking for** — the concrete deliverables
- **Key words decoded** — command terms glossed (*evaluate*, *justify*,
  *to what extent*, *derive*…), which is where most of the confusion lives
- **How to approach it** — the order of work

**It explains the question; it does not answer it.** That's enforced in the
system prompt, not just suggested.

Two engines. With `ANTHROPIC_API_KEY` set on the server, it streams a real
explanation from Claude and can read images and PDFs. The browser never sees
the key — it POSTs to `/api/assistant` and the server holds the credential.
With no key, Atlas falls back to its own offline rewriter: it ranks and decodes
the command terms, splits multi-part questions, and lays out an order of work.
Weaker, but useful, and it works with no network at all. Replies are labelled
so you always know which one answered.

---

## Data and privacy

Tasks, settings and the assistant thread live in `localStorage`; attachments
live in IndexedDB. All of it stays in your browser. No telemetry. **Reset all
data** in Settings clears it.

The one thing that leaves your machine is an assistant question: the text and
any file you attach go to your own server, which forwards them to the Anthropic
API. Nothing is sent unless you press **Explain**. In offline mode nothing
leaves the browser at all.

## Built to extend

- Colour and urgency logic is centralised in `Atlas.util.URGENCY` — one place.
- The store emits changes; rendering is a pure function of state.
- Every interaction is a `data-act` attribute handled by one delegated listener.

Natural next steps: a push server for guaranteed background alerts, workload
estimates per task, and a weekly summary view.
