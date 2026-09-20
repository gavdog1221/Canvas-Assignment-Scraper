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

      <div class="reg-field">
        <label for="reg-course-search-input">Or find a course</label>
        <div class="reg-course-search-row">
          <input id="reg-course-search-input" type="text" autocomplete="off" placeholder="e.g. differential equations, math 527, CS 501" />
          <button type="button" id="reg-course-search-btn" class="reg-secondary-btn">🔎 Search</button>
        </div>
        <span class="reg-field-hint">
          Searches courses.unh.edu by course name or code. Each result lists
          its prerequisites, co-requisites, and equivalents (like the site's
          "Equivalent(s)") along with every published section, with a
          one-click way to add that CRN to your list.
        </span>
        <div id="reg-course-results" class="reg-course-results"></div>
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

  const courseSearchInput = container.querySelector('#reg-course-search-input');
  const courseSearchBtn = container.querySelector('#reg-course-search-btn');
  const courseResults = container.querySelector('#reg-course-results');

  // "MATH 527 (03) - Differential Equations with Linear Algebra" ->
  // { code: "MATH 527", section: "03", name: "Differential Equations ..." }
  function parseCourseTitle(title) {
    const m = String(title || '').match(/^([A-Z]{2,5}\s*\d{3}[A-Z]?)\s*\((\d{2})\)\s*-\s*(.+)$/i);
    if (m) {
      return { code: m[1].replace(/\s+/g, ' ').toUpperCase(), section: m[2], name: m[3].trim() };
    }
    const dash = String(title || '').indexOf(' - ');
    if (dash > 0) {
      return { code: String(title).slice(0, dash).trim(), section: '', name: String(title).slice(dash + 3).trim() };
    }
    return { code: '', section: '', name: String(title || '').trim() };
  }

  function addCrnToForm(crn) {
    const existing = Array.from(crnList.querySelectorAll('.reg-crn-input')).map(i => i.value.trim());
    if (existing.includes(crn)) {
      flashStatus(`CRN ${crn} is already in your list.`, false);
      return;
    }
    addCrnRow(crn);
    flashStatus(`Added CRN ${crn}.`, true);
  }

  function renderSearchSectionDetail(msg) {
    if (!msg || !msg.success || !msg.sections || !msg.sections.length) {
      return `<div class="reg-preview-note reg-preview-error">${escapeHTML((msg && msg.error) || 'Lookup failed.')}</div>`;
    }
    const section = msg.sections[0];
    if (section.error) {
      return `<div class="reg-preview-note reg-preview-error">${escapeHTML(section.error)}</div>`;
    }
    const online = !(section.days && section.days.length) && !section.start && !section.end
      && /online/i.test(section.title || '');
    const place = [section.building, section.room].filter(Boolean).join(' ');
    const bits = [scheduleLabel(section, { online }), place, section.credits ? `${section.credits} cr` : '', section.instructor].filter(Boolean);
    const reqs = [
      section.prereqs ? `Prereq: ${section.prereqs}` : '',
      section.coreqs ? `Coreq: ${section.coreqs}` : '',
      section.equivalents ? `Equivalent: ${section.equivalents}` : '',
    ].filter(Boolean);
    return `
      <div class="reg-preview-meta">${escapeHTML(bits.join(' · '))}</div>
      ${section.classSize ? `<div class="reg-preview-seats">Class size: ${section.classSize}</div>` : ''}
      ${reqs.length ? `<div class="reg-preview-reqs">${reqs.map(r => escapeHTML(r)).join('<br>')}</div>` : ''}
    `;
  }

  // Pull prereq / co-req / equivalent info once per course group (from the
  // newest section — it's identical across that course's sections).
  async function loadGroupRequirements(gi, group) {
    const reqsEl = document.getElementById('reg-search-reqs-' + gi);
    if (!reqsEl || !group.sections.length) return;
    reqsEl.innerHTML = '<span class="reg-search-req-muted">…</span>';
    const first = group.sections[0];
    let msg;
    try {
      msg = await browser.runtime.sendMessage({ type: 'FETCH_WEBCAT_CRN', crns: [first.crn], termCode: first.termCode });
    } catch (e) {
      msg = { success: false, error: String((e && e.message) || e) };
    }
    const section = msg && msg.success && msg.sections && msg.sections[0];
    if (!section || section.error) {
      reqsEl.textContent = '';
      return;
    }
    const reqs = [
      section.prereqs ? `Prereq: ${section.prereqs}` : '',
      section.coreqs ? `Coreq: ${section.coreqs}` : '',
      section.equivalents ? `Equivalent: ${section.equivalents}` : '',
    ].filter(Boolean);
    reqsEl.innerHTML = reqs.length
      ? reqs.map(r => `<span class="reg-search-req">${escapeHTML(r)}</span>`).join('')
      : '<span class="reg-search-req-muted">No prerequisites / co-requisites listed</span>';
  }

  async function runCourseSearch() {
    const q = courseSearchInput.value.trim();
    const term = termInput.value.trim();
    if (!q) {
      courseResults.innerHTML = '<div class="reg-preview-note">Enter a course name or code, e.g. "differential equations" or "math 527".</div>';
      return;
    }
    courseSearchBtn.disabled = true;
    courseResults.innerHTML = '<div class="reg-preview-note">Searching courses.unh.edu…</div>';
    let msg;
    try {
      msg = await browser.runtime.sendMessage({ type: 'FETCH_COURSE_SEARCH', query: q, term });
    } catch (e) {
      msg = { success: false, error: String((e && e.message) || e) };
    }
    courseSearchBtn.disabled = false;
    if (!msg || !msg.success) {
      courseResults.innerHTML = `<div class="reg-preview-note reg-preview-error">Search failed: ${escapeHTML((msg && msg.error) || 'unknown error')}</div>`;
      return;
    }
    const matches = msg.matches || [];
    if (!matches.length) {
      courseResults.innerHTML = `<div class="reg-preview-note">No courses match "<strong>${escapeHTML(q)}</strong>"${msg.filtered ? ` for term ${escapeHTML(term)}` : ''}. Try a different name or code.</div>`;
      return;
    }

    // Group all returned sections by course code ("MATH 527", "MATH 527H")
    const groups = new Map();
    matches.forEach(m => {
      const parsed = parseCourseTitle(m.title);
      const key = parsed.code || m.title;
      if (!groups.has(key)) groups.set(key, { code: parsed.code, name: parsed.name || m.title, sections: [] });
      groups.get(key).sections.push({ ...m, section: parsed.section });
    });
    const groupList = Array.from(groups.values()).slice(0, 6);
    // Newest term first within each group
    groupList.forEach(g => g.sections.sort((a, b) => String(b.termCode).localeCompare(String(a.termCode))));

    courseResults.innerHTML = `
      <div class="reg-preview-term">${escapeHTML(q)} — ${matches.length} section${matches.length === 1 ? '' : 's'}${msg.filtered ? ` in term ${escapeHTML(term)}` : ''}${matches.length > 50 ? ' (first 50 shown)' : ''}. Click a section's <strong>Details</strong> for schedule, prereqs, co-reqs &amp; equivalents.</div>
    `;

    groupList.forEach((group, gi) => {
      const sectionRows = group.sections.slice(0, 8).map(s => `
        <div class="reg-search-section-row">
          <span class="reg-search-sec">${escapeHTML(s.section ? 'Sec ' + s.section : '')}</span>
          <span class="reg-search-term">${escapeHTML(s.termLabel || s.termCode)}</span>
          <span class="reg-search-crn">CRN ${escapeHTML(s.crn)}</span>
          <span class="reg-search-crnactions">
            <button type="button" class="reg-secondary-btn reg-search-detail-btn" data-crn="${escapeHTML(s.crn)}" data-term="${escapeHTML(s.termCode)}">Details</button>
            <button type="button" class="reg-secondary-btn reg-search-add-btn" data-crn="${escapeHTML(s.crn)}">＋ CRN</button>
          </span>
        </div>
      `).join('');

      const extraSections = group.sections.length - 8;
      const groupDiv = document.createElement('div');
      groupDiv.className = 'reg-search-group';
      groupDiv.innerHTML = `
        <div class="reg-search-group-head">
          <span class="reg-search-code">${escapeHTML(group.code || 'Course')}</span>
          <span class="reg-search-name">${escapeHTML(group.name)}</span>
          <span class="reg-search-inline-reqs" id="reg-search-reqs-${gi}"></span>
        </div>
        <div class="reg-search-sections">${sectionRows}${extraSections > 0 ? `<div class="reg-search-req-muted">… and ${extraSections} more section${extraSections === 1 ? '' : 's'} for ${escapeHTML(group.code || 'this course')} (shown above are the newest terms).</div>` : ''}</div>
      `;
      courseResults.appendChild(groupDiv);
      loadGroupRequirements(gi, group);
    });
  }

  courseSearchBtn.addEventListener('click', runCourseSearch);
  courseSearchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') runCourseSearch();
  });

  courseResults.addEventListener('click', async (e) => {
    const detailBtn = e.target.closest('.reg-search-detail-btn');
    const addBtn = e.target.closest('.reg-search-add-btn');
    if (detailBtn) {
      const crn = detailBtn.getAttribute('data-crn');
      const termCode = detailBtn.getAttribute('data-term');
      const row = detailBtn.closest('.reg-search-section-row');
      let box = row.querySelector('.reg-search-row-detail');
      if (box && box.classList.contains('is-open')) {
        box.classList.remove('is-open');
        return;
      }
      if (!box) {
        box = document.createElement('div');
        box.className = 'reg-search-row-detail';
        row.appendChild(box);
      }
      box.classList.add('is-open');
      box.innerHTML = '<div class="reg-preview-note">Looking up…</div>';
      let msg;
      try {
        msg = await browser.runtime.sendMessage({ type: 'FETCH_WEBCAT_CRN', crns: [crn], termCode });
      } catch (err) {
        msg = { success: false, error: String((err && err.message) || err) };
      }
      box.innerHTML = renderSearchSectionDetail(msg);
    } else if (addBtn) {
      addCrnToForm(addBtn.getAttribute('data-crn'));
    }
  });

  (async () => {
    const data = await getRegistrationData();
    racInput.value = data.racCode;
    termInput.value = data.term;
    crnList.innerHTML = '';
    (data.crns.length ? data.crns : ['']).forEach(addCrnRow);
  })();
}
