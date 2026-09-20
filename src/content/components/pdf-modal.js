import { origin } from '../constants.js';

export function openPdfModal(rawUrl, title, courseId = null, fileId = null) {
    let modal = document.getElementById('canvas-doc-preview-modal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'canvas-doc-preview-modal';
      modal.className = 'doc-preview-modal';
      modal.innerHTML = `
      <div class="doc-preview-backdrop"></div>
      <div class="doc-preview-dialog">
      <div class="doc-preview-header">
      <span class="doc-preview-title" id="doc-preview-title">Document Preview</span>
      <div class="doc-preview-actions">
      <button type="button" class="doc-preview-btn-top" id="doc-preview-fullscreen-btn" title="Toggle Fullscreen">⛶ Fullscreen</button>
      <a class="doc-preview-btn-top" id="doc-preview-open-tab" target="_blank" rel="noopener noreferrer">↗ Open Tab</a>
      <a class="doc-preview-btn-top" id="doc-preview-download-link" download>Download ⤓</a>
      <button type="button" class="doc-preview-close" id="doc-preview-close-btn" title="Close Preview">✕</button>
      </div>
      </div>
      <div class="doc-preview-body">
      <iframe id="doc-preview-iframe" src="" frameborder="0"></iframe>
      </div>
      </div>
      `;
      document.body.appendChild(modal);

      const close = () => {
        if (document.fullscreenElement) document.exitFullscreen();
        modal.classList.remove('is-open');
        const iframe = document.getElementById('doc-preview-iframe');
        if (iframe) iframe.src = '';
      };

        modal.querySelector('.doc-preview-backdrop').addEventListener('click', close);
        modal.querySelector('#doc-preview-close-btn').addEventListener('click', close);

      const fullscreenBtn = modal.querySelector('#doc-preview-fullscreen-btn');
      const dialog = modal.querySelector('.doc-preview-dialog');
      fullscreenBtn.addEventListener('click', () => {
        if (document.fullscreenElement) {
          document.exitFullscreen();
        } else if (dialog.requestFullscreen) {
          dialog.requestFullscreen();
        }
      });
      document.addEventListener('fullscreenchange', () => {
        if (document.fullscreenElement === dialog) {
          fullscreenBtn.textContent = '⛶ Exit Fullscreen';
        } else {
          fullscreenBtn.textContent = '⛶ Fullscreen';
        }
      });
    }

    const titleEl = document.getElementById('doc-preview-title');
    const openTabBtn = document.getElementById('doc-preview-open-tab');
    const downloadLink = document.getElementById('doc-preview-download-link');
    const iframe = document.getElementById('doc-preview-iframe');

    let previewUrl = rawUrl;
    if (courseId && fileId) {
      previewUrl = `${origin}/courses/${courseId}/files/${fileId}/file_preview`;
    } else if (rawUrl && rawUrl.includes('/download?download_frd=1')) {
      previewUrl = rawUrl.replace('/download?download_frd=1', '');
    }

    if (titleEl) titleEl.innerText = title || 'Document Preview';
    if (openTabBtn) openTabBtn.href = previewUrl;
    if (downloadLink) downloadLink.href = rawUrl;
    if (iframe) iframe.src = previewUrl;

    modal.classList.add('is-open');
  }

export function closePdfModal() {
    const modal = document.getElementById('canvas-doc-preview-modal');
    if (modal && modal.classList.contains('is-open')) {
      if (document.fullscreenElement) document.exitFullscreen();
      modal.classList.remove('is-open');
      const iframe = document.getElementById('doc-preview-iframe');
      if (iframe) iframe.src = '';
    }
  }
