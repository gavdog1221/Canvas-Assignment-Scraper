import { state } from '../state.js';
import { STORAGE_KEY_SEEN_ANNOUNCEMENTS } from '../constants.js';
import { getCourseColors } from '../utils/colors.js';
import { escapeHTML } from '../utils/text.js';
import { getHiddenCourses } from '../storage/hidden-courses.js';
import { applyCourseFilter } from '../views/upcoming-view.js';
import { openCanvasViewer } from '../components/canvas-viewer.js';

export function getSeenAnnouncements() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY_SEEN_ANNOUNCEMENTS) || '{}');
    } catch { return {}; }
  }

export function markAnnouncementsSeen() {
    const seen = getSeenAnnouncements();
    (state.cachedAnnouncements || []).forEach(a => { seen[a.id] = true; });
    localStorage.setItem(STORAGE_KEY_SEEN_ANNOUNCEMENTS, JSON.stringify(seen));
  }

export function updateAnnouncementBadge() {
    const badge = document.getElementById('announce-badge');
    if (!badge) return;
    const seen = getSeenAnnouncements();
    const unseenCount = (state.cachedAnnouncements || []).filter(a => !seen[a.id]).length;
    const total = unseenCount + (state.cachedUnreadInboxCount || 0);

    if (total > 0) {
      badge.style.display = 'inline-flex';
      badge.innerText = total > 9 ? '9+' : String(total);
      badge.title = `${unseenCount} new announcement${unseenCount === 1 ? '' : 's'}, ${state.cachedUnreadInboxCount} unread inbox message${state.cachedUnreadInboxCount === 1 ? '' : 's'}`;
    } else {
      badge.style.display = 'none';
    }
  }

// Targeted re-render after a background announcements refresh — touches only
// the News dashboard panel and the announcements tab (if active), never the
// whole grid, so scroll/what-if state in the other panels is preserved.
export function refreshAnnouncementsPanels() {
    const hiddenCourses = getHiddenCourses();
    const newsBody = document.querySelector('#module-tasks-list .fullscreen-panel.news-panel .fullscreen-panel-body');
    console.info('[YACE] announcements panels: news found =', !!newsBody,
      '| tab =', state.currentTab, '| fullscreen =', state.isFullscreen,
      '| cached =', (state.cachedAnnouncements || []).length);
    if (newsBody) renderAnnouncementsView(newsBody, hiddenCourses);
    if (state.currentTab === 'announcements' && !state.isFullscreen) {
      const list = document.getElementById('module-tasks-list');
      if (list) renderAnnouncementsView(list, hiddenCourses);
    }
    updateAnnouncementBadge();
  }

export function renderAnnouncementsView(listContainer, hiddenCourses) {
    listContainer.innerHTML = '';

    let items = (state.cachedAnnouncements || []).filter(a => !hiddenCourses.includes(a.courseKey));

    if (state.activeCourseFilter !== 'ALL') {
      items = items.filter(a => a.courseKey === state.activeCourseFilter);
    }
    if (state.searchQuery) {
      items = items.filter(a =>
      a.title.toLowerCase().includes(state.searchQuery) ||
      (a.message || '').toLowerCase().includes(state.searchQuery)
      );
    }

    if (items.length === 0) {
      listContainer.innerHTML = state.searchQuery
      ? `<div class="mod-empty-msg">No announcements match "${escapeHTML(state.searchQuery)}"</div>`
      : '<div class="mod-empty-msg">📭 No recent announcements.</div>';
      return;
    }

    const seen = getSeenAnnouncements();
    const now = Date.now();

    items.forEach(item => {
      const card = document.createElement('div');
      const isUnseen = !seen[item.id];
      const isFresh = !!item.postedAt && (now - item.postedAt.getTime()) < 48 * 60 * 60 * 1000;

      const coursePalette = getCourseColors(item.courseKey, item.canvasCourseId);
      card.style.setProperty('--task-course-accent', coursePalette.accent);
      card.style.setProperty('--task-course-glow', coursePalette.glow);
      card.style.setProperty('--task-course-soft', coursePalette.soft);

      card.className = `announcement-card ${isFresh ? 'announcement-fresh' : ''} ${isUnseen ? 'announcement-unseen' : ''}`;

      const dateStr = item.postedAt
      ? item.postedAt.toLocaleDateString([], { month: 'short', day: 'numeric' })
      : '';
      const rawMsg = item.message || '';
      const isLong = rawMsg.length > 140;
      const snippet = isLong ? `${rawMsg.slice(0, 140)}…` : rawMsg;

      card.innerHTML = `
      <div class="announcement-top-row">
      <span class="course-tag-chip">${escapeHTML(item.courseKey)}</span>
      ${isFresh ? '<span class="badge-tag announce-new-pill"><span class="pulsing-dot"></span>NEW</span>' : ''}
      <span class="announcement-date">${escapeHTML(dateStr)}</span>
      </div>
      <a class="announcement-title" href="${item.url || '#'}" target="_blank" rel="noopener noreferrer" ${item.canvasCourseId && /discussion_topics\/\d+/.test(item.url || '') ? 'data-canvas-open="announcement"' : ''}>${escapeHTML(item.title)}</a>
      ${snippet ? `<div class="announcement-snippet">${escapeHTML(snippet)}</div>` : ''}
      ${isLong ? `
        <div class="announcement-full-msg">${escapeHTML(rawMsg)}</div>
        <button type="button" class="announcement-expand-btn" title="Read full announcement">▼</button>
        ` : ''}
        `;

        if (isLong) {
          const expandBtn = card.querySelector('.announcement-expand-btn');
          expandBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const isExpanded = card.classList.toggle('is-expanded');
            expandBtn.innerText = isExpanded ? '▲' : '▼';
            expandBtn.title = isExpanded ? 'Show less' : 'Read full announcement';
          });
        }

        listContainer.appendChild(card);

        // Announcement titles open the in-app YACE viewer (plain href kept for
        // middle-click so the Canvas page is still one gesture away).
        const annLink = card.querySelector('.announcement-title[data-canvas-open]');
        if (annLink && item.canvasCourseId) {
          const topicMatch = (item.url || '').match(/discussion_topics\/(\d+)/);
          if (topicMatch) {
            annLink.addEventListener('click', (e) => {
              e.preventDefault();
              e.stopPropagation();
              openCanvasViewer({
                kind: 'announcement',
                courseId: item.canvasCourseId,
                topicId: topicMatch[1],
                courseKey: item.courseKey,
                courseName: item.courseName,
                title: item.title,
                url: item.url
              });
            });
          }
        }

        // Clicking the course chip applies the course filter to the whole
        // dashboard (clicking the already-filtered class clears it).
        const chip = card.querySelector('.course-tag-chip');
        if (chip) {
          chip.title = state.activeCourseFilter === item.courseKey
          ? 'Showing only this class — click to clear'
          : 'Show only this class';
          chip.addEventListener('click', (e) => {
            e.stopPropagation();
            applyCourseFilter(item.courseKey);
          });
        }
    });
  }
