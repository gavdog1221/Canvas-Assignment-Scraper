// Fullscreen dashboard: shows every tab at once in a fixed grid (see
// .fullscreen-dashboard in sidebar.css) instead of the single active tab.
// Each panel is a header + scrollable body that reuses the existing per-tab
// renderers. The center Assignments panel is the hero surface: it carries the
// Due / Overdue / Done switcher + "+ Task" toolbar (fs-task-toolbar) on top of
// the vertical task list (renderTaskList), mirroring the shell tab buttons
// that fullscreen hides from the top strip.
import { state } from '../state.js';
import { getHiddenCourses } from '../storage/hidden-courses.js';
import { openAssignmentModal } from '../components/assignment-modal.js';
import { renderAnnouncementsView } from '../views/announcements-view.js';
import { renderGradesView } from '../views/grades-view.js';
import { renderDiningView } from '../views/dining-view.js';
import { renderGeneralView } from '../views/general-view.js';
import { renderRegistrationView } from '../views/registration-view.js';
import { renderTaskList } from '../views/upcoming-view.js';

function makePanel(className, title) {
    const panel = document.createElement('section');
    panel.className = className;
    const header = document.createElement('header');
    header.className = 'fullscreen-panel-header';
    const heading = document.createElement('h3');
    heading.className = 'fullscreen-panel-title';
    heading.textContent = title;
    header.appendChild(heading);
    panel.appendChild(header);
    const body = document.createElement('div');
    body.className = 'fullscreen-panel-body';
    panel.appendChild(body);
    return { panel, body };
}

export function renderDashboardView(container) {
    const listContainer = container;
    listContainer.innerHTML = '';
    const hiddenCourses = getHiddenCourses();

    const dashboard = document.createElement('div');
    dashboard.className = 'fullscreen-dashboard';
    listContainer.appendChild(dashboard);

    // Top-left: announcements.
    const news = makePanel('fullscreen-panel news-panel', 'Announcements');
    dashboard.appendChild(news.panel);
    renderAnnouncementsView(news.body, hiddenCourses);

    // Top-right: grades.
    const grades = makePanel('fullscreen-panel grades-panel', 'Grades');
    dashboard.appendChild(grades.panel);
    renderGradesView(grades.body, hiddenCourses);

    // Bottom-left: dining.
    const food = makePanel('fullscreen-panel food-panel', 'Dining');
    dashboard.appendChild(food.panel);
    renderDiningView(food.body);

    // Center stage: assignments with the Due / Overdue / Done switcher.
    const assignments = makePanel('fullscreen-panel assignments-panel', 'Assignments');
    const toolbar = document.createElement('div');
    toolbar.className = 'fs-task-toolbar';
    const tabs = [
      { label: 'Due', tab: 'upcoming' },
      { label: 'Overdue', tab: 'overdue' },
      { label: 'Done', tab: 'completed' },
    ];
    tabs.forEach(({ label, tab }) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'fs-task-tab' + (state.currentTab === tab ? ' active' : '');
      btn.textContent = label;
      btn.addEventListener('click', () => {
        state.currentTab = tab;
        renderDashboardView(listContainer);
      });
      toolbar.appendChild(btn);
    });
    const addBtn = document.createElement('button');
    addBtn.type = 'button';
    addBtn.className = 'fs-task-add icon-btn';
    addBtn.textContent = '+ Task';
    addBtn.addEventListener('click', () => openAssignmentModal());
    toolbar.appendChild(addBtn);
    assignments.panel.insertBefore(toolbar, assignments.body);
    dashboard.appendChild(assignments.panel);
    renderTaskList(assignments.body);

    // Bottom-right: info + registration, stacked in one slot.
    const corner = document.createElement('div');
    corner.className = 'fullscreen-corner-stack';
    const info = makePanel('fullscreen-panel', 'Info');
    corner.appendChild(info.panel);
    renderGeneralView(info.body, hiddenCourses);
    const reg = makePanel('fullscreen-panel', 'Registration');
    corner.appendChild(reg.panel);
    renderRegistrationView(reg.body);
    dashboard.appendChild(corner);
}