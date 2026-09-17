import { state } from '../state.js';
import { STORAGE_KEY_HIDDEN_COURSES } from '../constants.js';
import { updateHiddenMenuButton } from '../components/widget-shell.js';
import { renderCurrentView, renderFilterPills, renderWorkloadStrip, updateProgressBar } from '../views/upcoming-view.js';

export function getHiddenCourses() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY_HIDDEN_COURSES) || '[]');
    } catch { return []; }
  }

export function hideCourse(courseKey) {
    const hidden = getHiddenCourses();
    if (!hidden.includes(courseKey)) {
      hidden.push(courseKey);
      localStorage.setItem(STORAGE_KEY_HIDDEN_COURSES, JSON.stringify(hidden));
    }
    if (state.activeCourseFilter === courseKey) {
      state.activeCourseFilter = 'ALL';
    }
    renderFilterPills();
    updateHiddenMenuButton();
    updateProgressBar();
    renderWorkloadStrip();
    renderCurrentView();
  }

export function unhideCourse(courseKey) {
    let hidden = getHiddenCourses();
    hidden = hidden.filter(k => k !== courseKey);
    localStorage.setItem(STORAGE_KEY_HIDDEN_COURSES, JSON.stringify(hidden));
    if (hidden.length === 0) {
      state.isHiddenMenuOpen = false;
    }
    renderFilterPills();
    updateHiddenMenuButton();
    updateProgressBar();
    renderWorkloadStrip();
    renderCurrentView();
  }
