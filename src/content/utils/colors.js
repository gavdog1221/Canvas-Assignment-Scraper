import { state } from '../state.js';
import { FALLBACK_PALETTES, STORAGE_KEY_DOM_COLORS } from '../constants.js';

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

export function getCourseColors(courseKey, canvasCourseId = null) {
    let rawColor = null;

    if (canvasCourseId && state.domCourseColors[String(canvasCourseId)]) {
      rawColor = state.domCourseColors[String(canvasCourseId)];
    } else if (state.cachedCourseMap[courseKey]?.canvasCourseId) {
      const altId = state.cachedCourseMap[courseKey].canvasCourseId;
      rawColor = state.domCourseColors[String(altId)];
    }

    if (rawColor) {
      const glow = parseColorToRgba(rawColor, 0.45) || 'rgba(0, 242, 254, 0.45)';
      const soft = parseColorToRgba(rawColor, 0.14) || 'rgba(0, 242, 254, 0.14)';
      return { accent: rawColor, glow: glow, soft: soft };
    }

    let hash = 0;
    const str = courseKey || 'GENERAL';
    for (let i = 0; i < str.length; i++) {
      hash = (hash << 5) - hash + str.charCodeAt(i);
      hash |= 0;
    }
    const idx = Math.abs(hash) % FALLBACK_PALETTES.length;
    return FALLBACK_PALETTES[idx];
  }
