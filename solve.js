// Fast drop-in for csv-reader 1.0.0 (make.fun's own CSV reader).
//
// Returns exactly csv-reader's answer {columns, rows, errors} for one input
// {text, header}. Same reading policy, faster mechanics:
//
//   - a U+FEFF at the very start is dropped;
//   - a record ends at LF or CRLF, a line left with no characters is no record;
//   - outside quotes a CR not followed by LF is dropped (stray_cr);
//   - a field that opens with a quote runs to the next quote that is not
//     doubled, "" inside it one quote, each CRLF or lone CR inside it read as
//     LF; what follows its closing quote, up to the next comma or line break,
//     is appended as it stands (quote_junk, when the field ends); a quote that
//     never closes is a literal character, and the text after it is read again
//     as unquoted (unterminated_quote);
//   - a quote inside an unquoted field is a literal character; fields stay
//     strings, never trimmed or converted;
//   - columns is the first record when header is true, else null; rows holds
//     the records after it, each padded with "" (short_row) or cut (long_row)
//     to the first record's width; each error is {code, line, row}, in the
//     order met, line the 1-based line its record starts on.
//
// Speed comes from jumping between delimiters with the engine's native search
// and slicing whole fields out in one piece, instead of building them a
// character at a time: a record with no quote and no stray CR is cut with one
// slice and one split; an unquoted field is found from its next comma and the
// slice up to it checked for a line break or stray CR; a quoted field is found
// from its next quote and the slice up to it checked for a line break or CR.
// Only a field holding a stray CR, or a quoted stretch holding a line break,
// falls back to a character loop. No state is kept from one call to the next.

const COMMA = 0;
const LINE_BREAK = 1;
const END = 2;

/** csv-reader 1.0.0's answer for one case's input. */
export function run(input) {
  const text = String(input.text);
  const header = input.header === true;
  const n = text.length;
  const errors = [];
  const rows = [];
  let columns = null;
  let width = -1;

  let pos = text.charCodeAt(0) === 0xfeff ? 1 : 0;
  let line = 1;

  // Reads unquoted characters onto `value` up to the next comma or line
  // break, a character at a time: a CR not followed by LF is dropped
  // (stray_cr). The fallback for a field the fast scan found a stray CR in.
  // Returns [value, ended, added]; `added` counts the characters kept.
  function readUnquotedSlow(value, recordLine, recordRow) {
    let added = 0;
    let seg = pos;
    while (pos < n) {
      const c = text.charCodeAt(pos);
      if (c === 44) {
        if (pos > seg) {
          value += text.slice(seg, pos);
          added += pos - seg;
        }
        pos += 1;
        return [value, COMMA, added];
      }
      if (c === 10) {
        if (pos > seg) {
          value += text.slice(seg, pos);
          added += pos - seg;
        }
        pos += 1;
        line += 1;
        return [value, LINE_BREAK, added];
      }
      if (c === 13) {
        if (pos > seg) {
          value += text.slice(seg, pos);
          added += pos - seg;
        }
        if (pos + 1 < n && text.charCodeAt(pos + 1) === 10) {
          pos += 2;
          line += 1;
          return [value, LINE_BREAK, added];
        }
        errors.push({ code: 'stray_cr', line: recordLine, row: recordRow });
        pos += 1;
        seg = pos;
        continue;
      }
      pos += 1;
    }
    if (pos > seg) {
      value += text.slice(seg, pos);
      added += pos - seg;
    }
    return [value, END, added];
  }

  // Reads unquoted characters onto `value` up to the next comma or line
  // break. Returns [value, ended, added]; `added` counts the characters kept.
  function readUnquoted(value, recordLine, recordRow) {
    const c = text.indexOf(',', pos);
    if (c === -1) {
      // No more commas: the field runs to the next line break or the end.
      const l = text.indexOf('\n', pos);
      if (l === -1) {
        const seg = text.slice(pos);
        if (seg.indexOf('\r') === -1) {
          pos = n;
          return [value + seg, END, seg.length];
        }
        return readUnquotedSlow(value, recordLine, recordRow);
      }
      let contentEnd = l;
      if (l > pos && text.charCodeAt(l - 1) === 13) contentEnd = l - 1;
      const seg = text.slice(pos, contentEnd);
      if (seg.indexOf('\r') === -1) {
        pos = l + 1;
        line += 1;
        return [value + seg, LINE_BREAK, seg.length];
      }
      return readUnquotedSlow(value, recordLine, recordRow);
    }
    const seg = text.slice(pos, c);
    if (seg.indexOf('\n') === -1 && seg.indexOf('\r') === -1) {
      pos = c + 1;
      return [value + seg, COMMA, seg.length];
    }
    const lf = seg.indexOf('\n');
    if (lf === -1) return readUnquotedSlow(value, recordLine, recordRow);
    // A line break comes before the comma: the field ends at it.
    let contentEnd = lf;
    if (lf > 0 && seg.charCodeAt(lf - 1) === 13) contentEnd = lf - 1;
    const head = seg.slice(0, contentEnd);
    if (head.indexOf('\r') === -1) {
      pos = pos + lf + 1;
      line += 1;
      return [value + head, LINE_BREAK, head.length];
    }
    return readUnquotedSlow(value, recordLine, recordRow);
  }

  // Reads a quoted field whose opening quote is at pos. Returns
  // [value, ended, added] (added is only meaningful for the junk tail).
  function readQuoted(recordLine, recordRow) {
    const open = pos;
    const openLine = line;
    let value = '';
    pos += 1;
    let closed = false;
    while (pos < n) {
      const q = text.indexOf('"', pos);
      if (q === -1) break;
      const seg = text.slice(pos, q);
      if (seg.indexOf('\n') === -1 && seg.indexOf('\r') === -1) {
        value += seg;
        pos = q;
      } else {
        // The stretch holds a line break or a CR: walk it a character at a
        // time, each CRLF or lone CR inside quotes read as one LF.
        let s = pos;
        let segStart = pos;
        while (s < q) {
          const ch = text.charCodeAt(s);
          if (ch === 13) {
            value += text.slice(segStart, s);
            value += '\n';
            line += 1;
            s += s + 1 < n && text.charCodeAt(s + 1) === 10 ? 2 : 1;
            segStart = s;
          } else {
            if (ch === 10) line += 1;
            s += 1;
          }
        }
        value += text.slice(segStart, q);
        pos = q;
      }
      if (q + 1 < n && text.charCodeAt(q + 1) === 34) {
        value += '"';
        pos = q + 2;
        continue;
      }
      pos = q + 1;
      closed = true;
      break;
    }
    if (!closed) {
      // The quote never closes: it is a literal character, and the text after
      // it is read again as unquoted.
      pos = open + 1;
      line = openLine;
      errors.push({ code: 'unterminated_quote', line: recordLine, row: recordRow });
      return readUnquoted('"', recordLine, recordRow);
    }
    if (pos >= n) return [value, END, 0];
    const c = text.charCodeAt(pos);
    if (c === 44) {
      pos += 1;
      return [value, COMMA, 0];
    }
    if (c === 10) {
      pos += 1;
      line += 1;
      return [value, LINE_BREAK, 0];
    }
    if (c === 13 && pos + 1 < n && text.charCodeAt(pos + 1) === 10) {
      pos += 2;
      line += 1;
      return [value, LINE_BREAK, 0];
    }
    // What follows the closing quote is appended as it stands, up to the next
    // comma or line break.
    const junk = readUnquoted(value, recordLine, recordRow);
    if (junk[2] > 0) errors.push({ code: 'quote_junk', line: recordLine, row: recordRow });
    return junk;
  }

  while (true) {
    // Lines with no characters are no records.
    while (pos < n) {
      const c = text.charCodeAt(pos);
      if (c === 10) {
        pos += 1;
        line += 1;
      } else if (c === 13 && pos + 1 < n && text.charCodeAt(pos + 1) === 10) {
        pos += 2;
        line += 1;
      } else {
        break;
      }
    }
    if (pos >= n) break;

    const recordLine = line;
    const recordRow = header && columns === null ? null : rows.length;

    // Fast path: the record holds no quote and no stray CR, so it ends at the
    // next LF (or the end of the text) and its fields are one slice + split.
    // A CR is allowed only as the CRLF pair ending the record. The quote is
    // looked for first, so a record that needs the slow path never pays for
    // a slice it throws away.
    const lineEnd = text.indexOf('\n', pos);
    const end = lineEnd === -1 ? n : lineEnd;
    const q = text.indexOf('"', pos);
    const r = text.indexOf('\r', pos);
    if (
      (q === -1 || q >= end) &&
      (r === -1 || r >= end || (lineEnd !== -1 && r === end - 1))
    ) {
      const segEnd = lineEnd !== -1 && r === end - 1 ? end - 1 : end;
      const fields = text.slice(pos, segEnd).split(',');
      pos = lineEnd === -1 ? n : lineEnd + 1;
      line += 1;
      if (fields.length === 1 && fields[0] === '') continue;
      if (width < 0) width = fields.length;
      if (header && columns === null) {
        columns = fields;
        continue;
      }
      if (fields.length < width) {
        errors.push({ code: 'short_row', line: recordLine, row: recordRow, fields: fields.length });
        while (fields.length < width) fields.push('');
      } else if (fields.length > width) {
        errors.push({ code: 'long_row', line: recordLine, row: recordRow, extra: fields.splice(width) });
      }
      rows.push(fields);
      continue;
    }

    // Slow path: at least one quoted field or a stray CR in this record.
    const fields = [];
    let field;
    let quoted = false;
    do {
      quoted = text.charCodeAt(pos) === 34;
      field = quoted
        ? readQuoted(recordLine, recordRow)
        : readUnquoted('', recordLine, recordRow);
      fields.push(field[0]);
    } while (field[1] === COMMA);

    // A line that held only stray CRs is left with no characters: no record
    // (its stray_cr errors stay).
    if (fields.length === 1 && fields[0] === '' && !quoted) continue;

    if (width < 0) width = fields.length;
    if (header && columns === null) {
      columns = fields;
      continue;
    }
    if (fields.length < width) {
      errors.push({ code: 'short_row', line: recordLine, row: recordRow, fields: fields.length });
      while (fields.length < width) fields.push('');
    } else if (fields.length > width) {
      errors.push({ code: 'long_row', line: recordLine, row: recordRow, extra: fields.splice(width) });
    }
    rows.push(fields);
  }
  return { columns: header ? (columns ?? []) : null, rows, errors };
}
