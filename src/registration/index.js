// index_2.js

import { getRegistrationData } from '../shared/registration-storage.js';
import { waitForElement, setInputValue } from './dom-utils.js';
import { computeTimeConflicts, scheduleLabel } from '../shared/schedule-conflicts.js';

function esc(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

const STATUS_ID = 'yace-reg-status';

function showStatus(text, tone = 'info') {
  let el = document.getElementById(STATUS_ID);
  if (!el) {
    el = document.createElement('div');
    el.id = STATUS_ID;
    document.body.appendChild(el);
  }
  el.className = `yace-reg-status yace-reg-status-${tone}`;
  el.textContent = text;
}

let termSelectionHandled = false;

// PAGE 1: Initial Term & RAC Code Selection Page (Before hitting Continue)
async function handleInitialTermPage(data) {
  if (termSelectionHandled) return true;

  // The combobox dropdown ONLY exists on the initial term selection screen
  const comboContainer = document.getElementById('term-search-combobox');
  if (!comboContainer) return false;

  showStatus('Initial Term Screen: Click the Term dropdown to select your semester.', 'info');

  // Wait for user to open the term dropdown
  const searchInput = await waitForElement(() => {
    const activeEl = document.activeElement;
    if (activeEl && activeEl.tagName === 'INPUT' && activeEl.type !== 'hidden') {
      return activeEl;
    }
    return comboContainer.querySelector('input:not([type="hidden"])');
  }, { timeout: 30000, interval: 200 });

  if (searchInput && data.term && !searchInput.value) {
    showStatus(`Typing "${data.term}" and selecting...`, 'info');
    
    // Type into term dropdown and press Enter
    setInputValue(searchInput, data.term);
    searchInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, bubbles: true }));
    searchInput.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', keyCode: 13, bubbles: true }));
    
    termSelectionHandled = true;
  }

  // Populate RAC/PIN code if the field is present on Page 1
  if (data.racCode) {
    const racInput = await waitForElement(() => document.getElementById('input_alt_pin'), { timeout: 3000 });
    if (racInput && !racInput.value) {
      setInputValue(racInput, data.racCode);
      showStatus('Filled RAC code. Click Continue when ready.', 'ok');
      return true;
    }
  }

  return true;
}

let crnTabClickAttempted = false;

// PAGE 2: Main Registration Hub (After hitting Continue)
async function ensureEnterCrnTabActive() {
  const crnsContainer = document.getElementById('crns');
  if (crnsContainer && crnsContainer.children.length > 0) return true;

  const tabLink = document.getElementById('enterCRNs-tab');
  if (!tabLink) return false;
  if (crnTabClickAttempted) return false;
  
  crnTabClickAttempted = true;
  tabLink.click();
  return true;
}

async function ensureCrnRowCount(count) {
  const crnsContainer = document.getElementById('crns');
  if (!crnsContainer) return [];
  let inputs = Array.from(crnsContainer.querySelectorAll('input[id^="txt_crn"]'));
  let attempts = 0;
  
  while (inputs.length < count && attempts < count + 2) {
    const addBtn = document.getElementById('addAnotherCRN');
    if (!addBtn) break;
    const before = inputs.length;
    addBtn.click();
    await waitForElement(
      () => crnsContainer.querySelectorAll('input[id^="txt_crn"]').length > before ? true : null,
      { timeout: 3000 },
    );
    inputs = Array.from(crnsContainer.querySelectorAll('input[id^="txt_crn"]'));
    attempts++;
  }
  return inputs;
}

async function fillCrns(data) {
  // 1. Force navigate to "Enter CRNs" tab
  const tabReady = await ensureEnterCrnTabActive();
  if (!tabReady) return false;

  const crnsContainer = document.getElementById('crns');
  const firstCrnInput = await waitForElement(
    () => crnsContainer ? crnsContainer.querySelector('input[id^="txt_crn"]') : null,
    { timeout: 4000 },
  );

  if (!firstCrnInput) {
    showStatus('Click the "Enter CRNs" tab to reveal input fields.', 'warn');
    return false;
  }

  const crns = (data.crns || []).map(c => c.trim()).filter(Boolean);
  if (!crns.length) {
    showStatus('No saved CRNs found in storage.', 'warn');
    return true;
  }

  // 2. Ensure enough rows exist and populate each CRN
  const inputs = await ensureCrnRowCount(crns.length);
  
  crns.forEach((crn, i) => {
    if (inputs[i]) {
      inputs[i].removeAttribute('disabled');
      inputs[i].removeAttribute('readonly');

      // Dispatch full input sequence to update Banner UI
      setInputValue(inputs[i], crn);

      // Force Banner Backbone model synchronization
      if (window.Registration && window.Registration.models && window.Registration.models.crnModel) {
        try {
          window.Registration.models.crnModel.set(`crn_${i}`, crn);
        } catch (e) {
          // Model sync fallback
        }
      }
    }
  });

  showStatus(`Filled ${Math.min(crns.length, inputs.length)} CRN(s). Click Add to Summary when ready.`, 'ok');
  showCrnPreview(data); // fire-and-forget preview (never blocks autofill)
  return true;
}

// --- CRN preview panel (course info + time conflicts, advisory only) ---

const PREVIEW_ID = 'yace-crn-preview';
let previewShown = false;

function getPreviewPanel() {
  let panel = document.getElementById(PREVIEW_ID);
  if (!panel) {
    panel = document.createElement('div');
    panel.id = PREVIEW_ID;
    panel.className = 'yace-crn-preview';
    panel.innerHTML = `
      <div class="yace-pv-head">
        <span>🔎 CRN preview</span>
        <button type="button" class="yace-pv-close" aria-label="Dismiss">&times;</button>
      </div>
      <div class="yace-pv-body"></div>
      <div class="yace-pv-conflicts"></div>
    `;
    panel.querySelector('.yace-pv-close').addEventListener('click', () => {
      panel.classList.add('yace-pv-hidden');
    });
    document.body.appendChild(panel);
  }
  return panel;
}

function renderSectionRow(section) {
  if (section.error) {
    return `
      <div class="yace-pv-row yace-pv-error">
        <div class="yace-pv-code">CRN ${esc(section.crn)}</div>
        <div class="yace-pv-meta">${esc(section.error)}</div>
      </div>
    `;
  }
  const online = !(section.days && section.days.length) && !section.start && !section.end
    && /online/i.test(section.title || '');
  const sched = scheduleLabel(section, { online });
  const place = [section.building, section.room].filter(Boolean).join(' ');
  const metaBits = [sched, place, section.credits ? `${section.credits} cr` : ''].filter(Boolean);
  const size = section.classSize ? `Class size: ${section.classSize}` : '';
  const reqs = [
    section.prereqs ? `Prereq: ${section.prereqs}` : '',
    section.coreqs ? `Coreq: ${section.coreqs}` : '',
    section.equivalents ? `Equivalent: ${section.equivalents}` : '',
  ].filter(Boolean);
  return `
    <div class="yace-pv-row">
      <div class="yace-pv-code">${esc(section.code || ('CRN ' + section.crn))} <span class="yace-pv-crn">CRN ${esc(section.crn)}</span></div>
      <div class="yace-pv-title">${esc(section.title)}</div>
      <div class="yace-pv-meta">${esc(metaBits.join(' · '))}${section.instructor ? ' · ' + esc(section.instructor) : ''}</div>
      ${size ? `<div class="yace-pv-seats">${esc(size)}</div>` : ''}
      ${reqs.length ? `<div class="yace-pv-reqs">${reqs.map(r => esc(r)).join('<br>')}</div>` : ''}
    </div>
  `;
}

function renderPreviewConflicts(panel, sections) {
  const box = panel.querySelector('.yace-pv-conflicts');
  const found = sections.filter(s => !s.error);
  const schedulable = found.filter(s => s.days && s.days.length && s.start && s.end);
  box.innerHTML = '';
  if (schedulable.length < 2) return;

  const conflicts = computeTimeConflicts(schedulable);
  if (conflicts.length) {
    box.innerHTML = conflicts.map(c => {
      return `
        <div class="yace-pv-conflict">
          ⚠ <strong>${esc(c.a.code || ('CRN ' + c.a.crn))}</strong> (${esc(scheduleLabel(c.a))})
          × <strong>${esc(c.b.code || ('CRN ' + c.b.crn))}</strong> (${esc(scheduleLabel(c.b))})
          — overlaps on ${esc(c.dayLabel)}
        </div>
      `;
    }).join('');
    box.classList.add('yace-pv-conflicts-on');
  } else {
    box.innerHTML = '<div class="yace-pv-ok">No time conflicts among these CRNs.</div>';
  }
}

async function showCrnPreview(data) {
  if (previewShown) return;
  const crns = (data.crns || []).map((c) => c.trim()).filter(Boolean);
  if (!crns.length) return;
  previewShown = true;

  const panel = getPreviewPanel();
  panel.classList.remove('yace-pv-hidden');
  panel.querySelector('.yace-pv-body').innerHTML = '<div class="yace-pv-note">Looking up CRNs…</div>';
  panel.querySelector('.yace-pv-conflicts').innerHTML = '';

  // Resolved in the background from the public course catalog
  // (courses.unh.edu) — no WebCat session or tab required.
  let msg;
  try {
    msg = await browser.runtime.sendMessage({ type: 'FETCH_WEBCAT_CRN', crns, term: data.term });
  } catch (e) {
    msg = { success: false, error: String((e && e.message) || e) };
  }
  if (!msg || !msg.success) {
    panel.querySelector('.yace-pv-body').innerHTML =
      `<div class="yace-pv-note yace-pv-error">${esc((msg && msg.error) || 'Lookup failed.')}</div>`;
    return;
  }

  const sections = msg.sections || [];
  panel.querySelector('.yace-pv-body').innerHTML = sections.map(renderSectionRow).join('');
  renderPreviewConflicts(panel, sections);
}

async function tick() {
  const data = await getRegistrationData();
  if (!data.term && !data.racCode && !(data.crns || []).some(Boolean)) {
    return;
  }

  // DETECTION 1: We are on PAGE 2 (Class Search / CRN tabs are present)
  if (document.getElementById('enterCRNs-tab') || document.getElementById('tabs-classSearch')) {
    await fillCrns(data);
    return;
  }

  // DETECTION 2: We are on PAGE 1 (Initial Term / RAC selection screen)
  if (document.getElementById('term-search-combobox') || document.getElementById('input_alt_pin')) {
    await handleInitialTermPage(data);
    return;
  }
}

let ticking = false;
async function safeTick() {
  if (ticking) return;
  ticking = true;
  try {
    await tick();
  } catch (e) {
    console.warn('[YACE Registration] autofill error:', e);
  } finally {
    ticking = false;
  }
}

safeTick();
let debounceTimer = null;
const observer = new MutationObserver(() => {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(safeTick, 300);
});
observer.observe(document.body, { childList: true, subtree: true });