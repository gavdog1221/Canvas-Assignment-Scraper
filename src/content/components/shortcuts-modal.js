export function openShortcutsModal() {
    let modal = document.getElementById('canvas-shortcuts-modal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'canvas-shortcuts-modal';
      modal.className = 'doc-preview-modal';
      modal.innerHTML = `
      <div class="doc-preview-backdrop"></div>
      <div class="doc-preview-dialog shortcuts-dialog">
      <div class="doc-preview-header">
      <span class="doc-preview-title">⚡ Keyboard Shortcuts</span>
      <button type="button" class="doc-preview-close" id="shortcuts-close-btn">✕</button>
      </div>
      <div class="shortcuts-content">
      <div class="shortcut-row"><span class="shortcut-key">j / ↓</span><span class="shortcut-desc">Move cursor down</span></div>
      <div class="shortcut-row"><span class="shortcut-key">k / ↑</span><span class="shortcut-desc">Move cursor up</span></div>
      <div class="shortcut-row"><span class="shortcut-key">x</span><span class="shortcut-desc">Toggle active task completed</span></div>
      <div class="shortcut-row"><span class="shortcut-key">v</span><span class="shortcut-desc">Preview PDF document</span></div>
      <div class="shortcut-row"><span class="shortcut-key">d</span><span class="shortcut-desc">Download PDF document</span></div>
      <div class="shortcut-row"><span class="shortcut-key">u</span><span class="shortcut-desc">Open Gradescope upload window</span></div>
      <div class="shortcut-row"><span class="shortcut-key">o / Enter</span><span class="shortcut-desc">Open assignment URL</span></div>
      <div class="shortcut-row"><span class="shortcut-key">n</span><span class="shortcut-desc">Create a new custom assignment</span></div>
      <div class="shortcut-row"><span class="shortcut-key">/</span><span class="shortcut-desc">Focus search box</span></div>
      <div class="shortcut-row"><span class="shortcut-key">Esc</span><span class="shortcut-desc">Dismiss viewer or search</span></div>
      </div>
      </div>
      `;
      document.body.appendChild(modal);

      const close = () => modal.classList.remove('is-open');
      modal.querySelector('.doc-preview-backdrop').addEventListener('click', close);
      modal.querySelector('#shortcuts-close-btn').addEventListener('click', close);
    }
    modal.classList.add('is-open');
  }
