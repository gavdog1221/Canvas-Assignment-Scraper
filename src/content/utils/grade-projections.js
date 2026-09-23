import { state } from '../state.js';

// Letter tiers mirror percentageToGpa() in utils/grades.js (kept here to
// avoid an import cycle): the % needed on remaining work to *reach* each
// tier's floor, highest letter first.
export const LETTER_TIERS = [
  { letter: 'A', min: 93 },
  { letter: 'A-', min: 90 },
  { letter: 'B+', min: 87 },
  { letter: 'B', min: 83 },
  { letter: 'B-', min: 80 },
  { letter: 'C+', min: 77 },
  { letter: 'C', min: 73 },
  { letter: 'C-', min: 70 },
  { letter: 'D+', min: 67 },
  { letter: 'D', min: 60 },
];

// Both syllabus *labels* and graded *item titles* are mapped through this
// same ordered list, so a "Final Project 25%" category and a "Final Project"
// assignment land on the same bucket no matter how a syllabus words things.
// Order matters: `final` is deliberately checked first so "Final Exam" and
// "Final Project" group under the same key as the syllabus label.
const CATEGORY_PATTERN = [
  { key: 'final', re: /\bfinal\b/ },
  { key: 'midterm', re: /\bmid[\s-]?terms?\b|\bexam(?:s)?\b|\btest(?:s)?\b/ },
  { key: 'project', re: /\bproject(?:s)?\b/ },
  { key: 'quiz', re: /\bquiz(?:zes|z)?\b/ },
  { key: 'lab', re: /\blab(?:s|oratory)?\b/ },
  { key: 'homework', re: /\b(?:hw|home\s?work|problem\s*set(?:s)?|pset(?:s)?|assignment(?:s)?)\b/ },
  { key: 'writing', re: /\b(?:paper(?:s)?|essay(?:s)?|writing|report(?:s)?)\b/ },
  { key: 'participation', re: /\b(?:participation|attendance|discussion(?:s)?)\b/ },
  { key: 'reading', re: /\breading(?:s)?\b/ },
  { key: 'presentation', re: /\bpresentation(?:s)?\b/ },
];

function categorizeText(score) {
    const t = String(score || '').toLowerCase();
    if (!t) return 'other';
    for (const p of CATEGORY_PATTERN) {
      if (p.re.test(t)) return p.key;
    }
    return 'other';
  }

// Sums earned/possible points per category for one course, drawing from the
// graded-feedback list plus any active what-if simulations (added on top,
// matching the additive what-if semantics in utils/grades.js).
function buildGradedByCategory(courseKey) {
    const map = {};
    (state.cachedGrades || []).forEach(g => {
      if (g.courseKey !== courseKey) return;
      if (g.score === null || !(g.pointsPossible > 0)) return;
      const cat = categorizeText(g.title);
      if (!map[cat]) map[cat] = { earned: 0, possible: 0 };
      map[cat].earned += g.score;
      map[cat].possible += g.pointsPossible;
    });

    Object.entries(state.whatIfScores).forEach(([taskId, sim]) => {
      if (sim.courseKey !== courseKey) return;
      if (sim.score === null || !(sim.pointsPossible > 0)) return;
      const course = state.cachedCourseMap[courseKey];
      const task = (course && course.tasks || []).find(t => t.id === taskId);
      const cat = categorizeText(task ? task.title : taskId);
      if (!map[cat]) map[cat] = { earned: 0, possible: 0 };
      map[cat].earned += sim.score;
      map[cat].possible += sim.pointsPossible;
    });

    return map;
  }

// Weighted "grade so far" (0-100) using the syllabus breakdown, renormalized
// over categories that have been graded so far. Returns null when the course
// has no usable weights or too little of the grade is graded to trust the
// renormalization (< 10 percentage points of the total).
export function computeWeightedCoursePct(courseKey) {
    const course = state.cachedCourseMap[courseKey];
    const weights = course && course.resources && Array.isArray(course.resources.gradeWeights)
    ? course.resources.gradeWeights
    : null;
    if (!weights || weights.length === 0) return null;

    const weightByCat = {};
    weights.forEach(w => {
      const cat = categorizeText(w.label);
      weightByCat[cat] = (weightByCat[cat] || 0) + (Number(w.pct) || 0);
    });

    const graded = buildGradedByCategory(courseKey);
    let gradedWeight = 0;
    let weightedPoints = 0;
    Object.keys(graded).forEach(cat => {
      const d = graded[cat];
      if (!d.possible) return;
      const w = weightByCat[cat];
      if (!w) return;
      gradedWeight += w;
      weightedPoints += w * (d.earned / d.possible);
    });

    if (gradedWeight < 10) return null;
    return Math.round((weightedPoints / gradedWeight) * 1000) / 10;
  }

// Full projection for one course:
//   - weights:      the syllabus breakdown [{label, pct}] or null
//   - weighted:     whether the weighted model was used
//   - weightedPct:  weighted grade-so-far (null when unusable)
//   - graded:       whether any graded/simulated work exists
//   - hasRemaining: whether ungraded work remains to project against
//   - needed:       [{letter, min, pct}] the % needed on that remaining work
//                   to reach each tier, high-to-low, only tiers that are
//                   still feasible (0 < pct < 100).
//
// With weights the math is: overall = Σ w_i·pct_i (percentage-points), and
// the ungraded share is 100 − Σ w_i over graded categories. Without weights
// it falls back to the equal-points model: remaining possible points vs.
// the target fraction of the total.
export function computeCourseProjection(courseKey) {
    const course = state.cachedCourseMap[courseKey];
    if (!course) return null;
    const weights = Array.isArray(course.resources && course.resources.gradeWeights)
    ? course.resources.gradeWeights
    : null;

    const graded = buildGradedByCategory(courseKey);

    if (weights && weights.length > 0) {
      const weightByCat = {};
      weights.forEach(w => {
        const cat = categorizeText(w.label);
        weightByCat[cat] = (weightByCat[cat] || 0) + (Number(w.pct) || 0);
      });

      let gradedWeight = 0;
      let weightedPoints = 0;
      Object.keys(graded).forEach(cat => {
        const d = graded[cat];
        if (!d.possible) return;
        const w = weightByCat[cat];
        if (!w) return;
        gradedWeight += w;
        weightedPoints += w * (d.earned / d.possible);
      });

      const weightedPct = gradedWeight > 0 ? Math.round((weightedPoints / gradedWeight) * 1000) / 10 : null;
      const remainingWeight = 100 - gradedWeight;
      const needed = remainingWeight > 0
      ? LETTER_TIERS
        .map(t => ({ letter: t.letter, min: t.min, pct: Math.round(((t.min - weightedPoints) / remainingWeight) * 1000) / 10 }))
        .filter(n => n.pct > 0 && n.pct < 100)
      : [];

      return {
        weights,
        weighted: true,
        weightedPct,
        graded: gradedWeight > 0,
        hasRemaining: remainingWeight > 0,
        needed,
      };
    }

    // Equal-points fallback: everything weighs by points, as in
    // computeCoursePercentagesWithWhatIf().
    const tasks = (course.tasks || []).filter(t => t.points && t.points > 0);
    let totalPossible = tasks.reduce((a, t) => a + t.points, 0);

    let earned = 0;
    let gradedPossible = 0;
    (state.cachedGrades || []).forEach(g => {
      if (g.courseKey !== courseKey) return;
      if (g.score !== null && g.pointsPossible > 0) {
        earned += g.score;
        gradedPossible += g.pointsPossible;
      }
    });
    Object.entries(state.whatIfScores).forEach(([, sim]) => {
      if (sim.courseKey !== courseKey) return;
      if (sim.score !== null && sim.pointsPossible > 0) {
        earned += sim.score;
        gradedPossible += sim.pointsPossible;
      }
    });
    totalPossible = Math.max(totalPossible, gradedPossible);
    const remainingPossible = totalPossible - gradedPossible;

    const needed = remainingPossible > 0 && totalPossible > 0
    ? LETTER_TIERS
      .map(t => ({ letter: t.letter, min: t.min, pct: Math.round((((t.min / 100) * totalPossible - earned) / remainingPossible) * 1000) / 10 }))
      .filter(n => n.pct > 0 && n.pct < 100)
    : [];

    return {
      weights: null,
      weighted: false,
      weightedPct: null,
      graded: gradedPossible > 0,
      hasRemaining: remainingPossible > 0,
      needed,
    };
  }

// ---------- Final-exam calculator -------------------------------------------
// "What do I need on the final?" — isolates the course's final (the
// 'final'-category syllabus slot, or the final task with points) and solves
// for the % needed ON THAT ITEM to reach each letter tier, holding everything
// graded so far constant:
//   - weighted model: overall = Σ wᵢ·pctᵢ percentage-points, so the final is
//     its own w_final slot and other still-ungraded categories are assumed to
//     land at the current weighted average (i.e. they're ignored, which is
//     the standard exam-calculator assumption).
//   - equal-points model: other remaining work is assumed to score at the
//     current achieved percentage (earned/gradedPossible); the final's share
//     is solved for.
// Returns null when there's no identifiable final or no graded baseline yet —
// the generic "need on remaining" projection covers those cases instead.
export function computeFinalExamNeeds(courseKey) {
    const course = state.cachedCourseMap[courseKey];
    if (!course) return null;

    const weights = Array.isArray(course.resources && course.resources.gradeWeights)
      ? course.resources.gradeWeights
      : null;
    const graded = buildGradedByCategory(courseKey);

    if (weights && weights.length > 0) {
      const weightByCat = {};
      weights.forEach(w => {
        const cat = categorizeText(w.label);
        weightByCat[cat] = (weightByCat[cat] || 0) + (Number(w.pct) || 0);
      });
      const finalWeight = weightByCat['final'] || 0;
      if (!(finalWeight > 0)) return null;

      let gradedWeight = 0;
      let weightedPoints = 0;
      Object.keys(graded).forEach(cat => {
        const d = graded[cat];
        if (!d.possible) return;
        const w = weightByCat[cat];
        if (!w) return;
        gradedWeight += w;
        weightedPoints += w * (d.earned / d.possible);
      });
      if (!(gradedWeight > 0)) return null;

      const scopeWeight = gradedWeight + finalWeight;
      const needs = LETTER_TIERS
        .map(t => ({ letter: t.letter, min: t.min, pct: Math.round(((t.min / 100) * scopeWeight - weightedPoints) / finalWeight * 1000) / 10 }))
        .filter(n => n.pct > 0 && n.pct < 100);

      return {
        finalName: 'the final',
        worthLabel: `${finalWeight}% of the grade`,
        needs,
      };
    }

    // Equal-points fallback.
    const finalTask = findFinalTask(course);
    if (!finalTask) return null;
    const finalPoints = finalTask.points;
    const tasks = (course.tasks || []).filter(t => t.points && t.points > 0);
    let totalPossible = tasks.reduce((a, t) => a + t.points, 0);

    let earned = 0;
    let gradedPossible = 0;
    (state.cachedGrades || []).forEach(g => {
      if (g.courseKey !== courseKey) return;
      if (g.score !== null && g.pointsPossible > 0) {
        earned += g.score;
        gradedPossible += g.pointsPossible;
      }
    });
    Object.entries(state.whatIfScores).forEach(([, sim]) => {
      if (sim.courseKey !== courseKey) return;
      if (sim.score !== null && sim.pointsPossible > 0) {
        earned += sim.score;
        gradedPossible += sim.pointsPossible;
      }
    });
    totalPossible = Math.max(totalPossible, gradedPossible);
    if (!(gradedPossible > 0)) return null;

    // Other ungraded tasks (everything except the final) are assumed to land
    // at the current achieved percentage, so the final's score separates out.
    const otherRemaining = Math.max(0, totalPossible - gradedPossible - finalPoints);
    let baseEarned = earned;
    if (otherRemaining > 0) {
      baseEarned += otherRemaining * (earned / gradedPossible);
    }

    const needs = LETTER_TIERS
      .map(t => ({ letter: t.letter, min: t.min, pct: Math.round((((t.min / 100) * totalPossible - baseEarned) / finalPoints) * 1000) / 10 }))
      .filter(n => n.pct > 0 && n.pct < 100);

    return {
      finalName: finalTask.title,
      worthLabel: `${finalPoints} pts`,
      needs,
    };
  }

// Pulls the course's final out of its task list: prefers a real exam ("Final
// Exam", "Comprehensive Final", a bare trailing "Final") over Final Projects
// that merely share the word, then falls back to the largest 'final'-category
// item with points.
function findFinalTask(course) {
    const withPoints = (course.tasks || []).filter(t => t.points && t.points > 0);
    if (!withPoints.length) return null;
    const examLike = withPoints.filter(t =>
      /\bfinal\s*exams?\b|\bcomprehensive\s+final\b|\bfinal\s*$/i.test(String(t.title).trim()));
    if (examLike.length) return examLike.sort((a, b) => b.points - a.points)[0];
    const finalCat = withPoints.filter(t => categorizeText(t.title) === 'final');
    if (finalCat.length) return finalCat.sort((a, b) => b.points - a.points)[0];
    return null;
  }