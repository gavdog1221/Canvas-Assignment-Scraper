import { origin } from '../constants.js';
import { getCsrfToken } from './canvas-api.js';

// Canvas submission API — same header contract as every other canvas-api call
// (credentials + Accept/X-Requested-With + the _csrf_token cookie). JSON posts
// add Content-Type: application/json; the multipart file-upload step must NOT
// set it manually (the browser derives the boundary).

export function submissionHeaders(json = false) {
    const headers = {
      'Accept': 'application/json',
      'X-Requested-With': 'XMLHttpRequest',
      'X-CSRF-Token': getCsrfToken()
    };
    if (json) headers['Content-Type'] = 'application/json';
    return headers;
  }

// Pull a human-readable message out of a failed Canvas response (its error
// shape varies: array of {message}, nested {field: [{message}]}, or a flat
// message/error string).
function errorMessage(res, data) {
    if (data && typeof data.message === 'string' && data.message) return data.message;
    if (data && typeof data.error === 'string' && data.error) return data.error;
    if (data && Array.isArray(data.errors)) {
      const msgs = data.errors
      .map(e => (e && (e.message || e.error_description)) || '')
      .filter(Boolean);
      if (msgs.length) return msgs.join('; ');
    }
    if (data && typeof data.errors === 'object' && data.errors !== null) {
      const lines = [];
      Object.keys(data.errors).forEach(key => {
        const v = data.errors[key];
        const msg = Array.isArray(v) ? (v[0] && v[0].message) || v[0] : (v && v.message) || v;
        if (msg) lines.push(`${key}: ${msg}`);
      });
      if (lines.length) return lines.join('; ');
    }
    return `Canvas returned HTTP ${res.status}.`;
  }

async function parseJsonOrThrow(res) {
    const text = await res.text();
    let data = null;
    try {
      data = JSON.parse(text);
    } catch (e) {
      // Non-JSON body — fall through to the status-based message.
    }
    if (!res.ok) throw new Error(errorMessage(res, data));
    return data;
  }

// Assignment metadata used to shape the submission popup: which online
// submission types the assignment accepts, the extensions allowed for uploads
// (for the file input's `accept`), lock state, points and due date.
export async function fetchAssignmentMeta(courseId, assignmentId) {
    const res = await fetch(
      `${origin}/api/v1/courses/${courseId}/assignments/${assignmentId}`,
      { credentials: 'include', headers: submissionHeaders(false) }
    );
    const a = await parseJsonOrThrow(res);
    return {
      submissionTypes: Array.isArray(a.submission_types) ? a.submission_types : [],
      allowedExtensions: Array.isArray(a.allowed_extensions) ? a.allowed_extensions : [],
      lockedForUser: !!a.locked_for_user,
      points: a.points_possible ?? null,
      dueAt: a.due_at || null,
      name: a.name || '',
      url: a.html_url || null
    };
  }

// JSON payload for the Submit-an-assignment endpoint:
//   POST /api/v1/courses/:course_id/assignments/:assignment_id/submissions
export function buildSubmissionPayload(type, { body = '', url = '', fileIds = [], comment = '' } = {}) {
    const payload = { submission: { submission_type: type } };
    if (type === 'online_text_entry') payload.submission.body = body;
    if (type === 'online_url') payload.submission.url = url;
    if (type === 'online_upload') payload.submission.file_ids = fileIds;
    if (comment && comment.trim()) payload.comment = { text_comment: comment.trim() };
    return payload;
  }

export async function submitAssignment(courseId, assignmentId, payload) {
    const res = await fetch(
      `${origin}/api/v1/courses/${courseId}/assignments/${assignmentId}/submissions`,
      {
        method: 'POST',
        credentials: 'include',
        headers: submissionHeaders(true),
        body: JSON.stringify(payload)
      }
    );
    return parseJsonOrThrow(res);
  }

// Three-step Canvas file upload for a submission attachment:
// 1. POST the submission-files endpoint -> { upload_url, upload_params }
// 2. multipart-POST the raw bytes to upload_url with upload_params + `file` last
// 3. follow the redirect (fetch does this automatically) -> file JSON with `id`
export async function uploadSubmissionFile(courseId, assignmentId, file) {
    const preRes = await fetch(
      `${origin}/api/v1/courses/${courseId}/assignments/${assignmentId}/submissions/self/files`,
      {
        method: 'POST',
        credentials: 'include',
        headers: submissionHeaders(true),
        body: JSON.stringify({
          name: file.name,
          size: file.size,
          content_type: file.type || 'application/octet-stream'
        })
      }
    );
    const pre = await parseJsonOrThrow(preRes);
    if (!pre || !pre.upload_url || !pre.upload_params) {
      throw new Error('Canvas did not provide an upload destination.');
    }

    const form = new FormData();
    Object.keys(pre.upload_params).forEach(k => form.append(k, pre.upload_params[k]));
    form.append('file', file); // must be the last field

    const upRes = await fetch(pre.upload_url, {
      method: 'POST',
      credentials: 'include',
      redirect: 'follow',
      headers: submissionHeaders(false),
      body: form
    });
    const data = await parseJsonOrThrow(upRes);
    const id = data && (data.id || (data.attachment && data.attachment.id));
    if (!id) throw new Error('Upload finished, but Canvas did not return a file ID.');
    return id;
  }