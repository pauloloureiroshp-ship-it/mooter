#!/usr/bin/env node
// ledger-read.js — turn the Moo Ledger (per-session JSONL) into duration samples.
//
// The journal is the truth (MOO_LEDGER_AND_ORCHESTRATION.md). One file = one
// session (sid). Each session ran ONE launching masterprompt (its first
// `kind:intent`) → that intent's text names the CLASS (DC-01). The session's
// duration = last event ts − first event ts (confirmed with the human: there is
// a `ts` per event; duration is derived per-sid, never a fabricated start+fim).
//
// Two clocks (DC-07): WALL = last−first; WORK = only the active bursts (idle
// gaps > IDLE_GAP are the human being away — "awaiting-you", not the moos).
// The biggest delay in Mooter is human; the forecast must report both.
//
// A session is only a valid duration sample when it has ≥2 events, a positive
// wall, AND a nameable class. Backfilled events that share one timestamp collapse
// to wall=0 → excluded (honest: a zero-second "session" describes nothing).
//
// Pure over an events-by-sid map; a thin fs loader is provided separately and
// never throws.

'use strict';

const fs = require('fs');
const path = require('path');
const { classifySession, bucketKey } = require('./class-taxonomy.js');

const IDLE_GAP_MS = 30 * 60 * 1000; // 30 min: above this a gap is human wait, not work.

// --- blocker taxonomy (DC-03): probability×duration is modelled per class in
// montecarlo.js; here we only DETECT which blocker (if any) a past session hit,
// conditioned on textual evidence. Never inherit an OAuth tail into a wave with
// no OAuth surface. ---
const BLOCKER_RES = [
  { cause: 'oauth', re: /\b(oauth|token\s+expir|re-?auth|authoriz|authentic|login\s+flow|401|unauthorized)\b/i },
  { cause: 'worktree_lock', re: /\b(worktree.*lock|lock.*worktree|index\.lock|another\s+git\s+process|\.git\/index)\b/i },
  { cause: 'mount_windows', re: /\b(mount|EPERM|EBUSY|\\\\wsl|unc\s+path|windows\s+path|drive\s+letter)\b/i },
];

function _ts(ev) { const t = ev && ev.ts ? Date.parse(ev.ts) : NaN; return Number.isFinite(t) ? t : NaN; }

// All human-readable text carried by an event (for class + blocker detection).
function _text(ev) {
  if (!ev) return '';
  const parts = [];
  const inp = ev.input;
  if (inp && typeof inp === 'object') { if (inp.q) parts.push(inp.q); if (inp.title) parts.push(inp.title); }
  const out = ev.output;
  if (out && typeof out === 'object') {
    for (const k of ['question', 'done', 'markdown', 'body', 'summary']) if (out[k]) parts.push(String(out[k]));
    if (Array.isArray(out.options)) parts.push(out.options.join(' '));
  }
  if (ev.assistant_snippet) parts.push(String(ev.assistant_snippet));
  return parts.join(' ␟ ');
}

function _detectBlocker(text) {
  for (const b of BLOCKER_RES) if (b.re.test(text)) return b.cause;
  return 'none';
}

// Substantive-work proxy (DC-08/09/10): the unit must be invariant to
// granularity — count real artefacts (non-MD files edited, tests touched,
// WORK:+X/-Y from the ledger), NOT waves/turns. Labelled a *proxy* on purpose.
function _workSignal(events) {
  const files = new Set();
  const tests = new Set();
  let workDelta = 0;
  for (const ev of events) {
    const tools = Array.isArray(ev.tools) ? ev.tools : [];
    for (const tl of tools) {
      const name = String((tl && tl.name) || '');
      const target = String((tl && tl.target) || '');
      if (!target) continue;
      if (/test/i.test(target)) tests.add(target);
      if (/^(Edit|Write|NotebookEdit)$/.test(name) && !/\.md$/i.test(target)) files.add(target);
    }
    const m = _text(ev).match(/WORK:\s*\+(\d+)\s*\/\s*-?(\d+)/i);
    if (m) workDelta += (parseInt(m[1], 10) || 0) + (parseInt(m[2], 10) || 0);
  }
  return files.size + tests.size * 2 + workDelta;
}

// PURE: derive ONE session record from its ordered events.
function sessionFromEvents(sid, rawEvents) {
  const events = (Array.isArray(rawEvents) ? rawEvents.slice() : [])
    .filter((e) => e && Number.isFinite(_ts(e)))
    .sort((a, b) => _ts(a) - _ts(b));
  const n_events = events.length;
  const first = events[0], last = events[n_events - 1];
  const first_ts = first ? _ts(first) : NaN;
  const last_ts = last ? _ts(last) : NaN;
  const wall_ms = (Number.isFinite(first_ts) && Number.isFinite(last_ts)) ? (last_ts - first_ts) : 0;

  // Work = sum of active gaps (idle gaps clipped out).
  let work_ms = 0;
  for (let i = 1; i < events.length; i++) {
    const gap = _ts(events[i]) - _ts(events[i - 1]);
    if (gap > 0 && gap <= IDLE_GAP_MS) work_ms += gap;
  }
  const awaiting_ms = Math.max(0, wall_ms - work_ms);

  // Class from the FIRST intent (the launching masterprompt); fall back to the
  // first event carrying any text.
  const firstIntent = events.find((e) => e.kind === 'intent') || events.find((e) => _text(e));
  const intentText = firstIntent ? _text(firstIntent) : '';
  const { class: cls, mode } = classifySession(intentText);

  const allText = events.map(_text).join(' ␟ ');
  const blocker_cause = _detectBlocker(allText);
  const n_decisions = events.filter((e) => e.kind === 'decision').length;
  const n_human_gates = events.filter((e) => e.kind === 'decision' && e.output && e.output.answered_by === 'human').length;
  const work_signal = _workSignal(events);
  const event_ids = events.map((e, i) => (e.idem_key || (e.kind ? e.kind + ':' + i : 't:' + i)));

  const valid = n_events >= 2 && wall_ms > 0 && cls != null;

  return {
    sid: String(sid),
    class: cls,
    mode,
    bucket: bucketKey(cls, mode),
    first_ts, last_ts,
    wall_ms, work_ms, awaiting_ms,
    n_events, n_decisions, n_human_gates,
    blocker_cause,
    work_signal,
    event_ids,
    intent_excerpt: String(intentText).slice(0, 120),
    valid,
  };
}

// PURE: many sessions from a { sid: events[] } map. Sorted by first_ts.
function sessionsFromMap(bySid) {
  const out = [];
  const map = bySid && typeof bySid === 'object' ? bySid : {};
  for (const sid of Object.keys(map)) out.push(sessionFromEvents(sid, map[sid]));
  return out.sort((a, b) => (a.first_ts || 0) - (b.first_ts || 0));
}

// PURE: group valid sessions into class×mode buckets → { bucket: session[] }.
function bucketSessions(sessions) {
  const buckets = {};
  for (const s of (sessions || [])) {
    if (!s.valid || !s.bucket) continue;
    (buckets[s.bucket] = buckets[s.bucket] || []).push(s);
  }
  return buckets;
}

// --- fs loader (never throws) ---------------------------------------------
// One *.jsonl file per session; filename (minus .jsonl) is the sid. Skips the
// .summary.txt / .rollup-ts siblings. Degrades to {} on any error.
function loadEventsFromDir(dir) {
  const bySid = {};
  try {
    const files = fs.readdirSync(dir).filter((f) => /\.jsonl$/.test(f));
    for (const f of files) {
      const sid = f.replace(/\.jsonl$/, '');
      try {
        const lines = fs.readFileSync(path.join(dir, f), 'utf8').split('\n').filter(Boolean);
        bySid[sid] = lines.map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
      } catch { bySid[sid] = []; }
    }
  } catch { /* no dir → {} */ }
  return bySid;
}

// Default ledger dir — mirrors handoff-journal.js's contract so the engine reads
// the SAME journals the accumulator writes.
function defaultLedgerDir() {
  if (process.env.MOOTER_HOME && process.env.MOOTER_HOME.length > 0) {
    return path.join(process.env.MOOTER_HOME, 'handoff');
  }
  // tools/router/forecast/ → tools/router/handoff
  return path.resolve(__dirname, '..', 'handoff');
}

module.exports = {
  sessionFromEvents, sessionsFromMap, bucketSessions,
  loadEventsFromDir, defaultLedgerDir,
  IDLE_GAP_MS,
};
