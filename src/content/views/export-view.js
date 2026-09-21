import { state } from '../state.js';
import { getCompletedTasks } from '../storage/completed-tasks.js';
import { effectiveDueDate } from '../storage/custom-due-dates.js';
import { escapeHTML } from '../utils/text.js';

// Campus & Tools "Export" tab — download the widget's assignments (with custom
// due dates applied) as an .ics file importable into Google Calendar, Apple
// Calendar, Outlook, etc. Deadlines without a due date can't go on a calendar
// and are reported as skipped rather than silently dropped.

export function renderExportView(container) {
    if (!container) return;
    const summary = summarize();
    const anyDated = summary.dated > 0;

    container.innerHTML = `
    <div class="exp-view-header">
    <span class="exp-title">📅 Export Calendar (.ics)</span>
    <span class="exp-sub">Download your assignments as a calendar file — import it into Google Calendar, Apple Calendar or Outlook. Custom due dates you set in the widget are honored.</span>
    </div>
    <div class="exp-tab-scroll">
    <div class="exp-card">
    <div class="exp-stats" id="exp-stats">${renderStats(false, summary)}</div>
    <label class="exp-check">
    <input type="checkbox" id="exp-include-completed">
    <span>Include completed assignments</span>
    </label>
    <button type="button" class="exp-download" id="exp-download-btn" ${anyDated ? '' : 'disabled'}>⬇ Download .ics</button>
    <div class="exp-note">
    ${anyDated
      ? `The file will contain the deadlines above, sorted by due date.`
      : `No dated assignments are loaded yet — the widget needs a fresh Canvas scrape first (reload the page).`}
    </div>
    ${summary.skipped.length ? `<div class="exp-skip">Skipped ${summary.skipped.length} assignment${summary.skipped.length === 1 ? '' : 's'} with no due date: ${escapeHTML(summary.skipped.slice(0, 4).map(t => t.title).join(', '))}${summary.skipped.length > 4 ? `, +${summary.skipped.length - 4} more` : ''}.</div>` : ''}
    </div>
    </div>
    `;

    const btn = container.querySelector('#exp-download-btn');
    if (btn) {
      btn.addEventListener('click', () => {
        const includeCompleted = (container.querySelector('#exp-include-completed') || {}).checked;
        downloadIcs(buildEvents(includeCompleted));
      });
    }
    const check = container.querySelector('#exp-include-completed');
    if (check) {
      check.addEventListener('change', () => {
        const stats = container.querySelector('#exp-stats');
        if (stats) stats.innerHTML = renderStats(check.checked, summary);
      });
    }
  }

// Task collection helpers -----------------------------------------------------
function allTasks() {
    const out = [];
    Object.entries(state.cachedCourseMap || {}).forEach(([courseKey, course]) => {
      (course.tasks || []).forEach(t => {
        out.push({
          courseKey,
          courseName: (course && course.name) || courseKey,
          title: t.title || '(Untitled assignment)',
          url: t.url || '',
          id: t.id,
          dueDate: effectiveDueDate(t),
        });
      });
    });
    return out;
  }

function summarize() {
    const completedMap = getCompletedTasks();
    const tasks = allTasks();
    const dated = tasks.filter(t => t.dueDate);
    return {
      dated: dated.length,
      completed: dated.filter(t => completedMap[t.id]).length,
      skipped: tasks.filter(t => !t.dueDate),
    };
  }

function renderStats(includeCompleted, s) {
    if (includeCompleted) {
      return `<span class="exp-stat">${s.dated} deadline${s.dated === 1 ? '' : 's'} going in (includes ${s.completed} completed)</span>`;
    }
    const upcoming = s.dated - s.completed;
    return `<span class="exp-stat">${upcoming} upcoming deadline${upcoming === 1 ? '' : 's'} going in${s.completed ? ` · ${s.completed} completed excluded` : ''}</span>`;
  }

function buildEvents(includeCompleted) {
    const completedMap = getCompletedTasks();
    return allTasks()
      .filter(t => t.dueDate && (includeCompleted || !completedMap[t.id]))
      .sort((a, b) => a.dueDate - b.dueDate);
  }

// .ics generation -------------------------------------------------------------
function pad(n) { return String(n).padStart(2, '0'); }

function icsDateTime(d) {
    return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
  }

function icsDate(d) {
    return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
  }

function icsEscape(text) {
    return String(text)
      .replace(/\\/g, '\\\\')
      .replace(/;/g, '\\;')
      .replace(/,/g, '\\,')
      .replace(/\r?\n/g, '\\n');
  }

// A small stable digest so re-exporting the same task yields the same UID and
// re-imports don't duplicate calendar entries.
function hashString(input) {
    let h = 5381;
    for (let i = 0; i < input.length; i++) h = ((h << 5) + h + input.charCodeAt(i)) >>> 0;
    return h.toString(16).padStart(8, '0');
  }

function buildIcs(events) {
    const now = new Date();
    const lines = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//YACE//Canvas Assignments//EN',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      'X-WR-CALNAME:Canvas Assignments (YACE)',
    ];
    events.forEach(ev => {
      const isAllDay = ev.dueDate.getHours() === 0 && ev.dueDate.getMinutes() === 0 && ev.dueDate.getSeconds() === 0;
      const uid = `yace-${hashString(`${ev.courseKey}::${ev.title}::${ev.dueDate.getTime()}`)}@canvas-assignments.local`;
      const summary = ev.courseName ? `[${ev.courseName}] ${ev.title}` : ev.title;
      lines.push('BEGIN:VEVENT');
      lines.push(`UID:${uid}`);
      lines.push(`DTSTAMP:${icsDateTime(now)}Z`);
      lines.push(isAllDay
        ? `DTSTART;VALUE=DATE:${icsDate(ev.dueDate)}`
        : `DTSTART:${icsDateTime(ev.dueDate)}`);
      lines.push(`SUMMARY:${icsEscape(summary)}`);
      if (ev.url) {
        lines.push(`URL:${ev.url}`);
        lines.push(`DESCRIPTION:${icsEscape(`Open in Canvas: ${ev.url}`)}`);
      }
      lines.push('END:VEVENT');
    });
    lines.push('END:VCALENDAR');
    return lines.join('\r\n') + '\r\n';
  }

function downloadIcs(events) {
    const ics = buildIcs(events);
    const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const d = new Date();
    a.href = url;
    a.download = `canvas-assignments-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}.ics`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }