import { STORAGE_KEY_NOTIFICATION_HISTORY } from '../constants.js';

// Recent-notification history behind the 🔔 bell button. Every what's-new
// toast item is logged here so it stays visible after the transient top
// banner dismisses. Entries are stored newest-first, deduped by id (re-scans
// can never double-log), and capped so the list can't grow unbounded.

const MAX_ENTRIES = 100;
let historyRaw;
let historyParsed = null;

export function getNotificationHistory() {
    const raw = localStorage.getItem(STORAGE_KEY_NOTIFICATION_HISTORY);
    if (raw !== historyRaw) {
      try { historyParsed = JSON.parse(raw || '[]'); } catch { historyParsed = []; }
      historyRaw = raw;
    }
    return historyParsed;
  }

export function addNotifications(entries) {
    const fresh = (Array.isArray(entries) ? entries : []).filter(e => e && e.id);
    if (!fresh.length) return 0;
    const history = getNotificationHistory();
    const have = new Set(history.map(h => h.id));
    const now = Date.now();
    const added = fresh.filter(e => !have.has(e.id));
    if (!added.length) return 0;
    added.forEach(e => {
      if (!e.ts) e.ts = now;
      e.read = !!e.read;
      have.add(e.id);
    });
    history.unshift(...added);
    if (history.length > MAX_ENTRIES) history.length = MAX_ENTRIES;
    try { localStorage.setItem(STORAGE_KEY_NOTIFICATION_HISTORY, JSON.stringify(history)); } catch (e) {}
    historyRaw = null;
    return added.length;
  }

export function unreadNotificationCount() {
    return getNotificationHistory().filter(h => !h.read).length;
  }

export function markNotificationsRead() {
    const history = getNotificationHistory();
    if (!history.some(h => !h.read)) return;
    history.forEach(h => { h.read = true; });
    try { localStorage.setItem(STORAGE_KEY_NOTIFICATION_HISTORY, JSON.stringify(history)); } catch (e) {}
    historyRaw = null;
  }

export function clearNotificationHistory() {
    try { localStorage.setItem(STORAGE_KEY_NOTIFICATION_HISTORY, '[]'); } catch (e) {}
    historyRaw = null;
    historyParsed = [];
  }