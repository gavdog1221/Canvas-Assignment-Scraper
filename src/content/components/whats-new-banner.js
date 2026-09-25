import { state } from '../state.js';
import { computeWhatsNew } from '../storage/whats-new.js';
import { escapeHTML } from '../utils/text.js';
import { updateBellBadge } from '../views/notifications-view.js';

// What's-new toast banner: a transient, top-center strip appended to <body>
// announcing assignments/updates/grades that appeared since the extension last
// ran. It lives outside the widget DOM (fixed overlay), so before rendering it
// copies the active theme's palette vars off #module-tasks-widget.

const THEME_VARS = [
  '--primary-accent', '--secondary-accent', '--accent-glow', '--accent-soft',
  '--card-bg', '--border-subtle', '--glass-obsidian', '--glass-obsidian-2',
  '--glass-edge', '--text-primary', '--text-secondary', '--text-tertiary',
  '--danger', '--danger-soft', '--warning', '--warning-soft', '--success',
  '--success-soft', '--gold', '--purple', '--shadow-panel', '--shadow-card',
  '--shadow-card-hover', '--shadow-float'
];
const AUTO_DISMISS_MS = 14000;

let activeBanner = null;
let dismissTimer = null;

function copyThemeVars(banner) {
    const widget = document.getElementById('module-tasks-widget');
    if (!widget) return;
    const computed = getComputedStyle(widget);
    THEME_VARS.forEach(name => {
      const value = computed.getPropertyValue(name).trim();
      if (value) banner.style.setProperty(name, value);
    });
  }

function dismiss() {
    if (dismissTimer) { clearTimeout(dismissTimer); dismissTimer = null; }
    if (!activeBanner) return;
    const banner = activeBanner;
    activeBanner = null;
    banner.classList.add('is-hiding');
    setTimeout(() => banner.remove(), 260);
  }

function formatScore(score, points) {
    return `${score}${points ? '/' + points : ''}`;
  }

const assignmentRow = item => `
    <div class="wnb-item"><span class="wnb-course">${escapeHTML(item.courseKey)}</span><span class="wnb-name">${escapeHTML(item.title)}</span></div>`;

const updateRow = item => `
    <div class="wnb-item"><span class="wnb-course">${escapeHTML(item.courseKey)}</span><span class="wnb-name">${escapeHTML(item.title)}</span></div>`;

const gradeRow = grade => {
    const pct = grade.pct !== null && grade.pct !== undefined ? ` · ${Math.round(grade.pct)}%` : '';
    const score = grade.isNew
      ? `${formatScore(grade.score, grade.pointsPossible)}${pct}`
      : `${formatScore(grade.oldScore, grade.pointsPossible)} → ${formatScore(grade.score, grade.pointsPossible)}${pct}`;
    return `
    <div class="wnb-item"><span class="wnb-course">${escapeHTML(grade.courseKey)}</span><span class="wnb-name">${escapeHTML(grade.title)} <em class="wnb-score">${escapeHTML(score)}</em></span></div>`;
  };

function buildGroup(label, icon, items, total, row) {
    const shown = items.slice(0, 3);
    const more = total - shown.length;
    return `
    <div class="wnb-group">
      <div class="wnb-group-title"><span>${icon}</span>${label}<b class="wnb-count">${total}</b></div>
      ${shown.map(row).join('')}
      ${more > 0 ? `<div class="wnb-more">…and ${more} more</div>` : ''}
    </div>`;
  }

export function maybeShowWhatsNewBanner() {
    const diff = computeWhatsNew();
    if (!diff) return;

    // New items landed in the bell history — refresh its unread badge.
    updateBellBadge();

    const groups = [];
    if (diff.assignments.length) groups.push(buildGroup('New assignments', '📚', diff.assignments, diff.assignments.length, assignmentRow));
    if (diff.gradeTotal) groups.push(buildGroup('New grades', '📈', diff.grades, diff.gradeTotal, gradeRow));
    if (diff.updates.length) groups.push(buildGroup('New updates', '🔔', diff.updates, diff.updates.length, updateRow));
    if (!groups.length) return;

    dismiss();

    const banner = document.createElement('div');
    banner.className = 'whats-new-banner';
    banner.setAttribute('role', 'status');
    banner.setAttribute('aria-live', 'polite');
    banner.dataset.theme = state.currentTheme;
    copyThemeVars(banner);
    banner.innerHTML = `
      <div class="wnb-head">
        <div class="wnb-title">New since your last visit</div>
        <button class="wnb-close" type="button" aria-label="Dismiss notifications">Got it</button>
      </div>
      <div class="wnb-body">${groups.join('')}</div>`;
    banner.querySelector('.wnb-close').addEventListener('click', () => dismiss());
    document.body.appendChild(banner);
    activeBanner = banner;
    dismissTimer = setTimeout(dismiss, AUTO_DISMISS_MS);
  }