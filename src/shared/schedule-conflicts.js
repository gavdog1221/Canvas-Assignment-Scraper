// schedule-conflicts.js
//
// Shared helpers for turning WebCat/SSB meeting info into readable
// labels and detecting overlapping schedules. Deliberately dependency-
// free so it can be bundled into both dist/content.js (dashboard
// widget) and dist/registration.js (WebCat content script).

const DAY_LETTERS = { M: 0, T: 1, W: 2, R: 3, F: 4, S: 5, U: 6 };
const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

// "M,W,F" / "MWF" / "M W F" (+ fallback booleans handled by caller) -> ["M","W","F"]
export function parseMeetDays(days) {
  if (!days) return [];
  const seen = [];
  for (const ch of String(days)) {
    const letter = ch.toUpperCase();
    if (DAY_LETTERS[letter] !== undefined && !seen.includes(letter)) seen.push(letter);
  }
  return seen;
}

// "0900" -> 540 (minutes since midnight). Returns null for junk.
export function toMinutes(hhmm) {
  if (!hhmm) return null;
  const s = String(hhmm).replace(/[^0-9]/g, '');
  if (s.length !== 4) return null;
  const h = parseInt(s.slice(0, 2), 10);
  const m = parseInt(s.slice(2, 4), 10);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return h * 60 + m;
}

// "0900" -> "9:00 AM", "1730" -> "5:30 PM"
export function formatTime(hhmm) {
  if (!hhmm) return '';
  const mins = toMinutes(hhmm);
  if (mins === null) return String(hhmm);
  let h = Math.floor(mins / 60);
  const m = mins % 60;
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12;
  if (h === 0) h = 12;
  return m === 0 ? `${h}:00 ${ampm}` : `${h}:${String(m).padStart(2, '0')} ${ampm}`;
}

// section: { days, start, end } -> "MWF 9:00–10:15 AM" / "TBA" / "Online"
export function scheduleLabel(section, { online = false } = {}) {
  if (online) return 'Online';
  const days = Array.isArray(section.days) ? section.days : parseMeetDays(section.days);
  const dayStr = days.length ? days.join('') : '';
  const start = formatTime(section.start);
  const end = formatTime(section.end);
  if (!dayStr && !start && !end) return 'TBA';
  return [dayStr || 'TBA', start && end ? `${start}–${end}` : ''].filter(Boolean).join(' ');
}

// Sections: array of { days, start, end } (days may be letters array or
// "MWF" string; start/end are "HHMM"). Returns conflict objects:
//   { a, b, days, dayLabel }
// where `days` is the shared day letters and dayLabel is "Mon, Wed, Fri".
export function computeTimeConflicts(sections) {
  const conflicts = [];
  const list = (sections || []).filter(s => s && s.days && s.start && s.end);
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      const a = list[i];
      const b = list[j];
      const aDays = Array.isArray(a.days) ? a.days : parseMeetDays(a.days);
      const bDays = Array.isArray(b.days) ? b.days : parseMeetDays(b.days);
      const aStart = toMinutes(a.start);
      const aEnd = toMinutes(a.end);
      const bStart = toMinutes(b.start);
      const bEnd = toMinutes(b.end);
      if (aStart === null || aEnd === null || bStart === null || bEnd === null) continue;
      const shared = aDays.filter(d => bDays.includes(d));
      if (!shared.length) continue;
      if (aStart < bEnd && bStart < aEnd) {
        conflicts.push({
          a,
          b,
          days: shared,
          dayLabel: shared.map(d => DAY_NAMES[DAY_LETTERS[d]]).join(', '),
        });
      }
    }
  }
  return conflicts;
}