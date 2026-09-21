import {
  TRANSIT_ROUTES,
  CONNECTOR_SERVICES,
  cleanStopName,
  connectorStatus,
  getRoute,
  minutesToDisplay,
  nextDepartures,
  scheduleFor,
  todaysScheduleKey,
  TRANSPORT_LINKS,
} from '../services/transit-schedules.js';
import { escapeHTML } from '../utils/text.js';

// Campus & Tools "Bus" tab — next Wildcat Transit departures from the official
// 2026-27 timetables (scheduled times; live positions come from UNH's tracker,
// linked off each route). The Campus Connector is frequency-based, so it gets
// service-window cards instead of a table.

const DAY_LABELS = { weekday: 'Mon–Fri', saturday: 'Saturday', weekend: 'Sat–Sun' };

// In-memory selection for the session (route, direction, stop).
const busSelection = { routeId: '3A', dir: 'outbound', stopId: null };

let refreshTimer = null;

export function renderBusView(container) {
    if (!container) return;
    container.innerHTML = `
    <div class="bus-view-header">
    <span class="bus-view-title">🚌 Wildcat Transit</span>
    <span class="bus-view-note">Scheduled times from the official 2026-27 timetables. Buses may run late — track live on UNH's site.</span>
    </div>
    <div class="bus-route-pills">
    ${TRANSIT_ROUTES.map(r => `
      <button type="button" class="bus-pill ${busSelection.routeId === r.id ? 'active' : ''}" data-route="${r.id}" data-area="${escapeHTML(r.area)}">${escapeHTML(r.id)} <span class="bus-pill-area">${escapeHTML(r.area)}</span></button>
    `).join('')}
    <button type="button" class="bus-pill ${busSelection.routeId === 'connector' ? 'active' : ''}" data-route="connector">🔄 Connector</button>
    </div>
    <div class="bus-tab-scroll" id="bus-tab-scroll">
    <div class="bus-panel" id="bus-panel"></div>
    </div>
    <div class="bus-foot">
    <a href="${TRANSPORT_LINKS.home}" target="_blank" rel="noopener noreferrer">🚌 UNH Transportation</a> ·
    <a href="${TRANSPORT_LINKS.exceptions}" target="_blank" rel="noopener noreferrer">Service dates &amp; exceptions</a>
    </div>
    `;

    container.querySelectorAll('.bus-pill').forEach(pill => {
      pill.addEventListener('click', () => {
        busSelection.routeId = pill.getAttribute('data-route');
        busSelection.stopId = null;
        renderBusPanel(container);
        container.querySelectorAll('.bus-pill').forEach(p => {
          p.classList.toggle('active', p.getAttribute('data-route') === busSelection.routeId);
        });
      });
    });

    ensureRefreshTimer();
    renderBusPanel(container);
  }

function ensureRefreshTimer() {
    if (refreshTimer) return;
    refreshTimer = setInterval(() => {
      const modal = document.getElementById('campus-tools-modal');
      if (!modal || !modal.classList.contains('is-open')) return;
      const region = document.getElementById('bus-departures-region');
      if (region) renderDeparturesInto(region);
    }, 30000);
  }

function renderBusPanel(container) {
    const panel = container.querySelector('#bus-panel');
    if (!panel) return;
    if (busSelection.routeId === 'connector') {
      renderConnector(panel);
      return;
    }
    const route = getRoute(busSelection.routeId);
    if (!route) return;

    const sched = scheduleFor(route, new Date());
    const tbl = sched && sched.table ? sched.table[busSelection.dir] : null;
    const stops = (tbl && tbl.stops) || [];

    if (!busSelection.stopId || !stops.some(s => String(s.id) === busSelection.stopId)) {
      busSelection.stopId = stops.length ? String(stops[0].id) : null;
    }
    const currentStop = stops.find(s => String(s.id) === busSelection.stopId) || stops[0];

    panel.innerHTML = `
    <div class="bus-controls">
    <div class="bus-dir-toggle">
    <button type="button" class="bus-dir-btn ${busSelection.dir === 'outbound' ? 'active' : ''}" data-dir="outbound">→ ${escapeHTML(route.area)}</button>
    <button type="button" class="bus-dir-btn ${busSelection.dir === 'inbound' ? 'active' : ''}" data-dir="inbound">→ Durham</button>
    </div>
    ${stops.length ? `
    <label class="bus-stop-label" for="bus-stop-select">Stop</label>
    <select id="bus-stop-select" class="bus-stop-select">
      ${stops.map(s => `<option value="${s.id}" ${currentStop && String(s.id) === String(currentStop.id) ? 'selected' : ''}>${escapeHTML(cleanStopName(s))}</option>`).join('')}
    </select>` : ''}
    </div>
    <div class="bus-sched-note">${escapeHTML(routeDescriptor(route, sched))}</div>
    <div class="bus-departures" id="bus-departures-region"></div>
    `;

    panel.querySelector('.bus-dir-toggle').addEventListener('click', (e) => {
      const btn = e.target.closest('.bus-dir-btn');
      if (!btn) return;
      busSelection.dir = btn.getAttribute('data-dir');
      busSelection.stopId = null;
      renderBusPanel(container);
    });

    const select = panel.querySelector('#bus-stop-select');
    if (select) {
      select.addEventListener('change', () => {
        busSelection.stopId = select.value;
        renderBusPanel(container);
      });
    }

    const region = panel.querySelector('#bus-departures-region');
    if (region) renderDeparturesInto(region);
  }

function routeDescriptor(route, sched) {
    if (!sched || !sched.table) {
      const key = todaysScheduleKey(new Date());
      if (key === 'sunday') return `No ${route.id} service on Sundays — 4A/4B run across the weekend instead.`;
      return 'No scheduled service today.';
    }
    const runs = sched.table.outbound && sched.table.outbound.lines.length;
    const dayLabel = DAY_LABELS[sched.key] || 'Today';
    return `${route.id} ${route.area === 'Dover' ? '(Dover · left via NH-108, returns via NH-155)' : '(Portsmouth · Rte 4 corridor)'} · ${dayLabel} · ${runs} run${runs === 1 ? '' : 's'}.`;
  }

function renderDeparturesInto(region) {
    const now = new Date();
    const route = getRoute(busSelection.routeId);
    if (!route) return;
    const sched = scheduleFor(route, now);
    const tbl = sched && sched.table ? sched.table[busSelection.dir] : null;
    const stops = (tbl && tbl.stops) || [];
    const stop = stops.find(s => String(s.id) === busSelection.stopId) || stops[0];

    if (!tbl) {
      region.innerHTML = `<div class="bus-empty">No scheduled service for ${escapeHTML(route.id)} today.</div>`;
      return;
    }
    if (!stop) {
      region.innerHTML = `<div class="bus-empty">Pick a stop above.</div>`;
      return;
    }

    const res = nextDepartures(route.id, stop.id, now, 4);
    const when = `${escapeHTML(cleanStopName(stop))}`;

    if (!res.departures.length) {
      region.innerHTML = `<div class="bus-empty">No more ${escapeHTML(route.id)} departures from <strong>${when}</strong> after ${escapeHTML(minutesToDisplay(now.getHours() * 60 + now.getMinutes()))} today.</div>`;
      return;
    }

    const nowMin = now.getHours() * 60 + now.getMinutes();
    region.innerHTML = `
    <div class="bus-dep-head">Next from <strong>${when}</strong></div>
    <div class="bus-dep-list">
    ${res.departures.map((d, i) => {
      // The first row may already be a couple of minutes in the past (the bus
      // you just missed) — only tag it "boarding soon" if it is still coming.
      const soon = i === 0 && d.min >= nowMin && (d.min - nowMin) <= 5;
      return `
      <div class="bus-dep-row ${soon ? 'is-soon' : ''}">
      <span class="bus-dep-time">${escapeHTML(minutesToDisplay(d.min))}</span>
      <span class="bus-dep-dir">${escapeHTML(d.dirLabel)}</span>
      ${soon ? '<span class="bus-dep-soon">boarding soon</span>' : ''}
      </div>`;
    }).join('')}
    </div>
    <div class="bus-track">
    <a href="${TRANSPORT_LINKS[route.live === 'route-3-dover' ? 'route3' : 'route4']}" target="_blank" rel="noopener noreferrer">📡 Track ${escapeHTML(route.id)} live on UNH's site</a>
    </div>
    `;
  }

function renderConnector(panel) {
    const now = new Date();
    panel.innerHTML = `
    <div class="connector-intro">The Campus Connector loops run every few minutes on a fixed loop — no printed timetable. Status below is computed from the service windows.</div>
    <div class="connector-grid">
    ${CONNECTOR_SERVICES.map(service => {
      const status = connectorStatus(service, now);
      const statusClass = { open: 'is-open', later: 'is-later', done: 'is-done', none: 'is-none' }[status.state] || 'is-none';
      return `
      <div class="connector-card">
      <div class="connector-head">
      <span class="connector-name">${escapeHTML(service.emoji)} ${escapeHTML(service.name)}</span>
      <span class="connector-status ${statusClass}">${escapeHTML(status.label)}</span>
      </div>
      <div class="connector-when">
      ${service.when.map(w => `
        <div class="connector-when-row"><span class="connector-days">${escapeHTML(w.days.join(', '))}</span><span class="connector-hours">${escapeHTML(w.open)} – ${escapeHTML(w.close)}</span></div>
      `).join('')}
      </div>
      <div class="connector-freq">Frequency: ${escapeHTML(service.freq)}</div>
      ${service.note ? `<div class="connector-note">${escapeHTML(service.note)}</div>` : ''}
      </div>`;
    }).join('')}
    </div>
    <div class="connector-track">
    <a href="${TRANSPORT_LINKS.home}" target="_blank" rel="noopener noreferrer">📡 Track the connector live via UNH's site</a>
    </div>
    `;
  }