import { STORAGE_KEY_STARRED } from '../constants.js';

export function getStarredTasks() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY_STARRED) || '{}');
    } catch { return {}; }
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
