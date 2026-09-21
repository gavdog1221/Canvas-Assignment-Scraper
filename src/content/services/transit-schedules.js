// Wildcat Transit — next-departure lookups from the official 2026-27
// timetables (transcribed from UNH's schedule PDFs; verified per-run).
//
// Routes 3A/3B (Dover) and 4A/4B (Portsmouth) run fixed timetables; the
// Campus Connector runs frequency-based loops. There is no Sunday service on
// 3A/3B (Saturday only) while 4A/4B run Saturday AND Sunday from the same
// "weekend" table. Live vehicle positions are not scraped here — the view
// links out to UNH's official per-route pages, which embed the live tracker.
//
// Data shape per route, per service day:
//   { origin: stopId, lines: [minutes-of-day per run at origin],
//     stops: [{ id, name, offs: [minutes after origin departure per run] }] }
// A null offset means that run does not service that stop (e.g. "On Request
// Only" / "Not Serviced on This Run"), so it is skipped for departure times.

export const TRANSIT_ROUTES = [
  {
    id: '3A',
    area: 'Dover',
    live: 'route-3-dover',
    schedules: {
      weekday: {
        outbound: {
          origin: '101',
          lines: [400,465,535,725,935,1025],
          stops: [
            { id: 101, name: 'DEPART UNH McCONNELL HALL', offs: [0,0,0,0,0,0] },
            { id: 152, name: 'DEPART MITCHELL WAY @ McDANIEL DRIVE', offs: [1,1,1,1,1,1] },
            { id: 102, name: 'DEPART UNH KINGSBURY HALL', offs: [2,2,2,2,2,2] },
            { id: 103, name: 'DEPART UNH HEWITT HALL', offs: [2,2,2,2,2,2] },
            { id: 104, name: 'DEPART MAIN ST @ UNH THOMPSON HALL', offs: [5,5,5,5,5,5] },
            { id: 105, name: 'DEPART MAIN ST @ UNH HOLLOWAY COMMONS', offs: [6,6,6,6,6,6] },
            { id: 106, name: 'DEPART MAIN ST @ UNH HETZEL HALL', offs: [7,7,7,7,7,7] },
            { id: 203, name: "Arrive Shaw's Plaza", offs: [31,31,31,31,31,31] },
          ],
        },
        inbound: {
          origin: '203',
          lines: [431,496,566,756,966,1056],
          stops: [
            { id: 203, name: "Depart Shaw's Plaza", offs: [0,0,0,0,0,0] },
            { id: 214, name: 'Dover Transportation Center', offs: [6,6,6,6,6,6] },
            { id: 213, name: 'Chestnut Street @ Carswell Auto', offs: [5,5,5,5,5,5] },
            { id: 111, name: 'Madbury Road @ Rte 4', offs: [20,20,20,20,20,20] },
            { id: 183, name: 'ARRIVE GARRISON AVE @ STRAFFORD AVE', offs: [25,25,24,24,24,24] },
            { id: 116, name: 'ARRIVE GARRISON AVE @ SAWYER HALL', offs: [26,26,25,25,25,25] },
            { id: 105, name: 'ARRIVE MAIN ST @ UNH HOLLOWAY COMMONS', offs: [28,28,26,26,26,26] },
            { id: 1001, name: 'ARRIVE UNH McCONNELL HALL', offs: [30,30,28,28,28,28] },
          ],
        },
      },
      saturday: {
        outbound: {
          origin: '101',
          lines: [605,845,1115],
          stops: [
            { id: 101, name: 'DEPART UNH McCONNELL HALL', offs: [0,0,0] },
            { id: 152, name: 'DEPART MITCHELL WAY @ McDANIEL DRIVE', offs: [1,1,1] },
            { id: 102, name: 'DEPART UNH KINGSBURY HALL', offs: [2,2,2] },
            { id: 103, name: 'DEPART UNH HEWITT HALL', offs: [2,2,2] },
            { id: 104, name: 'DEPART MAIN ST @ UNH THOMPSON HALL', offs: [5,5,5] },
            { id: 105, name: 'DEPART MAIN ST @ UNH HOLLOWAY COMMONS', offs: [6,6,6] },
            { id: 106, name: 'DEPART MAIN ST @ UNH HETZEL HALL', offs: [7,7,7] },
            { id: 203, name: "Arrive Shaw's Plaza", offs: [31,31,31] },
          ],
        },
        inbound: {
          origin: '203',
          lines: [636,876,1146],
          stops: [
            { id: 203, name: "Depart Shaw's Plaza", offs: [0,0,0] },
            { id: 214, name: 'Dover Transportation Center', offs: [6,6,6] },
            { id: 213, name: 'Chestnut Street @ Carswell Auto', offs: [5,5,5] },
            { id: 111, name: 'Madbury Road @ Rte 4', offs: [20,20,20] },
            { id: 183, name: 'ARRIVE GARRISON AVE @ STRAFFORD AVE', offs: [25,25,25] },
            { id: 116, name: 'ARRIVE GARRISON AVE @ SAWYER HALL', offs: [26,26,26] },
            { id: 105, name: 'ARRIVE MAIN ST @ UNH HOLLOWAY COMMONS', offs: [27,27,27] },
            { id: 1001, name: 'ARRIVE UNH McCONNELL HALL', offs: [29,29,29] },
          ],
        },
      },
    },
  },
  {
    id: '3B',
    area: 'Dover',
    live: 'route-3-dover',
    schedules: {
      weekday: {
        outbound: {
          origin: '101',
          lines: [400,465,605,725,845,995,1085,1295],
          stops: [
            { id: 101, name: 'DEPART UNH McCONNELL HALL', offs: [0,0,0,0,0,0,0,0] },
            { id: 152, name: 'DEPART MITCHELL WAY @ McDANIEL DRIVE', offs: [1,1,1,1,1,1,1,1] },
            { id: 102, name: 'DEPART UNH KINGSBURY HALL', offs: [2,2,2,2,2,2,2,2] },
            { id: 103, name: 'DEPART UNH HEWITT HALL', offs: [2,2,2,2,2,2,2,2] },
            { id: 104, name: 'DEPART MAIN ST @ UNH THOMPSON HALL', offs: [5,5,5,5,5,5,5,5] },
            { id: 105, name: 'DEPART MAIN ST @ UNH HOLLOWAY COMMONS', offs: [6,6,6,6,6,6,6,6] },
            { id: 106, name: 'DEPART MAIN ST @ UNH HETZEL HALL', offs: [7,7,7,7,7,7,7,7] },
            { id: 117, name: 'Madbury Road @ Woodman Rd', offs: [8,8,8,8,8,8,8,8] },
            { id: 203, name: 'Arrive Shaws', offs: [31,31,31,31,31,31,31,31] },
          ],
        },
        inbound: {
          origin: '203',
          lines: [431,496,636,756,876,1026,1116,1326],
          stops: [
            { id: 203, name: 'Depart Shaws', offs: [0,0,0,0,0,0,0,0] },
            { id: 214, name: 'Dover Transportation Center', offs: [6,6,6,6,6,6,6,6] },
            { id: 116, name: 'ARRIVE GARRISON AVE @ SAWYER HALL', offs: [23,23,23,23,23,23,23,23] },
            { id: 105, name: 'ARRIVE MAIN ST @ UNH HOLLOWAY COMMONS', offs: [25,25,25,25,25,25,25,25] },
            { id: 1001, name: 'ARRIVE UNH McCONNELL HALL', offs: [27,27,27,27,27,27,27,27] },
          ],
        },
      },
      saturday: {
        outbound: {
          origin: '101',
          lines: [665,965,1205],
          stops: [
            { id: 101, name: 'DEPART UNH McCONNELL HALL', offs: [0,0,0] },
            { id: 152, name: 'DEPART MITCHELL WAY @ McDANIEL DRIVE', offs: [1,1,1] },
            { id: 102, name: 'DEPART UNH KINGSBURY HALL', offs: [2,2,2] },
            { id: 103, name: 'DEPART UNH HEWITT HALL', offs: [2,2,2] },
            { id: 104, name: 'DEPART MAIN ST @ UNH THOMPSON HALL', offs: [5,5,5] },
            { id: 105, name: 'DEPART MAIN ST @ UNH HOLLOWAY COMMONS', offs: [6,6,6] },
            { id: 106, name: 'DEPART MAIN ST @ UNH HETZEL HALL', offs: [7,7,7] },
            { id: 117, name: 'Madbury Road @ Woodman Rd', offs: [8,8,8] },
            { id: 203, name: "Arrive Shaw's Plaza", offs: [31,31,31] },
          ],
        },
        inbound: {
          origin: '203',
          lines: [696,996,1236],
          stops: [
            { id: 203, name: "Depart Shaw's Plaza", offs: [0,0,0] },
            { id: 214, name: 'Dover Transportation Center', offs: [6,6,6] },
            { id: 183, name: 'ARRIVE GARRISON AVE @ STRAFFORD AVE', offs: [23,23,23] },
            { id: 116, name: 'ARRIVE GARRISON AVE @ SAWYER HALL', offs: [24,24,24] },
            { id: 105, name: 'ARRIVE MAIN ST @ UNH HOLLOWAY COMMONS', offs: [25,25,25] },
            { id: 1001, name: 'ARRIVE UNH McCONNELL HALL', offs: [27,27,27] },
          ],
        },
      },
    },
  },
  {
    id: '4A',
    area: 'Portsmouth',
    live: 'route-4-portsmouth',
    schedules: {
      weekday: {
        outbound: {
          origin: '101',
          lines: [400,725,845,1085,1145],
          stops: [
            { id: 101, name: 'DEPART UNH McCONNELL HALL', offs: [0,0,0,0,0] },
            { id: 152, name: 'DEPART MITCHELL WAY @ McDANIEL DRIVE', offs: [1,1,1,1,1] },
            { id: 102, name: 'DEPART UNH KINGSBURY HALL', offs: [2,2,2,2,2] },
            { id: 103, name: 'DEPART UNH HEWITT HALL', offs: [2,2,2,2,2] },
            { id: 104, name: 'DEPART MAIN ST @ UNH THOMPSON HALL', offs: [5,5,5,5,5] },
            { id: 105, name: 'DEPART MAIN ST @ UNH HOLLOWAY COMMONS', offs: [6,6,6,6,6] },
            { id: 106, name: 'DEPART MAIN ST @ UNH HETZEL HALL', offs: [7,7,7,7,7] },
            { id: 123, name: 'Rte 4 @ Wagon Hill Farm', offs: [12,12,12,12,12] },
            { id: 604, name: 'Fox Run Rd @ Wal-Mart', offs: [null,21,21,21,21] },
            { id: 601, name: 'Crossings at Fox Run @ Regal Cinemas', offs: [null,26,26,26,26] },
            { id: 303, name: 'Arrive Hanover Street @ High-Hanover Parking', offs: [34,43,43,43,43] },
          ],
        },
        inbound: {
          origin: '303',
          lines: [434,768,888,1128,1188],
          stops: [
            { id: 303, name: 'Depart Hanover Street @ High-Hanover Parking', offs: [0,0,0,0,0] },
            { id: 311, name: 'Market Square', offs: [2,2,2,2,2] },
            { id: 125, name: 'Rte 4 @ Scammel Bridge (West Side)', offs: [23,23,23,23,23] },
            { id: 117, name: 'Madbury Road @ Woodman Rd', offs: [31,31,31,31,31] },
            { id: 183, name: 'ARRIVE GARRISON AVE @ STRAFFORD AVE', offs: [33,33,33,33,33] },
            { id: 116, name: 'ARRIVE GARRISON AVE @ SAWYER HALL', offs: [34,34,34,34,34] },
            { id: 105, name: 'ARRIVE MAIN ST @ UNH HOLLOWAY COMMONS', offs: [35,35,35,35,35] },
            { id: 1001, name: 'ARRIVE UNH McCONNELL HALL', offs: [37,37,37,37,37] },
          ],
        },
      },
      weekend: {
        outbound: {
          origin: '101',
          lines: [695,875,1145],
          stops: [
            { id: 101, name: 'DEPART UNH McCONNELL HALL', offs: [0,0,0] },
            { id: 152, name: 'DEPART MITCHELL WAY @ McDANIEL DRIVE', offs: [1,1,1] },
            { id: 102, name: 'DEPART UNH KINGSBURY HALL', offs: [2,2,2] },
            { id: 103, name: 'DEPART UNH HEWITT HALL', offs: [2,2,2] },
            { id: 104, name: 'DEPART MAIN ST @ UNH THOMPSON HALL', offs: [5,5,5] },
            { id: 105, name: 'DEPART MAIN ST @ UNH HOLLOWAY COMMONS', offs: [6,6,6] },
            { id: 106, name: 'DEPART MAIN ST @ UNH HETZEL HALL', offs: [7,7,7] },
            { id: 123, name: 'Rte 4 @ Wagon Hill Farm', offs: [12,12,12] },
            { id: 604, name: 'Fox Run Rd @ Wal-Mart', offs: [21,21,21] },
            { id: 601, name: 'Crossings at Fox Run @ Regal Cinemas', offs: [26,26,25] },
            { id: 303, name: 'Arrive Hanover Street @ High-Hanover Parking', offs: [43,43,40] },
          ],
        },
        inbound: {
          origin: '303',
          lines: [738,918,1185],
          stops: [
            { id: 303, name: 'Depart Hanover Street @ High-Hanover Parking', offs: [0,0,0] },
            { id: 311, name: 'Market Square', offs: [2,2,2] },
            { id: 125, name: 'Rte 4 @ Scammel Bridge (West Side)', offs: [32,32,32] },
            { id: 117, name: 'Madbury Road @ Woodman Rd', offs: [40,40,41] },
            { id: 183, name: 'ARRIVE GARRISON AVE @ STRAFFORD AVE', offs: [42,42,43] },
            { id: 116, name: 'ARRIVE GARRISON AVE @ SAWYER HALL', offs: [43,43,44] },
            { id: 105, name: 'ARRIVE MAIN ST @ UNH HOLLOWAY COMMONS', offs: [44,44,45] },
            { id: 1001, name: 'ARRIVE UNH McCONNELL HALL', offs: [46,46,47] },
          ],
        },
      },
    },
  },
  {
    id: '4B',
    area: 'Portsmouth',
    live: 'route-4-portsmouth',
    schedules: {
      weekday: {
        outbound: {
          origin: '101',
          lines: [525,785,905,995,1205],
          stops: [
            { id: 101, name: 'DEPART UNH McCONNELL HALL', offs: [0,0,0,0,0] },
            { id: 152, name: 'DEPART MITCHELL WAY @ McDANIEL DRIVE', offs: [1,1,1,1,1] },
            { id: 102, name: 'DEPART UNH KINGSBURY HALL', offs: [2,2,2,2,2] },
            { id: 103, name: 'DEPART UNH HEWITT HALL', offs: [2,2,2,2,2] },
            { id: 104, name: 'DEPART MAIN ST @ UNH THOMPSON HALL', offs: [5,5,5,5,5] },
            { id: 105, name: 'DEPART MAIN ST @ UNH HOLLOWAY COMMONS', offs: [6,6,6,6,6] },
            { id: 106, name: 'DEPART MAIN ST @ UNH HETZEL HALL', offs: [7,7,7,7,7] },
            { id: 123, name: 'Rte 4 @ Wagon Hill Farm', offs: [12,12,12,12,12] },
            { id: 303, name: 'Arrive Hanover Street @ High-Hanover Parking', offs: [34,34,34,34,34] },
          ],
        },
        inbound: {
          origin: '303',
          lines: [559,819,939,1029,1239],
          stops: [
            { id: 303, name: 'Depart Hanover Street @ High-Hanover Parking', offs: [0,0,0,0,0] },
            { id: 311, name: 'Market Square', offs: [2,2,2,2,2] },
            { id: 125, name: 'Rte 4 @ Scammel Bridge (West Side)', offs: [34,35,35,35,30] },
            { id: 117, name: 'Madbury Road @ Woodman Rd', offs: [42,43,43,43,38] },
            { id: 183, name: 'ARRIVE GARRISON AVE @ STRAFFORD AVE', offs: [44,45,45,45,40] },
            { id: 116, name: 'ARRIVE GARRISON AVE @ SAWYER HALL', offs: [45,46,46,46,41] },
            { id: 105, name: 'ARRIVE MAIN ST @ UNH HOLLOWAY COMMONS', offs: [46,47,47,47,42] },
            { id: 1001, name: 'ARRIVE UNH McCONNELL HALL', offs: [48,49,49,49,44] },
          ],
        },
      },
      weekend: {
        outbound: {
          origin: '101',
          lines: [785,935,1025],
          stops: [
            { id: 101, name: 'DEPART UNH McCONNELL HALL', offs: [0,0,0] },
            { id: 152, name: 'DEPART MITCHELL WAY @ McDANIEL DRIVE', offs: [1,1,1] },
            { id: 102, name: 'DEPART UNH KINGSBURY HALL', offs: [2,2,2] },
            { id: 103, name: 'DEPART UNH HEWITT HALL', offs: [2,2,2] },
            { id: 104, name: 'DEPART MAIN ST @ UNH THOMPSON HALL', offs: [5,5,5] },
            { id: 105, name: 'DEPART MAIN ST @ UNH HOLLOWAY COMMONS', offs: [6,6,6] },
            { id: 106, name: 'DEPART MAIN ST @ UNH HETZEL HALL', offs: [7,7,7] },
            { id: 123, name: 'Rte 4 @ Wagon Hill Farm', offs: [12,12,12] },
            { id: 604, name: 'Fox Run Rd @ Wal-Mart', offs: [21,21,21] },
            { id: 601, name: 'Crossings at Fox Run @ Regal Cinemas', offs: [26,26,26] },
            { id: 303, name: 'Arrive Hanover Street @ High-Hanover Parking', offs: [43,43,43] },
          ],
        },
        inbound: {
          origin: '303',
          lines: [828,978,1068],
          stops: [
            { id: 303, name: 'Depart Hanover Street @ High-Hanover Parking', offs: [0,0,0] },
            { id: 311, name: 'Market Square', offs: [2,2,2] },
            { id: 125, name: 'Rte 4 @ Scammel Bridge (West Side)', offs: [32,32,32] },
            { id: 117, name: 'Madbury Road @ Woodman Rd', offs: [41,41,41] },
            { id: 183, name: 'ARRIVE GARRISON AVE @ STRAFFORD AVE', offs: [43,43,43] },
            { id: 116, name: 'ARRIVE GARRISON AVE @ SAWYER HALL', offs: [44,44,44] },
            { id: 105, name: 'ARRIVE MAIN ST @ UNH HOLLOWAY COMMONS', offs: [45,45,45] },
            { id: 1001, name: 'ARRIVE UNH McCONNELL HALL', offs: [47,47,47] },
          ],
        },
      },
    },
  },
];

// Friendly display names for the stops that appear in more than one table and
// have unwieldy "DEPART/ARRIVE" all-caps raw names; everything else falls
// back to a cleaned version of the timetable name.
const STOP_LABELS = {
  101: 'UNH McConnell Hall',
  1001: 'UNH McConnell Hall',
  152: 'Mitchell Way @ McDaniel Dr',
  102: 'UNH Kingsbury Hall',
  103: 'UNH Hewitt Hall',
  104: 'UNH Thompson Hall',
  105: 'UNH Holloway Commons',
  106: 'UNH Hetzel Hall',
  117: 'Madbury Rd @ Woodman Rd',
  123: 'Rte 4 @ Wagon Hill Farm',
  125: 'Rte 4 @ Scammel Bridge',
  111: 'Madbury Rd @ Rte 4',
  183: 'Garrison Ave @ Strafford Ave',
  116: 'Garrison Ave @ Sawyer Hall',
  203: "Shaw's Plaza (Dover)",
  213: 'Chestnut St @ Carswell Auto',
  214: 'Dover Transportation Center',
  303: 'High-Hanover Parking / Market Sq (Portsmouth)',
  311: 'Portsmouth Market Square',
  604: 'Fox Run Rd @ Walmart',
  601: 'Crossings at Fox Run (Regal)',
};

export function cleanStopName(stop) {
  if (STOP_LABELS[stop.id]) return STOP_LABELS[stop.id];
  const name = String(stop.name || '')
    .replace(/^(depart|arrive)\s+/i, '')
    .replace(/\s*\(west side\)/i, '');
  if (!name) return `Stop ${stop.id}`;
  return name.charAt(0).toUpperCase() + name.slice(1).toLowerCase();
}

export function getRoute(routeId) {
  return TRANSIT_ROUTES.find(r => r.id === routeId) || null;
}

export function minutesToDisplay(min) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  const period = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${period}`;
}

// Which timetable applies today. 3A/3B have no Sunday service; 4A/4B share one
// "weekend" table across Sat + Sun, so saturday/sunday both fall back to it.
export function todaysScheduleKey(date = new Date()) {
  const dow = date.getDay();
  if (dow === 0) return 'sunday';
  if (dow === 6) return 'saturday';
  return 'weekday';
}

export function scheduleFor(route, date = new Date()) {
  if (!route) return null;
  const key = todaysScheduleKey(date);
  if (route.schedules[key]) return { key, table: route.schedules[key] };
  // Sunday (or Saturday on a route with a single weekend table, e.g. 4A/4B):
  if (route.schedules.weekend) return { key, table: route.schedules.weekend };
  return { key, table: null };
}

// "Next departures" for a stop on a route today. Returns up to `limit`
// departures across both directions, sorted by time, each as
// { min (minutes-of-day), dir: 'outbound'|'inbound', dirLabel, origin }.
// A departure that is already "boarding" (within 2 minutes) still counts so
// late-movers see the bus they can run for.
export function nextDepartures(routeId, stopId, date = new Date(), limit = 4) {
  const route = getRoute(routeId);
  const { table } = scheduleFor(route, date);
  if (!table) return { key: todaysScheduleKey(date), label: null, departures: [] };

  const nowMin = date.getHours() * 60 + date.getMinutes();
  const outboundDirLabel = `→ ${route.area}`;
  const inboundDirLabel = '→ Durham';
  const departures = [];

  ['outbound', 'inbound'].forEach(dir => {
    const tbl = table[dir];
    if (!tbl) return;
    const stop = (tbl.stops || []).find(s => s.id === stopId);
    if (!stop) return;
    (tbl.lines || []).forEach((originMin, i) => {
      const off = stop.offs && stop.offs[i];
      if (off === null || off === undefined) return;
      departures.push({
        min: originMin + off,
        dir,
        dirLabel: dir === 'outbound' ? outboundDirLabel : inboundDirLabel,
        origin: dir === 'outbound' ? 'UNH' : route.area,
      });
    });
  });

  departures.sort((a, b) => a.min - b.min);
  const future = departures.filter(d => d.min >= nowMin - 2);
  return { key: todaysScheduleKey(date), label: null, departures: future.slice(0, limit) };
}

// --- Campus Connector (frequency-based, no fixed times) ---------------------
// Service windows transcribed from the 2026-27 connector schedule. Times are
// local 24h minutes within `when.days`; `open`/`close` are "7:00 AM" style.
export const CONNECTOR_SERVICES = [
  {
    id: 'gables',
    name: 'Campus Connector (Gables)',
    emoji: '🔄',
    freq: 'every 8–15 min',
    when: [
      { days: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'], open: '7:00 AM', close: '7:00 PM' },
    ],
    note: 'Main campus loop. After 7:00 PM weekdays the loop runs as the Evening Connector; weekends run the Weekend Connector.',
  },
  {
    id: 'evening',
    name: 'Evening Connector',
    emoji: '🌙',
    freq: 'every 20–25 min',
    when: [
      { days: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'], open: '7:00 PM', close: '12:00 AM' },
    ],
    note: 'Same Gables loop after 7:00 PM. Last run ends at midnight.',
  },
  {
    id: 'westedge',
    name: 'West Edge Connector',
    emoji: '🏠',
    freq: 'every 10 min',
    when: [
      { days: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'], open: '7:00 AM', close: '7:00 PM' },
    ],
    note: 'Downtown Durham / West Edge loop (Lodges, NHPBS, Boulder Field, West Edge Lot).',
  },
  {
    id: 'cottages',
    name: 'The Cottages Connector',
    emoji: '🏘️',
    freq: '~20 min',
    when: [
      { days: ['Mon', 'Tue', 'Wed', 'Thu'], open: '7:30 AM', close: '9:30 PM' },
      { days: ['Fri'], open: '7:30 AM', close: '6:30 PM' },
      { days: ['Sat', 'Sun'], open: '11:00 AM', close: '3:00 PM' },
    ],
    note: 'Does not operate during university breaks (winter, spring, summer).',
  },
  {
    id: 'weekend',
    name: 'Weekend Connector',
    emoji: '🎉',
    freq: 'every 25–30 min',
    when: [
      { days: ['Sat', 'Sun'], open: '10:00 AM', close: '12:00 AM' },
    ],
    note: 'Replaces Gables service on weekends, running until midnight.',
  },
  {
    id: 'reduced',
    name: 'Reduced Service Connector',
    emoji: '📉',
    freq: 'every 15 min',
    when: [
      { days: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'], open: '7:20 AM', close: '5:00 PM' },
    ],
    note: 'Operates only during winter, spring & summer breaks.',
  },
];

function parseClock(raw) {
  const m = String(raw || '').match(/^(\d{1,2}):(\d{2})\s*([AP])M/i);
  if (!m) return null;
  let h = parseInt(m[1], 10) % 12;
  if (/P/i.test(m[3])) h += 12;
  // "12:00 AM" as a closing time means midnight at the END of the day, not
  // the start; every close in the connector data is an end-of-day marker.
  if (h === 0 && parseInt(m[1], 10) === 12 && /A/i.test(m[3])) return 24 * 60;
  return h * 60 + parseInt(m[2], 10);
}

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// Status of a connector loop right now: is it running, or when does it next
// start/end? Returns { state, label } where state is 'open' | 'later' | 'done'.
export function connectorStatus(service, date = new Date()) {
  const todayName = DAY_NAMES[date.getDay()];
  const nowMin = date.getHours() * 60 + date.getMinutes();
  const todayWindows = (service.when || []).filter(w => (w.days || []).indexOf(todayName) !== -1);

  // Running today?
  for (const w of todayWindows) {
    const open = parseClock(w.open);
    const close = parseClock(w.close);
    if (open !== null && close !== null && nowMin >= open && nowMin < close) {
      return { state: 'open', label: `Running now · until ${w.close}` };
    }
  }
  // Next window today?
  const nextToday = todayWindows.map(w => parseClock(w.open)).filter(v => v !== null && v > nowMin).sort((a, b) => a - b)[0];
  if (nextToday !== undefined) {
    return { state: 'later', label: `Opens ${minutesToDisplay(nextToday)}` };
  }
  // Any window today at all (already closed)?
  if (todayWindows.length) {
    return { state: 'done', label: 'Done for today' };
  }
  return { state: 'none', label: 'Not operating today' };
}

// Official pages the Bus view links out to (schedules, live tracker, dates).
export const TRANSPORT_LINKS = {
  home: 'https://www.unh.edu/transportation/',
  route3: 'https://www.unh.edu/transportation/buses-shuttles/wildcat-transit-routes-stops/route-3-dover',
  route4: 'https://www.unh.edu/transportation/buses-shuttles/wildcat-transit-routes-stops/route-4-portsmouth',
  exceptions: 'https://www.unh.edu/transportation/buses-shuttles/wildcat-transit-routes-stops/service-date-exceptions',
};