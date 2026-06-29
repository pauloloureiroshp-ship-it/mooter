// doctor-checks.test.js — headless fixtures for the 6 Cockpit Doctor checks.
// Each check: broken-state input → detected (ok:false/null) with the correct fix proposed;
// healthy-state input → ok:true. No real git/fs/network — pure inputs only.
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const D = require('./doctor-checks.js');

// ── 1) git locks ───────────────────────────────────────────────────────────
test('check #1 git locks: stale lock detected → offers reversible rm', () => {
  const broken = D.checkGitLocks({ locks: [{ name: 'index.lock', path: '/r/.git/index.lock' }] });
  assert.strictEqual(broken.ok, false);
  assert.match(broken.fix, /^term:rm -f /);
  assert.match(broken.fix, /index\.lock/);
  const healthy = D.checkGitLocks({ locks: [] });
  assert.strictEqual(healthy.ok, true);
  assert.strictEqual(healthy.fix, '');
  // unknown (could not inspect) → warn, not crash
  assert.strictEqual(D.checkGitLocks(null).ok, null);
});

// ── 2) truncated sources ────────────────────────────────────────────────────
test('check #2 truncated source: wt much smaller than blob → offers checkout', () => {
  const broken = D.checkTruncatedSources({ files: [{ path: 'src/extension.js', wtSize: 100, blobSize: 90000 }] });
  assert.strictEqual(broken.ok, false);
  assert.match(broken.fix, /^term:git checkout -- "src\/extension\.js"/);
  // healthy: sizes match
  const healthy = D.checkTruncatedSources({ files: [{ path: 'src/extension.js', wtSize: 90000, blobSize: 90000 }] });
  assert.strictEqual(healthy.ok, true);
  // empty blob (new file) is skipped → still healthy
  const newfile = D.checkTruncatedSources({ files: [{ path: 'src/new.js', wtSize: 0, blobSize: 0 }] });
  assert.strictEqual(newfile.ok, true);
  // missing data → warn
  assert.strictEqual(D.checkTruncatedSources({}).ok, null);
  // threshold honored: 60% of blob with default 0.5 ratio is NOT truncated
  assert.strictEqual(D.checkTruncatedSources({ files: [{ path: 'a', wtSize: 600, blobSize: 1000 }] }).ok, true);
  assert.strictEqual(D.checkTruncatedSources({ files: [{ path: 'a', wtSize: 400, blobSize: 1000 }] }).ok, false);
});

// ── 3) vsix drift ───────────────────────────────────────────────────────────
test('check #3 vsix drift: installed != package.json → offers re-package', () => {
  const broken = D.checkVsixDrift({ pkgVersion: '0.16.44', installedVsix: ['0.16.0'] });
  assert.strictEqual(broken.ok, false);
  assert.match(broken.fix, /vsce package/);
  assert.match(broken.t, /0\.16\.0/);
  assert.match(broken.t, /0\.16\.44/);
  // healthy: newest vsix == pkg (semver-aware, not lexical)
  const healthy = D.checkVsixDrift({ pkgVersion: '0.16.44', installedVsix: ['0.16.0', '0.16.44'] });
  assert.strictEqual(healthy.ok, true);
  // no vsix built yet → warn + offer build
  const none = D.checkVsixDrift({ pkgVersion: '0.16.44', installedVsix: [] });
  assert.strictEqual(none.ok, null);
  assert.match(none.fix, /vsce package/);
  // semver ordering: 0.16.44 must beat 0.16.9 (lexical would invert)
  assert.strictEqual(D.checkVsixDrift({ pkgVersion: '0.16.44', installedVsix: ['0.16.9', '0.16.44'] }).ok, true);
});

// ── 4) classify.js frozen sha ───────────────────────────────────────────────
test('check #4 classify sha: mismatch → RED invariant violation', () => {
  const broken = D.checkClassifySha({ liveSha: 'deadbeef'.repeat(8) });
  assert.strictEqual(broken.ok, false);
  assert.match(broken.t, /classify\.js/);
  assert.match(broken.fix, /git checkout -- tools\/router\/classify\.js/);
  const healthy = D.checkClassifySha({ liveSha: D.FROZEN_CLASSIFY_SHA });
  assert.strictEqual(healthy.ok, true);
  assert.strictEqual(healthy.fix, '');
  // file absent → warn
  assert.strictEqual(D.checkClassifySha({ liveSha: null }).ok, null);
});

// ── 5) worktree / merged-branch hygiene ─────────────────────────────────────
test('check #5 worktree hygiene: prunable wt → offers safe prune; merged → loss-proof -d', () => {
  const wt = D.checkWorktreeHygiene({ prunableWorktrees: ['/x/gone'], mergedBranches: [] });
  assert.strictEqual(wt.ok, false);
  assert.match(wt.fix, /^term:git worktree prune/);
  // only merged branches → branch -d (lower-case = refuses unmerged → loss-proof)
  const br = D.checkWorktreeHygiene({ prunableWorktrees: [], mergedBranches: ['feat/old', 'fix/done'] });
  assert.strictEqual(br.ok, false);
  assert.match(br.fix, /^term:git branch -d /);
  assert.match(br.fix, /"feat\/old"/);
  assert.doesNotMatch(br.fix, /-D/); // never the force-delete
  // healthy: nothing to clean
  const healthy = D.checkWorktreeHygiene({ prunableWorktrees: [], mergedBranches: [] });
  assert.strictEqual(healthy.ok, true);
  // both null → warn
  assert.strictEqual(D.checkWorktreeHygiene({}).ok, null);
});

// ── 6) false-green tests / webview-syntax gate ──────────────────────────────
test('check #6 tests gate: webview-syntax fail flagged; pass is green; missing → not run', () => {
  const passOut = 'ok 12 - webview script parses (real template evaluation)\n# fail 0\n';
  const green = D.checkTestsGate({ testOutput: passOut });
  assert.strictEqual(green.ok, true);
  // overall failure count > 0 → suspect false-green
  const failCount = D.checkTestsGate({ testOutput: 'ok 1 - webview script parses\nℹ fail 3\n' });
  assert.strictEqual(failCount.ok, false);
  // explicit not-ok on the gate line
  const gateFail = D.checkTestsGate({ testOutput: 'not ok 5 - webview script parses (real template evaluation)\n# fail 1\n' });
  assert.strictEqual(gateFail.ok, false);
  assert.match(gateFail.t, /webview/i);
  // gate never appeared → false-green suspect (offer running the suite)
  const noGate = D.checkTestsGate({ testOutput: 'ok 1 - something else\n# fail 0\n' });
  assert.strictEqual(noGate.ok, false);
  assert.match(noGate.fix, /node --test/);
  // no output yet → warn + offer command
  const notRun = D.checkTestsGate({});
  assert.strictEqual(notRun.ok, null);
  assert.match(notRun.fix, /node --test/);
});

// ── runChecks: all 6 present, healthy bag → all green ───────────────────────
test('runChecks returns exactly the 6 checks; healthy bag → all ok:true', () => {
  const healthy = D.runChecks({
    locks: { locks: [] },
    sources: { files: [{ path: 'a', wtSize: 100, blobSize: 100 }] },
    vsix: { pkgVersion: '1.0.0', installedVsix: ['1.0.0'] },
    classify: { liveSha: D.FROZEN_CLASSIFY_SHA },
    hygiene: { prunableWorktrees: [], mergedBranches: [] },
    tests: { testOutput: 'ok 1 - webview script parses\n# fail 0\n' },
  });
  assert.strictEqual(healthy.length, 6);
  assert.ok(healthy.every((c) => c.ok === true), 'all healthy → green');
  const keys = healthy.map((c) => c.k);
  assert.deepStrictEqual(keys, ['gitlock', 'truncate', 'vsixdrift', 'classifysha', 'worktrees', 'testsgate']);
  // every check carries a stable shape
  for (const c of healthy) {
    assert.ok(typeof c.k === 'string' && typeof c.t === 'string' && 'fix' in c && 'detail' in c);
  }
});

// ── runChecks: broken bag → the right checks flip red, fixes proposed ───────
test('runChecks: broken bag flips the right checks and proposes fixes', () => {
  const broken = D.runChecks({
    locks: { locks: [{ name: 'index.lock', path: '/r/.git/index.lock' }] },
    sources: { files: [{ path: 'src/extension.js', wtSize: 1, blobSize: 90000 }] },
    vsix: { pkgVersion: '0.16.44', installedVsix: ['0.16.0'] },
    classify: { liveSha: '0'.repeat(64) },
    hygiene: { prunableWorktrees: ['/x/gone'], mergedBranches: ['feat/old'] },
    tests: { testOutput: 'not ok 5 - webview script parses\nℹ fail 1\n' },
  });
  const byK = Object.fromEntries(broken.map((c) => [c.k, c]));
  assert.strictEqual(byK.gitlock.ok, false);
  assert.strictEqual(byK.truncate.ok, false);
  assert.strictEqual(byK.vsixdrift.ok, false);
  assert.strictEqual(byK.classifysha.ok, false);
  assert.strictEqual(byK.worktrees.ok, false);
  assert.strictEqual(byK.testsgate.ok, false);
  // every red check offers a fix; destructive ones are term: (offered, never auto-run)
  for (const c of broken) { assert.ok(c.fix && c.fix.length, c.k + ' must propose a fix'); }
  assert.match(byK.gitlock.fix, /^term:/);
  assert.match(byK.truncate.fix, /^term:git checkout/);
  assert.match(byK.classifysha.fix, /^term:git checkout/);
  assert.match(byK.worktrees.fix, /^term:git worktree prune/);
});

// ── gatherDoctorInputs: pure orchestration over an injected exec/fs ─────────
test('gatherDoctorInputs assembles the bag from injected exec/fs (no real git)', async () => {
  const calls = [];
  const exec = (cmd, args) => {
    calls.push([cmd].concat(args).join(' '));
    const a = args.join(' ');
    if (a.includes('cat-file')) return Promise.resolve({ ok: true, out: '90000' });
    if (a.includes('worktree list')) return Promise.resolve({ ok: true, out: 'worktree /a\nHEAD abc\n\nworktree /gone\nprunable gitdir file points to non-existent location\n' });
    if (a.includes('branch --merged')) return Promise.resolve({ ok: true, out: '* main\n  feat/done\n  fix/old\n' });
    return Promise.resolve({ ok: false, out: '' });
  };
  const fakeFs = {
    existsSync: (p) => String(p).endsWith('index.lock'), // one stale lock present
    statSync: () => ({ size: 100 }), // working-tree tiny → truncated vs 90000 blob
    readFileSync: (p) => { if (String(p).endsWith('package.json')) return JSON.stringify({ version: '0.16.44' }); throw new Error('x'); },
    readdirSync: () => ['mooter-cockpit-0.16.0.vsix'],
  };
  const fakePath = { join: (...xs) => xs.join('/') };
  const inputs = await D.gatherDoctorInputs('/repo', { exec, fs: fakeFs, path: fakePath, extRoot: '/repo/ext', sourceFiles: ['src/extension.js'] });
  // locks: index.lock detected
  assert.strictEqual(inputs.locks.locks.length, 1);
  // sources: 100B vs 90000B
  assert.deepStrictEqual(inputs.sources.files, [{ path: 'src/extension.js', wtSize: 100, blobSize: 90000 }]);
  // vsix: pkg 0.16.44, installed [0.16.0]
  assert.strictEqual(inputs.vsix.pkgVersion, '0.16.44');
  assert.deepStrictEqual(inputs.vsix.installedVsix, ['0.16.0']);
  // hygiene: one prunable worktree, two merged branches (main excluded)
  assert.deepStrictEqual(inputs.hygiene.prunableWorktrees, ['/gone']);
  assert.deepStrictEqual(inputs.hygiene.mergedBranches, ['feat/done', 'fix/old']);
  // feeding the bag through runChecks: locks/truncate/vsix/worktrees all red
  const checks = D.runChecks(inputs);
  const byK = Object.fromEntries(checks.map((c) => [c.k, c]));
  assert.strictEqual(byK.gitlock.ok, false);
  assert.strictEqual(byK.truncate.ok, false);
  assert.strictEqual(byK.vsixdrift.ok, false);
  assert.strictEqual(byK.worktrees.ok, false);
});
