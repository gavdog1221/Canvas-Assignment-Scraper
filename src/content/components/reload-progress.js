export function showReloadProgress(message, percent) {
    let overlay = document.getElementById('reload-progress-overlay');
    if (!overlay) {
      const widget = document.getElementById('module-tasks-widget');
      if (!widget) return;
      overlay = document.createElement('div');
      overlay.id = 'reload-progress-overlay';
      overlay.className = 'reload-progress-overlay';
      overlay.innerHTML = `
      <div class="reload-meta-row">
      <span class="reload-label"><span class="reload-spinner">↻</span> <span id="reload-status-text">Reloading courses...</span></span>
      <span class="reload-percent-text" id="reload-percent-text">0%</span>
      </div>
      <div class="reload-bar-bg">
      <div class="reload-bar-fill" id="reload-bar-fill" style="width: 0%;"></div>
      </div>
      `;
      const header = widget.querySelector('.header');
      if (header && header.nextSibling) {
        widget.insertBefore(overlay, header.nextSibling);
      } else {
        widget.prepend(overlay);
      }
    }

    const statusText = document.getElementById('reload-status-text');
    const percentText = document.getElementById('reload-percent-text');
    const barFill = document.getElementById('reload-bar-fill');

    if (statusText) statusText.innerText = message;
    const clamped = Math.max(0, Math.min(100, Math.round(percent)));
    if (percentText) percentText.innerText = `${clamped}%`;
    if (barFill) barFill.style.width = `${clamped}%`;
  }

export function hideReloadProgress() {
    const overlay = document.getElementById('reload-progress-overlay');
    if (overlay) overlay.remove();
  }
