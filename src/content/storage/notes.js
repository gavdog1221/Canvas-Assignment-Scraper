import { NOTE_COLORS, STORAGE_KEY_NOTES } from '../constants.js';

// Sticky notes persist on the dashboard's own origin in localStorage (no
// cross-origin mirror needed — they're widget-only, unlike the WebCat reg
// data). Each note is { id, text, color, createdAt }.

export function getNotes() {
    try {
      const notes = JSON.parse(localStorage.getItem(STORAGE_KEY_NOTES) || '[]');
      return Array.isArray(notes) ? notes : [];
    } catch {
      return [];
    }
  }

function persist(notes) {
    try {
      localStorage.setItem(STORAGE_KEY_NOTES, JSON.stringify(notes));
    } catch (e) { /* storage full/blocked — keep the in-memory copy */ }
  }

export function addNote() {
    const notes = getNotes();
    const note = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
      text: '',
      color: NOTE_COLORS[notes.length % NOTE_COLORS.length],
      createdAt: Date.now(),
    };
    notes.unshift(note); // newest note goes on top
    persist(notes);
    return note;
  }

export function updateNoteText(id, text) {
    const notes = getNotes();
    const note = notes.find(n => n.id === id);
    if (note) {
      note.text = text;
      persist(notes);
    }
  }

export function setNoteColor(id, color) {
    const notes = getNotes();
    const note = notes.find(n => n.id === id);
    if (note) {
      note.color = color;
      persist(notes);
    }
  }

export function removeNote(id) {
    persist(getNotes().filter(n => n.id !== id));
  }