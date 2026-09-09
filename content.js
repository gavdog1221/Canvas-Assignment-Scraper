(async function initUnifiedDashboard() {
  const origin = window.location.origin;
  const STORAGE_KEY_DONE = 'canvas_mod_tasks_completed_v2';
  const STORAGE_KEY_OPEN = 'canvas_mod_tasks_open_accordions_v2';
  const STORAGE_KEY_FLAT = 'canvas_mod_tasks_flat_view_v1';
  const STORAGE_KEY_CACHE = 'canvas_mod_tasks_cache_payload_v1';
  const STORAGE_KEY_CACHE_TIME = 'canvas_mod_tasks_cache_time_v1';
  const STORAGE_KEY_HIDDEN_COURSES = 'canvas_mod_tasks_hidden_courses_v1';

  let currentTab = 'upcoming'; // 'upcoming' | 'overdue' | 'completed'
  let activeCourseFilter = 'ALL';
  let activeDayFilter = null; // null or YYYY-MM-DD
  let searchQuery = '';
  let isFlatView = localStorage.getItem(STORAGE_KEY_FLAT) !== 'false';
  let isHiddenMenuOpen = false;
  let cachedCourseMap = {};

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
    widget.innerHTML = `
    <div class="header">
    <div class="title-row">
    <span class="title">Tasks Hub</span>
    </div>
    <div class="widget-controls">
    <button class="icon-btn eye-btn" id="toggle-hidden-courses-btn" title="View Hidden Classes" style="display: none;">👁<span class="eye-badge"></span></button>
    <button class="icon-btn" id="toggle-view-mode" title="Switch Grouped / Chronological">${isFlatView ? 'Group' : 'Timeline'}</button>
    <button class="icon-btn" id="toggle-all-accordions" title="Collapse/Expand All">Toggle</button>
    <button class="icon-btn" id="refresh-mod-tasks" title="Reload Everything">↻</button>
    </div>
    </div>

    <!-- Hidden Courses Popover -->
    <div class="hidden-courses-popover" id="hidden-courses-popover" style="display: none;">
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
    </div>

    <div class="course-pills" id="course-pills-container"></div>

    <div id="module-tasks-list">
    <div class="mod-empty-msg">Scanning Canvas & Gradescope...</div>
    </div>
    `;

    container.prepend(widget);

    document.getElementById('refresh-mod-tasks').addEventListener('click', () => loadTasks(true));
    document.getElementById('toggle-all-accordions').addEventListener('click', toggleAllAccordions);
    updateToggleAllButtonState();

    const eyeBtn = document.getElementById('toggle-hidden-courses-btn');
    const closeBtn = document.getElementById('close-hidden-courses-btn');

    // Robust toggle: toggles visibility state on every click
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
    }, 60000);

    const cached = loadLocalCache();
    const lastCacheTime = parseInt(localStorage.getItem(STORAGE_KEY_CACHE_TIME) || '0', 10);
    const isCacheFresh = (Date.now() - lastCacheTime) < (15 * 60 * 1000);

    if (cached && Object.keys(cached).length > 0) {
      cachedCourseMap = cached;
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
    const popover = document.getElementById('hidden-courses-popover');
    const container = document.getElementById('hidden-pills-container');
    const hidden = getHiddenCourses();

    if (!eyeBtn || !popover || !container) return;

    if (hidden.length > 0) {
      eyeBtn.style.display = 'inline-flex';

      if (isHiddenMenuOpen) {
        eyeBtn.classList.add('active');
        popover.style.display = 'flex';
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
        popover.style.display = 'none';
      }
    } else {
      eyeBtn.style.display = 'none';
      popover.style.display = 'none';
      isHiddenMenuOpen = false;
    }
  }

  // --- RENDER 7-DAY WORKLOAD STRIP ---
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
        if (!t.dueDate || completedMap[t.id]) return;
        const taskKey = localDateKey(t.dueDate);
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

  async function fetchGradescopeTasks() {
    const gsTasksByCourse = {};

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

            const statusEl = row.querySelector('.submissionStatus--text, .submissionStatus');
            const statusText = statusEl ? statusEl.innerText.trim() : '';
            if (/submitted/i.test(statusText) && !/no submission/i.test(statusText)) {
              return;
            }

            let url = course.url;
            if (btnEl && btnEl.getAttribute('data-post-url')) {
              const postUrl = btnEl.getAttribute('data-post-url');
              url = `https://www.gradescope.com${postUrl.replace(/\/submissions.*$/, '')}`;
            } else if (linkEl && linkEl.getAttribute('href')) {
              url = `https://www.gradescope.com${linkEl.getAttribute('href')}`;
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

            const courseKey = normalizeCourseCode(course.name);

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
            const courseKey = normalizeCourseCode(course.name);
            gsTasksByCourse[courseKey] = {
              name: course.name,
              tasks: tasks
            };
          }
        } catch (err) {
          console.warn(`[Gradescope] Error on ${course.name}:`, err);
        }
      }));
    } catch (e) {
      console.warn('[Gradescope] Error:', e);
    }

    return gsTasksByCourse;
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
      const gradescopePromise = fetchGradescopeTasks();

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
      const homeworkFolderPattern = /homework|assignment|hw\b|lab\b|problem\s*set/i;

      for (const course of courses) {
        if (!course.id || course.access_restricted_by_date) continue;
        const rawCourseName = course.course_code || course.name;
        if (!isCurrentSemesterCourse(rawCourseName)) continue;

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

      const gsCourseMap = await gradescopePromise;
      Object.keys(gsCourseMap).forEach(gsKey => {
        if (!unifiedCourseMap[gsKey]) {
          unifiedCourseMap[gsKey] = { name: gsCourseMap[gsKey].name, tasks: [] };
        }
        unifiedCourseMap[gsKey].tasks.push(...gsCourseMap[gsKey].tasks);
      });

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
      saveLocalCache(unifiedCourseMap);
      renderFilterPills();
      updateHiddenMenuButton();
      updateProgressBar();
      renderWorkloadStrip();
      renderCurrentView();
    } catch (fatalErr) {
      console.error('Task Scanner Error:', fatalErr);
      if (!cachedCourseMap || Object.keys(cachedCourseMap).length === 0) {
        listContainer.innerHTML = `<div class="mod-empty-msg" style="color:#ff7b72; border-color: rgba(248, 81, 73, 0.4);">Error scanning courses.</div>`;
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

    let urgencyClass = '';
    let dueLabel = '';
    let badgeHtml = '';

    if (task.dueDate) {
      const diffMs = task.dueDate.getTime() - now.getTime();
      const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
      const diffMins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));

      const dateStr = task.dueDate.toLocaleDateString([], {
        weekday: 'short',
        month: 'short',
        day: 'numeric'
      });

      const isTomorrow = (() => {
        const d = new Date(now);
        d.setDate(d.getDate() + 1);
        return task.dueDate.toDateString() === d.toDateString();
      })();

      const isToday = task.dueDate.toDateString() === now.toDateString();

      if (diffMs < 0) {
        urgencyClass = 'due-overdue';
        const hoursAgo = Math.abs(diffHours);
        const lateStr = hoursAgo < 24 ? `${hoursAgo}h late` : `${Math.floor(hoursAgo / 24)}d late`;
        badgeHtml = `<span class="badge-tag overdue">${lateStr}</span>`;
        dueLabel = `Was due ${dateStr}`;
      } else if (diffHours < 12) {
        urgencyClass = 'due-today';
        badgeHtml = `<span class="badge-tag today"><span class="pulsing-dot"></span>${diffHours}h ${diffMins}m left</span>`;
        dueLabel = `Due Today`;
      } else if (isToday) {
        urgencyClass = 'due-today';
        badgeHtml = `<span class="badge-tag today">Due Today</span>`;
        dueLabel = `Due ${dateStr}`;
      } else if (isTomorrow) {
        urgencyClass = 'due-tomorrow';
        badgeHtml = `<span class="badge-tag tomorrow">Due Tomorrow</span>`;
        dueLabel = `Due ${dateStr}`;
      } else {
        dueLabel = `Due ${dateStr}`;
      }
    } else {
      urgencyClass = 'undated';
      dueLabel = `Undated [${escapeHTML(task.moduleName || 'HW')}]`;
    }

    if (task.points !== null) {
      badgeHtml += ` <span class="badge-tag points-chip">${task.points} pts</span>`;
    }

    let downloadHtml = '';
    if (task.downloadUrl) {
      downloadHtml = `<a href="${task.downloadUrl}" class="download-pill" target="_blank" download title="Download attached PDF/File">PDF ⤓</a>`;
    }

    if (task.isGradescope) {
      badgeHtml += ` <span class="badge-tag gs-source">Gradescope</span>`;
    }

    card.className = `mod-task-card ${urgencyClass} ${task.isGradescope ? 'gradescope-item' : ''} ${isDone ? 'is-completed' : ''}`;

    card.innerHTML = `
    <input type="checkbox" class="task-checkbox" ${isDone ? 'checked' : ''} title="Mark as done">
    <div class="task-body">
    <a class="mod-task-title" href="${task.url}" target="_blank">${escapeHTML(task.title)}</a>
    <div class="task-meta-row">
    <span class="due-indicator">${isFlatView ? `<b>${escapeHTML(task.courseKey)}</b> ` : ''}${dueLabel}</span>
    <div class="task-tags-group">
    ${downloadHtml}
    ${badgeHtml}
    </div>
    </div>
    </div>
    `;

    const checkbox = card.querySelector('.task-checkbox');
    checkbox.addEventListener('change', (e) => {
      setTaskCompleted(task.id, e.target.checked);
      updateProgressBar();
      renderWorkloadStrip();
      renderCurrentView();
    });

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
        if (t.dueDate && t.dueDate < now && !completedMap[t.id]) totalOverdueCount++;
      });
    });

    const overdueBadge = document.getElementById('overdue-total-badge');
    if (overdueBadge) {
      overdueBadge.innerText = totalOverdueCount > 0 ? `(${totalOverdueCount})` : '';
    }

    let allFilteredTasks = [];

    Object.keys(cachedCourseMap).forEach(courseKey => {
      if (hiddenCourses.includes(courseKey)) return;
      if (activeCourseFilter !== 'ALL' && activeCourseFilter !== courseKey) return;
      const course = cachedCourseMap[courseKey];
      if (!course.tasks) return;

      const tasks = course.tasks.filter(t => {
        const isDone = !!completedMap[t.id];
        const isOverdue = t.dueDate && t.dueDate < now;

        if (activeDayFilter) {
          if (!t.dueDate) return false;
          if (localDateKey(t.dueDate) !== activeDayFilter) return false;
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
        if (a.dueDate && b.dueDate) return a.dueDate - b.dueDate;
        if (a.dueDate) return -1;
        if (b.dueDate) return 1;
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
          const isOverdue = t.dueDate && t.dueDate < now;

          if (activeDayFilter) {
            if (!t.dueDate) return false;
            if (localDateKey(t.dueDate) !== activeDayFilter) return false;
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
          if (a.dueDate && b.dueDate) return a.dueDate - b.dueDate;
          if (a.dueDate) return -1;
          if (b.dueDate) return 1;
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

        const body = document.createElement('div');
        body.className = 'course-content';

        visibleTasks.forEach(task => {
          body.appendChild(createTaskCard(task, now, completedMap));
        });

        accordion.appendChild(header);
        accordion.appendChild(body);
        listContainer.appendChild(accordion);
      });
    }

    if (renderedCount === 0) {
      if (activeDayFilter) {
        listContainer.innerHTML = `<div class="mod-empty-msg">No tasks scheduled for this day.<br><span style="color:#38bdf8;cursor:pointer;font-size:11px;" id="clear-day-filter">Click to view all</span></div>`;
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
