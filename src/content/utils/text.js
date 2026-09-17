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
