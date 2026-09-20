import { state } from '../state.js';
import { STORAGE_KEY_DOM_COLORS } from '../constants.js';

export function scrapeCanvasDashboardColors() {
    const cards = document.querySelectorAll('.ic-DashboardCard, [data-course-id]');
    cards.forEach(card => {
      let courseId = card.getAttribute('data-course-id');
      if (!courseId) {
        const link = card.querySelector('a[href*="/courses/"]');
        if (link) {
          const m = link.getAttribute('href').match(/\/courses\/(\d+)/);
          if (m) courseId = m[1];
        }
      }
      if (!courseId) return;

      const headerHero = card.querySelector('.ic-DashboardCard__header_hero, .ic-DashboardCard__headerImage');
      const targetEl = headerHero || card;
      const bg = window.getComputedStyle(targetEl).backgroundColor;

      if (bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') {
        state.domCourseColors[String(courseId)] = bg;
      }
    });

    try {
      localStorage.setItem(STORAGE_KEY_DOM_COLORS, JSON.stringify(state.domCourseColors));
    } catch {}
  }

export function parseColorToRgba(colorStr, alpha) {
    if (!colorStr) return null;
    const rgbMatch = colorStr.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
    if (rgbMatch) {
      return `rgba(${rgbMatch[1]}, ${rgbMatch[2]}, ${rgbMatch[3]}, ${alpha})`;
    }
    let c = colorStr.replace('#', '').trim();
    if (c.length === 3) c = c.split('').map(x => x + x).join('');
    const num = parseInt(c, 16);
    if (!isNaN(num) && c.length === 6) {
      const r = (num >> 16) & 255;
      const g = (num >> 8) & 255;
      const b = num & 255;
      return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }
    return null;
  }

// Minimalist palette: every course shares one quiet neutral accent, so the
// dashboard reads monochrome with the glass surfaces doing the work. The
// rainbow of per-course colors (scraped Canvas card colors / hash-cycled
// fallbacks) was the loudest part of the old scheme. Per-task custom colors
// chosen in the custom-assignment maker still override this per task.
const NEUTRAL_COURSE_PALETTE = {
    accent: '#cbd2da',
    glow: 'rgba(203, 210, 218, 0.28)',
    soft: 'rgba(203, 210, 218, 0.07)'
  };

export function getCourseColors(courseKey, canvasCourseId = null) {
    return NEUTRAL_COURSE_PALETTE;
  }
