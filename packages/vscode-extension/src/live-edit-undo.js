'use strict';
/**
 * live-edit-undo.js — LP-4 §4 · $0 undo by INVERSE BYTE-SPLICE. ZERO LLM, zero git.
 *
 * Every Live Edit write is a single contiguous splice (text/class edit, delete, fenced model
 * replacement — all of them). computeSplice() derives the exact change window from the
 * before/after pair (common prefix/suffix trim) and the undo entry stores
 * { file, start, prev, afterLen, shaAfter }: enough to put the previous bytes back with one
 * inverse splice. FAIL-CLOSED: applyUndo() refuses ('undo-stale') unless the CURRENT content
 * still hashes to shaAfter — if anything else wrote the file since (HMR, an agent, the editor),
 * we never blind-revert over it; the panel says so honestly instead.
 *
 * Pure module: fs and the stack live host-side (extension.js). Every entry returns
 * { ok:false, reason } instead of throwing.
 */

const crypto = require('crypto');

function sha256(s) { return crypto.createHash('sha256').update(String(s == null ? '' : s), 'utf8').digest('hex'); }

// The exact contiguous change window between two versions: after = before[0..start) + X +
// before[start+prev.length..], where |X| = afterLen. Returns null when nothing changed.
function computeSplice(before, after) {
  const a = String(before == null ? '' : before);
  const b = String(after == null ? '' : after);
  if (a === b) return null;
  let p = 0;
  const max = Math.min(a.length, b.length);
  while (p < max && a.charCodeAt(p) === b.charCodeAt(p)) p++;
  let ea = a.length;
  let eb = b.length;
  while (ea > p && eb > p && a.charCodeAt(ea - 1) === b.charCodeAt(eb - 1)) { ea--; eb--; }
  return { start: p, prev: a.slice(p, ea), afterLen: eb - p };
}

// Build the undo entry for a write that turned `before` into `after` in `file`.
// null = no-op write (nothing to undo).
function makeEntry(file, before, after) {
  const s = computeSplice(before, after);
  if (!s) return null;
  return { file: String(file == null ? '' : file), start: s.start, prev: s.prev, afterLen: s.afterLen, shaAfter: sha256(after) };
}

// The inverse splice over the CURRENT content. Fail-closed: the current content must still hash
// to shaAfter (our write is the last one standing); anything else → honest refusal, no write.
function applyUndo(entry, current) {
  if (!entry || typeof entry !== 'object'
    || !Number.isInteger(entry.start) || !Number.isInteger(entry.afterLen)
    || typeof entry.prev !== 'string' || typeof entry.shaAfter !== 'string') {
    return { ok: false, reason: 'bad-entry' };
  }
  const cur = String(current == null ? '' : current);
  if (sha256(cur) !== entry.shaAfter) return { ok: false, reason: 'undo-stale' };
  const end = entry.start + entry.afterLen;
  if (entry.start < 0 || entry.afterLen < 0 || end > cur.length) return { ok: false, reason: 'bad-entry' };
  return { ok: true, code: cur.slice(0, entry.start) + entry.prev + cur.slice(end) };
}

module.exports = { computeSplice, makeEntry, applyUndo, sha256 };
