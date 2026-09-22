// Cross-origin persistence for dashboard state.
//
// Canvas serves this extension from BOTH mycourses.unh.edu and
// unh.instructure.com (both are in manifest.json content_scripts.matches), and
// localStorage is PER-ORIGIN. Any dashboard data written on one origin is
// invisible on the other — which is why task caches, completed/hidden/custom
// assignments, starred tasks and panel collapse state kept "disappearing"
// whenever a reload landed on the sibling origin.
//
// browser.storage.local is shared across the whole extension (same mechanism
// src/shared/registration-storage.js already uses for the WebCat autofill
// contract). This module:
//   1. installSyncMirror() — wraps Storage.prototype.setItem/removeItem so
//      EVERY localStorage write (there are ~24 call sites, including ones in
//      views/components the storage modules never see) is ALSO mirrored to
//      browser.storage.local. Writes stay synchronous and local-first; the
//      mirror is fire-and-forget and never throws.
//   2. hydrateSyncedStorage() — seeds the current origin's localStorage from
//      the storage area before the dashboard renders, so the sibling origin's
//      data is visible immediately.

const SYNC_PREFIXES = ['canvas_mod_tasks_', 'yace_'];

// Both browser.storage.local (Firefox, promise API) and chrome.storage.local
// (Chrome MV2, callback API) must work: every call below passes a no-op
// callback, which both backends honor, and never relies on a return value.
const HAS_BROWSER = typeof browser !== 'undefined' && browser.storage && browser.storage.local;
const HAS_CHROME = typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local;
const AREA = HAS_BROWSER ? browser.storage.local : (HAS_CHROME ? chrome.storage.local : null);

function isSyncedKey(key) {
  return typeof key === 'string' && SYNC_PREFIXES.some((p) => key.startsWith(p));
}

function mirrorSet(key, value) {
  if (!AREA || !isSyncedKey(key)) return;
  try { AREA.set({ [key]: value }, () => {}); } catch (e) {}
}

function mirrorRemove(key) {
  if (!AREA || !isSyncedKey(key)) return;
  try { AREA.remove(key, () => {}); } catch (e) {}
}

export function installSyncMirror() {
  if (window.__yaceSyncMirrorInstalled) return;
  window.__yaceSyncMirrorInstalled = true;
  try {
    const proto = window.Storage && window.Storage.prototype;
    if (!proto) return;
    const origSet = proto.setItem;
    const origRemove = proto.removeItem;
    proto.setItem = function (key, value) {
      try { origSet.call(this, key, value); } catch (e) {}
      mirrorSet(key, value);
    };
    proto.removeItem = function (key) {
      try { origRemove.call(this, key); } catch (e) {}
      mirrorRemove(key);
    };
  } catch (e) {}
}

export async function hydrateSyncedStorage() {
  if (!AREA) return;
  try {
    // Callback form for Chrome, promise form for Firefox — one code path.
    const all = await new Promise((resolve) => {
      let settled = false;
      const done = (v) => {
        if (settled) return;
        settled = true;
        resolve(v || {});
      };
      try {
        if (HAS_BROWSER) AREA.get(null).then(done).catch(() => done(null));
        else AREA.get(null, done);
      } catch (e) { done(null); }
    });
    Object.entries(all || {}).forEach(([key, value]) => {
      if (!isSyncedKey(key)) return;
      try {
        if (typeof value === 'string') localStorage.setItem(key, value);
        else localStorage.setItem(key, JSON.stringify(value));
      } catch (e) {}
    });
  } catch (e) {
    console.warn('[YACE] storage hydrate failed:', e);
  }
}