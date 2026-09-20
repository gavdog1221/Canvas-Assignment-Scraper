import { escapeHTML } from '../utils/text.js';
import { getRegistrationData, saveRegistrationData, clearRegistrationData } from '../../shared/registration-storage.js';
import { computeTimeConflicts, scheduleLabel } from '../../shared/schedule-conflicts.js';

export function renderRegistrationView(container) {
  container.innerHTML = `
    <div class="reg-panel">
      <div class="reg-intro">
        <strong>WebCat Registration Auto-Complete</strong>
        <p>
          Save your RAC code, term, and CRNs here. When you open the actual
          registration pages on <code>webcat.unh.edu</code> yourself, a small
          panel fills these into the page's fields for you.
          Note: You still need to click <code>continue</code> after RAC, and then <code>register</code> after CRNs.
        </p>
      </div>

      <div class="reg-field">
        <label for="reg-rac-input">RAC code (Registration Access Code)</label>
        <input id="reg-rac-input" type="password" autocomplete="off" placeholder="Enter your RAC code" />
      </div>

      <div class="reg-field">
        <label for="reg-term-input">Term</label>
        <input id="reg-term-input" type="text" autocomplete="off" placeholder="e.g. Fall 2026" />
        <span class="reg-field-hint">Type it exactly as it appears in the "Terms Open for Registration" dropdown on WebCat.</span>
      </div>

      <div class="reg-field">
        <label>CRNs</label>
        <div id="reg-crn-list" class="reg-crn-list"></div>
        <div class="reg-crn-actions">
          <button type="button" id="reg-add-crn" class="reg-secondary-btn">+ Add CRN</button>
          <button type="button" id="reg-preview-btn" class="reg-secondary-btn">🔎 Check CRNs</button>
        </div>
        <div id="reg-preview-results" class="reg-preview-results"></div>
      </div>

      <div class="reg-actions">
        <button type="button" id="reg-save-btn" class="reg-primary-btn">Save</button>
        <button type="button" id="reg-clear-btn" class="reg-secondary-btn">Clear saved data</button>
        <span id="reg-status" class="reg-status"></span>
      </div>

      <p class="reg-note">
        Stored locally in the extension only (never sent anywhere by this
        extension itself) &mdash; similar to a browser-saved password, but
        kept in plain form, so avoid this on a shared computer.
      </p>
    </div>
  `;

  const racInput = container.querySelector('#reg-rac-input');
  const termInput = container.querySelector('#reg-term-input');
  const crnList = container.querySelector('#reg-crn-list');
  const addCrnBtn = container.querySelector('#reg-add-crn');
  const saveBtn = container.querySelector('#reg-save-btn');
  const clearBtn = container.querySelector('#reg-clear-btn');
  const status = container.querySelector('#reg-status');

  function flashStatus(text, ok) {
    status.textContent = text;
    status.className = 'reg-status ' + (ok ? 'reg-status-ok' : 'reg-status-error');
    setTimeout(() => { status.textContent = ''; }, 2500);
  }

  function addCrnRow(value = '') {
    const row = document.createElement('div');
    row.className = 'reg-crn-row';
    row.innerHTML = `
      <input type="text" class="reg-crn-input" maxlength="5" placeholder="CRN" value="${escapeHTML(value)}" />
      <button type="button" class="reg-remove-crn" aria-label="Remove CRN">&times;</button>
    `;
    row.querySelector('.reg-remove-crn').addEventListener('click', () => {
      if (crnList.children.length > 1) {
        row.remove();
      } else {
        row.querySelector('.reg-crn-input').value = '';
      }
    });
    crnList.appendChild(row);
  }

  addCrnBtn.addEventListener('click', () => addCrnRow(''));

  saveBtn.addEventListener('click', async () => {
    const crns = Array.from(crnList.querySelectorAll('.reg-crn-input')).map(i => i.value.trim());
    saveBtn.disabled = true;
    const ok = await saveRegistrationData({ racCode: racInput.value, term: termInput.value.trim(), crns });
    saveBtn.disabled = false;
    flashStatus(ok ? 'Saved.' : 'Failed to save — see console.', ok);
  });

  clearBtn.addEventListener('click', async () => {
    await clearRegistrationData();
    racInput.value = '';
    termInput.value = '';
    crnList.innerHTML = '';
    addCrnRow('');
    flashStatus('Cleared.', true);
  });

  const previewBtn = container.querySelector('#reg-preview-btn');
  const previewResults = container.querySelector('#reg-preview-results');

  function renderPreview(sections, conflicts, termCode) {
    let html = '';
    if (termCode) {
      html += `<div class="reg-preview-term">WebCat term code <code>${escapeHTML(termCode)}</code></div>`;
    }
    const withSched = (sections || []).filter(s => !s.error && s.days && s.days.length && s.start && s.end);
    if (conflicts && conflicts.length) {
      html += `<div class="reg-preview-conflicts">${conflicts.map(c => `
        <div class="reg-preview-conflict">⚠ <strong>${escapeHTML(c.a.code || ('CRN ' + c.a.crn))}</strong> (${escapeHTML(scheduleLabel(c.a))}) × <strong>${escapeHTML(c.b.code || ('CRN ' + c.b.crn))}</strong> (${escapeHTML(scheduleLabel(c.b))}) — overlaps on ${escapeHTML(c.dayLabel)}</div>`).join('')}</div>`;
    } else if (withSched.length >= 2) {
      html += `<div class="reg-preview-conflicts reg-preview-ok">No time conflicts among these CRNs.</div>`;
    }
    if (!sections || !sections.length) {
      html += `<div class="reg-preview-note">Nothing to show yet — enter CRNs and a term above, then hit 🔎 Check CRNs.</div>`;
    }
    sections.forEach(section => {
      if (section.error) {
        html += `
          <div class="reg-preview-row reg-preview-error">
            <div class="reg-preview-code">CRN ${escapeHTML(section.crn)}</div>
            <div class="reg-preview-meta">${escapeHTML(section.error)}</div>
          </div>`;
        return;
      }
      const online = !(section.days && section.days.length) && !section.start && !section.end
        && /online/i.test(section.title || '');
      const sched = scheduleLabel(section, { online });
      const place = [section.building, section.room].filter(Boolean).join(' ');
      const bits = [sched, place, section.credits ? `${section.credits} cr` : ''].filter(Boolean);
      const size = section.classSize ? `Class size: ${section.classSize}` : '';
      const reqs = [
        section.prereqs ? `Prereq: ${section.prereqs}` : '',
        section.coreqs ? `Coreq: ${section.coreqs}` : '',
        section.equivalents ? `Equivalent: ${section.equivalents}` : '',
      ].filter(Boolean);
      html += `
        <div class="reg-preview-row">
          <div class="reg-preview-code">${escapeHTML(section.code || ('CRN ' + section.crn))}</div>
          <div class="reg-preview-title">${escapeHTML(section.title)}</div>
          <div class="reg-preview-meta">${escapeHTML(bits.join(' · '))}${section.instructor ? ' · ' + escapeHTML(section.instructor) : ''}</div>
          ${size ? `<div class="reg-preview-seats">${escapeHTML(size)}</div>` : ''}
          ${reqs.length ? `<div class="reg-preview-reqs">${reqs.map(r => escapeHTML(r)).join('<br>')}</div>` : ''}
        </div>`;
    });
    previewResults.innerHTML = html;
  }

  previewBtn.addEventListener('click', async () => {
    const crns = Array.from(crnList.querySelectorAll('.reg-crn-input')).map(i => i.value.trim()).filter(Boolean);
    const term = termInput.value.trim();
    if (!crns.length) {
      previewResults.innerHTML = '<div class="reg-preview-note">Enter at least one CRN to look up.</div>';
      return;
    }
    previewBtn.disabled = true;
    previewResults.innerHTML = '<div class="reg-preview-note">Looking up on courses.unh.edu…</div>';
    let msg;
    try {
      msg = await browser.runtime.sendMessage({ type: 'FETCH_WEBCAT_CRN', crns, term });
    } catch (e) {
      msg = { success: false, error: String((e && e.message) || e) };
    }
    previewBtn.disabled = false;
    if (!msg || !msg.success) {
      previewResults.innerHTML = `<div class="reg-preview-note reg-preview-error">Lookup failed: ${escapeHTML((msg && msg.error) || 'unknown error')}</div>`;
      return;
    }
    const conflicts = computeTimeConflicts(msg.sections || []);
    renderPreview(msg.sections || [], conflicts, msg.termCode);
  });

  (async () => {
    const data = await getRegistrationData();
    racInput.value = data.racCode;
    termInput.value = data.term;
    crnList.innerHTML = '';
    (data.crns.length ? data.crns : ['']).forEach(addCrnRow);
  })();
}
