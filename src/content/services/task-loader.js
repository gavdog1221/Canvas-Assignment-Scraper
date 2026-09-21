import { state } from '../state.js';
import { origin } from '../constants.js';
import { hideReloadProgress, showReloadProgress } from '../components/reload-progress.js';
import { purgeDefaultCanvasElements, updateHiddenMenuButton } from '../components/widget-shell.js';
import { fetchCanvasAnnouncements, fetchCanvasGrades, fetchGradescopeData, getCsrfToken } from '../services/canvas-api.js';
import { saveCoursePercentagesCache, saveLocalAnnouncementsCache, saveLocalCache, saveLocalGradesCache } from '../storage/caches.js';
import { buildGradeSnapshot, computeGradeChanges, loadGradeSnapshot, saveGradeSnapshot } from '../storage/grade-alerts.js';
import { autoCompleteSubmittedTasks } from '../storage/completed-tasks.js';
import { mergeCustomTasksIntoCourseMap } from '../storage/custom-assignments.js';
import { applyCustomDueDates } from '../storage/custom-due-dates.js';
import { isCourseInActiveTermWindow, isCurrentSemesterCourse, localDateKey } from '../utils/dates.js';
import { extractCoreAssignmentToken, findSyllabusPdfUrl, generateTaskId, normalizeCourseCode, parseAndCleanTitle, parseGradeWeights, parseOfficeHours, parseSyllabusInstructors } from '../utils/text.js';
import { extractPdfText } from '../utils/pdf.js';
import { updateAnnouncementBadge } from '../views/announcements-view.js';
import { renderCurrentView, renderFilterPills, renderWorkloadStrip, updateProgressBar } from '../views/upcoming-view.js';
import { maybeShowWhatsNewBanner } from '../components/whats-new-banner.js';

export function deduplicateCourseMap(courseMap, allGrades = []) {
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
            if (!target.gradescopeUploadUrl && candidate.gradescopeUploadUrl) target.gradescopeUploadUrl = candidate.gradescopeUploadUrl;
            if (!target.isSubmitted && candidate.isSubmitted) target.isSubmitted = true;
            if (!target.dueDate && candidate.dueDate) {
              target.dueDate = candidate.dueDate;
              target.isUndatedHw = false;
            }
            if (!target.moduleName && candidate.moduleName) target.moduleName = candidate.moduleName;
            if (candidate.isGradescope) target.isGradescope = true;

            if (/\.(pdf|docx?|zip)/i.test(target.title) && !/\.(pdf|docx?|zip)/i.test(candidate.title)) {
              // Ensure the replacement title is also stripped and cleaned
              target.title = parseAndCleanTitle(candidate.title, key).title;
              target.url = candidate.url;
            }
          }
        });

        course.tasks = uniqueTasks;
      });

      return courseMap;
  }

export function mergeGradeSources(canvasGrades, gsGrades) {
    const canvasByKey = new Map();
    canvasGrades.forEach(g => {
      const token = extractCoreAssignmentToken(g.title, g.courseKey);
      if (token) canvasByKey.set(`${g.courseKey}::${token}`, g);
    });

    const merged = [...canvasGrades];
    const usedCanvasTargets = new Set();

    gsGrades.forEach(gs => {
      const token = extractCoreAssignmentToken(gs.title, gs.courseKey);
      let match = token ? canvasByKey.get(`${gs.courseKey}::${token}`) : null;

      if (!match) {
        match = canvasGrades.find(cg =>
        cg.courseKey === gs.courseKey &&
        cg.pointsPossible === gs.pointsPossible &&
        cg.score === gs.score &&
        !usedCanvasTargets.has(cg.id)
        );
      }

      if (match) {
        match.isGradescope = true;
        if (!match.url) match.url = gs.url;
        usedCanvasTargets.add(match.id);
      } else {
        merged.push(gs);
      }
    });

    return merged;
  }

export async function loadTasks(showLoadingUI = true, opts = {}) {
    const listContainer = document.getElementById('module-tasks-list');
    if (showLoadingUI && (!state.cachedCourseMap || Object.keys(state.cachedCourseMap).length === 0)) {
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

      // Pull EVERY actively-enrolled course, not just ones the student has
      // starred as a favorite — favoriting is a manual, easy-to-forget step,
      // and relying on it silently drops legitimate current courses from
      // the scan. include[]=term gets us real start/end dates so "current"
      // can be determined from actual enrollment data instead of guessing
      // from the course's name. per_page is generous (100) so no course
      // gets truncated off a large course list.
      let courses = [];
      const courseRes = await fetch(`${origin}/api/v1/courses?enrollment_state=active&include[]=total_scores&include[]=term&include[]=syllabus_body&per_page=100`, {
        credentials: 'include',
        headers: headers
      });
      if (courseRes.ok) courses = await courseRes.json();

      // Fallback only if that somehow comes back empty (e.g. a permissions
      // quirk) — favorites is better than nothing.
      if (!courses || courses.length === 0) {
        const favRes = await fetch(`${origin}/api/v1/users/self/favorites/courses?include[]=total_scores&include[]=term&include[]=syllabus_body`, {
          credentials: 'include',
          headers: headers
        });
        if (favRes.ok) courses = await favRes.json();
      }

      if (showLoadingUI) {
        showReloadProgress('Filtering active semester courses...', 15);
      }

      const activeCourses = (courses || []).filter(course => {
        if (!course.id || course.access_restricted_by_date) return false;
        // Real term dates take priority; only fall back to name-guessing
        // when Canvas doesn't give us term info to work with.
        const termWindowResult = isCourseInActiveTermWindow(course);
        if (termWindowResult !== null) return termWindowResult;
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
          const courseBaseUrl = `${origin}/courses/${c.id}`;
          const syllabusHtml = c.syllabus_body || '';
          const syllabusText = syllabusHtml.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
          const syllabusInstructors = parseSyllabusInstructors(syllabusText);
          unifiedCourseMap[courseKey] = {
            name: rawCourseName,
            canvasCourseId: c.id,
            tasks: [],
            resources: {
              hasSyllabusContent: syllabusText.length > 0,
              professors: syllabusInstructors,
              professorName: syllabusInstructors[0] || '',
              syllabusPdfUrl: findSyllabusPdfUrl(syllabusHtml, origin),
              gradeWeights: parseGradeWeights(syllabusText),
              officeHours: parseOfficeHours(syllabusText),
              syllabusExcerpt: syllabusText.length > 0
                ? (syllabusText.length > 220 ? syllabusText.slice(0, 220).trim() + '…' : syllabusText)
                : '',
              syllabusUrl: `${courseBaseUrl}/assignments/syllabus`,
              modulesUrl: `${courseBaseUrl}/modules`,
              filesUrl: `${courseBaseUrl}/files`,
              gradesUrl: `${courseBaseUrl}/grades`,
              homeUrl: courseBaseUrl
            }
          };
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

      const announcementsPromise = (opts.refreshAnnouncements !== false)
        ? fetchCanvasAnnouncements(headers, activeCourses, courseNameById)
        : Promise.resolve(state.cachedAnnouncements || []);

      const totalSteps = Math.max(activeCourses.length, 1);
      let stepIndex = 0;

      for (const course of activeCourses) {
        const rawCourseName = courseNameById[course.id];
        const courseKey = normalizeCourseCode(rawCourseName);
        const modulePdfCandidates = [];

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
                  const parsed = parseAndCleanTitle(item.title, courseKey);
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

                  // Remember syllabus-ish PDFs so the instructor fallback chain
                  // can try the ones professors actually post in Modules.
                  if (downloadUrl && modulePdfCandidates.length < 3) {
                    const titleIsSyllabus = /syllabus|course\s*(info|syllabus|overview)|first\s+day|intro/i.test(item.title || '');
                    const moduleIsSyllabus = /syllabus|course\s*(info|syllabus|overview)/i.test(mod.name || '');
                    const isPlainPdf = /\.pdf(\s|$)/i.test(item.title || '');
                    if (titleIsSyllabus || moduleIsSyllabus || isPlainPdf) {
                      modulePdfCandidates.push({ url: downloadUrl, priority: (titleIsSyllabus || moduleIsSyllabus) ? 0 : 1 });
                    }
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

        // Remember syllabus-ish PDFs so the instructor fallback can try them.
        modulePdfCandidates.sort((a, b) => a.priority - b.priority);
        if (unifiedCourseMap[courseKey].resources) {
          unifiedCourseMap[courseKey].resources.modulePdfUrls = modulePdfCandidates.slice(0, 2).map(c => c.url);
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
                const parsed = parseAndCleanTitle(a.name, courseKey);
                const dueDate = a.due_at ? new Date(a.due_at) : parsed.dueDate;
                const isHwLike = homeworkFolderPattern.test(a.name) || (a.submission_types && !a.submission_types.includes('none'));
                const isSubmitted = !!(a.submission && (a.submission.submitted_at || a.submission.workflow_state === 'submitted'));

                if (dueDate || isHwLike) {
                  let downloadUrl = null;
                  let contentId = null;

                  // Parse embedded file links from the assignment description
                  if (a.description) {
                    // Match /files/12345/download or /files/12345
                    const fileMatch = a.description.match(/\/courses\/\d+\/files\/(\d+)(?:\/download)?/i) ||
                    a.description.match(/\/files\/(\d+)(?:\/download)?/i);
                    if (fileMatch) {
                      contentId = fileMatch[1];
                      downloadUrl = `${origin}/courses/${course.id}/files/${contentId}/download?download_frd=1`;
                    } else {
                      // Fallback match for direct PDF href links inside details/body
                      const pdfLinkMatch = a.description.match(/href="([^"]+\.pdf[^"]*)"/i);
                      if (pdfLinkMatch) {
                        downloadUrl = pdfLinkMatch[1].replace(/&amp;/g, '&');
                      }
                    }
                  }

                  unifiedCourseMap[courseKey].tasks.push({
                    id: generateTaskId(courseKey, a.name),
                                                         canvasAssignmentId: a.id || null,
                                                         canvasCourseId: course.id,
                                                         contentId: contentId,
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
                                                         downloadUrl: downloadUrl
                  });
                }              }
            }
          }
        } catch (e) {
          console.warn(`Assignments scan error for ${rawCourseName}`, e);
        }

        // Instructor fallback for courses whose syllabus didn't name anyone:
        // teacher enrollments -> syllabus-tab PDF -> Modules PDF(s). No-op
        // when the inline syllabus already produced a name.
        await enrichCourseInstructor(unifiedCourseMap[courseKey], course, headers);
      }

      if (showLoadingUI) {
        showReloadProgress('Synchronizing Gradescope...', 80);
      }

      if (opts.refreshAnnouncements !== false) {
        const newAnnouncements = await announcementsPromise;
        state.cachedAnnouncements = newAnnouncements;
        saveLocalAnnouncementsCache(newAnnouncements);
      }
      updateAnnouncementBadge();

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

      const allGrades = mergeGradeSources(canvasGrades, gsGradesFlat).sort((a, b) => {
        if (a.gradedAt && b.gradedAt) return b.gradedAt - a.gradedAt;
        if (a.gradedAt) return -1;
        if (b.gradedAt) return 1;
        return a.title.localeCompare(b.title);
      });

      state.cachedGrades = allGrades;
      saveLocalGradesCache(allGrades);

      // Grade-change alerts: diff this scan against the last snapshot so
      // newly posted / changed grades bubble up in the Grades tab. The first
      // scan after an update just establishes a baseline.
      const gradeSnapshot = loadGradeSnapshot();
      state.gradeChangeAlerts = gradeSnapshot ? computeGradeChanges(gradeSnapshot, allGrades) : [];
      saveGradeSnapshot(buildGradeSnapshot(allGrades));

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

      state.cachedCoursePercentages = derivedPcts;
      saveCoursePercentagesCache(derivedPcts);

      // 5. Intelligent Deduplication
      deduplicateCourseMap(unifiedCourseMap, allGrades);

      if (showLoadingUI) {
        showReloadProgress('Ready!', 100);
      }

      state.cachedCourseMap = unifiedCourseMap;
      applyCustomDueDates();
      autoCompleteSubmittedTasks(state.cachedCourseMap);
      saveLocalCache(unifiedCourseMap);
      mergeCustomTasksIntoCourseMap(state.cachedCourseMap);
      renderFilterPills();
      updateHiddenMenuButton();
      updateProgressBar();
      renderWorkloadStrip();
      // Fresh scrape data lands here — force the Grades/News/Info panels to
      // rebuild instead of being re-mounted stale from the previous render.
      state.forceDashboardRebuild = true;
      renderCurrentView();
      maybeShowWhatsNewBanner();
      purgeDefaultCanvasElements();

      setTimeout(hideReloadProgress, 400);
    } catch (fatalErr) {
      console.error('Task Scanner Error:', fatalErr);
      hideReloadProgress();
      if (!state.cachedCourseMap || Object.keys(state.cachedCourseMap).length === 0) {
        listContainer.innerHTML = `<div class="mod-empty-msg" style="color:#f87171; border-color: rgba(248, 113, 113, 0.4);">Error scanning courses.</div>`;
      }
    }
  }

/* ---------------------------------------------------------------------------
 * Instructor name fallback chain
 *
 * Some syllabi never name the professor inline: the syllabus tab is just a
 * link to a PDF, or the syllabus PDF lives in Modules. These helpers chase
 * the remaining sources in order of reliability, and only when the inline
 * syllabus text yielded no names:
 *   1. Canvas teacher enrollments for the course (authoritative, no parsing)
 *   2. the syllabus-tab PDF, when the syllabus body links one
 *   3. syllabus-ish PDFs collected from the Modules scan
 * ------------------------------------------------------------------------- */

async function fetchTeacherNames(canvasCourseId, headers) {
    try {
      const res = await fetch(`${origin}/api/v1/courses/${canvasCourseId}/enrollments?type[]=TeacherEnrollment&per_page=50`, {
        credentials: 'include',
        headers: headers
      });
      if (!res.ok) return [];
      const list = await res.json();
      return (Array.isArray(list) ? list : [])
        .filter(e => e.type === 'TeacherEnrollment' && e.user && e.user.name)
        .map(e => String(e.user.name).trim())
        .filter(Boolean);
    } catch (e) {
      return [];
    }
  }

async function fetchPdfInstructorNames(url) {
    try {
      const res = await fetch(url, { credentials: 'include' });
      if (!res.ok) return [];
      const buf = await res.arrayBuffer();
      const text = await extractPdfText(buf);
      return parseSyllabusInstructors(text);
    } catch (e) {
      return [];
    }
  }

function setCourseProfessors(res, names) {
    const clean = (names || []).filter(Boolean);
    if (!clean.length) return;
    res.professors = clean;
    res.professorName = clean[0];
  }

async function enrichCourseInstructor(courseEntry, canvasCourse, headers) {
    const res = (courseEntry && courseEntry.resources) || {};
    if (Array.isArray(res.professors) && res.professors.length) return;

    // 1. Canvas teacher enrollments — authoritative.
    if (canvasCourse && canvasCourse.id) {
      const teachers = await fetchTeacherNames(canvasCourse.id, headers);
      if (teachers.length) {
        setCourseProfessors(res, teachers);
        return;
      }
    }

    // 2. Syllabus-tab PDF.
    if (res.syllabusPdfUrl) {
      const names = await fetchPdfInstructorNames(res.syllabusPdfUrl);
      if (names.length) {
        setCourseProfessors(res, names);
        return;
      }
    }

    // 3. Syllabus-ish PDFs posted in Modules.
    const moduleUrls = Array.isArray(res.modulePdfUrls) ? res.modulePdfUrls : [];
    for (const url of moduleUrls) {
      const names = await fetchPdfInstructorNames(url);
      if (names.length) {
        setCourseProfessors(res, names);
        return;
      }
    }
  }
