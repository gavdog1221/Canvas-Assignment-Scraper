(async function initUnifiedDashboard() {
  const origin = window.location.origin;
  const STORAGE_KEY_DONE = 'canvas_mod_tasks_completed_v5';
  const STORAGE_KEY_OPEN = 'canvas_mod_tasks_open_accordions_v5';
  const STORAGE_KEY_FLAT = 'canvas_mod_tasks_flat_view_v1';
  const STORAGE_KEY_CACHE = 'canvas_mod_tasks_cache_payload_v5';
  const STORAGE_KEY_CACHE_TIME = 'canvas_mod_tasks_cache_time_v5';
  const STORAGE_KEY_HIDDEN_COURSES = 'canvas_mod_tasks_hidden_courses_v1';
  const STORAGE_KEY_THEME = 'canvas_mod_tasks_theme_v1';
  const STORAGE_KEY_GRADES_CACHE = 'canvas_mod_tasks_grades_cache_v5';
  const STORAGE_KEY_GRADES_CACHE_TIME = 'canvas_mod_tasks_grades_cache_time_v5';
  const STORAGE_KEY_COURSE_PERCENTAGES = 'canvas_mod_tasks_course_pcts_v1';
  const STORAGE_KEY_WHATIF = 'canvas_mod_tasks_whatif_scores_v1';
  const STORAGE_KEY_DOM_COLORS = 'canvas_mod_tasks_dom_colors_v2';

  const THEMES = ['cyan', 'synthwave', 'emerald', 'stealth'];
  let currentTheme = localStorage.getItem(STORAGE_KEY_THEME) || 'cyan';

  let currentTab = 'upcoming';
  let activeCourseFilter = 'ALL';
  let activeDayFilter = null;
  let searchQuery = '';
  let isFlatView = localStorage.getItem(STORAGE_KEY_FLAT) !== 'false';
  let isHiddenMenuOpen = false;
  let cachedCourseMap = {};
  let cachedGrades = [];
  let cachedCoursePercentages = {};
  let whatIfScores = {};
  let domCourseColors = {};

  try {
    whatIfScores = JSON.parse(localStorage.getItem(STORAGE_KEY_WHATIF) || '{}');
  } catch {
    whatIfScores = {};
  }

  try {
    domCourseColors = JSON.parse(localStorage.getItem(STORAGE_KEY_DOM_COLORS) || '{}');
  } catch {
    domCourseColors = {};
  }

  function saveWhatIfScores() {
    localStorage.setItem(STORAGE_KEY_WHATIF, JSON.stringify(whatIfScores));
  }

  // --- SCRAPE NATIVE CANVAS DASHBOARD CARD COLORS FROM DOM ---
  function scrapeCanvasDashboardColors() {
    const cards = document.querySelectorAll('.ic-DashboardCard, [data-course-id]');
    cards.forEach(card => {
      let courseId = card.getAttribute('data-course-id');
      if (!courseId) {
        const link = card.querySelector('a[href*="/courses/"]');
        if (link) {
          const m = link.getAttribute('href').match(/\/courses\/(\d+)/);
          if (m) courseId = m[1];
        }
      }
      if (!courseId) return;

      const headerHero = card.querySelector('.ic-DashboardCard__header_hero, .ic-DashboardCard__headerImage');
      const targetEl = headerHero || card;
      const bg = window.getComputedStyle(targetEl).backgroundColor;

      if (bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') {
        domCourseColors[String(courseId)] = bg;
      }
    });

    try {
      localStorage.setItem(STORAGE_KEY_DOM_COLORS, JSON.stringify(domCourseColors));
    } catch {}
  }

  // --- COLOR FORMATTING HELPERS ---
  const FALLBACK_PALETTES = [
    { accent: '#00f2fe', glow: 'rgba(0, 242, 254, 0.45)', soft: 'rgba(0, 242, 254, 0.14)' },
 { accent: '#a855f7', glow: 'rgba(168, 85, 247, 0.45)', soft: 'rgba(168, 85, 247, 0.14)' },
 { accent: '#10b981', glow: 'rgba(16, 185, 129, 0.45)', soft: 'rgba(16, 185, 129, 0.14)' },
 { accent: '#f59e0b', glow: 'rgba(245, 158, 11, 0.45)', soft: 'rgba(245, 158, 11, 0.14)' },
 { accent: '#ec4899', glow: 'rgba(236, 72, 153, 0.45)', soft: 'rgba(236, 72, 153, 0.14)' },
 { accent: '#3b82f6', glow: 'rgba(59, 130, 246, 0.45)', soft: 'rgba(59, 130, 246, 0.14)' },
 { accent: '#14b8a6', glow: 'rgba(20, 184, 166, 0.45)', soft: 'rgba(20, 184, 166, 0.14)' },
 { accent: '#f97316', glow: 'rgba(249, 115, 22, 0.45)', soft: 'rgba(249, 115, 22, 0.14)' }
  ];

  function parseColorToRgba(colorStr, alpha) {
    if (!colorStr) return null;

    // Handle rgb(r, g, b) or rgba(r, g, b, a)
    const rgbMatch = colorStr.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
    if (rgbMatch) {
      return `rgba(${rgbMatch[1]}, ${rgbMatch[2]}, ${rgbMatch[3]}, ${alpha})`;
    }

    // Handle #hex
    let c = colorStr.replace('#', '').trim();
    if (c.length === 3) c = c.split('').map(x => x + x).join('');
    const num = parseInt(c, 16);
    if (!isNaN(num) && c.length === 6) {
      const r = (num >> 16) & 255;
      const g = (num >> 8) & 255;
      const b = num & 255;
      return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }

    return null;
  }

  function getCourseColors(courseKey, canvasCourseId = null) {
    let rawColor = null;

    if (canvasCourseId && domCourseColors[String(canvasCourseId)]) {
      rawColor = domCourseColors[String(canvasCourseId)];
    } else if (cachedCourseMap[courseKey]?.canvasCourseId) {
      const altId = cachedCourseMap[courseKey].canvasCourseId;
      rawColor = domCourseColors[String(altId)];
    }

    if (rawColor) {
      const glow = parseColorToRgba(rawColor, 0.45) || 'rgba(0, 242, 254, 0.45)';
      const soft = parseColorToRgba(rawColor, 0.14) || 'rgba(0, 242, 254, 0.14)';
      return {
        accent: rawColor,
        glow: glow,
        soft: soft
      };
    }

    // Deterministic fallback by Course Code if unmapped
    let hash = 0;
    const str = courseKey || 'GENERAL';
    for (let i = 0; i < str.length; i++) {
      hash = (hash << 5) - hash + str.charCodeAt(i);
      hash |= 0;
    }
    const idx = Math.abs(hash) % FALLBACK_PALETTES.length;
    return FALLBACK_PALETTES[idx];
  }

  // --- PDF PREVIEW MODAL ENGINE ---
  function openPdfModal(rawUrl, title, courseId = null, fileId = null) {
    let modal = document.getElementById('canvas-doc-preview-modal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'canvas-doc-preview-modal';
      modal.className = 'doc-preview-modal';
      modal.innerHTML = `
      <div class="doc-preview-backdrop"></div>
      <div class="doc-preview-dialog">
      <div class="doc-preview-header">
      <span class="doc-preview-title" id="doc-preview-title">Document Preview</span>
      <div class="doc-preview-actions">
      <a class="doc-preview-btn-top" id="doc-preview-open-tab" target="_blank" rel="noopener noreferrer">↗ Open Tab</a>
      <a class="doc-preview-btn-top" id="doc-preview-download-link" download>Download ⤓</a>
      <button type="button" class="doc-preview-close" id="doc-preview-close-btn" title="Close Preview">✕</button>
      </div>
      </div>
      <div class="doc-preview-body">
      <iframe id="doc-preview-iframe" src="" frameborder="0"></iframe>
      </div>
      </div>
      `;
      document.body.appendChild(modal);

      const close = () => {
        modal.classList.remove('is-open');
        const iframe = document.getElementById('doc-preview-iframe');
        if (iframe) iframe.src = '';
      };

        modal.querySelector('.doc-preview-backdrop').addEventListener('click', close);
        modal.querySelector('#doc-preview-close-btn').addEventListener('click', close);
    }

    const titleEl = document.getElementById('doc-preview-title');
    const openTabBtn = document.getElementById('doc-preview-open-tab');
    const downloadLink = document.getElementById('doc-preview-download-link');
    const iframe = document.getElementById('doc-preview-iframe');

    let previewUrl = rawUrl;
    if (courseId && fileId) {
      previewUrl = `${origin}/courses/${courseId}/files/${fileId}/file_preview`;
    } else if (rawUrl && rawUrl.includes('/download?download_frd=1')) {
      previewUrl = rawUrl.replace('/download?download_frd=1', '');
    }

    if (titleEl) titleEl.innerText = title || 'Document Preview';
    if (openTabBtn) openTabBtn.href = previewUrl;
    if (downloadLink) downloadLink.href = rawUrl;
    if (iframe) iframe.src = previewUrl;

    modal.classList.add('is-open');
  }

  // --- FULL VIEWPORT CONFETTI ENGINE ---
  let activeParticles = [];
  let isConfettiLoopRunning = false;

  function ensureConfettiCanvas() {
    let canvas = document.getElementById('canvas-tasks-confetti');
    if (!canvas) {
      canvas = document.createElement('canvas');
      canvas.id = 'canvas-tasks-confetti';
      document.body.appendChild(canvas);
    }
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    return canvas;
  }

  function launchConfetti(originX, originY) {
    const canvas = ensureConfettiCanvas();
    const ctx = canvas.getContext('2d');
    const colors = ['#00f2fe', '#4facfe', '#f43f5e', '#c084fc', '#10b981', '#fb923c', '#eab308'];

    for (let i = 0; i < 50; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = Math.random() * 8 + 3;
      activeParticles.push({
        x: originX,
        y: originY,
        vx: Math.cos(angle) * speed,
                           vy: Math.sin(angle) * speed - 3.5,
                           size: Math.random() * 6 + 3,
                           color: colors[Math.floor(Math.random() * colors.length)],
                           alpha: 1,
                           decay: Math.random() * 0.022 + 0.014,
                           rotation: Math.random() * 360,
                           rotSpeed: (Math.random() - 0.5) * 12
      });
    }

    if (!isConfettiLoopRunning) {
      isConfettiLoopRunning = true;
      runConfettiLoop(canvas, ctx);
    }
  }

  function runConfettiLoop(canvas, ctx) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    for (let i = activeParticles.length - 1; i >= 0; i--) {
      const p = activeParticles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.22;
      p.rotation += p.rotSpeed;
      p.alpha -= p.decay;

      if (p.alpha <= 0 || p.y > canvas.height) {
        activeParticles.splice(i, 1);
      } else {
        ctx.save();
        ctx.globalAlpha = Math.max(p.alpha, 0);
        ctx.fillStyle = p.color;
        ctx.translate(p.x, p.y);
        ctx.rotate((p.rotation * Math.PI) / 180);
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 1.5);
        ctx.restore();
      }
    }

    if (activeParticles.length > 0) {
      requestAnimationFrame(() => runConfettiLoop(canvas, ctx));
    } else {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      isConfettiLoopRunning = false;
    }
  }

  function purgeDefaultCanvasElements() {
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

  function isCurrentSemesterCourse(name) {
    if (!name) return false;
    const str = name.toLowerCase();
    if (str.includes('spring') || str.includes('sp26') || str.includes('sp25') || str.includes('2025') || str.includes('2024')) {
      return false;
    }
    if (/fall\s*2026|fa\s*26|f26|fall\s*26/i.test(str)) {
      return true;
    }
    return !/spring|summer|winter|fall/i.test(str);
  }

  function normalizeCourseCode(name) {
    if (!name) return 'GENERAL';
    const match = name.match(/([a-zA-Z]{2,5}\s*\d{3})/i);
    if (match) return match[1].replace(/\s+/g, ' ').toUpperCase();
    return name.replace(/\[gradescope\]/i, '').split('(')[0].trim().toUpperCase();
  }

  function extractCoreAssignmentToken(title, courseKey = '') {
    if (!title) return '';

    let t = title.toLowerCase().replace(/[_.\-\/]+/g, ' ');

    if (courseKey) {
      const flatKey = courseKey.toLowerCase().replace(/[^a-z0-9]/g, '');
      t = t.replace(new RegExp('\\b' + flatKey + '\\b', 'g'), ' ');
      const spacedKey = courseKey.toLowerCase().split(/\s+/).join('\\s*');
      t = t.replace(new RegExp('\\b' + spacedKey + '\\b', 'g'), ' ');
    }
    t = t.replace(/\b[a-z]{2,5}\s*\d{3}\b/g, ' ');

    t = t.replace(/\b(pdf|docx?|zip|pptx?|xlsx?)\b/gi, ' ')
    .replace(/\b(fall|fa|spring|sp|summer|winter)\s*\d{2,4}\b/gi, ' ')
    .replace(/\(?\s*submission\s+window\s+in\s+grade\w*\s*\)?/gi, ' ');

    const match = t.match(/\b(hw|homework|assignment|prob(?:lem)?\s*set|pset|lab|quiz|project|exam|a)\s*(\d{1,2})\b/i);
    if (match) {
      let prefix = match[1].toLowerCase().replace(/\s+/g, '');
      if (['hw', 'homework', 'assignment', 'problemset', 'pset', 'probset'].includes(prefix)) {
        prefix = 'hw';
      }
      return `${prefix}${parseInt(match[2], 10)}`;
    }

    const numOnly = t.match(/\b(\d{1,2})\b/);
    if (numOnly) {
      return `hw${parseInt(numOnly[1], 10)}`;
    }

    return t.replace(/[^a-z0-9]/g, '');
  }

  function getCompletedTasks() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY_DONE) || '{}');
    } catch { return {}; }
  }

  function setTaskCompleted(taskId, isDone) {
    const data = getCompletedTasks();
    if (isDone) data[taskId] = Date.now();
    else delete data[taskId];
    localStorage.setItem(STORAGE_KEY_DONE, JSON.stringify(data));
  }

  const STORAGE_KEY_CUSTOM_DUE = 'canvas_mod_tasks_custom_due_v1';

  function getCustomDueDates() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY_CUSTOM_DUE) || '{}');
    } catch { return {}; }
  }

  function setCustomDueDate(taskId, isoStringOrNull) {
    const data = getCustomDueDates();
    if (isoStringOrNull) data[taskId] = isoStringOrNull;
    else delete data[taskId];
    localStorage.setItem(STORAGE_KEY_CUSTOM_DUE, JSON.stringify(data));
  }

  function applyCustomDueDates() {
    const customDates = getCustomDueDates();
    Object.values(cachedCourseMap).forEach(course => {
      (course.tasks || []).forEach(t => {
        if (!t.dueDate && customDates[t.id]) {
          const d = new Date(customDates[t.id]);
          t.customDueDate = isNaN(d.getTime()) ? null : d;
        } else {
          t.customDueDate = null;
        }
      });
    });
  }

  function effectiveDueDate(t) {
    return t.dueDate || t.customDueDate || null;
  }

  function getHiddenCourses() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY_HIDDEN_COURSES) || '[]');
    } catch { return []; }
  }

  function hideCourse(courseKey) {
    const hidden = getHiddenCourses();
    if (!hidden.includes(courseKey)) {
      hidden.push(courseKey);
      localStorage.setItem(STORAGE_KEY_HIDDEN_COURSES, JSON.stringify(hidden));
    }
    if (activeCourseFilter === courseKey) {
      activeCourseFilter = 'ALL';
    }
    renderFilterPills();
    updateHiddenMenuButton();
    updateProgressBar();
    renderWorkloadStrip();
    renderCurrentView();
  }

  function unhideCourse(courseKey) {
    let hidden = getHiddenCourses();
    hidden = hidden.filter(k => k !== courseKey);
    localStorage.setItem(STORAGE_KEY_HIDDEN_COURSES, JSON.stringify(hidden));
    if (hidden.length === 0) {
      isHiddenMenuOpen = false;
    }
    renderFilterPills();
    updateHiddenMenuButton();
    updateProgressBar();
    renderWorkloadStrip();
    renderCurrentView();
  }

  function getSavedAccordions() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY_OPEN) || '{}');
    } catch { return {}; }
  }

  function saveAccordionState(courseId, isOpen) {
    const state = getSavedAccordions();
    state[courseId] = isOpen;
    localStorage.setItem(STORAGE_KEY_OPEN, JSON.stringify(state));
  }

  function loadLocalCache() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY_CACHE);
      if (!raw) return null;
      const data = JSON.parse(raw);
      Object.keys(data).forEach(courseKey => {
        data[courseKey].tasks.forEach(t => {
          if (t.dueDate) t.dueDate = new Date(t.dueDate);
        });
      });
      return data;
    } catch {
      return null;
    }
  }

  function saveLocalCache(courseMap) {
    try {
      localStorage.setItem(STORAGE_KEY_CACHE, JSON.stringify(courseMap));
      localStorage.setItem(STORAGE_KEY_CACHE_TIME, Date.now().toString());
    } catch (e) {
      console.warn('Cache write failed:', e);
    }
  }

  function loadLocalGradesCache() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY_GRADES_CACHE);
      if (!raw) return null;
      const data = JSON.parse(raw);
      if (!Array.isArray(data)) return null;
      data.forEach(g => {
        if (g.gradedAt) g.gradedAt = new Date(g.gradedAt);
      });
        return data;
    } catch {
      return null;
    }
  }

  function saveLocalGradesCache(grades) {
    try {
      localStorage.setItem(STORAGE_KEY_GRADES_CACHE, JSON.stringify(grades));
      localStorage.setItem(STORAGE_KEY_GRADES_CACHE_TIME, Date.now().toString());
    } catch (e) {
      console.warn('Grades cache write failed:', e);
    }
  }

  function loadCoursePercentagesCache() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY_COURSE_PERCENTAGES) || '{}');
    } catch {
      return {};
    }
  }

  function saveCoursePercentagesCache(data) {
    try {
      localStorage.setItem(STORAGE_KEY_COURSE_PERCENTAGES, JSON.stringify(data));
    } catch (e) {}
  }

  function percentageToGpa(pct) {
    if (pct >= 93) return { gpa: 4.0, letter: 'A' };
    if (pct >= 90) return { gpa: 3.7, letter: 'A-' };
    if (pct >= 87) return { gpa: 3.3, letter: 'B+' };
    if (pct >= 83) return { gpa: 3.0, letter: 'B' };
    if (pct >= 80) return { gpa: 2.7, letter: 'B-' };
    if (pct >= 77) return { gpa: 2.3, letter: 'C+' };
    if (pct >= 73) return { gpa: 2.0, letter: 'C' };
    if (pct >= 70) return { gpa: 1.7, letter: 'C-' };
    if (pct >= 67) return { gpa: 1.3, letter: 'D+' };
    if (pct >= 60) return { gpa: 1.0, letter: 'D' };
    return { gpa: 0.0, letter: 'F' };
  }

  function showReloadProgress(message, percent) {
    let overlay = document.getElementById('reload-progress-overlay');
    if (!overlay) {
      const widget = document.getElementById('module-tasks-widget');
      if (!widget) return;
      overlay = document.createElement('div');
      overlay.id = 'reload-progress-overlay';
      overlay.className = 'reload-progress-overlay';
      overlay.innerHTML = `
      <div class="reload-meta-row">
      <span class="reload-label"><span class="reload-spinner">↻</span> <span id="reload-status-text">Reloading courses...</span></span>
      <span class="reload-percent-text" id="reload-percent-text">0%</span>
      </div>
      <div class="reload-bar-bg">
      <div class="reload-bar-fill" id="reload-bar-fill" style="width: 0%;"></div>
      </div>
      `;
      const header = widget.querySelector('.header');
      if (header && header.nextSibling) {
        widget.insertBefore(overlay, header.nextSibling);
      } else {
        widget.prepend(overlay);
      }
    }

    const statusText = document.getElementById('reload-status-text');
    const percentText = document.getElementById('reload-percent-text');
    const barFill = document.getElementById('reload-bar-fill');

    if (statusText) statusText.innerText = message;
    const clamped = Math.max(0, Math.min(100, Math.round(percent)));
    if (percentText) percentText.innerText = `${clamped}%`;
    if (barFill) barFill.style.width = `${clamped}%`;
  }

  function hideReloadProgress() {
    const overlay = document.getElementById('reload-progress-overlay');
    if (overlay) overlay.remove();
  }

  function deduplicateCourseMap(courseMap, allGrades = []) {
    const gradedTokensByCourse = {};
    const gradedCanvasIds = new Set();

    allGrades.forEach(g => {
      if (g.canvasAssignmentId) gradedCanvasIds.add(g.canvasAssignmentId);
      if (!gradedTokensByCourse[g.courseKey]) gradedTokensByCourse[g.courseKey] = new Set();
      const tok = extractCoreAssignmentToken(g.title, g.courseKey);
      if (tok) gradedTokensByCourse[g.courseKey].add(tok);
    });

      Object.keys(courseMap).forEach(key => {
        const course = courseMap[key];
        const uniqueTasks = [];
        const courseGradedTokens = gradedTokensByCourse[key] || new Set();

        (course.tasks || []).forEach(candidate => {
          if (candidate.canvasAssignmentId && gradedCanvasIds.has(candidate.canvasAssignmentId)) {
            return;
          }

          const candToken = extractCoreAssignmentToken(candidate.title, key);
          if (candToken && courseGradedTokens.has(candToken)) {
            return;
          }

          const candDateKey = candidate.dueDate ? localDateKey(candidate.dueDate) : null;

          const existingIdx = uniqueTasks.findIndex(existing => {
            if (candidate.canvasAssignmentId && existing.canvasAssignmentId && candidate.canvasAssignmentId === existing.canvasAssignmentId) {
              return true;
            }
            if (candidate.id === existing.id) return true;

            const existToken = extractCoreAssignmentToken(existing.title, key);
            const existDateKey = existing.dueDate ? localDateKey(existing.dueDate) : null;

            if (candToken && existToken && candToken === existToken) {
              return true;
            }

            if (candidate.gradescope && candDateKey && existDateKey && candDateKey === existDateKey) {
              return true;
            }

            return false;
          });

          if (existingIdx === -1) {
            uniqueTasks.push(candidate);
          } else {
            const target = uniqueTasks[existingIdx];
            if (target.points === null && candidate.points !== null) target.points = candidate.points;
            if (!target.downloadUrl && candidate.downloadUrl) target.downloadUrl = candidate.downloadUrl;
            if (!target.contentId && candidate.contentId) target.contentId = candidate.contentId;
            if (!target.canvasCourseId && candidate.canvasCourseId) target.canvasCourseId = candidate.canvasCourseId;
            if (!target.isSubmitted && candidate.isSubmitted) target.isSubmitted = true;
            if (!target.dueDate && candidate.dueDate) {
              target.dueDate = candidate.dueDate;
              target.isUndatedHw = false;
            }
            if (!target.moduleName && candidate.moduleName) target.moduleName = candidate.moduleName;
            if (candidate.isGradescope) target.isGradescope = true;

            if (/\.(pdf|docx?|zip)/i.test(target.title) && !/\.(pdf|docx?|zip)/i.test(candidate.title)) {
              target.title = candidate.title;
              target.url = candidate.url;
            }
          }
        });

        course.tasks = uniqueTasks;
      });

      return courseMap;
  }

  const checkInterval = setInterval(() => {
    const rightSide = document.getElementById('right-side');
    if (rightSide && !document.getElementById('module-tasks-widget')) {
      clearInterval(checkInterval);
      document.body.classList.add('with-right-side');
      scrapeCanvasDashboardColors();
      injectWidget(rightSide);
      purgeDefaultCanvasElements();
    }
  }, 400);

  setInterval(purgeDefaultCanvasElements, 2500);

  function injectWidget(container) {
    const widget = document.createElement('div');
    widget.id = 'module-tasks-widget';
    widget.setAttribute('data-theme', currentTheme);
    widget.innerHTML = `
    <div class="header">
    <div class="title-row">
    <span class="title">Tasks Hub</span>
    </div>
    <div class="widget-controls">
    <button class="icon-btn" id="toggle-theme-btn" title="Cycle Theme (Cyan / Synthwave / Emerald / Stealth)">🎨</button>
    <button class="icon-btn eye-btn" id="toggle-hidden-courses-btn" title="View Hidden Classes">👁<span class="eye-badge" id="eye-badge" style="display:none;"></span></button>
    <button class="icon-btn" id="toggle-view-mode" title="Switch Grouped / Chronological">${isFlatView ? 'Group' : 'Timeline'}</button>
    <button class="icon-btn" id="toggle-all-accordions" title="Collapse/Expand All">Toggle</button>
    <button class="icon-btn" id="refresh-mod-tasks" title="Reload Everything">↻</button>
    </div>
    </div>

    <div class="hidden-courses-popover" id="hidden-courses-popover">
    <div class="hidden-popover-header">
    <span class="hidden-popover-title">Hidden Classes</span>
    <button class="hidden-popover-close" id="close-hidden-courses-btn" title="Close">✕</button>
    </div>
    <div class="hidden-pills-list" id="hidden-pills-container"></div>
    </div>

    <div class="workload-strip" id="workload-strip-container"></div>

    <div class="progress-container">
    <div class="progress-meta">
    <span id="progress-label">0% this week</span>
    <span id="progress-count">0/0 this week</span>
    </div>
    <div class="progress-bar-bg">
    <div class="progress-bar-fill tier-low" id="progress-bar-fill"></div>
    </div>
    </div>

    <div class="search-wrapper">
    <input type="text" class="search-input" id="task-search-input" placeholder="Search tasks or assignments..." />
    </div>

    <div class="view-tabs">
    <button class="tab-btn active" data-tab="upcoming">Upcoming</button>
    <button class="tab-btn overdue" data-tab="overdue">Overdue <span id="overdue-total-badge"></span></button>
    <button class="tab-btn" data-tab="completed">Completed</button>
    <button class="tab-btn" data-tab="grades">Grades</button>
    </div>

    <div class="course-pills" id="course-pills-container"></div>

    <div id="module-tasks-list">
    <div class="mod-empty-msg">Scanning Canvas & Gradescope...</div>
    </div>
    `;

    container.prepend(widget);

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

    document.getElementById('toggle-theme-btn').addEventListener('click', () => {
      const nextIdx = (THEMES.indexOf(currentTheme) + 1) % THEMES.length;
      currentTheme = THEMES[nextIdx];
      localStorage.setItem(STORAGE_KEY_THEME, currentTheme);
      widget.setAttribute('data-theme', currentTheme);
    });

    document.getElementById('refresh-mod-tasks').addEventListener('click', () => {
      scrapeCanvasDashboardColors();
      loadTasks(true);
    });
    document.getElementById('toggle-all-accordions').addEventListener('click', toggleAllAccordions);
    updateToggleAllButtonState();

    const eyeBtn = document.getElementById('toggle-hidden-courses-btn');
    const closeBtn = document.getElementById('close-hidden-courses-btn');

    eyeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      isHiddenMenuOpen = !isHiddenMenuOpen;
      updateHiddenMenuButton();
    });

    closeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      isHiddenMenuOpen = false;
      updateHiddenMenuButton();
    });

    document.getElementById('toggle-view-mode').addEventListener('click', (e) => {
      isFlatView = !isFlatView;
      localStorage.setItem(STORAGE_KEY_FLAT, isFlatView);
      e.target.innerText = isFlatView ? 'Group' : 'Timeline';
      updateToggleAllButtonState();
      renderCurrentView();
    });

    document.getElementById('task-search-input').addEventListener('input', (e) => {
      searchQuery = e.target.value.toLowerCase().trim();
      renderCurrentView();
    });

    widget.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        widget.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentTab = btn.getAttribute('data-tab');
        activeDayFilter = null;
        renderCurrentView();
      });
    });

    setInterval(() => {
      if (document.getElementById('module-tasks-widget')) {
        renderCurrentView();
      }
    }, 30000);

    const cachedGradesLocal = loadLocalGradesCache();
    if (cachedGradesLocal) {
      cachedGrades = cachedGradesLocal;
    }
    cachedCoursePercentages = loadCoursePercentagesCache();

    const cached = loadLocalCache();
    const lastCacheTime = parseInt(localStorage.getItem(STORAGE_KEY_CACHE_TIME) || '0', 10);
    const isCacheFresh = (Date.now() - lastCacheTime) < (15 * 60 * 1000);

    if (cached && Object.keys(cached).length > 0) {
      cachedCourseMap = deduplicateCourseMap(cached, cachedGrades);
      applyCustomDueDates();
      renderFilterPills();
      updateHiddenMenuButton();
      updateProgressBar();
      renderWorkloadStrip();
      renderCurrentView();

      if (!isCacheFresh) {
        loadTasks(false);
      }
    } else {
      loadTasks(true);
    }
  }

  function updateHiddenMenuButton() {
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
      isHiddenMenuOpen = false;
    }

    if (isHiddenMenuOpen && hidden.length > 0) {
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

  function renderWorkloadStrip() {
    const container = document.getElementById('workload-strip-container');
    if (!container) return;
    container.innerHTML = '';

    const completedMap = getCompletedTasks();
    const hiddenCourses = getHiddenCourses();
    const now = new Date();
    const days = [];

    for (let i = 0; i < 7; i++) {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i);
      const isoKey = localDateKey(d);

      let label = d.toLocaleDateString([], { weekday: 'short' });
      if (i === 0) label = 'Today';
      else if (i === 1) label = 'Tmrw';

      days.push({
        dateKey: isoKey,
        label: label,
        isUrgent: i <= 1,
        count: 0
      });
    }

    Object.entries(cachedCourseMap).forEach(([courseKey, course]) => {
      if (hiddenCourses.includes(courseKey)) return;
      (course.tasks || []).forEach(t => {
        const ed = effectiveDueDate(t);
        if (!ed || completedMap[t.id]) return;
        const taskKey = localDateKey(ed);
        const dayMatch = days.find(d => d.dateKey === taskKey);
        if (dayMatch) dayMatch.count++;
      });
    });

    days.forEach(day => {
      const dayEl = document.createElement('div');
      dayEl.className = `workload-day ${day.count > 0 ? 'has-tasks' : ''} ${day.isUrgent && day.count > 0 ? 'has-urgent' : ''} ${activeDayFilter === day.dateKey ? 'active' : ''}`;
      dayEl.innerHTML = `
      <span class="day-name">${day.label}</span>
      <span class="day-count">${day.count}</span>
      `;

      dayEl.addEventListener('click', () => {
        if (activeDayFilter === day.dateKey) {
          activeDayFilter = null;
        } else {
          activeDayFilter = day.dateKey;
          currentTab = 'upcoming';
          document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.getAttribute('data-tab') === 'upcoming'));
        }
        renderWorkloadStrip();
        renderCurrentView();
      });

      container.appendChild(dayEl);
    });
  }

  function getWeekBounds(referenceDate = new Date()) {
    const d = new Date(referenceDate);
    const day = d.getDay();
    const diffToMonday = day === 0 ? -6 : 1 - day;

    const startOfWeek = new Date(d.getFullYear(), d.getMonth(), d.getDate() + diffToMonday, 0, 0, 0, 0);
    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 6);
    endOfWeek.setHours(23, 59, 59, 999);

    return { startOfWeek, endOfWeek };
  }

  function updateProgressBar() {
    const completedMap = getCompletedTasks();
    const hiddenCourses = getHiddenCourses();
    const countedIds = new Set();
    const { startOfWeek, endOfWeek } = getWeekBounds();

    let total = 0;
    let completed = 0;

    Object.entries(cachedCourseMap).forEach(([courseKey, c]) => {
      if (hiddenCourses.includes(courseKey)) return;
      (c.tasks || []).forEach(t => {
        if (!t.id || countedIds.has(t.id)) return;

        const ed = effectiveDueDate(t);
        if (!ed || ed < startOfWeek || ed > endOfWeek) {
          return;
        }

        countedIds.add(t.id);
        const isDone = !!completedMap[t.id];

        total++;
        if (isDone) {
          completed++;
        }
      });
    });

    const percent = total > 0 ? Math.round((completed / total) * 100) : 0;
    const fillEl = document.getElementById('progress-bar-fill');
    const labelEl = document.getElementById('progress-label');
    const countEl = document.getElementById('progress-count');
    const container = document.querySelector('.progress-container');

    if (!fillEl || !labelEl || !countEl) return;

    fillEl.style.setProperty('width', `${percent}%`, 'important');
    fillEl.classList.remove('tier-low', 'tier-mid', 'tier-high', 'tier-complete');

    if (total === 0) {
      labelEl.innerText = 'No tasks due this week';
      if (container) container.classList.remove('is-all-done');
    } else if (percent === 100) {
      fillEl.classList.add('tier-complete');
      labelEl.innerText = '✨ 100% Week Done!';
      if (container) container.classList.add('is-all-done');
    } else if (percent >= 70) {
      fillEl.classList.add('tier-high');
      labelEl.innerText = `${percent}% this week`;
      if (container) container.classList.remove('is-all-done');
    } else if (percent >= 30) {
      fillEl.classList.add('tier-mid');
      labelEl.innerText = `${percent}% this week`;
      if (container) container.classList.remove('is-all-done');
    } else {
      fillEl.classList.add('tier-low');
      labelEl.innerText = `${percent}% this week`;
      if (container) container.classList.remove('is-all-done');
    }

    countEl.innerText = `${completed}/${total} this week`;
  }

  function updateToggleAllButtonState() {
    const btn = document.getElementById('toggle-all-accordions');
    if (!btn) return;
    btn.disabled = isFlatView;
    btn.title = isFlatView
    ? 'Switch to Group view to collapse/expand courses'
    : 'Collapse/Expand All';
  }

  function toggleAllAccordions() {
    if (isFlatView) return;
    const accordions = Array.from(document.querySelectorAll('.course-accordion'));
    if (accordions.length === 0) return;
    const anyClosed = accordions.some(acc => !acc.classList.contains('open'));
    accordions.forEach(acc => {
      acc.classList.toggle('open', anyClosed);
      const key = acc.getAttribute('data-course-key');
      if (key) saveAccordionState(key, anyClosed);
    });
  }

  function getCsrfToken() {
    const match = document.cookie.match(/(?:^|;\s*)_csrf_token=([^;]+)/);
    return match ? decodeURIComponent(match[1]) : '';
  }

  function localDateKey(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  function parseAndCleanTitle(rawTitle) {
    const currentYear = new Date().getFullYear();
    let dueDate = null;
    let cleanTitle = rawTitle;

    const monthPattern = /(?:\(|\[|-|\s)*(?:approx\s*)?(?:due\s*(?:date)?[:\s-]*)(?:(?:mon|tue|wed|thu|fri|sat|sun)[a-z]*,?\s*)?([a-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:\s+(?:at|@)?\s*(\d{1,2}(?::\d{2})?\s*(?:am|pm)?))?(?:\)|\])?/i;
    const mMatch = cleanTitle.match(monthPattern);

    if (mMatch && isNaN(mMatch[1])) {
      const timeStr = mMatch[3] || '11:59 PM';
      const candidate = new Date(`${mMatch[1]} ${mMatch[2]}, ${currentYear} ${timeStr}`);
      if (!isNaN(candidate.getTime())) {
        dueDate = candidate;
        cleanTitle = cleanTitle.replace(mMatch[0], ' ');
      }
    }

    if (!dueDate) {
      const numPattern = /(?:\(|\[|-|\s)*(?:approx\s*)?(?:due\s*(?:date)?[:\s-]*)\(?(\d{1,2})[\/\.\-](\d{1,2})(?:[\/\.\-](\d{2,4}))?\)?(?:\s+(?:at|@)?\s*(\d{1,2}(?::\d{2})?\s*(?:am|pm)?))?(?:\)|\])?/i;
      const nMatch = cleanTitle.match(numPattern);

      if (nMatch) {
        const year = nMatch[3] ? (nMatch[3].length === 2 ? `20${nMatch[3]}` : nMatch[3]) : currentYear;
        const timeStr = nMatch[4] || '11:59 PM';
        const candidate = new Date(`${nMatch[1]}/${nMatch[2]}/${year} ${timeStr}`);
        if (!isNaN(candidate.getTime())) {
          dueDate = candidate;
          cleanTitle = cleanTitle.replace(nMatch[0], ' ');
        }
      }
    }

    cleanTitle = cleanTitle
    .replace(/\(\s*\)/g, '')
    .replace(/\[\s*\]/g, '')
    .replace(/^[-\s:|]+|[-\s:|]+$/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();

    return { title: cleanTitle || rawTitle, dueDate };
  }

  function generateTaskId(courseKey, title) {
    const token = extractCoreAssignmentToken(title, courseKey) || title.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
    return `${courseKey}_${token}`;
  }

  async function fetchGradescopeData() {
    const gsTasksByCourse = {};
    const gsGradesByCourse = {};

    try {
      let dashRes = await fetch('https://www.gradescope.com/', { credentials: 'include' });
      if (!dashRes.ok) {
        dashRes = await fetch('https://www.gradescope.com/courses', { credentials: 'include' });
      }
      if (!dashRes.ok) return { tasksByCourse: gsTasksByCourse, gradesByCourse: gsGradesByCourse };

      const htmlText = await dashRes.text();
      const parser = new DOMParser();
      const doc = parser.parseFromString(htmlText, 'text/html');

      const courseLinks = Array.from(doc.querySelectorAll('a[href*="/courses/"]'));
      const courseMap = new Map();

      courseLinks.forEach(el => {
        const href = el.getAttribute('href');
        const match = href ? href.match(/\/courses\/(\d+)$/) : null;
        if (!match) return;

        const courseId = match[1];
        const fullUrl = `https://www.gradescope.com/courses/${courseId}`;
        const titleEl = el.querySelector('h3, .courseBox--shortname, .courseBox--name') || el;
        let name = titleEl.innerText.split('\n')[0].trim().replace(/\s+/g, ' ');

        if (!isCurrentSemesterCourse(name)) return;
        if (!courseMap.has(courseId) && name) {
          courseMap.set(courseId, { id: courseId, name: name, url: fullUrl });
        }
      });

      await Promise.all(Array.from(courseMap.values()).map(async (course) => {
        try {
          const cRes = await fetch(course.url, { credentials: 'include' });
          if (!cRes.ok) return;

          const cHtml = await cRes.text();
          const cDoc = parser.parseFromString(cHtml, 'text/html');
          const rows = Array.from(cDoc.querySelectorAll('tbody tr'));
          const tasks = [];
          const grades = [];
          const courseKey = normalizeCourseCode(course.name);

          rows.forEach(row => {
            const btnEl = row.querySelector('button.js-submitAssignment, [data-assignment-title]');
            const linkEl = row.querySelector('.table--primaryLink a, a[href*="/assignments/"]');

            let title = '';
            if (btnEl) title = btnEl.getAttribute('data-assignment-title') || btnEl.innerText.trim();
            else if (linkEl) title = linkEl.innerText.trim();
            else {
              const th = row.querySelector('th');
              if (th) title = th.innerText.trim();
            }

            title = title.split('\n')[0].trim();
            if (!title || title.toLowerCase() === 'name') return;

            let url = course.url;
            if (btnEl && btnEl.getAttribute('data-post-url')) {
              const postUrl = btnEl.getAttribute('data-post-url');
              url = `https://www.gradescope.com${postUrl.replace(/\/submissions.*$/, '')}`;
            } else if (linkEl && linkEl.getAttribute('href')) {
              url = `https://www.gradescope.com${linkEl.getAttribute('href')}`;
            }

            const statusEl = row.querySelector('.submissionStatus--text, .submissionStatus');
            const statusText = statusEl ? statusEl.innerText.trim() : '';
            const rowText = row.innerText || '';
            const scoreMatch = (statusText || rowText).match(/(-?\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)/);

            if (scoreMatch) {
              grades.push({
                id: generateTaskId(courseKey, title) + '_grade',
                          title: title,
                          score: parseFloat(scoreMatch[1]),
                          pointsPossible: parseFloat(scoreMatch[2]),
                          url: url,
                          gradedAt: null,
                          isGradescope: true,
                          courseKey: courseKey,
                          courseName: course.name
              });
              return;
            }

            const hasActiveSubmission = /submitted/i.test(statusText) && !/no submission/i.test(statusText);

            let dueDate = null;
            const dueTimeTag = row.querySelector('time.submissionTimeChart--dueDate:not([aria-label*="Late"])');
            if (dueTimeTag && dueTimeTag.getAttribute('datetime')) {
              dueDate = new Date(dueTimeTag.getAttribute('datetime'));
            } else {
              const anyDueTag = row.querySelector('time.submissionTimeChart--dueDate');
              if (anyDueTag && anyDueTag.getAttribute('datetime')) {
                dueDate = new Date(anyDueTag.getAttribute('datetime'));
              }
            }

            tasks.push({
              id: generateTaskId(courseKey, title),
                       title: title,
                       url: url,
                       dueDate: dueDate,
                       points: null,
                       isUndatedHw: !dueDate,
                       isGradescope: true,
                       isSubmitted: hasActiveSubmission,
                       courseKey: courseKey,
                       courseName: course.name,
                       downloadUrl: null,
                       contentId: null,
                       canvasCourseId: null
            });
          });

          if (tasks.length > 0) {
            gsTasksByCourse[courseKey] = {
              name: course.name,
              tasks: tasks
            };
          }

          if (grades.length > 0) {
            gsGradesByCourse[courseKey] = {
              name: course.name,
              grades: grades
            };
          }
        } catch (err) {
          console.warn(`[Gradescope] Error on ${course.name}:`, err);
        }
      }));
    } catch (e) {
      console.warn('[Gradescope] Error:', e);
    }

    return { tasksByCourse: gsTasksByCourse, gradesByCourse: gsGradesByCourse };
  }

  async function fetchCanvasGrades(headers, courseNameById) {
    const grades = [];
    try {
      const res = await fetch(`${origin}/api/v1/users/self/graded_submissions?include[]=assignment&per_page=50`, {
        credentials: 'include',
        headers: headers
      });
      if (!res.ok) return grades;

      const submissions = await res.json();
      if (!Array.isArray(submissions)) return grades;

      submissions.forEach(sub => {
        if (sub.score === null || sub.score === undefined || sub.excused) return;
        const assignment = sub.assignment;
        if (!assignment) return;

        const rawCourseName = courseNameById[assignment.course_id];
        if (!rawCourseName) return;

        const courseKey = normalizeCourseCode(rawCourseName);

        grades.push({
          id: `canvas_${sub.id}`,
          canvasAssignmentId: assignment.id,
          title: assignment.name,
          score: sub.score,
          pointsPossible: assignment.points_possible ?? null,
          url: assignment.html_url || sub.html_url || null,
          gradedAt: sub.graded_at ? new Date(sub.graded_at) : null,
                    isGradescope: false,
                    courseKey: courseKey,
                    courseName: rawCourseName
        });
      });
    } catch (e) {
      console.warn('[Grades] Canvas error:', e);
    }
    return grades;
  }

  async function loadTasks(showLoadingUI = true) {
    const listContainer = document.getElementById('module-tasks-list');
    if (showLoadingUI && (!cachedCourseMap || Object.keys(cachedCourseMap).length === 0)) {
      listContainer.innerHTML = '<div class="mod-empty-msg">Scanning Canvas Modules, Assignments & Gradescope...</div>';
    }

    if (showLoadingUI) {
      showReloadProgress('Connecting to Canvas...', 5);
    }

    const csrfToken = getCsrfToken();
    const headers = {
      'Accept': 'application/json',
      'X-Requested-With': 'XMLHttpRequest'
    };
    if (csrfToken) headers['X-CSRF-Token'] = csrfToken;

    try {
      const gradescopePromise = fetchGradescopeData();

      let courses = [];
      const favRes = await fetch(`${origin}/api/v1/users/self/favorites/courses?include[]=total_scores`, {
        credentials: 'include',
        headers: headers
      });
      if (favRes.ok) courses = await favRes.json();

      if (!courses || courses.length === 0) {
        const courseRes = await fetch(`${origin}/api/v1/courses?enrollment_state=active&include[]=total_scores&per_page=25`, {
          credentials: 'include',
          headers: headers
        });
        if (courseRes.ok) courses = await courseRes.json();
      }

      if (showLoadingUI) {
        showReloadProgress('Filtering active semester courses...', 15);
      }

      const activeCourses = (courses || []).filter(course => {
        if (!course.id || course.access_restricted_by_date) return false;
        const rawName = course.course_code || course.name;
        return isCurrentSemesterCourse(rawName);
      });

      const unifiedCourseMap = {};
      const courseNameById = {};
      const officialCoursePercentages = {};
      const homeworkFolderPattern = /homework|assignment|hw\b|lab\b|problem\s*set/i;

      activeCourses.forEach(c => {
        const rawCourseName = c.course_code || c.name;
        courseNameById[c.id] = rawCourseName;
        const courseKey = normalizeCourseCode(rawCourseName);
        if (!unifiedCourseMap[courseKey]) {
          unifiedCourseMap[courseKey] = { name: rawCourseName, canvasCourseId: c.id, tasks: [] };
        }

        if (Array.isArray(c.enrollments)) {
          c.enrollments.forEach(en => {
            if (en.type === 'student') {
              const pct = en.computed_current_score ?? en.computed_final_score ?? null;
              if (pct !== null && !isNaN(pct)) {
                officialCoursePercentages[courseKey] = parseFloat(pct);
              }
            }
          });
        }
      });

      const totalSteps = Math.max(activeCourses.length, 1);
      let stepIndex = 0;

      for (const course of activeCourses) {
        const rawCourseName = courseNameById[course.id];
        const courseKey = normalizeCourseCode(rawCourseName);

        stepIndex++;
        if (showLoadingUI) {
          const pct = 15 + Math.round((stepIndex / totalSteps) * 60);
          showReloadProgress(`Scanning ${courseKey}...`, pct);
        }

        // 1. Modules Scan
        try {
          const modRes = await fetch(`${origin}/api/v1/courses/${course.id}/modules?include[]=items&per_page=50`, {
            credentials: 'include',
            headers: headers
          });

          if (modRes.ok) {
            const modules = await modRes.json();
            if (Array.isArray(modules)) {
              for (const mod of modules) {
                if (!mod.items) continue;
                const isHwFolder = homeworkFolderPattern.test(mod.name || '');

                for (const item of mod.items) {
                  const parsed = parseAndCleanTitle(item.title);
                  let dueDate = item.content_details?.due_at ? new Date(item.content_details.due_at) : parsed.dueDate;
                  const mentionsGradescope = /grade\w*scope/i.test(item.title) || /grade\w*scope/i.test(mod.name || '');

                  let downloadUrl = null;
                  let contentId = null;
                  if (item.type === 'File' && item.content_id) {
                    contentId = item.content_id;
                    downloadUrl = `${origin}/courses/${course.id}/files/${item.content_id}/download?download_frd=1`;
                  } else if (/\.pdf$/i.test(item.title) && item.url) {
                    downloadUrl = item.url;
                  }

                  if (dueDate || isHwFolder) {
                    unifiedCourseMap[courseKey].tasks.push({
                      id: generateTaskId(courseKey, item.title),
                                                           canvasAssignmentId: item.content_details?.assignment_id || null,
                                                           canvasCourseId: course.id,
                                                           contentId: contentId,
                                                           title: parsed.title,
                                                           url: item.html_url || `${origin}/courses/${course.id}/modules/items/${item.id}`,
                                                           dueDate: dueDate,
                                                           moduleName: mod.name,
                                                           points: item.content_details?.points_possible ?? null,
                                                           isUndatedHw: !dueDate && isHwFolder,
                                                           gradescope: mentionsGradescope,
                                                           isGradescope: false,
                                                           isSubmitted: false,
                                                           courseKey: courseKey,
                                                           courseName: rawCourseName,
                                                           downloadUrl: downloadUrl
                    });
                  }
                }
              }
            }
          }
        } catch (e) {
          console.warn(`Modules scan error for ${rawCourseName}`, e);
        }

        // 2. Full Assignments Tab Scan with Submission Status
        try {
          const assignRes = await fetch(`${origin}/api/v1/courses/${course.id}/assignments?include[]=submission&per_page=100&order_by=due_at`, {
            credentials: 'include',
            headers: headers
          });

          if (assignRes.ok) {
            const assignments = await assignRes.json();
            if (Array.isArray(assignments)) {
              for (const a of assignments) {
                const parsed = parseAndCleanTitle(a.name);
                const dueDate = a.due_at ? new Date(a.due_at) : parsed.dueDate;
                const isHwLike = homeworkFolderPattern.test(a.name) || (a.submission_types && !a.submission_types.includes('none'));
                const isSubmitted = !!(a.submission && (a.submission.submitted_at || a.submission.workflow_state === 'submitted'));

                if (dueDate || isHwLike) {
                  unifiedCourseMap[courseKey].tasks.push({
                    id: generateTaskId(courseKey, a.name),
                                                         canvasAssignmentId: a.id || null,
                                                         canvasCourseId: course.id,
                                                         contentId: null,
                                                         title: parsed.title,
                                                         url: a.html_url,
                                                         dueDate: dueDate,
                                                         points: a.points_possible ?? null,
                                                         isUndatedHw: !dueDate,
                                                         gradescope: /grade\w*scope/i.test(a.description || '') || /grade\w*scope/i.test(a.name),
                                                         isGradescope: false,
                                                         isSubmitted: isSubmitted,
                                                         courseKey: courseKey,
                                                         courseName: rawCourseName,
                                                         downloadUrl: null
                  });
                }
              }
            }
          }
        } catch (e) {
          console.warn(`Assignments scan error for ${rawCourseName}`, e);
        }
      }

      if (showLoadingUI) {
        showReloadProgress('Synchronizing Gradescope...', 80);
      }

      const { tasksByCourse: gsCourseMap, gradesByCourse: gsGradesByCourse } = await gradescopePromise;
      Object.keys(gsCourseMap).forEach(gsKey => {
        if (!unifiedCourseMap[gsKey]) {
          unifiedCourseMap[gsKey] = { name: gsCourseMap[gsKey].name, canvasCourseId: null, tasks: [] };
        }
        unifiedCourseMap[gsKey].tasks.push(...gsCourseMap[gsKey].tasks);
      });

      if (showLoadingUI) {
        showReloadProgress('Calculating course grades & GPAs...', 90);
      }

      // 4. Grades Consolidation
      const canvasGrades = await fetchCanvasGrades(headers, courseNameById);
      const gsGradesFlat = [];
      Object.values(gsGradesByCourse).forEach(entry => gsGradesFlat.push(...entry.grades));

      const allGrades = [...canvasGrades, ...gsGradesFlat].sort((a, b) => {
        if (a.gradedAt && b.gradedAt) return b.gradedAt - a.gradedAt;
        if (a.gradedAt) return -1;
        if (b.gradedAt) return 1;
        return a.title.localeCompare(b.title);
      });

      cachedGrades = allGrades;
      saveLocalGradesCache(allGrades);

      const derivedPcts = { ...officialCoursePercentages };
      const gradeTotalsByCourse = {};
      allGrades.forEach(g => {
        if (g.score !== null && g.pointsPossible && g.pointsPossible > 0) {
          if (!gradeTotalsByCourse[g.courseKey]) {
            gradeTotalsByCourse[g.courseKey] = { earned: 0, possible: 0 };
          }
          gradeTotalsByCourse[g.courseKey].earned += g.score;
          gradeTotalsByCourse[g.courseKey].possible += g.pointsPossible;
        }
      });

      Object.entries(gradeTotalsByCourse).forEach(([cKey, data]) => {
        if (!derivedPcts[cKey] && data.possible > 0) {
          derivedPcts[cKey] = Math.round((data.earned / data.possible) * 1000) / 10;
        }
      });

      cachedCoursePercentages = derivedPcts;
      saveCoursePercentagesCache(derivedPcts);

      // 5. Intelligent Deduplication
      deduplicateCourseMap(unifiedCourseMap, allGrades);

      if (showLoadingUI) {
        showReloadProgress('Ready!', 100);
      }

      cachedCourseMap = unifiedCourseMap;
      applyCustomDueDates();
      saveLocalCache(unifiedCourseMap);
      renderFilterPills();
      updateHiddenMenuButton();
      updateProgressBar();
      renderWorkloadStrip();
      renderCurrentView();
      purgeDefaultCanvasElements();

      setTimeout(hideReloadProgress, 400);
    } catch (fatalErr) {
      console.error('Task Scanner Error:', fatalErr);
      hideReloadProgress();
      if (!cachedCourseMap || Object.keys(cachedCourseMap).length === 0) {
        listContainer.innerHTML = `<div class="mod-empty-msg" style="color:#f87171; border-color: rgba(248, 113, 113, 0.4);">Error scanning courses.</div>`;
      }
    }
  }

  function renderFilterPills() {
    const pillsContainer = document.getElementById('course-pills-container');
    pillsContainer.innerHTML = '';

    const hiddenCourses = getHiddenCourses();
    const allKeys = Object.keys(cachedCourseMap);
    const visibleKeys = allKeys.filter(k => !hiddenCourses.includes(k));

    if (allKeys.length === 0) return;

    const allPill = document.createElement('div');
    allPill.className = `filter-pill ${activeCourseFilter === 'ALL' ? 'active' : ''}`;
    allPill.innerHTML = `<span>All</span>`;
    allPill.addEventListener('click', () => {
      activeCourseFilter = 'ALL';
      renderFilterPills();
      renderCurrentView();
    });
    pillsContainer.appendChild(allPill);

    visibleKeys.forEach(k => {
      const pill = document.createElement('div');
      pill.className = `filter-pill ${activeCourseFilter === k ? 'active' : ''}`;
      pill.innerHTML = `
      <span class="pill-label">${escapeHTML(k)}</span>
      <span class="pill-remove" title="Hide this class">×</span>
      `;

      pill.querySelector('.pill-label').addEventListener('click', (e) => {
        e.stopPropagation();
        activeCourseFilter = k;
        renderFilterPills();
        renderCurrentView();
      });

      pill.querySelector('.pill-remove').addEventListener('click', (e) => {
        e.stopPropagation();
        hideCourse(k);
      });

      pillsContainer.appendChild(pill);
    });
  }

  function createTaskCard(task, now, completedMap) {
    const isDone = !!completedMap[task.id];
    const card = document.createElement('div');

    const hasRealDueDate = !!task.dueDate;
    const dueDate = task.dueDate || task.customDueDate || null;
    const isCustomDate = !hasRealDueDate && !!task.customDueDate;

    let urgencyClass = '';
    let dueLabel = '';
    let statusBadgeHtml = '';
    let isCritical = false;

    const editBtnHtml = !hasRealDueDate
    ? `<button type="button" class="edit-date-btn" title="${isCustomDate ? 'Edit custom due date' : 'Set due date'}">✏️</button>`
    : '';

    if (dueDate) {
      const diffMs = dueDate.getTime() - now.getTime();
      const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
      const diffMins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));

      const dateStr = dueDate.toLocaleDateString([], {
        weekday: 'short',
        month: 'short',
        day: 'numeric'
      });

      const isTomorrow = (() => {
        const d = new Date(now);
        d.setDate(d.getDate() + 1);
        return dueDate.toDateString() === d.toDateString();
      })();

      const isToday = dueDate.toDateString() === now.toDateString();

      if (diffMs < 0) {
        urgencyClass = 'due-overdue';
        const hoursAgo = Math.abs(diffHours);
        const lateStr = hoursAgo < 24 ? `${hoursAgo}h late` : `${Math.floor(hoursAgo / 24)}d late`;
        statusBadgeHtml = `<span class="badge-tag overdue">${lateStr}</span>`;
        dueLabel = `Due ${dateStr}`;
      } else if (diffMs <= 24 * 60 * 60 * 1000) {
        urgencyClass = 'due-today';
        if (diffHours < 2) isCritical = true;

        let countdownStr = '';
        if (diffHours >= 1) {
          countdownStr = `${diffHours}h left`;
        } else {
          countdownStr = `${diffMins}m left`;
        }
        statusBadgeHtml = `<span class="badge-tag countdown-urgent"><span class="pulsing-dot"></span>${countdownStr}</span>`;
        dueLabel = isToday ? `Today (${dateStr})` : `Tomorrow (${dateStr})`;
      } else if (isTomorrow) {
        urgencyClass = 'due-tomorrow';
        statusBadgeHtml = `<span class="badge-tag tomorrow">Tomorrow</span>`;
        dueLabel = `Due ${dateStr}`;
      } else {
        dueLabel = `Due ${dateStr}`;
      }

      if (isCustomDate) {
        statusBadgeHtml += ` <span class="date-badge-wrap">${editBtnHtml}<span class="badge-tag custom-date-chip">✏️ Custom</span></span>`;
      }
    } else {
      urgencyClass = 'undated';
      dueLabel = '';
      statusBadgeHtml = `<span class="date-badge-wrap">${editBtnHtml}<span class="badge-tag undated-chip">⚠ NO DUE DATE</span></span>`;
    }

    if (task.isSubmitted) {
      statusBadgeHtml += ` <span class="badge-tag submitted-badge" title="Draft or file already submitted, awaiting evaluation">✓ Submitted</span>`;
    }

    // Top Right Points Chip
    let pointsHtml = '';
    if (task.points !== null) {
      pointsHtml = `<span class="badge-tag points-chip top-points-tag">${task.points} pts</span>`;
    }

    // Bottom Right Metadata: GS Tag + Dual PDF Viewer / Downloader buttons
    let rightBottomMeta = '';
    if (task.isGradescope) {
      rightBottomMeta += `<span class="badge-tag gs-source">GS</span>`;
    }
    if (task.downloadUrl) {
      rightBottomMeta += `
      <div class="doc-actions-wrap">
      <button type="button" class="doc-view-pill" data-doc-url="${escapeHTML(task.downloadUrl)}" data-doc-title="${escapeHTML(task.title)}" data-course-id="${task.canvasCourseId || ''}" data-file-id="${task.contentId || ''}" title="Preview Document">👁</button>
      <a href="${task.downloadUrl}" class="download-pill" download target="_blank" title="Download Document">PDF ⤓</a>
      </div>
      `;
    }

    // Assign Canvas Native Color
    const coursePalette = getCourseColors(task.courseKey, task.canvasCourseId);
    card.style.setProperty('--task-course-accent', coursePalette.accent);
    card.style.setProperty('--task-course-glow', coursePalette.glow);
    card.style.setProperty('--task-course-soft', coursePalette.soft);

    card.className = `mod-task-card ${urgencyClass} ${isCritical ? 'critical-pulse' : ''} ${task.isGradescope ? 'gradescope-item' : ''} ${isDone ? 'is-completed' : ''}`;

    card.innerHTML = `
    <input type="checkbox" class="task-checkbox" ${isDone ? 'checked' : ''} title="Mark as done">
    <div class="task-body">
    <div class="task-title-row">
    <a class="mod-task-title" href="${task.url}" target="_blank">${escapeHTML(task.title)}</a>
    ${pointsHtml}
    </div>
    <div class="task-meta-row">
    <div class="task-meta-left">
    <span class="course-tag-chip">${escapeHTML(task.courseKey)}</span>
    ${dueLabel ? `<span class="due-indicator">${dueLabel}</span>` : ''}
    ${statusBadgeHtml}
    </div>
    <div class="task-meta-right">
    ${rightBottomMeta}
    </div>
    </div>
    ${!hasRealDueDate ? `
      <div class="date-edit-row">
      <input type="date" class="date-edit-input" value="${isCustomDate ? localDateKey(dueDate) : ''}">
      <button type="button" class="date-edit-save">Save</button>
      ${isCustomDate ? '<button type="button" class="date-edit-clear">Clear</button>' : ''}
      </div>
      ` : ''}
      </div>
      `;

      // Hook PDF Preview Modal Trigger
      const viewBtn = card.querySelector('.doc-view-pill');
      if (viewBtn) {
        viewBtn.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          openPdfModal(
            viewBtn.getAttribute('data-doc-url'),
                       viewBtn.getAttribute('data-doc-title'),
                       viewBtn.getAttribute('data-course-id'),
                       viewBtn.getAttribute('data-file-id')
          );
        });
      }

      const checkbox = card.querySelector('.task-checkbox');
      checkbox.addEventListener('change', (e) => {
        const willBeDone = e.target.checked;

        setTaskCompleted(task.id, willBeDone);
        updateProgressBar();

        if (willBeDone) {
          const boxRect = checkbox.getBoundingClientRect();
          launchConfetti(boxRect.left + boxRect.width / 2, boxRect.top + boxRect.height / 2);

          const completedNow = getCompletedTasks();
          const hidden = getHiddenCourses();
          const { startOfWeek, endOfWeek } = getWeekBounds();
          let totalActiveWeek = 0;
          let doneActiveWeek = 0;

          Object.entries(cachedCourseMap).forEach(([k, c]) => {
            if (!hidden.includes(k)) {
              (c.tasks || []).forEach(item => {
                const ed = effectiveDueDate(item);
                if (!ed || ed < startOfWeek || ed > endOfWeek) return;

                totalActiveWeek++;
                if (completedNow[item.id]) doneActiveWeek++;
              });
            }
          });

          if (totalActiveWeek > 0 && doneActiveWeek >= totalActiveWeek) {
            setTimeout(() => {
              launchConfetti(window.innerWidth * 0.3, window.innerHeight * 0.4);
              launchConfetti(window.innerWidth * 0.7, window.innerHeight * 0.4);
            }, 250);
          }

          if (currentTab !== 'completed') {
            card.classList.add('dismissing');
            setTimeout(() => {
              renderWorkloadStrip();
              renderCurrentView();
            }, 240);
            return;
          }
        }

        renderWorkloadStrip();
        renderCurrentView();
      });

      if (!hasRealDueDate) {
        const editBtn = card.querySelector('.edit-date-btn');
        const editRow = card.querySelector('.date-edit-row');
        const dateInput = card.querySelector('.date-edit-input');
        const saveBtn = card.querySelector('.date-edit-save');
        const clearBtn = card.querySelector('.date-edit-clear');

        editBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          const willOpen = !editRow.classList.contains('is-visible');
          editRow.classList.toggle('is-visible', willOpen);
          if (willOpen) dateInput.focus();
        });

          saveBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (!dateInput.value) {
              dateInput.focus();
              return;
            }
            const picked = new Date(`${dateInput.value}T23:59:00`);
            if (isNaN(picked.getTime())) return;

            setCustomDueDate(task.id, picked.toISOString());
            applyCustomDueDates();
            updateProgressBar();
            renderWorkloadStrip();
            renderCurrentView();
          });

          if (clearBtn) {
            clearBtn.addEventListener('click', (e) => {
              e.stopPropagation();
              setCustomDueDate(task.id, null);
              applyCustomDueDates();
              updateProgressBar();
              renderWorkloadStrip();
              renderCurrentView();
            });
          }
      }

      return card;
  }

  function formatScoreNum(n) {
    if (n === null || n === undefined || isNaN(n)) return '—';
    return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/\.?0+$/, '');
  }

  function computeCoursePercentagesWithWhatIf(hiddenCourses) {
    const courseTotals = {};

    (cachedGrades || []).forEach(g => {
      if (hiddenCourses.includes(g.courseKey)) return;
      if (g.score !== null && g.pointsPossible && g.pointsPossible > 0) {
        if (!courseTotals[g.courseKey]) courseTotals[g.courseKey] = { earned: 0, possible: 0 };
        courseTotals[g.courseKey].earned += g.score;
        courseTotals[g.courseKey].possible += g.pointsPossible;
      }
    });

    Object.entries(whatIfScores).forEach(([taskId, sim]) => {
      if (hiddenCourses.includes(sim.courseKey)) return;
      if (sim.score !== null && sim.pointsPossible > 0) {
        if (!courseTotals[sim.courseKey]) courseTotals[sim.courseKey] = { earned: 0, possible: 0 };
        courseTotals[sim.courseKey].earned += sim.score;
        courseTotals[sim.courseKey].possible += sim.pointsPossible;
      }
    });

    const activeKeys = Object.keys(cachedCourseMap).filter(k => !hiddenCourses.includes(k));
    const result = {};

    activeKeys.forEach(cKey => {
      const totals = courseTotals[cKey];
      if (totals && totals.possible > 0) {
        result[cKey] = Math.round((totals.earned / totals.possible) * 1000) / 10;
      } else if (cachedCoursePercentages[cKey] !== undefined && cachedCoursePercentages[cKey] !== null) {
        result[cKey] = cachedCoursePercentages[cKey];
      } else {
        result[cKey] = null;
      }
    });

    return result;
  }

  function renderGradesView(listContainer, hiddenCourses) {
    listContainer.innerHTML = '';

    let grades = (cachedGrades || []).filter(g => !hiddenCourses.includes(g.courseKey));

    if (activeCourseFilter !== 'ALL') {
      grades = grades.filter(g => g.courseKey === activeCourseFilter);
    }
    if (searchQuery) {
      grades = grades.filter(g => g.title.toLowerCase().includes(searchQuery));
    }

    const coursePcts = computeCoursePercentagesWithWhatIf(hiddenCourses);
    const gpaPoints = [];
    const courseCardsData = [];

    Object.entries(coursePcts).forEach(([cKey, pct]) => {
      if (pct !== null && !isNaN(pct)) {
        const info = percentageToGpa(pct);
        gpaPoints.push(info.gpa);
        courseCardsData.push({ courseKey: cKey, pct: pct, letter: info.letter, hasGrade: true });
      } else {
        courseCardsData.push({ courseKey: cKey, pct: null, letter: '—', hasGrade: false });
      }
    });

    const averageGpa = gpaPoints.length > 0
    ? (gpaPoints.reduce((a, b) => a + b, 0) / gpaPoints.length).toFixed(2)
    : '—';

    // GPA Header
    const gpaCard = document.createElement('div');
    gpaCard.className = 'gpa-card';
    const hasWhatIfActive = Object.keys(whatIfScores).length > 0;
    gpaCard.innerHTML = `
    <div class="gpa-info-left">
    <span class="gpa-title">GPA ${hasWhatIfActive ? '<span style="color:var(--primary-accent);">(What-If Active)</span>' : ''}</span>
    </div>
    <div class="gpa-badge">${averageGpa}</div>
    `;
    listContainer.appendChild(gpaCard);

    // Course Summary Cards
    if (courseCardsData.length > 0) {
      const grid = document.createElement('div');
      grid.className = 'course-grades-grid';
      courseCardsData.forEach(item => {
        const cCard = document.createElement('div');
        cCard.className = 'course-grade-summary-card';
        if (item.hasGrade) {
          cCard.innerHTML = `
          <span class="cg-name">${escapeHTML(item.courseKey)}</span>
          <div class="cg-score-wrap">
          <span class="cg-percent">${item.pct.toFixed(1)}%</span>
          <span class="cg-letter">(${item.letter})</span>
          </div>
          `;
        } else {
          cCard.innerHTML = `
          <span class="cg-name">${escapeHTML(item.courseKey)}</span>
          <div class="cg-score-wrap">
          <span class="cg-percent no-grade">No grades yet</span>
          </div>
          `;
        }
        grid.appendChild(cCard);
      });
      listContainer.appendChild(grid);
    }

    // What-If Matrix
    const tasksByCourse = {};
    Object.entries(cachedCourseMap).forEach(([cKey, c]) => {
      if (hiddenCourses.includes(cKey)) return;
      if (activeCourseFilter !== 'ALL' && activeCourseFilter !== cKey) return;

      const validTasks = (c.tasks || []).filter(t => t.points && t.points > 0);
      if (validTasks.length > 0) {
        tasksByCourse[cKey] = validTasks;
      }
    });

    if (Object.keys(tasksByCourse).length > 0) {
      const matrixCard = document.createElement('div');
      matrixCard.className = 'whatif-matrix-card';

      const topBar = document.createElement('div');
      topBar.className = 'whatif-top-bar';
      topBar.innerHTML = `
      <span class="whatif-heading">⚡ What-If Grade Simulator</span>
      ${hasWhatIfActive ? '<button type="button" class="whatif-clear-all-btn" id="whatif-clear-all-btn">Clear Simulations</button>' : ''}
      `;
      matrixCard.appendChild(topBar);

      Object.entries(tasksByCourse).forEach(([cKey, taskList]) => {
        const groupEl = document.createElement('div');
        groupEl.className = 'whatif-course-group';

        const curPct = coursePcts[cKey];
        const pctLabel = curPct !== null ? `${curPct.toFixed(1)}% (${percentageToGpa(curPct).letter})` : 'No grades yet';

        const cHeader = document.createElement('div');
        cHeader.className = 'whatif-course-header';
        cHeader.innerHTML = `
        <span class="whatif-course-tag">${escapeHTML(cKey)}</span>
        <span class="whatif-projected-badge">Projected: ${pctLabel}</span>
        `;
        groupEl.appendChild(cHeader);

        const listEl = document.createElement('div');
        listEl.className = 'whatif-items-list';

        taskList.forEach(task => {
          const sim = whatIfScores[task.id];
          const hasSim = !!sim;

          const row = document.createElement('div');
          row.className = `whatif-row-card ${hasSim ? 'has-sim' : ''}`;
          row.innerHTML = `
          <div class="whatif-item-left">
          <span class="whatif-item-title" title="${escapeHTML(task.title)}">${escapeHTML(task.title)}</span>
          <span class="whatif-item-pts">${task.points} pts possible</span>
          </div>
          <div class="whatif-item-right">
          <input type="number" step="0.5" class="whatif-matrix-input" data-task-id="${escapeHTML(task.id)}" placeholder="—" value="${hasSim ? sim.score : ''}" />
          ${hasSim ? `<button type="button" class="whatif-row-reset" data-reset-id="${escapeHTML(task.id)}" title="Remove simulation">×</button>` : ''}
          </div>
          `;

          const inputEl = row.querySelector('.whatif-matrix-input');
          inputEl.addEventListener('input', (e) => {
            const val = parseFloat(e.target.value);
            if (!isNaN(val)) {
              whatIfScores[task.id] = {
                score: val,
                pointsPossible: task.points,
                courseKey: cKey
              };
            } else {
              delete whatIfScores[task.id];
            }
            saveWhatIfScores();
            renderGradesView(listContainer, hiddenCourses);
          });

          const rowResetBtn = row.querySelector('.whatif-row-reset');
          if (rowResetBtn) {
            rowResetBtn.addEventListener('click', () => {
              delete whatIfScores[task.id];
              saveWhatIfScores();
              renderGradesView(listContainer, hiddenCourses);
            });
          }

          listEl.appendChild(row);
        });

        groupEl.appendChild(listEl);
        matrixCard.appendChild(groupEl);
      });

      const clearAllBtn = matrixCard.querySelector('#whatif-clear-all-btn');
      if (clearAllBtn) {
        clearAllBtn.addEventListener('click', () => {
          whatIfScores = {};
          saveWhatIfScores();
          renderGradesView(listContainer, hiddenCourses);
        });
      }

      listContainer.appendChild(matrixCard);
    }

    // Feedback List
    if (grades.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'mod-empty-msg';
      empty.innerText = 'No recent feedback submissions yet.';
      listContainer.appendChild(empty);
      return;
    }

    const heading = document.createElement('div');
    heading.className = 'grades-heading';
    heading.innerText = 'Recent Feedback';
    listContainer.appendChild(heading);

    grades.forEach(g => listContainer.appendChild(createGradeCard(g)));
  }

  function createGradeCard(grade) {
    const card = document.createElement('div');
    card.className = 'grade-card';

    const hasPoints = grade.pointsPossible !== null && grade.pointsPossible !== undefined && !isNaN(grade.pointsPossible);
    const scoreLabel = hasPoints
    ? `${formatScoreNum(grade.score)} out of ${formatScoreNum(grade.pointsPossible)}`
    : `${formatScoreNum(grade.score)} pts`;

    const gradedLabel = grade.gradedAt
    ? grade.gradedAt.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
    : '';

    const titleEl = document.createElement(grade.url ? 'a' : 'div');
    titleEl.className = 'grade-title';
    titleEl.innerText = grade.title;
    if (grade.url) {
      titleEl.href = grade.url;
      titleEl.target = '_blank';
      titleEl.rel = 'noopener noreferrer';
    }

    const courseSpan = document.createElement('span');
    courseSpan.className = 'grade-course';
    courseSpan.innerText = grade.courseName;

    const meta = document.createElement('div');
    meta.className = 'grade-meta';
    meta.appendChild(courseSpan);

    if (grade.isGradescope) {
      const gsTag = document.createElement('span');
      gsTag.className = 'badge-tag gs-source';
      gsTag.innerText = 'Gradescope';
      meta.appendChild(gsTag);
    }

    if (gradedLabel) {
      const dateSpan = document.createElement('span');
      dateSpan.className = 'grade-date';
      dateSpan.innerText = gradedLabel;
      meta.appendChild(dateSpan);
    }

    const scoreDiv = document.createElement('div');
    scoreDiv.className = 'grade-score';
    scoreDiv.innerText = scoreLabel;

    const check = document.createElement('span');
    check.className = 'grade-check';
    check.innerText = '✓';

    const body = document.createElement('div');
    body.className = 'grade-body';
    body.appendChild(titleEl);
    body.appendChild(meta);
    body.appendChild(scoreDiv);

    card.appendChild(check);
    card.appendChild(body);

    return card;
  }

  function renderCurrentView() {
    const listContainer = document.getElementById('module-tasks-list');
    listContainer.innerHTML = '';

    const completedMap = getCompletedTasks();
    const hiddenCourses = getHiddenCourses();
    const savedAccordionState = getSavedAccordions();
    const now = new Date();

    let totalOverdueCount = 0;
    let renderedCount = 0;

    Object.entries(cachedCourseMap).forEach(([courseKey, c]) => {
      if (hiddenCourses.includes(courseKey)) return;
      (c.tasks || []).forEach(t => {
        const ed = effectiveDueDate(t);
        if (ed && ed < now && !completedMap[t.id]) totalOverdueCount++;
      });
    });

    const overdueBadge = document.getElementById('overdue-total-badge');
    if (overdueBadge) {
      overdueBadge.innerText = totalOverdueCount > 0 ? `(${totalOverdueCount})` : '';
    }

    if (currentTab === 'grades') {
      renderGradesView(listContainer, hiddenCourses);
      return;
    }

    let allFilteredTasks = [];

    Object.keys(cachedCourseMap).forEach(courseKey => {
      if (hiddenCourses.includes(courseKey)) return;
      if (activeCourseFilter !== 'ALL' && activeCourseFilter !== courseKey) return;
      const course = cachedCourseMap[courseKey];
      if (!course.tasks) return;

      const tasks = course.tasks.filter(t => {
        const isDone = !!completedMap[t.id];
        const ed = effectiveDueDate(t);
        const isOverdue = ed && ed < now;

        if (activeDayFilter) {
          if (!ed) return false;
          if (localDateKey(ed) !== activeDayFilter) return false;
        }

        if (searchQuery && !t.title.toLowerCase().includes(searchQuery)) return false;
        if (currentTab === 'completed') return isDone;
        if (isDone) return false;
        if (currentTab === 'overdue') return isOverdue;
        if (currentTab === 'upcoming') return !isOverdue;
        return true;
      });

      allFilteredTasks.push(...tasks);
    });

    if (isFlatView) {
      allFilteredTasks.sort((a, b) => {
        const edA = effectiveDueDate(a);
        const edB = effectiveDueDate(b);
        if (edA && edB) return edA - edB;
        if (edA) return -1;
        if (edB) return 1;
        return 0;
      });

      renderedCount = allFilteredTasks.length;
      allFilteredTasks.forEach(task => {
        listContainer.appendChild(createTaskCard(task, now, completedMap));
      });
    } else {
      Object.keys(cachedCourseMap).forEach(courseKey => {
        if (hiddenCourses.includes(courseKey)) return;
        if (activeCourseFilter !== 'ALL' && activeCourseFilter !== courseKey) return;

        const course = cachedCourseMap[courseKey];
        const visibleTasks = course.tasks.filter(t => {
          const isDone = !!completedMap[t.id];
          const ed = effectiveDueDate(t);
          const isOverdue = ed && ed < now;

          if (activeDayFilter) {
            if (!ed) return false;
            if (localDateKey(ed) !== activeDayFilter) return false;
          }

          if (searchQuery && !t.title.toLowerCase().includes(searchQuery)) return false;
          if (currentTab === 'completed') return isDone;
          if (isDone) return false;
          if (currentTab === 'overdue') return isOverdue;
          if (currentTab === 'upcoming') return !isOverdue;
          return true;
        });

        if (visibleTasks.length === 0) return;
        renderedCount += visibleTasks.length;

        visibleTasks.sort((a, b) => {
          const edA = effectiveDueDate(a);
          const edB = effectiveDueDate(b);
          if (edA && edB) return edA - edB;
          if (edA) return -1;
          if (edB) return 1;
          return 0;
        });

        const isOpen = savedAccordionState[courseKey] !== undefined ? savedAccordionState[courseKey] : true;
        const accordion = document.createElement('div');
        accordion.className = `course-accordion ${isOpen ? 'open' : ''}`;
        accordion.setAttribute('data-course-key', courseKey);

        const header = document.createElement('div');
        header.className = 'course-header';
        header.innerHTML = `
        <div class="course-title-group">
        <span class="course-arrow">▶</span>
        <span class="course-name" title="${escapeHTML(course.name)}">${escapeHTML(course.name)}</span>
        </div>
        <span class="course-badge ${currentTab === 'overdue' ? 'overdue-count' : ''}">${visibleTasks.length}</span>
        `;

        header.addEventListener('click', () => {
          const opened = accordion.classList.toggle('open');
          saveAccordionState(courseKey, opened);
        });

        const wrapper = document.createElement('div');
        wrapper.className = 'accordion-wrapper';

        const body = document.createElement('div');
        body.className = 'course-content';

        visibleTasks.forEach(task => {
          body.appendChild(createTaskCard(task, now, completedMap));
        });

        wrapper.appendChild(body);
        accordion.appendChild(header);
        accordion.appendChild(wrapper);
        listContainer.appendChild(accordion);
      });
    }

    if (renderedCount === 0) {
      if (activeDayFilter) {
        listContainer.innerHTML = `<div class="mod-empty-msg">No tasks scheduled for this day.<br><span style="color:var(--primary-accent);cursor:pointer;font-size:12px;font-weight:700;" id="clear-day-filter">Click to view all</span></div>`;
        const clearBtn = document.getElementById('clear-day-filter');
        if (clearBtn) {
          clearBtn.addEventListener('click', () => {
            activeDayFilter = null;
            renderWorkloadStrip();
            renderCurrentView();
          });
        }
      } else if (searchQuery) {
        listContainer.innerHTML = `<div class="mod-empty-msg">No assignments match "${escapeHTML(searchQuery)}"</div>`;
      } else if (currentTab === 'overdue') {
        listContainer.innerHTML = '<div class="mod-empty-msg">✨ No overdue assignments! You are all caught up.</div>';
      } else if (currentTab === 'completed') {
        listContainer.innerHTML = '<div class="mod-empty-msg">No completed assignments yet.</div>';
      } else {
        listContainer.innerHTML = '<div class="mod-empty-msg">🎉 All clear! No upcoming tasks due.</div>';
      }
    }
  }

  function escapeHTML(str) {
    return String(str).replace(/[&<>'"]/g,
                               tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag)
    );
  }
})();
