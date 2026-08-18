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

test('reports normalized duplicate packets in the active queue', (t) => {
  const f = fixture();
  t.after(() => fs.rmSync(f.root, { recursive: true, force: true }));
  // Two packets with an identical normalized digest → one duplicate group in the active queue.
  const body = '# Packet\nSTATUS: active\n\n## Goal\nShip the spine safely.\n';
  fs.writeFileSync(path.join(f.root, '_handoff', 'DUP-A.md'), body);
  fs.writeFileSync(path.join(f.root, '_handoff', 'DUP-B.md'), body);
  const report = doctor.inspectRepo(f.root, { expectedClassifierSha: f.expectedClassifierSha, gitLines: () => [] });
  const dup = report.findings.find((item) => item.code === 'HANDOFF_EXACT_DUPLICATES');
  assert.ok(dup, 'normalized duplicate packet group reported');
  assert.equal(dup.severity, 'warn');
  assert.deepEqual(dup.files, ['_handoff/DUP-A.md', '_handoff/DUP-B.md'], 'both duplicate packets listed');
  assert.equal(report.ok, true, 'duplicates are warn-first, not a hard invariant failure');
});

test('reports non-empty deletion buckets', (t) => {
  const f = fixture();
  t.after(() => fs.rmSync(f.root, { recursive: true, force: true }));
  fs.writeFileSync(path.join(f.root, '_handoff', 'ONE.md'), '# Task\nSTATUS: active\n\n## Goal\nShip safely.\n');
  // A non-empty `_handoff/_to_delete` bucket is neither an archive nor an explicit active queue.
  fs.mkdirSync(path.join(f.root, '_handoff', '_to_delete'), { recursive: true });
  fs.writeFileSync(path.join(f.root, '_handoff', '_to_delete', 'stale.md'), 'old draft to be removed');
  const report = doctor.inspectRepo(f.root, { expectedClassifierSha: f.expectedClassifierSha, gitLines: () => [] });
  const del = report.findings.find((item) => item.code === 'PENDING_DELETION_BUCKETS');
  assert.ok(del, 'non-empty deletion bucket reported');
  assert.equal(del.severity, 'warn');
  assert.deepEqual(del.files, ['_handoff/_to_delete'], 'the non-empty bucket is named');
  assert.equal(report.ok, true, 'deletion buckets are warn-first');
});

// ── Stashes: the quietest way to lose work in this repo ────────────────────
test('stashes are REPORTED as drift, never touched', () => {
  const f = fixture();
  const gitLines = (_repo, args) => (args[0] === 'stash'
    ? ['stash@{0}: WIP on main: abc123 meio caminho', 'stash@{1}: WIP on wave58: def456 experiencia']
    : []);
  const report = doctor.inspectRepo(f.root, { expectedClassifierSha: f.expectedClassifierSha, gitLines });

  assert.ok(codes(report).has('STASHES_PRESENT'));
  assert.equal(report.summary.stashes, 2);
  const item = report.findings.find((i) => i.code === 'STASHES_PRESENT');
  assert.equal(item.severity, 'warn', 'drift, not a hard failure — what to do with a stash is the human_s call');
  assert.equal(item.files.length, 2);
});

test('no stashes → no finding; git unavailable → n/d, never a fabricated zero', () => {
  const f = fixture();
  const clean = doctor.inspectRepo(f.root, { expectedClassifierSha: f.expectedClassifierSha, gitLines: () => [] });
  assert.equal(clean.summary.stashes, 0);
  assert.equal(codes(clean).has('STASHES_PRESENT'), false);

  const blind = doctor.inspectRepo(f.root, { expectedClassifierSha: f.expectedClassifierSha, gitLines: () => null });
  assert.equal(blind.summary.stashes, null, 'unmeasured must be null, not 0');
  assert.match(doctor.renderHuman(blind), /stashes n\/d/);
});

// ── Ratchet: the gate that survives a 204-packet backlog ───────────────────
const rpt = (summary) => ({ summary: { findings: { error: 0, warn: 0 }, ...summary } });
const base = (limites) => ({ limites });

test('ratchet: equal passes; lower passes and is reported as an improvement', () => {
  const b = base({ sync_lines: 3682, active_packets: 204 });
  const same = doctor.ratchet(rpt({ sync_lines: 3682, active_packets: 204 }), b);
  assert.equal(same.ok, true);
  assert.equal(same.improvements.length, 0);

  const better = doctor.ratchet(rpt({ sync_lines: 200, active_packets: 12 }), b);
  assert.equal(better.ok, true);
  assert.equal(better.improvements.length, 2);
  assert.match(doctor.renderRatchet(better), /melhorou sync_lines/);
});

test('ratchet: ONE metric getting worse fails the gate, and says by how much', () => {
  const r = doctor.ratchet(rpt({ sync_lines: 3683, active_packets: 204 }), base({ sync_lines: 3682, active_packets: 204 }));
  assert.equal(r.ok, false);
  assert.equal(r.regressions.length, 1);
  assert.deepEqual(r.regressions[0], { key: 'sync_lines', actual: 3683, max: 3682, delta: 1 });
  assert.match(doctor.renderRatchet(r), /piorou 1/);
});

test('ratchet: an UNMEASURED metric is n/d — it neither passes nor fails silently', () => {
  const r = doctor.ratchet(rpt({ sync_lines: 100, stashes: null }), base({ sync_lines: 3682, stashes: 0 }));
  assert.equal(r.unmeasured.length, 1);
  assert.equal(r.unmeasured[0].key, 'stashes');
  assert.match(doctor.renderRatchet(r), /n\/d stashes/);
  assert.equal(r.ok, true, 'n/d is not a regression — but it is printed, never hidden');
});

test('ratchet: a metric absent from the baseline is simply not ratcheted yet', () => {
  const r = doctor.ratchet(rpt({ sync_lines: 99999 }), base({ active_packets: 204 }));
  assert.equal(r.ok, true);
  assert.equal(r.regressions.length, 0);
});
