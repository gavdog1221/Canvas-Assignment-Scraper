// Rate My Professor tab inside the Campus & Tools drawer (the same overlay
// that hosts Food + WebCat Reg). The RMP panels used to live inside each
// Info-tab course card; they now get a dedicated, roomier surface here so
// the Info panel can focus on course links/syllabus/office-hours/weights.
//
// Everything below the header note is the original per-course panel logic
// moved verbatim from general-view.js: instructor names come from parsed
// syllabi, ratings from the RMP GraphQL API via background.js, and the
// extension is UNH-scoped (RMP legacyId 1231).

import { state } from '../state.js';
import { escapeHTML } from '../utils/text.js';
import { peekBestTeacher, professorProfileUrl, RMP_SCHOOL_PAGE_URL, resolveBestTeacher } from '../services/rmp-api.js';

function rmpScoreClass(value) {
  if (value == null) return '';
  return value >= 4 ? 'is-good' : value >= 3 ? 'is-mid' : 'is-bad';
}

function rmpLoadingHtml(professorName) {
  return `
    <div class="rmp-loading">
      <span class="rmp-loading-tile"></span>
      <span class="rmp-loading-lines">
        <span class="rmp-loading-line" style="width: 62%"></span>
        <span class="rmp-loading-line" style="width: 88%"></span>
        <span class="rmp-loading-line" style="width: 42%"></span>
      </span>
    </div>
    <p class="rmp-panel-note">Looking up ${escapeHTML(professorName)} on Rate My Professor…</p>`;
}

function rmpRatedHtml(teacher) {
  const rating = teacher.avgRatingRounded != null ? teacher.avgRatingRounded.toFixed(1) : null;
  const difficulty = teacher.avgDifficultyRounded != null ? teacher.avgDifficultyRounded.toFixed(1) : null;
  const scoreValue = rating ? parseFloat(rating) : null;
  const wouldAgain = (teacher.wouldTakeAgainPercentRounded != null && teacher.wouldTakeAgainPercentRounded >= 0)
    ? `${Math.round(teacher.wouldTakeAgainPercentRounded)}%` : null;
  const name = `${teacher.firstName} ${teacher.lastName}`;
  const nameHtml = escapeHTML(name);
  const meta = [
    teacher.department ? escapeHTML(teacher.department) : null,
    teacher.numRatings ? `${teacher.numRatings} rating${teacher.numRatings === 1 ? '' : 's'}` : null,
  ].filter(Boolean).join(' · ');
  const tags = (Array.isArray(teacher.teacherRatingTags) ? teacher.teacherRatingTags : [])
    .filter(t => t && t.tagName)
    .slice(0, 4)
    .map(t => `<span class="rmp-tag">${escapeHTML(t.tagName)}</span>`)
    .join('');
  const profileUrl = professorProfileUrl(teacher);
  return `
    <div class="rmp-head">
      <span class="rmp-score-big ${scoreValue != null ? rmpScoreClass(scoreValue) : 'is-none'}">${rating || '—'}</span>
      <span class="rmp-prof">
        <span class="rmp-prof-name" title="${nameHtml}">${nameHtml}</span>
        <span class="rmp-prof-meta">${meta || 'University of New Hampshire'}</span>
      </span>
    </div>
    <div class="rmp-line">
      <span class="rmp-line-label">Difficulty</span>
      <span class="rmp-bar"><span class="rmp-bar-fill" style="width: ${difficulty ? Math.max(0, Math.min(100, parseFloat(difficulty) * 20)) : 0}%"></span></span>
      <span class="rmp-line-value">${difficulty ? `${difficulty}/5` : '—'}</span>
    </div>
    ${wouldAgain ? `<div class="rmp-line"><span class="rmp-line-label">Would take again</span><span class="rmp-line-value">${wouldAgain}</span></div>` : ''}
    ${tags ? `<div class="rmp-tags">${tags}</div>` : ''}
    <div class="rmp-links">
      ${profileUrl ? `<a class="rmp-link" href="${profileUrl}" target="_blank" rel="noopener noreferrer">Open profile ↗</a>` : ''}
      <a class="rmp-link" href="${RMP_SCHOOL_PAGE_URL}" target="_blank" rel="noopener noreferrer">UNH on RMP</a>
    </div>`;
}

function rmpMissingHtml(name, zeroRatings) {
  const nameHtml = escapeHTML(name);
  return `
    <div class="rmp-head rmp-head-missing">
      <span class="rmp-score-big is-none">?</span>
      <span class="rmp-prof">
        <span class="rmp-prof-name" title="${nameHtml}">${nameHtml}</span>
        <span class="rmp-prof-meta">${zeroRatings ? 'No ratings yet at UNH' : 'No rate-my-professor page found'}</span>
      </span>
    </div>
    <p class="rmp-panel-note">${zeroRatings
      ? 'This instructor has no ratings on Rate My Professor yet. Check back, or browse the UNH school page.'
      : "Couldn't locate this instructor on Rate My Professor. Browse the UNH school page instead."}</p>
    <div class="rmp-links">
      <a class="rmp-link" href="${RMP_SCHOOL_PAGE_URL}" target="_blank" rel="noopener noreferrer">UNH on RMP ↗</a>
    </div>`;
}

function buildRmpPanelHtml(professorName, teacher, status) {
  const title = `<div class="rmp-panel-header"><span class="rmp-panel-title">🎓 Rate My Professor</span><span class="rmp-panel-badge">UNH</span></div>`;
  let body;
  if (status === 'loading') body = rmpLoadingHtml(professorName || '…');
  else if (teacher && teacher.firstName && teacher.lastName) {
    body = teacher.numRatings > 0
      ? rmpRatedHtml(teacher)
      : rmpMissingHtml(`${teacher.firstName} ${teacher.lastName}`, true);
  } else {
    body = rmpMissingHtml(professorName || 'No instructor found', false);
  }
  return title + body;
}

async function loadRmpPanel(panel) {
  if (!panel) return;
  const instructors = (panel.getAttribute('data-instructors') || '').split(',').map(s => s.trim()).filter(Boolean);
  if (!instructors.length) return;
  const primary = instructors[0];
  for (const name of instructors) {
    const teacher = await resolveBestTeacher(name);
    if (teacher) {
      panel.innerHTML = buildRmpPanelHtml(primary, teacher, 'ok');
      return;
    }
  }
  panel.innerHTML = buildRmpPanelHtml(primary, null, 'none');
}

// Lists every visible course with at least one parsed instructor, one RMP
// panel per course (same data-instructors fallback chain as the old Info
// cards), newest cache hits render instantly and misses resolve async.
export function renderRmpView(listContainer, hiddenCourses) {
  listContainer.innerHTML = '';

  const courses = Object.entries(state.cachedCourseMap)
    .filter(([key, c]) => !hiddenCourses.includes(key) && c && c.canvasCourseId)
    .map(([key, c]) => ({
      key: key,
      name: c.name || key,
      professors: (c.resources && Array.isArray(c.resources.professors)) ? c.resources.professors : [],
    }))
    .filter(c => c.professors.length > 0)
    .sort((a, b) => a.name.localeCompare(b.name));

  // Scroll region — the shared .campus-tools-body must stay overflow:visible
  // for the dining plate/pie overlays, so the RMP list scrolls in its own
  // flexed container instead.
  const scroll = document.createElement('div');
  scroll.className = 'rmp-tab-scroll';
  listContainer.appendChild(scroll);

  if (courses.length === 0) {
    scroll.innerHTML = '<div class="mod-empty-msg">No professors found this term.</div>';
    return;
  }

  const header = document.createElement('div');
  header.className = 'rmp-view-header';
  header.innerHTML = `
    <div class="rmp-panel-header"><span class="rmp-panel-title">🎓 Rate My Professor</span><span class="rmp-panel-badge">UNH</span></div>
    <p class="rmp-view-note">Ratings for your ${courses.length} course${courses.length === 1 ? '' : 's'} · instructor names parsed from Canvas syllabi.</p>
  `;
  scroll.appendChild(header);

  courses.forEach(({ key, professors }) => {
    const primary = professors[0] || '';
    const cached = primary ? peekBestTeacher(primary) : null;
    const status = cached ? 'ok' : (primary ? 'loading' : 'none');

    const block = document.createElement('div');
    block.className = 'rmp-course-block';
    block.innerHTML = `
    <div class="rmp-course-tag">${escapeHTML(key)}</div>
    <div class="rmp-panel" data-course-key="${escapeHTML(key)}" data-instructors="${escapeHTML(professors.join(','))}">
    ${buildRmpPanelHtml(primary, cached, status)}
    </div>
    `;
    scroll.appendChild(block);

    if (primary && !cached) loadRmpPanel(block.querySelector('.rmp-panel'));
  });
}