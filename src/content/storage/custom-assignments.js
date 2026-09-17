import { STORAGE_KEY_CUSTOM_TASKS } from '../constants.js';
import { localDateKey } from '../utils/dates.js';

export function getCustomAssignments() {
    try {
      const list = JSON.parse(localStorage.getItem(STORAGE_KEY_CUSTOM_TASKS) || '[]');
      return Array.isArray(list) ? list : [];
    } catch {
      return [];
    }
  }

export function saveCustomAssignments(list) {
    localStorage.setItem(STORAGE_KEY_CUSTOM_TASKS, JSON.stringify(list));
  }

export function generateCustomId() {
    return `custom_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }

export function addDaysToDate(date, n) {
    const d = new Date(date);
    d.setDate(d.getDate() + n);
    return d;
  }

export function addMonthsSafe(date, n) {
    const d = new Date(date);
    const targetDay = d.getDate();
    d.setDate(1);
    d.setMonth(d.getMonth() + n);
    const daysInTarget = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    d.setDate(Math.min(targetDay, daysInTarget));
    return d;
  }

export function generateOccurrences(template) {
    const HARD_CAP = 200;
    const HORIZON_MONTHS = 8;

    const timeParts = (template.time || '23:59').split(':').map(n => parseInt(n, 10));
    const hh = isNaN(timeParts[0]) ? 23 : timeParts[0];
    const mm = isNaN(timeParts[1]) ? 59 : timeParts[1];

    const base = new Date(`${template.startDate}T00:00:00`);
    if (isNaN(base.getTime())) return [];
    base.setHours(hh, mm, 0, 0);

    const rep = template.repeat || { freq: 'none' };
    const results = [];

    if (!rep.freq || rep.freq === 'none') {
      results.push(new Date(base));
      return results;
    }

    const interval = Math.max(1, parseInt(rep.interval, 10) || 1);
    let endDate = null;
    let maxCount = HARD_CAP;

    if (rep.endMode === 'on' && rep.endDate) {
      endDate = new Date(`${rep.endDate}T23:59:59`);
    } else if (rep.endMode === 'after' && rep.count) {
      maxCount = Math.min(HARD_CAP, Math.max(1, parseInt(rep.count, 10) || 1));
    } else {
      endDate = addMonthsSafe(base, HORIZON_MONTHS);
    }

    if (rep.freq === 'daily') {
      let cursor = new Date(base);
      while (results.length < maxCount && (!endDate || cursor <= endDate)) {
        results.push(new Date(cursor));
        cursor = addDaysToDate(cursor, interval);
      }
    } else if (rep.freq === 'weekly') {
      const days = (rep.daysOfWeek && rep.daysOfWeek.length)
      ? Array.from(new Set(rep.daysOfWeek)).sort((a, b) => a - b)
      : [base.getDay()];
      const weekStart = addDaysToDate(base, -base.getDay());

      outer:
      for (let weekIndex = 0; weekIndex < 520; weekIndex++) {
        const thisWeekStart = addDaysToDate(weekStart, weekIndex * 7 * interval);
        if (endDate && thisWeekStart > endDate) break;

        for (const dow of days) {
          const occ = new Date(thisWeekStart);
          occ.setDate(occ.getDate() + dow);
          occ.setHours(hh, mm, 0, 0);
          if (occ < base) continue;
          if (endDate && occ > endDate) continue;
          results.push(occ);
          if (results.length >= maxCount) break outer;
        }
      }
      results.sort((a, b) => a - b);
    } else if (rep.freq === 'monthly') {
      for (let m = 0; m < 240 && results.length < maxCount; m++) {
        const occ = addMonthsSafe(base, m * interval);
        if (endDate && occ > endDate) break;
        results.push(occ);
      }
    }

    if (results.length === 0) results.push(new Date(base));
    return results.slice(0, HARD_CAP);
  }

export function stripCustomTasks(courseMap) {
    Object.keys(courseMap).forEach(key => {
      const course = courseMap[key];
      if (!course || !Array.isArray(course.tasks)) return;
      course.tasks = course.tasks.filter(t => !t.isCustom);
    });
    Object.keys(courseMap).forEach(key => {
      const course = courseMap[key];
      if (course && course.isCustomCourse && (!course.tasks || course.tasks.length === 0)) {
        delete courseMap[key];
      }
    });
  }

export function mergeCustomTasksIntoCourseMap(courseMap) {
    stripCustomTasks(courseMap);
    const templates = getCustomAssignments();

    templates.forEach(template => {
      const key = template.courseKey;
      if (!courseMap[key]) {
        courseMap[key] = { name: template.courseLabel || key, canvasCourseId: null, tasks: [], isCustomCourse: true };
      }

      const occurrences = generateOccurrences(template);
      occurrences.forEach(occDate => {
        const instanceId = `${template.id}_${localDateKey(occDate)}`;
        courseMap[key].tasks.push({
          id: instanceId,
          templateId: template.id,
          canvasAssignmentId: null,
          canvasCourseId: null,
          contentId: null,
          title: template.title,
          url: 'javascript:void(0)',
                                  dueDate: occDate,
                                  points: (template.points !== null && template.points !== undefined && template.points !== '') ? Number(template.points) : null,
                                  isUndatedHw: false,
                                  gradescope: false,
                                  isGradescope: false,
                                  isSubmitted: false,
                                  courseKey: key,
                                  courseName: courseMap[key].name,
                                  downloadUrl: null,
                                  isCustom: true,
                                  customColor: template.color || null,
                                  notes: template.notes || '',
                                  isRecurring: !!(template.repeat && template.repeat.freq && template.repeat.freq !== 'none')
        });
      });
    });
  }
