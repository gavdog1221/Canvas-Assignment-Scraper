import { fetchEvents } from '../services/events-api.js';
import { escapeHTML } from '../utils/text.js';

// Campus & Tools "Events" tab — what's happening around UNH today.
//
// Live-parsed (via background.js FETCH_EVENTS, one fetch per calendar day):
//   - MUB "Upcoming Campus Events" cards (no dates on the page — each card is
//     a link to its /mub/events/<slug> program page)
//   - UNH Today story cards (also dateless on the homepage)
// Plus a static curated card of the dated calendars worth checking (athletics,
// campus rec, MUB) because those calendars are either SPAs or embed only.

const CURATED_CALENDARS = [
  { emoji: '🏅', name: 'UNH Athletics', desc: 'The dated calendar lives on unwildcats.com (a JS app — opens in the browser, not parseable here).', url: 'https://unhwildcats.com/calendar.aspx' },
  { emoji: '💪', name: 'Campus Rec', desc: 'Sports clubs, intramurals, group fitness & facility hours.', url: 'https://campusrec.unh.edu/' },
  { emoji: '🎭', name: 'MUB Calendar', desc: 'Late-night programming, films, concerts & student org events.', url: 'https://www.unh.edu/mub/events' },
  { emoji: '🚌', name: 'Wildcat Transit', desc: 'Route maps, stop times and service-date exceptions (holiday schedules).', url: 'https://www.unh.edu/transportation/' },
  { emoji: '🗞️', name: 'UNH Today', desc: 'Campus news, events roundups and research stories.', url: 'https://www.unh.edu/unhtoday/' },
  { emoji: '📚', name: 'Library Events', desc: 'Workshops, exhibits and scholar events at Dimond Library.', url: 'https://library.unh.edu/' },
];

export async function renderEventsView(container) {
    if (!container) return;
    container.innerHTML = '<div class="ev-loading">Fetching campus events…</div>';

    let data = null;
    try {
      data = await fetchEvents();
    } catch (e) {
      data = null;
    }

    if (!data) {
      container.innerHTML = `
      <div class="ev-view-header">
      <span class="ev-title">🗓️ What's Happening on Campus</span>
      <span class="ev-sub">Couldn't reach the campus pages. Try the curated calendar links below.</span>
      </div>
      <div class="ev-tab-scroll">${renderCalendarsCard()}</div>`;
      return;
    }

    container.innerHTML = `
    <div class="ev-view-header">
    <span class="ev-title">🗓️ What's Happening on Campus</span>
    <span class="ev-sub">Live from unh.edu — updated daily. These homepages list events without dates; tap through to the source for details.</span>
    </div>
    <div class="ev-tab-scroll">
    <section class="ev-section">
      <h3 class="ev-section-title">🎭 MUB &amp; Student Activities</h3>
      ${data.mub.length ? `
      <div class="ev-mub-grid">
      ${data.mub.map(ev => `
        <a class="ev-card" href="${escapeHTML(ev.url)}" target="_blank" rel="noopener noreferrer">
        <span class="ev-card-title">${escapeHTML(ev.title)}</span>
        <span class="ev-card-go">Open program page →</span>
        </a>`).join('')}
      </div>` : '<div class="ev-empty">No MUB event cards found right now.</div>'}
    </section>
    <section class="ev-section">
      <h3 class="ev-section-title">🗞️ UNH Today</h3>
      ${data.unhtoday.length ? `
      <ul class="ev-stories">
      ${data.unhtoday.map(s => `
        <li><a class="ev-story-link" href="${escapeHTML(s.url)}" target="_blank" rel="noopener noreferrer">${escapeHTML(s.title)}</a></li>`).join('')}
      </ul>` : '<div class="ev-empty">No UNH Today stories found right now.</div>'}
    </section>
    ${renderCalendarsCard()}
    </div>
    `;
  }

function renderCalendarsCard() {
    return `
    <section class="ev-section">
    <h3 class="ev-section-title">📅 Dated calendars &amp; more</h3>
    <div class="ev-mub-grid">
    ${CURATED_CALENDARS.map(c => `
      <a class="ev-card" href="${escapeHTML(c.url)}" target="_blank" rel="noopener noreferrer">
      <span class="ev-card-title">${escapeHTML(c.emoji)} ${escapeHTML(c.name)}</span>
      <span class="ev-card-desc">${escapeHTML(c.desc)}</span>
      <span class="ev-card-go">Open →</span>
      </a>`).join('')}
    </div>
    <div class="ev-fineprint">Athletics schedules moved to a browser-side app on unwildcats.com, so events from it aren't readable in an extension — the calendar link above opens it directly.</div>
    </section>`;
  }