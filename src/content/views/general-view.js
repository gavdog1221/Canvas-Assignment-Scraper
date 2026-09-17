import { state } from '../state.js';
import { getCourseColors } from '../utils/colors.js';
import { escapeHTML } from '../utils/text.js';

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

    courseKeys.forEach(key => {
      const course = state.cachedCourseMap[key];
      const res = course.resources || {};
      const coursePalette = getCourseColors(key, course.canvasCourseId);

      const card = document.createElement('div');
      card.className = 'mod-task-card general-resource-card';
      card.style.setProperty('--task-course-accent', coursePalette.accent);
      card.style.setProperty('--task-course-glow', coursePalette.glow);
      card.style.setProperty('--task-course-soft', coursePalette.soft);

      const syllabusTitle = res.hasSyllabusContent ? 'Open Syllabus' : 'Open Syllabus (looks empty on Canvas, but check anyway)';

      card.innerHTML = `
      <div class="task-body">
        <div class="task-title-row">
          <span class="course-tag-chip">${escapeHTML(key)}</span>
          <span class="mod-task-title general-course-name" title="${escapeHTML(course.name || key)}">${escapeHTML(course.name || key)}</span>
        </div>
        <div class="resource-links-row">
          <a href="${res.syllabusUrl || '#'}" target="_blank" rel="noopener noreferrer" class="resource-link-pill ${res.hasSyllabusContent ? '' : 'is-empty'}" title="${escapeHTML(syllabusTitle)}">📄 Syllabus</a>
          <a href="${res.modulesUrl || '#'}" target="_blank" rel="noopener noreferrer" class="resource-link-pill" title="Course Modules">🗂 Modules</a>
          <a href="${res.filesUrl || '#'}" target="_blank" rel="noopener noreferrer" class="resource-link-pill" title="Course Files">📁 Files</a>
          <a href="${res.gradesUrl || '#'}" target="_blank" rel="noopener noreferrer" class="resource-link-pill" title="Course Grades">📊 Grades</a>
          <a href="${res.homeUrl || '#'}" target="_blank" rel="noopener noreferrer" class="resource-link-pill" title="Course Home">🏠 Home</a>
        </div>
      </div>
      `;

      listContainer.appendChild(card);
    });
  }
