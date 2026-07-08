// lp-audit-summary.test.js — Review Security · LP-5. Static `npm audit --json` summarizer:
// pins counts/top/prod-vs-dev split, the honest (non-alarmist) summary language, and fail-soft
// behaviour on unparseable/garbage input.
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { summarizeNpmAudit } = require('./lp-audit-summary.js');

function auditJson(vulns, metaCounts) {
  return JSON.stringify({
    auditReportVersion: 2,
    vulnerabilities: vulns,
    metadata: { vulnerabilities: metaCounts },
  });
}

test('summarizeNpmAudit: parses npm v7+ schema counts from metadata.vulnerabilities', () => {
  const json = auditJson(
    { lodash: { name: 'lodash', severity: 'high', isDirect: true, via: [{ title: 'Prototype Pollution' }], range: '<4.17.21', fixAvailable: true } },
    { critical: 0, high: 1, moderate: 0, low: 0, info: 0, total: 1 }
  );
  const out = summarizeNpmAudit(json);
  assert.strictEqual(out.ok, true);
  assert.deepStrictEqual(out.counts, { critical: 0, high: 1, moderate: 0, low: 0, info: 0 });
  assert.strictEqual(out.top.length, 1);
  assert.strictEqual(out.top[0].name, 'lodash');
  assert.strictEqual(out.top[0].title, 'Prototype Pollution');
  assert.strictEqual(out.top[0].fixAvailable, true);
});

test('summarizeNpmAudit: top is sorted by severity (critical first)', () => {
  const json = auditJson(
    {
      a: { name: 'a', severity: 'low', via: [] },
      b: { name: 'b', severity: 'critical', via: [] },
      c: { name: 'c', severity: 'moderate', via: [] },
    },
    { critical: 1, high: 0, moderate: 1, low: 1, info: 0, total: 3 }
  );
  const out = summarizeNpmAudit(json);
  assert.deepStrictEqual(out.top.map((t) => t.severity), ['critical', 'moderate', 'low']);
});

test('summarizeNpmAudit: honestSummary calls out "all dev-only" when every entry is dev:true', () => {
  const json = auditJson(
    { pkg: { name: 'pkg', severity: 'moderate', dev: true, via: [] } },
    { critical: 0, high: 0, moderate: 1, low: 0, info: 0, total: 1 }
  );
  const out = summarizeNpmAudit(json);
  assert.strictEqual(out.devOnlyCount, 1);
  assert.strictEqual(out.prodCount, 0);
  assert.ok(/dev-only/.test(out.honestSummary));
  assert.ok(/nada crítico/.test(out.honestSummary));
});

test('summarizeNpmAudit: a prod (dev:false) critical/high bumps prodCount and is NOT dismissed', () => {
  const json = auditJson(
    { pkg: { name: 'pkg', severity: 'critical', dev: false, via: [] } },
    { critical: 1, high: 0, moderate: 0, low: 0, info: 0, total: 1 }
  );
  const out = summarizeNpmAudit(json);
  assert.strictEqual(out.prodCount, 1);
  assert.strictEqual(out.devOnlyCount, 0);
  assert.ok(!/dev-only/.test(out.honestSummary), 'must not claim dev-only when a prod entry exists');
});

test('summarizeNpmAudit: an entry with no dev flag is conservatively folded into prodCount', () => {
  const json = auditJson(
    { pkg: { name: 'pkg', severity: 'low', via: [] } }, // no `dev` field at all
    { critical: 0, high: 0, moderate: 0, low: 1, info: 0, total: 1 }
  );
  const out = summarizeNpmAudit(json);
  assert.strictEqual(out.prodCount, 1);
  assert.strictEqual(out.devOnlyCount, 0);
});

test('summarizeNpmAudit: zero vulnerabilities produces a calm, non-alarmist summary', () => {
  const json = auditJson({}, { critical: 0, high: 0, moderate: 0, low: 0, info: 0, total: 0 });
  const out = summarizeNpmAudit(json);
  assert.strictEqual(out.ok, true);
  assert.deepStrictEqual(out.counts, { critical: 0, high: 0, moderate: 0, low: 0, info: 0 });
  assert.deepStrictEqual(out.top, []);
  assert.strictEqual(out.honestSummary, 'sem vulnerabilidades reportadas.');
});

test('summarizeNpmAudit: fail-soft on unparseable JSON text', () => {
  assert.deepStrictEqual(summarizeNpmAudit('not json at all {{{'), { ok: false, reason: 'unparseable' });
  assert.deepStrictEqual(summarizeNpmAudit(''), { ok: false, reason: 'unparseable' });
});

test('summarizeNpmAudit: fail-soft on null/undefined/garbage input — never throws', () => {
  assert.deepStrictEqual(summarizeNpmAudit(null), { ok: false, reason: 'unparseable' });
  assert.deepStrictEqual(summarizeNpmAudit(undefined), { ok: false, reason: 'unparseable' });
  assert.deepStrictEqual(summarizeNpmAudit(42), { ok: false, reason: 'unparseable' });
  assert.deepStrictEqual(summarizeNpmAudit('"just a string"'), { ok: false, reason: 'unparseable' });
});
