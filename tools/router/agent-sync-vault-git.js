#!/usr/bin/env node
/**
 * Publishes append-only agent-sync receipts from the local vault to its Git remote.
 *
 * Safety contract:
 * - only 30-learnings/agent-sync/** may be staged or committed;
 * - receipt files must be untracked (existing receipts are immutable);
 * - unrelated vault changes fail closed;
 * - concurrent device commits may be rebased, but only when every local commit
 *   since the remote base touches the same allowlisted receipt tree;
 * - never force-pushes and never reads credential files.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const childProcess = require('child_process');
const sync = require('./agent-sync-ledger.js');

const RECEIPT_PREFIX = '30-learnings/agent-sync/';
const LOCK_NAME = 'mooter-agent-sync-vault.lock';
const LOCK_STALE_MS = 15 * 60 * 1000;

function clamp(value, max) {
  const text = value == null ? '' : String(value).trim();
  return text ? text.slice(0, max) : null;
}

function runGit(vaultRoot, args, options) {
  options = options || {};
  const run = options.spawnSync || childProcess.spawnSync;
  const result = run('git', ['-C', vaultRoot, ...args], {
    encoding: 'utf8',
    timeout: options.timeout || 30000,
    maxBuffer: 1024 * 1024,
  });
  if (result.status !== 0 && !options.allowFailure) {
    const detail = clamp(result.stderr || result.stdout, 1200) || `exit ${result.status}`;
    throw new Error(`git ${args[0]} failed: ${detail}`);
  }
  return result;
}

function isAllowedReceiptPath(file) {
  if (!file || path.isAbsolute(file)) return false;
  const normalized = file.replace(/\\/g, '/').replace(/^\.\//, '');
  const segments = normalized.split('/');
  return normalized.startsWith(RECEIPT_PREFIX) &&
    !segments.includes('..') &&
    !normalized.endsWith('/');
}

function parsePorcelainZ(text) {
  const rows = [];
  const records = String(text || '').split('\0').filter(Boolean);
  for (let i = 0; i < records.length; i++) {
    const record = records[i];
    if (record.length < 4) throw new Error('vault git status returned an invalid record');
    const status = record.slice(0, 2);
    const file = record.slice(3);
    if (/[RC]/.test(status)) {
      const target = records[++i];
      rows.push({ status, file, target: target || null });
    } else {
      rows.push({ status, file, target: null });
    }
  }
  return rows;
}

function inspectWorktree(vaultRoot, options) {
  const result = runGit(vaultRoot, ['status', '--porcelain=v1', '-z', '--untracked-files=all'], options);
  const rows = parsePorcelainZ(result.stdout);
  const disallowed = rows.filter((row) =>
    row.status !== '??' ||
    !isAllowedReceiptPath(row.file) ||
    row.target
  );
  return {
    ok: disallowed.length === 0,
    rows,
    receipt_paths: rows.filter((row) => row.status === '??').map((row) => row.file).sort(),
    disallowed,
  };
}

function verifyReceiptFiles(vaultRoot, files) {
  const verified = [];
  for (const file of files || []) {
    const absolute = path.join(vaultRoot, file);
    const content = fs.readFileSync(absolute, 'utf8');
    if (sync.containsSecret(content)) {
      throw new Error(`receipt contains a possible secret: ${file}`);
    }
    const check = sync.verifyVaultReceipt(content);
    if (!check.ok || !check.receipt) {
      throw new Error(`receipt failed integrity verification: ${file} (${check.errors.join(',')})`);
    }
    if (check.receipt.schema_version !== sync.RECEIPT_SCHEMA_VERSION) {
      throw new Error(`legacy receipt cannot be auto-published: ${file}`);
    }
    const expected = sync.vaultReceiptPath(vaultRoot, check.receipt.project, {
      id: check.receipt.event_id,
      device: check.receipt.device,
      ts: check.receipt.ts,
      ended_at: check.receipt.ended_at,
    });
    if (path.resolve(expected) !== path.resolve(absolute)) {
      throw new Error(`receipt path does not match signed identity: ${file}`);
    }
    verified.push({ file, event_id: check.receipt.event_id });
  }
  return verified;
}

function refSha(vaultRoot, ref, options) {
  const result = runGit(vaultRoot, ['rev-parse', '--verify', ref], { ...options, allowFailure: true });
  return result.status === 0 ? clamp(result.stdout, 80) : null;
}

function remoteSha(vaultRoot, remote, branch, options) {
  const result = runGit(
    vaultRoot,
    ['ls-remote', '--heads', remote, `refs/heads/${branch}`],
    { ...options, allowFailure: true, timeout: options && options.remoteTimeout || 20000 }
  );
  if (result.status !== 0 || !result.stdout.trim()) return null;
  return clamp(result.stdout.trim().split(/\s+/)[0], 80);
}

function isAncestor(vaultRoot, older, newer, options) {
  if (!older || !newer) return false;
  const result = runGit(vaultRoot, ['merge-base', '--is-ancestor', older, newer], {
    ...options,
    allowFailure: true,
  });
  return result.status === 0;
}

function committedPaths(vaultRoot, base, head, options) {
  if (!base || !head || base === head) return [];
  const result = runGit(vaultRoot, ['diff', '--name-only', '-z', `${base}..${head}`], options);
  return String(result.stdout || '').split('\0').filter(Boolean).sort();
}

function assertMechanicalCommits(vaultRoot, base, head, options) {
  const files = committedPaths(vaultRoot, base, head, options);
  const disallowed = files.filter((file) => !isAllowedReceiptPath(file));
  if (disallowed.length) {
    throw new Error(`local vault commits include non-receipt paths: ${disallowed.join(', ')}`);
  }
  return files;
}

function reconcileRemote(vaultRoot, remote, branch, options) {
  const remoteRef = `refs/remotes/${remote}/${branch}`;
  runGit(vaultRoot, ['fetch', '--no-tags', remote, `refs/heads/${branch}:${remoteRef}`], options);
  let local = refSha(vaultRoot, 'HEAD', options);
  const upstream = refSha(vaultRoot, remoteRef, options);
  if (!local || !upstream) throw new Error('cannot resolve local or remote vault HEAD');
  if (local === upstream) return { action: 'equal', local, upstream };

  if (isAncestor(vaultRoot, local, upstream, options)) {
    runGit(vaultRoot, ['merge', '--ff-only', upstream], options);
    local = refSha(vaultRoot, 'HEAD', options);
    return { action: 'fast_forward', local, upstream };
  }
  if (isAncestor(vaultRoot, upstream, local, options)) {
    assertMechanicalCommits(vaultRoot, upstream, local, options);
    return { action: 'ahead', local, upstream };
  }

  const baseResult = runGit(vaultRoot, ['merge-base', local, upstream], options);
  const base = clamp(baseResult.stdout, 80);
  assertMechanicalCommits(vaultRoot, base, local, options);
  const rebase = runGit(vaultRoot, ['rebase', upstream], { ...options, allowFailure: true });
  if (rebase.status !== 0) {
    runGit(vaultRoot, ['rebase', '--abort'], { ...options, allowFailure: true });
    throw new Error('concurrent vault receipt rebase conflicted; manual review required');
  }
  local = refSha(vaultRoot, 'HEAD', options);
  return { action: 'rebase', local, upstream };
}

function nowMs(options) {
  const value = options && options.now;
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return Date.now();
}

function processAlive(pid, options) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  if (options && typeof options.isProcessAlive === 'function') {
    return Boolean(options.isProcessAlive(pid));
  }
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return Boolean(err && err.code === 'EPERM');
  }
}

function lockSnapshot(file, options) {
  try {
    const stat = fs.statSync(file);
    let owner = null;
    try { owner = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { /* malformed is reported below */ }
    const ageMs = Math.max(0, nowMs(options) - stat.mtimeMs);
    const staleMs = Math.max(60 * 1000, Number(options && options.lockStaleMs) || LOCK_STALE_MS);
    const hostname = options && options.hostname || os.hostname();
    const ownerHost = owner && owner.hostname || hostname;
    const alive = Boolean(owner && ownerHost === hostname && processAlive(Number(owner.pid), options));
    return {
      file,
      owner,
      age_ms: Math.round(ageMs),
      stale_after_ms: staleMs,
      reclaimable: ageMs >= staleMs && !alive && ownerHost === hostname,
      inode: stat.ino,
      size: stat.size,
      mtime_ms: stat.mtimeMs,
    };
  } catch (err) {
    if (err && err.code === 'ENOENT') return null;
    throw err;
  }
}

function acquireLock(vaultRoot, options) {
  options = options || {};
  const gitDirResult = runGit(vaultRoot, ['rev-parse', '--git-dir'], options);
  const raw = clamp(gitDirResult.stdout, 1000);
  if (!raw) throw new Error('vault git directory unavailable');
  const gitDir = path.isAbsolute(raw) ? raw : path.join(vaultRoot, raw);
  const file = path.join(gitDir, LOCK_NAME);
  const owner = {
    pid: Number(options.pid) || process.pid,
    hostname: options.hostname || os.hostname(),
    at: new Date(nowMs(options)).toISOString(),
    token: crypto.randomUUID(),
  };
  const create = () => fs.writeFileSync(file, JSON.stringify(owner) + '\n', {
    flag: 'wx',
    mode: 0o600,
  });
  try {
    create();
  } catch (err) {
    if (!err || err.code !== 'EEXIST') throw err;
    const stale = lockSnapshot(file, options);
    if (!stale || !stale.reclaimable) {
      const age = stale ? `${stale.age_ms}ms old` : 'state unavailable';
      throw new Error(`vault sync already running: ${file} (${age})`);
    }
    const current = lockSnapshot(file, options);
    if (!current ||
      current.inode !== stale.inode ||
      current.size !== stale.size ||
      current.mtime_ms !== stale.mtime_ms) {
      throw new Error(`vault sync lock changed during stale-lock review: ${file}`);
    }
    fs.unlinkSync(file);
    try {
      create();
    } catch (retryErr) {
      if (retryErr && retryErr.code === 'EEXIST') {
        throw new Error(`vault sync already running after stale-lock recovery: ${file}`);
      }
      throw retryErr;
    }
  }
  return {
    file,
    owner,
    release() {
      try {
        const current = JSON.parse(fs.readFileSync(file, 'utf8'));
        if (current && current.token === owner.token) fs.unlinkSync(file);
      } catch { /* best effort, but never remove another owner's lock */ }
    },
  };
}

function verifyPushedHead(vaultRoot, remote, branch, local, options) {
  if (!local) throw new Error('vault push local HEAD is unavailable');
  let upstream = remoteSha(vaultRoot, remote, branch, options);
  if (upstream === local) {
    return { local_head: local, remote_head: upstream, remote_advanced: false };
  }

  const remoteRef = `refs/remotes/${remote}/${branch}`;
  runGit(vaultRoot, ['fetch', '--no-tags', remote, `refs/heads/${branch}:${remoteRef}`], options);
  upstream = refSha(vaultRoot, remoteRef, options);
  if (!upstream || !isAncestor(vaultRoot, local, upstream, options)) {
    throw new Error('vault push could not be verified against remote HEAD');
  }
  assertMechanicalCommits(vaultRoot, local, upstream, options);
  runGit(vaultRoot, ['merge', '--ff-only', upstream], options);
  return {
    local_head: refSha(vaultRoot, 'HEAD', options),
    remote_head: upstream,
    remote_advanced: true,
  };
}

function syncVault(vaultRoot, options) {
  options = options || {};
  const resolved = sync.resolveVaultPath(vaultRoot || options.vault);
  if (!resolved) throw new Error('vault not found; set VAULT_PATH or pass --vault <path>');
  const remote = clamp(options.remote || 'origin', 80) || 'origin';
  const branch = clamp(options.branch || 'main', 160) || 'main';
  const currentBranch = clamp(runGit(resolved, ['branch', '--show-current'], options).stdout, 160);
  if (currentBranch !== branch) {
    throw new Error(`vault branch must be ${branch}; found ${currentBranch || 'detached'}`);
  }

  const worktree = inspectWorktree(resolved, options);
  if (!worktree.ok) {
    const names = worktree.disallowed.map((row) => `${row.status} ${row.file}`);
    throw new Error(`vault has non-receipt or mutable changes; refusing sync: ${names.join(', ')}`);
  }
  const before = refSha(resolved, 'HEAD', options);
  const verifiedBefore = verifyReceiptFiles(resolved, worktree.receipt_paths);
  if (options.dryRun) {
    const upstream = remoteSha(resolved, remote, branch, options);
    return {
      ok: Boolean(before && upstream),
      dry_run: true,
      vault: resolved,
      branch,
      remote,
      local_head: before,
      remote_head: upstream,
      receipt_paths: worktree.receipt_paths,
      action: before === upstream
        ? (worktree.receipt_paths.length ? 'would_commit_and_push' : 'up_to_date')
        : 'remote_reconciliation_required',
      verified_receipts: verifiedBefore,
      pushed: false,
    };
  }

  const lock = acquireLock(resolved, options);
  try {
    const reconciliation = reconcileRemote(resolved, remote, branch, options);
    const refreshed = inspectWorktree(resolved, options);
    if (!refreshed.ok) throw new Error('vault changed during sync; refusing to stage');
    const verifiedReceipts = verifyReceiptFiles(resolved, refreshed.receipt_paths);

    if (refreshed.receipt_paths.length) {
      runGit(resolved, ['add', '--', ...refreshed.receipt_paths], options);
      const staged = runGit(resolved, ['diff', '--cached', '--name-only', '-z'], options);
      const stagedPaths = String(staged.stdout || '').split('\0').filter(Boolean);
      const disallowed = stagedPaths.filter((file) => !isAllowedReceiptPath(file));
      if (disallowed.length) throw new Error(`staging escaped receipt allowlist: ${disallowed.join(', ')}`);
      if (stagedPaths.length) {
        runGit(resolved, ['commit', '-m', 'chore(agent-sync): publish device receipts'], options);
      }
    }

    let attempts = 0;
    let push = null;
    while (attempts < 3) {
      attempts++;
      push = runGit(resolved, ['push', remote, `HEAD:refs/heads/${branch}`], {
        ...options,
        allowFailure: true,
        timeout: options.remoteTimeout || 30000,
      });
      if (push.status === 0) break;
      reconcileRemote(resolved, remote, branch, options);
    }
    if (!push || push.status !== 0) {
      throw new Error(`vault push failed after ${attempts} safe attempts: ${clamp(push && push.stderr, 1200) || 'unknown error'}`);
    }

    const verification = verifyPushedHead(
      resolved,
      remote,
      branch,
      refSha(resolved, 'HEAD', options),
      options
    );
    return {
      ok: true,
      dry_run: false,
      vault: resolved,
      branch,
      remote,
      local_head: verification.local_head,
      remote_head: verification.remote_head,
      remote_advanced: verification.remote_advanced,
      receipt_paths: refreshed.receipt_paths,
      verified_receipts: verifiedReceipts,
      action: refreshed.receipt_paths.length ? 'committed_and_pushed' : reconciliation.action,
      attempts,
      pushed: true,
    };
  } finally {
    lock.release();
  }
}

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith('--')) out._.push(arg);
    else {
      const key = arg.slice(2);
      out[key] = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true;
    }
  }
  return out;
}

function command(argv, options) {
  const args = parseArgs(argv || []);
  if (args.help || args._[0] === 'help') {
    return [
      'Usage: agent-sync-vault-git.js sync [--vault <path>] [--remote origin] [--branch main] [--dry-run] [--json]',
      'Only append-only 30-learnings/agent-sync/** receipts are allowed.',
      '',
    ].join('\n');
  }
  const result = syncVault(args.vault, {
    ...options,
    remote: args.remote,
    branch: args.branch,
    dryRun: Boolean(args['dry-run']),
  });
  if (args.json) return JSON.stringify(result, null, 2) + '\n';
  return [
    '# Mooter Vault Git Sync',
    '',
    `VAULT_REMOTE=${result.ok ? (result.dry_run ? 'dry_run_pass' : 'pass') : 'fail'}`,
    `action: ${result.action}`,
    `vault: ${result.vault}`,
    `branch: ${result.branch}`,
    `local_head: ${result.local_head || 'n/d'}`,
    `remote_head: ${result.remote_head || 'n/d'}`,
    `receipts: ${result.receipt_paths.length}`,
    `pushed: ${result.pushed}`,
    '',
  ].join('\n');
}

module.exports = {
  RECEIPT_PREFIX,
  isAllowedReceiptPath,
  parsePorcelainZ,
  inspectWorktree,
  verifyReceiptFiles,
  committedPaths,
  assertMechanicalCommits,
  reconcileRemote,
  lockSnapshot,
  acquireLock,
  verifyPushedHead,
  syncVault,
  command,
};

if (require.main === module) {
  try {
    process.stdout.write(command(process.argv.slice(2)));
  } catch (err) {
    process.stderr.write((err && err.message ? err.message : String(err)) + '\n');
    process.exitCode = 1;
  }
}
