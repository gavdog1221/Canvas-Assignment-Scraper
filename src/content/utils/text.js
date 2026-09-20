export function normalizeCourseCode(name) {
    if (!name) return 'GENERAL';
    const match = name.match(/([a-zA-Z]{2,5}\s*\d{3})/i);
    if (match) return match[1].replace(/\s+/g, ' ').toUpperCase();
    return name.replace(/\[gradescope\]/i, '').split('(')[0].trim().toUpperCase();
  }

export function extractCoreAssignmentToken(title, courseKey = '') {
    if (!title) return '';

    let t = title.toLowerCase().replace(/[_.\-\/]+/g, ' ');

    if (courseKey) {
      const flatKey = courseKey.toLowerCase().replace(/[^a-z0-9]/g, '');
      t = t.replace(new RegExp('\\b' + flatKey + '\\b', 'g'), ' ');
      const spacedKey = courseKey.toLowerCase().split(/\s+/).join('\\s*');
      t = t.replace(new RegExp('\\b' + spacedKey + '\\b', 'g'), ' ');
    }
    t = t.replace(/\b[a-z]{2,5}\s*\d{3}\b/g, ' ');

    t = t.replace(/\b(pdf|docx?|zip|pptx?|xlsx?)\b/gi, ' ')
    .replace(/(?:fall|fa|spring|sp|summer|winter)[\s_.-]*'?(?:20)?\d{2,4}\b/gi, ' ')
    .replace(/\(?\s*submission\s+window\s+in\s+grade\w*\s*\)?/gi, ' ');
    const match = t.match(/\b(hw|homework|assignment|prob(?:lem)?\s*set|pset|lab|quiz|project|exam|a)\s*(\d{1,2})\b/i);
    if (match) {
      let prefix = match[1].toLowerCase().replace(/\s+/g, '');
      if (['hw', 'homework', 'assignment', 'problemset', 'pset', 'probset'].includes(prefix)) {
        prefix = 'hw';
      }
      return `${prefix}${parseInt(match[2], 10)}`;
    }

    const numOnly = t.match(/\b(\d{1,2})\b/);
    if (numOnly) {
      return `hw${parseInt(numOnly[1], 10)}`;
    }

    return t.replace(/[^a-z0-9]/g, '');
  }

export function parseAndCleanTitle(rawTitle, courseKey = '') {
    const currentYear = new Date().getFullYear();
    let dueDate = null;

    // 1. Normalize whitespace & line breaks
    let cleanTitle = (rawTitle || '')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

    const monthPattern = /(?:\(|\[|-|\s)*(?:approx\s*)?(?:due\s*(?:date)?[:\s-]*)(?:(?:mon|tue|wed|thu|fri|sat|sun)[a-z]*,?\s*)?([a-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:\s+(?:at|@)?\s*(\d{1,2}(?::\d{2})?\s*(?:am|pm)?))?(?:\)|\])?/i;
    const mMatch = cleanTitle.match(monthPattern);

    if (mMatch && isNaN(mMatch[1])) {
      const timeStr = mMatch[3] || '11:59 PM';
      const candidate = new Date(`${mMatch[1]} ${mMatch[2]}, ${currentYear} ${timeStr}`);
      if (!isNaN(candidate.getTime())) {
        dueDate = candidate;
        cleanTitle = cleanTitle.replace(mMatch[0], ' ');
      }
    }

    if (!dueDate) {
      const numPattern = /(?:\(|\[|-|\s)*(?:approx\s*)?(?:due\s*(?:date)?[:\s-]*)\(?(\d{1,2})[\/\.\-](\d{1,2})(?:[\/\.\-](\d{2,4}))?\)?(?:\s+(?:at|@)?\s*(\d{1,2}(?::\d{2})?\s*(?:am|pm)?))?(?:\)|\])?/i;
      const nMatch = cleanTitle.match(numPattern);

      if (nMatch) {
        const year = nMatch[3] ? (nMatch[3].length === 2 ? `20${nMatch[3]}` : nMatch[3]) : currentYear;
        const timeStr = nMatch[4] || '11:59 PM';
        const candidate = new Date(`${nMatch[1]}/${nMatch[2]}/${year} ${timeStr}`);
        if (!isNaN(candidate.getTime())) {
          dueDate = candidate;
          cleanTitle = cleanTitle.replace(nMatch[0], ' ');
        }
      }
    }

    // 2. Strip file extensions unconditionally (.pdf, .docx, etc.)
    cleanTitle = cleanTitle.replace(/\.(pdf|docx?|zip|pptx?|xlsx?|csv|txt|rtf)\b/gi, ' ');

    // 3. Strip semester/term noise (e.g. Fall2026, FA26, Spring 2026)
    cleanTitle = cleanTitle.replace(/(?:fall|fa|spring|sp|summer|su|winter|wi)[\s_.-]*'?(?:20)?\d{2}\b/gi, ' ');

    // 4. Strip specific course key (e.g. ECE 541, ECE541)
    if (courseKey) {
      const alphaPart = courseKey.replace(/[^a-zA-Z]/g, '');
      const numPart = courseKey.replace(/[^0-9]/g, '');
      if (alphaPart && numPart) {
        const keyPattern = new RegExp(`${alphaPart}[\\s_.-]*${numPart}`, 'gi');
        cleanTitle = cleanTitle.replace(keyPattern, ' ');
      }
      const rawEscaped = courseKey.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      cleanTitle = cleanTitle.replace(new RegExp(`${rawEscaped}`, 'gi'), ' ');
    }

    // 5. Generic fallback for any Department + Number prefix (e.g. ECE541, CS412)
    cleanTitle = cleanTitle.replace(/[a-zA-Z]{2,5}[\s_.-]*\d{3,4}/gi, ' ');

    // 6. Turn all variations of homework into "HW"
    // With number (e.g., "Homework 1", "Home-Work #2", "hw_3" -> "HW 1", "HW 2", "HW 3")
    cleanTitle = cleanTitle.replace(/\b(?:home[\s_.-]*work|hw)[\s_.-]*(?:#|\bno\.?)?\s*(\d+)\b/gi, 'HW $1');
    // Standalone without number ("Homework", "Home Work" -> "HW")
    cleanTitle = cleanTitle.replace(/\bhome[\s_.-]*work\b/gi, 'HW');

    // 7. Clean up stray symbols, punctuation, and extra whitespace
    cleanTitle = cleanTitle
    .replace(/_+/g, ' ')
    .replace(/([a-z0-9])-([a-z0-9])/gi, '$1 $2')
    .replace(/\(\s*\)/g, '')
    .replace(/\[\s*\]/g, '')
    .replace(/^[\s\-:|]+|[\s\-:|]+$/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();

    return { title: cleanTitle || rawTitle, dueDate };
  }

export function generateTaskId(courseKey, title) {
    const token = extractCoreAssignmentToken(title, courseKey) || title.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
    return `${courseKey}_${token}`;
  }

export function escapeHTML(str) {
    return String(str).replace(/[&<>'"]/g,
                               tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag)
    );
  }

/* ---------------------------------------------------------------------------
 * Syllabus instructor extraction
 *
 * Syllabus bodies are free-form HTML/plain text, so this is intentionally
 * heuristic: it hunts for a labelled instructor line ("Instructor:", "Taught
 * by Dr. X", "Professor:", ...), grabs the value, then cleans it into
 * "First Last" name(s) suitable for a Rate My Professor search.
 * ------------------------------------------------------------------------- */

// Longest patterns first — otherwise the bare `instructor` alternative
// shadows `instructor of record` (regex alternation is leftmost-first).
const SYLLABUS_LABEL_RE = /\b(?:instructor\s+of\s+record|head\s+instructor|course\s+instructor|taught\s+by|instructor|professor|lecturer|faculty)s?\b/i;

// Trailing junk that follows an instructor's name on the same line.
const SYLLABUS_STOP_RE = /\b(?:office\s+hours|office|email|e-?mail|phone\s*[:#(]?\s*\d|tel\.?|classroom|room|building|department\s+office|contact|website|canvas|slack|zoom)\b/i;

// Words that can follow the label but are section headers, not names.
const SYLLABUS_JUNK_START = /^(information|contact|contacts?|name|names?|email|e-?mail|phone|office|bio|biography|website|url|description|prerequisite|learning|course|class|meeting|time|location|hours?|syllabus|schedule|textbook|required|grader|grading|attendance|academic|disability|honor|policy|objectives?|materials|readings?|requirements?|methods?)\b/i;

// Compound-surname particles that signal last-name-first order in a comma
// form ("de la Cruz, Maria") vs. a simple name list ("John Smith, Jane Doe").
const NAME_PARTICLES = /\b(?:de|la|del|las|los|van|von|bin|al|el|da|dos|das|du|di|ter|te|st\.?)\b/i;

export function cleanSyllabusInstructor(raw) {
    let n = String(raw || '');
    if (!n.trim()) return '';
    // Drop asides: (he/him), (PhD), etc.
    n = n.replace(/\([^)]*\)/g, ' ');
    // Strip titles/degrees.
    n = n.replace(/\b(?:professor|prof|dr|instructor|lecturer|adjunct|assistant|associate|clinical|emeritus|ph\.?d\.?|m\.?d\.?)\b\.?/gi, ' ');
    // Emails and URLs.
    n = n.replace(/\b\w[\w.-]*@[\w.-]+\.[a-z]{2,}\b/gi, ' ');
    n = n.replace(/https?:\/\/\S+/gi, ' ');
    n = n.replace(/["'«»]/g, ' ');
    n = n.replace(/\s{2,}/g, ' ');
    n = n.trim();
    if (!n) return '';
    // "Last, First M." / "de la Cruz, Maria" -> "First M. Last" / "Maria de la
    // Cruz" so RMP search sees a normal order. Runs before trailing-punctuation
    // stripping so middle-initial dots ("Jane A.") survive.
    const commaFlip = n.match(/^([a-zA-Z'-]+(?:\s+[a-zA-Z'-]+){0,2})\s*,\s+([a-zA-Z][a-zA-Z' .-]*)$/);
    if (commaFlip) n = `${commaFlip[2].trim()} ${commaFlip[1]}`.replace(/\s{2,}/g, ' ').trim();
    n = n.replace(/[;,.\-–—]+$/g, '').trim();
    // Must look like a person's name: require a capitalized word. Section
    // headers and sentence fragments are all-lowercase, so this filters
    // "mentioned anywhere in this text"-type junk while keeping real names.
    if (!/(\b[A-Z][a-z]|\b[A-Z]{2,})/.test(n)) return '';
    // Refuse obvious non-names (over-long or header-ish leftovers).
    const tokens = n.split(/\s+/);
    if (tokens.length > 5) return '';
    if (tokens.length === 1 && !/^[A-Z][a-z]+(?:-[A-Z][a-z]+)?$/.test(tokens[0])) return '';
    return n;
  }

export function parseSyllabusInstructors(syllabusText) {
    if (!syllabusText) return [];
    const text = String(syllabusText)
    .replace(/\u00a0/g, ' ')
    .replace(/\r\n?/g, '\n')
    .replace(/\t/g, ' ');

    const names = [];
    const seen = new Set();
    const addName = (raw) => {
      const clean = cleanSyllabusInstructor(raw);
      if (!clean) return;
      const key = clean.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      names.push(clean);
    };

    // Operate line-by-line; "and"/";" separate multiple instructors.
    text.split(/\n+/).forEach(line => {
      const m = line.match(SYLLABUS_LABEL_RE);
      if (!m) return;
      let value = line.slice(m.index + m[0].length);
      value = value.split(SYLLABUS_STOP_RE)[0];
      value = value.replace(/^[\s:—–=\-.,]+/, '');
      // "Instructor Name: John Smith" — drop the redundant "Name:" header.
      value = value.replace(/^name\s*[:—–=\-]/i, ' ').replace(/^\s+/, '');
      if (!value || SYLLABUS_JUNK_START.test(value)) return;

      // Split multi-name lists, but keep "Last, First" forms intact.
      value.split(/\s*;\s*|\s+and\s+/i).forEach(part => {
        const p = part.trim();
        if (!p) return;
        // "Smith, Jane" / "Smith, Jane A." — unambiguous, always flip.
        const lastFirst2 = /^[a-zA-Z'-]+\s*,\s+[a-zA-Z][a-zA-Z' .-]*$/;
        // "de la Cruz, Maria" — only treat as last-name-first when compound-
        // surname particles are present; otherwise it's a name list
        // ("John Smith, Jane Doe").
        const lastFirst3 = /^[a-zA-Z'-]+(?:\s+[a-zA-Z'-]+){1,2}\s*,\s+[a-zA-Z][a-zA-Z' .-]*$/;
        if (lastFirst2.test(p) || (lastFirst3.test(p) && NAME_PARTICLES.test(p))) {
          addName(p);
        } else {
          p.split(/,\s*/).forEach(x => x && addName(x));
        }
      });
    });

    return names;
  }

/* ---------------------------------------------------------------------------
 * Syllabus grade-weight extraction
 *
 * Syllabi describe the grading breakdown in free-form lines ("Homework 20%",
 * "Midterm exam 30%", "20% Quizzes", ...). This pulls those percentages out
 * so the what-if calculator can weigh categories the way the syllabus says
 * instead of assuming every point counts equally. Purely heuristic: any
 * line whose label doesn't look like a grade category is skipped.
 * ------------------------------------------------------------------------- */

// Words that make a label look like a genuine grade category.
const WEIGHT_CATEGORY_WORD = /\b(hw|homework|final|final\s*exam|midterm|mid\s?term|exam|exams|test|tests|quiz|quizzes|lab|labs|laboratory|project|paper|essay|writing|report|participation|attendance|discussion|reading|presentation|assignment|assignments|problem|set|pset|activities|activity|recitation|studio|poster|research|team|group|individual)\b/i;

// Connective filler that means the % belongs to boilerplate, not a category
// ("50% of your grade is determined by...", "week 1 inquiry activity...").
const WEIGHT_JUNK_WORD = /\b(of|your|the|for|each|in|per|worth|counts?|count(?:ed|ing)?|toward|towards|will|be|is|are|grade|graded|grading|scale|points?|total|overall|and|due|date|course|class|week|weekly)\b/i;

function cleanWeightLabel(raw) {
    let label = String(raw || '').trim();
    // Drop trailing/leading connective junk ("Final Exam is" -> "Final Exam",
    // "of your grade" -> ""). Note `final` is deliberately NOT trimmed —
    // "Final 40%" is a legit category label.
    for (let i = 0; i < 3; i++) {
      label = label.replace(/\b(is|are|will|be|worth|counts?|count(?:ed|ing)?|toward|towards|of|the|for|and|your|each|in|per|due|course|grade|total|overall|scale|points?|week|weekly)\b\s*$/i, '').trim();
      label = label.replace(/^\s*(?:is|are|will|be|worth|counts?|of|the|for|and|your)\b/i, '').trim();
    }
    return label;
  }

export function parseGradeWeights(syllabusText) {
    if (!syllabusText) return null;
    const text = String(syllabusText)
    .replace(/\u00a0/g, ' ')
    .replace(/\r\n?/g, '\n')
    .replace(/\t/g, ' ');

    const weights = [];
    const seen = new Set();

    text.split(/\n+/).forEach(line => {
      // Skip oversized lines (table dumps) and obvious boilerplate — the
      // filename line of the syllabus blob is pure junk.
      if (line.length > 160) return;
      if (/^\s*(follow this link|academic calendar|unh community|http|www\.|\.pdf|final exam info|syllabus_)/i.test(line)) return;

      const pctRe = /(\d{1,3}(?:\.\d+)?)\s*%/g;
      let m;
      while ((m = pctRe.exec(line))) {
        const pct = parseFloat(m[1]);
        if (pct <= 0 || pct > 90) continue;

        const before = line.slice(0, m.index).trim();
        const leftMatch = before.match(/([A-Za-z][A-Za-z0-9.&'\- ]{0,39})\s*$/);
        const leftLabel = leftMatch ? cleanWeightLabel(leftMatch[1]) : '';
        const after = line.slice(m.index + m[0].length).trim();
        const rightMatch = after.match(/^([A-Za-z][A-Za-z0-9.&'\- ]{0,39})/);
        const rightLabel = rightMatch ? cleanWeightLabel(rightMatch[1]) : '';

        // Prefer the left-hand label ("Homework 20%"), fall back to the
        // right-hand one ("20% Quizzes"). Reject pure-connective filler.
        const good = (s) => s.length >= 2 && WEIGHT_CATEGORY_WORD.test(s) &&
        (/\b[A-Z][a-z]/.test(s) || !WEIGHT_JUNK_WORD.test(s));
        let label = good(leftLabel) ? leftLabel : (good(rightLabel) ? rightLabel : '');
        if (!label) continue;

        const key = label.toLowerCase().replace(/\s+/g, ' ');
        if (seen.has(key)) continue;
        seen.add(key);
        weights.push({ label, pct: Math.round(pct * 10) / 10 });
        if (weights.length >= 12) return;
      }
    });

    if (weights.length === 0) return null;
    // A lone "100%" line is usually boilerplate ("participation counts for
    // 100%..."); require a believable single-category claim or a real mix.
    const sum = weights.reduce((a, w) => a + w.pct, 0);
    if (weights.length === 1 && (sum < 60 || sum > 110)) return null;
    return weights;
  }

/* ---------------------------------------------------------------------------
 * Syllabus office-hours extraction
 *
 * Returns [{ dayIndexes, display, byAppointment }] or null. dayIndexes use
 * the same numbering as Date.prototype.getDay() (0 = Sunday) so "today at a
 * glance" can be a plain index lookup. Handles "Mon/Wed 2-3pm", "MWF 11-12",
 * "Tuesdays & Thursdays 10:15-11:00", "by appointment".
 * ------------------------------------------------------------------------- */

const OFFICE_DAY_ALIASES = {
    monday: 1, mondays: 1, mon: 1, mo: 1, m: 1,
    tuesday: 2, tuesdays: 2, tue: 2, tues: 2, tu: 2, t: 2,
    wednesday: 3, wednesdays: 3, wed: 3, w: 3, we: 3,
    thursday: 4, thursdays: 4, thu: 4, thur: 4, thurs: 4, th: 4, r: 4,
    friday: 5, fridays: 5, fri: 5, fr: 5, f: 5,
    saturday: 6, saturdays: 6, sat: 6, sa: 6,
    sunday: 0, sundays: 0, sun: 0, su: 0,
  };

const OFFICE_TIME_RE = /(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s*(?:-|–|—|to|until)\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i;

function parseOfficeTimeRange(m) {
    let sh = parseInt(m[1], 10);
    const sm = m[2] ? parseInt(m[2], 10) : 0;
    let eh = parseInt(m[4], 10);
    const em = m[5] ? parseInt(m[5], 10) : 0;
    const am = m[3] || m[6] || ''; // shorthand syllabi write "2-3pm"
    if (am) {
      const isPm = am.toLowerCase() === 'pm';
      if (isPm && sh < 12) sh += 12;
      if (!isPm && sh === 12) sh = 0;
      if (isPm && eh < 12) eh += 12;
      if (!isPm && eh === 12) eh = 0;
    } else if (eh < sh) {
      eh += 12; // "11-1" -> 11am-1pm
    }
    if (sh < 0 || eh < 0 || sh > 23 || eh > 23 || eh < sh) return null;
    return { start: sh * 60 + sm, end: eh * 60 + em };
  }

function formatClockMin(min) {
    const h24 = Math.floor(min / 60);
    const m = min % 60;
    const ampm = h24 >= 12 ? 'pm' : 'am';
    let h12 = h24 % 12;
    if (h12 === 0) h12 = 12;
    return `${h12}${m ? ':' + String(m).padStart(2, '0') : ''}${ampm}`;
  }

function dayNamesFor(indexes) {
    const names = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    return indexes
    .sort((a, b) => (a === 0 ? 7 : a) - (b === 0 ? 7 : b))
    .map(i => names[i])
    .join('/');
  }

function parseOfficeHoursChunk(chunk) {
    const byAppointment = /\bby\s+appointment\b/i.test(chunk);
    const dayIndexes = new Set();
    let start = null;
    let end = null;

    // "Mon/Wed 2-3pm, or by appointment" -> Mon, Wed, 2-3pm, or, by, appointment
    const tokens = chunk.replace(/\s+(?:and|&|\/)\s+/gi, ' ')
    .replace(/[\/\\,;+]/g, ' ')
    .split(/\s+/).map(t => t.trim()).filter(Boolean);

    for (const token of tokens) {
      const t = token.toLowerCase();
      if (!t) continue;
      if (t.startsWith('appointment')) break; // rest is "by appointment"

      const timeMatch = token.match(OFFICE_TIME_RE);
      if (timeMatch) {
        const parsed = parseOfficeTimeRange(timeMatch);
        if (parsed) { start = parsed.start; end = parsed.end; }
        break; // assume a single block per office-hours line
      }

      let day = OFFICE_DAY_ALIASES[t];
      if (day === undefined && /^[mtwrf]{1,4}$/.test(t)) {
        // Compact cluster form: MWF, TTh, TR
        const map = { m: 1, t: 2, w: 3, r: 4, f: 5 };
        t.split('').forEach(ch => { if (map[ch] !== undefined) dayIndexes.add(map[ch]); });
        continue;
      }
      if (day !== undefined) dayIndexes.add(day);
    }

    if (dayIndexes.size === 0 && !byAppointment) return null;
    const dayList = [...dayIndexes];
    const daysLabel = dayNamesFor(dayList);
    if (start !== null && end !== null) {
      return { dayIndexes: dayList, display: `${daysLabel} ${formatClockMin(start)}–${formatClockMin(end)}`, byAppointment };
    }
    if (dayIndexes.size > 0) {
      return { dayIndexes: dayList, display: daysLabel + (byAppointment ? ' (by appointment)' : ''), byAppointment };
    }
    return { dayIndexes: [], display: 'By appointment', byAppointment };
  }

export function parseOfficeHours(syllabusText) {
    if (!syllabusText) return null;
    const text = String(syllabusText).replace(/\u00a0/g, ' ').replace(/\r\n?/g, '\n').replace(/\t/g, ' ');

    const chunkRe = /\b(?:office\s+(?:hours|hrs?)|student\s+hours|drop-?in\s+hours|oh\s*:)\s*[:—-]?\s*([^\n.]{0,180})/gi;
    const results = [];
    let m;
    while ((m = chunkRe.exec(text))) {
      const chunk = m[1].trim();
      if (!chunk) continue;
      const parsed = parseOfficeHoursChunk(chunk);
      if (parsed) results.push(parsed);
      if (results.length >= 4) break;
    }
    return results.length ? results : null;
  }

// Finds the URL of a syllabus PDF when the syllabus tab body links one (a
// common pattern: "Download the syllabus here"). Returns an absolute URL or
// null. Prefers obvious `.pdf` hrefs, but also accepts file links whose
// anchor text mentions the syllabus.
export function findSyllabusPdfUrl(syllabusHtml, baseOrigin = '') {
    if (!syllabusHtml) return null;
    const anchorRe = /<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
    let m;
    while ((m = anchorRe.exec(syllabusHtml))) {
      const href = (m[1] || '').replace(/&amp;/g, '&').trim();
      if (!href) continue;
      const text = (m[2] || '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
      const isPdfUrl = /\.pdf(\?|#|$)/i.test(href);
      const isSyllabusLink = /syllabus|course\s*(info|syllabus|overview)|pdf/i.test(text);
      const isFileHref = /\/files\//i.test(href);
      if (isPdfUrl || (isSyllabusLink && isFileHref)) {
        if (href.startsWith('//')) return `https:${href}`;
        if (href.startsWith('/')) return `${baseOrigin}${href}`;
        return href;
      }
    }
    return null;
  }
