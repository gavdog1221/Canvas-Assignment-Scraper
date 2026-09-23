import { state } from '../state.js';
import { openAssignmentModal } from '../components/assignment-modal.js';
import { closePdfModal } from '../components/pdf-modal.js';
import { closeSubmissionModal } from '../components/submission-modal.js';
import { closeCampusToolsModal, isCampusToolsModalOpen } from '../components/campus-tools-modal.js';

export function initKeyboardShortcuts() {
    window.addEventListener('keydown', (e) => {
      // Ignore when user is actively typing in inputs or textareas
      const tag = document.activeElement ? document.activeElement.tagName.toLowerCase() : '';
      if (tag === 'input' || tag === 'textarea') {
        if (e.key === 'Escape') {
          document.activeElement.blur();
        }
        return;
      }

      const anyModalOpen = document.querySelector('.doc-preview-modal.is-open');

      if (e.key === 'Escape') {
        if (isCampusToolsModalOpen()) {
          closeCampusToolsModal();
          return;
        }
        closePdfModal();
        closeSubmissionModal();
        const scModal = document.getElementById('canvas-shortcuts-modal');
        if (scModal) scModal.classList.remove('is-open');
        const amModal = document.getElementById('yace-assignment-modal');
        if (amModal) amModal.classList.remove('is-open');
        return;
      }

      if (e.key === 'n' && !anyModalOpen) {
        e.preventDefault();
        openAssignmentModal();
        return;
      }

      if (anyModalOpen) return;

      const cards = Array.from(document.querySelectorAll('#module-tasks-list .mod-task-card'));
      if (cards.length === 0) return;

      if (e.key === '/' || e.key === '?') {
        e.preventDefault();
        const searchInput = document.getElementById('task-search-input');
        if (searchInput) searchInput.focus();
        return;
      }

      if (e.key === 'j' || e.key === 'ArrowDown') {
        e.preventDefault();
        state.selectedTaskIndex = Math.min(state.selectedTaskIndex + 1, cards.length - 1);
        highlightSelectedCard(cards);
        return;
      }

      if (e.key === 'k' || e.key === 'ArrowUp') {
        e.preventDefault();
        state.selectedTaskIndex = Math.max(state.selectedTaskIndex - 1, 0);
        highlightSelectedCard(cards);
        return;
      }

      if (state.selectedTaskIndex >= 0 && state.selectedTaskIndex < cards.length) {
        const currentCard = cards[state.selectedTaskIndex];

        if (e.key === 'x') {
          e.preventDefault();
          const checkbox = currentCard.querySelector('.task-checkbox');
          if (checkbox) {
            checkbox.checked = !checkbox.checked;
            checkbox.dispatchEvent(new Event('change'));
          }
          return;
        }

        if (e.key === 'v') {
          e.preventDefault();
          const viewBtn = currentCard.querySelector('.doc-view-pill');
          if (viewBtn) viewBtn.click();
          return;
        }

        if (e.key === 'd') {
          const dlBtn = currentCard.querySelector('.download-pill');
          if (dlBtn) dlBtn.click();
          return;
        }

        if (e.key === 'u') {
          const uploadBtn = currentCard.querySelector('.gs-upload-pill');
          if (uploadBtn) uploadBtn.click();
          return;
        }

        if (e.key === 'o' || e.key === 'Enter') {
          const link = currentCard.querySelector('.mod-task-title');
          if (link && link.classList.contains('custom-task-title')) {
            link.click();
          } else if (link && link.href) {
            window.open(link.href, '_blank');
          }
          return;
        }
      }
    });
  }

export function highlightSelectedCard(cards) {
    cards.forEach((c, i) => {
      if (i === state.selectedTaskIndex) {
        c.classList.add('keyboard-selected');
        c.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      } else {
        c.classList.remove('keyboard-selected');
      }
    });
  }
