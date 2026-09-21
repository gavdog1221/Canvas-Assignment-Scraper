// Minimal, dependency-free PDF text extraction for syllabus PDFs.
//
// Many UNH syllabi are only available as a PDF (linked from the syllabus tab
// or posted in Modules). This isn't a full PDF parser — it hunts FlateDecode
// object streams, inflates them with the browser's built-in DecompressionStream
// (Firefox 113+, Chrome 80+ — both above the extension's baseline), and
// harvests the literal-string tokens "(...)" that make up the page text in
// reading order. That reconstructed text is good enough to find
// "Instructor: John Smith" lines and "Homework 20%" grade-breakdown lines,
// which is all the syllabus parser needs.

function bytesToBinaryString(bytes) {
  let out = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    out += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize));
  }
  return out;
}

function pdfUnescape(str) {
  // PDF literal strings escape \( \) \\ and \n \r \t \b \f, plus octal like \072.
  const simple = { n: '\n', r: '\r', t: '\t', b: '\b', f: '\f', '(': '(', ')': ')', '\\': '\\' };
  return str.replace(/\\([nrtbf()\\])|\\[0-7]{1,3}/g, (match, named) => {
    if (named) return simple[named];
    return String.fromCharCode(parseInt(match.slice(1), 8));
  });
}

async function inflateFlate(data) {
  if (typeof DecompressionStream === 'undefined') return null;
  // PDF spec says FlateDecode is zlib-wrapped (RFC 1950), but some producers
  // (older tools, some export pipelines) emit raw DEFLATE (RFC 1951) instead.
  // Try both so a valid stream in either format inflates.
  for (const format of ['deflate', 'deflate-raw']) {
    try {
      const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream(format));
      const buf = await new Response(stream).arrayBuffer();
      if (buf.byteLength > 0) return new Uint8Array(buf);
    } catch (e) {
      // Fall through to the next format.
    }
  }
  return null;
}

// Cut the flat token stream into ~48-char chunks at word boundaries so
// "Instructor:" and the following name land on the same fake "line", like a
// real text line — the syllabus parser operates line-by-line.
function chunkText(text) {
  const chunks = [];
  let current = '';
  text.split(/\s+/).forEach(tok => {
    if (!tok) return;
    if (current && (current + ' ' + tok).length > 48) {
      chunks.push(current);
      current = tok;
    } else {
      current = current ? `${current} ${tok}` : tok;
    }
  });
  if (current) chunks.push(current);
  return chunks;
}

// Rejoin chunk lines that were split mid-label or mid-name — e.g. when a
// physical PDF line ends with "Instructor of Record:" and the name starts on
// the next line. Merge whenever a line ends with a label that has almost no
// value yet.
function joinContinuationLines(lines) {
  const labelRe = /\b(?:instructor\s+of\s+record|head\s+instructor|course\s+instructor|taught\s+by|instructor|professor|lecturer|faculty)s?\b/i;
  const out = [];
  let i = 0;
  const needsMore = (cur) => {
    if (/:\s*$/.test(cur)) return true;
    const m = labelRe.exec(cur);
    return !!m && cur.length - (m.index + m[0].length) < 25;
  };
  while (i < lines.length) {
    let line = lines[i];
    i++;
    while (i < lines.length && needsMore(line)) {
      line = `${line} ${lines[i]}`.trim();
      i++;
    }
    out.push(line);
  }
  return out;
}

// Letter-spaced PDFs (common in UNH syllabus exports) draw every glyph as its
// own literal — "D u e D a t e" — which defeats the line-based parsers. Detect
// the pattern (mostly single-character tokens) and glue the glyph runs back
// together. The PDF's explicit space literals were kept in the array as ' '
// markers, so they survive as the single gap between words.
function assembleSyllabusText(literals) {
  const nonSpace = [];
  for (const t of literals) if (t !== ' ') nonSpace.push(t);
  if (!nonSpace.length) return '';
  const singles = nonSpace.filter(t => t.length === 1).length;
  if (singles / nonSpace.length < 0.5) return literals.join(' ');
  let out = '';
  let pendingSpace = false;
  for (const t of literals) {
    if (t === ' ') { pendingSpace = true; continue; }
    if (pendingSpace && out) out += ' ';
    pendingSpace = false;
    out += t;
  }
  return out;
}

export async function extractPdfText(input) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  if (!bytes.length) return '';
  const bin = bytesToBinaryString(bytes);

  const decodedChunks = [];

  // Every object whose header declares FlateDecode gets its stream inflated.
  const flateRe = /\/(?:FlateDecode|Fl)\b/g;
  let fm;
  while ((fm = flateRe.exec(bin))) {
    const streamIdx = bin.indexOf('stream', fm.index + fm[0].length);
    if (streamIdx === -1) break;

    let contentStart = streamIdx + 6; // length of "stream"
    if (bin.charCodeAt(contentStart) === 13) contentStart++; // \r
    if (bin.charCodeAt(contentStart) === 10) contentStart++; // \n

    const endIdx = bin.indexOf('endstream', contentStart);
    const rawEnd = endIdx === -1 ? bytes.length : endIdx;

    let rawBytes = bytes.subarray(contentStart, rawEnd);
    while (rawBytes.length && /[\r\n\s]/.test(String.fromCharCode(rawBytes[rawBytes.length - 1]))) {
      rawBytes = rawBytes.subarray(0, rawBytes.length - 1);
    }

    const inflated = await inflateFlate(rawBytes);
    if (inflated && inflated.length) {
      decodedChunks.push(bytesToBinaryString(inflated));
    }
    // Resume after this object's stream so later /FlateDecode dicts still match.
    flateRe.lastIndex = endIdx === -1 ? bytes.length : endIdx;
  }

  if (!decodedChunks.length) return '';

  const combined = decodedChunks.join(' ');

  // Harvest the actual words: PDF literal strings "(...)" plus hex strings "<...>".
  const literals = [];
  const litRe = /\((?:[^()\\\r\n]|\\.)*\)/g;
  let lm;
  while ((lm = litRe.exec(combined))) {
    const text = pdfUnescape(lm[0].slice(1, -1));
    if (text === '') continue;
    if (!text.trim()) { literals.push(' '); } // a real word gap from the PDF
    else if (/^[a-z]{2}-[A-Z]{2,4}$/i.test(text.trim())) { /* locale-tag noise */ }
    else literals.push(text.trim());
    if (literals.length > 20000) break;
  }
  const hexRe = /<([0-9a-fA-F]{2,})>/g;
  let hm;
  while ((hm = hexRe.exec(combined))) {
    let text = '';
    for (let i = 0; i + 1 < hm[1].length; i += 2) {
      text += String.fromCharCode(parseInt(hm[1].substr(i, 2), 16));
    }
    const clean = text.replace(/[^\x20-\x7e]/g, '');
    if (!clean.trim()) { if (clean) literals.push(' '); }
    else if (/^[a-z]{2}-[A-Z]{2,4}$/i.test(clean.trim())) { /* locale-tag noise */ }
    else literals.push(clean.trim());
    if (literals.length > 20000) break;
  }

  return joinContinuationLines(chunkText(assembleSyllabusText(literals))).join('\n');
}

// Diagnostics for PDFs that extract to nothing: how many FlateDecode streams
// the file declares, how many inflated OK, and the printable head of the
// first inflated stream. Distinguishes "no compressed streams at all"
// (uncompressed/exotic PDF) from "streams present but the literals aren't
// readable text" (font-encoded, usually CID) from "inflation failing".
export async function probePdfStreams(input) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  const bin = bytesToBinaryString(bytes);
  let declared = 0;
  let inflatedOk = 0;
  let inflatedNonEmpty = 0;
  let firstHead = null;
  const flateRe = /\/(?:FlateDecode|Fl)\b/g;
  const head = (u8) => {
    let out = '';
    for (const b of u8) {
      out += (b >= 32 && b <= 126) ? String.fromCharCode(b) : '.';
      if (out.length >= 80) break;
    }
    return out;
  };
  let fm;
  while ((fm = flateRe.exec(bin))) {
    declared++;
    const streamIdx = bin.indexOf('stream', fm.index + fm[0].length);
    if (streamIdx === -1) break;
    let contentStart = streamIdx + 6;
    if (bin.charCodeAt(contentStart) === 13) contentStart++;
    if (bin.charCodeAt(contentStart) === 10) contentStart++;
    const endIdx = bin.indexOf('endstream', contentStart);
    const rawEnd = endIdx === -1 ? bytes.length : endIdx;
    let rawBytes = bytes.subarray(contentStart, rawEnd);
    while (rawBytes.length && /[\r\n\s]/.test(String.fromCharCode(rawBytes[rawBytes.length - 1]))) {
      rawBytes = rawBytes.subarray(0, rawBytes.length - 1);
    }
    const inflated = await inflateFlate(rawBytes);
    if (inflated) {
      inflatedOk++;
      if (inflated.length > 0) {
        inflatedNonEmpty++;
        if (firstHead === null) firstHead = head(inflated);
      }
    }
  }
  return { declared, inflatedOk, inflatedNonEmpty, firstHead };
}