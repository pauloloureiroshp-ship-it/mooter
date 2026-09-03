'use strict';

/**
 * Tests for the Live Preview trust harness runner.
 *
 * These exercise the runner's own logic against fixtures — they never run the extension
 * suite. The harness asserts about tests; this asserts about the harness.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const H = require('./lp-trust-runner.js');

/* ───────────────────────────────── fixtures ──────────────────────────────────── */

const FILE_A = 'C:\\repo\\packages\\vscode-extension\\src\\lp-lease-host.test.js';
const FILE_B = 'C:\\repo\\packages\\vscode-extension\\src\\lp-edit-host.test.js';

function tc(name, file, { skipped = false, failed = false, time = '0.001' } = {}) {
  const attrs = `name="${name}" time="${time}" classname="test" file="${file}"`;
  if (skipped) return `<testcase ${attrs}>\n\t\t<skipped type="skipped" message="true"/>\n\t</testcase>`;
  if (failed) return `<testcase ${attrs}>\n\t\t<failure type="testCodeFailure" message="boom"/>\n\t</testcase>`;
  return `<testcase ${attrs}/>`;
}

function doc(...cases) {
  return `<?xml version="1.0" encoding="utf-8"?>\n<testsuites>\n\t${cases.join('\n\t')}\n</testsuites>\n`;
}

const MANIFEST = {
  schema: 1,
  extensionDir: 'packages/vscode-extension',
  skipAllowlist: [
    {
      file: 'src/lp-edit-host.test.js',
      namePattern: '^platform-only ',
      platform: 'win32',
      reason: 'fixture',
    },
  ],
  proofs: [
    {
      id: 'PX',
      name: 'fixture proof',
      backing: 'FIX-01',
      anchor: 'finding-id',
      files: ['src/lp-lease-host.test.js'],
      match: [{ pattern: '^C0/COH-01: ', minCount: 2 }],
    },
  ],
};

/* ─────────────────────────────── S3 · parsing ────────────────────────────────── */

test('parseJUnit reads name/file/status from self-closing and wrapped testcases', () => {
  const xml = doc(
    tc('C0/COH-01: alpha', FILE_A),
    tc('C0/COH-01: beta', FILE_A, { skipped: true }),
    tc('C0/COH-01: gamma', FILE_A, { failed: true })
  );
  const tests = H.parseJUnit(xml);
  assert.equal(tests.length, 3);
  assert.deepEqual(
    tests.map((t) => t.status),
    ['pass', 'skip', 'fail']
  );
  assert.equal(tests[0].name, 'C0/COH-01: alpha');
  assert.equal(tests[0].file, FILE_A);
});

test('parseJUnit unescapes XML entities and decodes &amp; last (no double-decode)', () => {
  // A test whose real title contains a literal `&quot;` must survive the round-trip.
  const xml = doc(tc('lease &amp;quot;x&amp;quot; &lt;guard&gt; &quot;real&quot;', FILE_A));
  const [t] = H.parseJUnit(xml);
  assert.equal(t.name, 'lease &quot;x&quot; <guard> "real"');
});

test('parseJUnit tolerates the arrows/quotes the real titles carry', () => {
  const xml = doc(tc("C0/COH-04: unproven → readiness.tree === 'unknown' (never absent)", FILE_A));
  const [t] = H.parseJUnit(xml);
  assert.equal(t.name, "C0/COH-04: unproven → readiness.tree === 'unknown' (never absent)");
});

test('parseJUnit returns [] for an empty report (caller must treat that as red)', () => {
  assert.deepEqual(H.parseJUnit('<testsuites>\n</testsuites>'), []);
});

/* ─────────────────────────── S4 · the anti-rot gate ──────────────────────────── */

test('a proof meeting its minCount with all tests passing is green', () => {
  const tests = H.parseJUnit(doc(tc('C0/COH-01: a', FILE_A), tc('C0/COH-01: b', FILE_A)));
  const [p] = H.evaluateProofs(MANIFEST, tests);
  assert.equal(p.status, 'green');
  assert.deepEqual(p.reasons, []);
});

test('ANTI-ROT: deleting a proof test drops it below minCount → proof-unbacked', () => {
  // This is the whole point: removing the test makes the plain suite greener, not this.
  const tests = H.parseJUnit(doc(tc('C0/COH-01: a', FILE_A)));
  const [p] = H.evaluateProofs(MANIFEST, tests);
  assert.equal(p.status, 'red');
  assert.match(p.reasons[0], /proof-unbacked/);
  assert.match(p.reasons[0], /matched 1 passing test\(s\), manifest requires 2/);
});

test('ANTI-ROT: deleting the whole test file → proof-unbacked, never silently green', () => {
  const [p] = H.evaluateProofs(MANIFEST, []);
  assert.equal(p.status, 'red');
  assert.match(p.reasons[0], /proof-unbacked/);
});

test('renaming the prose after the finding-ID prefix keeps the proof green', () => {
  // The ID prefix is the stable part; the prose is free to change.
  const tests = H.parseJUnit(
    doc(tc('C0/COH-01: totally reworded now', FILE_A), tc('C0/COH-01: and this one too', FILE_A))
  );
  assert.equal(H.evaluateProofs(MANIFEST, tests)[0].status, 'green');
});

test('renaming AWAY from the finding-ID prefix fails (the anchor is the ID)', () => {
  const tests = H.parseJUnit(doc(tc('lease: a', FILE_A), tc('lease: b', FILE_A)));
  assert.equal(H.evaluateProofs(MANIFEST, tests)[0].status, 'red');
});

test('a failing test inside the proof set turns the proof red with test-failed', () => {
  const tests = H.parseJUnit(
    doc(tc('C0/COH-01: a', FILE_A), tc('C0/COH-01: b', FILE_A), tc('C0/COH-01: c', FILE_A, { failed: true }))
  );
  const [p] = H.evaluateProofs(MANIFEST, tests);
  assert.equal(p.status, 'red');
  assert.ok(p.reasons.some((r) => /test-failed: C0\/COH-01: c/.test(r)));
});

test('a SKIPPED test does not count as backing — a skipped proof proves nothing', () => {
  const tests = H.parseJUnit(doc(tc('C0/COH-01: a', FILE_A), tc('C0/COH-01: b', FILE_A, { skipped: true })));
  const [p] = H.evaluateProofs(MANIFEST, tests);
  assert.equal(p.status, 'red');
  assert.match(p.reasons[0], /proof-unbacked/);
});

test('tests from another file never satisfy a proof scoped to its own file', () => {
  const tests = H.parseJUnit(doc(tc('C0/COH-01: a', FILE_B), tc('C0/COH-01: b', FILE_B)));
  assert.equal(H.evaluateProofs(MANIFEST, tests)[0].status, 'red');
});

test('--proof selects a subset and evaluates only that proof', () => {
  const two = { ...MANIFEST, proofs: [...MANIFEST.proofs, { ...MANIFEST.proofs[0], id: 'PY' }] };
  const tests = H.parseJUnit(doc(tc('C0/COH-01: a', FILE_A), tc('C0/COH-01: b', FILE_A)));
  const detail = H.evaluateProofs(two, tests, ['PY']);
  assert.equal(detail.length, 1);
  assert.equal(detail[0].id, 'PY');
});

/* ──────────────── the verdict · no failing test may escape the gate ───────────── */

test('FALSE-GREEN GUARD: a failing test that NO clause matches still turns the gate red', () => {
  // The proof set is the union of the manifest's FILES, not just the clause-matched subset.
  // ~54 of the 110 tests the runner executes match no clause; if only hits were scored they
  // could all fail while the receipt said green. That is the exact bug this guards.
  const tests = H.parseJUnit(
    doc(
      tc('C0/COH-01: a', FILE_A),
      tc('C0/COH-01: b', FILE_A),
      tc('computeSplice finds the exact contiguous window', FILE_A, { failed: true })
    )
  );
  const proofDetail = H.evaluateProofs(MANIFEST, tests);
  assert.equal(proofDetail[0].status, 'green', 'the proof itself is legitimately backed');

  const problems = H.computeProblems({ proofDetail, tests, badSkips: [], runStatus: 1 });
  assert.equal(problems.length, 1, 'the unmatched failure must not be swallowed');
  assert.match(problems[0], /^test-failed: computeSplice finds the exact contiguous window/);
});

test('a fully green proof set produces zero problems', () => {
  const tests = H.parseJUnit(doc(tc('C0/COH-01: a', FILE_A), tc('C0/COH-01: b', FILE_A)));
  const proofDetail = H.evaluateProofs(MANIFEST, tests);
  assert.deepEqual(H.computeProblems({ proofDetail, tests, runStatus: 0 }), []);
});

test('a matched failing test is reported exactly once, not duplicated per proof', () => {
  const tests = H.parseJUnit(
    doc(tc('C0/COH-01: a', FILE_A), tc('C0/COH-01: b', FILE_A), tc('C0/COH-01: c', FILE_A, { failed: true }))
  );
  const proofDetail = H.evaluateProofs(MANIFEST, tests);
  const problems = H.computeProblems({ proofDetail, tests, runStatus: 1 });
  assert.equal(problems.filter((p) => /test-failed/.test(p)).length, 1);
});

test('a non-zero test-runner exit with a clean report is red (killed/truncated run)', () => {
  const tests = H.parseJUnit(doc(tc('C0/COH-01: a', FILE_A), tc('C0/COH-01: b', FILE_A)));
  const proofDetail = H.evaluateProofs(MANIFEST, tests);
  const problems = H.computeProblems({ proofDetail, tests, runStatus: 1 });
  assert.equal(problems.length, 1);
  assert.match(problems[0], /^test-runner-exit: node --test exited 1/);
});

test('proof-unbacked and an unmatched failure are both reported', () => {
  const tests = H.parseJUnit(doc(tc('C0/COH-01: a', FILE_A), tc('unrelated helper', FILE_A, { failed: true })));
  const proofDetail = H.evaluateProofs(MANIFEST, tests);
  const problems = H.computeProblems({ proofDetail, tests, runStatus: 1 });
  assert.ok(problems.some((p) => /proof-unbacked/.test(p)));
  assert.ok(problems.some((p) => /test-failed: unrelated helper/.test(p)));
});

/* ───────────────────────────── S5 · skip policy ──────────────────────────────── */

test('a skip inside the proof set is not allowlisted → offender', () => {
  const tests = H.parseJUnit(doc(tc('C0/COH-01: a', FILE_A, { skipped: true })));
  assert.equal(H.evaluateSkips(MANIFEST, tests, 'win32').length, 1);
});

test('an allowlisted platform skip passes on that platform only', () => {
  const tests = H.parseJUnit(doc(tc('platform-only symlink thing', FILE_B, { skipped: true })));
  assert.equal(H.evaluateSkips(MANIFEST, tests, 'win32').length, 0);
  assert.equal(H.evaluateSkips(MANIFEST, tests, 'linux').length, 1, 'must not be skipped on CI linux');
});

test('passing tests are never skip offenders', () => {
  const tests = H.parseJUnit(doc(tc('C0/COH-01: a', FILE_A)));
  assert.deepEqual(H.evaluateSkips(MANIFEST, tests, 'win32'), []);
});

/* ──────────────────────── manifest validation (fail loud) ────────────────────── */

test('validateManifest rejects a clause with minCount 0 (asserts nothing = rot)', () => {
  const bad = { proofs: [{ id: 'P', files: ['a'], match: [{ pattern: 'x', minCount: 0 }] }] };
  assert.throws(() => H.validateManifest(bad), /minCount >= 1/);
});

test('validateManifest rejects an invalid regex, duplicate ids and empty proofs', () => {
  assert.throws(
    () => H.validateManifest({ proofs: [{ id: 'P', files: ['a'], match: [{ pattern: '([', minCount: 1 }] }] }),
    /not a valid regex/
  );
  const dup = { id: 'P', files: ['a'], match: [{ pattern: 'x', minCount: 1 }] };
  assert.throws(() => H.validateManifest({ proofs: [dup, { ...dup }] }), /duplicate proof id/);
  assert.throws(() => H.validateManifest({ proofs: [] }), /non-empty array/);
});

test('validateManifest rejects a clause file outside its own proof files', () => {
  const bad = {
    proofs: [{ id: 'P', files: ['src/a.test.js'], match: [{ pattern: 'x', minCount: 1, file: 'src/b.test.js' }] }],
  };
  assert.throws(() => H.validateManifest(bad), /not in that proof's files/);
});

/* ──────────── file attribution · the runner tags, the reporter is not trusted ──── */

test("parseJUnit tolerates a testcase with no file attribute (Node 22's junit emits none)", () => {
  // Node 24 emits file="…"; the CI's Node 22 does not. The parser must not crash — but a
  // test with no file can never back a proof (next test), so the runner tags files itself.
  const xml = '<testsuites>\n\t<testcase name="C0/COH-01: a" time="0.1" classname="test"/>\n</testsuites>';
  const [t] = H.parseJUnit(xml);
  assert.equal(t.name, 'C0/COH-01: a');
  assert.equal(t.file, '');
});

test('CI REGRESSION: unattributed tests back nothing — 110 green tests still gave 0/7 proofs', () => {
  // This is exactly what CI produced when file attribution was left to the reporter:
  // every test passed, every proof matched zero. Fail-closed, but for the wrong reason.
  const tests = [
    { name: 'C0/COH-01: a', file: '', status: 'pass', durationMs: 0 },
    { name: 'C0/COH-01: b', file: '', status: 'pass', durationMs: 0 },
  ];
  assert.equal(H.evaluateProofs(MANIFEST, tests)[0].status, 'red');
});

test('tests tagged with the manifest-relative path (how the runner tags them) back their proof', () => {
  const tests = [
    { name: 'C0/COH-01: a', file: 'src/lp-lease-host.test.js', status: 'pass', durationMs: 0 },
    { name: 'C0/COH-01: b', file: 'src/lp-lease-host.test.js', status: 'pass', durationMs: 0 },
  ];
  assert.equal(H.evaluateProofs(MANIFEST, tests)[0].status, 'green');
});

/* ─────────────────────────────── path matching ───────────────────────────────── */

test('sameFile matches a manifest-relative path against an absolute reported path', () => {
  assert.ok(H.sameFile('src/lp-lease-host.test.js', FILE_A));
  assert.ok(H.sameFile('src/lp-lease-host.test.js', '/home/r/packages/vscode-extension/src/lp-lease-host.test.js'));
  assert.ok(!H.sameFile('src/lp-lease-host.test.js', FILE_B));
  assert.ok(!H.sameFile('src/lp-lease-host.test.js', ''));
});

/* ──────────────────────────────── arg parsing ────────────────────────────────── */

test('parseArgs defaults to a full run that writes a receipt', () => {
  const a = H.parseArgs([]);
  assert.equal(a.json, false);
  assert.equal(a.receipt, true);
  assert.equal(a.proofs, null);
  assert.equal(a.install, null);
});

test('parseArgs reads --json, --no-receipt, --no-install and --proof=', () => {
  const a = H.parseArgs(['--json', '--no-receipt', '--no-install', '--proof=p3,P7']);
  assert.equal(a.json, true);
  assert.equal(a.receipt, false);
  assert.equal(a.install, false);
  assert.deepEqual(a.proofs, ['P3', 'P7']);
});

/* ───────────────────── the real manifest must stay coherent ──────────────────── */

test('the shipped manifest is valid and every proof file exists on disk', () => {
  const manifest = H.loadManifest();
  const extDir = path.join(H.REPO_ROOT, manifest.extensionDir);
  for (const f of H.proofFiles(manifest)) {
    assert.ok(fs.existsSync(path.join(extDir, f)), `missing proof file: ${f}`);
  }
});

test('the shipped manifest declares the 7 spec proofs P1..P7', () => {
  const manifest = H.loadManifest();
  assert.deepEqual(
    manifest.proofs.map((p) => p.id),
    ['P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7']
  );
});

test('every behaviour-regex proof declares its residual risk in the manifest', () => {
  // Spec §5: the weakness must be visible IN the manifest, not hidden in a habit.
  const manifest = H.loadManifest();
  for (const p of manifest.proofs) {
    if (p.anchor === 'behaviour-regex') {
      assert.ok(p.residualRisk, `${p.id} is regex-anchored but declares no residualRisk`);
    }
  }
});

test('the receipt is declared as a git-ignored projection', () => {
  const manifest = H.loadManifest();
  assert.equal(manifest.receipt.mustBeGitIgnored, true);
  assert.equal(manifest.receipt.path, '_handoff/live-preview/trust-receipt.json');
});

test('S0 verifies the frozen classify.js against its committed sha', () => {
  const manifest = H.loadManifest();
  const r = H.checkClassifyFreeze(manifest);
  assert.equal(r.ok, true, `classify.js freeze broken: ${r.reason}`);
  assert.match(r.sha, /^[0-9a-f]{64}$/);
});
