import { state } from '../state.js';
import { origin } from '../constants.js';
import { isCurrentSemesterCourse } from '../utils/dates.js';
import { generateTaskId, normalizeCourseCode, parseAndCleanTitle } from '../utils/text.js';

export function getCsrfToken() {
    const match = document.cookie.match(/(?:^|;\s*)_csrf_token=([^;]+)/);
    return match ? decodeURIComponent(match[1]) : '';
  }

// Canvas List endpoints paginate at their per_page cap via Link: rel="next"
// — the old code fetched one page and silently truncated anything beyond it
// (a student with >100 courses, >100 assignments in a course, or >50 graded
// submissions). Follows the pagination chain with a sanity cap so a runaway
// loop can't hammer the API forever. Returns the flat concatenated array
// ([] when the first request fails, so callers keep their existing fallbacks).
export async function fetchAllPages(firstUrl, headers, maxPages = 5) {
    const out = [];
    let url = firstUrl;
    for (let page = 0; url && page < maxPages; page++) {
      try {
        const res = await fetch(url, { credentials: 'include', headers: headers });
        if (!res.ok) break;
        const data = await res.json();
        if (Array.isArray(data)) out.push(...data);
        const link = res.headers.get('Link') || '';
        const next = link.match(/<([^>]+)>\s*;\s*rel="?next"?/i);
        url = next ? next[1] : null;
      } catch (e) {
        console.warn('[YACE] paginated fetch failed at page', page + 1, e);
        break;
      }
    }
    return out;
  }

export async function fetchGradescopeData(hiddenCourseKeys = []) {
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
        // Hidden courses aren't scraped anywhere else — skip their per-course
        // page fetch here too (it's one request per Gradescope course).
        if (hiddenCourseKeys.includes(normalizeCourseCode(name))) return;
        if (!courseMap.has(courseId) && name) {
          courseMap.set(courseId, { id: courseId, name: name, url: fullUrl });
        }
      });

      // Fetch every GS course through a capped worker pool (4 lanes) instead
      // of an unbounded Promise.all — one request per course hit gradescope
      // with no rate limit before.
      const gsQueue = Array.from(courseMap.values());
      const gsWorkers = Array.from({ length: Math.min(4, gsQueue.length) }, async () => {
        while (gsQueue.length) {
          const course = gsQueue.shift();
          try {
          const cRes = await fetch(course.url, { credentials: 'include' });
          if (!cRes.ok) continue;

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
            let uploadUrl = null;

            if (btnEl && btnEl.getAttribute('data-post-url')) {
              const postUrl = btnEl.getAttribute('data-post-url');
              url = `https://www.gradescope.com${postUrl.replace(/\/submissions.*$/, '')}`;
              uploadUrl = `https://www.gradescope.com${postUrl}`;
            } else if (linkEl && linkEl.getAttribute('href')) {
              url = `https://www.gradescope.com${linkEl.getAttribute('href')}`;
              uploadUrl = url;
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

            const cleanedGs = parseAndCleanTitle(title, courseKey);
            tasks.push({
              id: generateTaskId(courseKey, title),
                       title: cleanedGs.title,
                       url: url,
                       gradescopeUploadUrl: uploadUrl,
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
        }
      });
      await Promise.all(gsWorkers);
    } catch (e) {
      console.warn('[Gradescope] Error:', e);
    }

    return { tasksByCourse: gsTasksByCourse, gradesByCourse: gsGradesByCourse };
  }

export async function fetchCanvasAnnouncements(headers, activeCourses, courseNameById) {
    const announcements = [];

    if (activeCourses && activeCourses.length > 0) {
// Per-course fetches instead of the global /api/v1/announcements
      // index: that single call's cross-course ordering/pagination silently
      // drops recent posts once a term fills up, which shelled out as a News
      // column stuck days old. One request per active course (newest few
      // each), merged and sorted below — deterministic and always current.
      await Promise.all((activeCourses || []).map(async (c) => {
        if (!c || !c.id) return;
        try {
          const annRes = await fetch(
            `${origin}/api/v1/courses/${c.id}/discussion_topics?only_announcements=true&order_by=recent_activity&per_page=5`,
            { credentials: 'include', headers: headers }
          );
          if (!annRes.ok) {
            console.warn('[Announcements] HTTP ' + annRes.status + ' for course ' + c.id);
            return;
          }
          const items = await annRes.json();
          if (!Array.isArray(items)) return;
          items.forEach(item => {
            const canvasCourseId = c.id;
            const rawCourseName = courseNameById[canvasCourseId];
            const courseKey = normalizeCourseCode(rawCourseName || item.context_code || '');
            const postedAt = item.posted_at ? new Date(item.posted_at)
            : (item.delayed_post_at ? new Date(item.delayed_post_at) : null);
            const plainMessage = String(item.message || '')
            .replace(/<[^>]*>/g, ' ')
            .replace(/&nbsp;/gi, ' ')
            .replace(/\s{2,}/g, ' ')
            .trim();

            announcements.push({
              id: `ann_${item.id}`,
              title: item.title || 'Announcement',
              message: plainMessage,
              url: item.html_url || null,
              postedAt: (postedAt && !isNaN(postedAt.getTime())) ? postedAt : null,
                               courseKey: courseKey,
                               courseName: rawCourseName || courseKey,
                               canvasCourseId: canvasCourseId
            });
          });
        } catch (e) {
          console.warn('[Announcements] fetch error (course ' + c.id + '):', e);
        }
      }));
    }

    try {
      const unreadRes = await fetch(`${origin}/api/v1/conversations/unread_count`, {
        credentials: 'include',
        headers: headers
      });
      if (unreadRes.ok) {
        const data = await unreadRes.json();
        const count = parseInt(data && data.unread_count, 10);
        state.cachedUnreadInboxCount = isNaN(count) ? 0 : count;
      }
    } catch (e) {
      console.warn('[Inbox] unread_count fetch error:', e);
    }

    announcements.sort((a, b) => (b.postedAt ? b.postedAt.getTime() : 0) - (a.postedAt ? a.postedAt.getTime() : 0));
    return announcements;
  }

export async function fetchCanvasGrades(headers, courseNameById) {
    const grades = [];
    try {
      const submissions = await fetchAllPages(`${origin}/api/v1/users/self/graded_submissions?include[]=assignment&per_page=50`, headers, 5);
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
