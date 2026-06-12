// Wave 55 (Phase C.5) — 📜 CCA-F audit chip. Hermetic: pure buildCcaChip with an
// injected `now`, and a temp MOOTER_HOME for the latest-report picker.

const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const cca = require('./cca-f-status.js');

const NOW = Date.parse('2026-06-11T12:00:00Z');
const iso = (ms) => new Date(ms).toISOString();
const fresh = (over = {}) => ({
  started_at: iso(NOW - 86400000),
  summary: { pass_rate: 0.78, total: 60, routing_accuracy: 0.92, ...(over.summary || {}) },
  ...over,
});

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mooter-ccaf-'));
after(() => { try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* best-effort */ } });

test('no report → 📜 cca-f ? (honest; audit never ran)', () => {
  assert.equal(cca.buildCcaChip(null, NOW), '📜 cca-f ?');
  assert.equal(cca.readLatestReport(path.join(tmp, 'empty-home')), null);
});

test('fresh report → formatted chip', () => {
  assert.equal(cca.buildCcaChip(fresh(), NOW), '📜 cca-f 78% pass (60q, n=1)');
  // pass_rate already in percent form is accepted
  assert.equal(cca.buildCcaChip(fresh({ summary: { pass_rate: 78, total: 60 } }), NOW), '📜 cca-f 78% pass (60q, n=1)');
});

test('stale report (>30 days) → 📜 cca-f ?', () => {
  assert.equal(cca.buildCcaChip(fresh({ started_at: iso(NOW - (cca.STALE_DAYS + 1) * 86400000) }), NOW), '📜 cca-f ?');
  // no started_at → cannot prove freshness → ?
  assert.equal(cca.buildCcaChip({ summary: { pass_rate: 0.78, total: 60 } }, NOW), '📜 cca-f ?');
});

test('non-numeric pass rate → 📜 cca-f ?', () => {
  assert.equal(cca.buildCcaChip(fresh({ summary: { pass_rate: 'NaN', total: 60 } }), NOW), '📜 cca-f ?');
});

test('readLatestReport picks the newest session dir by mtime', () => {
  const home = path.join(tmp, 'home');
  const root = cca.auditRoot(home);
  const older = path.join(root, '2026-06-09-aaa');
  const newer = path.join(root, '2026-06-11-bbb');
  fs.mkdirSync(older, { recursive: true });
  fs.mkdirSync(newer, { recursive: true });
  fs.writeFileSync(path.join(older, 'report.json'), JSON.stringify(fresh({ summary: { pass_rate: 0.5, total: 10 } })));
  fs.writeFileSync(path.join(newer, 'report.json'), JSON.stringify(fresh({ summary: { pass_rate: 0.9, total: 60 } })));
  // ensure the "newer" dir's report.json has a strictly later mtime
  const future = Date.now() / 1000 + 100;
  fs.utimesSync(path.join(newer, 'report.json'), future, future);
  const r = cca.readLatestReport(home);
  assert.equal(r.summary.pass_rate, 0.9, 'returns the newest report');
  assert.equal(cca.buildCcaChip(r, NOW), '📜 cca-f 90% pass (60q, n=1)');
});
