/* atlas — domain types. Dates are local 'YYYY-MM-DD' keys throughout. */

export type DateKey = string; // 'YYYY-MM-DD'

export type Subject = {
  id: string;
  name: string;
  color: string;          // tailwind-ish accent token, see SUBJECT_COLORS
};

/** A major final deliverable that the cascader breaks into daily micro-tasks. */
export type Deliverable = {
  id: string;
  subjectId: string;
  title: string;
  dueAt: DateKey;
  startAt: DateKey | null;     // when work may begin (defaults to term start)
  estHours: number;            // total estimated hours
  weight: number | null;       // % of final grade, optional
  completedBlocks: number;     // micro-tasks finished so far
  delayedAt: DateKey | null;   // last explicit "I am behind" flag
  manual: Record<number, DateKey>; // blockIndex -> pinned date (drag & drop)
  createdAt: DateKey;
};

export type Member = { id: string; name: string; initials: string; hue: string };

/** A shared group deliverable / milestone. */
export type Milestone = {
  id: string;
  title: string;
  ownerId: string;
  startsAt: DateKey;
  dueAt: DateKey;
  estHours: number;
  completedBlocks: number;
};

export type Group = {
  id: string;
  name: string;
  members: Member[];      // members[0] is you
  milestones: Milestone[];
};

export type Term = {
  name: string;
  startsAt: DateKey;
  endsAt: DateKey;
  blockHours: number;         // hours per micro-task block (default 1.5)
  includeWeekends: boolean;
};

export type AppState = {
  setupDone: boolean;
  term: Term;
  subjects: Subject[];
  deliverables: Deliverable[];
  groups: Group[];
};

/* Cascade engine output */

export type Block = {
  id: string;               // `${deliverableId}#${index}`
  deliverableId: string;
  index: number;            // 0-based position in the whole plan
  total: number;            // total blocks in the plan
  date: DateKey;            // scheduled day
  hours: number;
  pinned: boolean;          // placed by drag & drop, not the algorithm
};

export type Schedule = {
  deliverableId: string;
  total: number;
  done: number;
  remaining: number;
  blocks: Block[];          // remaining (undone) blocks, earliest first
  daysLeft: number;         // working days until due
  perDay: number;           // blocks now scheduled per day
  overdue: boolean;
  hoursPerDay: number;
};

export type MilestoneStatus = {
  expected: number;         // blocks that should be done by now
  status: 'done' | 'on-track' | 'at-risk' | 'behind';
  pct: number;              // 0..1 actual vs plan
};
