/* atlas — demo term seed, so the whole app can be explored in one click. */

import { addDays, dateKey } from './dates.ts';
import type { AppState, Deliverable, Group } from './types';

const day = (offset: number) => dateKey(addDays(new Date(), offset));

export function demoState(): AppState {
  return {
    setupDone: true,
    term: {
      name: 'Term 1 · 2026/27',
      startsAt: day(-10),
      endsAt: day(60),
      blockHours: 1.5,
      includeWeekends: false
    },
    subjects: [
      { id: 'sub_hist', name: 'History HL', color: 'rose' },
      { id: 'sub_bio', name: 'Biology HL', color: 'emerald' },
      { id: 'sub_math', name: 'Maths AA HL', color: 'sky' },
      { id: 'sub_eng', name: 'English A', color: 'amber' },
      { id: 'sub_tok', name: 'Theory of Knowledge', color: 'violet' }
    ],
    deliverables: [
      {
        id: 'dlv_ia', subjectId: 'sub_hist', title: 'Historical Investigation (IA)',
        dueAt: day(21), startAt: null, estHours: 20, weight: 20,
        completedBlocks: 3, delayedAt: null, manual: {}, createdAt: day(-9)
      },
      {
        id: 'dlv_lab', subjectId: 'sub_bio', title: 'Ecology field-work lab report',
        dueAt: day(9), startAt: null, estHours: 9, weight: 15,
        completedBlocks: 1, delayedAt: null, manual: {}, createdAt: day(-8)
      },
      {
        id: 'dlv_p1', subjectId: 'sub_math', title: 'Paper 1 mock — full review',
        dueAt: day(4), startAt: null, estHours: 6, weight: null,
        completedBlocks: 0, delayedAt: null, manual: {}, createdAt: day(-6)
      },
      {
        id: 'dlv_essay', subjectId: 'sub_eng', title: 'Comparative essay — final draft',
        dueAt: day(14), startAt: null, estHours: 12, weight: 25,
        completedBlocks: 2, delayedAt: null, manual: {}, createdAt: day(-12)
      },
      {
        id: 'dlv_tok', subjectId: 'sub_tok', title: 'TOK exhibition draft',
        dueAt: day(35), startAt: null, estHours: 10, weight: 10,
        completedBlocks: 0, delayedAt: null, manual: {}, createdAt: day(-3)
      }
    ],
    groups: [
      {
        id: 'grp_sci',
        name: 'Sci Fair — Group 4 Project',
        members: [
          { id: 'me', name: 'You', initials: 'ME', hue: '#e4e4e7' },
          { id: 'm_rio', name: 'Rio T.', initials: 'RT', hue: '#7dd3fc' },
          { id: 'm_maya', name: 'Maya K.', initials: 'MK', hue: '#fca5a5' },
          { id: 'm_sam', name: 'Sam O.', initials: 'SO', hue: '#d8b4fe' }
        ],
        milestones: [
          { id: 'ms_prop', title: 'Research question + proposal', ownerId: 'm_rio',
            startsAt: day(-14), dueAt: day(-4), estHours: 4, completedBlocks: 3 },   // overdue
          { id: 'ms_data', title: 'Data collection (field + lab)', ownerId: 'me',
            startsAt: day(-6), dueAt: day(5), estHours: 9, completedBlocks: 2 },     // at risk / behind
          { id: 'ms_board', title: 'Presentation board build', ownerId: 'm_maya',
            startsAt: day(6), dueAt: day(16), estHours: 6, completedBlocks: 0 },     // not started yet
          { id: 'ms_script', title: 'Talking-script + rehearsal', ownerId: 'm_sam',
            startsAt: day(12), dueAt: day(20), estHours: 3, completedBlocks: 0 }
        ]
      }
    ]
  };
}

export function blankState(): AppState {
  return {
    setupDone: false,
    term: { name: 'Term 1', startsAt: dateKey(new Date()), endsAt: day(120), blockHours: 1.5, includeWeekends: false },
    subjects: [],
    deliverables: [],
    groups: []
  };
}

export function demoDeliverableTemplate(subjectId: string): Partial<Deliverable> {
  return { subjectId, estHours: 10 };
}

export type { Group };
