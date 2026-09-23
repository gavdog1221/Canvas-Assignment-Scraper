import { state } from '../state.js';

// Building Hours — MUB, Hamel Recreation Center, Dimond Library and Kingsbury
// Library (Engineering, Math & CS).
//
// Every one of the three UNH sources hides its real schedule behind a
// collapsible affordance, so grabbing visible text alone drops most of the
// hours:
//   - unh.edu/mub/about/mub-building-hours renders each section as a bootstrap
//     accordion; the day rows only live inside the collapsed .collapse bodies
//   - campusrec.unh.edu/hours tucks the Hamel hours into a mid-page paragraph
//   - library.unh.edu serves its hours through a LibCal "hours grid" JSON
//     widget on librarycalendars.unh.edu (weeks of per-location day rows)
// Each parser drills into the accordion bodies / JSON instead of the top-level
// text, then flattens everything to one shape consumed by the view:
//
//   { name, icon, link, sections: [{ name, rows }], status }
//   rows: [{ label, days[], closed, spans[{startDisp,endDisp,startMin,endMin}], raw }]

const DAY_KEYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const DAY_IDX = {
  sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6,
};

// "7:00 am" | "7am" | "7:00 a.m." | "12pm" -> minutes + a clean display form.
function normalizeTime(raw) {
  const s = String(raw || '').trim().replace(/\./g, '').toLowerCase();
  const m = s.match(/^(\d{1,2})(?::(\d{2}))?\s*([ap]m)$/);
  if (!m) return null;
  let h = parseInt(m[1], 10);
  const min = m[2] ? parseInt(m[2], 10) : 0;
  const period = m[3];
  if (period === 'pm' && h !== 12) h += 12;
  if (period === 'am' && h === 12) h = 0;
  const dispH = h % 12 === 0 ? 12 : h % 12;
  return { disp: `${dispH}:${String(min).padStart(2, '0')} ${period.toUpperCase()}`, min: h * 60 + min };
}

function minsToDisp(min) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  const period = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${period}`;
}

// "Monday - Friday" | "Saturday & Sunday" (or "–") -> array of day indexes.
function expandDayLabel(label) {
  const parts = String(label).split(/\s*(?:-|&|–)\s*/).map(p => DAY_IDX[p.trim().toLowerCase()] !== undefined ? DAY_IDX[p.trim().toLowerCase()] : null);
  if (!parts.length || parts.some(p => p === null)) return [];
  const uniq = parts.filter((p, i) => p !== null && parts.indexOf(p) === i);
  if (uniq.length === 1) return uniq;
  // Range "Mon - Fri" (or a wrapped "Fri - Mon"): walk forward from start.
  const out = [];
  let i = uniq[0];
  for (let n = 0; n < 7; n++) {
    out.push(i);
    if (i === uniq[uniq.length - 1]) break;
    i = (i + 1) % 7;
  }
  return out;
}

const DAY_NAME_ALT = 'Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday';
const DAY_ONE = '(?:' + DAY_NAME_ALT + ')';

// Day labels must anchor the match themselves: the UNH accordion bodies glue
// paragraphs together in textContent ("HOURSMonday", "pmSaturday"), and a loose
// [A-Z][a-z]{2,8} label class under the /i flag absorbed "URS" + the following
// day name as one bogus label, silently dropping every weekday row. Explicit
// full day names can't be corrupted by preceding text — the match just starts
// at the day word.
const DAY_TIME_RE = new RegExp('(' + DAY_ONE + '(?:\\s*(?:-|&|–)\\s*' + DAY_ONE + ')?)\\s*:?\\s*(?:(?:(\\d{1,2}(?::\\d{2})?\\s*[ap]\\.?m\\.?)\\s*[-–—]\\s*(\\d{1,2}(?::\\d{2})?\\s*[ap]\\.?m\\.?))|(closed))', 'gi');

function parseDayRows(text) {
  const rows = [];
  const re = new RegExp(DAY_TIME_RE.source, 'gi');
  let m;
  while ((m = re.exec(String(text || ''))) !== null) {
    const label = m[1].trim();
    const days = expandDayLabel(label);
    if (!days.length) continue;
    const closed = /closed/i.test(m[4] || '');
    let spans = [];
    if (!closed && m[2] && m[3]) {
      const start = normalizeTime(m[2]);
      const end = normalizeTime(m[3]);
      if (start && end && start.min < end.min) {
        spans = [{ startDisp: start.disp, endDisp: end.disp, startMin: start.min, endMin: end.min }];
      }
    }
    rows.push({ label, days, closed, spans, raw: m[0].trim() });
  }
  return rows;
}

// --- MUB (unh.edu/mub/about/mub-building-hours) ----------------------------
// Each section is one accordion .card; the day rows sit inside its collapsed
// .collapse body. Sections that only link elsewhere (GSS postal/shipping)
// produce no rows and are dropped.
function parseMubHours(html) {
  if (!html) return null;
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const sections = [];
  doc.querySelectorAll('.unh-accordion > .card').forEach(card => {
    const titleEl = card.querySelector('.unh-accordion--section-title');
    if (!titleEl) return;
    const nameEl = titleEl.querySelector('.field--name-field-unh-section-title');
    const name = (nameEl ? nameEl.textContent.trim() : titleEl.textContent.trim()) || 'Hours';
    const bodyEl = card.querySelector('.unh-accordion--content .card-body');
    const rows = parseDayRows(bodyEl ? bodyEl.textContent : '');
    if (!rows.length) return;
    sections.push({ name, rows });
  });
  if (!sections.length) return null;
  return {
    name: 'Memorial Union Building (MUB)',
    icon: '🏛️',
    link: 'https://unh.edu/mub/about/mub-building-hours',
    sections,
  };
}

// --- Hamel Rec (campusrec.unh.edu/hours) -----------------------------------
// The Hamel hours sit in a single "Fall Semester Hours" paragraph, mid-page.
function parseRecHours(html) {
  if (!html) return null;
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const text = doc.body ? doc.body.innerText : '';
  const anchor = text.toLowerCase().indexOf('fall semester hours');
  if (anchor === -1) return null;
  const tail = text.slice(anchor + 'fall semester hours'.length);
  const stop = tail.search(/\bprograms\b/i);
  const block = stop > 0 ? tail.slice(0, stop) : tail;
  const rows = parseDayRows(block);
  if (!rows.length) return null;
  return {
    name: 'Hamel Recreation Center',
    icon: '🏋️',
    link: 'https://campusrec.unh.edu/hours',
    sections: [{ name: 'Fall Semester Hours', rows }],
  };
}

// --- Libraries (LibCal grid JSON) ------------------------------------------
// library.unh.edu/about-us/hours renders through a LibCal widget backed by
// https://librarycalendars.unh.edu/widget/hours/grid?iid=3647&lid=0&format=json
// (weeks of per-location day objects keyed Sun..Sat). weeks[0] is the current
// week. Multiple hour ranges per day (e.g. the Information Desk) all show.
// lid=0 returns every location, so one fetch feeds both library cards:
// Dimond, plus Kingsbury Library (Engineering, Math & CS) from its page at
// library.unh.edu/locations/engineering-math-cs-library.
function libraryCardFromLocation(loc, fallbackName, fallbackUrl) {
  if (!loc) return null;
  const week = (Array.isArray(loc.weeks) && loc.weeks[0]) || null;
  if (!week) return null;

  const rows = [];
  DAY_KEYS.forEach((dayKey, dayIdx) => {
    const d = week[dayKey];
    if (!d) return;
    const times = d.times || {};
    const hours = Array.isArray(times.hours) ? times.hours : [];
    const spans = hours.map(h => {
      const start = normalizeTime(h && h.from);
      const end = normalizeTime(h && h.to);
      if (!start || !end) return null;
      return { startDisp: start.disp, endDisp: end.disp, startMin: start.min, endMin: end.min };
    }).filter(Boolean);
    const closed = times.status !== 'open' || !spans.length;
    rows.push({
      label: dayKey,
      days: [dayIdx],
      closed,
      spans,
      raw: d.rendered || (closed ? 'Closed' : ''),
    });
  });
  if (!rows.length) return null;
  return {
    name: loc.name || fallbackName,
    icon: '📚',
    link: fallbackUrl || 'https://library.unh.edu/about-us/hours',
    sections: [{ name: 'Weekly Hours', rows }],
  };
}

function parseLibraryHours(jsonStr) {
  if (!jsonStr) return null;
  let data;
  try {
    data = JSON.parse(jsonStr);
  } catch (e) {
    return null;
  }
  const locs = Array.isArray(data.locations) ? data.locations : [];
  const dimond = locs.find(l => /dimond/i.test(l.name || '')) || locs[0];
  const kingsbury = locs.find(l => /kingsbury/i.test(l.name || ''));

  const cards = [];
  const d = libraryCardFromLocation(dimond, 'Dimond Library', 'https://library.unh.edu/about-us/hours');
  if (d) cards.push(d);
  const k = libraryCardFromLocation(kingsbury, 'Kingsbury Library', 'https://library.unh.edu/locations/engineering-math-cs-library');
  if (k) cards.push(k);
  return cards.length ? cards : null;
}

// Open/closed status for *right now*, computed from the row that covers the
// current weekday (the last matching section wins — most specific, e.g. a
// semester-specific block overriding a generic one).
export function computeBuildingStatus(b, now = new Date()) {
  const dayIdx = now.getDay();
  const curMin = now.getHours() * 60 + now.getMinutes();

  let todayRow = null;
  (b.sections || []).some(section => {
    const hits = (section.rows || []).filter(r => r.days.indexOf(dayIdx) !== -1);
    if (hits.length) {
      todayRow = hits[hits.length - 1];
      return true;
    }
    return false;
  });

  if (!todayRow || todayRow.closed || !todayRow.spans.length) {
    return { isOpen: false, label: 'Closed today' };
  }
  const inSpan = todayRow.spans.find(sp => curMin >= sp.startMin && curMin < sp.endMin);
  if (inSpan) {
    return { isOpen: true, label: `Open now · until ${inSpan.endDisp}` };
  }
  const nextOpen = todayRow.spans.map(sp => sp.startMin).filter(m => m > curMin).sort((a, b) => a - b)[0];
  if (nextOpen !== undefined) {
    return { isOpen: false, label: `Opens ${minsToDisp(nextOpen)}` };
  }
  return { isOpen: false, label: 'Closed for today' };
}

export async function fetchBuildingHours() {
  const todayKey = new Date().toDateString();
  if (state.buildingHoursCache && state.buildingHoursCache.date === todayKey) {
    return state.buildingHoursCache;
  }

  const res = await browser.runtime.sendMessage({ type: 'FETCH_BUILDING_HOURS' }).catch(() => null);
  if (!res || !res.success) return null;

  const buildings = [];
  const mub = parseMubHours(res.mubHtml);
  if (mub) buildings.push(mub);
  const rec = parseRecHours(res.recHtml);
  if (rec) buildings.push(rec);
  const libs = parseLibraryHours(res.libraryJson);
  if (libs) libs.forEach(lib => buildings.push(lib));

  const payload = { date: todayKey, buildings };
  state.buildingHoursCache = payload;
  return payload;
}