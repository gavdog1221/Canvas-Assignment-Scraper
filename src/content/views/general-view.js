import { state } from '../state.js';
import { getCompletedTasks } from '../storage/completed-tasks.js';
import { effectiveDueDate } from '../storage/custom-due-dates.js';
import { getCourseColors } from '../utils/colors.js';
import { escapeHTML } from '../utils/text.js';
import { gradeTierClass, formatScoreNum, computeCoursePercentagesWithWhatIf } from '../utils/grades.js';

// Picks the earliest not-yet-done task with a due date. Ties (rare) go to
// whichever appears first in the course's own task list.
function findNextDue(tasks, completedMap) {
  let next = null;
  (tasks || []).forEach((t) => {
    if (completedMap[t.id]) return;
    const ed = effectiveDueDate(t);
    if (!ed) return;
    if (!next || ed < next.dueDate) next = { task: t, dueDate: ed };
  });
  return next;
}

function formatDueLabel(date) {
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();
  const tomorrow = new Date(now); tomorrow.setDate(now.getDate() + 1);
  const isTomorrow = date.toDateString() === tomorrow.toDateString();
  const time = date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  if (isToday) return `Today, ${time}`;
  if (isTomorrow) return `Tomorrow, ${time}`;
  return `${date.toLocaleDateString([], { month: 'short', day: 'numeric' })}, ${time}`;
}

export function renderGeneralView(listContainer, hiddenCourses) {
  listContainer.innerHTML = '';

  let courseKeys = Object.keys(state.cachedCourseMap).filter(k => !hiddenCourses.includes(k));

  if (state.activeCourseFilter !== 'ALL') {
    courseKeys = courseKeys.filter(k => k === state.activeCourseFilter);
  }
  if (state.searchQuery) {
    courseKeys = courseKeys.filter(k => {
      const c = state.cachedCourseMap[k];
      return k.toLowerCase().includes(state.searchQuery) || (c.name || '').toLowerCase().includes(state.searchQuery);
    });
  }

  // Only courses we actually have a Canvas id (and therefore real
  // resource links) for — custom/manual tasks-only "courses" don't apply.
  courseKeys = courseKeys.filter(k => state.cachedCourseMap[k] && state.cachedCourseMap[k].canvasCourseId);
  courseKeys.sort((a, b) => (state.cachedCourseMap[a].name || a).localeCompare(state.cachedCourseMap[b].name || b));

  if (courseKeys.length === 0) {
    listContainer.innerHTML = state.searchQuery
    ? `<div class="mod-empty-msg">No classes match "${escapeHTML(state.searchQuery)}"</div>`
    : '<div class="mod-empty-msg">📚 No active classes found this term.</div>';
    return;
  }

  const completedMap = getCompletedTasks();
  const gradePercents = computeCoursePercentagesWithWhatIf(hiddenCourses);

  courseKeys.forEach(key => {
    const course = state.cachedCourseMap[key];
    const res = course.resources || {};
    const coursePalette = getCourseColors(key, course.canvasCourseId);

    const pct = gradePercents[key];
    const tier = gradeTierClass(pct);

    const tasks = course.tasks || [];
    const upcomingCount = tasks.filter(t => !completedMap[t.id] && effectiveDueDate(t) && effectiveDueDate(t) >= new Date()).length;
    const overdueCount = tasks.filter(t => !completedMap[t.id] && effectiveDueDate(t) && effectiveDueDate(t) < new Date()).length;
    const nextDue = findNextDue(tasks, completedMap);

    const card = document.createElement('div');
    card.className = `mod-task-card general-resource-card ${tier}`;
    card.style.setProperty('--task-course-accent', coursePalette.accent);
    card.style.setProperty('--task-course-glow', coursePalette.glow);
    card.style.setProperty('--task-course-soft', coursePalette.soft);

    const syllabusTitle = res.hasSyllabusContent ? 'Open full syllabus' : 'Syllabus looks empty on Canvas, but check anyway';

    card.innerHTML = `
      <div class="task-body">
        <div class="task-title-row">
          <span class="course-tag-chip">${escapeHTML(key)}</span>
          <span class="mod-task-title general-course-name" title="${escapeHTML(course.name || key)}">${escapeHTML(course.name || key)}</span>
          <span class="gci-badge ${tier}">${pct !== null ? formatScoreNum(pct) + '%' : 'No grade'}</span>
        </div>

        <div class="gci-stat-row">
          ${nextDue
            ? `<div class="gci-stat gci-next-due"><span class="gci-stat-label">Next due</span><span class="gci-stat-value">${escapeHTML(nextDue.task.title)} — ${escapeHTML(formatDueLabel(nextDue.dueDate))}</span></div>`
            : `<div class="gci-stat gci-next-due gci-stat-empty"><span class="gci-stat-label">Next due</span><span class="gci-stat-value">Nothing upcoming</span></div>`}
          <div class="gci-stat gci-counts">
            ${overdueCount > 0 ? `<span class="gci-count-pill is-overdue">${overdueCount} overdue</span>` : ''}
            <span class="gci-count-pill">${upcomingCount} upcoming</span>
          </div>
        </div>

        ${res.syllabusExcerpt
          ? `<p class="gci-syllabus-excerpt">${escapeHTML(res.syllabusExcerpt)}</p>`
          : `<p class="gci-syllabus-excerpt gci-syllabus-empty">No syllabus text posted for this course yet.</p>`}

        <div class="resource-links-row">
          <a href="${res.syllabusUrl || '#'}" target="_blank" rel="noopener noreferrer" class="resource-link-pill ${res.hasSyllabusContent ? '' : 'is-empty'}" title="${escapeHTML(syllabusTitle)}">📄 Syllabus</a>
          <a href="${res.modulesUrl || '#'}" target="_blank" rel="noopener noreferrer" class="resource-link-pill" title="Course Modules">🗂 Modules</a>
          <a href="${res.filesUrl || '#'}" target="_blank" rel="noopener noreferrer" class="resource-link-pill" title="Course Files">📁 Files</a>
          <a href="${res.gradesUrl || '#'}" target="_blank" rel="noopener noreferrer" class="resource-link-pill" title="Course Grades">📊 Grades</a>
          <a href="${res.homeUrl || '#'}" target="_blank" rel="noopener noreferrer" class="resource-link-pill" title="Course Home">🏠 Home</a>
        </div>

        <div class="rmp-panel" data-course-key="${escapeHTML(key)}">
          <div class="rmp-panel-header">
            <span class="rmp-panel-title">🎓 Rate My Professor</span>
            <span class="rmp-panel-badge">Coming soon</span>
          </div>
          <div class="rmp-panel-body">
            <div class="rmp-stat">
              <span class="rmp-stat-value">—</span>
              <span class="rmp-stat-label">Overall</span>
            </div>
            <div class="rmp-stat">
              <span class="rmp-stat-value">—</span>
              <span class="rmp-stat-label">Difficulty</span>
            </div>
            <div class="rmp-stat">
              <span class="rmp-stat-value">—%</span>
              <span class="rmp-stat-label">Would take again</span>
            </div>
          </div>
          <p class="rmp-panel-note">Instructor ratings will show up here once this is wired up.</p>
        </div>
      </div>
      `;

    listContainer.appendChild(card);
  });
}
