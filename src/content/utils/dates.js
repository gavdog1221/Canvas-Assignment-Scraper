export function getCurrentSemesterInfo(date = new Date()) {
    const month = date.getMonth(); // 0 = Jan
    const year = date.getFullYear();
    // Rough (but generous) US academic-calendar boundaries. A few weeks of
    // overlap on either side is intentional slack, not precision: this is
    // only ever a fallback guess, never the sole source of truth.
    let season;
    if (month <= 4) season = 'spring';        // Jan – May
    else if (month <= 6) season = 'summer';   // Jun – Jul
    else season = 'fall';                     // Aug – Dec
    return { season, year, shortYear: String(year).slice(-2) };
  }

export function isCurrentSemesterCourse(name) {
    if (!name) return false;
    const str = name.toLowerCase();

    // No semester/year token in the name at all (very common — plenty of
    // instructors just call it "ECE541" with no term tag) → nothing to
    // exclude it on, so treat it as current rather than guessing wrong.
    const hasAnyTermToken = /\b(spring|summer|winter|fall|sp|su|fa|wi)\s*['’]?\s*\d{2,4}\b|\b20\d{2}\b/i.test(str);
    if (!hasAnyTermToken) return true;

    const { season, year, shortYear } = getCurrentSemesterInfo();
    const seasonAliases = { spring: ['spring', 'sp'], summer: ['summer', 'su'], fall: ['fall', 'fa'], winter: ['winter', 'wi'] };
    const aliasGroup = seasonAliases[season].join('|');
    const currentTermRegex = new RegExp(`\\b(?:${aliasGroup})\\s*['’]?\\s*(?:${year}|${shortYear})\\b`, 'i');
    if (currentTermRegex.test(str)) return true;

    // Named, but tagged with a term other than the current one → exclude.
    return false;
  }

export function isCourseInActiveTermWindow(course) {
    const term = course && course.term;
    if (!term || (!term.start_at && !term.end_at)) return null; // unknown — let caller fall back
    const GRACE_MS = 21 * 24 * 60 * 60 * 1000; // 3 weeks
    const now = Date.now();
    const start = term.start_at ? new Date(term.start_at).getTime() - GRACE_MS : -Infinity;
    const end = term.end_at ? new Date(term.end_at).getTime() + GRACE_MS : Infinity;
    return now >= start && now <= end;
  }

export function getWeekBounds(referenceDate = new Date()) {
    const d = new Date(referenceDate);
    const day = d.getDay();
    const diffToMonday = day === 0 ? -6 : 1 - day;

    const startOfWeek = new Date(d.getFullYear(), d.getMonth(), d.getDate() + diffToMonday, 0, 0, 0, 0);
    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 6);
    endOfWeek.setHours(23, 59, 59, 999);

    return { startOfWeek, endOfWeek };
  }

export function localDateKey(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
