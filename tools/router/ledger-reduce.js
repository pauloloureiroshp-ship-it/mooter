#!/usr/bin/env node
// ledger-reduce.js — Moo Ledger Spine L1: the SINGLE reducer.
//
// The journal is the truth; Markdown is a PROJECTION of it. This kills direct,
// concurrent writes to a shared MD: N moos EMIT `kind:handoff` events into the
// per-session journal, and this one reducer materializes `_handoff/guardian/
// <sid>.md` from the LAST such event — atomically (tmp+rename).
//
// DETERMINISTIC REPLAY: the same sequence of events always yields the same MD,
// because the projection is a pure function of the last handoff event's payload.
// (MOO_LEDGER_AND_ORCHESTRATION.md — replay determinístico, fork barato, lineage.)
//
// Never throws (best-effort doctrine, like the rest of the spine).

'use strict';

const fs = require('fs');
const path = require('path');
const journal = require('./handoff-journal.js');

function _safeId(id) { return String(id || '').replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80); }

// Where the reducer writes projections. Env-overridable for tests/sandbox;
// default is the repo's `_handoff/guardian/` (this file lives at tools/router/,
// so repo root is two levels up — matches the Guardian's existing convention).
function defaultOutDir() {
  if (process.env.MOOTER_HANDOFF_OUT_DIR && process.env.MOOTER_HANDOFF_OUT_DIR.length > 0) {
    return process.env.MOOTER_HANDOFF_OUT_DIR;
  }
  return path.resolve(__dirname, '..', '..', '_handoff', 'guardian');
}

// PURE: the Markdown body for a single `kind:handoff` event. The journal is the
// truth, so the body lives in the event's `output` payload. Accepts a raw string,
// or an object carrying { markdown } / { body } (the structured shape moos emit).
// Returns null when there is no renderable body (caller skips — never fabricates).
function projectHandoffMarkdown(ev) {
  if (!ev) return null;
  const out = ev.output;
  if (typeof out === 'string') return out;
  if (out && typeof out === 'object') {
    if (typeof out.markdown === 'string') return out.markdown;
    if (typeof out.body === 'string') return out.body;
  }
  return null;
}

// PURE: given an ordered event list, project the body of the LAST handoff event.
// Deterministic — same events in → same body out. null when none/empty.
function projectFromEvents(events) {
  let last = null;
  for (const e of (Array.isArray(events) ? events : [])) {
    if (e && e.kind === 'handoff') last = e;
  }
  return projectHandoffMarkdown(last);
}

// Reduce a session's journal → `<sid>.md`, atomically. Reads the last
// `kind:handoff` event and writes its projected body. Returns a result object;
// never throws. Skips (ok:false) when there is no handoff event or no body —
// it never writes an empty/fabricated file.
function reduceSession(sid, opts = {}) {
  try {
    if (!sid) return { ok: false, reason: 'no-sid' };
    const ev = journal.lastEventOfKind(sid, 'handoff');
    if (!ev) return { ok: false, reason: 'no-handoff-event' };
    const md = projectHandoffMarkdown(ev);
    if (md == null) return { ok: false, reason: 'no-body' };

    const outDir = opts.outDir || defaultOutDir();
    fs.mkdirSync(outDir, { recursive: true });
    const file = path.join(outDir, _safeId(sid) + '.md');
    const tmp = file + '.' + process.pid + '.tmp';
    fs.writeFileSync(tmp, md);
    fs.renameSync(tmp, file);
    return { ok: true, file, bytes: Buffer.byteLength(md, 'utf8') };
  } catch {
    return { ok: false, reason: 'error' };
  }
}

module.exports = { reduceSession, projectHandoffMarkdown, projectFromEvents, defaultOutDir };

// CLI: `node ledger-reduce.js <sid> [outDir]` — one-shot projection. Best-effort.
if (require.main === module) {
  const sid = process.argv[2];
  const outDir = process.argv[3];
  const r = reduceSession(sid, outDir ? { outDir } : {});
  try { process.stdout.write(JSON.stringify(r) + '\n'); } catch { /* ignore */ }
  process.exit(r.ok ? 0 : 1);
}
