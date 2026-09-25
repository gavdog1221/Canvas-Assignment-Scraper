import { state } from '../state.js';
import { FALLBACK_PALETTES, STORAGE_KEY_DOM_COLORS } from '../constants.js';
import { getOptions } from '../options.js';

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

// Default look is monochrome: every course shares one quiet neutral accent,
// so the dashboard reads as one surface with the glass doing the work.
// Per-task custom colors chosen in the custom-assignment maker still override
// this per task.
const NEUTRAL_COURSE_PALETTE = {
    accent: '#cbd2da',
    glow: 'rgba(203, 210, 218, 0.28)',
    soft: 'rgba(203, 210, 218, 0.07)'
  };

// Course accents come from three places, in priority order:
//   1. the user's explicit per-course pick (Options → Class Colors),
//   2. the color scraped from that course's Canvas dashboard card, and
//   3. a deterministic hash-cycled fallback palette.
export function getCourseColors(courseKey, canvasCourseId = null) {
    const opts = getOptions();
    if (!opts.colorCourses) return NEUTRAL_COURSE_PALETTE;

    if (opts.courseColors && opts.courseColors[courseKey]) {
      return paletteFromHex(opts.courseColors[courseKey]);
    }

    if (canvasCourseId && state.domCourseColors[String(canvasCourseId)]) {
      return paletteFromHex(state.domCourseColors[String(canvasCourseId)]);
    }

    return FALLBACK_PALETTES[hashCourseKey(courseKey) % FALLBACK_PALETTES.length];
  }

function paletteFromHex(hex) {
    return {
      accent: hex,
      glow: parseColorToRgba(hex, 0.4) || 'rgba(255, 255, 255, 0.4)',
      soft: parseColorToRgba(hex, 0.16) || 'rgba(255, 255, 255, 0.16)'
    };
  }

// Small deterministic string hash so a course without a custom color keeps the
// same fallback palette across every render (and across page loads).
function hashCourseKey(courseKey) {
    const s = String(courseKey || '');
    let h = 0;
    for (let i = 0; i < s.length; i++) {
      h = (h * 31 + s.charCodeAt(i)) >>> 0;
    }
    return h;
  }

// Best-effort '#rrggbb' conversion for <input type="color"> values: accepts
// hex (#abc / #aabbcc) or rgb()/rgba() strings, returns null when unknown.
export function normalizeColorToHex(colorStr) {
    if (!colorStr) return null;
    if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(colorStr)) {
      let c = colorStr.slice(1).toLowerCase();
      if (c.length === 3) c = c.split('').map(x => x + x).join('');
      return '#' + c;
    }
    const m = colorStr.match(/rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})/i);
    if (m) {
      return '#' + [m[1], m[2], m[3]].map(n => parseInt(n, 10).toString(16).padStart(2, '0')).join('');
    }
    return null;
  }
