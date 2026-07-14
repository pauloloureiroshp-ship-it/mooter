'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

const doctor = require('./docs-hygiene.js');

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mooter-docs-hygiene-'));
  fs.mkdirSync(path.join(root, '_handoff'), { recursive: true });
  fs.mkdirSync(path.join(root, 'tools', 'router'), { recursive: true });
  fs.writeFileSync(path.join(root, 'SYNC.md'), '# Sync\n\nCurrent.\n');
  fs.writeFileSync(path.join(root, 'tools', 'router', 'classify.js'), 'frozen fixture\n');
  const expectedClassifierSha = crypto.createHash('sha256').update('frozen fixture\n').digest('hex');
  return { root, expectedClassifierSha };
}

function codes(report) {
  return new Set(report.findings.map((item) => item.code));
}

test('healthy small queue passes in default and strict modes', (t) => {
  const f = fixture();
  t.after(() => fs.rmSync(f.root, { recursive: true, force: true }));
  fs.writeFileSync(path.join(f.root, '_handoff', 'ONE.md'), '# Task\nSTATUS: active\n\n## Goal\nShip safely.\n');
  const report = doctor.inspectRepo(f.root, { expectedClassifierSha: f.expectedClassifierSha });
  assert.equal(report.ok, true);
  assert.deepEqual(report.findings, []);
  assert.equal(doctor.exitCode(report, false), 0);
  assert.equal(doctor.exitCode(report, true), 0);
});

test('reports queue, snapshot, status, broken-reference and root-artifact drift', (t) => {
  const f = fixture();
  t.after(() => fs.rmSync(f.root, { recursive: true, force: true }));
  fs.writeFileSync(path.join(f.root, 'SYNC.md'), Array.from({ length: 8 }, (_, i) => `line ${i}`).join('\n'));
  fs.writeFileSync(path.join(f.root, '_handoff', 'A.md'), '# A\nRead `_handoff/MISSING.md`.\n');
  fs.writeFileSync(path.join(f.root, '_handoff', 'B.md'), '# B\nSTATE: parked\n');
  fs.writeFileSync(path.join(f.root, '_handoff', 'run.log'), 'generated');
  const report = doctor.inspectRepo(f.root, {
    expectedClassifierSha: f.expectedClassifierSha,
    maxSyncLines: 5,
    maxActivePackets: 1,
    gitLines: () => ['_handoff/A.md'],
  });
  const found = codes(report);
  assert.equal(report.ok, true, 'warn-first drift is not a hard invariant failure');
  assert.ok(found.has('SYNC_TOO_LONG'));
  assert.ok(found.has('HANDOFF_QUEUE_CROWDED'));
  assert.ok(found.has('HANDOFF_PACKETS_UNTRACKED'));
  assert.ok(found.has('HANDOFF_STATUS_MISSING'));
  assert.ok(found.has('HANDOFF_BROKEN_REFS'));
  assert.ok(found.has('HANDOFF_ROOT_OPERATIONAL_FILES'));
  assert.equal(doctor.exitCode(report, false), 0, 'default is warn-first');
  assert.equal(doctor.exitCode(report, true), 2, '--strict promotes warnings');
});

test('a changed frozen classifier is always a blocking error', (t) => {
  const f = fixture();
  t.after(() => fs.rmSync(f.root, { recursive: true, force: true }));
  const report = doctor.inspectRepo(f.root, { expectedClassifierSha: '0'.repeat(64) });
  assert.equal(report.ok, false);
  assert.ok(codes(report).has('CLASSIFIER_SHA_CHANGED'));
  assert.equal(doctor.exitCode(report, false), 2);
});

test('extractHandoffRefs ignores placeholders and deduplicates paths', () => {
  const refs = doctor.extractHandoffRefs('`_handoff/A.md` and _handoff/A.md; ignore _handoff/<TASK>.md');
  assert.deepEqual(refs, ['_handoff/A.md']);
});
