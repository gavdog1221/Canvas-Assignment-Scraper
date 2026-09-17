import { state } from '../state.js';

export function percentageToGpa(pct) {
    if (pct >= 93) return { gpa: 4.0, letter: 'A' };
    if (pct >= 90) return { gpa: 3.7, letter: 'A-' };
    if (pct >= 87) return { gpa: 3.3, letter: 'B+' };
    if (pct >= 83) return { gpa: 3.0, letter: 'B' };
    if (pct >= 80) return { gpa: 2.7, letter: 'B-' };
    if (pct >= 77) return { gpa: 2.3, letter: 'C+' };
    if (pct >= 73) return { gpa: 2.0, letter: 'C' };
    if (pct >= 70) return { gpa: 1.7, letter: 'C-' };
    if (pct >= 67) return { gpa: 1.3, letter: 'D+' };
    if (pct >= 60) return { gpa: 1.0, letter: 'D' };
    return { gpa: 0.0, letter: 'F' };
  }

export function gradeTierClass(pct) {
    if (pct === null || pct === undefined || isNaN(pct)) return 'tier-none';
    if (pct >= 90) return 'tier-a';
    if (pct >= 80) return 'tier-b';
    if (pct >= 70) return 'tier-c';
    if (pct >= 60) return 'tier-d';
    return 'tier-f';
  }

export function formatScoreNum(n) {
    if (n === null || n === undefined || isNaN(n)) return '—';
    return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/\.?0+$/, '');
  }

export function computeCoursePercentagesWithWhatIf(hiddenCourses) {
    const courseTotals = {};

    (state.cachedGrades || []).forEach(g => {
      if (hiddenCourses.includes(g.courseKey)) return;
      if (g.score !== null && g.pointsPossible && g.pointsPossible > 0) {
        if (!courseTotals[g.courseKey]) courseTotals[g.courseKey] = { earned: 0, possible: 0 };
        courseTotals[g.courseKey].earned += g.score;
        courseTotals[g.courseKey].possible += g.pointsPossible;
      }
    });

    Object.entries(state.whatIfScores).forEach(([taskId, sim]) => {
      if (hiddenCourses.includes(sim.courseKey)) return;
      if (sim.score !== null && sim.pointsPossible > 0) {
        if (!courseTotals[sim.courseKey]) courseTotals[sim.courseKey] = { earned: 0, possible: 0 };
        courseTotals[sim.courseKey].earned += sim.score;
        courseTotals[sim.courseKey].possible += sim.pointsPossible;
      }
    });

    const activeKeys = Object.keys(state.cachedCourseMap).filter(k => !hiddenCourses.includes(k));
    const result = {};

    activeKeys.forEach(cKey => {
      const totals = courseTotals[cKey];
      if (totals && totals.possible > 0) {
        result[cKey] = Math.round((totals.earned / totals.possible) * 1000) / 10;
      } else if (state.cachedCoursePercentages[cKey] !== undefined && state.cachedCoursePercentages[cKey] !== null) {
        result[cKey] = state.cachedCoursePercentages[cKey];
      } else {
        result[cKey] = null;
      }
    });

    return result;
  }
