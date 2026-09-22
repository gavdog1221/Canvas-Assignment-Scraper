import { state } from '../state.js';
import { THEMES } from '../constants.js';
import {
  TAB_LABELS,
  OPTION_TAB_KEYS,
  NOTIF_OPTIONS,
  applyOptions,
  applyThemeFromOptions,
  getOptions,
  saveOptions,
} from '../options.js';
import { refreshCampusToolsPalette } from '../components/campus-tools-modal.js';
import { escapeHTML } from '../utils/text.js';

// Campus & Tools "Options" tab — theme picker (same storage key + DOM targets
// as the header theme dock), which view tabs are visible, and which badge
// notifications are shown. All of it persists to STORAGE_KEY_OPTIONS via
// options.js and applies instantly through applyOptions().

export function renderOptionsView(container) {
    if (!container) return;
    const opts = getOptions();
    // Only the assignment-universe tabs stay toggleable here. Grades / Info /
    // News are modular draggable tiles with their own visibility controls in
    // the main UI — exposing them in Options conflicts with that.
    const tabKeys = OPTION_TAB_KEYS.filter(k => TAB_LABELS[k] !== undefined);

    container.innerHTML = `
    <div class="opt-view-header">
    <span class="opt-title">⚙️ Options</span>
    <span class="opt-sub">Customize the dashboard — these settings are saved to this browser.</span>
    </div>
    <div class="opt-tab-scroll">
    <section class="opt-section">
    <h3 class="opt-section-title">🎨 Theme</h3>
    <div class="opt-theme-row">
    ${THEMES.map(t => `
      <button type="button" class="opt-theme-btn ${state.currentTheme === t.id ? 'active' : ''}" data-theme="${escapeHTML(t.id)}" title="${escapeHTML(t.label)}" aria-pressed="${state.currentTheme === t.id}">
      <span class="opt-theme-swatch" style="--gem-color: ${escapeHTML(t.color)};"></span>
      <span class="opt-theme-name">${escapeHTML(t.label)}</span>
      </button>`).join('')}
    </div>
    </section>

    <section class="opt-section">
    <h3 class="opt-section-title">🗂 View tabs</h3>
    <p class="opt-hint">Choose which tabs appear in the dashboard's view bar. If the last visible tab is hidden, a fallback keeps your assignments reachable.</p>
    <div class="opt-toggles">
    ${tabKeys.map(key => `
      <label class="opt-toggle">
      <input type="checkbox" data-opt="tab" data-key="${key}" ${opts.hiddenTabs.indexOf(key) === -1 ? 'checked' : ''}>
      <span>${escapeHTML(TAB_LABELS[key])}</span>
      </label>`).join('')}
    </div>
    </section>

    <section class="opt-section">
    <h3 class="opt-section-title">🔔 Notifications</h3>
    <div class="opt-toggles">
    ${NOTIF_OPTIONS.map(n => `
      <label class="opt-toggle">
      <input type="checkbox" data-opt="notif" data-key="${n.key}" ${opts.notif[n.key] === false ? '' : 'checked'}>
      <span>${escapeHTML(n.label)}</span>
      </label>`).join('')}
    </div>
    </section>
    </div>
    `;

    container.querySelectorAll('.opt-theme-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const themeId = btn.getAttribute('data-theme');
        if (!themeId) return;
        applyThemeFromOptions(themeId);
        refreshCampusToolsPalette();
        container.querySelectorAll('.opt-theme-btn').forEach(b => {
          const on = b.getAttribute('data-theme') === themeId;
          b.classList.toggle('active', on);
          b.setAttribute('aria-pressed', String(on));
        });
      });
    });

    container.querySelectorAll('input[data-opt="tab"]').forEach(input => {
      input.addEventListener('change', () => {
        const key = input.getAttribute('data-key');
        const optsNow = getOptions();
        let hidden = optsNow.hiddenTabs.slice();
        if (input.checked) {
          hidden = hidden.filter(k => k !== key);
        } else {
          // Never hide the last remaining tab — the dashboard needs at least
          // one view to land on.
          const visible = tabKeys.filter(k => hidden.indexOf(k) === -1);
          if (visible.length <= 1 && visible.indexOf(key) !== -1) {
            input.checked = true;
            return;
          }
          hidden.push(key);
        }
        saveOptions({ hiddenTabs: hidden });
        applyOptions();
      });
    });

    container.querySelectorAll('input[data-opt="notif"]').forEach(input => {
      input.addEventListener('change', () => {
        const key = input.getAttribute('data-key');
        const notif = Object.assign({}, getOptions().notif);
        notif[key] = input.checked;
        saveOptions({ notif });
        applyOptions();
      });
    });
  }