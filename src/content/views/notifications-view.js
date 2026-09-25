import { escapeHTML } from '../utils/text.js';
import {
  getNotificationHistory, markNotificationsRead, clearNotificationHistory,
  unreadNotificationCount
} from '../storage/notification-history.js';

// 🔔 Bell "Alerts" panel (hosted as a tab in the Campus & Tools modal): a
// persistent, scrollable record of the notifications the transient what's-new
// banner toasts. Opening the panel counts as reading everything, which clears
// the bell badge.

const KIND_META = {
    assignment: { icon: '📚', label: 'New assignment' },
    grade: { icon: '📈', label: 'Grade update' },
    update: { icon: '🔔', label: 'New announcement' }
  };

export function updateBellBadge() {
    const badge = document.getElementById('bell-badge');
    if (!badge) return;
    const count = unreadNotificationCount();
    badge.style.display = count > 0 ? 'inline-flex' : 'none';
    badge.innerText = count > 9 ? '9+' : String(count);
    badge.title = `${count} unread notification${count === 1 ? '' : 's'}`;
  }

function timeAgo(ts) {
    const diff = Date.now() - (ts || 0);
    if (diff < 60000) return 'just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return new Date(ts).toLocaleDateString([], { month: 'short', day: 'numeric' });
  }

function gradeText(g) {
    const fmt = (v) => `${v}${g.pointsPossible ? '/' + g.pointsPossible : ''}`;
    const pct = g.pct !== null && g.pct !== undefined ? ` · ${Math.round(g.pct)}%` : '';
    return g.isNew ? `${fmt(g.score)}${pct}` : `${fmt(g.oldScore)} → ${fmt(g.score)}${pct}`;
  }

export function renderNotificationsView(container) {
    const history = getNotificationHistory();

    container.innerHTML = `
    <div class="notif-view-head">
    <span class="notif-view-title">🔔 Recent notifications</span>
    ${history.length ? '<button type="button" class="notif-clear-btn">Clear all</button>' : ''}
    </div>
    <div class="notif-list">${
      history.length
      ? history.map(h => {
          const meta = KIND_META[h.kind] || { icon: '🔔', label: 'Notification' };
          const course = h.courseKey
          ? `<span class="course-tag-chip">${escapeHTML(h.courseKey)}</span>`
          : '';
          const score = h.kind === 'grade' && h.score !== undefined && h.score !== null
          ? `<em class="notif-score">${escapeHTML(gradeText(h))}</em>`
          : '';
          return `
          <div class="notif-row${h.read ? '' : ' notif-unread'}">
          <span class="notif-icon">${meta.icon}</span>
          <div class="notif-body">
          <div class="notif-top">
          <span class="notif-kind">${escapeHTML(meta.label)}</span>
          <span class="notif-time">${escapeHTML(timeAgo(h.ts))}</span>
          </div>
          <div class="notif-title-line">${course}<span class="notif-name">${escapeHTML(h.title || '')}</span>${score}</div>
          </div>
          </div>`;
        }).join('')
      : '<div class="mod-empty-msg">🔕 Nothing yet — new assignments, grades and announcements will land here.</div>'
    }</div>`;

    const clearBtn = container.querySelector('.notif-clear-btn');
    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        clearNotificationHistory();
        renderNotificationsView(container);
        updateBellBadge();
      });
    }

    // Opening the panel counts as reading everything, so the bell badge drops.
    markNotificationsRead();
    updateBellBadge();
  }