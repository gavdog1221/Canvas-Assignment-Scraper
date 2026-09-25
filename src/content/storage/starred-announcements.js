import { STORAGE_KEY_STARRED_ANNOUNCEMENTS } from '../constants.js';

// Starred announcements (pin-to-top for the News tab). Mirrors the
// starred-tasks module: memoized read that re-parses only when the raw
// localStorage string changed (covers external writers like the xstorage
// mirror / hydration setItem path too).
let starredRaw;
let starredParsed = null;

export function getStarredAnnouncements() {
    const raw = localStorage.getItem(STORAGE_KEY_STARRED_ANNOUNCEMENTS);
    if (raw !== starredRaw) {
      try { starredParsed = JSON.parse(raw || '{}'); } catch { starredParsed = {}; }
      starredRaw = raw;
    }
    return starredParsed;
  }

export function isAnnouncementStarred(id) {
    return !!getStarredAnnouncements()[id];
  }

export function toggleStarredAnnouncement(id) {
    const data = getStarredAnnouncements();
    if (data[id]) delete data[id];
    else data[id] = Date.now();
    localStorage.setItem(STORAGE_KEY_STARRED_ANNOUNCEMENTS, JSON.stringify(data));
  }

export function withStarredAnnouncementsFirst(baseComparator, starredMap) {
    return (a, b) => {
      const aStar = !!starredMap[a.id];
      const bStar = !!starredMap[b.id];
      if (aStar !== bStar) return aStar ? -1 : 1;
      return baseComparator(a, b);
    };
  }