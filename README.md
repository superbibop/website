# atlas — study control

A laptop-first student term planner: map your term, break big deliverables into
daily micro-tasks, and keep group projects honest — as an installable desktop
web app (PWA).

React 18 + Vite + TypeScript + Tailwind CSS. Dark, monochrome, keyboard-driven.

---

## Run it

```bash
npm install
npm run dev        # http://localhost:5173
```

Production build + preview:

```bash
npm run build      # type-checks, then bundles to dist/
npm run preview    # serves dist/ on :5173
```

Install as a desktop app from the preview (or any static host of `dist/`):
Chrome/Edge → install icon in the address bar.

Engine tests (no browser needed, plain Node):

```bash
npm test
```

---

## The workspace

A fixed left sidebar (Discord/Notion-style) switches between:

| View | What it does |
| --- | --- |
| **Dashboard** `1` | Today's cascaded micro-tasks, overdue + group alerts, term pulse |
| **Calendar** `2` | Month grid with workload heat-shading; click a day for its agenda |
| **Deadline Cascader** `3` | The engine made visible: per-day blocks, drag to re-pin, flag delayed to re-shift |
| **Group Sync** `4` | Shared milestones, owners, and automatic behind-schedule alerts |
| **Term Setup** `5` | Term dates, subjects, cascade settings; re-runnable any time |

First launch opens a setup wizard — or click **Load demo term** to explore a
fully populated term instantly.

## The cascading engine (`src/lib/cascade.ts`)

A deliverable ("History IA, 20 h, due in 3 weeks") becomes
`estHours / term.blockHours` micro-task blocks, spread **evenly over the
remaining workdays** (weekends excluded by default).

The cascade always regenerates from *now* — the later of the term start, the
last **"I'm behind"** flag, and today. So:

- finish a block today → tomorrow stays the same;
- skip a week → the same remaining blocks redistribute over the days that are
  left. Nothing is lost, nothing hides;
- overdue → remaining blocks pile onto today and turn red.

Drag a block to another day to **pin** it; pins survive recascades (stale pins
to passed days are quietly forgiven). Statuses are derived, never stored.

## Group sync (`src/lib/group.ts`)

Milestone health = logged blocks vs. the straight-line expectation between
start and due date: `behind` (≥2 blocks under), `at-risk` (under), `on-track`,
`done`, plus overdue escalation. Peers are simulated locally so the whole hub
works end-to-end offline; swap the store's group reducer for a server sync when
you're ready.

## Keyboard

`1–5` views · `n` new deliverable · `g` group sync · `t` calendar · `?` help ·
`Esc` closes modals · drag blocks between days · double-click logs a block done.

## Data

Everything lives in `localStorage` (`atlas.study.v1`). No account, no network.
**Term Setup → Reset all data** clears it. The service worker (`public/sw.js`)
caches the app shell for offline use once installed.
