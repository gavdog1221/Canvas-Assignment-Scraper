import { state } from '../state.js';
import { STORAGE_KEY_EVENTS_CACHE } from '../constants.js';

// Campus events — two live Drupal sources behind the same origin (www.unh.edu),
// fetched through background.js for CORS and cached by day:
//
//   - unh.edu/mub/events        → MUB event "cards" (interactive paragraph
//     components). No dates are on the page — the cards link to each program's
//     /mub/events/<slug> page.
//   - unh.edu/unhtoday/         → New story cards, each a /news/<slug> link
//     carrying a `title="Read the story about …"` attribute. Homepage cards
//     carry no dates either.
//
// Unhwildcats.com/calendar was migrated to a client-side Nuxt SPA with no
// server-rendered events, so dated athletics is not scraped; the Events view
// links out to the official calendars instead.

// Kept in sync with the widget — one fetch per calendar day is plenty for
// content that only changes a few times a day.
function todayKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function isFresh(cache, date) {
  return !!(cache && cache.date === date && Array.isArray(cache.mub) && Array.isArray(cache.unhtoday));
}

function parseMubEvents(html) {
  if (!html) return [];
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const out = [];
  const seen = new Set();
  doc.querySelectorAll('.unh-irp a[href^="/mub/events/"]').forEach(a => {
    const href = a.getAttribute('href');
    if (seen.has(href)) return;
    seen.add(href);
    const title = (a.textContent || '').trim().replace(/\s+/g, ' ');
    if (!title) return;
    out.push({ title, url: 'https://www.unh.edu' + href });
  });
  return out.slice(0, 10);
}

function parseUnhTodayStories(html) {
  if (!html) return [];
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const out = [];
  const seen = new Set();
  doc.querySelectorAll('a[href^="/news/"]').forEach(a => {
    const href = a.getAttribute('href');
    // Only story links, not category/archive pages.
    if (href.split('/').length !== 3) return;
    if (seen.has(href)) return;
    seen.add(href);
    let title = (a.getAttribute('title') || a.getAttribute('aria-label') || '').trim();
    title = title.replace(/^Read the story about\s+/i, '').replace(/\s+/g, ' ');
    if (!title) {
      title = (a.textContent || '').trim().replace(/\s+/g, ' ');
    }
    if (!title || title.length < 5) return;
    out.push({ title, url: 'https://www.unh.edu' + href });
  });
  return out.slice(0, 12);
}

export async function fetchEvents() {
  const date = todayKey();
  if (isFresh(state.eventsCache, date)) {
    return { mub: state.eventsCache.mub, unhtoday: state.eventsCache.unhtoday };
  }

  let html;
  try {
    html = await browser.runtime.sendMessage({ type: 'FETCH_EVENTS' }).catch(() => null);
  } catch (e) {
    html = null;
  }
  if (!html || !html.success) {
    // Stale cache is better than nothing.
    if (state.eventsCache && Array.isArray(state.eventsCache.mub)) {
      return { mub: state.eventsCache.mub, unhtoday: state.eventsCache.unhtoday || [] };
    }
    return { mub: [], unhtoday: [] };
  }

  const cache = {
    date,
    mub: parseMubEvents(html.mubHtml),
    unhtoday: parseUnhTodayStories(html.unhtodayHtml),
  };
  state.eventsCache = cache;
  try {
    localStorage.setItem(STORAGE_KEY_EVENTS_CACHE, JSON.stringify(cache));
  } catch (e) { /* storage full/blocked — keep in-memory copy */ }
  return cache;
}