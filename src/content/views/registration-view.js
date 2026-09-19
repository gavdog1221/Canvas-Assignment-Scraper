import { escapeHTML } from '../utils/text.js';
import { getRegistrationData, saveRegistrationData, clearRegistrationData } from '../../shared/registration-storage.js';

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
        <button type="button" id="reg-add-crn" class="reg-secondary-btn">+ Add CRN</button>
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

  (async () => {
    const data = await getRegistrationData();
    racInput.value = data.racCode;
    termInput.value = data.term;
    crnList.innerHTML = '';
    (data.crns.length ? data.crns : ['']).forEach(addCrnRow);
  })();
}
