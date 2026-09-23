import { STORAGE_KEY_STARRED } from '../constants.js';

// Memoized getStarredTasks — the starred map is read on every render.
// Re-parses only when the raw localStorage string changed (covers external
// writers like the xstorage mirror/hydration setItem path too).
let starredRaw;
let starredParsed = null;

export function getStarredTasks() {
    const raw = localStorage.getItem(STORAGE_KEY_STARRED);
    if (raw !== starredRaw) {
      try { starredParsed = JSON.parse(raw || '{}'); } catch { starredParsed = {}; }
      starredRaw = raw;
    }
    return starredParsed;
  }

export function isTaskStarred(taskId) {
    return !!getStarredTasks()[taskId];
  }

export function toggleStarredTask(taskId) {
    const data = getStarredTasks();
    if (data[taskId]) delete data[taskId];
    else data[taskId] = Date.now();
    localStorage.setItem(STORAGE_KEY_STARRED, JSON.stringify(data));
  }

export function withStarredFirst(baseComparator, starredMap) {
    return (a, b) => {
      const aStar = !!starredMap[a.id];
      const bStar = !!starredMap[b.id];
      if (aStar !== bStar) return aStar ? -1 : 1;
      return baseComparator(a, b);
    };
  }
