import { STORAGE_KEY_GRADE_SNAPSHOT } from '../constants.js';

// Grade-change alerts: each successful scan snapshots every graded entry
// (courseKey::title::pointsPossible -> score/pct) so the next scan can diff
// against it and surface "MATH 425: 17/20 -> 19/20" style notifications in
// the Grades tab. The snapshot itself is zoned per scan, not per day.

function gradeKey(g) {
    return `${g.courseKey}::${g.title}::${g.pointsPossible}`;
  }

export function buildGradeSnapshot(grades) {
    const snap = {};
    (grades || []).forEach(g => {
      if (g.score === null || g.score === undefined) return;
      snap[gradeKey(g)] = {
        score: g.score,
        pct: g.pointsPossible > 0 ? (g.score / g.pointsPossible) * 100 : null
      };
    });
    return snap;
  }

export function computeGradeChanges(prev, grades) {
    const changes = [];
    const seen = new Set();
    (grades || []).forEach(g => {
      if (g.score === null || g.score === undefined) return;
      const key = gradeKey(g);
      if (seen.has(key)) return; // merged canvas+gradescope collisions
      seen.add(key);
      const before = prev[key];
      const pct = g.pointsPossible > 0 ? (g.score / g.pointsPossible) * 100 : null;
      if (!before) {
        changes.push({
          courseKey: g.courseKey, courseName: g.courseName, title: g.title,
          pointsPossible: g.pointsPossible, score: g.score, pct,
          isNew: true
        });
      } else if (before.score !== g.score) {
        changes.push({
          courseKey: g.courseKey, courseName: g.courseName, title: g.title,
          pointsPossible: g.pointsPossible, score: g.score, pct,
          oldScore: before.score, oldPct: before.pct,
          isNew: false
        });
      }
    });
    return changes.slice(0, 5);
  }

export function loadGradeSnapshot() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY_GRADE_SNAPSHOT) || 'null');
    } catch {
      return null;
    }
  }

export function saveGradeSnapshot(snapshot) {
    try {
      localStorage.setItem(STORAGE_KEY_GRADE_SNAPSHOT, JSON.stringify(snapshot));
    } catch (e) {}
  }