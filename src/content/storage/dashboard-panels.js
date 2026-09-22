import { STORAGE_KEY_DASHBOARD_PANELS } from '../constants.js';

// Per-panel minimize state for the fullscreen dashboard (Assignments, News,
// Recent Grades, Grades, Info, Schedule). Persisted in localStorage —
// dashboard-view.js reads it on every rebuild and re-derives the grid
// template (columns/rows/areas) from the visible set, so a collapsed panel's
// row/column reclaims its space instead of leaving a dead cell.

export function getCollapsedPanels() {
    try {
      const raw = JSON.parse(localStorage.getItem(STORAGE_KEY_DASHBOARD_PANELS) || '{}');
      return raw && typeof raw === 'object' ? raw : {};
    } catch (e) {
      return {};
    }
  }

export function isPanelCollapsed(klass) {
    return getCollapsedPanels()[klass] === true;
  }

export function setPanelCollapsed(klass, collapsed) {
    const cur = getCollapsedPanels();
    if (collapsed) cur[klass] = true;
    else delete cur[klass];
    try {
      localStorage.setItem(STORAGE_KEY_DASHBOARD_PANELS, JSON.stringify(cur));
    } catch (e) {}
  }

export function resetPanelCollapsed() {
    try {
      localStorage.removeItem(STORAGE_KEY_DASHBOARD_PANELS);
    } catch (e) {}
  }