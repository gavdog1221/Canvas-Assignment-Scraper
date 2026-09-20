import { state } from '../state.js';
import { STORAGE_KEY_CACHE_TIME, STORAGE_KEY_THEME, THEMES } from '../constants.js';
import { openAssignmentModal } from '../components/assignment-modal.js';
import { openShortcutsModal } from '../components/shortcuts-modal.js';
import { toggleCampusToolsModal } from '../components/campus-tools-modal.js';
import { initKeyboardShortcuts } from '../handlers/keyboard-shortcuts.js';
import { deduplicateCourseMap, loadTasks } from '../services/task-loader.js';
import { loadCoursePercentagesCache, loadLocalAnnouncementsCache, loadLocalCache, loadLocalGradesCache } from '../storage/caches.js';
import { autoCompleteSubmittedTasks } from '../storage/completed-tasks.js';
import { mergeCustomTasksIntoCourseMap } from '../storage/custom-assignments.js';
import { applyCustomDueDates } from '../storage/custom-due-dates.js';
import { getHiddenCourses, unhideCourse } from '../storage/hidden-courses.js';
import { scrapeCanvasDashboardColors } from '../utils/colors.js';
import { escapeHTML } from '../utils/text.js';
import { markAnnouncementsSeen, updateAnnouncementBadge } from '../views/announcements-view.js';
import { renderCurrentView, renderFilterPills, renderWorkloadStrip, updateProgressBar } from '../views/upcoming-view.js';
import { refreshDashboardView } from '../views/dashboard-view.js';

export function purgeDefaultCanvasElements() {
    const selectors = [
      '#right-side .todo-list-needed',
      '#right-side .to-do-list',
      '#right-side .events_list',
      '#right-side .recent_feedback',
      '.Sidebar__TodoListContainer',
      '.ic-sidebar-right__event-list'
    ];
    document.querySelectorAll(selectors.join(',')).forEach(el => el.remove());

    const rightSide = document.getElementById('right-side');
    if (rightSide) {
      Array.from(rightSide.children).forEach(child => {
        if (child.id !== 'module-tasks-widget' && child.id !== 'hidden-courses-popover') {
          const text = child.innerText || '';
          if (/to-?\s*do|recent feedback|coming up/i.test(text)) {
            child.remove();
          }
        }
      });
    }
  }

// The widget has no sidebar or minimize-to-edge mode anymore: fullscreen is
// the only thing. This relocates the widget to <body> (the
// #right-side-wrapper `container-type` would otherwise make it a containing
// block for the `position: fixed` fullscreen shell, pinning it to that small
// box), applies the fullscreen shell class, and performs the first render.
// A hidden placeholder marks the original injection point.
export function setWidgetFullscreen() {
    state.isFullscreen = true;

    const widget = document.getElementById('module-tasks-widget');
    if (!widget) return;

    let placeholder = document.getElementById('yace-widget-placeholder');
    if (!placeholder) {
      placeholder = document.createElement('div');
      placeholder.id = 'yace-widget-placeholder';
      placeholder.style.display = 'none';
      widget.parentNode.insertBefore(placeholder, widget);
    }
    document.body.appendChild(widget);

    widget.classList.add('is-fullscreen');
    document.body.classList.add('yace-fullscreen-active');

    renderCurrentView();
  }

export function injectWidget(container) {
    const todayFormatted = new Date().toLocaleDateString(undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric'
    });

    const widget = document.createElement('div');
    widget.id = 'module-tasks-widget';
    widget.setAttribute('data-theme', state.currentTheme);
    widget.innerHTML = `
    <div class="header">
    <div class="title-row">
    <span class="title">YACE</span>
    <span class="widget-current-date">${todayFormatted}</span>
    </div>
    <div class="widget-controls">
    <button class="icon-btn campus-tools-btn" id="open-campus-tools-btn" title="Campus Tools: Food menus & WebCat Registration" aria-haspopup="dialog" aria-expanded="false">
    <span class="campus-tools-icon">🍽</span><span class="campus-tools-label">Campus&nbsp;&amp;&nbsp;Tools</span>
    </button>
    <button class="icon-btn" id="toggle-shortcuts-btn" title="View Keyboard Shortcuts">⌨</button>

    <!-- Theme Swatch Palette Dock -->
    <div class="theme-dock-wrap" id="theme-dock-wrap">
    <button type="button" class="icon-btn theme-dock-trigger" id="theme-dock-trigger" title="Switch Theme" aria-haspopup="listbox" aria-expanded="false">
    <span class="theme-trigger-swatch" id="theme-trigger-swatch" style="--gem-color: ${THEMES.find(t => t.id === state.currentTheme)?.color || THEMES[0].color};"></span>
    <span class="theme-trigger-caret">▾</span>
    </button>
    <div class="theme-dock-flyout" id="theme-dock-flyout" role="listbox">
    ${THEMES.map(t => `
      <button type="button" class="theme-option-btn ${state.currentTheme === t.id ? 'active' : ''}" data-theme="${t.id}" role="option" aria-selected="${state.currentTheme === t.id}">
      <span class="theme-option-swatch" style="--gem-color: ${t.color};"></span>
      <span class="theme-option-label">${escapeHTML(t.label)}</span>
      <span class="theme-option-check">✓</span>
      </button>
    `).join('')}
    </div>
    </div>

    <button class="icon-btn eye-btn" id="toggle-hidden-courses-btn" title="View Hidden Classes">👁<span class="eye-badge" id="eye-badge" style="display:none;"></span></button>
    <button class="icon-btn" id="refresh-mod-tasks" title="Reload Everything">↻</button>
    </div>    </div>

    <div class="hidden-courses-popover" id="hidden-courses-popover">
    <div class="hidden-popover-header">
    <span class="hidden-popover-title">Hidden Classes</span>
    <button class="hidden-popover-close" id="close-hidden-courses-btn" title="Close">✕</button>
    </div>
    <div class="hidden-pills-list" id="hidden-pills-container"></div>
    </div>

    <div class="workload-strip" id="workload-strip-container"></div>

    <!-- Compact Unified Search, Course Filter & Horizon Scope -->
    <div class="search-bar-row">
    <div class="course-filter-dropdown-wrap">
    <button type="button" class="course-filter-btn" id="course-filter-btn" title="Filter by Class">
    <span id="course-filter-label">All</span>
    <span class="course-filter-caret">▾</span>
    </button>
    <div class="course-filter-menu" id="course-filter-menu"></div>
    </div>

    <div class="search-wrapper">
    <input type="text" class="search-input" id="task-search-input" placeholder="Search (/)..." />
    </div>

    <div class="radial-horizon-wrap" id="radial-horizon-wrap">
    <button type="button" class="radial-horizon-trigger" id="radial-horizon-trigger" title="Hover to choose horizon">
    <span id="radial-horizon-label">2W</span>
    </button>
    <div class="radial-pie-menu">
    <button type="button" class="pie-slice" data-range="today" style="--slice-index: 0;" title="1 Day (Today)"><span>1D</span></button>
    <button type="button" class="pie-slice" data-range="week" style="--slice-index: 1;" title="1 Week"><span>1W</span></button>
    <button type="button" class="pie-slice active" data-range="2weeks" style="--slice-index: 2;" title="2 Weeks"><span>2W</span></button>
    <button type="button" class="pie-slice" data-range="month" style="--slice-index: 3;" title="1 Month"><span>1M</span></button>
    <button type="button" class="pie-slice" data-range="all" style="--slice-index: 4;" title="All Horizons"><span>∞</span></button>
    </div>
    </div>
    </div>

    <div class="progress-container">
    <div class="progress-meta">
    <span id="progress-label">0% this week</span>
    <span id="progress-count">0/0 this week</span>
    </div>
    <div class="progress-bar-bg">
    <div class="progress-bar-fill tier-low" id="progress-bar-fill"></div>
    </div>
    </div>

    <!-- View Tabs + Add Task Bar -->
    <div class="hud-command-bar">
    <div class="hud-view-buttons">
    <button type="button" class="hud-view-btn active" data-tab="upcoming">Due</button>
    <button type="button" class="hud-view-btn" data-tab="overdue">Overdue <span class="hud-tab-badge" id="hud-overdue-badge" style="display:none;"></span><span id="overdue-total-badge" style="display:none;"></span></button>
    <button type="button" class="hud-view-btn" data-tab="completed">Done</button>
    <button type="button" class="hud-view-btn" data-tab="grades">Grades <span class="hud-tab-badge grades-change-badge" id="grades-change-badge" style="display:none;"></span></button>
    <button type="button" class="hud-view-btn" data-tab="general">Info</button>
    <button type="button" class="hud-view-btn" data-tab="announcements">News <span class="hud-tab-badge announce-dot" id="announce-badge" style="display:none;"></span></button>
    </div>    <button type="button" class="hud-add-btn" id="add-custom-task-btn" title="Create Custom Assignment (Press 'n')">
    <span class="plus-icon">＋</span> <span class="btn-text">Task</span>
    </button>
    </div>

    <div id="module-tasks-list">
    <div class="mod-empty-msg">Scanning Canvas & Gradescope...</div>
    </div>    `;

    container.prepend(widget);

    // Fullscreen is the only mode now: the sidebar and the minimize-to-edge
    // states are gone. Relocate the widget to <body> (the #right-side-wrapper
    // container-type would otherwise trap position:fixed) and apply the
    // fullscreen shell immediately; setWidgetFullscreen() also kicks the
    // first render.
    setWidgetFullscreen();

    widget.addEventListener('mousemove', (e) => {
      const rect = widget.getBoundingClientRect();
      const x = Math.round(e.clientX - rect.left);
      const y = Math.round(e.clientY - rect.top);
      widget.style.setProperty('--mouse-x', `${x}px`);
      widget.style.setProperty('--mouse-y', `${y}px`);
    });

    widget.addEventListener('mouseleave', () => {
      widget.style.setProperty('--mouse-x', `-1000px`);
      widget.style.setProperty('--mouse-y', `-1000px`);
    });

    document.getElementById('toggle-shortcuts-btn').addEventListener('click', openShortcutsModal);
    document.getElementById('open-campus-tools-btn').addEventListener('click', () => toggleCampusToolsModal());
    document.getElementById('add-custom-task-btn').addEventListener('click', () => openAssignmentModal());
    const courseScrollWrap = widget.querySelector('.course-scroll-wrap');
    if (courseScrollWrap) {
      courseScrollWrap.addEventListener('wheel', (e) => {
        if (e.deltaY !== 0) {
          e.preventDefault();
          courseScrollWrap.scrollLeft += e.deltaY;
        }
      }, { passive: false });
    }
    const radialLabel = document.getElementById('radial-horizon-label');
    const radialWrap = document.getElementById('radial-horizon-wrap');
    const rangeLabels = {
      today: '1D',
      week: '1W',
      '2weeks': '2W',
      month: '1M',
      all: '∞'
    };

    if (radialWrap) {
      radialWrap.addEventListener('mouseleave', () => {
        radialWrap.classList.remove('is-closed');
      });
    }

    widget.querySelectorAll('.pie-slice').forEach(slice => {
      slice.addEventListener('click', (e) => {
        e.stopPropagation();
        widget.querySelectorAll('.pie-slice').forEach(s => s.classList.remove('active'));
        slice.classList.add('active');
        state.assignmentRangeFilter = slice.getAttribute('data-range');
        if (radialLabel) radialLabel.textContent = rangeLabels[state.assignmentRangeFilter] || '2W';

        // Immediately dismiss the menu
        if (radialWrap) radialWrap.classList.add('is-closed');

        renderCurrentView();
      });
    });    const themeDockWrap = document.getElementById('theme-dock-wrap');
    const themeDockTrigger = document.getElementById('theme-dock-trigger');

    // Click toggle so it stays open reliably without relying solely on hover
    if (themeDockTrigger && themeDockWrap) {
      themeDockTrigger.addEventListener('click', (e) => {
        e.stopPropagation();
        const nowOpen = themeDockWrap.classList.toggle('is-open');
        themeDockTrigger.setAttribute('aria-expanded', String(nowOpen));
      });

      document.addEventListener('click', () => {
        themeDockWrap.classList.remove('is-open');
        themeDockTrigger.setAttribute('aria-expanded', 'false');
      });
    }

    widget.querySelectorAll('.theme-option-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const selectedTheme = btn.getAttribute('data-theme');
        if (!selectedTheme) return;

        state.currentTheme = selectedTheme;
        localStorage.setItem(STORAGE_KEY_THEME, state.currentTheme);
        widget.setAttribute('data-theme', state.currentTheme);

        const modal = document.getElementById('yace-assignment-modal');
        if (modal) modal.setAttribute('data-theme', state.currentTheme);

        widget.querySelectorAll('.theme-option-btn').forEach(b => {
          b.classList.remove('active');
          b.setAttribute('aria-selected', 'false');
        });
        btn.classList.add('active');
        btn.setAttribute('aria-selected', 'true');

        const themeMeta = THEMES.find(t => t.id === selectedTheme);
        const swatch = document.getElementById('theme-trigger-swatch');
        if (swatch && themeMeta) swatch.style.setProperty('--gem-color', themeMeta.color);

        // Close dock once picked
        if (themeDockWrap) themeDockWrap.classList.remove('is-open');
        if (themeDockTrigger) themeDockTrigger.setAttribute('aria-expanded', 'false');
      });
    });

    document.getElementById('refresh-mod-tasks').addEventListener('click', () => {
      scrapeCanvasDashboardColors();
      loadTasks(true);
    });
    const eyeBtn = document.getElementById('toggle-hidden-courses-btn');
    const closeBtn = document.getElementById('close-hidden-courses-btn');

    eyeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      state.isHiddenMenuOpen = !state.isHiddenMenuOpen;
      updateHiddenMenuButton();
    });

    closeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      state.isHiddenMenuOpen = false;
      updateHiddenMenuButton();
    });

    document.getElementById('task-search-input').addEventListener('input', (e) => {
      state.searchQuery = e.target.value.toLowerCase().trim();
      renderCurrentView();
    });

    widget.querySelectorAll('.hud-view-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        widget.querySelectorAll('.hud-view-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        state.currentTab = btn.getAttribute('data-tab');
        state.activeDayFilter = null;
        if (state.currentTab === 'announcements') {
          markAnnouncementsSeen();
          updateAnnouncementBadge();
        }
        renderCurrentView();
      });
    });      // Throttle bookkeeping for the 30s poll: the assignments-list
      // rebuild is capped at once per 5 minutes, and a background rescan
      // started by the poll must not stack with a previous one.
      let lastListRefresh = 0;
      let backgroundScanInFlight = false;
      setInterval(() => {
        if (document.getElementById('module-tasks-widget')) {
          updateProgressBar();
          // Rebuilding the assignments list every 30s stacked duplicate
          // cards, so it's throttled to once per 5 minutes (same window as
          // the cache freshness check below).
          const now = Date.now();
          if (now - lastListRefresh >= 5 * 60 * 1000) {
            lastListRefresh = now;
            refreshDashboardView();
          }
          // When the 5-minute cache window lapses, kick a background rescan
          // of just the mandatory data (assignments + grades) — never
          // announcements. Guarded so two poll ticks can't stack scans.
          const lastCacheTime = parseInt(localStorage.getItem(STORAGE_KEY_CACHE_TIME) || '0', 10);
          if (now - lastCacheTime >= 5 * 60 * 1000 && !backgroundScanInFlight) {
            backgroundScanInFlight = true;
            loadTasks(false, { refreshAnnouncements: false }).finally(() => {
              backgroundScanInFlight = false;
            });
          }
        }
      }, 30000);

      const cachedGradesLocal = loadLocalGradesCache();
      if (cachedGradesLocal) {
        state.cachedGrades = cachedGradesLocal;
      }
      state.cachedCoursePercentages = loadCoursePercentagesCache();

      const cachedAnnouncementsLocal = loadLocalAnnouncementsCache();
      if (cachedAnnouncementsLocal) {
        state.cachedAnnouncements = cachedAnnouncementsLocal;
      }
      updateAnnouncementBadge();

      const cached = loadLocalCache();
      const lastCacheTime = parseInt(localStorage.getItem(STORAGE_KEY_CACHE_TIME) || '0', 10);
      const isCacheFresh = (Date.now() - lastCacheTime) < (5 * 60 * 1000);

      if (cached && Object.keys(cached).length > 0) {
        state.cachedCourseMap = deduplicateCourseMap(cached, state.cachedGrades);
        applyCustomDueDates();
        autoCompleteSubmittedTasks(state.cachedCourseMap);
        mergeCustomTasksIntoCourseMap(state.cachedCourseMap);
        renderFilterPills();
        updateHiddenMenuButton();
        updateProgressBar();
        renderWorkloadStrip();
        renderCurrentView();

        if (!isCacheFresh) {
          loadTasks(false, { refreshAnnouncements: false });
        }
      } else {
        loadTasks(true);
      }

      initKeyboardShortcuts();
  }

export function updateHiddenMenuButton() {
    const eyeBtn = document.getElementById('toggle-hidden-courses-btn');
    const eyeBadge = document.getElementById('eye-badge');
    const popover = document.getElementById('hidden-courses-popover');
    const container = document.getElementById('hidden-pills-container');
    const hidden = getHiddenCourses();

    if (!eyeBtn || !popover || !container) return;

    if (hidden.length > 0) {
      eyeBtn.classList.add('has-hidden');
      if (eyeBadge) eyeBadge.style.display = 'block';
    } else {
      eyeBtn.classList.remove('has-hidden');
      if (eyeBadge) eyeBadge.style.display = 'none';
      state.isHiddenMenuOpen = false;
    }

    if (state.isHiddenMenuOpen && hidden.length > 0) {
      eyeBtn.classList.add('active');
      popover.classList.add('is-visible');
      container.innerHTML = '';
      hidden.forEach(k => {
        const btn = document.createElement('button');
        btn.className = 'hidden-pill-btn';
        btn.innerHTML = `<span>+</span> ${escapeHTML(k)}`;
        btn.title = `Click to restore ${escapeHTML(k)}`;
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          unhideCourse(k);
        });
        container.appendChild(btn);
      });
    } else {
      eyeBtn.classList.remove('active');
      popover.classList.remove('is-visible');
    }
  }
