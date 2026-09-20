// Campus & Tools overlay: hosts the Food (dining menus), Professor ratings
// and WebCat Reg widgets that were removed from the fullscreen dashboard
// grid. A single modal with a three-tab switcher; the view renderers are
// shared with the old tab bodies so they behave identically, just hosted in
// an overlay instead.
//
// Reuses the .doc-preview-modal chrome (backdrop + dialog + close) so the
// existing keyboard/modal plumbing (Esc handling, "any modal open" gate in
// keyboard-shortcuts.js) applies for free.

import { state } from '../state.js';
import { renderDiningView } from '../views/dining-view.js';
import { renderRegistrationView } from '../views/registration-view.js';
import { renderRmpView } from '../views/rmp-view.js';
import { getHiddenCourses } from '../storage/hidden-courses.js';

// Which tab shows next time the modal opens ('food' | 'registration' | 'rmp').
let activeTool = 'food';

// Reflect state.isDrawerOpen + the active tool on every 🍽/🧑‍🏫/🎓 header
// button so the one matching the open tab lights up, not a one-way "open".
function syncCampusToolsBtn() {
    const isOpen = state.isDrawerOpen;
    document.querySelectorAll('.campus-tools-btn').forEach(btn => {
      const tool = btn.getAttribute('data-tool');
      btn.classList.toggle('is-active', isOpen && tool === activeTool);
      btn.setAttribute('aria-expanded', String(isOpen));
    });
  }

// CSS custom properties are defined on #module-tasks-widget only; a modal
// appended to <body> sits outside it, so copy the live palette onto the
// modal element so var(--primary-accent) etc. resolve inside the overlay.
function applyThemePalette(modal) {
    const widget = document.getElementById('module-tasks-widget');
    if (!widget) return;
    const cs = getComputedStyle(widget);
    [
      '--primary-accent', '--secondary-accent', '--accent-glow', '--accent-soft',
      '--card-bg', '--border-subtle', '--glass-obsidian', '--glass-obsidian-2',
      '--glass-edge', '--text-primary', '--text-secondary', '--text-tertiary',
      '--danger', '--danger-soft', '--warning', '--warning-soft',
      '--success', '--success-soft', '--gold', '--purple',
      '--shadow-panel', '--shadow-card', '--shadow-card-hover', '--shadow-float'
    ].forEach(name => {
      const val = cs.getPropertyValue(name);
      if (val) modal.style.setProperty(name, val);
    });
  }

function renderTool() {
    const modal = document.getElementById('campus-tools-modal');
    const body = document.getElementById('campus-tools-body');
    if (!modal || !body) return;

    modal.querySelectorAll('.campus-tools-tab').forEach(btn => {
      btn.classList.toggle('active', btn.getAttribute('data-tool') === activeTool);
    });

    body.innerHTML = '';
    if (activeTool === 'food') {
      renderDiningView(body);
    } else if (activeTool === 'rmp') {
      renderRmpView(body, getHiddenCourses());
    } else {
      renderRegistrationView(body);
    }
  }

export function openCampusToolsModal(tool) {
    state.isDrawerOpen = true;

    if (tool && tool !== activeTool) {
      activeTool = tool;
    }

    let modal = document.getElementById('campus-tools-modal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'campus-tools-modal';
      modal.className = 'doc-preview-modal campus-tools-modal';
      modal.innerHTML = `
      <div class="doc-preview-backdrop"></div>
      <div class="doc-preview-dialog campus-tools-dialog">
      <div class="doc-preview-header campus-tools-header">
      <span class="doc-preview-title">🍽 Campus &amp; Tools</span>
      <div class="campus-tools-tabs" role="tablist">
      <button type="button" class="campus-tools-tab" data-tool="food" role="tab">🍽 Food</button>
      <button type="button" class="campus-tools-tab" data-tool="rmp" role="tab">🧑‍🏫 Professors</button>
      <button type="button" class="campus-tools-tab" data-tool="registration" role="tab">🎓 WebCat Reg</button>
      </div>
      <button type="button" class="doc-preview-close" id="campus-tools-close-btn" title="Close (Esc)">✕</button>
      </div>
      <div class="campus-tools-body" id="campus-tools-body"></div>
      </div>
      `;
      document.body.appendChild(modal);

      modal.querySelector('.doc-preview-backdrop').addEventListener('click', closeCampusToolsModal);
      modal.querySelector('#campus-tools-close-btn').addEventListener('click', closeCampusToolsModal);

      // Esc anywhere inside the modal (including the reg text inputs, where
      // the window-level handler only blurs) closes it -- and stopPropagation
      // keeps the global handler from ALSO exiting fullscreen in one press.
      modal.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
          e.stopPropagation();
          closeCampusToolsModal();
        }
      });

      modal.querySelectorAll('.campus-tools-tab').forEach(btn => {
        btn.addEventListener('click', () => {
          activeTool = btn.getAttribute('data-tool');
          renderTool();
        });
      });
    }

    applyThemePalette(modal);
    renderTool();
    modal.classList.add('is-open');
    syncCampusToolsBtn();
  }

export function closeCampusToolsModal() {
    state.isDrawerOpen = false;
    const modal = document.getElementById('campus-tools-modal');
    if (modal) modal.classList.remove('is-open');
    syncCampusToolsBtn();
  }

export function isCampusToolsModalOpen() {
    const modal = document.getElementById('campus-tools-modal');
    return !!(modal && modal.classList.contains('is-open'));
  }

// The header button is a true toggle: one press opens, the next closes.
// Driven entirely by state.isDrawerOpen / the modal's is-open class -- it
// never re-renders the dashboard underneath, so the search bar, weekday
// pills and active filters stay exactly where they were.
export function toggleCampusToolsModal(tool) {
    if (isCampusToolsModalOpen() || state.isDrawerOpen) {
      closeCampusToolsModal();
    } else {
      openCampusToolsModal(tool);
    }
  }