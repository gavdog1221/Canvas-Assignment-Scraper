// Bottom-left half of the fullscreen dashboard: "Recent Grades" feed — the
// freshest graded submissions (assignment title, course tag, score received,
// date posted), newest first, scrolling internally inside its half-height
// column. Reuses createGradeCard (the same compact row the Grades tab's
// "Recent Feedback" list renders) so both graded feeds look identical; this
// panel is just a sorted, capped slice of state.cachedGrades.

import { state } from '../state.js';
import { createGradeCard } from '../views/grades-view.js';

export function renderRecentGradesView(listContainer, hiddenCourses) {
    listContainer.innerHTML = '';

    // Only actual graded results belong here (a score is a number — 0 is a
    // legitimately earned zero); submitted-but-unscored entries would show up
    // as empty "✓" cards and add noise to a compact feed.
    const scored = (state.cachedGrades || []).filter(g => {
      if (hiddenCourses.includes(g.courseKey)) return false;
      return g && typeof g.score === 'number';
    });

    if (scored.length === 0) {
      listContainer.innerHTML = '<div class="mod-empty-msg">No grades posted yet.</div>';
      return;
    }

    // Newest-graded first; entries without a gradedAt stamp sink to the end
    // (matching the Grades tab's "recent" default ordering).
    const rows = [...scored].sort((a, b) => {
      if (a.gradedAt && b.gradedAt) return b.gradedAt - a.gradedAt;
      if (a.gradedAt) return -1;
      if (b.gradedAt) return 1;
      return 0;
    });

    rows.slice(0, 40).forEach(g => listContainer.appendChild(createGradeCard(g)));
  }