import { STORAGE_KEY_DONE } from '../constants.js';

export function getCompletedTasks() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY_DONE) || '{}');
    } catch { return {}; }
  }

export function setTaskCompleted(taskId, isDone) {
    const data = getCompletedTasks();
    if (isDone) data[taskId] = Date.now();
    else delete data[taskId];
    localStorage.setItem(STORAGE_KEY_DONE, JSON.stringify(data));
  }

export function autoCompleteSubmittedTasks(courseMap) {
    const completedMap = getCompletedTasks();
    let changed = false;
    Object.values(courseMap).forEach(course => {
      (course.tasks || []).forEach(t => {
        if (t.id && t.isSubmitted && !completedMap[t.id]) {
          setTaskCompleted(t.id, true);
          changed = true;
        }
      });
    });
    return changed;
  }
