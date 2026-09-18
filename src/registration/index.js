// index_2.js

import { getRegistrationData } from '../shared/registration-storage.js';
import { waitForElement, setInputValue } from './dom-utils.js';

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
  return true;
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