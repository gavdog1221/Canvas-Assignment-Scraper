import { state } from '../state.js';
import { buildSubmissionPayload, fetchAssignmentMeta, submitAssignment, uploadSubmissionFile } from '../services/submission-api.js';
import { escapeHTML } from '../utils/text.js';

// Custom submission popup, opened from the ↑ Submit pill on each Canvas task
// card. Renders in the middle of the UI like the PDF preview modal, and posts
// the submission straight to Canvas with the session's own API headers
// (submission-api.js), so no extra permissions are needed.
//
// Supports the three online submission types Canvas accepts:
//   online_text_entry (body) · online_upload (file_ids) · online_url (url)
// An optional comment is attached to whichever type is chosen. Assignment
// metadata fetched on open only *shapes* the UI — if the fetch fails every
// mode stays enabled and Canvas validates instead.

const SUBMIT_MODAL_ID = 'yace-submission-modal';

let currentTask = null;
let currentMeta = null;
let currentMode = 'text';
let submitting = false;

const MODE_LABELS = {
  text: '📝 Text',
  file: '📎 File',
  url: '🔗 URL'
};

const MODE_SUBMISSION_TYPE = {
  text: 'online_text_entry',
  file: 'online_upload',
  url: 'online_url'
};

function ensureSubmissionModal() {
    let modal = document.getElementById(SUBMIT_MODAL_ID);
    if (modal) return modal;

    modal = document.createElement('div');
    modal.id = SUBMIT_MODAL_ID;
    modal.className = 'doc-preview-modal submission-modal';
    modal.setAttribute('data-theme', state.currentTheme);
    modal.innerHTML = `
    <div class="doc-preview-backdrop"></div>
    <div class="doc-preview-dialog submission-dialog">
    <div class="doc-preview-header">
    <span class="doc-preview-title" id="submission-modal-title">Submit Assignment</span>
    <div class="doc-preview-actions">
    <a class="doc-preview-btn-top" id="submission-open-btn" target="_blank" rel="noopener noreferrer">Open ↗</a>
    <button type="button" class="doc-preview-close" id="submission-modal-close" title="Close">✕</button>
    </div>
    </div>
    <div class="assignment-modal-body submission-body" id="submission-body">
      <div class="sub-meta-row" id="submission-meta-row"></div>
      <div class="sub-form" id="submission-form">
      <div class="sub-modes" id="submission-modes">
      <button type="button" class="sub-mode-pill is-active" data-mode="text">📝 Text</button>
      <button type="button" class="sub-mode-pill" data-mode="file">📎 File</button>
      <button type="button" class="sub-mode-pill" data-mode="url">🔗 URL</button>
      </div>
      <div class="sub-pane is-active" data-pane="text">
      <label class="am-label">Answer</label>
      <textarea class="am-input am-textarea sub-answer" id="submission-text-input" rows="6" placeholder="Type your answer here..."></textarea>
      </div>
      <div class="sub-pane" data-pane="file">
      <label class="am-label">File</label>
      <label class="sub-file-wrap">
      <input type="file" id="submission-file-input" class="sub-file-input">
      <span class="sub-file-prompt" id="submission-file-prompt">📎 Click to choose a file…</span>
      <span class="sub-file-name am-hidden" id="submission-file-name"></span>
      </label>
      <span class="sub-file-hint" id="submission-file-hint"></span>
      </div>
      <div class="sub-pane" data-pane="url">
      <label class="am-label">URL</label>
      <input type="url" class="am-input" id="submission-url-input" placeholder="https://…  link to your work">
      </div>
      <label class="am-label sub-comment-label">Comment <span class="am-optional">(optional, shown to your instructor)</span></label>
      <textarea class="am-input am-textarea" id="submission-comment-input" rows="2" placeholder="Anything your instructor should know about this submission…"></textarea>
      <div class="sub-status" id="submission-status"></div>
      </div>
      <div class="sub-success-panel am-hidden" id="submission-success">
      <div class="sub-success-icon">✓</div>
      <div class="sub-success-title">Submitted</div>
      <div class="sub-success-sub" id="submission-success-sub"></div>
      <a class="am-btn am-btn-primary sub-success-view" id="submission-success-view" target="_blank" rel="noopener noreferrer">View submission ↗</a>
      <button type="button" class="am-btn am-btn-ghost" id="submission-another-btn">Submit another attempt</button>
      </div>
    </div>
    <div class="doc-preview-header assignment-modal-footer">
    <div class="am-footer-right">
    <button type="button" class="am-btn am-btn-ghost" id="submission-cancel-btn">Cancel</button>
    <button type="button" class="am-btn am-btn-primary" id="submission-submit-btn">↑ Submit</button>
    </div>
    </div>
    </div>
    `;
    document.body.appendChild(modal);

    const close = () => modal.classList.remove('is-open');
    modal.querySelector('.doc-preview-backdrop').addEventListener('click', close);
    modal.querySelector('#submission-modal-close').addEventListener('click', close);
    modal.querySelector('#submission-cancel-btn').addEventListener('click', close);
    modal.querySelector('#submission-submit-btn').addEventListener('click', handleSubmitClick);

    // Mode pills (delegated so reopened forms keep working).
    modal.querySelector('#submission-modes').addEventListener('click', (e) => {
      const pill = e.target.closest('.sub-mode-pill');
      if (!pill || pill.classList.contains('is-disabled')) return;
      setActiveMode(pill.getAttribute('data-mode'));
    });

    // File picker + "submit another attempt" (delegated; the success panel
    // swaps in without rebuilding these bindings).
    modal.querySelector('#submission-body').addEventListener('change', (e) => {
      if (e.target && e.target.id === 'submission-file-input') {
        onFileChosen(e.target);
      }
    });
    modal.querySelector('#submission-body').addEventListener('click', (e) => {
      if (e.target && e.target.id === 'submission-another-btn') {
        resetFromSuccess();
      }
    });

    return modal;
  }

function setActiveMode(mode) {
    currentMode = mode;
    const modal = document.getElementById(SUBMIT_MODAL_ID);
    if (!modal) return;
    modal.querySelectorAll('.sub-mode-pill').forEach(pill => {
      pill.classList.toggle('is-active', pill.getAttribute('data-mode') === mode);
    });
    modal.querySelectorAll('.sub-pane').forEach(pane => {
      pane.classList.toggle('is-active', pane.getAttribute('data-pane') === mode);
    });
    const focusEl = modal.querySelector('#submission-' + (mode === 'text' ? 'text-input' : mode === 'file' ? 'file-input' : 'url-input'));
    if (focusEl && !focusEl.disabled && mode !== 'file') focusEl.focus();
  }

function onFileChosen(input) {
    const file = input.files && input.files[0];
    const nameEl = document.getElementById('submission-file-name');
    const promptEl = document.getElementById('submission-file-prompt');
    if (!file) {
      if (nameEl) nameEl.classList.add('am-hidden');
      if (promptEl) promptEl.classList.remove('am-hidden');
      return;
    }
    const kb = (file.size / 1024).toFixed(0);
    if (nameEl) {
      nameEl.textContent = `${file.name} (${kb} KB)`;
      nameEl.classList.remove('am-hidden');
    }
    if (promptEl) promptEl.classList.add('am-hidden');
  }

function setStatus(message, kind) {
    const status = document.getElementById('submission-status');
    if (!status) return;
    status.textContent = message;
    status.classList.remove('is-error', 'is-ok');
    if (kind === 'error') status.classList.add('is-error');
    if (kind === 'ok') status.classList.add('is-ok');
  }

function setSubmitting(on) {
    submitting = on;
    const btn = document.getElementById('submission-submit-btn');
    if (btn) {
      btn.disabled = on;
      btn.textContent = on ? '…' : '↑ Submit';
    }
  }

function clearForm() {
    const modal = document.getElementById(SUBMIT_MODAL_ID);
    if (!modal) return;
    const text = modal.querySelector('#submission-text-input');
    const url = modal.querySelector('#submission-url-input');
    const comment = modal.querySelector('#submission-comment-input');
    const file = modal.querySelector('#submission-file-input');
    if (text) text.value = '';
    if (url) url.value = '';
    if (comment) comment.value = '';
    if (file) { file.value = ''; onFileChosen(file); }
    setStatus('', '');
    setSubmitting(false);
  }

function applyMeta() {
    const modal = document.getElementById(SUBMIT_MODAL_ID);
    if (!modal) return;

    // Meta chips row.
    const metaRow = modal.querySelector('#submission-meta-row');
    const chips = [];
    if (currentTask && currentTask.courseKey) {
      chips.push(`<span class="sub-meta-chip">${escapeHTML(currentTask.courseKey)}</span>`);
    }
    if (currentMeta && currentMeta.points !== null && currentMeta.points !== undefined) {
      chips.push(`<span class="sub-meta-chip"><b>${currentMeta.points}</b> pts</span>`);
    }
    if (currentMeta && currentMeta.dueAt) {
      const d = new Date(currentMeta.dueAt);
      if (!isNaN(d.getTime())) {
        chips.push(`<span class="sub-meta-chip">Due ${d.toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</span>`);
      }
    }
    if (currentMeta && currentMeta.lockedForUser) {
      chips.push(`<span class="sub-meta-chip sub-meta-locked">🔒 Locked</span>`);
    }
    metaRow.innerHTML = chips.join('') || '';

    // Mode availability from the assignment's submission_types.
    const types = currentMeta ? currentMeta.submissionTypes : [];
    const canText = types.length === 0 || types.includes('online_text_entry');
    const canFile = types.length === 0 || types.includes('online_upload');
    const canUrl = types.length === 0 || types.includes('online_url');
    const onlyExternal = types.length > 0 && !canText && !canFile && !canUrl;

    const pills = modal.querySelectorAll('.sub-mode-pill');
    pills.forEach(pill => {
      const mode = pill.getAttribute('data-mode');
      const ok = mode === 'text' ? canText : mode === 'file' ? canFile : canUrl;
      pill.classList.toggle('is-disabled', !ok);
      if (!ok) pill.title = 'This assignment does not accept that submission type';
      else pill.title = '';
    });

    // File input `accept` from allowed_extensions, e.g. "pdf,docx" -> ".pdf,.docx".
    const fileInput = modal.querySelector('#submission-file-input');
    if (fileInput) {
      const ext = currentMeta && currentMeta.allowedExtensions.length
      ? currentMeta.allowedExtensions.map(x => `.${x}`).join(',')
      : '*';
      fileInput.accept = ext;
    }
    const hint = modal.querySelector('#submission-file-hint');
    if (hint) {
      hint.textContent = currentMeta && currentMeta.allowedExtensions.length
      ? `Allowed: ${currentMeta.allowedExtensions.join(', ')}`
      : '';
    }

    // If no online type is accepted, explain and lean on the Open link.
    if (onlyExternal) {
      setStatus(types.includes('not_graded')
        ? 'This assignment is not graded and does not accept submissions.'
        : 'This assignment cannot be submitted this way (quiz / external tool) — open it in Canvas to turn it in.', 'error');
      setSubmitting(false);
      submitting = true;
      const subBtn = modal.querySelector('#submission-submit-btn');
      if (subBtn) { subBtn.disabled = true; subBtn.textContent = '↑ Submit'; }
    } else {
      // Default to the first enabled mode.
      const first = canText ? 'text' : canFile ? 'file' : 'url';
      setActiveMode(first);
      if (currentMeta && currentMeta.lockedForUser) {
        setStatus('Canvas reports this assignment is locked for you — the submission may be rejected.', 'error');
      }
    }
  }

function resetFromSuccess() {
    const modal = document.getElementById(SUBMIT_MODAL_ID);
    if (!modal) return;
    modal.querySelector('#submission-success').classList.add('am-hidden');
    modal.querySelector('#submission-form').classList.remove('am-hidden');
    modal.querySelector('#submission-meta-row').classList.remove('am-hidden');
    clearForm();
    applyMeta();
  }

function showSuccess(sub) {
    const modal = document.getElementById(SUBMIT_MODAL_ID);
    if (!modal) return;
    const subEl = modal.querySelector('#submission-success-sub');
    const attempt = sub && sub.attempt ? ` — attempt ${sub.attempt}` : '';
    const lateNote = sub && sub.late ? ' ⚠ This submission is marked late.' : '';
    subEl.textContent = `${currentTask.title}${attempt}.${lateNote}`;

    const viewLink = modal.querySelector('#submission-success-view');
    const url = (sub && (sub.html_url || sub.preview_url)) || (currentTask.url || null);
    if (url) {
      viewLink.href = url;
      viewLink.classList.remove('am-hidden');
    } else {
      viewLink.classList.add('am-hidden');
    }

    modal.querySelector('#submission-form').classList.add('am-hidden');
    modal.querySelector('#submission-meta-row').classList.add('am-hidden');
    modal.querySelector('#submission-success').classList.remove('am-hidden');
    setSubmitting(true);
    const btn = modal.querySelector('#submission-submit-btn');
    if (btn) btn.textContent = '✓ Submitted';
  }

async function handleSubmitClick() {
    const modal = document.getElementById(SUBMIT_MODAL_ID);
    if (!modal || submitting || !currentTask) return;
    if (!currentTask.canvasCourseId || !currentTask.canvasAssignmentId) {
      setStatus('This task has no Canvas assignment to submit to.', 'error');
      return;
    }

    const comment = modal.querySelector('#submission-comment-input').value;
    const mode = currentMode;
    let payload;

    if (mode === 'text') {
      const body = modal.querySelector('#submission-text-input').value;
      if (!body.trim()) {
        setStatus('Type an answer before submitting.', 'error');
        return;
      }
      payload = buildSubmissionPayload(MODE_SUBMISSION_TYPE.text, { body, comment });
    } else if (mode === 'file') {
      const fileInput = modal.querySelector('#submission-file-input');
      const file = fileInput && fileInput.files && fileInput.files[0];
      if (!file) {
        setStatus('Choose a file to upload.', 'error');
        return;
      }
      setSubmitting(true);
      setStatus(`Uploading ${file.name}…`);
      try {
        const fileId = await uploadSubmissionFile(currentTask.canvasCourseId, currentTask.canvasAssignmentId, file);
        payload = buildSubmissionPayload(MODE_SUBMISSION_TYPE.file, { fileIds: [fileId], comment });
      } catch (err) {
        setStatus((err && err.message) || 'Upload failed.', 'error');
        setSubmitting(false);
        return;
      }
    } else {
      const rawUrl = modal.querySelector('#submission-url-input').value.trim();
      if (!rawUrl) {
        setStatus('Enter a URL to submit.', 'error');
        return;
      }
      const withScheme = /^https?:\/\//i.test(rawUrl) ? rawUrl : `https://${rawUrl}`;
      payload = buildSubmissionPayload(MODE_SUBMISSION_TYPE.url, { url: withScheme, comment });
    }

    setSubmitting(true);
    setStatus('Submitting to Canvas…');
    try {
      const sub = await submitAssignment(currentTask.canvasCourseId, currentTask.canvasAssignmentId, payload);
      showSuccess(sub);
    } catch (err) {
      setStatus((err && err.message) || 'Submission failed.', 'error');
      setSubmitting(false);
    }
  }

export async function openSubmissionModal(task) {
    const modal = ensureSubmissionModal();
    if (!task) return;
    currentTask = task;
    currentMeta = null;

    modal.setAttribute('data-theme', state.currentTheme);

    const titleEl = modal.querySelector('#submission-modal-title');
    titleEl.textContent = `Submit: ${task.title}`;

    const openBtn = modal.querySelector('#submission-open-btn');
    if (task.url) {
      openBtn.href = task.url;
      openBtn.classList.remove('am-hidden');
    } else {
      openBtn.classList.add('am-hidden');
    }

    // Reset to the fresh form state every open.
    modal.querySelector('#submission-success').classList.add('am-hidden');
    modal.querySelector('#submission-form').classList.remove('am-hidden');
    modal.querySelector('#submission-meta-row').classList.remove('am-hidden');
    clearForm();
    applyMeta();
    modal.classList.add('is-open');

    // Best-effort metadata; on failure all modes stay enabled and Canvas
    // validates instead.
    try {
      currentMeta = await fetchAssignmentMeta(task.canvasCourseId, task.canvasAssignmentId);
    } catch (err) {
      currentMeta = null;
      console.warn('[Submission] assignment meta fetch failed, using defaults:', err);
    }
    applyMeta();
  }

export function closeSubmissionModal() {
    const modal = document.getElementById(SUBMIT_MODAL_ID);
    if (modal && modal.classList.contains('is-open')) {
      modal.classList.remove('is-open');
      clearForm();
    }
  }