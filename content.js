(async function initUnifiedDashboard() {
  const origin = window.location.origin;
  const STORAGE_KEY_DONE = 'canvas_mod_tasks_completed_v2';
  const STORAGE_KEY_OPEN = 'canvas_mod_tasks_open_accordions_v2';
  const STORAGE_KEY_FLAT = 'canvas_mod_tasks_flat_view_v1';
  const STORAGE_KEY_CACHE = 'canvas_mod_tasks_cache_payload_v1';
  const STORAGE_KEY_CACHE_TIME = 'canvas_mod_tasks_cache_time_v1';
  const STORAGE_KEY_HIDDEN_COURSES = 'canvas_mod_tasks_hidden_courses_v1';
  const STORAGE_KEY_THEME = 'canvas_mod_tasks_theme_v1';
  const STORAGE_KEY_GRADES_CACHE = 'canvas_mod_tasks_grades_cache_v1';
  const STORAGE_KEY_GRADES_CACHE_TIME = 'canvas_mod_tasks_grades_cache_time_v1';

  const THEMES = ['cyan', 'synthwave', 'emerald', 'stealth'];
  let currentTheme = localStorage.getItem(STORAGE_KEY_THEME) || 'cyan';

  let currentTab = 'upcoming'; // 'upcoming' | 'overdue' | 'completed' | 'grades'
  let activeCourseFilter = 'ALL';
  let activeDayFilter = null; // null or YYYY-MM-DD
  let searchQuery = '';
  let isFlatView = localStorage.getItem(STORAGE_KEY_FLAT) !== 'false';
  let isHiddenMenuOpen = false;
  let cachedCourseMap = {};
  let cachedGrades = [];

  // --- AUDIO HAPTIC CLICK (Native browser AudioContext synthesizer) ---
  function playHapticClick() {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(800, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(300, ctx.currentTime + 0.04);

      gain.gain.setValueAtTime(0.25, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.04);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start();
      osc.stop(ctx.currentTime + 0.04);
    } catch (e) {}
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
      p.vy += 0.22; // gravity
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

  function extractCoreAssignmentToken(title) {
    if (!title) return '';
    let t = title.toLowerCase();
    const tokenMatch = t.match(/\b([a-z]{1,3}\s*\d{1,2})\b/);
    if (tokenMatch) return tokenMatch[1].replace(/\s+/g, '');
    return t.replace(/\.pdf|\.docx?|\.zip/g, '')
    .replace(/\(?\s*submission\s+window\s+in\s+grade\w*\s*\)?/gi, '')
    .replace(/assignment|homework|hw|problem\s*set|revised/gi, '')
    .replace(/[^a-z0-9]/g, '');
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

  // Attaches a `.customDueDate` (Date|null) to every task that has no real
  // Canvas/Gradescope due date but has a user-supplied one saved locally.
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

  const checkInterval = setInterval(() => {
    const rightSide = document.getElementById('right-side');
    if (rightSide && !document.getElementById('module-tasks-widget')) {
      clearInterval(checkInterval);
      document.body.classList.add('with-right-side');
      injectWidget(rightSide);
    }
  }, 500);

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

    <!-- Hidden Courses Popover -->
    <div class="hidden-courses-popover" id="hidden-courses-popover">
    <div class="hidden-popover-header">
    <span class="hidden-popover-title">Hidden Classes</span>
    <button class="hidden-popover-close" id="close-hidden-courses-btn" title="Close">✕</button>
    </div>
    <div class="hidden-pills-list" id="hidden-pills-container"></div>
    </div>

    <!-- 7-Day Workload Density Strip -->
    <div class="workload-strip" id="workload-strip-container"></div>

    <div class="progress-container">
    <div class="progress-meta">
    <span id="progress-label">0% completed</span>
    <span id="progress-count">0/0</span>
    </div>
    <div class="progress-bar-bg">
    <div class="progress-bar-fill" id="progress-bar-fill"></div>
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

    // Track Cursor for Dynamic Edge Glow
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

    // Theme Switcher Button
    document.getElementById('toggle-theme-btn').addEventListener('click', () => {
      const nextIdx = (THEMES.indexOf(currentTheme) + 1) % THEMES.length;
      currentTheme = THEMES[nextIdx];
      localStorage.setItem(STORAGE_KEY_THEME, currentTheme);
      widget.setAttribute('data-theme', currentTheme);
    });

    document.getElementById('refresh-mod-tasks').addEventListener('click', () => loadTasks(true));
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

    const cached = loadLocalCache();
    const lastCacheTime = parseInt(localStorage.getItem(STORAGE_KEY_CACHE_TIME) || '0', 10);
    const isCacheFresh = (Date.now() - lastCacheTime) < (15 * 60 * 1000);

    if (cached && Object.keys(cached).length > 0) {
      cachedCourseMap = cached;
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
      course.tasks.forEach(t => {
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

  function updateProgressBar() {
    const completedMap = getCompletedTasks();
    const hiddenCourses = getHiddenCourses();
    let total = 0;
    let completed = 0;

    Object.entries(cachedCourseMap).forEach(([courseKey, c]) => {
      if (hiddenCourses.includes(courseKey)) return;
      c.tasks.forEach(t => {
        total++;
        if (completedMap[t.id]) completed++;
      });
    });

    const percent = total > 0 ? Math.round((completed / total) * 100) : 0;
    const fillEl = document.getElementById('progress-bar-fill');
    const labelEl = document.getElementById('progress-label');
    const countEl = document.getElementById('progress-count');

    if (fillEl) fillEl.style.width = `${percent}%`;
    if (labelEl) labelEl.innerText = `${percent}% completed`;
    if (countEl) countEl.innerText = `${completed}/${total}`;
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
    return `${courseKey}_${extractCoreAssignmentToken(title) || title.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase()}`;
  }

  async function fetchGradescopeData() {
    const gsTasksByCourse = {};
    const gsGradesByCourse = {};

    try {
      let dashRes = await fetch('https://www.gradescope.com/', { credentials: 'include' });
      if (!dashRes.ok) {
        dashRes = await fetch('https://www.gradescope.com/courses', { credentials: 'include' });
      }
      if (!dashRes.ok) return gsTasksByCourse;

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

            // Gradescope shows a graded score directly in the status cell as "X.X / Y.Y"
            // once grading is done, instead of a "Submitted"/"No Submission" label.
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
                gradedAt: null, // Gradescope's course table doesn't expose a graded timestamp
                isGradescope: true,
                courseKey: courseKey,
                courseName: course.name
              });
              return; // graded rows aren't upcoming/overdue tasks
            }

            if (/submitted/i.test(statusText) && !/no submission/i.test(statusText)) {
              return;
            }

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
                       courseKey: courseKey,
                       courseName: course.name,
                       downloadUrl: null
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
      const res = await fetch(`${origin}/api/v1/users/self/graded_submissions?include[]=assignment&per_page=30`, {
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
        if (!rawCourseName) return; // not a current-semester course we tracked

        const courseKey = normalizeCourseCode(rawCourseName);

        grades.push({
          id: `canvas_${sub.id}`,
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
      listContainer.innerHTML = '<div class="mod-empty-msg">Scanning Canvas & Gradescope...</div>';
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
      const favRes = await fetch(`${origin}/api/v1/users/self/favorites/courses`, {
        credentials: 'include',
        headers: headers
      });
      if (favRes.ok) courses = await favRes.json();

      if (!courses || courses.length === 0) {
        const courseRes = await fetch(`${origin}/api/v1/courses?enrollment_state=active&per_page=25`, {
          credentials: 'include',
          headers: headers
        });
        if (courseRes.ok) courses = await courseRes.json();
      }

      const unifiedCourseMap = {};
      const courseNameById = {};
      const homeworkFolderPattern = /homework|assignment|hw\b|lab\b|problem\s*set/i;

      for (const course of courses) {
        if (!course.id || course.access_restricted_by_date) continue;
        const rawCourseName = course.course_code || course.name;
        if (!isCurrentSemesterCourse(rawCourseName)) continue;

        courseNameById[course.id] = rawCourseName;
        const courseKey = normalizeCourseCode(rawCourseName);
        if (!unifiedCourseMap[courseKey]) {
          unifiedCourseMap[courseKey] = { name: rawCourseName, tasks: [] };
        }

        // Modules Scan
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
                  if (item.type === 'File' && item.content_id) {
                    downloadUrl = `${origin}/courses/${course.id}/files/${item.content_id}/download?download_frd=1`;
                  } else if (/\.pdf$/i.test(item.title) && item.url) {
                    downloadUrl = item.url;
                  }

                  if (dueDate || isHwFolder) {
                    unifiedCourseMap[courseKey].tasks.push({
                      id: generateTaskId(courseKey, item.title),
                                                           title: parsed.title,
                                                           url: item.html_url || `${origin}/courses/${course.id}/modules/items/${item.id}`,
                                                           dueDate: dueDate,
                                                           moduleName: mod.name,
                                                           points: item.content_details?.points_possible ?? null,
                                                           isUndatedHw: !dueDate && isHwFolder,
                                                           gradescope: mentionsGradescope,
                                                           isGradescope: false,
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

        // Assignments Scan
        try {
          const assignRes = await fetch(`${origin}/api/v1/courses/${course.id}/assignments?bucket=upcoming&per_page=20`, {
            credentials: 'include',
            headers: headers
          });

          if (assignRes.ok) {
            const assignments = await assignRes.json();
            if (Array.isArray(assignments)) {
              for (const a of assignments) {
                if (a.due_at) {
                  unifiedCourseMap[courseKey].tasks.push({
                    id: generateTaskId(courseKey, a.name),
                                                         title: a.name,
                                                         url: a.html_url,
                                                         dueDate: new Date(a.due_at),
                                                         points: a.points_possible ?? null,
                                                         isUndatedHw: false,
                                                         gradescope: /grade\w*scope/i.test(a.description || ''),
                                                         isGradescope: false,
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

      const { tasksByCourse: gsCourseMap, gradesByCourse: gsGradesByCourse } = await gradescopePromise;
      Object.keys(gsCourseMap).forEach(gsKey => {
        if (!unifiedCourseMap[gsKey]) {
          unifiedCourseMap[gsKey] = { name: gsCourseMap[gsKey].name, tasks: [] };
        }
        unifiedCourseMap[gsKey].tasks.push(...gsCourseMap[gsKey].tasks);
      });

      // Grades: combine Canvas graded submissions with Gradescope-scraped scores
      const canvasGrades = await fetchCanvasGrades(headers, courseNameById);
      const gsGradesFlat = [];
      Object.values(gsGradesByCourse).forEach(entry => gsGradesFlat.push(...entry.grades));

      const allGrades = [...canvasGrades, ...gsGradesFlat].sort((a, b) => {
        if (a.gradedAt && b.gradedAt) return b.gradedAt - a.gradedAt;
        if (a.gradedAt) return -1; // known dates first
        if (b.gradedAt) return 1;
        return a.title.localeCompare(b.title);
      });

      cachedGrades = allGrades;
      saveLocalGradesCache(allGrades);

      // Deduplication & Attribute Inheritance
      Object.keys(unifiedCourseMap).forEach(key => {
        const course = unifiedCourseMap[key];
        const uniqueTasks = [];
        const gsTasks = course.tasks.filter(t => t.isGradescope);
        const canvasTasks = course.tasks.filter(t => !t.isGradescope);

        uniqueTasks.push(...gsTasks);

        canvasTasks.forEach(cTask => {
          const cToken = extractCoreAssignmentToken(cTask.title);
          const cDateKey = cTask.dueDate ? localDateKey(cTask.dueDate) : null;

          const duplicateGsTask = gsTasks.find(gTask => {
            const gToken = extractCoreAssignmentToken(gTask.title);
            const gDateKey = gTask.dueDate ? localDateKey(gTask.dueDate) : null;

            if (cToken && gToken && (cToken === gToken || cToken.includes(gToken) || gToken.includes(cToken))) return true;
            if (cTask.gradescope && cDateKey && gDateKey && cDateKey === gDateKey) return true;
            if (cDateKey && gDateKey && cDateKey === gDateKey) return true;
            return false;
          });

          if (duplicateGsTask) {
            if (duplicateGsTask.points === null && cTask.points !== null) {
              duplicateGsTask.points = cTask.points;
            }
            if (!duplicateGsTask.downloadUrl && cTask.downloadUrl) {
              duplicateGsTask.downloadUrl = cTask.downloadUrl;
            }
          } else {
            uniqueTasks.push(cTask);
          }
        });

        course.tasks = uniqueTasks;
      });

      cachedCourseMap = unifiedCourseMap;
      applyCustomDueDates();
      saveLocalCache(unifiedCourseMap);
      renderFilterPills();
      updateHiddenMenuButton();
      updateProgressBar();
      renderWorkloadStrip();
      renderCurrentView();
    } catch (fatalErr) {
      console.error('Task Scanner Error:', fatalErr);
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

    // "All" pill
    const allPill = document.createElement('div');
    allPill.className = `filter-pill ${activeCourseFilter === 'ALL' ? 'active' : ''}`;
    allPill.innerHTML = `<span>All</span>`;
    allPill.addEventListener('click', () => {
      activeCourseFilter = 'ALL';
      renderFilterPills();
      renderCurrentView();
    });
    pillsContainer.appendChild(allPill);

    // Visible course pills
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
    let badgeHtml = '';
    let isCritical = false;

    // The pencil control to set/edit a personal custom due date only ever
    // appears layered on top of the badge for tasks with no real due date.
    const editBtnHtml = !hasRealDueDate
    ? `<button type="button" class="edit-date-btn" title="${isCustomDate ? 'Edit your custom due date' : 'Set a due date'}">✏️</button>`
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
        badgeHtml = `<span class="badge-tag overdue">${lateStr}</span>`;
        dueLabel = `Was due ${dateStr}`;
      } else if (diffMs <= 24 * 60 * 60 * 1000) {
        urgencyClass = 'due-today';
        if (diffHours < 2) isCritical = true;

        let countdownStr = '';
        if (diffHours >= 1) {
          countdownStr = `${diffHours}h ${diffMins}m left`;
        } else {
          const diffSecs = Math.floor((diffMs % (1000 * 60)) / 1000);
          countdownStr = `${diffMins}m ${diffSecs}s left`;
        }
        badgeHtml = `<span class="badge-tag countdown-urgent"><span class="pulsing-dot"></span>${countdownStr}</span>`;
        dueLabel = isToday ? `Due Today (${dateStr})` : `Due Tomorrow (${dateStr})`;
      } else if (isTomorrow) {
        urgencyClass = 'due-tomorrow';
        badgeHtml = `<span class="badge-tag tomorrow">Due Tomorrow</span>`;
        dueLabel = `Due ${dateStr}`;
      } else {
        dueLabel = `Due ${dateStr}`;
      }

      if (isCustomDate) {
        badgeHtml += ` <span class="date-badge-wrap">${editBtnHtml}<span class="badge-tag custom-date-chip" title="You set this due date manually">✏️ Custom</span></span>`;
      }
    } else {
      urgencyClass = 'undated';
      badgeHtml = `<span class="date-badge-wrap">${editBtnHtml}<span class="badge-tag undated-chip">⚠ NO DUE DATE</span></span>`;
    }

    if (task.points !== null) {
      badgeHtml += ` <span class="badge-tag points-chip">${task.points} pts</span>`;
    }

    if (task.isGradescope) {
      badgeHtml += ` <span class="badge-tag gs-source">Gradescope</span>`;
    }

    let downloadHtml = '';
    if (task.downloadUrl) {
      downloadHtml = `<a href="${task.downloadUrl}" class="download-pill" target="_blank" download title="Download attached PDF/File">PDF ⤓</a>`;
    }

    card.className = `mod-task-card ${urgencyClass} ${isCritical ? 'critical-pulse' : ''} ${task.isGradescope ? 'gradescope-item' : ''} ${isDone ? 'is-completed' : ''}`;

    card.innerHTML = `
    <input type="checkbox" class="task-checkbox" ${isDone ? 'checked' : ''} title="Mark as done">
    <div class="task-body">
    <a class="mod-task-title" href="${task.url}" target="_blank">${escapeHTML(task.title)}</a>
    <div class="task-meta-row">
    <span class="due-indicator">${isFlatView ? `<b>${escapeHTML(task.courseKey)}</b> ` : ''}${dueLabel}</span>
    <div class="task-tags-group">
    ${badgeHtml}
    ${downloadHtml}
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

      const checkbox = card.querySelector('.task-checkbox');
      checkbox.addEventListener('change', (e) => {
        const willBeDone = e.target.checked;
        playHapticClick();

        if (willBeDone) {
          const boxRect = checkbox.getBoundingClientRect();
          launchConfetti(boxRect.left + boxRect.width / 2, boxRect.top + boxRect.height / 2);

          if (currentTab !== 'completed') {
            card.classList.add('dismissing');
            setTimeout(() => {
              setTaskCompleted(task.id, true);
              updateProgressBar();
              renderWorkloadStrip();
              renderCurrentView();
            }, 240);
            return;
          }
        }

        setTaskCompleted(task.id, willBeDone);
        updateProgressBar();
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

  function renderGradesView(listContainer, hiddenCourses) {
    let grades = (cachedGrades || []).filter(g => !hiddenCourses.includes(g.courseKey));

    if (activeCourseFilter !== 'ALL') {
      grades = grades.filter(g => g.courseKey === activeCourseFilter);
    }
    if (searchQuery) {
      grades = grades.filter(g => g.title.toLowerCase().includes(searchQuery));
    }

    if (grades.length === 0) {
      listContainer.innerHTML = '<div class="mod-empty-msg">No recent grades yet.</div>';
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
      c.tasks.forEach(t => {
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

    // 1. DEFAULT: TIMELINE VIEW
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
    }
    // 2. COURSE ACCORDION VIEW
    else {
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
