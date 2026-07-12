'use strict';

// FRENTE C · PM Adapters — debounce + coalescing + loop kill-switch (DC-13).
//
// "Debounce+coalescing: 1 notificação-resumo/5min, kill-switch de loop."
//
// Per tool we keep a rolling window. enqueue() buffers stamped payloads; the sink is
// flushed AT MOST once per WINDOW_MS, and a flush collapses everything buffered into a
// SINGLE summary (never one notification per event). If enqueues within a window exceed
// MAX_PER_WINDOW, we assume a feedback loop (Ledger→sink→webhook→Ledger→…) and TRIP the
// kill-switch: all outbound for that tool stops until a human reset()s it.
//
// State persists to `~/.mooter/pm-adapters/debounce.json` so a process restart doesn't
// drop buffered events or reset the loop counter. All time is injected (`now`) — no
// hidden clock, so tests are deterministic.

const path = require('path');
const { pmDir, readJson, writeJson } = require('./home.js');

const WINDOW_MS = 5 * 60 * 1000;   // 5 minutes — the coalescing + rate window.
const MAX_PER_WINDOW = 20;         // > this many enqueues in one window ⇒ loop ⇒ trip.

function statePath() {
  return path.join(pmDir(), 'debounce.json');
}

function readState() {
  const s = readJson(statePath(), {});
  return s && typeof s === 'object' ? s : {};
}

function writeState(s) {
  return writeJson(statePath(), s, { mode: 0o600 });
}

function toolState(s, tool) {
  if (!s[tool] || typeof s[tool] !== 'object') {
    s[tool] = { pending: [], lastFlush: 0, windowStart: 0, count: 0, tripped: false };
  }
  const t = s[tool];
  if (!Array.isArray(t.pending)) t.pending = [];
  return t;
}

/** Buffer a stamped payload for a tool. Returns { queued, tripped, pending }.
 *  A tripped tool silently drops (no throw) until reset. */
function enqueue(tool, payload, now) {
  const s = readState();
  const t = toolState(s, tool);
  if (t.tripped) { writeState(s); return { queued: false, tripped: true, pending: t.pending.length }; }

  // Roll the loop-detection window.
  if (now - t.windowStart >= WINDOW_MS) { t.windowStart = now; t.count = 0; }
  t.count += 1;
  if (t.count > MAX_PER_WINDOW) {
    t.tripped = true;
    t.tripped_at = now;
    t.tripped_reason = `>${MAX_PER_WINDOW} events in ${WINDOW_MS}ms — loop suspected`;
    writeState(s);
    return { queued: false, tripped: true, pending: t.pending.length };
  }

  t.pending.push(payload);
  writeState(s);
  return { queued: true, tripped: false, pending: t.pending.length };
}

/** Should the tool flush now? True only when the window has elapsed AND there is buffered
 *  work AND the kill-switch is not tripped. */
function shouldFlush(tool, now) {
  const t = toolState(readState(), tool);
  return !t.tripped && t.pending.length > 0 && now - t.lastFlush >= WINDOW_MS;
}

/** Collapse buffered payloads into ONE summary, clear the buffer, stamp lastFlush.
 *  Returns the summary, or null if nothing to flush / tripped. */
function drain(tool, now) {
  const s = readState();
  const t = toolState(s, tool);
  if (t.tripped || t.pending.length === 0) return null;
  const items = t.pending;
  const summary = {
    tool,
    flushed_at: now,
    count: items.length,
    ledger_event_ids: items.map((p) => p && p.ledger_event_id).filter(Boolean),
    items, // the individual stamped payloads (all carry the watermark)
  };
  t.pending = [];
  t.lastFlush = now;
  writeState(s);
  return summary;
}

function isTripped(tool) {
  return toolState(readState(), tool).tripped === true;
}

/** Human reset of a tripped tool (clears loop counter, keeps any buffered pending). */
function reset(tool) {
  const s = readState();
  const t = toolState(s, tool);
  t.tripped = false;
  t.count = 0;
  t.windowStart = 0;
  delete t.tripped_at;
  delete t.tripped_reason;
  return writeState(s);
}

function pendingCount(tool) {
  return toolState(readState(), tool).pending.length;
}

module.exports = {
  WINDOW_MS, MAX_PER_WINDOW,
  enqueue, shouldFlush, drain, isTripped, reset, pendingCount, statePath,
};
