const RMP_GRAPHQL_URL = 'https://www.ratemyprofessors.com/graphql';
// University of New Hampshire (all campuses) — RMP global ID (legacyId 1231).
const RMP_SCHOOL_ID = 'U2Nob29sLTEyMzE=';

// --- WebCat CRN lookup (term codes only) ---
// Courses are resolved through the *public* UNH course catalog
// (courses.unh.edu /class/{termCode}/{crn} pages) — no auth, no session,
// and no requirement that a WebCat tab be open. WebCat itself is only
// consulted for its public term list, and only when the saved term label
// can't be mapped from its deterministic scheme (<year><season>: fall=10,
// january=30, spring=50, summer=70).

const WEBCAT_BASE = 'https://webcat.unh.edu/StudentRegistrationSsb/ssb';
const webCatTermCache = new Map();
const coursePageCache = new Map(); // key: termCode::crn -> { t, section }
const termAvailabilityCache = new Map(); // key: termCode -> { t, available }
const COURSE_PAGE_CACHE_MS = 10 * 60 * 1000;

async function fetchWebCatTerms() {
    const res = await fetch(WEBCAT_BASE + '/classSearch/getTerms?offset=1&max=60&searchTerm=', { credentials: 'include' });
    if (!res.ok) throw new Error('WebCat term list returned HTTP ' + res.status);
    return await res.json();
}

function matchWebCatTermCode(terms, label) {
    const L = String(label).toLowerCase().trim().replace(/\s+/g, ' ');
    if (!L) return null;

    // UNH term codes: <year><season> where fall=10, january=30,
    // spring=50, summer=70 (verified via getTerms).
    const yearMatch = L.match(/(20\d\d)/);
    const season = /summer/.test(L) ? '70'
        : /january|j[-\s]?term|winter/.test(L) ? '30'
        : /spring/.test(L) ? '50'
        : /fall/.test(L) ? '10' : '';
    if (yearMatch && season) {
        const want = yearMatch[1] + season;
        const hit = terms.find(t => t.code === want);
        if (hit) return hit.code;
    }

    const normalized = L.replace(/\(view only\)/g, '').replace(/\s+/g, '').trim();
    const hit = terms.find(t => {
        const desc = String(t.description || '').toLowerCase().replace(/\(view only\)/g, '').replace(/\s+/g, '').trim();
        return desc === normalized;
    });
    return hit ? hit.code : null;
}

async function getWebCatTermCode(label) {
    if (!label) throw new Error('No term entered — type it exactly as it appears on the WebCat registration page (e.g. "Fall 2026").');
    const direct = termCodeFromLabel(label);
    if (direct) return direct;
    if (webCatTermCache.has(label)) return webCatTermCache.get(label);
    const code = matchWebCatTermCode(await fetchWebCatTerms(), label);
    if (!code) throw new Error('Could not map term "' + label + '" to a UNH term code.');
    webCatTermCache.set(label, code);
    return code;
}

// Deterministic mapping for typical saved labels ("Fall 2026" -> "202610").
function termCodeFromLabel(label) {
    const L = String(label || '').toLowerCase().trim().replace(/\(view only\)/g, '').replace(/\s+/g, ' ');
    const yearMatch = L.match(/(20\d\d)/);
    const season = /summer/.test(L) ? '70'
        : /january|j[-\s]?term|winter/.test(L) ? '30'
        : /spring/.test(L) ? '50'
        : /fall/.test(L) ? '10' : '';
    if (yearMatch && season) return yearMatch[1] + season;
    return null;
}

// "202410" -> "Fall 2024" (season codes match WebCat: fall=10, jan=30,
// spring=50, summer=70). Used to label course-search results by term.
function termCodeToLabel(code) {
    const s = String(code || '');
    const year = s.slice(0, 4);
    const seasonMap = { '10': 'Fall', '30': 'January', '50': 'Spring', '70': 'Summer' };
    const season = seasonMap[s.slice(4)];
    return year && season ? `${season} ${year}` : (s || '');
}

const COURSES_BASE = 'https://courses.unh.edu';

function decodeEntities(str) {
    return String(str == null ? '' : str)
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#0?39;/g, "'")
        .replace(/\s+/g, ' ')
        .trim();
}

// Raw text following `opener`, up to the next tag.
function textUntilTag(str, opener) {
    const i = String(str).indexOf(opener);
    if (i < 0) return '';
    return decodeEntities(String(str).slice(i + opener.length).split('<')[0]);
}

// Text inside the <div> that starts with `label` ("<b>Prerequisite(s):</b>").
// Preserves "or"/"and" groupings between <span class='prereq-name'> items.
function requirementText(html, labels) {
    for (const label of labels) {
        const i = String(html).indexOf(label);
        if (i < 0) continue;
        let seg = String(html).slice(i + label.length);
        const end = seg.indexOf('</div>');
        if (end >= 0) seg = seg.slice(0, end);
        const out = decodeEntities(seg.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
        if (out) return out;
    }
    return '';
}

// "8:10am" -> "0810", "12:00pm" -> "1200", "12:30am" -> "0030". null on junk.
function parseCourseTime(raw) {
    const s = String(raw || '').replace(/\s+/g, '').toLowerCase();
    const m = s.match(/^(\d{1,2}):(\d{2})(am|pm)$/);
    if (!m) return null;
    let h = parseInt(m[1], 10);
    const min = parseInt(m[2], 10);
    if (m[3] === 'pm' && h < 12) h += 12;
    if (m[3] === 'am' && h === 12) h = 0;
    return String(h).padStart(2, '0') + String(min).padStart(2, '0');
}

// "11:10am - 12:00pm" -> { start: "1110", end: "1200" }. null on junk.
function parseCourseTimeRange(raw) {
    const m = String(raw || '').trim().match(/(\d{1,2}:\d{2}\s*[ap]m)\s*[-–—]\s*(\d{1,2}:\d{2}\s*[ap]m)/i);
    if (!m) return null;
    const start = parseCourseTime(m[1]);
    const end = parseCourseTime(m[2]);
    if (start === null || end === null) return null;
    return { start, end };
}

// "MWF" / "T R" -> ["M","W","F"]
function parseDaysStr(raw) {
    const out = [];
    for (const ch of String(raw || '')) {
        const u = ch.toUpperCase();
        if ('MTWRFSU'.includes(u) && !out.includes(u)) out.push(u);
    }
    return out;
}

// Parses the public section page at /class/{termCode}/{crn}. Mirrors the
// shape the widget/pages render (code, days as letters, start/end as HHMM).
function parseCoursePageHtml(html, crn) {
    const section = {
        crn: String(crn),
        code: '',
        title: '',
        credits: '',
        classSize: null,
        days: [],
        start: '',
        end: '',
        building: '',
        room: '',
        campus: '',
        instructor: '',
        prereqs: '',
        coreqs: '',
        equivalents: '',
    };

    // Title: og:title ("CS 501 (01) - Professional Ethics ...") or <title>.
    let title = String((html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']*)["']/i) || ['', ''])[1])
        || String((html.match(/<title>([\s\S]*?)<\/title>/i) || ['', ''])[1]);
    title = decodeEntities(title).replace(/\|\s*Course Search\s*$/i, '').trim();
    const tm = title.match(/^(.+?)\s+\((\d+)\)\s*-\s*(.+)$/);
    if (tm) {
        section.code = tm[1].replace(/\s+/g, ' ') + '-' + tm[2];
        section.title = tm[3];
    } else {
        section.title = title;
    }

    section.credits = textUntilTag(html, '<strong>Credits:</strong>');
    // Class Size sits inside a tooltip span: ...>22&nbsp;<i ...</span>
    const sizeAfter = String(html).slice(String(html).indexOf('<strong>Class Size:</strong>') + '<strong>Class Size:</strong>'.length);
    const sizeM = sizeAfter.match(/>([\d,]+)[^<>]{0,40}</);
    if (sizeM) section.classSize = parseInt(sizeM[1].replace(/,/g, ''), 10);

    const instrBlock = (html.match(/<b>Instructors:<\/b>([\s\S]{0,600}?)<\/div>/i) || ['', ''])[1];
    if (instrBlock) {
        const names = [];
        const aRe = /<a[^>]*href=["']mailto:[^"']*["'][^>]*>([\s\S]*?)<\/a>/gi;
        let am;
        while ((am = aRe.exec(instrBlock)) !== null) names.push(decodeEntities(am[1]));
        if (names.length) {
            section.instructor = names.join(', ');
        } else {
            section.instructor = decodeEntities(instrBlock.replace(/<[^>]*>/g, ' ')).trim();
        }
    }

    const campusM = html.match(/\/timeroom\?campus=\d+"[^>]*>([\s\S]*?)<\/a>/i);
    if (campusM) section.campus = decodeEntities(campusM[1]);

    // Requirement blocks ("MATH 426 or MATH 426H" — spaces and "or"/"and"
    // tokens are meaningful, so keep the raw grouping instead of splitting).
    // Label variants cover the catalog's inconsistent casing across
    // departments (Prerequisite(s)/Pre-Requisite, Co-Requisite(s)/Corequisite,
    // with or without the "s").
    section.prereqs = requirementText(html, [
        '<b>Prerequisite(s):</b>', '<b>Prerequisite:</b>', '<b>Prerequisites:</b>',
        '<b>Pre-Requisite(s):</b>', '<b>Pre-Requisite:</b>', '<b>Pre-Requisites:</b>',
    ]);
    section.coreqs = requirementText(html, [
        '<b>Co-Requisite:</b>', '<b>Co-Requisites:</b>', '<b>Co-Requisite(s):</b>',
        '<b>Corequisite:</b>', '<b>Corequisites:</b>', '<b>Corequisite(s):</b>',
        '<b>Co-requisite:</b>', '<b>Co-requisites:</b>', '<b>Co-requisite(s):</b>',
    ]);
    section.equivalents = requirementText(html, ['<b>Equivalent(s):</b>', '<b>Equivalent:</b>']);

    // Times & Locations: rows of Start Date | End Date | Days | Time | Location
    const tableM = html.match(/Times\s*&amp;\s*Locations([\s\S]*?)<\/table>/i) || html.match(/Times\s*&\s*Locations([\s\S]*?)<\/table>/i);
    if (tableM) {
        const trRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
        const rows = [];
        let rm;
        while ((rm = trRe.exec(tableM[1])) !== null) rows.push(rm[1]);
        // rows[0] is the header row; meeting rows start at index 1.
        let picked = false;
        for (let r = 1; r < rows.length && !picked; r++) {
            const cells = [];
            const tdRe = /<td[^>]*>([\s\S]*?)<\/td>/gi;
            let cm;
            while ((cm = tdRe.exec(rows[r])) !== null) cells.push(decodeEntities(cm[1].replace(/<[^>]*>/g, ' ')));
            if (cells.length < 4) continue;
            const days = parseDaysStr(cells[2]);
            const tRange = parseCourseTimeRange(cells[3]);
            if (!days.length && !tRange) continue; // "TBA" / "Hours Arranged" row
            picked = true;
            section.days = days;
            const loc = (cells[4] || '').trim();
            const locM = loc.match(/^([A-Za-z]{2,6})\s+(.+)$/);
            if (locM) { section.building = locM[1]; section.room = locM[2]; }
            else { section.building = loc; }
            if (tRange) { section.start = tRange.start; section.end = tRange.end; }
        }
    }
    return section;
}

async function fetchCourseSection(termCode, crn) {
    const url = COURSES_BASE + '/class/' + encodeURIComponent(termCode) + '/' + encodeURIComponent(crn);
    const res = await fetch(url, { credentials: 'omit' });
    if (res.status === 404) {
        return { crn: String(crn), error: 'No section found for CRN ' + crn + ' in that term (' + termCode + ').' };
    }
    if (!res.ok) throw new Error('courses.unh.edu returned HTTP ' + res.status);
    const html = await res.text();
    if (/<title>\s*Page not found/i.test(html)) {
        return { crn: String(crn), error: 'No section found for CRN ' + crn + ' in that term (' + termCode + ').' };
    }
    return parseCoursePageHtml(html, crn);
}

// Does the public catalog have ANY sections for this term? The catalog lags
// WebCat, so a semester that isn't open yet (e.g. Fall 2027) comes back
// empty — call that out explicitly instead of reporting every CRN as
// "not found". Returns true/false, or null when the check itself failed.
async function termHasSections(termCode) {
    const cached = termAvailabilityCache.get(termCode);
    if (cached && Date.now() - cached.t < COURSE_PAGE_CACHE_MS) return cached.available;
    let available = null;
    try {
        const url = COURSES_BASE + '/jsonapi/node/course?filter%5Bfield_term_code%5D=' + encodeURIComponent(termCode) + '&page%5Blimit%5D=1';
        const res = await fetch(url, { credentials: 'omit', headers: { Accept: 'application/vnd.api+json' } });
        if (res.ok) {
            const json = await res.json();
            available = !!(json && json.data && json.data.length);
        }
    } catch (e) {
        console.warn('[YACE] courses.unh.edu term availability check failed for ' + termCode + ':', e);
    }
    termAvailabilityCache.set(termCode, { t: Date.now(), available });
    return available;
}
const RMP_TEACHER_QUERY = `query TeacherSearch($query: TeacherSearchQuery!, $first: Int) {
  newSearch {
    teachers(query: $query, first: $first) {
      resultCount
      edges { node { id legacyId firstName lastName avgRatingRounded avgDifficultyRounded numRatings wouldTakeAgainPercentRounded wouldTakeAgainCount department teacherRatingTags { tagName tagCount } school { id legacyId name } } }
    }
  }
}`;

browser.runtime.onMessage.addListener((request) => {
    if (request.type === 'FETCH_RMP') {
        return (async () => {
            try {
                const res = await fetch(RMP_GRAPHQL_URL, {
                    method: 'POST',
                    credentials: 'omit',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': 'Basic dGVzdDp0ZXN0',
                        'X-Requested-With': 'XMLHttpRequest',
                    },
                    body: JSON.stringify({
                        query: RMP_TEACHER_QUERY,
                        variables: {
                            query: { text: String(request.text || ''), schoolID: RMP_SCHOOL_ID, fallback: true },
                            first: 10
                        }
                    })
                });
                if (!res.ok) return { success: false, error: `Rate My Professor returned HTTP ${res.status}` };
                const json = await res.json();
                const edges = (((json.data || {}).newSearch || {}).teachers || {}).edges || [];
                return { success: true, teachers: edges.map(e => e.node) };
            } catch (e) {
                return { success: false, error: String((e && e.message) || e) };
            }
        })();
    }

    if (request.type === 'FETCH_DINING_HOURS') {
        return (async () => {
            try {
                const res = await fetch('https://www.unh.edu/dining/facilities/hours', { credentials: 'omit' });
                if (res.ok) {
                    const html = await res.text();
                    return { success: true, html };
                }
            } catch (e) {
                console.warn('[YACE] Failed to fetch live UNH hours:', e);
            }
            return { success: false };
        })();
    }

    if (request.type === 'FETCH_DINING_MENU') {
        return (async () => {
            const locationNum = request.locationNum || 80;
            const cleanLocName = encodeURIComponent((request.locationName || 'Holloway Commons').replace(/\+/g, ' '));
            // dtdate selects which day FoodPro serves (M/D/YYYY). Defaults to
            // today; pass request.dtdate to peek at another day's menu — the
            // site serves tomorrow's (and later) menus from the same URL.
            const dateObj = request.dtdate ? new Date(request.dtdate) : new Date();
            const dtdate = `${dateObj.getMonth() + 1}/${dateObj.getDate()}/${dateObj.getFullYear()}`;

            // Try with and without dtdate (FoodPro often returns 404/blank if dtdate format doesn't match its server setting)
            const urls = [
                `https://foodpro.unh.edu/shortmenu.asp?sName=University+Of+New+Hampshire+Hospitality+Services&locationNum=${locationNum}&locationName=${cleanLocName}&dtdate=${encodeURIComponent(dtdate)}`,
                `https://foodpro.unh.edu/shortmenu.asp?sName=University+Of+New+Hampshire+Hospitality+Services&locationNum=${locationNum}&locationName=${cleanLocName}`,
                `http://foodpro.unh.edu/shortmenu.asp?sName=University+Of+New+Hampshire+Hospitality+Services&locationNum=${locationNum}&locationName=${cleanLocName}&dtdate=${encodeURIComponent(dtdate)}`,
                `http://foodpro.unh.edu/shortmenu.asp?sName=University+Of+New+Hampshire+Hospitality+Services&locationNum=${locationNum}&locationName=${cleanLocName}`
            ];

            for (const url of urls) {
                try {
                    const controller = new AbortController();
                    const timer = setTimeout(() => controller.abort(), 4000);

                    const res = await fetch(url, { signal: controller.signal, credentials: 'omit' });
                    clearTimeout(timer);

                    if (res.ok) {
                        const html = await res.text();
                        if (html && html.includes('shortmenurecipes')) {
                            return { success: true, html };
                        }
                    }
                } catch (e) {}
            }

            return { success: false, error: 'Could not reach FoodPro.' };
        })();
    }

    if (request.type === 'FETCH_WEBCAT_CRN') {
        return (async () => {
            try {
                const termLabel = String(request.term || '').trim();
                const crns = (request.crns || []).map(c => String(c).trim()).filter(Boolean).slice(0, 12);
                if (!crns.length) return { success: false, error: 'No CRNs to look up.' };
                // termCode may arrive straight from a course-search result
                // (already a UNH term code). When absent, map the saved
                // label to a term code via WebCat's public term list.
                const termCode = request.termCode || await getWebCatTermCode(termLabel);
                if (!request.termCode) {
                    const available = await termHasSections(termCode);
                    if (available === false) {
                        return {
                            success: false,
                            error: '\u201C' + termLabel + '\u201D (' + termCode + ') isn\u2019t available in the UNH course catalog yet \u2014 sections for that semester haven\u2019t been published on courses.unh.edu. Check that the saved term is a currently-open semester, then retry.',
                        };
                    }
                }
                const sections = [];
                for (const crn of crns) {
                    const cacheKey = termCode + '::' + crn;
                    const cached = coursePageCache.get(cacheKey);
                    if (cached && Date.now() - cached.t < COURSE_PAGE_CACHE_MS) {
                        sections.push(cached.section);
                        continue;
                    }
                    let section;
                    try {
                        section = await fetchCourseSection(termCode, crn);
                    } catch (e) {
                        console.warn('[YACE] courses.unh.edu lookup failed for ' + crn + ':', e);
                        section = { crn, error: 'Lookup failed (could not reach courses.unh.edu).' };
                    }
                    coursePageCache.set(cacheKey, { t: Date.now(), section });
                    sections.push(section);
                }
                return { success: true, termLabel, termCode, sections };
            } catch (e) {
                return { success: false, error: String((e && e.message) || e) };
            }
        })();
    }

    if (request.type === 'FETCH_COURSE_SEARCH') {
        // Full-text-ish search of the public catalog's course nodes by name
        // or code ("differential equations", "math 527", "CS 501"). Taps the
        // same Drupal JSON:API used elsewhere: CONTAINS on node titles, which
        // are "<CODE> (<sec>) - <Name>" and match case-insensitively. When a
        // term is provided it's filtered to that semester; otherwise every
        // published term comes back so the user sees all options.
        return (async () => {
            const query = String(request.query || '').trim();
            if (!query) return { success: false, error: 'Enter a course name or code to search.' };
            try {
                let termCode = null;
                if (request.term) {
                    termCode = await getWebCatTermCode(String(request.term).trim()).catch(() => null);
                }
                const url = COURSES_BASE + '/jsonapi/node/course?'
                    + 'filter%5Btitle%5D%5Boperator%5D=CONTAINS'
                    + '&filter%5Btitle%5D%5Bvalue%5D=' + encodeURIComponent(query)
                    + (termCode ? '&filter%5Bfield_term_code%5D=' + encodeURIComponent(termCode) : '')
                    + '&page%5Blimit%5D=50'
                    + '&fields%5Bnode--course%5D=title,field_crn,field_term_code,path';
                const res = await fetch(url, { credentials: 'omit', headers: { Accept: 'application/vnd.api+json' } });
                if (!res.ok) return { success: false, error: 'courses.unh.edu search returned HTTP ' + res.status };
                const json = await res.json();
                const nodes = (json && json.data) || [];
                const matches = [];
                for (const n of nodes) {
                    const attrs = (n && n.attributes) || {};
                    const title = String(attrs.title || '').trim();
                    const crn = String(attrs.field_crn != null ? attrs.field_crn : '').trim();
                    if (!title || !crn) continue;
                    const tCode = String(attrs.field_term_code != null ? attrs.field_term_code : '').trim();
                    matches.push({
                        title,
                        crn,
                        termCode: tCode,
                        termLabel: termCodeToLabel(tCode),
                        path: String(((n && n.path) || {}).alias || '').trim(),
                    });
                }
                return { success: true, matches, termCode, filtered: !!termCode };
            } catch (e) {
                return { success: false, error: String((e && e.message) || e) };
            }
        })();
    }
});
