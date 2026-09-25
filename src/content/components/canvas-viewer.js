import { origin } from '../constants.js';
import { escapeHTML } from '../utils/text.js';
import { fetchAllPages, getCsrfToken } from '../services/canvas-api.js';
import { openPdfModal } from './pdf-modal.js';

// Canvas Viewer — replaces the raw "open Canvas in a new tab / iframe" handoffs
// (task pages, announcements, course home, and the Info card's Modules / Files /
// Grades previews) with custom YACE-styled panels built from the Canvas API.
// Every view keeps an "Open in Canvas ↗" escape hatch in the header. The modal
// reuses the .doc-preview-modal chrome so Esc/backdrop/keyboard-gating all
// behave like the existing document preview.

function apiHeaders() {
    return {
      'Accept': 'application/json',
      'X-Requested-With': 'XMLHttpRequest',
      'X-CSRF-Token': getCsrfToken()
    };
  }

async function apiGet(url) {
    const res = await fetch(url, { credentials: 'include', headers: apiHeaders() });
    if (!res.ok) throw new Error('Canvas returned HTTP ' + res.status);
    return res.json();
  }

let viewerModal = null;

export function closeCanvasViewer() {
    if (viewerModal) viewerModal.classList.remove('is-open');
  }

function ensureViewerModal() {
    if (viewerModal) return viewerModal;
    const modal = document.createElement('div');
    modal.id = 'canvas-viewer-modal';
    modal.className = 'doc-preview-modal canvas-viewer-modal';
    modal.innerHTML = `
    <div class="doc-preview-backdrop"></div>
    <div class="doc-preview-dialog canvas-viewer-dialog">
    <div class="doc-preview-header">
    <span class="doc-preview-title" id="canvas-viewer-title">Canvas</span>
    <div class="doc-preview-actions">
    <a class="doc-preview-btn-top" id="canvas-viewer-open-tab" target="_blank" rel="noopener noreferrer">↗ Open in Canvas</a>
    <button type="button" class="doc-preview-close" id="canvas-viewer-close-btn" title="Close">✕</button>
    </div>
    </div>
    <div class="canvas-viewer-body" id="canvas-viewer-body"></div>
    </div>`;
    document.body.appendChild(modal);

    const close = () => closeCanvasViewer();
    modal.querySelector('.doc-preview-backdrop').addEventListener('click', close);
    modal.querySelector('#canvas-viewer-close-btn').addEventListener('click', close);
    viewerModal = modal;
    return modal;
  }

function setOpenTabHref(modal, url) {
    const el = modal.querySelector('#canvas-viewer-open-tab');
    el.setAttribute('href', url || '#');
    el.style.display = url ? '' : 'none';
  }

function setViewerTitle(modal, text) {
    modal.querySelector('#canvas-viewer-title').textContent = text || 'Canvas';
  }

function bodyEl(modal) {
    return modal.querySelector('.canvas-viewer-body');
  }

function fmtDate(d) {
    if (!d) return null;
    const date = d instanceof Date ? d : new Date(d);
    if (isNaN(date.getTime())) return null;
    return date.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' }) +
    ' · ' + date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  }

function formatScore(n) {
    if (n === null || n === undefined || isNaN(n)) return '—';
    return String(parseFloat(n.toFixed(2)));
  }

function formatBytes(b) {
    if (b === null || b === undefined || isNaN(b)) return '';
    if (b < 1024) return b + ' B';
    if (b < 1048576) return (b / 1024).toFixed(1) + ' KB';
    return (b / 1048576).toFixed(1) + ' MB';
  }

function chipsHtml(items) {
    return items.filter(Boolean).map(i => `<span class="cv-chip">${i}</span>`).join('');
  }

// Canvas description HTML is instructor-authored content on the same origin —
// safe enough to render, but strip live-embedding elements and event handlers
// so nothing dynamic runs inside the viewer.
function sanitizeCanvasHtml(html) {
    if (!html || typeof html !== 'string') return '';
    const doc = new DOMParser().parseFromString(html, 'text/html');
    doc.querySelectorAll('script, style, iframe, object, embed, form, link, meta, noscript, video, audio, svg').forEach(el => el.remove());
    doc.querySelectorAll('*').forEach(el => {
      Array.from(el.attributes).forEach(attr => {
        if (/^on/i.test(attr.name) || /^\s*javascript:/i.test(attr.value)) el.removeAttribute(attr.name);
      });
    });
    return doc.body.innerHTML;
  }

// Any anchor rendered inside the viewer must never navigate the dashboard
// itself — force new tabs so the user is only ever one click away from coming
// back.
function externalizeLinks(root) {
    root.querySelectorAll('a[href]').forEach(a => {
      if (!a.hasAttribute('target')) a.setAttribute('target', '_blank');
      a.setAttribute('rel', 'noopener noreferrer');
    });
  }

// Pulls /courses/:cid/files/:fid links out of description HTML — these are
// the assignment attachments. The file names need one extra request mapping
// file ids back to display names.
function extractFileLinks(html) {
    const out = [];
    const re = /href="([^"]*\/courses\/\d+\/files\/(\d+)(?:\/[^"]*)?)"/g;
    let m;
    while ((m = re.exec(html || '')) !== null) {
      const fid = m[2];
      if (!out.some(f => f.id === fid)) out.push({ id: fid, url: m[1].replace(/&amp;/g, '&') });
    }
    return out;
  }

function fileDownloadUrl(courseId, fileId) {
    return `${origin}/courses/${courseId}/files/${fileId}/download?download_frd=1`;
  }

function filePreview(courseId, fileId, title) {
    openPdfModal('', title || 'File Preview', courseId, fileId);
  }

// ---------------------------------------------------------------------------
//  Views
// ---------------------------------------------------------------------------

async function renderAssignment(modal, opts) {
    const { courseId, assignmentId, courseKey, courseName, url } = opts;
    let a;
    try {
      a = await apiGet(`${origin}/api/v1/courses/${courseId}/assignments/${assignmentId}?include[]=submission`);
    } catch (err) {
      // content_id from a module item isn't always a real assignment id — bail
      // to the plain Canvas page instead of showing an error.
      if (url) window.open(url, '_blank');
      closeCanvasViewer();
      return;
    }

    let name = courseName;
    try {
      const c = await apiGet(`${origin}/api/v1/courses/${courseId}?include[]=term`);
      name = c.name || name;
    } catch (e) { /* name fallback only */ }

    const filesById = new Map();
    try {
      const files = await fetchAllPages(`${origin}/api/v1/courses/${courseId}/files?per_page=100`, apiHeaders(), 4);
      files.forEach(f => filesById.set(String(f.id), f));
    } catch (e) { /* attachment names just fall back to ids */ }

    const due = fmtDate(a.due_at);
    const points = a.points_possible !== null && a.points_possible !== undefined ? formatScore(a.points_possible) + ' pts' : null;
    const types = (Array.isArray(a.submission_types) ? a.submission_types : [])
    .filter(t => t !== 'none')
    .map(t => t.replace(/_/g, ' '))
    .join(', ') || null;

    const sub = a.submission && a.submission.workflow_state && a.submission.workflow_state !== 'unsubmitted' ? a.submission : null;
    let statusChip = null;
    if (sub) {
      const graded = sub.workflow_state === 'graded' || (sub.score !== null && sub.score !== undefined);
      statusChip = graded
      ? `Graded · ${formatScore(sub.score)}${a.points_possible !== null && a.points_possible !== undefined ? ' / ' + formatScore(a.points_possible) : ''}`
      : 'Submitted';
    } else if (a.locked_for_user) {
      statusChip = 'Locked';
    }

    const descHtml = sanitizeCanvasHtml(a.description || '');
    const attachments = extractFileLinks(a.description || '').map(f => {
      const file = filesById.get(String(f.id));
      return { id: f.id, name: (file && (file.display_name || file.filename)) || ('attachment-' + f.id) };
    });

    setOpenTabHref(modal, a.html_url || url || null);
    setViewerTitle(modal, a.name || opts.title || 'Assignment');

    const body = bodyEl(modal);
    body.innerHTML = `
    <div class="canvas-viewer-scroll">
    <div class="cv-course-row"><span class="course-tag-chip">${escapeHTML(courseKey || name || '')}</span> ${escapeHTML(name || '')}</div>
    <h1 class="cv-title">${escapeHTML(a.name || opts.title || 'Assignment')}</h1>
    <div class="cv-chips">
    ${chipsHtml([due ? '🕐 ' + due : null, points ? '🏆 ' + points : null, types ? '📝 ' + types : null, statusChip ? '✅ ' + statusChip : null])}
    </div>
    ${sub && sub.submitted_at ? `<div class="cv-submission-line">Submitted ${fmtDate(sub.submitted_at) || ''}${a.points_possible !== null && a.points_possible !== undefined ? ' · Score ' + formatScore(sub.score) + ' / ' + formatScore(a.points_possible) : ''}</div>` : ''}
    ${descHtml ? `<div class="cv-description">${descHtml}</div>` : '<p class="cv-empty">No description posted on Canvas.</p>'}
    ${attachments.length ? `
      <div class="cv-section-title">📎 Attachments</div>
      <div class="cv-file-list">
      ${attachments.map(f => `
        <div class="cv-file-row">
        <span class="cv-file-icon">📄</span>
        <span class="cv-file-name" title="${escapeHTML(f.name)}">${escapeHTML(f.name)}</span>
        <span class="cv-file-actions">
        <button type="button" class="doc-preview-btn-top cv-file-btn" data-preview-file="${escapeHTML(f.id)}">Preview</button>
        <a class="doc-preview-btn-top" href="${escapeHTML(fileDownloadUrl(courseId, f.id))}" download target="_blank" rel="noopener noreferrer">Download ⤓</a>
        </span>
        </div>`).join('')}
      </div>` : ''}
    </div>`;

    body.querySelectorAll('[data-preview-file]').forEach(btn => {
      btn.addEventListener('click', () => filePreview(courseId, btn.getAttribute('data-preview-file'), (a.name || 'File') + ' — preview'));
    });
    externalizeLinks(body);
  }

async function renderAnnouncement(modal, opts) {
    const { courseId, topicId, url } = opts;
    const t = await apiGet(`${origin}/api/v1/courses/${courseId}/discussion_topics/${topicId}`);

    setOpenTabHref(modal, t.html_url || url || null);
    setViewerTitle(modal, t.title || opts.title || 'Announcement');

    const author = (t.author && (t.author.display_name || t.author.name)) || null;
    const posted = fmtDate(t.posted_at || t.delayed_post_at);
    const commentCount = t.discussion_subentry_count || 0;
    const messageHtml = sanitizeCanvasHtml(t.message || '');

    const attachments = [];
    if (t.attachment && t.attachment.id) {
      attachments.push({ id: String(t.attachment.id), name: t.attachment.display_name || t.attachment.filename || 'attachment' });
    }
    extractFileLinks(t.message || '').forEach(f => {
      if (!attachments.some(x => x.id === f.id)) attachments.push({ id: f.id, name: 'attachment-' + f.id });
    });

    const body = bodyEl(modal);
    body.innerHTML = `
    <div class="canvas-viewer-scroll">
    <div class="cv-course-row"><span class="course-tag-chip">${escapeHTML(opts.courseKey || '')}</span> ${escapeHTML(opts.courseName || '')}</div>
    <h1 class="cv-title">${escapeHTML(t.title || opts.title || 'Announcement')}</h1>
    <div class="cv-chips">
    ${chipsHtml([author ? '👤 ' + author : null, posted ? '🕐 ' + posted : null, commentCount ? '💬 ' + commentCount + ' comment' + (commentCount === 1 ? '' : 's') : null])}
    </div>
    ${messageHtml ? `<div class="cv-description">${messageHtml}</div>` : '<p class="cv-empty">No message body.</p>'}
    ${attachments.length ? `
      <div class="cv-section-title">📎 Attachments</div>
      <div class="cv-file-list">
      ${attachments.map(f => `
        <div class="cv-file-row">
        <span class="cv-file-icon">📄</span>
        <span class="cv-file-name" title="${escapeHTML(f.name)}">${escapeHTML(f.name)}</span>
        <span class="cv-file-actions">
        <button type="button" class="doc-preview-btn-top cv-file-btn" data-preview-file="${escapeHTML(f.id)}">Preview</button>
        <a class="doc-preview-btn-top" href="${escapeHTML(fileDownloadUrl(courseId, f.id))}" download target="_blank" rel="noopener noreferrer">Download ⤓</a>
        </span>
        </div>`).join('')}
      </div>` : ''}
    </div>`;

    body.querySelectorAll('[data-preview-file]').forEach(btn => {
      btn.addEventListener('click', () => filePreview(courseId, btn.getAttribute('data-preview-file'), (t.title || 'Attachment') + ' — preview'));
    });
    externalizeLinks(body);
  }

async function renderCourse(modal, opts) {
    const { courseId, courseKey, courseName, syllabusPdfUrl, url } = opts;
    const c = await apiGet(`${origin}/api/v1/courses/${courseId}?include[]=teachers&include[]=term&include[]=total_students&include[]=syllabus_body`);

    const name = c.name || courseName || courseKey;
    setOpenTabHref(modal, c.html_url || url || null);
    setViewerTitle(modal, name);

    const term = (c.term && c.term.name) || null;
    const teachers = Array.isArray(c.teachers) ? c.teachers.map(tr => tr.display_name).filter(Boolean) : [];
    const syllabusHtml = sanitizeCanvasHtml(c.syllabus_body || '');

    const body = bodyEl(modal);
    body.innerHTML = `
    <div class="canvas-viewer-scroll">
    <div class="cv-course-row"><span class="course-tag-chip">${escapeHTML(courseKey || c.course_code || '')}</span> ${escapeHTML(c.course_code || '')}</div>
    <h1 class="cv-title">${escapeHTML(name)}</h1>
    <div class="cv-chips">
    ${chipsHtml([term ? '🗓 ' + term : null, c.total_students != null ? '👥 ' + c.total_students + ' students' : null])}
    </div>
    ${teachers.length ? `
      <div class="cv-section-title">👩‍🏫 Instructors</div>
      <div class="cv-teacher-list">${teachers.map(t => `<span class="cv-teacher-chip">${escapeHTML(t)}</span>`).join('')}</div>` : ''}
    <div class="cv-actions-row">
    ${syllabusPdfUrl ? `<button type="button" class="doc-preview-btn-top cv-nav-btn" data-nav="syllabus">📄 Syllabus PDF</button>` : ''}
    <button type="button" class="doc-preview-btn-top cv-nav-btn" data-nav="modules">🗂 Modules</button>
    <button type="button" class="doc-preview-btn-top cv-nav-btn" data-nav="files">📁 Files</button>
    <button type="button" class="doc-preview-btn-top cv-nav-btn" data-nav="grades">📊 Grades</button>
    </div>
    ${syllabusHtml ? `<div class="cv-section-title">📋 Syllabus</div><div class="cv-description">${syllabusHtml}</div>` : ''}
    </div>`;

    body.querySelectorAll('.cv-nav-btn[data-nav]').forEach(btn => {
      btn.addEventListener('click', () => {
        const nav = btn.getAttribute('data-nav');
        if (nav === 'syllabus' && syllabusPdfUrl) {
          openPdfModal(syllabusPdfUrl, name + ' — Syllabus');
        } else {
          openCanvasViewer({ kind: nav, courseId, courseKey, courseName: name, url });
        }
      });
    });
    externalizeLinks(body);
  }

const MOD_TYPE_ICON = {
    File: '📄', Assignment: '📝', Quiz: '❓', Discussion: '💬',
    Page: '📃', ExternalTool: '🔗', ExternalUrl: '🌐', SubHeader: '▸'
  };

async function renderModules(modal, opts) {
    const { courseId, courseName, url } = opts;
    const mods = await fetchAllPages(`${origin}/api/v1/courses/${courseId}/modules?include[]=items&per_page=100`, apiHeaders(), 5);

    setOpenTabHref(modal, url || null);
    setViewerTitle(modal, courseName ? courseName + ' — Modules' : 'Modules');

    const body = bodyEl(modal);
    if (!mods.length) {
      body.innerHTML = '<div class="canvas-viewer-scroll"><p class="cv-empty">This course doesn\'t have any modules.</p></div>';
      return;
    }

    body.innerHTML = `
    <div class="canvas-viewer-scroll">
    <div class="cv-course-row"><span class="course-tag-chip">${escapeHTML(opts.courseKey || '')}</span> ${escapeHTML(courseName || '')}</div>
    <h1 class="cv-title">🗂 Modules</h1>
    ${mods.map(mod => {
      const items = Array.isArray(mod.items) ? mod.items : [];
      return `
      <div class="cv-module">
      <div class="cv-module-header"><span class="cv-module-title">${escapeHTML(mod.name || 'Module')}</span><span class="cv-module-count">${items.length} item${items.length === 1 ? '' : 's'}</span></div>
      ${items.length ? `
        <div class="cv-module-items">
        ${items.map(item => {
          const icon = MOD_TYPE_ICON[item.type] || '📄';
          const pts = item.content_details && item.content_details.points_possible != null ? formatScore(item.content_details.points_possible) + ' pts' : null;
          const due = item.content_details && item.content_details.due_at ? fmtDate(item.content_details.due_at) : null;
          const locked = !!(item.content_details && item.content_details.locked_for_user);
          const isHeader = item.type === 'SubHeader';
          if (isHeader) return `<div class="cv-module-item cv-module-subheader">${escapeHTML(item.title || '')}</div>`;
          return `
          <div class="cv-module-item" data-mitem="${escapeHTML(item.id)}" data-mtype="${escapeHTML(item.type || '')}" data-mtitle="${escapeHTML(item.title || '')}" data-mcontent="${escapeHTML(item.content_id != null ? item.content_id : '')}" data-murl="${escapeHTML(item.html_url || '')}" ${locked ? 'data-mlocked="1"' : ''}>
          <span class="cv-module-item-icon">${icon}</span>
          <span class="cv-module-item-name">${escapeHTML(item.title || 'Unnamed item')}${locked ? ' <span class="cv-lock-badge">🔒</span>' : ''}</span>
          <span class="cv-module-item-meta">${chipsHtml([pts, due])}</span>
          </div>`;
        }).join('')}
        </div>` : '<div class="cv-empty cv-module-empty">No items.</div>'}
      </div>`;
    }).join('')}
    </div>`;

    body.querySelectorAll('.cv-module-item[data-mitem]').forEach(row => {
      row.addEventListener('click', () => {
        const type = row.getAttribute('data-mtype');
        const contentId = row.getAttribute('data-mcontent');
        const title = row.getAttribute('data-mtitle') || 'Item';
        if (type === 'Assignment' && contentId) {
          openCanvasViewer({ kind: 'assignment', courseId, assignmentId: contentId, courseKey: opts.courseKey, courseName, title, url });
        } else if (type === 'File' && contentId) {
          filePreview(courseId, contentId, title + ' — preview');
        } else {
          window.open(row.getAttribute('data-murl') || `${origin}/courses/${courseId}/modules/items/${row.getAttribute('data-mitem')}`, '_blank');
        }
      });
    });
  }

const MIME_ICON = {
    pdf: '📕', doc: '📘', docx: '📘', ppt: '📙', pptx: '📙', xls: '📗', xlsx: '📗',
    image: '🖼', video: '🎬', audio: '🎵', zip: '🗜', text: '📄', html: '🌐'
  };

function mimeIcon(contentType) {
    const ct = String(contentType || '').toLowerCase();
    if (ct.includes('pdf')) return MIME_ICON.pdf;
    if (ct.includes('word') || ct.includes('officedocument')) return MIME_ICON.doc;
    if (ct.includes('powerpoint')) return MIME_ICON.ppt;
    if (ct.includes('excel') || ct.includes('spreadsheet')) return MIME_ICON.xls;
    if (ct.startsWith('image/')) return MIME_ICON.image;
    if (ct.startsWith('video/')) return MIME_ICON.video;
    if (ct.startsWith('audio/')) return MIME_ICON.audio;
    if (ct.includes('zip') || ct.includes('compressed')) return MIME_ICON.zip;
    if (ct.startsWith('text/')) return MIME_ICON.text;
    if (ct.includes('html')) return MIME_ICON.html;
    return '📄';
  }

async function renderFiles(modal, opts) {
    const { courseId, courseName, url } = opts;
    const files = await fetchAllPages(`${origin}/api/v1/courses/${courseId}/files?per_page=100`, apiHeaders(), 5);

    setOpenTabHref(modal, url || null);
    setViewerTitle(modal, courseName ? courseName + ' — Files' : 'Files');

    const body = bodyEl(modal);
    if (!files.length) {
      body.innerHTML = '<div class="canvas-viewer-scroll"><p class="cv-empty">No files uploaded to this course.</p></div>';
      return;
    }

    body.innerHTML = `
    <div class="canvas-viewer-scroll">
    <div class="cv-course-row"><span class="course-tag-chip">${escapeHTML(opts.courseKey || '')}</span> ${escapeHTML(courseName || '')}</div>
    <h1 class="cv-title">📁 Files</h1>
    <div class="cv-file-list">
    ${files.map(f => `
      <div class="cv-file-row ${f.locked ? 'cv-file-locked' : ''}">
      <span class="cv-file-icon">${mimeIcon(f.content_type)}</span>
      <span class="cv-file-name" title="${escapeHTML(f.display_name || f.filename || '')}">${escapeHTML(f.display_name || f.filename || 'file')}${f.locked ? ' 🔒' : ''}</span>
      <span class="cv-file-meta">${escapeHTML(formatBytes(f.size))}${f.updated_at && fmtDate(f.updated_at) ? ' · ' + escapeHTML(fmtDate(f.updated_at)) : ''}</span>
      <span class="cv-file-actions">
      <button type="button" class="doc-preview-btn-top cv-file-btn" data-file-id="${escapeHTML(f.id)}" data-file-name="${escapeHTML(f.display_name || f.filename || 'File')}">Preview</button>
      <a class="doc-preview-btn-top" href="${escapeHTML(fileDownloadUrl(courseId, f.id))}" download target="_blank" rel="noopener noreferrer">Download ⤓</a>
      </span>
      </div>`).join('')}
    </div>
    </div>`;

    body.querySelectorAll('[data-file-id]').forEach(btn => {
      btn.addEventListener('click', () => filePreview(courseId, btn.getAttribute('data-file-id'), btn.getAttribute('data-file-name') + ' — preview'));
    });
  }

async function renderGrades(modal, opts) {
    const { courseId, courseName, courseKey, url } = opts;
    const assigns = await fetchAllPages(`${origin}/api/v1/courses/${courseId}/assignments?per_page=100&include[]=submission&order_by=due_at`, apiHeaders(), 5);

    setOpenTabHref(modal, url || null);
    setViewerTitle(modal, courseName ? courseName + ' — Grades' : 'Grades');

    const body = bodyEl(modal);
    if (!assigns.length) {
      body.innerHTML = '<div class="canvas-viewer-scroll"><p class="cv-empty">No graded assignments on record.</p></div>';
      return;
    }

    const graded = assigns.filter(a => a.submission && a.submission.workflow_state === 'graded'
    && a.submission.score !== null && a.submission.score !== undefined);
    const gradedTotal = graded.reduce((sum, a) => sum + (a.submission.score || 0), 0);
    const possible = assigns.reduce((sum, a) => sum + (a.points_possible || 0), 0);

    body.innerHTML = `
    <div class="canvas-viewer-scroll">
    <div class="cv-course-row"><span class="course-tag-chip">${escapeHTML(courseKey || '')}</span> ${escapeHTML(courseName || '')}</div>
    <h1 class="cv-title">📊 Grades</h1>
    <div class="cv-chips">
    ${chipsHtml([graded.length ? '✅ ' + graded.length + ' graded' : null, possible ? '🏆 ' + formatScore(possible) + ' pts total' : null, possible ? 'Σ ' + formatScore((gradedTotal / possible) * 100) + '% of points' : null])}
    </div>
    <div class="cv-grade-table">
    ${assigns.map(a => {
      const sub = a.submission || null;
      const points = a.points_possible !== null && a.points_possible !== undefined ? formatScore(a.points_possible) : null;
      const due = fmtDate(a.due_at);
      let scoreChip = '<span class="cv-grade-status cv-grade-missing">Not submitted</span>';
      let scoreText = null;
      if (sub && sub.workflow_state !== 'unsubmitted') {
        if (sub.workflow_state === 'graded' && sub.score !== null && sub.score !== undefined) {
          scoreText = formatScore(sub.score) + (points ? ' / ' + points : '');
          scoreChip = `<span class="cv-grade-status cv-grade-done">${scoreText}</span>`;
        } else {
          scoreChip = '<span class="cv-grade-status cv-grade-pending">Submitted</span>';
        }
      }
      return `
      <div class="cv-grade-row" data-gaid="${escapeHTML(a.id)}">
      <span class="cv-grade-title">${escapeHTML(a.name || 'Assignment')}</span>
      <span class="cv-grade-meta">${escapeHTML(due || '')}</span>
      ${scoreChip}
      </div>`;
    }).join('')}
    </div>
    </div>`;

    body.querySelectorAll('.cv-grade-row[data-gaid]').forEach(row => {
      row.addEventListener('click', () => {
        openCanvasViewer({ kind: 'assignment', courseId, assignmentId: row.getAttribute('data-gaid'), courseKey, courseName });
      });
    });
  }

// ---------------------------------------------------------------------------
//  Entry point
// ---------------------------------------------------------------------------

export function openCanvasViewer(opts) {
    const modal = ensureViewerModal();
    const body = bodyEl(modal);
    body.innerHTML = '<div class="canvas-viewer-loading"><div class="cv-spinner"></div><p>Loading from Canvas…</p></div>';
    setViewerTitle(modal, opts.title || 'Canvas');
    setOpenTabHref(modal, opts.url || null);
    modal.classList.add('is-open');

    (async () => {
      try {
        switch (opts.kind) {
          case 'assignment': await renderAssignment(modal, opts); break;
          case 'announcement': await renderAnnouncement(modal, opts); break;
          case 'course': await renderCourse(modal, opts); break;
          case 'modules': await renderModules(modal, opts); break;
          case 'files': await renderFiles(modal, opts); break;
          case 'grades': await renderGrades(modal, opts); break;
          default: throw new Error('Unknown viewer kind: ' + opts.kind);
        }
      } catch (err) {
        body.innerHTML = `
        <div class="canvas-viewer-scroll">
        <div class="cv-error">
        <p>Couldn't load this from Canvas right now.</p>
        <p class="cv-error-sub">${escapeHTML(err.message || '')}</p>
        <a class="doc-preview-btn-top" href="${escapeHTML(opts.url || '#')}" target="_blank" rel="noopener noreferrer">↗ Open in Canvas</a>
        </div>
        </div>`;
        console.warn('[YACE] canvas viewer failed:', err);
      }
    })();
  }