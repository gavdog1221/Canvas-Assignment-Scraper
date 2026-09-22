import { STORAGE_KEY_DASHBOARD_PANELS, STORAGE_KEY_DASHBOARD_PANEL_ORDER } from '../constants.js';

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

// --- Panel display order --------------------------------------------------
// The four SIDE tabs (News, Recent Grades, Grades, Info) keep a user-draggable
// relative order. Assignments and Schedule are pinned — Assignments is always
// the full-width hero on top and Schedule the full-width bottom row — so they
// never appear in the order array. The tiles are always small/equal (one cell
// each); the layout packs them into rows of up to layoutCapacity() per breakpoint.
const DEFAULT_CONTENT_ORDER = ['news', 'recent-grades', 'grades', 'info'];
const ALL_CONTENT_KEYS = ['news', 'recent-grades', 'grades', 'info'];

function sanitizeOrder(raw) {
  if (!Array.isArray(raw)) return null;
  const seen = new Set();
  const out = [];
  raw.forEach((k) => {
    if (ALL_CONTENT_KEYS.includes(k) && !seen.has(k)) {
      seen.add(k);
      out.push(k);
    }
  });
  return out.length === ALL_CONTENT_KEYS.length ? out : null;
}

export function hasPanelOrder() {
  try {
    return localStorage.getItem(STORAGE_KEY_DASHBOARD_PANEL_ORDER) !== null;
  } catch (e) {
    return false;
  }
}

export function getPanelOrder() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY_DASHBOARD_PANEL_ORDER) || 'null');
    return sanitizeOrder(raw) || [...DEFAULT_CONTENT_ORDER];
  } catch (e) {
    return [...DEFAULT_CONTENT_ORDER];
  }
}

export function setPanelOrder(order) {
  const clean = sanitizeOrder(order) || [...DEFAULT_CONTENT_ORDER];
  try {
    localStorage.setItem(STORAGE_KEY_DASHBOARD_PANEL_ORDER, JSON.stringify(clean));
  } catch (e) {}
  return clean;
}

export function resetPanelOrder() {
  try {
    localStorage.removeItem(STORAGE_KEY_DASHBOARD_PANEL_ORDER);
  } catch (e) {}
}