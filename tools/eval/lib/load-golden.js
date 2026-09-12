'use strict';
/**
 * load-golden.js — read the golden set (JSONL, one task per line). Blank lines and //-comment lines
 * are skipped so the file can carry section headers. Every task is shape-validated on load: a
 * malformed task must fail loudly here, never silently skew a pass rate.
 */

const fs = require('fs');
const path = require('path');

const GOLDEN_PATH = path.resolve(__dirname, '..', 'golden', 'live-edit.jsonl');
const VALID_SUITES = new Set(['capability', 'regression']);
const VALID_OUTCOMES = new Set(['apply', 'refuse', 'blocked']);

function load(file) {
  const p = file || GOLDEN_PATH;
  const raw = fs.readFileSync(p, 'utf8');
  const tasks = [];
  const ids = new Set();
  raw.split(/\r?\n/).forEach((line, i) => {
    const s = line.trim();
    if (!s || s.startsWith('//')) return;
    let t;
    try { t = JSON.parse(s); } catch (e) { throw new Error(`golden line ${i + 1}: invalid JSON — ${e.message}`); }
    if (!t.id) throw new Error(`golden line ${i + 1}: missing id`);
    if (ids.has(t.id)) throw new Error(`golden: duplicate id ${t.id}`);
    ids.add(t.id);
    if (!VALID_SUITES.has(t.suite)) throw new Error(`${t.id}: bad suite ${t.suite}`);
    if (!t.expect || !VALID_OUTCOMES.has(t.expect.outcome)) throw new Error(`${t.id}: bad expect.outcome`);
    tasks.push(t);
  });
  return tasks;
}

module.exports = { load, GOLDEN_PATH };
