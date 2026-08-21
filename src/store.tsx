/* atlas — app state. One reducer, persisted to localStorage, derived
 * schedules computed on read. No external state library needed. */

import { createContext, useContext, useEffect, useMemo, useReducer } from 'react';
import type { ReactNode } from 'react';
import { todayKey } from './lib/dates';
import { blankState, demoState } from './lib/seed';
import { uid } from './lib/ids';
import type { AppState, Deliverable, Group, Subject, Term } from './lib/types';

const KEY = 'atlas.study.v1';

type Action =
  | { type: 'load-demo' }
  | { type: 'reset' }
  | { type: 'finish-setup'; state: AppState }
  | { type: 'term'; term: Term }
  | { type: 'subject-add'; subject: Subject }
  | { type: 'subject-remove'; id: string }
  | { type: 'deliverable-add'; d: Omit<Deliverable, 'id' | 'completedBlocks' | 'delayedAt' | 'manual' | 'createdAt'> }
  | { type: 'deliverable-update'; id: string; patch: Partial<Deliverable> }
  | { type: 'deliverable-remove'; id: string }
  | { type: 'block-done'; id: string }          // deliverable block completed today
  | { type: 'flag-delayed'; id: string }
  | { type: 'pin-block'; id: string; index: number; date: string }
  | { type: 'milestone-progress'; groupId: string; milestoneId: string; delta: number }
  | { type: 'milestone-owner'; groupId: string; milestoneId: string; ownerId: string };

function reducer(state: AppState, a: Action): AppState {
  switch (a.type) {
    case 'load-demo':
      return demoState();
    case 'reset':
      return blankState();
    case 'finish-setup':
      return { ...a.state, setupDone: true };
    case 'term':
      return { ...state, term: a.term };
    case 'subject-add':
      return { ...state, subjects: [...state.subjects, a.subject] };
    case 'subject-remove':
      return {
        ...state,
        subjects: state.subjects.filter((s) => s.id !== a.id),
        deliverables: state.deliverables.filter((d) => d.subjectId !== a.id)
      };
    case 'deliverable-add':
      return {
        ...state,
        deliverables: [...state.deliverables, {
          ...a.d,
          id: uid('dlv'),
          completedBlocks: 0,
          delayedAt: null,
          manual: {},
          createdAt: todayKey()
        }]
      };
    case 'deliverable-update':
      return {
        ...state,
        deliverables: state.deliverables.map((d) => (d.id === a.id ? { ...d, ...a.patch } : d))
      };
    case 'deliverable-remove':
      return { ...state, deliverables: state.deliverables.filter((d) => d.id !== a.id) };
    case 'block-done':
      return {
        ...state,
        deliverables: state.deliverables.map((d) =>
          d.id === a.id ? { ...d, completedBlocks: Math.min(d.completedBlocks + 1, 999) } : d)
      };
    case 'flag-delayed':
      return {
        ...state,
        deliverables: state.deliverables.map((d) =>
          d.id === a.id ? { ...d, delayedAt: todayKey() } : d)
      };
    case 'pin-block':
      return {
        ...state,
        deliverables: state.deliverables.map((d) =>
          d.id === a.id ? { ...d, manual: { ...d.manual, [a.index]: a.date } } : d)
      };
    case 'milestone-progress':
      return updateGroup(state, a.groupId, (g) => ({
        ...g,
        milestones: g.milestones.map((m) =>
          m.id === a.milestoneId
            ? { ...m, completedBlocks: Math.max(0, Math.min(m.completedBlocks + a.delta, 99)) }
            : m)
      }));
    case 'milestone-owner':
      return updateGroup(state, a.groupId, (g) => ({
        ...g,
        milestones: g.milestones.map((m) =>
          m.id === a.milestoneId ? { ...m, ownerId: a.ownerId } : m)
      }));
    default:
      return state;
  }
}

function updateGroup(state: AppState, groupId: string, fn: (g: Group) => Group): AppState {
  return { ...state, groups: state.groups.map((g) => (g.id === groupId ? fn(g) : g)) };
}

function load(): AppState {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as AppState;
      if (parsed && parsed.term && Array.isArray(parsed.subjects)) {
        return { ...blankState(), ...parsed };
      }
    }
  } catch { /* corrupted storage -> fresh start */ }
  return blankState();
}

type Ctx = {
  state: AppState;
  dispatch: (a: Action) => void;
};

const StoreCtx = createContext<Ctx | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, load);

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch { /* storage full/blocked — app still works in memory */ }
  }, [state]);

  const value = useMemo(() => ({ state, dispatch }), [state]);
  return <StoreCtx.Provider value={value}>{children}</StoreCtx.Provider>;
}

export function useStore(): Ctx {
  const ctx = useContext(StoreCtx);
  if (!ctx) throw new Error('useStore outside provider');
  return ctx;
}

/** Convenience: subject lookup by id. */
export function useSubject(id: string): Subject | undefined {
  const { state } = useStore();
  return state.subjects.find((s) => s.id === id);
}
