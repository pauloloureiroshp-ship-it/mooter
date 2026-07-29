'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const childProcess = require('node:child_process');
const vaultGit = require('./agent-sync-vault-git.js');
const sync = require('./agent-sync-ledger.js');

function git(cwd, args) {
  const result = childProcess.spawnSync('git', ['-C', cwd, ...args], {
    encoding: 'utf8',
    timeout: 10000,
  });
  assert.equal(result.status, 0, `${args.join(' ')}: ${result.stderr}`);
  return result.stdout.trim();
}

function write(root, rel, text) {
  const file = path.join(root, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
  return file;
}

function fixture() {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'mooter-vault-git-'));
  const remote = path.join(base, 'remote.git');
  const seed = path.join(base, 'seed');
  const clone = path.join(base, 'clone');
  fs.mkdirSync(seed);
  git(base, ['init', '--bare', '--initial-branch=main', remote]);
  git(seed, ['init', '--initial-branch=main']);
  git(seed, ['config', 'user.name', 'Agent Sync Test']);
  git(seed, ['config', 'user.email', 'agent-sync@example.invalid']);
  write(seed, 'AGENTS.md', '# Vault rules\n');
  write(seed, '00-core/agent-sync-protocol.md', '# Protocol\n');
  write(seed, '10-projects/mooter.md', '# Mooter\n');
  git(seed, ['add', 'AGENTS.md', '00-core/agent-sync-protocol.md', '10-projects/mooter.md']);
  git(seed, ['commit', '-m', 'initial']);
  git(seed, ['remote', 'add', 'origin', remote]);
  git(seed, ['push', '-u', 'origin', 'main']);
  git(base, ['clone', remote, clone]);
  git(clone, ['config', 'user.name', 'Agent Sync Test']);
  git(clone, ['config', 'user.email', 'agent-sync@example.invalid']);
  return { base, remote, seed, clone };
}

function writeReceipt(vault, device, id, timestamp, overrides) {
  const event = sync.normalizeEvent({
    id,
    agent: 'codex',
    recorded_by: 'codex',
    provider: 'openai',
    model: 'gpt-5',
    execution_channel: 'subscription',
    kind: 'outcome',
    cadence: 'handoff',
    status: 'done',
    summary: 'verified test receipt',
    next: 'n/d',
    evidence: ['test'],
    started_at: timestamp,
    ended_at: timestamp,
    timing_basis: 'wall_clock',
    device_id: device,
    device_name: device,
    device_platform: 'darwin',
    device_arch: 'arm64',
    source: 'unit-test',
    ...overrides,
  }, { root: vault, git: false, classify: false, now: timestamp });
  const absolute = sync.vaultReceiptPath(vault, 'mooter', event);
  fs.mkdirSync(path.dirname(absolute), { recursive: true });
  fs.writeFileSync(absolute, sync.renderVaultReceipt(event, 'mooter'));
  return path.relative(vault, absolute);
}

test('vault sync dry-run is read-only and identifies append-only receipts', () => {
  const fx = fixture();
  try {
    const receipt = writeReceipt(fx.clone, 'device', 'receipt-dry-run', '2026-07-29T12:00:00.000Z');
    const before = git(fx.clone, ['rev-parse', 'HEAD']);
    const result = vaultGit.syncVault(fx.clone, { dryRun: true });
    assert.equal(result.ok, true);
    assert.equal(result.pushed, false);
    assert.deepEqual(result.receipt_paths, [receipt]);
    assert.equal(git(fx.clone, ['rev-parse', 'HEAD']), before);
    assert.match(git(fx.clone, ['status', '--short']), /^\?\?/);
  } finally {
    fs.rmSync(fx.base, { recursive: true, force: true });
  }
});

test('vault sync fails closed when any human-managed file is dirty', () => {
  const fx = fixture();
  try {
    write(fx.clone, 'README.md', '# human edit\n');
    assert.throws(
      () => vaultGit.syncVault(fx.clone, { dryRun: true }),
      /non-receipt or mutable changes/
    );
    assert.equal(git(fx.clone, ['log', '-1', '--pretty=%s']), 'initial');
  } finally {
    fs.rmSync(fx.base, { recursive: true, force: true });
  }
});

test('vault sync commits and pushes only allowlisted receipts', () => {
  const fx = fixture();
  try {
    const receipt = writeReceipt(fx.clone, 'device', 'receipt-push', '2026-07-29T12:00:00.000Z');
    const result = vaultGit.syncVault(fx.clone);
    assert.equal(result.ok, true);
    assert.equal(result.action, 'committed_and_pushed');
    assert.equal(result.local_head, result.remote_head);
    assert.equal(git(fx.clone, ['status', '--short']), '');
    assert.equal(git(fx.clone, ['show', '--pretty=', '--name-only', 'HEAD']), receipt);
  } finally {
    fs.rmSync(fx.base, { recursive: true, force: true });
  }
});

test('two devices safely reconcile concurrent append-only receipt commits', () => {
  const fx = fixture();
  const second = path.join(fx.base, 'second');
  try {
    git(fx.base, ['clone', fx.remote, second]);
    git(second, ['config', 'user.name', 'Agent Sync Test']);
    git(second, ['config', 'user.email', 'agent-sync@example.invalid']);
    const receiptA = writeReceipt(fx.clone, 'device-a', 'receipt-a', '2026-07-29T12:00:00.000Z');
    const receiptB = writeReceipt(second, 'device-b', 'receipt-b', '2026-07-29T12:00:01.000Z');
    const first = vaultGit.syncVault(fx.clone);
    const secondResult = vaultGit.syncVault(second);
    assert.equal(first.ok, true);
    assert.equal(secondResult.ok, true);
    assert.equal(secondResult.local_head, secondResult.remote_head);
    git(fx.clone, ['pull', '--ff-only']);
    assert.equal(fs.existsSync(path.join(fx.clone, receiptA)), true);
    assert.equal(fs.existsSync(path.join(fx.clone, receiptB)), true);
  } finally {
    fs.rmSync(fx.base, { recursive: true, force: true });
  }
});

test('conflicting receipt-only rebases abort without changing the remote', () => {
  const fx = fixture();
  const second = path.join(fx.base, 'second');
  try {
    git(fx.base, ['clone', fx.remote, second]);
    git(second, ['config', 'user.name', 'Agent Sync Test']);
    git(second, ['config', 'user.email', 'agent-sync@example.invalid']);
    const receiptA = writeReceipt(
      fx.clone,
      'same-device',
      'same-event',
      '2026-07-29T12:00:00.000Z',
      { model: 'gpt-5-a' }
    );
    const receiptB = writeReceipt(
      second,
      'same-device',
      'same-event',
      '2026-07-29T12:00:00.000Z',
      { model: 'gpt-5-b' }
    );
    assert.equal(receiptA, receiptB);
    git(fx.clone, ['add', '--', receiptA]);
    git(fx.clone, ['commit', '-m', 'receipt a']);
    git(second, ['add', '--', receiptB]);
    git(second, ['commit', '-m', 'receipt b']);
    git(fx.clone, ['push', 'origin', 'main']);
    const remoteBefore = git(fx.clone, ['ls-remote', '--heads', 'origin', 'refs/heads/main']).split(/\s+/)[0];

    assert.throws(
      () => vaultGit.syncVault(second),
      /rebase conflicted/
    );
    assert.equal(git(second, ['status', '--short']), '');
    assert.equal(
      git(second, ['ls-remote', '--heads', 'origin', 'refs/heads/main']).split(/\s+/)[0],
      remoteBefore
    );
  } finally {
    fs.rmSync(fx.base, { recursive: true, force: true });
  }
});

test('post-push verification accepts a concurrent mechanical advance and fast-forwards', () => {
  const fx = fixture();
  const second = path.join(fx.base, 'second');
  try {
    writeReceipt(fx.clone, 'device-a', 'receipt-before-verify', '2026-07-29T12:00:00.000Z');
    const first = vaultGit.syncVault(fx.clone);
    git(fx.base, ['clone', fx.remote, second]);
    git(second, ['config', 'user.name', 'Agent Sync Test']);
    git(second, ['config', 'user.email', 'agent-sync@example.invalid']);
    writeReceipt(second, 'device-b', 'receipt-concurrent-verify', '2026-07-29T12:00:01.000Z');
    const concurrent = vaultGit.syncVault(second);

    const verified = vaultGit.verifyPushedHead(fx.clone, 'origin', 'main', first.local_head);
    assert.equal(verified.remote_advanced, true);
    assert.equal(verified.local_head, concurrent.remote_head);
    assert.equal(git(fx.clone, ['rev-parse', 'HEAD']), concurrent.remote_head);
  } finally {
    fs.rmSync(fx.base, { recursive: true, force: true });
  }
});

test('allowlist rejects traversal, mutable receipts and rename records', () => {
  assert.equal(vaultGit.isAllowedReceiptPath('30-learnings/agent-sync/mooter/a.md'), true);
  assert.equal(vaultGit.isAllowedReceiptPath('../30-learnings/agent-sync/a.md'), false);
  assert.equal(vaultGit.isAllowedReceiptPath('30-learnings/agent-sync/mooter/..'), false);
  assert.equal(vaultGit.isAllowedReceiptPath('00-core/agent-sync-protocol.md'), false);
  const parsed = vaultGit.parsePorcelainZ('R  old.md\0new.md\0?? 30-learnings/agent-sync/a.md\0');
  assert.equal(parsed.length, 2);
  assert.equal(parsed[0].target, 'new.md');
});

test('a manually planted file inside the receipt tree is never published', () => {
  const fx = fixture();
  try {
    write(fx.clone, '30-learnings/agent-sync/mooter/device/2026-07/manual.md', '# not a signed receipt\n');
    assert.throws(
      () => vaultGit.syncVault(fx.clone, { dryRun: true }),
      /integrity verification/
    );
    assert.equal(git(fx.clone, ['log', '-1', '--pretty=%s']), 'initial');
  } finally {
    fs.rmSync(fx.base, { recursive: true, force: true });
  }
});

test('stale dead-process lock is reclaimed but an active lock remains fail-closed', () => {
  const fx = fixture();
  try {
    const active = vaultGit.acquireLock(fx.clone, {
      hostname: 'test-host',
      pid: 1001,
      isProcessAlive: (pid) => pid === 1001,
    });
    assert.throws(
      () => vaultGit.acquireLock(fx.clone, {
        hostname: 'test-host',
        pid: 1002,
        isProcessAlive: (pid) => pid === 1001,
      }),
      /already running/
    );
    active.release();

    const gitDir = git(fx.clone, ['rev-parse', '--git-dir']);
    const lockFile = path.join(fx.clone, gitDir, 'mooter-agent-sync-vault.lock');
    fs.writeFileSync(lockFile, JSON.stringify({
      pid: 9999,
      hostname: 'test-host',
      at: '2026-07-29T11:00:00.000Z',
      token: 'stale',
    }) + '\n');
    fs.utimesSync(lockFile, new Date('2026-07-29T11:00:00.000Z'), new Date('2026-07-29T11:00:00.000Z'));

    const reclaimed = vaultGit.acquireLock(fx.clone, {
      hostname: 'test-host',
      pid: 1002,
      now: '2026-07-29T12:00:00.000Z',
      lockStaleMs: 60 * 1000,
      isProcessAlive: () => false,
    });
    assert.notEqual(reclaimed.owner.token, 'stale');
    reclaimed.release();
    assert.equal(fs.existsSync(lockFile), false);
  } finally {
    fs.rmSync(fx.base, { recursive: true, force: true });
  }
});
