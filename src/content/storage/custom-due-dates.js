import { state } from '../state.js';
import { STORAGE_KEY_CUSTOM_DUE } from '../constants.js';

export function getCustomDueDates() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY_CUSTOM_DUE) || '{}');
    } catch { return {}; }
  }

export function setCustomDueDate(taskId, isoStringOrNull) {
    const data = getCustomDueDates();
    if (isoStringOrNull) data[taskId] = isoStringOrNull;
    else delete data[taskId];
    localStorage.setItem(STORAGE_KEY_CUSTOM_DUE, JSON.stringify(data));
  }

export function applyCustomDueDates() {
    const customDates = getCustomDueDates();
    Object.values(state.cachedCourseMap).forEach(course => {
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

export function effectiveDueDate(t) {
    return t.dueDate || t.customDueDate || null;
  }
