// Full-screen "mission control" dashboard: every tab at once.
//
// When the widget is expanded (state.isFullscreen) renderCurrentView calls
// this instead of the single active tab. The vertical task list (Due/Overdue/
// Done switcher + "+ Task" + card stack) owns the primary Assignments surface.
// The compact weekday ribbon and the search bar are permanently relocated
// into the top of that panel -- pills → search → ASSIGNMENTS header +
// filters → scrollable cards -- and are re-mounted on every rebuild (never
// recreated), so the Campus & Tools drawer and all other header actions leave
// them untouched. Every panel is laid out by the flexbox engine
// (reflowDashboardLayout): visible panels split the dashboard into equal rows
// of up to 3 (wide) / 2 (mid) / 1 (narrow) columns, Schedule owns a full-width
// bottom row, and collapsed panels free their space by dropping out of the
// flex flow. Food & Reg moved out of the panels entirely into the Campus &
// Tools drawer (components/campus-tools-modal.js).

import { state } from '../state.js';
import { escapeHTML } from '../utils/text.js';
import { getHiddenCourses } from '../storage/hidden-courses.js';
import { getCompletedTasks } from '../storage/completed-tasks.js';
import { effectiveDueDate } from '../storage/custom-due-dates.js';
import { getSeenAnnouncements } from '../views/announcements-view.js';
import { openAssignmentModal } from '../components/assignment-modal.js';
import { renderCurrentView, renderTaskList, updateProgressBar } from '../views/upcoming-view.js';
import { renderGradesView } from '../views/grades-view.js';
import { renderRecentGradesView } from '../views/recent-grades-view.js';
import { renderAnnouncementsView } from '../views/announcements-view.js';
import { renderGeneralView } from '../views/general-view.js';
import { renderScheduleView } from '../views/schedule-view.js';
import { getCollapsedPanels, getPanelOrder, isPanelCollapsed, resetPanelCollapsed, setPanelCollapsed, setPanelOrder } from '../storage/dashboard-panels.js';

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

  // Drag grip (⠿) — grabbing it reorders this panel among the others. The
  // whole header stays clickable for text; only the grip starts a drag, so
  // the collapse chevron / toolbar buttons never fight the gesture.
  const dragHandle = document.createElement('span');
  dragHandle.className = 'panel-drag-handle';
  dragHandle.textContent = '\u293F'; // ⠿
  dragHandle.title = 'Drag to reorder';
  header.insertBefore(dragHandle, header.firstChild);

  // Per-panel minimize toggle (top-right of the header). A collapsed panel
  // hides entirely (display:none via .is-collapsed) and is taken out of its
  // flex row (see reflowDashboardLayout), so flex hands its space to the
  // surviving panels automatically. Restoring is done from the panel dock
  // pills or this same chevron after expanding.
  const collapseBtn = document.createElement('button');
  collapseBtn.type = 'button';
  collapseBtn.className = 'panel-collapse-btn';
  collapseBtn.title = 'Minimize / expand panel';
  collapseBtn.dataset.panelKey = klass;
  collapseBtn.textContent = '\u25BE'; // ▾
  header.appendChild(collapseBtn);

  const body = document.createElement('div');
  body.className = 'fullscreen-panel-body';

  panel.append(header, body);
  return { panel, body };
}

// Scrape-derived panels (News / Recent Grades / Grades / Info) only change
// when loadTasks() finishes or when courses are hidden/unhidden — both set
// state.forceDashboardRebuild. Interactive re-renders (pills, filters, tabs,
// checkboxes, toggles) rebuild just the Assignments panel and RE-MOUNT the
// scrape panels as-is, so their scroll position and what-if edits survive
// every button click. Fresh panels (or forced rebuilds) get renderBody().
function getScrapePanel(prevPanels, forceRebuild, klass, title, badgeText, badgeClass, renderBody) {
  if (!forceRebuild) {
    const prev = prevPanels.get(`${klass}-panel`);
    if (prev) {
      const header = prev.querySelector('.fullscreen-panel-header');
      if (header) {
        const titleEl = header.querySelector('.fullscreen-panel-title');
        if (titleEl) titleEl.textContent = title;
        let badge = header.querySelector('.fullscreen-panel-badge');
        if (badgeText) {
          if (!badge) {
            badge = document.createElement('span');
            badge.className = 'fullscreen-panel-badge';
            // Keep the badge left of the collapse chevron, not after it.
            const toggle = header.querySelector('.panel-collapse-btn');
            if (toggle) header.insertBefore(badge, toggle);
            else header.appendChild(badge);
          }
          badge.textContent = badgeText;
          badge.className = `fullscreen-panel-badge ${badgeClass || ''}`;
        } else if (badge) {
          badge.remove();
        }
      }
      return prev;
    }
  }
  const fresh = makePanel(klass, title, badgeText, badgeClass);
  // One panel failing to render must never take down the whole dashboard
  // (that used to leave a blank/half-built widget and made every tab button
  // "toggle but do nothing"). Isolate it: show an error stub, log, continue.
  try {
    renderBody(fresh.body);
  } catch (err) {
    console.error(`[YACE] ${klass} panel render failed:`, err);
    fresh.body.innerHTML = `<div class="mod-empty-msg">${escapeHTML(title)} failed to render — see console.</div>`;
  }
  return fresh.panel;
}

// --- Panel minimize / maximize layout engine ---------------------------------
// Layout is generated by the flexbox builder at the bottom of this section
// (reflowDashboardLayout): visible panels fill equal flex rows per breakpoint
// (wide 3-col, mid 2-col, narrow 1-col stack), collapsed panels drop out of
// the flex flow, and Schedule always owns a full-width bottom row.

// Key for a panel element: the '-panel' suffix class. MUST exclude
// 'fullscreen-panel' itself — it also ends with '-panel' and comes FIRST in
// the class list, so a naive find() would return it and every panel would
// key as 'fullscreen' (matching nothing → collapse silently did nothing
// while the layout still dropped the panel, auto-placing stray elements and
// scrambling the grid).
function panelKeyOf(el) {
  const cls = Array.from(el.classList).find((c) => c.endsWith('-panel') && c !== 'fullscreen-panel');
  return cls ? cls.replace('-panel', '') : '';
}

function getBreakpoint() {
  if (window.matchMedia('(max-width: 820px)').matches) return 'narrow';
  if (window.matchMedia('(max-width: 1100px)').matches) return 'mid';
  return 'wide';
}

function getVisiblePanels() {
  const collapsed = getCollapsedPanels();
  const visible = {
    assignments: !collapsed.assignments,
    news: !collapsed.news,
    'recent-grades': !collapsed['recent-grades'],
    grades: !collapsed.grades,
    info: !collapsed.info,
    schedule: !collapsed.schedule,
  };
  // The dashboard never collapses to nothing — Assignments is the minimum.
  if (!Object.values(visible).some(Boolean)) visible.assignments = true;
  return visible;
}

// --- Panel order & pinned layout ------------------------------------------
// The four SIDE tabs keep a user-draggable order (getPanelOrder()); they are
// ALWAYS small, equal tiles. Assignments is pinned TALL in the middle with
// two tiles stacked on its left and two on its right (the first two order
// entries = left column, last two = right column, top→bottom). Schedule is
// pinned as the full-width bottom row. Neither Assignments nor Schedule is
// draggable nor in the order array. On a narrow single-column window the same
// order just stacks vertically (Assignments hero row on top, then tiles, then
// Schedule). A user drag keeps the in-flight tile arrangement in `dragOrder`
// until dragend persists it (one storage write).
let dragOrder = null;   // in-flight reorder before dragend persists it
let dragKey = null;     // panel currently being dragged

function getEffectivePanelOrder() {
  return dragOrder || getPanelOrder();
}

function reflowDashboardLayout(grid) {
  if (!grid) return;
  const visible = getVisiblePanels();
  const bp = getBreakpoint();

  // Keep the dock pinned as the first child (it must sit above the rows).
  const dock = grid.querySelector('.fs-panel-dock');
  if (dock) dock.remove();

  // Collect every panel element — they are re-parented, never rebuilt.
  const panels = new Map();
  grid.querySelectorAll('.fullscreen-panel').forEach((p) => {
    const key = panelKeyOf(p);
    if (key) panels.set(key, p);
  });

  // Drop any previous row wrappers / middle zones and orphan panels at grid
  // level (they are re-parented below, never rebuilt).
  grid.querySelectorAll('.fs-layout-row').forEach((row) => row.remove());
  grid.querySelectorAll('.fs-middle-zone').forEach((zone) => zone.remove());
  panels.forEach((p) => grid.appendChild(p));

  const assignments = panels.get('assignments');
  const showAssignments = visible.assignments && assignments;
  // Order slots are FIXED columns: entries 0-1 are always the LEFT column,
  // 2-3 always the RIGHT column. Hiding a tile never re-distributes the
  // remaining tiles — its column just has one fewer tile (which then
  // stretches to fill). Only if BOTH tiles of a side are hidden does that
  // column disappear entirely and Assignments swell into the freed width.
  const tileKeys = getEffectivePanelOrder();
  const visibleTiles = tileKeys.filter((k) => visible[k]);
  const slotVisible = (idx) => (tileKeys[idx] && visible[tileKeys[idx]]) ? tileKeys[idx] : null;

  if (bp === 'narrow') {
    // Single-column stack: Assignments hero row on top, tiles in dragged
    // order below, then Schedule — the dashboard scrolls when it overflows.
    if (showAssignments) {
      const row = document.createElement('div');
      row.className = 'fs-layout-row fs-layout-row-hero';
      row.appendChild(assignments);
      grid.appendChild(row);
    }
    visibleTiles.forEach((k) => {
      const p = panels.get(k);
      if (p) {
        const row = document.createElement('div');
        row.className = 'fs-layout-row';
        row.appendChild(p);
        grid.appendChild(row);
      }
    });
  } else {
    // Wide / mid: three-zone middle — Assignments TALL in the CENTER with two
    // tiles stacked left and two stacked right (fixed slots). Order of
    // appends matters: left column, THEN Assignments, THEN right column, so
    // the flex row puts Assignments between the two sides. If a side has only
    // one visible tile it stretches to the full column height; if both are
    // hidden the column is dropped and Assignments widens to fill.
    const middle = document.createElement('div');
    middle.className = 'fs-middle-zone';
    const leftCol = document.createElement('div');
    leftCol.className = 'fs-tile-column';
    [0, 1].forEach((idx) => {
      const k = slotVisible(idx);
      if (k) {
        const p = panels.get(k);
        if (p) leftCol.appendChild(p);
      }
    });
    const rightCol = document.createElement('div');
    rightCol.className = 'fs-tile-column';
    [2, 3].forEach((idx) => {
      const k = slotVisible(idx);
      if (k) {
        const p = panels.get(k);
        if (p) rightCol.appendChild(p);
      }
    });
    if (leftCol.children.length) middle.appendChild(leftCol);
    if (showAssignments) middle.appendChild(assignments);
    if (rightCol.children.length) middle.appendChild(rightCol);
    if (middle.children.length) grid.appendChild(middle);
  }

  // Schedule — full-width bottom row (its weekly calendar needs the width).
  const schedule = panels.get('schedule');
  if (visible.schedule && schedule) {
    const row = document.createElement('div');
    row.className = 'fs-layout-row fs-layout-row-schedule';
    row.appendChild(schedule);
    grid.appendChild(row);
  }

  if (dock) grid.insertBefore(dock, grid.firstChild);
  return visible;
}

// --- Panel drag / reorder --------------------------------------------------
// Pointer-based drag on each panel's grip (see attachDragHandlers). The four
// side tabs occupy a fixed 2-left / 2-right arrangement of SLOTS (order[0] =
// left-top, [1] = left-bottom, [2] = right-top, [3] = right-bottom). Dragging
// a tile onto a slot SWAPS it with the tile currently there — so both sides
// always keep exactly two tiles, and Assignments (tall center) / Schedule
// (bottom) never move. The in-flight arrangement lives in `dragOrder` and
// every pointer move reflows the grid live; it is only persisted on release
// (one storage write, one mirror to browser.storage.local) — dragging never
// writes storage.

// Swap dragKey into `slot` (0-3) of `order`. Returns the new order, or null
// when nothing changed (already home / no movement).
function swapDragIntoSlot(slot, order) {
  const from = order.indexOf(dragKey);
  if (from === -1 || from === slot) return null;
  const next = [...order];
  next[from] = order[slot];
  next[slot] = order[from];
  return next.join(',') === order.join(',') ? null : next;
}

function attachDragHandlers(grid) {
  grid.querySelectorAll('.fullscreen-panel').forEach((panel) => {
    const key = panelKeyOf(panel);
    if (!key || panel.dataset.dragWired === '1') return;
    panel.dataset.dragWired = '1';

    // Only the four side tabs drag — Assignments (pinned tall center) and
    // Schedule (pinned bottom row) are fixed. This is POINTER-based, not
    // HTML5 drag-and-drop: reflowDashboardLayout re-parents panels on every
    // drop-hover, which makes native DnD cancel itself mid-gesture; tracking
    // the pointer manually (elementFromPoint hit-testing) survives the live
    // reflow and behaves identically in Chrome MV2 and Firefox.
    if (key !== 'schedule' && key !== 'assignments') {
      const handle = panel.querySelector('.panel-drag-handle');
      if (!handle) return;
      handle.addEventListener('pointerdown', (e) => {
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        e.preventDefault();
        dragKey = key;
        dragOrder = [...getPanelOrder()];
        panel.classList.add('is-dragging');
        let started = false;
        const start = { x: e.clientX, y: e.clientY };

        // Which slot is under the pointer? Dock → left-top, Assignments →
        // left-top, Schedule → right-bottom; otherwise the tile's own slot
        // (top half) or the slot below it on the same side (bottom half).
        const resolveSlot = (el, y) => {
          if (el.closest('.fs-panel-dock')) return 0;
          const target = el.closest('.fullscreen-panel');
          if (!target) return null;
          const tKey = panelKeyOf(target);
          if (!tKey || tKey === dragKey) return null;
          if (tKey === 'assignments') return 0;
          if (tKey === 'schedule') return 3;
          const t = dragOrder ? dragOrder.indexOf(tKey) : -1;
          if (t === -1) return null;
          const rect = target.getBoundingClientRect();
          const below = (y - rect.top) > rect.height / 2;
          return (below && (t === 0 || t === 2)) ? t + 1 : t;
        };

        const onMove = (ev) => {
          if (!dragKey) return;
          if (!started) {
            // Small threshold so a plain click never drags.
            if (Math.abs(ev.clientX - start.x) + Math.abs(ev.clientY - start.y) < 6) return;
            started = true;
          }
          const el = document.elementFromPoint(ev.clientX, ev.clientY);
          if (!el) return;
          const slot = resolveSlot(el, ev.clientY);
          if (slot === null || slot === undefined) return;
          const next = dragOrder && swapDragIntoSlot(slot, dragOrder);
          if (next) {
            dragOrder = next;
            reflowDashboardLayout(grid);
          }
        };
        const onEnd = () => {
          document.removeEventListener('pointermove', onMove);
          document.removeEventListener('pointerup', onEnd);
          document.removeEventListener('pointercancel', onEnd);
          panel.classList.remove('is-dragging');
          if (dragOrder) setPanelOrder(dragOrder);
          dragOrder = null;
          dragKey = null;
        };
        document.addEventListener('pointermove', onMove);
        document.addEventListener('pointerup', onEnd);
        document.addEventListener('pointercancel', onEnd);
      });
    }
  });
}

// Syncs chevron glyphs + dock pill states for the current persisted set.
function syncPanelToggles(grid, dock) {
  const collapsed = getCollapsedPanels();
  grid.querySelectorAll('.fullscreen-panel').forEach((panel) => {
    const key = panelKeyOf(panel);
    const isCollapsed = collapsed[key] === true;
    panel.classList.toggle('is-collapsed', isCollapsed);
    const chev = panel.querySelector('.panel-collapse-btn');
    if (chev) {
      chev.textContent = isCollapsed ? '\u25B8' : '\u25BE'; // ▸ / ▾
      chev.classList.toggle('is-collapsed', isCollapsed);
    }
  });
  if (dock) {
    dock.querySelectorAll('.fs-panel-dock-btn:not(.fs-dock-expand-all)').forEach((btn) => {
      btn.classList.toggle('is-on', collapsed[btn.dataset.panelKey] !== true);
    });
  }
}

// Wires the per-panel chevrons and the dock pills (idempotent per grid node),
// then lays out once. The dock lives above the grid so a collapsed panel can
// always be restored even though its own header is hidden.
function initDashboardPanels(listArea, grid) {
  if (!grid || grid.dataset.panelsWired === '1') return;
  grid.dataset.panelsWired = '1';
  const dock = listArea.querySelector('.fs-panel-dock');

  const toggle = (key) => {
    if (!key) return;
    setPanelCollapsed(key, !isPanelCollapsed(key));
    reflowDashboardLayout(grid);
    syncPanelToggles(grid, dock);
  };

  grid.querySelectorAll('.panel-collapse-btn').forEach((btn) => {
    btn.addEventListener('click', () => toggle(btn.dataset.panelKey));
  });
  if (dock) {
    dock.querySelectorAll('.fs-panel-dock-btn:not(.fs-dock-expand-all)').forEach((btn) => {
      btn.addEventListener('click', () => toggle(btn.dataset.panelKey));
    });
    const allBtn = dock.querySelector('.fs-dock-expand-all');
    if (allBtn) {
      allBtn.addEventListener('click', () => {
        resetPanelCollapsed();
        reflowDashboardLayout(grid);
        syncPanelToggles(grid, dock);
      });
    }
  }

  attachDragHandlers(grid);

  reflowDashboardLayout(grid);
  syncPanelToggles(grid, dock);
}

const DOCK_DEFS = {
  assignments: 'Assignments',
  news: 'News',
  'recent-grades': 'Recent Grades',
  grades: 'Grades',
  info: 'Info',
  schedule: 'Schedule',
};

function makePanelDock() {
  const dock = document.createElement('div');
  dock.className = 'fs-panel-dock';
  // "Expand all" pill — one-click recovery from a wedged or multi-collapsed
  // layout: clears every persisted collapsed flag and restores the full grid.
  const all = document.createElement('button');
  all.type = 'button';
  all.className = 'fs-panel-dock-btn fs-dock-expand-all';
  all.title = 'Expand all panels';
  all.textContent = '\u21F1 All'; // ⇱
  dock.appendChild(all);

  // Pills mirror the layout: Assignments (pinned hero) first, then the four
  // side tabs in their dragged order, then Schedule (pinned bottom).
  const pillKeys = ['assignments', ...getEffectivePanelOrder(), 'schedule'];
  pillKeys.forEach((key) => {
    const label = DOCK_DEFS[key];
    if (!label) return;
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'fs-panel-dock-btn';
    b.dataset.panelKey = key;
    b.title = `Show / hide ${label} panel`;
    b.textContent = label;
    dock.appendChild(b);
  });
  return dock;
}

let dashResizeTimer = null;
window.addEventListener('resize', () => {
  clearTimeout(dashResizeTimer);
  dashResizeTimer = setTimeout(() => {
    const existing = document.querySelector('#module-tasks-list .fullscreen-dashboard');
    if (existing) reflowDashboardLayout(existing);
  }, 120);
});

export function renderDashboardView(listContainer, strip, searchRow, progressEl) {
  // The relocated ribbon + search must survive every rebuild (the 30s poll,
  // Due/Overdue/Done clicks, filter changes, checkbox toggles, opening the
  // Campus & Tools drawer...). The refs are captured BEFORE the container
  // wipe -- renderCurrentView grabs them at the top of this call and passes
  // them in -- and the try/finally below guarantees they are re-mounted even
  // if a panel render throws mid-build, so they can never be orphaned or
  // disappear. Fallbacks re-query, in case a caller omits them (no-op once
  // the old nodes are detached, but harmless). The week progress bar lives
  // inline in the Assignments panel header (title · badge · bar) instead of
  // as its own stacked row above the task list.
  const ribbon = strip || document.getElementById('workload-strip-container');
  const search = searchRow || document.querySelector('#module-tasks-widget .search-bar-row');
  // Descendant (not child) selector: after the first render the bar lives
  // inside the Assignments panel, not as a direct widget child. If a previous
  // build already wiped it, recreate it so the bar can never go missing.
  let progress = progressEl || document.querySelector('#module-tasks-widget .progress-container');
  if (!progress) {
    progress = document.createElement('div');
    progress.className = 'progress-container';
    progress.innerHTML = `
    <div class="progress-meta">
    <span id="progress-label">0% this week</span>
    <span id="progress-count">0/0 this week</span>
    </div>
    <div class="progress-bar-bg">
    <div class="progress-bar-fill tier-low" id="progress-bar-fill"></div>
    </div>
    `;
  }

  // Capture the mounted scrape panels BEFORE the wipe so getScrapePanel can
  // re-mount them on interactive re-renders instead of rebuilding them.
  const prevGrid = listContainer.querySelector('.fullscreen-dashboard');
  const prevPanels = new Map();
  if (prevGrid) {
    Array.from(prevGrid.children).forEach((p) => {
      const key = panelKeyOf(p);
      if (key) prevPanels.set(`${key}-panel`, p);
    });
  }

  listContainer.innerHTML = '';

  const forceRebuild = state.forceDashboardRebuild === true;
  state.forceDashboardRebuild = false;

  const hiddenCourses = getHiddenCourses();
  const grid = document.createElement('div');
  grid.className = 'fullscreen-dashboard';

  try {
    // Center stage: Assignments -- the vertical task list (the same list the
    // Due/Overdue/Done tabs render in the sidebar) owns the middle column,
    // spanning the full panel height. The weekday ribbon and the search row
    // (which live in the shell chrome above the sidebar list) are moved into
    // the top of this panel, and the week progress bar is embedded inline in
    // the panel header, so the center column flow is:
    //   1. compact weekday pills (TODAY / TMRW / ...)
    //   2. search bar (class filter · query · 2W horizon)
    //   3. ASSIGNMENTS header with the week progress bar inline
    //   4. Due / Overdue / Done filters + "+ Task"
    //   5. scrollable card stack
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
      btn.dataset.tab = tab;
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
    // Week progress rides inline in the ASSIGNMENTS header row (title · badge
    // · bar), directly above the toolbar + cards — never its own stacked row.
    if (progress) assignmentsHeader.appendChild(progress);
    updateProgressBar();
    renderTaskList(assignments.body);

    // Left column, top half: News (announcements) -- fills the upper 50% and
    // scrolls its own body.
    const news = getScrapePanel(prevPanels, forceRebuild, 'news', 'News',
      countUnseen() > 0 ? String(countUnseen()) : '', 'is-news',
      (body) => renderAnnouncementsView(body, hiddenCourses));

    // Left column, bottom half: Recent Grades feed (newest-graded first).
    const recentGrades = getScrapePanel(prevPanels, forceRebuild, 'recent-grades', 'Recent Grades', '', '',
      (body) => renderRecentGradesView(body, hiddenCourses));

    // Right column, top: Grades (GPA / stats).
    const gradeAlertCount = (state.gradeChangeAlerts || []).length;
    const grades = getScrapePanel(prevPanels, forceRebuild, 'grades', 'Grades',
      gradeAlertCount > 0 ? String(gradeAlertCount) : '', 'is-grades',
      (body) => renderGradesView(body, hiddenCourses));

    // Right column, bottom: Info (course links, syllabus, modules).
    const info = getScrapePanel(prevPanels, forceRebuild, 'info', 'Info', '', '',
      (body) => renderGeneralView(body, hiddenCourses));

    // Full-width bottom row: Schedule — the weekly timetable of the classes
    // the user is currently taking, built from their Canvas course list +
    // courses.unh.edu section lookups (schedule-view.js). Like the other
    // scrape panels it only rebuilds on loadTasks; interactive re-renders
    // re-mount it as-is so the grid never flickers.
    const schedule = getScrapePanel(prevPanels, forceRebuild, 'schedule', 'Schedule', '', '',
      (body) => renderScheduleView(body));

    grid.append(makePanelDock(), news, recentGrades, assignments.panel, grades, info, schedule);
    listContainer.appendChild(grid);
    initDashboardPanels(listContainer, grid);
  } finally {
    // Belt-and-suspenders for the "permanently mounted" ribbon + search +
    // progress: if a panel render threw between the clear above and this
    // point, mount the (partial) grid anyway and re-attach the pills/search/
    // progress so the center column never loses them.
    if (!grid.isConnected && listContainer.isConnected) {
      listContainer.appendChild(grid);
    }
    if ((ribbon || search || progress) && grid.isConnected) {
      const panel = grid.querySelector('.assignments-panel');
      const header = panel ? panel.querySelector('.fullscreen-panel-header') : null;
      if (panel && header) {
        if (ribbon) panel.insertBefore(ribbon, header);
        if (search) panel.insertBefore(search, header);
        if (progress) header.appendChild(progress);
      }
    }
    if (grid.dataset.panelsWired !== '1') {
      if (!grid.isConnected && listContainer.isConnected) listContainer.appendChild(grid);
      // The dock lives INSIDE the grid (first row), so slot it in before any
      // panels if a partial build got here without one.
      if (grid && !grid.querySelector('.fs-panel-dock')) {
        grid.insertBefore(makePanelDock(), grid.firstChild);
      }
      initDashboardPanels(listContainer, grid);
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