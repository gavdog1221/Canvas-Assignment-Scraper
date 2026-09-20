// Centralized mutable store. Every module that used to read/write one of the
// top-level `let` bindings in the old content.js closure now does
// `import { state } from '../state.js'` and reads/writes `state.<name>`
// instead -- this preserves the original single-shared-instance behavior
// across an ES module graph (bare `let` exports can't be reassigned from
// importing modules, so a plain object is used instead of many `let` exports).

import {
  STORAGE_KEY_THEME,
  STORAGE_KEY_MINIMIZED,
  STORAGE_KEY_WHATIF,
  STORAGE_KEY_DOM_COLORS,
} from './constants.js';

export const state = {
  currentTheme: localStorage.getItem(STORAGE_KEY_THEME) || 'cyan',

  currentTab: 'upcoming',
  activeCourseFilter: 'ALL',
  activeDayFilter: null,
  assignmentRangeFilter: '2weeks', // 'today' | 'week' | '2weeks' | 'month' | 'all'
  searchQuery: '',
  isHiddenMenuOpen: false,

  cachedCourseMap: {},
  cachedGrades: [],
  cachedCoursePercentages: {},
  whatIfScores: {},
  gradeChangeAlerts: [],
  domCourseColors: {},
  cachedAnnouncements: [],
  cachedUnreadInboxCount: 0,

  isMinimized: localStorage.getItem(STORAGE_KEY_MINIMIZED) === 'true',
  isFullscreen: false, // not persisted -- always starts back in sidebar mode on page load

  selectedTaskIndex: -1,
  cachedDiningMenu: null,
  activeDiningHall: 80, // 80 = Holloway Commons (HoCo), 30 = Philbrook (Philly), 50 = Stillings

  showAllCompleted: false,
  showAllOverdue: false,
  lastViewSignature: '',
  gradesSortMode: 'recent', // 'recent' | 'highest' | 'lowest'

  // --- Custom Assignment Maker state ---
  editingAssignmentId: null,
  modalSelectedDays: new Set(),
  modalSelectedColor: '',

  // --- Dining view state ---
  diningCache: {
    date: null,
    80: null, // HoCo
    30: null, // Philly
  },
  cachedOfficialHours: null,
  activeStationFilter: '__DEFAULT__',
};

try {
  state.whatIfScores = JSON.parse(localStorage.getItem(STORAGE_KEY_WHATIF) || '{}');
} catch {
  state.whatIfScores = {};
}

try {
  state.domCourseColors = JSON.parse(localStorage.getItem(STORAGE_KEY_DOM_COLORS) || '{}');
} catch {
  state.domCourseColors = {};
}
