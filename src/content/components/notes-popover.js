import { NOTE_COLORS } from '../constants.js';
import { addNote, getNotes, removeNote, setNoteColor, updateNoteText } from '../storage/notes.js';
import { escapeHTML } from '../utils/text.js';

// Sticky Notes — a small floating pad opened from the 📝 button in the header
// controls. Notes persist to localStorage via storage/notes.js; the popover is
// a sibling of the hidden-courses popover so it floats over the fullscreen
// grid without reshuffling the layout.

let notesPopoverOpen = false;

function autoSize(textarea) {
    textarea.style.height = 'auto';
    textarea.style.height = textarea.scrollHeight + 'px';
  }

function renderNotesList(popover) {
    const list = popover.querySelector('.notes-list');
    const empty = popover.querySelector('.notes-empty');
    if (!list) return;

    const notes = getNotes();
    list.innerHTML = '';
    if (empty) empty.style.display = notes.length ? 'none' : '';

    notes.forEach(note => {
      const item = document.createElement('div');
      item.className = 'note-item';
      item.dataset.noteId = note.id;
      item.style.setProperty('--note-accent', note.color);
      item.innerHTML = `
      <textarea class="note-text" placeholder="Write something…" rows="2">${escapeHTML(note.text)}</textarea>
      <div class="note-footer">
      <div class="note-color-dots">
      ${NOTE_COLORS.map(c => `
        <button type="button" class="note-color-dot ${c === note.color ? 'active' : ''}" data-note-id="${escapeHTML(note.id)}" data-color="${escapeHTML(c)}" style="background:${escapeHTML(c)}" title="Note color"></button>`).join('')}
      </div>
      <button type="button" class="note-delete" data-note-id="${escapeHTML(note.id)}" title="Delete note">✕</button>
      </div>`;
      list.appendChild(item);

      const ta = item.querySelector('.note-text');
      autoSize(ta);
    });
  }

function bindEvents(popover) {
    popover.querySelector('.notes-add-btn').addEventListener('click', () => {
      addNote();
      renderNotesList(popover);
      const first = popover.querySelector('.note-item .note-text');
      if (first) {
        autoSize(first);
        first.focus();
      }
    });

    // Text edits save on every keystroke (cheap for a few notes) without
    // re-rendering, so focus/caret position survives typing.
    popover.querySelector('.notes-list').addEventListener('input', (e) => {
      const ta = e.target.closest('.note-text');
      if (!ta) return;
      const item = ta.closest('.note-item');
      if (!item) return;
      autoSize(ta);
      updateNoteText(item.dataset.noteId, ta.value);
    });

    popover.querySelector('.notes-list').addEventListener('click', (e) => {
      // Re-rendering below detaches the clicked element, so a bubbling click
      // would look "outside" the popover to the document-level close listener
      // and slam the panel shut. Keep it contained.
      e.stopPropagation();
      const dot = e.target.closest('.note-color-dot');
      if (dot) {
        setNoteColor(dot.getAttribute('data-note-id'), dot.getAttribute('data-color'));
        renderNotesList(popover);
        return;
      }
      const del = e.target.closest('.note-delete');
      if (del) {
        removeNote(del.getAttribute('data-note-id'));
        renderNotesList(popover);
        return;
      }
      // Clicks elsewhere inside a note (e.g. focusing the textarea) also stay
      // inside the popover — nothing else to do.
    });
  }

export function setNotesPopoverOpen(open) {
    notesPopoverOpen = open;
    const popover = document.getElementById('notes-popover');
    const btn = document.getElementById('toggle-notes-btn');
    if (popover) {
      popover.classList.toggle('is-visible', open);
      if (open) renderNotesList(popover);
    }
    if (btn) {
      btn.classList.toggle('active', open);
      btn.setAttribute('aria-expanded', String(open));
    }
  }

export function initNotesPopover() {
    const btn = document.getElementById('toggle-notes-btn');
    const popover = document.getElementById('notes-popover');
    if (!btn || !popover) return;

    bindEvents(popover);

    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      setNotesPopoverOpen(!notesPopoverOpen);
    });

    const closeBtn = popover.querySelector('.notes-popover-close');
    if (closeBtn) {
      closeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        setNotesPopoverOpen(false);
      });
    }

    document.addEventListener('click', (e) => {
      if (!notesPopoverOpen) return;
      const inPopover = popover.contains(e.target);
      const inBtn = btn.contains(e.target);
      if (!inPopover && !inBtn) setNotesPopoverOpen(false);
    });
  }