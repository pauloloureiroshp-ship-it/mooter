'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { pathToFileURL } = require('url');
const { spawnSync } = require('child_process');
const extra = require('./host-extra.js');

function runGit(cwd, args, allowFailure) {
  const full = cwd ? ['-C', cwd].concat(args) : args;
  const r = spawnSync('git', full, { encoding: 'utf8', windowsHide: true });
  if (!allowFailure && r.status !== 0) {
    assert.fail('git ' + full.join(' ') + ' failed (' + r.status + '): ' + String(r.stderr || r.stdout || '').trim());
  }
  return r;
}

function runGitBuffer(cwd, args, input, allowFailure) {
  const full = cwd ? ['-C', cwd].concat(args) : args;
  const r = spawnSync('git', full, { encoding: 'buffer', input, windowsHide: true });
  if (!allowFailure && r.status !== 0) {
    assert.fail('git ' + full.join(' ') + ' failed (' + r.status + '): '
      + Buffer.concat([Buffer.from(r.stderr || ''), Buffer.from(r.stdout || '')]).toString('utf8').trim());
  }
  return r;
}

function initWorkRepo(prefix) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  runGit(null, ['init', root]);
  runGit(root, ['config', 'user.name', 'Mooter Test']);
  runGit(root, ['config', 'user.email', 'mooter-test@example.invalid']);
  runGit(root, ['branch', '-M', 'main']);
  return root;
}

function approved(pathName, raw) {
  const bytes = Buffer.isBuffer(raw) ? raw : Buffer.from(raw);
  return { path: pathName, missing: false, sha256: crypto.createHash('sha256').update(bytes).digest('hex'), raw: bytes };
}

test('Publish regression: unstaged landing/app/page.tsx keeps its complete path from real porcelain output', async () => {
  const root = initWorkRepo('mooter-porcelain-');
  try {
    const file = path.join(root, 'landing', 'app', 'page.tsx');
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, 'export default function Page() { return <p>before</p>; }\n');
    runGit(root, ['add', '--', 'landing/app/page.tsx']);
    runGit(root, ['commit', '-m', 'initial']);
    fs.writeFileSync(file, 'export default function Page() { return <p>after</p>; }\n');

    const preview = await extra.gitCommitPreview(root);
    assert.ok(preview, 'real temporary repository produces a commit preview');
    assert.deepStrictEqual(preview.files, [{ x: ' ', y: 'M', path: 'landing/app/page.tsx' }]);
    assert.strictEqual(preview.message.includes('page.tsx'), true);

    const stage = await extra.gitStage(root);
    assert.strictEqual(stage.state, 'uncommitted');
    assert.strictEqual(stage.dirty, 1);
    assert.deepStrictEqual(stage.files, preview.files, 'status and commit preview consume the same lossless path');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('parsePorcelain supports NUL-delimited spaces, newlines, and rename NEW/OLD fields', () => {
  const raw = ' M landing/app/page.tsx\0'
    + 'R  src/new name.ts\0src/old name.ts\0'
    + '?? notes/line\nbreak.txt\0';
  assert.deepStrictEqual(extra.parsePorcelain(raw), [
    { x: ' ', y: 'M', path: 'landing/app/page.tsx' },
    { x: 'R', y: ' ', path: 'src/new name.ts', origPath: 'src/old name.ts' },
    { x: '?', y: '?', path: 'notes/line\nbreak.txt' },
  ]);
});

test('Publish rename lease commits NEW plus OLD deletion, so the final tree cannot retain the original path', async () => {
  const root = initWorkRepo('mooter-commit-rename-');
  try {
    fs.writeFileSync(path.join(root, 'old name.txt'), 'approved renamed bytes\n');
    runGit(root, ['add', '--', 'old name.txt']);
    runGit(root, ['commit', '-m', 'initial']);
    runGit(root, ['mv', '--', 'old name.txt', 'new name.txt']);

    const preview = await extra.gitCommitPreview(root);
    assert.deepStrictEqual(preview.files, [
      { x: 'R', y: ' ', path: 'new name.txt', origPath: 'old name.txt' },
    ], 'the one-row UI preview preserves both halves of the rename');

    const next = fs.readFileSync(path.join(root, 'new name.txt'));
    const result = await extra.gitCommit(root, ['new name.txt', 'old name.txt'], 'approved rename', [
      approved('new name.txt', next),
      { path: 'old name.txt', missing: true, sha256: null, raw: null },
    ]);
    assert.strictEqual(result.ok, true, result.out);
    assert.strictEqual(runGit(root, ['show', 'HEAD:new name.txt']).stdout, 'approved renamed bytes\n');
    assert.notStrictEqual(runGit(root, ['cat-file', '-e', 'HEAD:old name.txt'], true).status, 0, 'OLD is absent from the final tree');
    const delta = runGit(root, ['diff-tree', '--no-commit-id', '--name-status', '--no-renames', '-r', 'HEAD^', 'HEAD']).stdout;
    assert.match(delta, /^A\s+new name\.txt$/m);
    assert.match(delta, /^D\s+old name\.txt$/m);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('Publish rename lease refuses when OLD was recreated instead of silently committing both paths', async () => {
  const root = initWorkRepo('mooter-commit-rename-recreated-');
  try {
    fs.writeFileSync(path.join(root, 'old.txt'), 'original\n');
    runGit(root, ['add', '--', 'old.txt']);
    runGit(root, ['commit', '-m', 'initial']);
    const oldHead = runGit(root, ['rev-parse', 'HEAD']).stdout.trim();
    runGit(root, ['mv', '--', 'old.txt', 'new.txt']);
    const next = fs.readFileSync(path.join(root, 'new.txt'));
    fs.writeFileSync(path.join(root, 'old.txt'), 'recreated and not approved\n');

    const result = await extra.gitCommit(root, ['new.txt', 'old.txt'], 'must refuse recreated old', [
      approved('new.txt', next),
      { path: 'old.txt', missing: true, sha256: null, raw: null },
    ]);
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.reason, 'approved-content-changed');
    assert.strictEqual(runGit(root, ['rev-parse', 'HEAD']).stdout.trim(), oldHead, 'branch never advances with ambiguous rename semantics');
    assert.notStrictEqual(runGit(root, ['cat-file', '-e', 'HEAD:new.txt'], true).status, 0, 'NEW never reaches history on refusal');
    assert.strictEqual(runGit(root, ['show', 'HEAD:old.txt']).stdout, 'original\n', 'reviewed parent remains intact');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('gitCommit content lease: exact approved staged bytes commit successfully', async () => {
  const root = initWorkRepo('mooter-commit-lease-ok-');
  try {
    const file = path.join(root, 'approved.bin');
    fs.writeFileSync(file, Buffer.from('before\0bytes'));
    runGit(root, ['add', '--', 'approved.bin']);
    runGit(root, ['commit', '-m', 'initial']);
    const next = Buffer.from('approved\0binary\r\nbytes');
    fs.writeFileSync(file, next);

    const result = await extra.gitCommit(root, ['approved.bin'], 'approved bytes', [approved('approved.bin', next)]);
    assert.strictEqual(result.ok, true, result.out);
    assert.match(result.cmd, /git commit-tree/, 'transparency reports the plumbing path that actually ran');
    assert.doesNotMatch(result.cmd, /&& git commit -m/, 'the UI must not imply that hooks/signing ran through porcelain commit');
    const committed = spawnSync('git', ['-C', root, 'show', 'HEAD:approved.bin'], { encoding: 'buffer', windowsHide: true });
    assert.strictEqual(committed.status, 0);
    assert.strictEqual(Buffer.from(committed.stdout).equals(next), true, 'committed blob is byte-identical to the approval');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('prepared content lease applies real Git CRLF clean filters while preserving the approved raw SHA', async () => {
  const root = initWorkRepo('mooter-commit-crlf-lease-');
  try {
    fs.mkdirSync(path.join(root, 'app'), { recursive: true });
    fs.writeFileSync(path.join(root, '.gitattributes'), '*.tsx text eol=crlf\n');
    fs.writeFileSync(path.join(root, 'app', 'page.tsx'), 'export const copy = "before";\r\n');
    runGit(root, ['add', '--', '.gitattributes', 'app/page.tsx']);
    runGit(root, ['commit', '-m', 'initial']);

    const raw = Buffer.from('export const copy = "approved";\r\n');
    fs.writeFileSync(path.join(root, 'app', 'page.tsx'), raw);
    const lease = approved('app/page.tsx', raw);
    const prepared = await extra.prepareApprovedSnapshot(root, [lease]);
    assert.strictEqual(prepared.ok, true, JSON.stringify(prepared));
    assert.strictEqual(prepared.rows.length, 1);
    assert.strictEqual(prepared.rows[0].sha256, lease.sha256, 'the user-visible raw-byte SHA remains the lease');
    assert.strictEqual(prepared.rows[0].raw.equals(raw), true, 'preparation clones but preserves the approved worktree bytes');
    assert.strictEqual(prepared.rows[0].gitMode, '100644');
    assert.match(prepared.rows[0].blobOid, /^[a-f0-9]{40,64}$/);
    assert.strictEqual(prepared.rows[0].baseMissing, false);
    assert.match(prepared.rows[0].baseBlobOid, /^[a-f0-9]{40,64}$/);
    assert.strictEqual(prepared.rows[0].baseGitMode, '100644');
    const canonical = runGitBuffer(root, ['cat-file', 'blob', prepared.rows[0].blobOid]).stdout;
    assert.strictEqual(Buffer.from(canonical).equals(Buffer.from('export const copy = "approved";\n')), true,
      'the canonical Git blob is LF even though the approved worktree bytes are CRLF');

    const result = await extra.gitCommit(root, ['app/page.tsx'], 'approved filtered bytes', prepared.rows);
    assert.strictEqual(result.ok, true, result.out);
    const committed = runGitBuffer(root, ['show', 'HEAD:app/page.tsx']).stdout;
    assert.strictEqual(Buffer.from(committed).equals(canonical), true, 'commit verification follows canonical OID+mode');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('prepared content lease refuses a custom clean filter that would commit bytes Security never reviewed', async () => {
  const root = initWorkRepo('mooter-commit-filter-transform-');
  try {
    fs.writeFileSync(path.join(root, '.gitattributes'), '*.js filter=inject\n');
    runGit(root, ['config', 'filter.inject.clean', 'sed s/SAFE/PWNED/g']);
    fs.writeFileSync(path.join(root, 'page.js'), 'const msg = "BASE";\n');
    runGit(root, ['add', '--', '.gitattributes', 'page.js']);
    runGit(root, ['commit', '-m', 'initial']);
    const raw = Buffer.from('const msg = "SAFE";\n');
    fs.writeFileSync(path.join(root, 'page.js'), raw);

    const prepared = await extra.prepareApprovedSnapshot(root, [approved('page.js', raw)]);
    assert.strictEqual(prepared.ok, false);
    assert.strictEqual(prepared.reason, 'approved-content-transform-unsupported');
    assert.deepStrictEqual(prepared.paths, ['page.js']);
    assert.strictEqual(fs.readFileSync(path.join(root, 'page.js')).equals(raw), true, 'the reviewed worktree bytes remain untouched');
    assert.strictEqual(runGit(root, ['show', 'HEAD:page.js']).stdout, 'const msg = "BASE";\n', 'no transformed blob enters history');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('prepared parent lease refuses a concurrent commit on the selected path but preserves the local proposal', async () => {
  const root = initWorkRepo('mooter-selected-base-race-');
  try {
    fs.writeFileSync(path.join(root, 'selected.txt'), 'base\n');
    runGit(root, ['add', '--', 'selected.txt']);
    runGit(root, ['commit', '-m', 'initial']);
    const approvedRaw = Buffer.from('approved live preview\n');
    fs.writeFileSync(path.join(root, 'selected.txt'), approvedRaw);
    const prepared = await extra.prepareApprovedSnapshot(root, [approved('selected.txt', approvedRaw)]);
    assert.strictEqual(prepared.ok, true, JSON.stringify(prepared));

    fs.writeFileSync(path.join(root, 'selected.txt'), 'concurrent same-path\n');
    runGit(root, ['add', '--', 'selected.txt']);
    runGit(root, ['commit', '-m', 'concurrent same-path']);
    const concurrentHead = runGit(root, ['rev-parse', 'HEAD']).stdout.trim();
    fs.writeFileSync(path.join(root, 'selected.txt'), approvedRaw);

    const result = await extra.gitCommit(root, ['selected.txt'], 'must refuse stale base', prepared.rows);
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.reason, 'git-selected-base-moved');
    assert.strictEqual(runGit(root, ['rev-parse', 'HEAD']).stdout.trim(), concurrentHead);
    assert.strictEqual(runGit(root, ['show', 'HEAD:selected.txt']).stdout, 'concurrent same-path\n');
    assert.strictEqual(fs.readFileSync(path.join(root, 'selected.txt')).equals(approvedRaw), true, 'the LP proposal stays recoverable in the worktree');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('prepared parent lease permits a newer parent that changed only an unrelated path', async () => {
  const root = initWorkRepo('mooter-unrelated-parent-advance-');
  try {
    fs.writeFileSync(path.join(root, 'selected.txt'), 'base\n');
    fs.writeFileSync(path.join(root, 'unrelated.txt'), 'unrelated base\n');
    runGit(root, ['add', '--', 'selected.txt', 'unrelated.txt']);
    runGit(root, ['commit', '-m', 'initial']);
    const approvedRaw = Buffer.from('approved live preview\n');
    fs.writeFileSync(path.join(root, 'selected.txt'), approvedRaw);
    const prepared = await extra.prepareApprovedSnapshot(root, [approved('selected.txt', approvedRaw)]);
    assert.strictEqual(prepared.ok, true, JSON.stringify(prepared));

    fs.writeFileSync(path.join(root, 'unrelated.txt'), 'unrelated newer parent\n');
    runGit(root, ['add', '--', 'unrelated.txt']);
    runGit(root, ['commit', '-m', 'unrelated advance', '--', 'unrelated.txt']);
    const newerParent = runGit(root, ['rev-parse', 'HEAD']).stdout.trim();
    const result = await extra.gitCommit(root, ['selected.txt'], 'approved on newer unrelated parent', prepared.rows);
    assert.strictEqual(result.ok, true, result.out);
    assert.strictEqual(result.parent, newerParent, 'the exact newer parent is retained');
    assert.strictEqual(runGit(root, ['show', 'HEAD:selected.txt']).stdout, approvedRaw.toString('utf8'));
    assert.strictEqual(runGit(root, ['show', 'HEAD:unrelated.txt']).stdout, 'unrelated newer parent\n');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('prepared content lease refuses canonical blob tamper before commit', async () => {
  const root = initWorkRepo('mooter-commit-canonical-tamper-');
  try {
    fs.writeFileSync(path.join(root, '.gitattributes'), '*.tsx text eol=crlf\n');
    fs.writeFileSync(path.join(root, 'page.tsx'), 'before\r\n');
    runGit(root, ['add', '--', '.gitattributes', 'page.tsx']);
    runGit(root, ['commit', '-m', 'initial']);
    const raw = Buffer.from('approved\r\n');
    fs.writeFileSync(path.join(root, 'page.tsx'), raw);
    const prepared = await extra.prepareApprovedSnapshot(root, [approved('page.tsx', raw)]);
    assert.strictEqual(prepared.ok, true, JSON.stringify(prepared));
    const oldHead = runGit(root, ['rev-parse', 'HEAD']).stdout.trim();
    fs.writeFileSync(path.join(root, 'page.tsx'), 'not approved\r\n');

    const result = await extra.gitCommit(root, ['page.tsx'], 'must refuse canonical tamper', prepared.rows);
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.reason, 'approved-content-changed');
    assert.strictEqual(runGit(root, ['rev-parse', 'HEAD']).stdout.trim(), oldHead, 'tamper never advances HEAD');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('prepared content lease verifies Git mode after staging and rejects an injected executable bit', async () => {
  const root = initWorkRepo('mooter-commit-mode-lease-');
  try {
    fs.writeFileSync(path.join(root, 'mode.txt'), 'before\n');
    runGit(root, ['add', '--', 'mode.txt']);
    runGit(root, ['commit', '-m', 'initial']);
    const raw = Buffer.from('approved\n');
    fs.writeFileSync(path.join(root, 'mode.txt'), raw);
    const prepared = await extra.prepareApprovedSnapshot(root, [approved('mode.txt', raw)]);
    assert.strictEqual(prepared.ok, true, JSON.stringify(prepared));
    assert.strictEqual(prepared.rows[0].gitMode, '100644');
    const oldHead = runGit(root, ['rev-parse', 'HEAD']).stdout.trim();

    const result = await extra.gitCommit(root, ['mode.txt'], 'must refuse mode injection', prepared.rows, {
      afterVerify: ({ isolatedEnv }) => {
        const changed = spawnSync('git', ['-C', root, 'update-index', '--chmod=+x', '--', 'mode.txt'], {
          encoding: 'utf8', windowsHide: true, env: Object.assign({}, process.env, isolatedEnv),
        });
        assert.strictEqual(changed.status, 0, changed.stderr);
      },
    });
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.reason, 'approved-content-changed');
    assert.strictEqual(runGit(root, ['rev-parse', 'HEAD']).stdout.trim(), oldHead, 'mode injection remains detached');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('prepared content lease fails closed when a tracked symlink is only a core.symlinks=false regular-file emulation', async () => {
  const root = initWorkRepo('mooter-commit-symlink-lease-');
  try {
    // Git for Windows represents tracked symlinks as regular files when core.symlinks=false. This
    // fixture therefore exercises the index-mode contract on every CI host without OS symlink
    // privileges, while still creating the exact 120000 tree entry used by a real symlink.
    runGit(root, ['config', 'core.symlinks', 'false']);
    fs.writeFileSync(path.join(root, '.gitattributes'), 'link-ref text eol=lf\n');
    runGit(root, ['add', '--', '.gitattributes']);
    runGit(root, ['commit', '-m', 'attributes']);
    const target = Buffer.from('target\r\n');
    fs.writeFileSync(path.join(root, 'link-ref'), target);
    const oid = runGitBuffer(root, ['hash-object', '-w', '--no-filters', '--stdin'], target).stdout.toString('ascii').trim();
    runGit(root, ['update-index', '--add', '--cacheinfo', '120000', oid, 'link-ref']);
    runGit(root, ['commit', '-m', 'tracked symlink']);

    const prepared = await extra.prepareApprovedSnapshot(root, [approved('link-ref', target)]);
    assert.strictEqual(prepared.ok, false,
      'a regular-file emulation must not be blessed as a filter-free OS symlink when Git would clean it');
    assert.strictEqual(prepared.reason, 'approved-content-changed');
    assert.deepStrictEqual(prepared.paths, ['link-ref']);
    assert.strictEqual(runGitBuffer(root, ['cat-file', 'blob', oid]).stdout.equals(target), true,
      'the committed 120000 target remains unchanged while the ambiguous worktree representation is refused');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('prepared content lease hashes a real symlink target without clean filters', { skip: process.platform === 'win32' }, async () => {
  const root = initWorkRepo('mooter-commit-real-symlink-lease-');
  try {
    fs.writeFileSync(path.join(root, '.gitattributes'), 'link-ref text eol=lf\n');
    fs.writeFileSync(path.join(root, 'target\r\n'), 'target body\n');
    fs.symlinkSync('target\r\n', path.join(root, 'link-ref'));
    runGit(root, ['add', '--', '.gitattributes', 'target\r\n', 'link-ref']);
    runGit(root, ['commit', '-m', 'initial symlink']);
    fs.unlinkSync(path.join(root, 'link-ref'));
    fs.writeFileSync(path.join(root, 'approved\r\n'), 'approved body\n');
    fs.symlinkSync('approved\r\n', path.join(root, 'link-ref'));
    const raw = Buffer.from('approved\r\n');

    const prepared = await extra.prepareApprovedSnapshot(root, [approved('link-ref', raw)]);
    assert.strictEqual(prepared.ok, true, JSON.stringify(prepared));
    assert.strictEqual(prepared.rows[0].gitMode, '120000');
    assert.strictEqual(runGitBuffer(root, ['cat-file', 'blob', prepared.rows[0].blobOid]).stdout.equals(raw), true,
      'the CRLF bytes belong to the link target and bypass the text/eol clean filter');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('prepared content lease binds a tracked deletion and rejects an unverifiable missing path', async () => {
  const root = initWorkRepo('mooter-commit-missing-lease-');
  try {
    fs.writeFileSync(path.join(root, 'delete-me.txt'), 'remove me\n');
    runGit(root, ['add', '--', 'delete-me.txt']);
    runGit(root, ['commit', '-m', 'initial']);
    fs.unlinkSync(path.join(root, 'delete-me.txt'));
    const deletion = { path: 'delete-me.txt', missing: true, sha256: null, raw: null };
    const prepared = await extra.prepareApprovedSnapshot(root, [deletion]);
    assert.strictEqual(prepared.ok, true, JSON.stringify(prepared));
    assert.strictEqual(prepared.rows[0].blobOid, null);
    assert.strictEqual(prepared.rows[0].gitMode, null);
    const committed = await extra.gitCommit(root, ['delete-me.txt'], 'approved canonical deletion', prepared.rows);
    assert.strictEqual(committed.ok, true, committed.out);
    assert.notStrictEqual(runGit(root, ['cat-file', '-e', 'HEAD:delete-me.txt'], true).status, 0);

    const unknown = await extra.prepareApprovedSnapshot(root, [
      { path: 'never-tracked.txt', missing: true, sha256: null, raw: null },
    ]);
    assert.strictEqual(unknown.ok, false, 'a missing path with no HEAD entry cannot become an ambiguous no-op lease');
    assert.strictEqual(unknown.reason, 'approved-content-unverifiable');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('gitCommit isolated index: a worktree mutation between verify and commit cannot enter HEAD, unrelated staging survives', async () => {
  const root = initWorkRepo('mooter-commit-isolated-index-');
  try {
    const selected = path.join(root, 'selected.txt');
    const unrelated = path.join(root, 'unrelated.txt');
    fs.writeFileSync(selected, 'selected before\n');
    fs.writeFileSync(unrelated, 'unrelated before\n');
    runGit(root, ['add', '--', 'selected.txt', 'unrelated.txt']);
    runGit(root, ['commit', '-m', 'initial']);

    const approvedBytes = Buffer.from('selected approved\n');
    fs.writeFileSync(selected, approvedBytes);
    fs.writeFileSync(unrelated, 'unrelated staged and preserved\n');
    runGit(root, ['add', '--', 'unrelated.txt']); // real user index: MUST survive our commit

    const result = await extra.gitCommit(root, ['selected.txt'], 'isolated approved commit', [approved('selected.txt', approvedBytes)], {
      afterVerify: () => fs.writeFileSync(selected, 'selected raced after verify\n'),
    });
    assert.strictEqual(result.ok, true, result.out);
    assert.strictEqual(runGit(root, ['show', 'HEAD:selected.txt']).stdout, approvedBytes.toString('utf8'), 'HEAD contains only the verified blob');
    assert.strictEqual(runGit(root, ['show', 'HEAD:unrelated.txt']).stdout, 'unrelated before\n', 'unrelated staging was not swept into the commit');
    assert.strictEqual(runGit(root, ['show', ':unrelated.txt']).stdout, 'unrelated staged and preserved\n', 'unrelated staged blob survives byte-for-byte');
    assert.strictEqual(fs.readFileSync(selected, 'utf8'), 'selected raced after verify\n', 'the later worktree edit remains visible and uncommitted');
    const status = runGit(root, ['status', '--porcelain=v1']).stdout;
    assert.match(status, /^ M selected\.txt$/m, 'raced selected bytes remain an honest unstaged change');
    assert.match(status, /^M  unrelated\.txt$/m, 'unrelated staged state remains staged');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('gitCommit index transaction refuses concurrent staged-only bytes on the selected path without erasing them', async () => {
  const root = initWorkRepo('mooter-selected-index-race-');
  try {
    fs.writeFileSync(path.join(root, 'selected.txt'), 'base\n');
    runGit(root, ['add', '--', 'selected.txt']);
    runGit(root, ['commit', '-m', 'initial']);
    const oldHead = runGit(root, ['rev-parse', 'HEAD']).stdout.trim();
    const approvedRaw = Buffer.from('approved live preview\n');
    fs.writeFileSync(path.join(root, 'selected.txt'), approvedRaw);
    const prepared = await extra.prepareApprovedSnapshot(root, [approved('selected.txt', approvedRaw)]);
    assert.strictEqual(prepared.ok, true, JSON.stringify(prepared));
    let injectedOid = null;

    const result = await extra.gitCommit(root, ['selected.txt'], 'must preserve staged race', prepared.rows, {
      afterVerify: () => {
        injectedOid = runGitBuffer(root, ['hash-object', '-w', '--stdin'], Buffer.from('staged-only WIP\n')).stdout.toString('ascii').trim();
        runGit(root, ['update-index', '--cacheinfo', '100644', injectedOid, 'selected.txt']);
      },
    });
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.reason, 'git-index-selected-path-moved');
    assert.strictEqual(runGit(root, ['rev-parse', 'HEAD']).stdout.trim(), oldHead, 'HEAD never advances');
    assert.strictEqual(runGit(root, ['rev-parse', ':selected.txt']).stdout.trim(), injectedOid, 'the concurrent staged blob survives byte-for-byte');
    assert.strictEqual(runGit(root, ['show', ':selected.txt']).stdout, 'staged-only WIP\n');
    assert.strictEqual(fs.readFileSync(path.join(root, 'selected.txt')).equals(approvedRaw), true, 'the LP worktree bytes also remain visible');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('gitCommit post-verify defence: a temp-index writer that stages different bytes is rejected before CAS', async () => {
  const root = initWorkRepo('mooter-commit-hook-race-');
  try {
    const file = path.join(root, 'selected.txt');
    fs.writeFileSync(file, 'before\n');
    runGit(root, ['add', '--', 'selected.txt']);
    runGit(root, ['commit', '-m', 'initial']);
    const approvedBytes = Buffer.from('approved\n');
    fs.writeFileSync(file, approvedBytes);
    const oldHead = runGit(root, ['rev-parse', 'HEAD']).stdout.trim();
    const result = await extra.gitCommit(root, ['selected.txt'], 'must refuse', [approved('selected.txt', approvedBytes)], {
      afterVerify: ({ isolatedEnv }) => {
        fs.writeFileSync(file, 'index injected\n');
        const staged = spawnSync('git', ['-C', root, 'add', '--', 'selected.txt'], { encoding: 'utf8', windowsHide: true, env: Object.assign({}, process.env, isolatedEnv) });
        assert.strictEqual(staged.status, 0, staged.stderr);
      },
    });
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.reason, 'approved-content-changed');
    assert.match(result.out, /branch and push untouched/);
    assert.strictEqual(runGit(root, ['rev-parse', 'HEAD']).stdout.trim(), oldHead, 'branch points to the original reviewed parent');
    assert.strictEqual(runGit(root, ['show', 'HEAD:selected.txt']).stdout, 'before\n', 'injected bytes are absent from branch history');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('gitCommit exact path set: an isolated-index writer cannot smuggle an extra staged file', async () => {
  const root = initWorkRepo('mooter-commit-hook-extra-');
  try {
    fs.writeFileSync(path.join(root, 'selected.txt'), 'selected before\n');
    fs.writeFileSync(path.join(root, 'extra.txt'), 'extra before\n');
    runGit(root, ['add', '--', 'selected.txt', 'extra.txt']);
    runGit(root, ['commit', '-m', 'initial']);
    const approvedBytes = Buffer.from('selected approved\n');
    fs.writeFileSync(path.join(root, 'selected.txt'), approvedBytes);
    const oldHead = runGit(root, ['rev-parse', 'HEAD']).stdout.trim();
    const result = await extra.gitCommit(root, ['selected.txt'], 'must reject extra path', [approved('selected.txt', approvedBytes)], {
      afterVerify: ({ isolatedEnv }) => {
        fs.writeFileSync(path.join(root, 'extra.txt'), 'extra injected\n');
        const staged = spawnSync('git', ['-C', root, 'add', '--', 'extra.txt'], { encoding: 'utf8', windowsHide: true, env: Object.assign({}, process.env, isolatedEnv) });
        assert.strictEqual(staged.status, 0, staged.stderr);
      },
    });
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.reason, 'approved-content-changed');
    assert.match(result.out, /branch and push untouched/);
    assert.strictEqual(runGit(root, ['rev-parse', 'HEAD']).stdout.trim(), oldHead);
    assert.strictEqual(runGit(root, ['show', 'HEAD:extra.txt']).stdout, 'extra before\n', 'extra hook path never remains on the branch');
    assert.strictEqual(runGit(root, ['show', 'HEAD:selected.txt']).stdout, 'selected before\n', 'the rejected commit is fully rolled back');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('gitCommit CAS: a concurrent HEAD advance is preserved and the stale approved tree is never attached', async () => {
  const root = initWorkRepo('mooter-commit-head-cas-');
  try {
    fs.writeFileSync(path.join(root, 'selected.txt'), 'selected before\n');
    fs.writeFileSync(path.join(root, 'concurrent.txt'), 'concurrent before\n');
    runGit(root, ['add', '--', 'selected.txt', 'concurrent.txt']);
    runGit(root, ['commit', '-m', 'initial']);
    const approvedBytes = Buffer.from('selected approved on stale parent\n');
    fs.writeFileSync(path.join(root, 'selected.txt'), approvedBytes);
    const oldHead = runGit(root, ['rev-parse', 'HEAD']).stdout.trim();

    const result = await extra.gitCommit(root, ['selected.txt'], 'stale candidate', [approved('selected.txt', approvedBytes)], {
      afterVerify: () => {
        fs.writeFileSync(path.join(root, 'concurrent.txt'), 'concurrent landed\n');
        runGit(root, ['add', '--', 'concurrent.txt']);
        runGit(root, ['commit', '-m', 'concurrent writer', '--', 'concurrent.txt']);
      },
    });
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.reason, 'git-head-moved');
    assert.match(result.out, /HEAD changed/);
    const current = runGit(root, ['rev-parse', 'HEAD']).stdout.trim();
    assert.notStrictEqual(current, oldHead, 'the concurrent writer owns the new HEAD');
    assert.strictEqual(runGit(root, ['log', '-1', '--format=%s']).stdout.trim(), 'concurrent writer');
    assert.strictEqual(runGit(root, ['show', 'HEAD:concurrent.txt']).stdout, 'concurrent landed\n');
    assert.strictEqual(runGit(root, ['show', 'HEAD:selected.txt']).stdout, 'selected before\n', 'stale temp tree never reverted the concurrent commit');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('gitCommit TOCTOU fence: bytes changed after approval are staged but NEVER committed', async () => {
  const root = initWorkRepo('mooter-commit-lease-race-');
  try {
    const file = path.join(root, 'landing.txt');
    fs.writeFileSync(file, 'before\n');
    runGit(root, ['add', '--', 'landing.txt']);
    runGit(root, ['commit', '-m', 'initial']);
    const approvedBytes = Buffer.from('approved copy\n');
    fs.writeFileSync(file, approvedBytes);
    const lease = [approved('landing.txt', approvedBytes)];
    fs.writeFileSync(file, 'raced unreviewed copy\n');
    const beforeHead = runGit(root, ['rev-parse', 'HEAD']).stdout.trim();

    const result = await extra.gitCommit(root, ['landing.txt'], 'must not exist', lease);
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.reason, 'approved-content-changed');
    assert.match(result.out, /commit refused/);
    assert.strictEqual(runGit(root, ['rev-parse', 'HEAD']).stdout.trim(), beforeHead, 'HEAD never moved');
    assert.strictEqual(runGit(root, ['log', '-1', '--format=%s']).stdout.trim(), 'initial', 'no unreviewed commit exists');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('gitCommit content lease: an approved deletion requires the path to be absent from the index', async () => {
  const root = initWorkRepo('mooter-commit-lease-delete-');
  try {
    const file = path.join(root, 'delete-me.txt');
    fs.writeFileSync(file, 'remove me\n');
    runGit(root, ['add', '--', 'delete-me.txt']);
    runGit(root, ['commit', '-m', 'initial']);
    fs.unlinkSync(file);

    const result = await extra.gitCommit(root, ['delete-me.txt'], 'approved deletion', [
      { path: 'delete-me.txt', missing: true, sha256: null, raw: null },
    ]);
    assert.strictEqual(result.ok, true, result.out);
    const missing = runGit(root, ['cat-file', '-e', 'HEAD:delete-me.txt'], true);
    assert.notStrictEqual(missing.status, 0, 'the approved deletion is what the commit contains');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('gitCommit refuses plumbing commits during merge/rebase/cherry-pick/revert/sequencer state', async () => {
  const root = initWorkRepo('mooter-commit-operation-');
  try {
    fs.writeFileSync(path.join(root, 'selected.txt'), 'before\n');
    runGit(root, ['add', '--', 'selected.txt']);
    runGit(root, ['commit', '-m', 'initial']);
    const next = Buffer.from('approved\n');
    fs.writeFileSync(path.join(root, 'selected.txt'), next);
    const oldHead = runGit(root, ['rev-parse', 'HEAD']).stdout.trim();
    const gitDir = runGit(root, ['rev-parse', '--absolute-git-dir']).stdout.trim();
    const markers = [
      { name: 'merge', path: 'MERGE_HEAD', dir: false },
      { name: 'rebase-merge', path: 'rebase-merge', dir: true },
      { name: 'rebase-apply', path: 'rebase-apply', dir: true },
      { name: 'rebase-head', path: 'REBASE_HEAD', dir: false },
      { name: 'cherry-pick', path: 'CHERRY_PICK_HEAD', dir: false },
      { name: 'revert', path: 'REVERT_HEAD', dir: false },
      { name: 'sequencer', path: 'sequencer', dir: true },
    ];
    for (const marker of markers) {
      const target = path.join(gitDir, marker.path);
      try {
        if (marker.dir) fs.mkdirSync(target, { recursive: true });
        else fs.writeFileSync(target, oldHead + '\n');
        const result = await extra.gitCommit(root, ['selected.txt'], 'must refuse ' + marker.name, [approved('selected.txt', next)]);
        assert.strictEqual(result.ok, false, marker.name + ' must refuse');
        assert.strictEqual(result.reason, 'git-operation-in-progress', marker.name + ' gets the stable UX reason');
        assert.match(result.out, /finish or abort|branch and push left untouched/);
        assert.strictEqual(runGit(root, ['rev-parse', 'HEAD']).stdout.trim(), oldHead, marker.name + ' leaves HEAD untouched');
      } finally {
        fs.rmSync(target, { recursive: true, force: true });
      }
    }
    const lateMarker = path.join(gitDir, 'MERGE_HEAD');
    try {
      const late = await extra.gitCommit(root, ['selected.txt'], 'must refuse late merge', [approved('selected.txt', next)], {
        afterVerify: () => fs.writeFileSync(lateMarker, oldHead + '\n'),
      });
      assert.strictEqual(late.ok, false);
      assert.strictEqual(late.reason, 'git-operation-in-progress', 'operation state is rechecked after staged-byte verification');
      assert.match(late.out, /started while Publish was preparing/);
      assert.strictEqual(runGit(root, ['rev-parse', 'HEAD']).stdout.trim(), oldHead, 'a late operation still leaves HEAD untouched');
    } finally {
      fs.rmSync(lateMarker, { force: true });
    }
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('Publish freezes a non-origin upstream + differently named branch and pushes through the exact displayed URL', async () => {
  const work = initWorkRepo('mooter-upstream-');
  const originUrl = 'https://git.example.test/team/origin.git';
  const backupUrl = 'https://git.example.test/team/backup.git';
  try {
    runGit(work, ['branch', '-M', 'feature/local-name']);
    fs.writeFileSync(path.join(work, 'tracked.txt'), 'one\n');
    runGit(work, ['add', '--', 'tracked.txt']);
    runGit(work, ['commit', '-m', 'one']);
    runGit(work, ['remote', 'add', 'origin', originUrl]);
    runGit(work, ['remote', 'add', 'backup', backupUrl]);
    // Establish the real tracking atoms without making any network call.
    runGit(work, ['config', 'branch.feature/local-name.remote', 'backup']);
    runGit(work, ['config', 'branch.feature/local-name.merge', 'refs/heads/release-track']);

    fs.writeFileSync(path.join(work, 'tracked.txt'), 'two\n');
    runGit(work, ['add', '--', 'tracked.txt']);
    runGit(work, ['commit', '-m', 'two']);

    const destination = await extra.gitRemoteInfo(work);
    assert.strictEqual(destination.available, true);
    assert.strictEqual(destination.name, 'backup', 'real upstream wins even though origin exists');
    assert.strictEqual(destination.url, backupUrl);
    assert.strictEqual(destination.webUrl, 'https://git.example.test/team/backup');
    assert.strictEqual(destination.localBranch, 'feature/local-name');
    assert.strictEqual(destination.upstreamRemote, 'backup');
    assert.strictEqual(destination.upstreamBranch, 'release-track');
    assert.strictEqual(destination.targetBranch, 'release-track');
    assert.strictEqual(destination.hasUpstream, true);
    assert.strictEqual(destination.destinationCount, 1);

    const approvedHead = runGit(work, ['rev-parse', 'HEAD']).stdout.trim();
    const calls = [];
    const pushed = await extra.gitPush(work, approvedHead, destination, { execPush: async (args, meta) => {
      calls.push({ args, meta });
      return { ok: true, out: 'deterministic transport seam' };
    } });
    assert.strictEqual(pushed.ok, true, pushed.out);
    assert.strictEqual(pushed.remote, 'backup');
    assert.strictEqual(pushed.url, backupUrl);
    assert.strictEqual(pushed.branch, 'release-track');
    assert.strictEqual(pushed.cmd, 'git push ' + backupUrl + ' ' + approvedHead + ':refs/heads/release-track');
    assert.strictEqual(calls.length, 1);
    const call = calls[0];
    assert.strictEqual(call.args[2], 'push');
    assert.strictEqual(call.args[3], '--');
    assert.strictEqual(call.args[4], call.meta.alias, 'Git receives a one-shot nonce URL, never the remote name');
    assert.strictEqual(call.args[5], approvedHead + ':refs/heads/release-track');
    assert.strictEqual(call.args[0], '-c');
    assert.strictEqual(call.args[1], 'url.' + backupUrl + '.pushInsteadOf=' + call.meta.alias, 'the nonce maps command-scoped to the exact displayed URL');

    // Freeze the destination too: changing the configured URL after confirmation must refuse,
    // even though the immutable commit id itself remains valid.
    fs.writeFileSync(path.join(work, 'tracked.txt'), 'three\n');
    runGit(work, ['add', '--', 'tracked.txt']);
    runGit(work, ['commit', '-m', 'three']);
    const thirdHead = runGit(work, ['rev-parse', 'HEAD']).stdout.trim();
    runGit(work, ['remote', 'set-url', 'backup', 'https://git.example.test/team/changed.git']);
    const refused = await extra.gitPush(work, thirdHead, destination, { execPush: async () => { throw new Error('must not reach transport'); } });
    assert.strictEqual(refused.ok, false);
    assert.strictEqual(refused.reason, 'git-destination-changed');
    assert.match(refused.out, /push refused/);
  } finally {
    fs.rmSync(work, { recursive: true, force: true });
  }
});

test('Publish fails closed when one remote has multiple pushurl destinations (never invokes transport)', async () => {
  const work = initWorkRepo('mooter-multipush-');
  try {
    fs.writeFileSync(path.join(work, 'x.txt'), 'x\n');
    runGit(work, ['add', '--', 'x.txt']); runGit(work, ['commit', '-m', 'x']);
    const a = 'https://git.example.test/team/a.git';
    const b = 'https://git.example.test/team/b.git';
    runGit(work, ['remote', 'add', 'origin', a]);
    runGit(work, ['remote', 'set-url', '--add', '--push', 'origin', a]);
    runGit(work, ['remote', 'set-url', '--add', '--push', 'origin', b]);
    const destination = await extra.gitRemoteInfo(work);
    assert.strictEqual(destination.available, false);
    assert.strictEqual(destination.reason, 'git-multiple-push-destinations');
    assert.strictEqual(destination.destinationCount, 2, 'configured entries, not unique display strings, define fan-out');
    let called = false;
    const head = runGit(work, ['rev-parse', 'HEAD']).stdout.trim();
    const pushed = await extra.gitPush(work, head, null, { execPush: async () => { called = true; return { ok: true, out: '' }; } });
    assert.strictEqual(pushed.ok, false);
    assert.strictEqual(pushed.reason, 'git-multiple-push-destinations');
    assert.strictEqual(called, false, 'no process can push to either hidden destination');
  } finally { fs.rmSync(work, { recursive: true, force: true }); }
});

test('Publish also fails closed when implicit push would inherit multiple fetch URLs', async () => {
  const work = initWorkRepo('mooter-multiurl-');
  try {
    fs.writeFileSync(path.join(work, 'x.txt'), 'x\n');
    runGit(work, ['add', '--', 'x.txt']); runGit(work, ['commit', '-m', 'x']);
    runGit(work, ['remote', 'add', 'origin', 'https://git.example.test/team/a.git']);
    runGit(work, ['config', '--add', 'remote.origin.url', 'https://git.example.test/team/b.git']);
    const destination = await extra.gitRemoteInfo(work);
    assert.strictEqual(destination.available, false);
    assert.strictEqual(destination.reason, 'git-multiple-push-destinations');
    assert.strictEqual(destination.destinationCount, 2);
  } finally { fs.rmSync(work, { recursive: true, force: true }); }
});

test('insteadOf/pushInsteadOf are resolved to the effective network destination before display/freeze', async () => {
  const work = initWorkRepo('mooter-rewrite-');
  try {
    fs.writeFileSync(path.join(work, 'x.txt'), 'x\n');
    runGit(work, ['add', '--', 'x.txt']); runGit(work, ['commit', '-m', 'x']);
    const readUrl = 'https://read.example.test/team/repo.git';
    const pushUrl = 'https://push.example.test/team/repo.git';
    runGit(work, ['remote', 'add', 'origin', readUrl]);
    runGit(work, ['config', 'url.https://push.example.test/.pushInsteadOf', 'https://read.example.test/']);
    const destination = await extra.gitRemoteInfo(work);
    assert.strictEqual(destination.available, true);
    assert.strictEqual(destination.url, pushUrl, 'the UI sees the effective push host, not the friendly fetch alias');
    assert.strictEqual(destination.webUrl, 'https://push.example.test/team/repo');
    const head = runGit(work, ['rev-parse', 'HEAD']).stdout.trim();
    let meta = null;
    const pushed = await extra.gitPush(work, head, destination, { execPush: async (_args, m) => { meta = m; return { ok: true, out: '' }; } });
    assert.strictEqual(pushed.ok, true);
    assert.ok(meta && meta.freezeRule.startsWith('url.' + pushUrl + '.pushInsteadOf='), 'the effective URL is the exact frozen transport');
  } finally { fs.rmSync(work, { recursive: true, force: true }); }
});

test('a rewrite to a local/file transport is not renderable as a repo URL and fails closed', async () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'mooter-local-rewrite-'));
  const work = path.join(base, 'work'); const bare = path.join(base, 'hidden.git');
  try {
    runGit(null, ['init', '--bare', bare]); runGit(null, ['init', work]);
    runGit(work, ['config', 'user.name', 'Mooter Test']); runGit(work, ['config', 'user.email', 'mooter-test@example.invalid']);
    runGit(work, ['branch', '-M', 'main']); fs.writeFileSync(path.join(work, 'x.txt'), 'x\n');
    runGit(work, ['add', '--', 'x.txt']); runGit(work, ['commit', '-m', 'x']);
    const shown = 'https://git.example.test/team/repo.git';
    runGit(work, ['remote', 'add', 'origin', shown]);
    runGit(work, ['config', 'url.' + pathToFileURL(bare).href + '.insteadOf', shown]);
    const destination = await extra.gitRemoteInfo(work);
    assert.strictEqual(destination.available, false);
    assert.strictEqual(destination.reason, 'git-destination-unverifiable');
    assert.strictEqual(runGit(null, ['--git-dir', bare, 'show-ref'], true).status, 1, 'the hidden rewritten destination is untouched');
  } finally { fs.rmSync(base, { recursive: true, force: true }); }
});

test('nonce pushInsteadOf freeze reaches exactly one target and is not recursively redirected', () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'mooter-freeze-mechanism-'));
  const work = path.join(base, 'work'); const exact = path.join(base, 'exact.git'); const hidden = path.join(base, 'hidden.git');
  try {
    runGit(null, ['init', '--bare', exact]); runGit(null, ['init', '--bare', hidden]); runGit(null, ['init', work]);
    runGit(work, ['config', 'user.name', 'Mooter Test']); runGit(work, ['config', 'user.email', 'mooter-test@example.invalid']);
    fs.writeFileSync(path.join(work, 'x.txt'), 'x\n'); runGit(work, ['add', '--', 'x.txt']); runGit(work, ['commit', '-m', 'x']);
    const head = runGit(work, ['rev-parse', 'HEAD']).stdout.trim();
    const alias = 'https://mooter-publish.invalid/fixed-test-nonce';
    const exactUrl = pathToFileURL(exact).href; const hiddenUrl = pathToFileURL(hidden).href;
    // If Git recursively rewrote the result, this ambient rule would send exact→hidden. It does not:
    // the command-scoped exact alias rule resolves once and the exact target alone receives the ref.
    runGit(work, ['config', 'url.' + hiddenUrl + '.pushInsteadOf', exactUrl]);
    runGit(work, ['-c', 'url.' + exactUrl + '.pushInsteadOf=' + alias, 'push', '--', alias, head + ':refs/heads/main']);
    assert.strictEqual(runGit(null, ['--git-dir', exact, 'rev-parse', 'refs/heads/main']).status, 0);
    assert.strictEqual(runGit(null, ['--git-dir', hidden, 'show-ref'], true).status, 1, 'ambient second-hop rewrite never runs');
  } finally { fs.rmSync(base, { recursive: true, force: true }); }
});
