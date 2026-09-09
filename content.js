(async function initModuleTasks() {
    const origin = window.location.origin;
    const STORAGE_KEY_DONE = 'canvas_mod_tasks_completed_v1';
    const STORAGE_KEY_OPEN = 'canvas_mod_tasks_open_accordions_v1';

    let showCompleted = false;

    function isCurrentSemesterCourse(name) {
        if (!name) return false;
        const str = name.toLowerCase();

        if (str.includes('spring') || str.includes('sp26') || str.includes('sp25') || str.includes('2025') || str.includes('2024')) {
            return false;
        }

        if (/fall\s*2026|fa\s*26|f26|fall\s*26/i.test(str)) {
            return true;
        }

        const hasAnySemester = /spring|summer|winter|fall/i.test(str);
        return !hasAnySemester;
    }

    function normalizeCourseCode(name) {
        if (!name) return 'GENERAL';
        const match = name.match(/([a-zA-Z]{2,5}\s*\d{3})/i);
        if (match) {
            return match[1].replace(/\s+/g, ' ').toUpperCase();
        }
        return name.replace(/\[gradescope\]/i, '').split('(')[0].trim().toUpperCase();
    }

    // Aggressive cleaner: catches typos like "gradesecope", removes extensions and filler phrases
    function extractCoreAssignmentToken(title) {
        if (!title) return '';
        let t = title.toLowerCase();

        // Catch common HW tags
        const tokenMatch = t.match(/\b([a-z]{1,3}\s*\d{1,2})\b/);
        if (tokenMatch) {
            return tokenMatch[1].replace(/\s+/g, ''); // e.g. "a1", "hw1", "lab1"
        }

        // Strip common filler phrases
        t = t.replace(/\.pdf|\.docx?|\.zip/g, '')
        .replace(/\(?\s*submission\s+window\s+in\s+grade\w*\s*\)?/gi, '')
        .replace(/assignment|homework|hw|problem\s*set|revised/gi, '')
        .replace(/[^a-z0-9]/g, '');

        return t;
    }

    function getCompletedTasks() {
        try {
            return JSON.parse(localStorage.getItem(STORAGE_KEY_DONE) || '{}');
        } catch { return {}; }
    }

    function setTaskCompleted(taskId, isDone) {
        const data = getCompletedTasks();
        if (isDone) {
            data[taskId] = Date.now();
        } else {
            delete data[taskId];
        }
        localStorage.setItem(STORAGE_KEY_DONE, JSON.stringify(data));
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

    const checkInterval = setInterval(() => {
        const rightSide = document.getElementById('right-side');
        if (rightSide && !document.getElementById('module-tasks-widget')) {
            clearInterval(checkInterval);
            injectWidget(rightSide);
        }
    }, 500);

    function injectWidget(container) {
        const widget = document.createElement('div');
        widget.id = 'module-tasks-widget';
        widget.innerHTML = `
        <div class="header">
        <div class="header-title-wrap">
        <span class="title">Fall 2026 Tasks</span>
        </div>
        <div class="widget-controls">
        <button class="icon-btn" id="toggle-completed-btn" title="Toggle Completed Items">Show Done</button>
        <button class="icon-btn" id="refresh-mod-tasks" title="Reload Assignments">Refresh</button>
        </div>
        </div>
        <div id="module-tasks-list">
        <div class="mod-empty-msg">Fetching Fall 2026 courses...</div>
        </div>
        `;

        container.prepend(widget);

        document.getElementById('refresh-mod-tasks').addEventListener('click', loadTasks);
        document.getElementById('toggle-completed-btn').addEventListener('click', (e) => {
            showCompleted = !showCompleted;
            e.target.classList.toggle('active', showCompleted);
            e.target.innerText = showCompleted ? 'Hide Done' : 'Show Done';
            loadTasks();
        });

        loadTasks();
    }

    function getCsrfToken() {
        const match = document.cookie.match(/(?:^|;\s*)_csrf_token=([^;]+)/);
        return match ? decodeURIComponent(match[1]) : '';
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

    // --- GRADESCOPE SCRAPER ---
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
                let name = titleEl.innerText.split('\n')[0].trim();
                name = name.replace(/\s+/g, ' ');

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
                        if (btnEl) {
                            title = btnEl.getAttribute('data-assignment-title') || btnEl.innerText.trim();
                        } else if (linkEl) {
                            title = linkEl.innerText.trim();
                        } else {
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
                            const cleanAssignPath = postUrl.replace(/\/submissions.*$/, '');
                            url = `https://www.gradescope.com${cleanAssignPath}`;
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
                                   courseName: course.name
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

    async function loadTasks() {
        const listContainer = document.getElementById('module-tasks-list');
        listContainer.innerHTML = '<div class="mod-empty-msg">Scanning Fall 2026 courses...</div>';

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

            // 1. Gather all Canvas tasks
            for (const course of courses) {
                if (!course.id || course.access_restricted_by_date) continue;
                const rawCourseName = course.course_code || course.name;

                if (!isCurrentSemesterCourse(rawCourseName)) {
                    continue;
                }

                const courseKey = normalizeCourseCode(rawCourseName);
                if (!unifiedCourseMap[courseKey]) {
                    unifiedCourseMap[courseKey] = {
                        name: rawCourseName,
                        tasks: []
                    };
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
                                                                               courseKey: courseKey
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
                                                                           courseKey: courseKey
                                    });
                                }
                            }
                        }
                    }
                } catch (e) {
                    console.warn(`Assignments scan error for ${rawCourseName}`, e);
                }
            }

            // 2. Gather Gradescope tasks
            const gsCourseMap = await gradescopePromise;
            Object.keys(gsCourseMap).forEach(gsKey => {
                if (!unifiedCourseMap[gsKey]) {
                    unifiedCourseMap[gsKey] = {
                        name: gsCourseMap[gsKey].name,
                        tasks: []
                    };
                }
                unifiedCourseMap[gsKey].tasks.push(...gsCourseMap[gsKey].tasks);
            });

            // 3. INTELLIGENT DEDUPLICATION (TOKEN & DATE MATCHING)
            Object.keys(unifiedCourseMap).forEach(key => {
                const course = unifiedCourseMap[key];
                const uniqueTasks = [];

                // Separate Gradescope tasks and Canvas tasks
                const gsTasks = course.tasks.filter(t => t.isGradescope);
                const canvasTasks = course.tasks.filter(t => !t.isGradescope);

                // Always keep all Gradescope tasks (they have the real submission button)
                uniqueTasks.push(...gsTasks);

                // For each Canvas task, check if it's already covered by a Gradescope task
                canvasTasks.forEach(cTask => {
                    const cToken = extractCoreAssignmentToken(cTask.title);
                    const cDateKey = cTask.dueDate ? cTask.dueDate.toISOString().split('T')[0] : null;

                    const isDuplicate = gsTasks.some(gTask => {
                        const gToken = extractCoreAssignmentToken(gTask.title);
                        const gDateKey = gTask.dueDate ? gTask.dueDate.toISOString().split('T')[0] : null;

                        // Duplicate Match Condition 1: Direct token match (e.g. both refer to "a1")
                        if (cToken && gToken && (cToken === gToken || cToken.includes(gToken) || gToken.includes(cToken))) {
                            return true;
                        }

                        // Duplicate Match Condition 2: Both mention Gradescope AND have the same calendar due date
                        if (cTask.gradescope && cDateKey && gDateKey && cDateKey === gDateKey) {
                            return true;
                        }

                        // Duplicate Match Condition 3: Exact same date in the same class
                        if (cDateKey && gDateKey && cDateKey === gDateKey) {
                            return true;
                        }

                        return false;
                    });

                    if (!isDuplicate) {
                        uniqueTasks.push(cTask);
                    }
                });

                course.tasks = uniqueTasks;
            });

            renderAccordions(unifiedCourseMap);
        } catch (fatalErr) {
            console.error('Task Scanner Error:', fatalErr);
            listContainer.innerHTML = `<div class="mod-empty-msg" style="color:#ff7b72;">Error scanning courses.</div>`;
        }
    }

    function renderAccordions(courseMap) {
        const listContainer = document.getElementById('module-tasks-list');
        listContainer.innerHTML = '';

        const completedMap = getCompletedTasks();
        const savedAccordionState = getSavedAccordions();
        const courseKeys = Object.keys(courseMap);
        let totalDisplayedTasks = 0;

        const now = new Date();

        courseKeys.forEach(courseKey => {
            const course = courseMap[courseKey];
            if (!course.tasks || course.tasks.length === 0) return;

            let tasks = course.tasks.filter(task => {
                const isDone = !!completedMap[task.id];
                if (!showCompleted && isDone) return false;
                if (!task.dueDate) return true;
                return task.dueDate >= new Date(now.getFullYear(), now.getMonth(), now.getDate());
            });

            if (tasks.length === 0) return;
            totalDisplayedTasks += tasks.length;

            tasks.sort((a, b) => {
                if (a.dueDate && b.dueDate) return a.dueDate - b.dueDate;
                if (a.dueDate) return -1;
                if (b.dueDate) return 1;
                return 0;
            });

            const isOpen = savedAccordionState[courseKey] !== undefined ? savedAccordionState[courseKey] : true;

            const accordion = document.createElement('div');
            accordion.className = `course-accordion ${isOpen ? 'open' : ''}`;

            const header = document.createElement('div');
            header.className = 'course-header';
            header.innerHTML = `
            <div class="course-title-group">
            <span class="course-arrow">▶</span>
            <span class="course-name" title="${escapeHTML(course.name)}">${escapeHTML(course.name)}</span>
            </div>
            <span class="course-badge">${tasks.length}</span>
            `;

            header.addEventListener('click', () => {
                const opened = accordion.classList.toggle('open');
                saveAccordionState(courseKey, opened);
            });

            const body = document.createElement('div');
            body.className = 'course-content';

            tasks.forEach(task => {
                const isDone = !!completedMap[task.id];
                const card = document.createElement('div');

                let urgencyClass = '';
                let dueLabel = '';
                let badgeHtml = '';

                if (task.dueDate) {
                    const diffMs = task.dueDate.getTime() - now.getTime();
                    const diffHours = Math.round(diffMs / (1000 * 60 * 60));
                    const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

                    const dateStr = task.dueDate.toLocaleDateString([], {
                        weekday: 'short',
                        month: 'short',
                        day: 'numeric'
                    });

                    if (diffHours > 0 && diffHours <= 24) {
                        urgencyClass = 'due-critical';
                        badgeHtml = `<span class="badge-tag today">Due in ${diffHours}h</span>`;
                    } else if (diffDays === 1) {
                        urgencyClass = 'due-soon';
                        badgeHtml = `<span class="badge-tag tomorrow">Tomorrow</span>`;
                    }

                    dueLabel = `📅 Due ${dateStr} ${task.points !== null ? `| ${task.points} pts` : ''}`;
                } else {
                    urgencyClass = 'undated';
                    dueLabel = `⚠️ Undated [${escapeHTML(task.moduleName || 'HW')}]`;
                }

                if (task.isGradescope) {
                    badgeHtml += ` <span class="badge-tag gs-source">Gradescope</span>`;
                } else if (task.gradescope) {
                    badgeHtml += ` <a href="https://www.gradescope.com" target="_blank" class="badge-tag gradescope" title="Open Gradescope">Gradescope ↗</a>`;
                }

                card.className = `mod-task-card ${urgencyClass} ${task.isGradescope ? 'gradescope-item' : ''} ${isDone ? 'is-completed' : ''}`;

                card.innerHTML = `
                <input type="checkbox" class="task-checkbox" ${isDone ? 'checked' : ''} title="Mark as done">
                <div class="task-body">
                <a class="mod-task-title" href="${task.url}" target="_blank">${escapeHTML(task.title)}</a>
                <div class="task-meta-row">
                <span class="due-indicator">${dueLabel}</span>
                <div>${badgeHtml}</div>
                </div>
                </div>
                `;

                const checkbox = card.querySelector('.task-checkbox');
                checkbox.addEventListener('change', (e) => {
                    setTaskCompleted(task.id, e.target.checked);
                    if (!showCompleted && e.target.checked) {
                        card.remove();
                        const remaining = body.querySelectorAll('.mod-task-card').length;
                        header.querySelector('.course-badge').innerText = remaining;
                        if (remaining === 0) accordion.remove();
                    } else {
                        card.classList.toggle('is-completed', e.target.checked);
                    }
                });

                body.appendChild(card);
            });

            accordion.appendChild(header);
            accordion.appendChild(body);
            listContainer.appendChild(accordion);
        });

        if (totalDisplayedTasks === 0) {
            listContainer.innerHTML = '<div class="mod-empty-msg">🎉 All caught up across Canvas & Gradescope!</div>';
        }
    }

    function escapeHTML(str) {
        return String(str).replace(/[&<>'"]/g,
                                   tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag)
        );
    }
})();
