// Full-screen "mission control" dashboard: every tab at once.
//
// When the widget is expanded (state.isFullscreen) renderCurrentView calls
// this instead of the single active tab. The vertical task list (Due/Overdue/
// Done switcher + "+ Task" + card stack) owns the middle column as the
// primary Assignments surface. The compact weekday ribbon and the search bar
// are permanently relocated into the top of that column -- pills → search →
// ASSIGNMENTS header + filters → scrollable cards -- and are re-mounted on
// every rebuild (never recreated), so the Campus & Tools drawer and all other
// header actions leave them untouched. The left column is split 50/50: News
// (announcements) on top, a Recent Grades feed below it. Grades sits on the
// right above Info. Food & Reg moved out of the grid entirely into the
// Campus & Tools drawer (components/campus-tools-modal.js).

import { state } from '../state.js';
import { escapeHTML } from '../utils/text.js';
import { getHiddenCourses } from '../storage/hidden-courses.js';
import { getCompletedTasks } from '../storage/completed-tasks.js';
import { effectiveDueDate } from '../storage/custom-due-dates.js';
import { getSeenAnnouncements } from '../views/announcements-view.js';
import { openAssignmentModal } from '../components/assignment-modal.js';
import { renderCurrentView, renderTaskList } from '../views/upcoming-view.js';
import { renderGradesView } from '../views/grades-view.js';
import { renderRecentGradesView } from '../views/recent-grades-view.js';
import { renderAnnouncementsView } from '../views/announcements-view.js';
import { renderGeneralView } from '../views/general-view.js';

function countOverdue() {
  const hiddenCourses = getHiddenCourses();
  const completedMap = getCompletedTasks();
  const now = new Date();
  let n = 0;
  Object.entries(state.cachedCourseMap).forEach(([courseKey, c]) => {
    if (hiddenCourses.includes(courseKey)) return;
    (c.tasks || []).forEach((t) => {
      const ed = effectiveDueDate(t);
      if (ed && ed < now && !completedMap[t.id]) n++;
    });
  });
  return n;
}

function countUnseen() {
  const seen = getSeenAnnouncements();
  const unseen = (state.cachedAnnouncements || []).filter((a) => !seen[a.id]).length;
  return unseen + (state.cachedUnreadInboxCount || 0);
}

function makePanel(klass, title, badgeText, badgeClass) {
  const panel = document.createElement('section');
  panel.className = `fullscreen-panel ${klass}-panel`;

  const header = document.createElement('header');
  header.className = 'fullscreen-panel-header';
  header.innerHTML = `
    <span class="fullscreen-panel-title">${escapeHTML(title)}</span>
    ${badgeText ? `<span class="fullscreen-panel-badge ${badgeClass || ''}">${escapeHTML(badgeText)}</span>` : ''}
  `;

  const body = document.createElement('div');
  body.className = 'fullscreen-panel-body';

  panel.append(header, body);
  return { panel, body };
}

export function renderDashboardView(listContainer, strip, searchRow) {
  // The relocated ribbon + search must survive every rebuild (the 30s poll,
  // Due/Overdue/Done clicks, filter changes, checkbox toggles, opening the
  // Campus & Tools drawer...). The refs are captured BEFORE the container
  // wipe -- renderCurrentView grabs them at the top of this call and passes
  // them in -- and the try/finally below guarantees they are re-mounted even
  // if a panel render throws mid-build, so they can never be orphaned or
  // disappear. Fallbacks re-query, in case a caller omits them (no-op once
  // the old nodes are detached, but harmless).
  const ribbon = strip || document.getElementById('workload-strip-container');
  const search = searchRow || document.querySelector('#module-tasks-widget .search-bar-row');

  listContainer.innerHTML = '';

  const hiddenCourses = getHiddenCourses();
  const grid = document.createElement('div');
  grid.className = 'fullscreen-dashboard';

  try {
    // Center stage: Assignments -- the vertical task list (the same list the
    // Due/Overdue/Done tabs render in the sidebar) owns the middle column,
    // spanning the full panel height. The weekday ribbon and search row (which
    // live in the shell chrome above the sidebar list) are moved into the top
    // of this panel, so the center column flow is:
    //   1. compact weekday pills (TODAY / TMRW / ...)
    //   2. search bar (class filter · query · 2W horizon)
    //   3. ASSIGNMENTS header with Due / Overdue / Done filters + "+ Task"
    //   4. scrollable card stack
    const overdueCount = countOverdue();
    const assignments = makePanel('assignments', 'Assignments', overdueCount > 0 ? String(overdueCount) : '', 'is-overdue');

    const assignmentsHeader = assignments.panel.querySelector('.fullscreen-panel-header');
    if (ribbon) assignments.panel.insertBefore(ribbon, assignmentsHeader);
    if (search) assignments.panel.insertBefore(search, assignmentsHeader);

    const activeTab = (state.currentTab === 'overdue' || state.currentTab === 'completed') ? state.currentTab : 'upcoming';
    const toolbar = document.createElement('div');
    toolbar.className = 'fs-task-toolbar';
    const tabDefs = [
      { tab: 'upcoming', label: 'Due' },
      { tab: 'overdue', label: overdueCount > 0 ? `Overdue (${overdueCount})` : 'Overdue' },
      { tab: 'completed', label: 'Done' },
    ];
    tabDefs.forEach(({ tab, label }) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `fs-task-tab${activeTab === tab ? ' active' : ''}`;
      btn.textContent = label;
      btn.addEventListener('click', () => {
        state.currentTab = tab;
        renderCurrentView();
      });
      toolbar.appendChild(btn);
    });
    const addBtn = document.createElement('button');
    addBtn.type = 'button';
    addBtn.className = 'hud-add-btn fs-task-add';
    addBtn.innerHTML = '<span class="plus-icon">＋</span> <span class="btn-text">Task</span>';
    addBtn.title = 'Create Custom Assignment (press n)';
    addBtn.addEventListener('click', () => openAssignmentModal());
    toolbar.appendChild(addBtn);

    assignments.panel.insertBefore(toolbar, assignments.body);
    renderTaskList(assignments.body);

    // Left column, top half: News (announcements) -- fills the upper 50% and
    // scrolls its own body.
    const news = makePanel('news', 'News', countUnseen() > 0 ? String(countUnseen()) : '', 'is-news');
    renderAnnouncementsView(news.body, hiddenCourses);

    // Left column, bottom half: Recent Grades feed (newest-graded first).
    const recentGrades = makePanel('recent-grades', 'Recent Grades');
    renderRecentGradesView(recentGrades.body, hiddenCourses);

    // Right column, top: Grades (GPA / stats).
    const gradeAlertCount = (state.gradeChangeAlerts || []).length;
    const grades = makePanel('grades', 'Grades', gradeAlertCount > 0 ? String(gradeAlertCount) : '', 'is-grades');
    renderGradesView(grades.body, hiddenCourses);

    // Right column, bottom: Info (course links, syllabus, modules).
    const info = makePanel('info', 'Info');
    renderGeneralView(info.body, hiddenCourses);

    grid.append(news.panel, recentGrades.panel, assignments.panel, grades.panel, info.panel);
    listContainer.appendChild(grid);
  } finally {
    // Belt-and-suspenders for the "permanently mounted" ribbon + search: if a
    // panel render threw between the clear above and this point, mount the
    // (partial) grid anyway and re-attach the pills/search so the center
    // column never loses them.
    if (!grid.isConnected && listContainer.isConnected) {
      listContainer.appendChild(grid);
    }
    if ((ribbon || search) && grid.isConnected) {
      const panel = grid.querySelector('.assignments-panel');
      const header = panel ? panel.querySelector('.fullscreen-panel-header') : null;
      if (panel && header) {
        if (ribbon) panel.insertBefore(ribbon, header);
        if (search) panel.insertBefore(search, header);
      }
    }
  }
}

// Lightweight periodic refresh for the 30s poll. The old poll called
// renderCurrentView(), rebuilding EVERY panel on a timer -- which is what made
// the Grades panel look like it kept reloading (scroll resets, what-if inputs
// losing focus). Scrape-derived panels (Grades / News / Info / Recent Grades)
// only change when loadTasks() finishes, and that already triggers a full
// render, so the poll now touches only the time-sensitive parts: the week
// progress bar (the caller updates it) and the Assignments list, whose
// overdue styling and counts flip as the clock passes a due date. The list's
// scroll offset is preserved so it never jumps under the user.
export function refreshDashboardView() {
  const panel = document.querySelector('#module-tasks-list .fullscreen-panel.assignments-panel');
  const body = panel ? panel.querySelector('.fullscreen-panel-body') : null;
  if (!body) return;
  // Never yank the DOM out from under an active interaction (the date editor,
  // a checkbox, open card controls, keyboard navigation).
  if (document.activeElement && body.contains(document.activeElement)) return;

  const scrollTop = body.scrollTop;
  renderTaskList(body);
  body.scrollTop = scrollTop;

  // Keep the header badge and toolbar label in sync with the rebuilt list.
  const overdueCount = countOverdue();
  const badge = panel.querySelector('.fullscreen-panel-badge.is-overdue');
  if (badge) badge.textContent = overdueCount > 0 ? String(overdueCount) : '';
  const overdueTab = Array.from(panel.querySelectorAll('.fs-task-tab'))
    .find((b) => b.textContent.trim().startsWith('Overdue'));
  if (overdueTab) overdueTab.textContent = overdueCount > 0 ? `Overdue (${overdueCount})` : 'Overdue';
}