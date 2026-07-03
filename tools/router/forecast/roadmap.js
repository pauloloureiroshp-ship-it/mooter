#!/usr/bin/env node
// roadmap.js — parse MOOTER_ROADMAP.md wave tables → structured waves[].
//
// The roadmap MD is the DECLARED plan (what the human intends to run); the
// ledger is the OBSERVED past. The forecast joins them: for each planned wave it
// reads the declared class/mode/deps here and pulls the empirical distribution
// from the matching ledger class.
//
// The roadmap can change. When it does, `scope_hash` changes and every prior
// forecast for a moved/renamed wave goes STALE (DC-14/15) — enforced upstream in
// forecast.js. This parser is pure and content-driven so it survives light
// table-shape drift. Never throws.

'use strict';

const PHASE_RE = /^#{1,4}\s*.*\bFASE\s+(NOW|NEXT|FRONTIER)\b/i;
const WAVE_ID_RE = /^W\d+(?:\.\d+)?$/i;

// Strip markdown emphasis / code ticks / stray emoji-space so a cell like
// `**W4**` or `` `frugal-fleet` `` compares cleanly.
function _clean(cell) {
  return String(cell == null ? '' : cell)
    .replace(/`/g, '')
    .replace(/\*\*/g, '')
    .replace(/^\s+|\s+$/g, '');
}

// Split one markdown table row into trimmed cells (drops the leading/trailing
// empty cells that surround `| a | b |`).
function _cells(line) {
  const raw = String(line);
  if (raw.indexOf('|') < 0) return null;
  let parts = raw.split('|');
  // Drop the empty edges produced by leading/trailing pipes.
  if (parts.length && parts[0].trim() === '') parts = parts.slice(1);
  if (parts.length && parts[parts.length - 1].trim() === '') parts = parts.slice(0, -1);
  return parts.map((c) => c.trim());
}

// A separator row is `|---|:--:|---|`.
function _isSeparator(cells) {
  return cells.length > 0 && cells.every((c) => /^:?-{2,}:?$/.test(c.replace(/\s/g, '')));
}

// From a header row, map known column meanings → index. Content-tolerant.
function _headerMap(cells) {
  const map = {};
  cells.forEach((c, i) => {
    const h = _clean(c).toLowerCase();
    if (/^#$/.test(h) || /\bwave\b/.test(h) && map.id == null && !/objectiv/.test(h)) {
      // "#" or "Wave" — the id/name column. First such column is the id anchor.
      if (map.id == null) map.id = i;
    }
    if (/objectiv|goal/.test(h)) map.goal = i;
    else if (/\bmodo\b|\bmode\b/.test(h)) map.mode = i;
    else if (/worktree/.test(h)) map.worktree = i;
    else if (/effort|esfor/.test(h)) map.effort = i;
    else if (/\bdep/.test(h)) map.deps = i;
    else if (/\bwave\b/.test(h) && map.name == null) map.name = i;
  });
  return map;
}

// Extract W-ids from a Dep cell ("W2", "W1, W4", "—", "").
function _parseDeps(cell) {
  const c = _clean(cell);
  if (!c || /^[—\-–]$/.test(c)) return [];
  const ids = c.match(/W\d+(?:\.\d+)?/gi) || [];
  return ids.map((s) => s.toUpperCase());
}

// Normalize effort to S|M|L|XL when recognizable, else the raw token.
function _effort(cell) {
  const c = _clean(cell).toUpperCase();
  const m = c.match(/\b(XL|S|M|L)\b/);
  return m ? m[1] : (c || null);
}

// Parse the full roadmap markdown into waves[].
// Each wave: { wave_id, name, goal, mode, worktree, effort, deps[], phase }.
function parseRoadmap(md) {
  const waves = [];
  const lines = String(md == null ? '' : md).split(/\r?\n/);
  let phase = null;
  let header = null; // { id, name, goal, mode, worktree, effort, deps }
  const seen = new Set();

  for (const line of lines) {
    const ph = line.match(PHASE_RE);
    if (ph) { phase = ph[1].toUpperCase(); continue; }

    const cells = _cells(line);
    if (!cells) { continue; }
    if (_isSeparator(cells)) { continue; }

    // Header row: contains a "Wave" column and a "Dep"/"Modo" column.
    const looksHeader = cells.some((c) => /\bwave\b/i.test(c)) &&
      cells.some((c) => /\bdep|modo|mode\b/i.test(c));
    if (looksHeader) { header = _headerMap(cells); continue; }

    // Data row: must carry a wave id somewhere.
    const idIdx = cells.findIndex((c) => WAVE_ID_RE.test(_clean(c)));
    if (idIdx < 0) continue;
    const wave_id = _clean(cells[idIdx]).toUpperCase();
    if (seen.has(wave_id)) continue; // first declaration wins

    // Prefer header-driven columns; fall back to positional heuristics.
    const at = (key, fallbackIdx) => {
      const i = header && header[key] != null ? header[key] : fallbackIdx;
      return (i != null && i < cells.length) ? cells[i] : '';
    };
    const name = _clean(at('name', idIdx + 1)) || _clean(cells[idIdx + 1] || '');
    const goal = _clean(at('goal', idIdx + 2));
    // Mode / worktree / effort / deps: header first, else scan cells by content.
    let mode = _clean(at('mode', -1));
    let worktree = _clean(at('worktree', -1));
    let effortCell = at('effort', -1);
    let depsCell = at('deps', cells.length - 1);

    if (!mode) { const c = cells.find((x) => /cc[-\s]?once|loop|schedule|dynamic[-\s]?workflow/i.test(x)); mode = _clean(c || ''); }
    if (!worktree) { const c = cells.find((x) => /`?frugal-[a-z0-9-]+`?/i.test(x)); worktree = _clean(c || ''); }
    if (!effortCell) { const c = cells.find((x) => /^\s*\**\s*(XL|S|M|L)\s*\**\s*$/.test(x)); effortCell = c || ''; }

    waves.push({
      wave_id,
      name,
      goal,
      mode: mode || null,
      worktree: worktree || null,
      effort: _effort(effortCell),
      deps: _parseDeps(depsCell),
      phase,
    });
    seen.add(wave_id);
  }
  return waves;
}

module.exports = { parseRoadmap };
