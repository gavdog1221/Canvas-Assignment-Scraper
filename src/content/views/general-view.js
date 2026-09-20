import { state } from '../state.js';
import { getCourseColors } from '../utils/colors.js';
import { escapeHTML } from '../utils/text.js';
import { gradeTierClass, formatScoreNum, computeCoursePercentagesWithWhatIf } from '../utils/grades.js';
import { openPdfModal } from '../components/pdf-modal.js';
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

export function renderGeneralView(listContainer, hiddenCourses) {
  listContainer.innerHTML = '';

  let courseKeys = Object.keys(state.cachedCourseMap).filter(k => !hiddenCourses.includes(k));

  if (state.activeCourseFilter !== 'ALL') {
    courseKeys = courseKeys.filter(k => k === state.activeCourseFilter);
  }
  if (state.searchQuery) {
    courseKeys = courseKeys.filter(k => {
      const c = state.cachedCourseMap[k];
      return k.toLowerCase().includes(state.searchQuery) || (c.name || '').toLowerCase().includes(state.searchQuery);
    });
  }

  // Only courses we actually have a Canvas id (and therefore real
  // resource links) for — custom/manual tasks-only "courses" don't apply.
  courseKeys = courseKeys.filter(k => state.cachedCourseMap[k] && state.cachedCourseMap[k].canvasCourseId);
  courseKeys.sort((a, b) => (state.cachedCourseMap[a].name || a).localeCompare(state.cachedCourseMap[b].name || b));

  if (courseKeys.length === 0) {
    listContainer.innerHTML = state.searchQuery
    ? `<div class="mod-empty-msg">No classes match "${escapeHTML(state.searchQuery)}"</div>`
    : '<div class="mod-empty-msg">📚 No active classes found this term.</div>';
    return;
  }

  const gradePercents = computeCoursePercentagesWithWhatIf(hiddenCourses);

  // "Office hours today" strip: aggregates every course whose parsed syllabus
  // office hours include the current weekday (getDay(): 0 = Sunday).
  const todayDay = new Date().getDay();
  const todayBlocks = [];
  courseKeys.forEach(key => {
    const res = state.cachedCourseMap[key].resources || {};
    const oh = Array.isArray(res.officeHours) ? res.officeHours : [];
    oh.forEach(b => {
      if (Array.isArray(b.dayIndexes) && b.dayIndexes.includes(todayDay)) {
        todayBlocks.push({ key, name: state.cachedCourseMap[key].name, display: b.display });
      }
    });
  });
  if (todayBlocks.length > 0) {
    const strip = document.createElement('div');
    strip.className = 'gci-today-strip';
    strip.innerHTML = `
    <span class="gci-today-title">🕐 Office hours today</span>
    <div class="gci-today-items">
    ${todayBlocks.map(b => `<span class="gci-today-item"><b>${escapeHTML(b.key)}</b> — ${escapeHTML(b.display)}</span>`).join('')}
    </div>`;
    listContainer.appendChild(strip);
  }

  courseKeys.forEach(key => {
    const course = state.cachedCourseMap[key];
    const res = course.resources || {};
    const coursePalette = getCourseColors(key, course.canvasCourseId);

    const professors = Array.isArray(res.professors) ? res.professors : [];
    const primaryInstructor = professors[0] || '';
    let cachedTeacher = null;
    let rmpStatus = 'none';
    if (primaryInstructor) {
      cachedTeacher = peekBestTeacher(primaryInstructor);
      rmpStatus = cachedTeacher ? 'ok' : 'loading';
    }

    const pct = gradePercents[key];
    const tier = gradeTierClass(pct);

    const card = document.createElement('div');
    card.className = `mod-task-card general-resource-card ${tier}`;
    card.style.setProperty('--task-course-accent', coursePalette.accent);
    card.style.setProperty('--task-course-glow', coursePalette.glow);
    card.style.setProperty('--task-course-soft', coursePalette.soft);

    const syllabusTitle = res.hasSyllabusContent ? 'Open full syllabus' : 'Syllabus looks empty on Canvas, but check anyway';

    // Optional per-course extras from the parsed syllabus: office-hours line
    // and the detected grade-weight breakdown.
    const officeHoursLine = Array.isArray(res.officeHours) && res.officeHours.length > 0
    ? res.officeHours.map(b => b.display).join(' · ')
    : '';
    const gradeWeightsRow = Array.isArray(res.gradeWeights) && res.gradeWeights.length > 0
    ? res.gradeWeights.map(w => `<span class="gci-weight-chip">${escapeHTML(w.label)} ${w.pct}%</span>`).join('')
    : '';

    card.innerHTML = `
      <div class="task-body">
        <div class="task-title-row">
          <span class="course-tag-chip">${escapeHTML(key)}</span>
          <a class="mod-task-title general-course-name" href="${res.homeUrl || '#'}" target="_blank" rel="noopener noreferrer" title="Open ${escapeHTML(course.name || key)} on Canvas">${escapeHTML(course.name || key)}</a>
          <span class="gci-badge ${tier}">${pct !== null ? formatScoreNum(pct) + '%' : 'No grade'}</span>
        </div>

        <div class="resource-links-row">
          <button type="button" class="resource-link-pill gci-open-btn ${res.hasSyllabusContent ? '' : 'is-empty'}" data-preview-url="${escapeHTML(res.syllabusPdfUrl || res.syllabusUrl || '')}" data-preview-title="Syllabus" title="${escapeHTML(syllabusTitle)}">📄 Syllabus</button>
          <button type="button" class="resource-link-pill gci-open-btn" data-preview-url="${escapeHTML(res.modulesUrl || '')}" data-preview-title="Modules" title="Preview the Modules page">🗂 Modules</button>
          <button type="button" class="resource-link-pill gci-open-btn" data-preview-url="${escapeHTML(res.filesUrl || '')}" data-preview-title="Files" title="Preview the Files page">📁 Files</button>
          <button type="button" class="resource-link-pill gci-open-btn" data-preview-url="${escapeHTML(res.gradesUrl || '')}" data-preview-title="Grades" title="Preview the Grades page">📊 Grades</button>
          <button type="button" class="resource-link-pill gci-open-btn" data-preview-url="${escapeHTML(res.homeUrl || '')}" data-preview-title="Home" title="Preview the course home page">🏠 Home</button>
        </div>

        ${officeHoursLine ? `<div class="gci-office-hours">🕐 ${escapeHTML(officeHoursLine)}</div>` : ''}
        ${gradeWeightsRow ? `<div class="gci-weights-row">${gradeWeightsRow}</div>` : ''}

        <div class="rmp-panel" data-course-key="${escapeHTML(key)}" data-instructors="${escapeHTML(professors.join(','))}">
          ${buildRmpPanelHtml(primaryInstructor, cachedTeacher, rmpStatus)}
        </div>
      </div>
      `;

    listContainer.appendChild(card);

    card.querySelectorAll('.gci-open-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const url = btn.getAttribute('data-preview-url');
        if (url && url !== '#') {
          openPdfModal(url, `${btn.getAttribute('data-preview-title')} — ${course.name || key}`);
        }
      });
    });

    if (primaryInstructor && !cachedTeacher) {
      loadRmpPanel(card.querySelector('.rmp-panel'));
    }
  });
}
