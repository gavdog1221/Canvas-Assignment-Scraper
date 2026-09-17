import { state } from '../state.js';

export function parseMenuHtml(htmlString) {
    if (!htmlString) return [];
    const doc = new DOMParser().parseFromString(htmlString, 'text/html');
    const meals = [];
    let currentMeal = null;
    let currentCategory = null;

    doc.querySelectorAll('.shortmenumeals, .shortmenucats, .shortmenurecipes').forEach(el => {
      if (el.classList.contains('shortmenumeals')) {
        const rawMealText = el.textContent.trim();
        // Check if FoodPro included times in the meal label (e.g., "Lunch (11:00am - 2:00pm)")
        const timeMatch = rawMealText.match(/\((.*?)\)/);
        const mealTitle = rawMealText.replace(/\(.*?\)/, '').trim();

        currentMeal = {
          meal: mealTitle,
          hours: timeMatch ? timeMatch[1] : null,
          categories: []
        };
        meals.push(currentMeal);
        currentCategory = null;
      } else if (el.classList.contains('shortmenucats') && currentMeal) {
        const catName = el.textContent.replace(/--/g, '').trim();
        currentCategory = { name: catName, items: [] };
        currentMeal.categories.push(currentCategory);
      } else if (el.classList.contains('shortmenurecipes') && currentCategory) {
        const dishName = el.textContent.trim();
        if (!dishName) return;

        const traits = [];
        const container = el.closest('tr') || el;
        const imgs = container.querySelectorAll('img');

        imgs.forEach(img => {
          const alt = (img.getAttribute('alt') || '').toLowerCase();
          const src = (img.getAttribute('src') || '').toLowerCase();
          if (alt.includes('vegan') || src.includes('vgn') || src.includes('vegan')) {
            traits.push('vgn');
          } else if (alt.includes('vegetarian') || src.includes('veg')) {
            traits.push('veg');
          }
          if (alt.includes('gluten') || src.includes('gf') || alt.includes('wheat free')) {
            traits.push('gf');
          }
          if (alt.includes('halal') || src.includes('halal')) {
            traits.push('halal');
          }
        });

        currentCategory.items.push({
          name: dishName,
          traits: Array.from(new Set(traits))
        });
      }
    });

    return meals;
  }

export function parseMinutesFromTimeString(str) {
    const m = str.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)/i);
    if (!m) return null;
    let hours = parseInt(m[1], 10);
    const minutes = m[2] ? parseInt(m[2], 10) : 0;
    const isPm = m[3].toLowerCase() === 'pm';
    if (isPm && hours !== 12) hours += 12;
    if (!isPm && hours === 12) hours = 0;
    return hours * 60 + minutes;
  }

export function matchesDayAbbr(str, dayIdx) {
    // dayIdx: 0 = Sun, 1 = Mon, ..., 6 = Sat
    const map = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
    const target = map[dayIdx];
    const s = str.toLowerCase();

    // Check direct match, e.g. "sun:", "thu:"
    if (s.startsWith(target)) return true;

    // Check range matches, e.g. "mon - fri:", "mon - wed:"
    const rangeMatch = s.match(/([a-z]{3})\s*[-–—]\s*([a-z]{3})/i);
    if (rangeMatch) {
      const start = map.indexOf(rangeMatch[1].toLowerCase());
      const end = map.indexOf(rangeMatch[2].toLowerCase());
      if (start !== -1 && end !== -1) {
        if (start <= end) {
          return dayIdx >= start && dayIdx <= end;
        } else {
          // Wrapped range like Fri - Mon
          return dayIdx >= start || dayIdx <= end;
        }
      }
    }
    return false;
  }

export async function fetchLiveDiningHours() {
    if (state.cachedOfficialHours) return state.cachedOfficialHours;

    const response = await browser.runtime.sendMessage({ type: 'FETCH_DINING_HOURS' }).catch(() => null);
    if (!response || !response.success || !response.html) {
      return null;
    }

    const doc = new DOMParser().parseFromString(response.html, 'text/html');
    const todayIdx = new Date().getDay();
    const parsedHours = { 80: null, 30: null };

    // Break page into sections by dining hall
    const textAll = doc.body ? doc.body.innerText : '';
    const hocoIndex = textAll.search(/holloway commons/i);
    const phillyIndex = textAll.search(/philbrook/i);

    const sections = [];
    if (hocoIndex !== -1 && phillyIndex !== -1) {
      if (hocoIndex < phillyIndex) {
        sections.push({ hall: 80, text: textAll.slice(hocoIndex, phillyIndex) });
        sections.push({ hall: 30, text: textAll.slice(phillyIndex) });
      } else {
        sections.push({ hall: 30, text: textAll.slice(phillyIndex, hocoIndex) });
        sections.push({ hall: 80, text: textAll.slice(hocoIndex) });
      }
    }

    sections.forEach(({ hall, text }) => {
      const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
      const isCurrentlyOpen = text.toLowerCase().includes('currently open');

      let todayTimeRange = null;
      let isExplicitClosed = false;

      for (let i = 0; i < lines.length; i++) {
        if (matchesDayAbbr(lines[i], todayIdx)) {
          // Next 1 or 2 lines usually contain the time or "Closed"
          const nextLines = lines.slice(i + 1, i + 3).join(' ');
          if (/closed/i.test(nextLines)) {
            isExplicitClosed = true;
            break;
          }
          const m = nextLines.match(/(\d{1,2}(?::\d{2})?\s*(?:am|pm))\s*[-–—]\s*(\d{1,2}(?::\d{2})?\s*(?:am|pm))/i);
          if (m) {
            todayTimeRange = m;
            break;
          }
        }
      }

      parsedHours[hall] = {
        isCurrentlyOpen: isCurrentlyOpen,
        isExplicitClosed: isExplicitClosed,
        openStr: todayTimeRange ? todayTimeRange[1] : null,
        closeStr: todayTimeRange ? todayTimeRange[2] : null,
        openMin: todayTimeRange ? parseMinutesFromTimeString(todayTimeRange[1]) : null,
                     closeMin: todayTimeRange ? parseMinutesFromTimeString(todayTimeRange[2]) : null
      };
    });

    state.cachedOfficialHours = parsedHours;
    return parsedHours;
  }

export async function getDiningHallStatus(hallNum, meals) {
    const hoursData = await fetchLiveDiningHours();
    const live = hoursData ? hoursData[hallNum] : null;

    if (live) {
      if (live.isExplicitClosed) {
        return { isOpen: false, label: 'Closed Today' };
      }

      const now = new Date();
      const curMinutes = now.getHours() * 60 + now.getMinutes();

      if (live.openMin && live.closeMin) {
        const openStr = live.openStr.toUpperCase();
        const closeStr = live.closeStr.toUpperCase();

        if (curMinutes >= live.openMin && curMinutes < live.closeMin) {
          return { isOpen: true, label: `Open until ${closeStr}` };
        } else if (curMinutes < live.openMin) {
          return { isOpen: false, label: `Closed until ${openStr}` };
        } else {
          return { isOpen: false, label: `Closed for the night (at ${closeStr})` };
        }
      }

      if (live.isCurrentlyOpen) {
        const defaultClose = hallNum === 80 ? '9:00 PM' : '9:00 PM';
        return { isOpen: true, label: `Currently open (closes ~${defaultClose})` };
      }
    }

    // Secondary fallback based on current time
    const now = new Date();
    const curMinutes = now.getHours() * 60 + now.getMinutes();
    const openMin = 435; // 7:15 AM
    const closeMin = 1260; // 9:00 PM

    if (curMinutes >= openMin && curMinutes < closeMin) {
      return { isOpen: true, label: 'Open until 9:00 PM' };
    } else {
      return { isOpen: false, label: 'Closed until 7:15 AM' };
    }
  }

export async function ensureTodaysDiningMenus() {
    const todayKey = new Date().toDateString();
    if (state.diningCache.date === todayKey && Array.isArray(state.diningCache[80]) && Array.isArray(state.diningCache[30])) {
      return state.diningCache;
    }

    try {
      const [hocoRes, phillyRes] = await Promise.all([
        browser.runtime.sendMessage({ type: 'FETCH_DINING_MENU', locationNum: 80, locationName: 'Holloway Commons' }).catch(() => null),
                                                     browser.runtime.sendMessage({ type: 'FETCH_DINING_MENU', locationNum: 30, locationName: 'Philbrook' }).catch(() => null)
      ]);

      state.diningCache = {
        date: todayKey,
        80: (hocoRes && hocoRes.success && hocoRes.html) ? parseMenuHtml(hocoRes.html) : [],
                                    30: (phillyRes && phillyRes.success && phillyRes.html) ? parseMenuHtml(phillyRes.html) : []
      };
    } catch (err) {
      console.warn('[YACE] Dining fetch failure:', err);
      state.diningCache = { date: todayKey, 80: [], 30: [] };
    }

    return state.diningCache;
  }
