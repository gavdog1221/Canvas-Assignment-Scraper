import { state } from '../state.js';
import { STORAGE_KEY_HIDDEN_COURSES } from '../constants.js';
import { updateHiddenMenuButton } from '../components/widget-shell.js';
import { renderCurrentView, renderFilterPills, renderWorkloadStrip, updateProgressBar } from '../views/upcoming-view.js';

// Memoized getHiddenCourses — every render reads this map, and JSON.parse per
// call was a hot path. Only re-parses when the raw localStorage string
// changes (mirror/hydration writers in xstorage.js use setItem, so the raw
// comparison catches them too).
let hiddenCoursesRaw;
let hiddenCoursesParsed = null;

export function getHiddenCourses() {
    const raw = localStorage.getItem(STORAGE_KEY_HIDDEN_COURSES);
    if (raw !== hiddenCoursesRaw) {
      try { hiddenCoursesParsed = JSON.parse(raw || '[]'); } catch { hiddenCoursesParsed = []; }
      hiddenCoursesRaw = raw;
    }
    return hiddenCoursesParsed;
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
    // Hiding a course must refresh every panel that filters by it.
    state.forceDashboardRebuild = true;
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
    // Unhiding a course must refresh every panel that filters by it.
    state.forceDashboardRebuild = true;
    renderCurrentView();
  }
