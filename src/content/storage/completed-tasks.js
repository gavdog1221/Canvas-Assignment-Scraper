import { STORAGE_KEY_DONE } from '../constants.js';

// Every render reads the completed map, so JSON.parse on each call was a hot
// path (multiple parses per dashboard rebuild). Memoize the parsed value and
// only re-parse when the raw localStorage string actually changed — which
// also covers writers outside this module (the cross-origin mirror +
// hydration in xstorage.js go through setItem too). Mutating the returned
// object followed by a setItem later is safe: the next read sees the new raw
// string and re-parses.
let completedRaw;
let completedParsed = null;

export function getCompletedTasks() {
    const raw = localStorage.getItem(STORAGE_KEY_DONE);
    if (raw !== completedRaw) {
      try { completedParsed = JSON.parse(raw || '{}'); } catch { completedParsed = {}; }
      completedRaw = raw;
    }
    return completedParsed;
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
