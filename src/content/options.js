import { state } from './state.js';
import { STORAGE_KEY_OPTIONS, STORAGE_KEY_THEME, THEMES } from './constants.js';

// User preferences (Campus & Tools → Options tab): which hud view tabs are
// visible, which badge-style notifications are shown, per-course class colors,
// and (via the theme helpers below) the active palette. Persisted as one
// versioned object under STORAGE_KEY_OPTIONS; state.options is hydrated in
// state.js at import time.

// The hud-view buttons (top-level view switcher), keyed by state.currentTab.
export const TAB_LABELS = {
  upcoming: 'Due',
  overdue: 'Overdue',
  completed: 'Done',
  grades: 'Grades',
  general: 'Info',
  announcements: 'News',
};

// Tabs still toggleable from Options (Campus & Tools → Options → View tabs).
// Grades / Info / News are modular draggable tiles with their own visibility
// controls in the main UI — Options must NOT be able to hide them (the old
// data-hidden-tabs CSS hid the fullscreen panels, conflicting with the tile
// show/hide). Keep this list in sync with options-view.js.
export const OPTION_TAB_KEYS = ['upcoming', 'overdue', 'completed'];

export const NOTIF_OPTIONS = [
  { key: 'overdue', label: 'Overdue count badge', element: 'hud-overdue-badge' },
  { key: 'grades', label: 'Grade-change alert badge', element: 'grades-change-badge' },
  { key: 'news', label: 'News / announce dot', element: 'announce-badge' },
];

export function getOptions() {
  const stored = state.options || {};
  // Only tabs in OPTION_TAB_KEYS can be hidden anymore. Stale hiddenTabs
  // entries for Grades / Info / News are dropped so Options can never hide
  // the modular tiles — their visibility belongs to the tiles themselves.
  const hiddenTabs = Array.isArray(stored.hiddenTabs)
    ? stored.hiddenTabs.filter(t => OPTION_TAB_KEYS.includes(t))
    : [];
  const notif = Object.assign({ overdue: true, grades: true, news: true }, stored.notif || {});
  // Class colors are opt-in. colorCourses is the master switch (default off =
  // the current monochrome look); courseColors holds explicit per-course hex
  // overrides keyed by courseKey, empty until the user picks one.
  return {
    hiddenTabs,
    notif,
    colorCourses: !!stored.colorCourses,
    courseColors: Object.assign({}, stored.courseColors || {}),
  };
}

export function saveOptions(patch) {
  const next = Object.assign({}, state.options || {}, patch);
  state.options = next;
  try {
    localStorage.setItem(STORAGE_KEY_OPTIONS, JSON.stringify(next));
  } catch (e) { /* storage full/blocked — keep in-memory copy */ }
  return getOptions();
}

// Reflect hidden-tab + notification prefs onto the live widget. Called once
// right after the widget is injected and again whenever Options changes.
// The hiding itself is done through data attributes on #module-tasks-widget
// matched by CSS (!important, so it also beats the badge setters' inline
// style.display), rather than mutating each button here.
export function applyOptions() {
  const widget = document.getElementById('module-tasks-widget');
  if (!widget) return;
  const opts = getOptions();

  widget.setAttribute('data-hidden-tabs', opts.hiddenTabs.join(','));
  widget.setAttribute('data-notif-overdue', opts.notif.overdue ? 'on' : 'off');
  widget.setAttribute('data-notif-grades', opts.notif.grades ? 'on' : 'off');
  widget.setAttribute('data-notif-news', opts.notif.news ? 'on' : 'off');

  // If the active tab got hidden (or worse, is the only one left hidden),
  // fall back to Upcoming so the assignments surface always stays reachable.
  if (opts.hiddenTabs.indexOf(state.currentTab) !== -1) {
    state.currentTab = 'upcoming';
  }
  // Keep the visible tab switcher(s) consistent after any reset above:
  // the legacy .hud-view-btn strip and the fullscreen Assignments toolbar.
  document.querySelectorAll('.hud-view-btn').forEach(b => {
    b.classList.toggle('active', b.getAttribute('data-tab') === state.currentTab);
  });
  document.querySelectorAll('.fs-task-tab').forEach(b => {
    b.classList.toggle('active', b.getAttribute('data-tab') === state.currentTab);
  });
}

// Theme picker backend shared by the Options tab. Mirrors the theme-dock
// click handler in widget-shell.js (same storage key + DOM targets) so both
// entry points stay in sync.
export function applyThemeFromOptions(themeId) {
  const theme = THEMES.find(t => t.id === themeId);
  if (!theme) return;

  state.currentTheme = theme.id;
  try {
    localStorage.setItem(STORAGE_KEY_THEME, state.currentTheme);
  } catch (e) { /* ignore */ }

  const widget = document.getElementById('module-tasks-widget');
  if (widget) {
    widget.setAttribute('data-theme', state.currentTheme);
    const swatch = widget.querySelector('#theme-trigger-swatch');
    if (swatch) swatch.style.setProperty('--gem-color', theme.color);
    widget.querySelectorAll('.theme-option-btn').forEach(b => {
      const active = b.getAttribute('data-theme') === state.currentTheme;
      b.classList.toggle('active', active);
      b.setAttribute('aria-selected', String(active));
    });
  }

  const am = document.getElementById('yace-assignment-modal');
  if (am) am.setAttribute('data-theme', state.currentTheme);
}