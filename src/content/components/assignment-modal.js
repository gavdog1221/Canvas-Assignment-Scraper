import { state } from '../state.js';
import { CUSTOM_COLOR_PRESETS, STORAGE_KEY_DONE, STORAGE_KEY_STARRED } from '../constants.js';
import { updateHiddenMenuButton } from '../components/widget-shell.js';
import { getCompletedTasks } from '../storage/completed-tasks.js';
import { generateCustomId, generateOccurrences, getCustomAssignments, mergeCustomTasksIntoCourseMap, saveCustomAssignments } from '../storage/custom-assignments.js';
import { getStarredTasks } from '../storage/starred-tasks.js';
import { localDateKey } from '../utils/dates.js';
import { normalizeCourseCode } from '../utils/text.js';
import { renderCurrentView, renderFilterPills, renderWorkloadStrip, updateProgressBar } from '../views/upcoming-view.js';

export function ensureAssignmentModal() {
    let modal = document.getElementById('yace-assignment-modal');
    if (modal) return modal;

    modal = document.createElement('div');
    modal.id = 'yace-assignment-modal';
    modal.className = 'doc-preview-modal assignment-modal';
    modal.setAttribute('data-theme', state.currentTheme);
    modal.innerHTML = `
    <div class="doc-preview-backdrop"></div>
    <div class="doc-preview-dialog assignment-dialog">
    <div class="doc-preview-header">
    <span class="doc-preview-title" id="assignment-modal-title">New Custom Assignment</span>
    <button type="button" class="doc-preview-close" id="assignment-modal-close" title="Close">✕</button>
    </div>
    <div class="assignment-modal-body">

    <label class="am-label">Title</label>
    <input type="text" id="am-title" class="am-input" maxlength="120" placeholder="e.g. Read Chapter 4, Study for Midterm...">

    <div class="am-row">
    <div class="am-col">
    <label class="am-label">Course / Label</label>
    <select id="am-course-select" class="am-input"></select>
    <input type="text" id="am-course-custom" class="am-input am-hidden" placeholder="Custom label, e.g. Personal, Job Apps...">
    </div>
    <div class="am-col am-col-narrow">
    <label class="am-label">Points <span class="am-optional">(optional)</span></label>
    <input type="number" id="am-points" class="am-input" min="0" step="0.5" placeholder="—">
    </div>
    </div>

    <div class="am-row">
    <div class="am-col">
    <label class="am-label">Due date</label>
    <input type="date" id="am-date" class="am-input">
    </div>
    <div class="am-col am-col-narrow">
    <label class="am-label">Due time</label>
    <input type="time" id="am-time" class="am-input" value="23:59">
    </div>
    </div>

    <label class="am-label">Repeat</label>
    <select id="am-repeat-freq" class="am-input">
    <option value="none">Does not repeat</option>
    <option value="daily">Daily</option>
    <option value="weekly">Weekly</option>
    <option value="monthly">Monthly</option>
    </select>

    <div id="am-repeat-options" class="am-hidden">
    <div class="am-row am-interval-row">
    <span class="am-inline-label">Every</span>
    <input type="number" id="am-interval" class="am-input am-input-tiny" min="1" max="52" value="1">
    <span class="am-inline-label" id="am-interval-unit">week(s)</span>
    </div>

    <div id="am-weekday-picker" class="am-weekday-picker am-hidden">
    <button type="button" class="am-day-pill" data-day="0">S</button>
    <button type="button" class="am-day-pill" data-day="1">M</button>
    <button type="button" class="am-day-pill" data-day="2">T</button>
    <button type="button" class="am-day-pill" data-day="3">W</button>
    <button type="button" class="am-day-pill" data-day="4">T</button>
    <button type="button" class="am-day-pill" data-day="5">F</button>
    <button type="button" class="am-day-pill" data-day="6">S</button>
    </div>

    <label class="am-label">Ends</label>
    <div class="am-ends-group">
    <label class="am-radio-row"><input type="radio" name="am-ends" value="never" checked> Never</label>
    <label class="am-radio-row">On <input type="date" id="am-end-date" class="am-input am-input-inline" disabled></label>
    <label class="am-radio-row">After <input type="number" id="am-end-count" class="am-input am-input-tiny" min="1" max="200" value="10" disabled> occurrences</label>
    </div>
    </div>

    <label class="am-label">Color</label>
    <div class="am-color-row" id="am-color-row">
    <button type="button" class="am-color-swatch am-color-auto selected" data-color="" title="Auto (course color)">Auto</button>
    </div>

    <label class="am-label">Notes <span class="am-optional">(optional)</span></label>
    <textarea id="am-notes" class="am-input am-textarea" rows="3" placeholder="Any extra detail worth remembering..."></textarea>

    <label class="am-checkbox-row"><input type="checkbox" id="am-pin-top"> Pin to top ⭐</label>
    </div>
    <div class="doc-preview-header assignment-modal-footer">
    <button type="button" class="am-btn am-btn-danger am-hidden" id="am-delete-btn">Delete</button>
    <div class="am-footer-right">
    <button type="button" class="am-btn am-btn-ghost" id="am-cancel-btn">Cancel</button>
    <button type="button" class="am-btn am-btn-primary" id="am-save-btn">Save Assignment</button>
    </div>
    </div>
    </div>
    `;
    document.body.appendChild(modal);

    const colorRow = modal.querySelector('#am-color-row');
    CUSTOM_COLOR_PRESETS.forEach(hex => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'am-color-swatch';
      btn.style.setProperty('--swatch-color', hex);
      btn.setAttribute('data-color', hex);
      btn.title = hex;
      colorRow.appendChild(btn);
    });

    const close = () => modal.classList.remove('is-open');
    modal.querySelector('.doc-preview-backdrop').addEventListener('click', close);
    modal.querySelector('#assignment-modal-close').addEventListener('click', close);
    modal.querySelector('#am-cancel-btn').addEventListener('click', close);

    const freqSelect = modal.querySelector('#am-repeat-freq');
    const repeatOptions = modal.querySelector('#am-repeat-options');
    const weekdayPicker = modal.querySelector('#am-weekday-picker');
    const intervalUnit = modal.querySelector('#am-interval-unit');

    freqSelect.addEventListener('change', () => {
      const freq = freqSelect.value;
      repeatOptions.classList.toggle('am-hidden', freq === 'none');
      weekdayPicker.classList.toggle('am-hidden', freq !== 'weekly');
      intervalUnit.textContent = freq === 'daily' ? 'day(s)' : freq === 'monthly' ? 'month(s)' : 'week(s)';
      if (freq === 'weekly' && state.modalSelectedDays.size === 0) {
        const dateVal = modal.querySelector('#am-date').value;
        const d = dateVal ? new Date(`${dateVal}T00:00:00`) : new Date();
        state.modalSelectedDays.add(d.getDay());
        syncWeekdayPills(modal);
      }
    });

    weekdayPicker.querySelectorAll('.am-day-pill').forEach(pill => {
      pill.addEventListener('click', () => {
        const day = parseInt(pill.getAttribute('data-day'), 10);
        if (state.modalSelectedDays.has(day)) state.modalSelectedDays.delete(day);
        else state.modalSelectedDays.add(day);
        syncWeekdayPills(modal);
      });
    });

    modal.querySelectorAll('input[name="am-ends"]').forEach(radio => {
      radio.addEventListener('change', () => {
        const mode = modal.querySelector('input[name="am-ends"]:checked').value;
        modal.querySelector('#am-end-date').disabled = mode !== 'on';
        modal.querySelector('#am-end-count').disabled = mode !== 'after';
      });
    });

    modal.querySelector('#am-course-select').addEventListener('change', (e) => {
      const customInput = modal.querySelector('#am-course-custom');
      const isCustom = e.target.value === '__custom__';
      customInput.classList.toggle('am-hidden', !isCustom);
      if (isCustom) customInput.focus();
    });

      colorRow.addEventListener('click', (e) => {
        const btn = e.target.closest('.am-color-swatch');
        if (!btn) return;
        state.modalSelectedColor = btn.getAttribute('data-color') || '';
        colorRow.querySelectorAll('.am-color-swatch').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
      });

      modal.querySelector('#am-save-btn').addEventListener('click', () => saveAssignmentFromModal(modal));
      modal.querySelector('#am-delete-btn').addEventListener('click', () => deleteAssignmentFromModal(modal));

      return modal;
  }

export function syncWeekdayPills(modal) {
    modal.querySelectorAll('.am-day-pill').forEach(pill => {
      const day = parseInt(pill.getAttribute('data-day'), 10);
      pill.classList.toggle('selected', state.modalSelectedDays.has(day));
    });
  }

export function openAssignmentModal(templateId = null) {
    const modal = ensureAssignmentModal();
    modal.setAttribute('data-theme', state.currentTheme);
    state.editingAssignmentId = templateId;

    const titleEl = modal.querySelector('#assignment-modal-title');
    const deleteBtn = modal.querySelector('#am-delete-btn');
    const courseSelect = modal.querySelector('#am-course-select');
    const courseCustom = modal.querySelector('#am-course-custom');

    const existingKeys = Object.keys(state.cachedCourseMap).sort();
    courseSelect.innerHTML = '';
    existingKeys.forEach(k => {
      const opt = document.createElement('option');
      opt.value = k;
      opt.textContent = (state.cachedCourseMap[k] && state.cachedCourseMap[k].name) || k;
      courseSelect.appendChild(opt);
    });
    const customOpt = document.createElement('option');
    customOpt.value = '__custom__';
    customOpt.textContent = '+ New label...';
    courseSelect.appendChild(customOpt);

    const template = templateId ? getCustomAssignments().find(t => t.id === templateId) : null;

    if (template) {
      titleEl.textContent = 'Edit Custom Assignment';
      deleteBtn.classList.remove('am-hidden');
      modal.querySelector('#am-title').value = template.title;
      modal.querySelector('#am-points').value = (template.points === null || template.points === undefined) ? '' : template.points;
      modal.querySelector('#am-date').value = template.startDate;
      modal.querySelector('#am-time').value = template.time || '23:59';
      modal.querySelector('#am-notes').value = template.notes || '';
      modal.querySelector('#am-pin-top').checked = !!template.pinToTop;

      if (existingKeys.includes(template.courseKey)) {
        courseSelect.value = template.courseKey;
        courseCustom.classList.add('am-hidden');
        courseCustom.value = '';
      } else {
        courseSelect.value = '__custom__';
        courseCustom.classList.remove('am-hidden');
        courseCustom.value = template.courseLabel || template.courseKey;
      }

      const rep = template.repeat || { freq: 'none' };
      modal.querySelector('#am-repeat-freq').value = rep.freq || 'none';
      modal.querySelector('#am-interval').value = rep.interval || 1;
      state.modalSelectedDays = new Set(rep.daysOfWeek || []);
      modal.querySelector('#am-repeat-options').classList.toggle('am-hidden', (rep.freq || 'none') === 'none');
      modal.querySelector('#am-weekday-picker').classList.toggle('am-hidden', rep.freq !== 'weekly');
      modal.querySelector('#am-interval-unit').textContent = rep.freq === 'daily' ? 'day(s)' : rep.freq === 'monthly' ? 'month(s)' : 'week(s)';
      syncWeekdayPills(modal);

      const endMode = rep.endMode || 'never';
      modal.querySelectorAll('input[name="am-ends"]').forEach(r => { r.checked = r.value === endMode; });
      modal.querySelector('#am-end-date').value = rep.endDate || '';
      modal.querySelector('#am-end-date').disabled = endMode !== 'on';
      modal.querySelector('#am-end-count').value = rep.count || 10;
      modal.querySelector('#am-end-count').disabled = endMode !== 'after';

      state.modalSelectedColor = template.color || '';
    } else {
      titleEl.textContent = 'New Custom Assignment';
      deleteBtn.classList.add('am-hidden');
      modal.querySelector('#am-title').value = '';
      modal.querySelector('#am-points').value = '';
      const today = new Date();
      modal.querySelector('#am-date').value = localDateKey(today);
      modal.querySelector('#am-time').value = '23:59';
      modal.querySelector('#am-notes').value = '';
      modal.querySelector('#am-pin-top').checked = false;

      courseSelect.value = existingKeys.length ? existingKeys[0] : '__custom__';
      courseCustom.classList.toggle('am-hidden', courseSelect.value !== '__custom__');
      courseCustom.value = '';

      modal.querySelector('#am-repeat-freq').value = 'none';
      modal.querySelector('#am-interval').value = 1;
      state.modalSelectedDays = new Set([today.getDay()]);
      modal.querySelector('#am-repeat-options').classList.add('am-hidden');
      modal.querySelector('#am-weekday-picker').classList.add('am-hidden');
      modal.querySelector('#am-interval-unit').textContent = 'week(s)';
      syncWeekdayPills(modal);

      modal.querySelectorAll('input[name="am-ends"]').forEach(r => { r.checked = r.value === 'never'; });
      modal.querySelector('#am-end-date').value = '';
      modal.querySelector('#am-end-date').disabled = true;
      modal.querySelector('#am-end-count').value = 10;
      modal.querySelector('#am-end-count').disabled = true;

      state.modalSelectedColor = '';
    }

    modal.querySelectorAll('.am-color-swatch').forEach(b => {
      b.classList.toggle('selected', (b.getAttribute('data-color') || '') === state.modalSelectedColor);
    });

    modal.classList.add('is-open');
    setTimeout(() => {
      const titleInput = modal.querySelector('#am-title');
      if (titleInput) titleInput.focus();
    }, 50);
  }

export function saveAssignmentFromModal(modal) {
    const titleInput = modal.querySelector('#am-title');
    const title = titleInput.value.trim();
    if (!title) {
      titleInput.focus();
      return;
    }

    const dateInput = modal.querySelector('#am-date');
    const dateVal = dateInput.value;
    if (!dateVal) {
      dateInput.focus();
      return;
    }

    const timeVal = modal.querySelector('#am-time').value || '23:59';
    const pointsRaw = modal.querySelector('#am-points').value;
    const points = pointsRaw === '' ? null : Number(pointsRaw);
    const notes = modal.querySelector('#am-notes').value.trim();
    const pinToTop = modal.querySelector('#am-pin-top').checked;

    const courseSelect = modal.querySelector('#am-course-select');
    const courseCustomInput = modal.querySelector('#am-course-custom');
    let courseKey, courseLabel;
    if (courseSelect.value === '__custom__') {
      const raw = courseCustomInput.value.trim();
      if (!raw) {
        courseCustomInput.focus();
        return;
      }
      courseLabel = raw;
      courseKey = normalizeCourseCode(raw);
    } else {
      courseKey = courseSelect.value;
      courseLabel = (state.cachedCourseMap[courseKey] && state.cachedCourseMap[courseKey].name) || courseKey;
    }

    const freq = modal.querySelector('#am-repeat-freq').value;
    const interval = Math.max(1, parseInt(modal.querySelector('#am-interval').value, 10) || 1);
    const endMode = modal.querySelector('input[name="am-ends"]:checked').value;
    const endDateRaw = modal.querySelector('#am-end-date').value || null;
    const count = parseInt(modal.querySelector('#am-end-count').value, 10) || 10;

    const repeat = {
      freq,
      interval,
      daysOfWeek: freq === 'weekly' ? Array.from(state.modalSelectedDays) : [],
                                    endMode,
                                    endDate: endMode === 'on' ? endDateRaw : null,
                                    count: endMode === 'after' ? count : null
    };

    if (freq === 'weekly' && repeat.daysOfWeek.length === 0) {
      repeat.daysOfWeek = [new Date(`${dateVal}T00:00:00`).getDay()];
    }

    const list = getCustomAssignments();
    let template = state.editingAssignmentId ? list.find(t => t.id === state.editingAssignmentId) : null;
    if (!template) {
      template = { id: generateCustomId(), createdAt: Date.now() };
      list.push(template);
    }

    template.title = title;
    template.courseKey = courseKey;
    template.courseLabel = courseLabel;
    template.startDate = dateVal;
    template.time = timeVal;
    template.points = points;
    template.notes = notes;
    template.pinToTop = pinToTop;
    template.color = state.modalSelectedColor || null;
    template.repeat = repeat;

    saveCustomAssignments(list);
    mergeCustomTasksIntoCourseMap(state.cachedCourseMap);

    if (pinToTop) {
      const occurrences = generateOccurrences(template);
      const starred = getStarredTasks();
      occurrences.forEach(occ => {
        starred[`${template.id}_${localDateKey(occ)}`] = true;
      });
      localStorage.setItem(STORAGE_KEY_STARRED, JSON.stringify(starred));
    }

    renderFilterPills();
    updateHiddenMenuButton();
    updateProgressBar();
    renderWorkloadStrip();
    renderCurrentView();

    modal.classList.remove('is-open');
  }

export function deleteAssignmentFromModal(modal) {
    if (!state.editingAssignmentId) return;
    if (!confirm('Delete this custom assignment? This removes every occurrence in its recurrence series.')) return;

    const targetId = state.editingAssignmentId;
    const list = getCustomAssignments().filter(t => t.id !== targetId);
    saveCustomAssignments(list);

    const prefix = `${targetId}_`;
    const completed = getCompletedTasks();
    const starred = getStarredTasks();
    let changedCompleted = false;
    let changedStarred = false;
    Object.keys(completed).forEach(id => {
      if (id.startsWith(prefix)) { delete completed[id]; changedCompleted = true; }
    });
    Object.keys(starred).forEach(id => {
      if (id.startsWith(prefix)) { delete starred[id]; changedStarred = true; }
    });
    if (changedCompleted) localStorage.setItem(STORAGE_KEY_DONE, JSON.stringify(completed));
    if (changedStarred) localStorage.setItem(STORAGE_KEY_STARRED, JSON.stringify(starred));

    mergeCustomTasksIntoCourseMap(state.cachedCourseMap);
    renderFilterPills();
    updateHiddenMenuButton();
    updateProgressBar();
    renderWorkloadStrip();
    renderCurrentView();

    modal.classList.remove('is-open');
  }
