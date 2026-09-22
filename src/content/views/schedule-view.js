import { state } from '../state.js';
import { computeTimeConflicts, formatTime, parseMeetDays, scheduleLabel, toMinutes } from '../../shared/schedule-conflicts.js';
import { getHiddenCourses } from '../storage/hidden-courses.js';
import { CUSTOM_COLOR_PRESETS, STORAGE_KEY_SCHEDULE_CACHE } from '../constants.js';
import { escapeHTML, normalizeCourseCode } from '../utils/text.js';
import { parseColorToRgba } from '../utils/colors.js';

// Schedule panel: a weekly timetable of the classes the user is *currently*
// taking. Courses come from the Canvas dashboard scrape (state.cachedCourseMap
// — skip custom/self-made courses and hidden ones), then each catalog code is
// looked up on courses.unh.edu via the background relay:
//   1. FETCH_COURSE_SEARCH { query: code, termCode } → current-term sections
//   2. FETCH_WEBCAT_CRN { crns, termCode } → meeting days/start/end/building
// The current term is derived from today's date (UNH scheme: <year><season>,
// fall=10, january=30, spring=50, summer=70). Results are cached per
// (term · course-set) so interactive dashboard re-renders never refetch, and
// the whole panel renders whenever a loadTasks rebuild reaches it.
//
// This is deliberately independent of the WebCat Reg tab — that one holds
// CRNs for *registering for next semester*, not the current schedule.

const SCHEDULE_CACHE_MS = 12 * 60 * 60 * 1000;
const ROW_MINUTES = 30;
const DAY_ORDER = ['M', 'T', 'W', 'R', 'F', 'S', 'U'];
const DAY_LABELS = { M: 'Mon', T: 'Tue', W: 'Wed', R: 'Thu', F: 'Fri', S: 'Sat', U: 'Sun' };
const SEASON_SUFFIX = { 10: 'Fall', 30: 'January', 50: 'Spring', 70: 'Summer' };

// UNH term codes are deterministic from the calendar: <year><season> with
// fall=10, january=30, spring=50, summer=70.
function currentTermCode(now) {
    const m = now.getMonth(); // 0 = January
    const season = m === 0 ? '30' : m <= 4 ? '50' : m <= 7 ? '70' : '10';
    return String(now.getFullYear()) + season;
}

// "202610" -> "Fall 2026"
function termLabel(code) {
    const s = String(code || '');
    const year = s.slice(0, 4);
    const season = SEASON_SUFFIX[s.slice(4)];
    return year && season ? `${season} ${year}` : (s || '');
}

// "MATH 425 (01) - Calculus II" -> "MATH 425" (lowercase-tolerant, honors
// letter kept). '' when the node isn't a course-section title.
function parseCourseCode(title) {
    const m = String(title || '').match(/^([A-Za-z]{2,5}\s*\d{3}[A-Za-z]?)\s*\(\d{2}\)/);
    return m ? m[1].replace(/\s+/g, ' ').toUpperCase() : '';
}

// The courses the user is currently in on Canvas, reduced to their catalog
// codes ("CS 501", "MATH 425-01" -> "MATH 425"). Custom self-made courses and
// hidden ones are skipped; anything without a real course-code pattern is too.
function collectCurrentCourses() {
    const hiddenCourses = getHiddenCourses();
    const map = state.cachedCourseMap || {};
    const codes = [];
    const seen = new Set();
    Object.keys(map).forEach(key => {
        const course = map[key];
        if (course && course.isCustomCourse) return;
        if (hiddenCourses.includes(key)) return;
        const code = normalizeCourseCode(key).replace(/-.*$/, '').trim();
        if (!/^[A-Z]{2,5}\s*\d{3}$/.test(code)) return;
        if (!seen.has(code)) {
            seen.add(code);
            codes.push(code);
        }
    });
    return codes.sort();
}

async function fetchSearchMatches(code, termCode) {
    try {
        const msg = await browser.runtime.sendMessage({ type: 'FETCH_COURSE_SEARCH', query: code, termCode });
        if (!msg || !msg.success) return [];
        return (msg.matches || []).filter(m =>
            String(m.termCode) === termCode && parseCourseCode(m.title) === code);
    } catch (e) {
        return [];
    }
}

async function fetchSection(crn, termCode) {
    try {
        const msg = await browser.runtime.sendMessage({ type: 'FETCH_WEBCAT_CRN', crns: [crn], termCode });
        if (msg && msg.success && Array.isArray(msg.sections) && msg.sections[0]) return msg.sections[0];
    } catch (e) {}
    return null;
}

// Search each current course code and pull meeting details for every section
// in the current term. Runs the per-course searches in parallel; the
// background's course-page cache absorbs repeated CRNs.
async function loadScheduleSections(courseCodes, termCode, force) {
    const cacheKey = `${termCode}|${courseCodes.join(',')}`;
    if (!force) {
        const cached = loadCache();
        if (cached && cached.key === cacheKey && Date.now() - cached.savedAt < SCHEDULE_CACHE_MS) {
            return Array.isArray(cached.sections) ? cached.sections : [];
        }
    }

    const seenCrn = new Set();
    const sections = [];
    await Promise.all(courseCodes.map(async code => {
        const matches = await fetchSearchMatches(code, termCode);
        for (const m of matches) {
            if (seenCrn.has(m.crn)) continue;
            seenCrn.add(m.crn);
            const section = await fetchSection(m.crn, termCode);
            if (!section) continue;
            if (!section.code) section.code = code;
            sections.push(section);
        }
    }));

    // Dedupe "same lecture, many sections" noise: identical code+days+time
    // blocks collapse to one, keeping genuinely different meetings visible.
    const seenBlock = new Set();
    const unique = sections.filter(s => {
        const key = `${normalizeCourseCode(s.code)}|${parseMeetDays(s.days).join('')}|${s.start}|${s.end}`;
        if (seenBlock.has(key)) return false;
        seenBlock.add(key);
        return true;
    });

    saveCache({ key: cacheKey, savedAt: Date.now(), sections: unique });
    return unique;
}

function loadCache() {
    try {
        return JSON.parse(localStorage.getItem(STORAGE_KEY_SCHEDULE_CACHE) || 'null');
    } catch {
        return null;
    }
}

function saveCache(cache) {
    try {
        localStorage.setItem(STORAGE_KEY_SCHEDULE_CACHE, JSON.stringify(cache));
    } catch (e) {}
}

// Deterministic per-course accent from the custom-assignment color presets so
// every course's blocks stay the same color across renders.
function courseColor(courseKey) {
    let hash = 0;
    for (let i = 0; i < courseKey.length; i++) hash = (hash * 31 + courseKey.charCodeAt(i)) | 0;
    const accent = CUSTOM_COLOR_PRESETS[Math.abs(hash) % CUSTOM_COLOR_PRESETS.length];
    const soft = parseColorToRgba(accent, 0.18) || 'rgba(10, 132, 255, 0.18)';
    const glow = parseColorToRgba(accent, 0.5) || 'rgba(10, 132, 255, 0.5)';
    return { accent, soft, glow };
}

// "540" -> "9:00" (labels only — AM/PM is redundant next to a time axis)
function timeLabel(minutes) {
    let h = Math.floor(minutes / 60);
    const m = minutes % 60;
    h = h % 12;
    if (h === 0) h = 12;
    return `${h}:${String(m).padStart(2, '0')}`;
}

// Flattens sections into positioned blocks and derives the grid bounds
// (day columns present, first/last meeting minute, row count).
function buildGridData(sections, hiddenCourses) {
    const blocks = [];
    const daySet = new Set();
    let minStart = 8 * 60;
    let maxEnd = 20 * 60;
    (sections || []).forEach(s => {
        if (s.error) return;
        const days = parseMeetDays(s.days);
        const start = toMinutes(s.start);
        const end = toMinutes(s.end);
        if (!days.length || start === null || end === null || start >= end) return;
        const key = normalizeCourseCode(s.code);
        if (key && hiddenCourses.includes(key)) return;
        days.forEach(d => daySet.add(d));
        minStart = Math.min(minStart, start);
        maxEnd = Math.max(maxEnd, end);
        blocks.push({ section: s, days, start, end });
    });
    minStart = Math.floor(minStart / ROW_MINUTES) * ROW_MINUTES;
    if (maxEnd - minStart > 16 * 60) maxEnd = minStart + 16 * 60; // sanity cap
    const duration = Math.max(maxEnd - minStart, 60);
    const dayList = DAY_ORDER.filter(d => daySet.has(d));
    const rows = Math.max(Math.round(duration / ROW_MINUTES), 8);
    return {
        blocks,
        days: dayList.length ? dayList : ['M', 'T', 'W', 'R', 'F'],
        minStart,
        duration,
        rows,
    };
}

function renderScheduleGrid(container, sections, courseCount, termCode) {
    const hiddenCourses = getHiddenCourses();
    const conflicts = computeTimeConflicts(sections);
    const valid = (sections || []).filter(s => !s.error);
    const withTimes = valid.filter(s => {
        const start = toMinutes(s.start);
        const end = toMinutes(s.end);
        return parseMeetDays(s.days).length && start !== null && end !== null && start < end;
    });
    const noMeetingTime = valid.filter(s => !withTimes.includes(s));
    const errors = (sections || []).filter(s => s.error);
    const { blocks, days, minStart, duration, rows } = buildGridData(sections, hiddenCourses);

    const termHtml = `<span class="sched-term">${escapeHTML(termLabel(termCode))}</span>`;
    const countLabel = `<span class="sched-crns">${courseCount} course${courseCount === 1 ? '' : 's'}</span>`;
    const topbar = `<div class="sched-topbar">${termHtml}${countLabel}<button type="button" class="sched-refresh-btn">↻ Refresh</button></div>`;
    const conflictHtml = conflicts.length ? `
        <div class="sched-conflict-warn">⚠ ${conflicts.length} time conflict${conflicts.length === 1 ? '' : 's'} between your classes</div>` : '';

    const nonAttendHtml = noMeetingTime.length ? `
        <div class="sched-nonattend"><span class="sched-na-title">No set meeting time</span>
        ${noMeetingTime.map(s => `<span class="sched-na-chip">${escapeHTML(s.code || ('CRN ' + s.crn))} · ${escapeHTML(scheduleLabel(s, { online: /online/i.test(s.title || '') }))}</span>`).join('')}
        </div>` : '';

    const errorHtml = errors.length ? `
        <div class="sched-nonattend sched-errors">${errors.map(s => `<span class="sched-na-chip sched-error-chip">CRN ${escapeHTML(s.crn)} — ${escapeHTML(s.error)}</span>`).join('')}</div>` : '';

    if (!blocks.length) {
        container.innerHTML = topbar + conflictHtml + `
        <div class="sched-empty">No published class times found for your current courses in ${escapeHTML(termLabel(termCode))} — sections may be online, TBA, or not yet published on courses.unh.edu.</div>` + nonAttendHtml + errorHtml;
    } else {
        const dayCount = days.length;
        const headerCells = ['<div class="sched-corner">Time</div>'];
        days.forEach(d => headerCells.push(`<div class="sched-dayhead">${DAY_LABELS[d]}</div>`));
        let timeRows = '';
        for (let r = 0; r < rows; r++) {
            timeRows += `<div class="sched-timelabel">${timeLabel(minStart + r * ROW_MINUTES)}</div>`;
        }
        const dayCells = days.map((d, idx) => {
            const col = idx + 2;
            const cellBlocks = blocks.filter(b => b.days.includes(d)).map(b => {
                const top = ((b.start - minStart) / duration) * 100;
                const height = ((b.end - b.start) / duration) * 100;
                const color = courseColor(normalizeCourseCode(b.section.code) || b.section.crn);
                const place = [b.section.building, b.section.room].filter(Boolean).join(' ');
                const bits = [`${formatTime(b.section.start)}–${formatTime(b.section.end)}`, place].filter(Boolean).join(' · ');
                const meta = height > 13 ? `<span class="sched-block-meta">${escapeHTML(bits)}</span>` : '';
                return `
                <div class="sched-block" style="top:${top}%;height:${height}%;--sched-accent:${color.accent};--sched-soft:${color.soft};--sched-glow:${color.glow};" title="${escapeHTML(b.section.code || ('CRN ' + b.section.crn))} — ${escapeHTML(b.section.title || '')}">
                    <span class="sched-block-code">${escapeHTML(b.section.code || ('CRN ' + b.section.crn))}</span>
                    <span class="sched-block-title">${escapeHTML(b.section.title || '')}</span>
                    ${meta}
                </div>`;
            }).join('');
            return `<div class="sched-day" style="grid-column:${col};grid-row:2 / span ${rows};">${cellBlocks}</div>`;
        }).join('');

        container.innerHTML = topbar + conflictHtml +
            `<div class="sched-grid" style="--sched-cols:${dayCount};">${headerCells.join('')}${timeRows}${dayCells}</div>` +
            nonAttendHtml + errorHtml;
    }

    const refresh = container.querySelector('.sched-refresh-btn');
    if (refresh) refresh.addEventListener('click', () => renderScheduleView(container, true));
}

export async function renderScheduleView(container, force = false) {
    container.innerHTML = `<div class="sched-empty"><span class="sched-loading">Loading your schedule…</span></div>`;

    const termCode = currentTermCode(new Date());
    const courseCodes = collectCurrentCourses();

    if (!courseCodes.length) {
        container.innerHTML = `
        <div class="sched-empty">
            <div class="sched-empty-title">No schedule yet</div>
            <p>The schedule is built from the courses you're currently in on Canvas. No catalog-code courses were found.</p>
        </div>`;
        return;
    }

    const sections = await loadScheduleSections(courseCodes, termCode, force);
    if (sections && sections.error) {
        container.innerHTML = `
        <div class="sched-empty">
            <div class="sched-empty-title">Couldn't load your schedule</div>
            <p>${escapeHTML(sections.error)}</p>
            <button type="button" class="sched-refresh-btn">↻ Retry</button>
        </div>`;
        const retry = container.querySelector('.sched-refresh-btn');
        if (retry) retry.addEventListener('click', () => renderScheduleView(container, true));
        return;
    }

    renderScheduleGrid(container, sections, courseCodes.length, termCode);
}