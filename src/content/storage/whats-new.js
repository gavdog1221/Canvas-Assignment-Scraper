import { state } from '../state.js';
import { STORAGE_KEY_WHATS_NEW } from '../constants.js';
import { buildGradeSnapshot, computeGradeChanges, gradeKey } from './grade-alerts.js';

// What's-new baseline: every successful data scan snapshots the current set
// of task ids, announcement ids, and graded entries so the next scan (or next
// visit) can diff against it and surface "X is new since you were last here"
// as a top toast banner. Like the grade-change snapshot (grade-alerts.js),
// the very first scan after a fresh install just establishes the baseline —
// it never toasts.

function loadBaseline() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY_WHATS_NEW) || 'null');
    } catch {
      return null;
    }
  }

function saveBaseline(baseline) {
    try {
      localStorage.setItem(STORAGE_KEY_WHATS_NEW, JSON.stringify(baseline));
    } catch (e) {}
  }

function collectTasks() {
    const tasks = [];
    const map = state.cachedCourseMap || {};
    Object.keys(map).forEach(k => {
      const course = map[k];
      if (!course || !Array.isArray(course.tasks)) return;
      course.tasks.forEach(t => tasks.push(t));
    });
    return tasks;
  }

function collectIds(items, idFn) {
    const out = {};
    (items || []).forEach(item => {
      const id = idFn(item);
      if (id !== null && id !== undefined && id !== '') out[id] = 1;
    });
    return out;
  }

function buildBaseline() {
    return {
      tasks: collectIds(collectTasks(), t => t.id),
      announcements: collectIds(state.cachedAnnouncements || [], a => a.id),
      grades: buildGradeSnapshot(state.cachedGrades || [])
    };
  }

// Total count of graded entries whose score differs from the baseline. Used
// for the banner's count pill because computeGradeChanges caps its detail
// list at 5 entries.
function countGradeChanges(prev, grades) {
    const seen = new Set();
    let count = 0;
    (grades || []).forEach(g => {
      if (g.score === null || g.score === undefined) return;
      const key = gradeKey(g);
      if (seen.has(key)) return;
      seen.add(key);
      const before = prev[key];
      if (!before) count++;
      else if (before.score !== g.score) count++;
    });
    return count;
  }

export function computeWhatsNew() {
    const map = state.cachedCourseMap || {};
    if (!Object.keys(map).length) return null; // nothing scanned yet — leave the baseline alone

    const baseline = loadBaseline();
    if (!baseline) {
      saveBaseline(buildBaseline());
      return null;
    }

    const newAssignments = collectTasks().filter(t => !baseline.tasks[t.id]);
    const newUpdates = (state.cachedAnnouncements || []).filter(a => !baseline.announcements[a.id]);
    const grades = computeGradeChanges(baseline.grades || {}, state.cachedGrades || []);
    const gradeTotal = countGradeChanges(baseline.grades || {}, state.cachedGrades || []);

    // Advance the baseline immediately so each item toasts only once.
    saveBaseline(buildBaseline());

    if (!newAssignments.length && !newUpdates.length && !gradeTotal) return null;

    return {
      assignments: newAssignments,
      updates: newUpdates,
      grades: grades,
      gradeTotal: gradeTotal
    };
  }