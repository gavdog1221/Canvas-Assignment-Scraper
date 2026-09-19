// Day-columns board shown in place of the normal task list when the widget
// is expanded to full screen (see setWidgetFullscreen in widget-shell.js).
// Respects the same course/search filters and horizon range (1D/1W/2W/1M/∞)
// as the regular Due tab, so switching between sidebar and full-screen mode
// doesn't change what's being looked at -- just how it's laid out.

import { state } from '../state.js';
import { getCompletedTasks, setTaskCompleted } from '../storage/completed-tasks.js';
import { effectiveDueDate } from '../storage/custom-due-dates.js';
import { getHiddenCourses } from '../storage/hidden-courses.js';
import { getCourseColors } from '../utils/colors.js';
import { localDateKey } from '../utils/dates.js';
import { escapeHTML } from '../utils/text.js';
import { renderWorkloadStrip, updateProgressBar } from '../views/upcoming-view.js';

// Mirrors the radial horizon picker's ranges. "all" is capped at 60 days
// rather than truly unbounded so the board doesn't grow into hundreds of
// mostly-empty columns.
const HORIZON_DAYS = {
  today: 1,
  week: 7,
  '2weeks': 14,
  month: 30,
  all: 60,
};

export function renderKanbanView(container) {
  container.innerHTML = '';

  const hiddenCourses = getHiddenCourses();
  const completedMap = getCompletedTasks();
  const now = new Date();
  const todayKey = localDateKey(now);

  const dayCount = HORIZON_DAYS[state.assignmentRangeFilter] || 14;
  const dayKeys = [];
  for (let i = 0; i < dayCount; i++) {
    const d = new Date(now);
    d.setDate(d.getDate() + i);
    dayKeys.push(localDateKey(d));
  }
  const dayKeySet = new Set(dayKeys);

  const overdue = [];
  const byDay = {};
  dayKeys.forEach((k) => { byDay[k] = []; });
  const undated = [];

  Object.entries(state.cachedCourseMap).forEach(([courseKey, c]) => {
    if (hiddenCourses.includes(courseKey)) return;
    if (state.activeCourseFilter !== 'ALL' && state.activeCourseFilter !== courseKey) return;

    (c.tasks || []).forEach((task) => {
      if (!task.id) return;
      if (state.searchQuery && !task.title.toLowerCase().includes(state.searchQuery)) return;

      const ed = effectiveDueDate(task);
      const isDone = !!completedMap[task.id];

      if (!ed) {
        undated.push({ task, courseKey, isDone, dueDate: null });
        return;
      }

      const key = localDateKey(ed);
      if (key < todayKey) {
        if (!isDone) overdue.push({ task, courseKey, isDone, dueDate: ed });
        return;
      }
      if (dayKeySet.has(key)) {
        byDay[key].push({ task, courseKey, isDone, dueDate: ed });
      }
    });
  });

  Object.values(byDay).forEach((list) => list.sort((a, b) => a.dueDate - b.dueDate));
  overdue.sort((a, b) => a.dueDate - b.dueDate);

  function makeCard(entry) {
    const { task, courseKey, isDone, dueDate } = entry;
    const palette = getCourseColors(courseKey);
    const card = document.createElement('div');
    card.className = `kanban-card ${isDone ? 'is-done' : ''}`;
    card.style.setProperty('--course-accent', palette.accent);
    card.style.setProperty('--course-glow', palette.glow);
    card.style.setProperty('--course-soft', palette.soft);

    const timeLabel = dueDate
      ? dueDate.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
      : '';

    card.innerHTML = `
      <label class="kanban-card-checkbox">
        <input type="checkbox" ${isDone ? 'checked' : ''} />
      </label>
      <div class="kanban-card-body">
        <span class="kanban-card-title">${escapeHTML(task.title)}</span>
        <div class="kanban-card-meta">
          <span class="kanban-card-course">${escapeHTML(courseKey)}</span>
          ${timeLabel ? `<span class="kanban-card-time">${escapeHTML(timeLabel)}</span>` : ''}
          ${task.points ? `<span class="kanban-card-pts">${task.points}pt</span>` : ''}
        </div>
      </div>
    `;

    card.querySelector('input[type="checkbox"]').addEventListener('change', (e) => {
      setTaskCompleted(task.id, e.target.checked);
      updateProgressBar();
      renderWorkloadStrip();
      renderKanbanView(container);
    });

    return card;
  }

  function makeColumn(label, sublabel, entries, opts = {}) {
    const col = document.createElement('div');
    col.className = `kanban-column ${opts.variant || ''}`;

    const header = document.createElement('div');
    header.className = 'kanban-col-header';
    header.innerHTML = `
      <span class="kanban-col-label">${escapeHTML(label)}</span>
      ${sublabel ? `<span class="kanban-col-sublabel">${escapeHTML(sublabel)}</span>` : ''}
      <span class="kanban-col-count">${entries.length}</span>
    `;
    col.appendChild(header);

    const body = document.createElement('div');
    body.className = 'kanban-col-body';
    if (entries.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'kanban-col-empty';
      empty.textContent = opts.emptyText || '';
      body.appendChild(empty);
    } else {
      entries.forEach((entry) => body.appendChild(makeCard(entry)));
    }
    col.appendChild(body);
    return col;
  }

  const board = document.createElement('div');
  board.className = 'kanban-board';

  if (overdue.length > 0) {
    board.appendChild(makeColumn('Overdue', null, overdue, { variant: 'is-overdue', emptyText: 'All caught up' }));
  }

  dayKeys.forEach((key, i) => {
    const d = new Date(now);
    d.setDate(d.getDate() + i);
    const label = i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : d.toLocaleDateString([], { weekday: 'short' });
    const sublabel = d.toLocaleDateString([], { month: 'short', day: 'numeric' });
    board.appendChild(makeColumn(label, sublabel, byDay[key], { variant: i === 0 ? 'is-today' : '', emptyText: 'Nothing due' }));
  });

  if (undated.length > 0) {
    board.appendChild(makeColumn('No Due Date', null, undated, { variant: 'is-undated', emptyText: '' }));
  }

  container.appendChild(board);

  if (overdue.length === 0 && dayKeys.every((k) => byDay[k].length === 0) && undated.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'mod-empty-msg';
    empty.textContent = 'Nothing in this range — try widening the horizon or clearing filters.';
    container.appendChild(empty);
  }
}
