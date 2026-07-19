#!/usr/bin/env node
'use strict';

// orphan-watch — FC-3/FC-4 guard.
// Reads every registered worktree and reports working files whose filesystem
// mtime is older than the configured threshold. Git does not retain the age of
// deletions, so those remain explicit `age_hours: null` instead of a guess.

const fs = require('node:fs');
const path = require('node:path');
const { listWorktrees, parseStatusZ, runGit } = require('./mesh-git');

const DEFAULT_THRESHOLD_HOURS = 24;

function safeWorktreePath(root, relPath) {
  const target = path.resolve(root, String(relPath || '').split('/').join(path.sep));
  const relative = path.relative(path.resolve(root), target);
  if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) return null;
  return target;
}

function fileAgeHours(file, nowMs, stat = fs.statSync) {
  try {
    const info = stat(file);
    if (!Number.isFinite(info.mtimeMs)) return null;
    return Math.max(0, (nowMs - info.mtimeMs) / 3_600_000);
  } catch {
    return null;
  }
}

function checkOrphans(opts = {}) {
  const root = path.resolve(opts.root || process.cwd());
  const nowMs = Number.isFinite(opts.nowMs) ? opts.nowMs : Date.now();
  const configured = Number(opts.thresholdHours ?? process.env.MOOTER_ORPHAN_HOURS);
  const thresholdHours = Number.isFinite(configured) && configured > 0
    ? configured
    : DEFAULT_THRESHOLD_HOURS;
  const exec = opts.runGit || runGit;
  const worktrees = listWorktrees(root, { ...opts, runGit: exec });
  const findings = [];
  const errors = [];
  let dirtyPaths = 0;
  let unageablePaths = 0;

  for (const worktree of worktrees) {
    if (!worktree.path || worktree.bare || worktree.prunable) continue;
    let entries;
    try {
      entries = parseStatusZ(exec(worktree.path, [
        'status', '--porcelain=v1', '-z', '--untracked-files=all',
      ], opts));
    } catch (error) {
      errors.push({ worktree: worktree.path, error: error.message });
      continue;
    }
    dirtyPaths += entries.length;
    for (const entry of entries) {
      const absolute = safeWorktreePath(worktree.path, entry.path);
      const ageHours = absolute
        ? fileAgeHours(absolute, nowMs, opts.stat || fs.statSync)
        : null;
      if (ageHours === null) {
        unageablePaths++;
        continue;
      }
      if (ageHours <= thresholdHours) continue;
      findings.push({
        worktree: worktree.path,
        branch: worktree.branch,
        status: entry.xy,
        path: entry.path,
        age_hours: Math.round(ageHours * 10) / 10,
        threshold_hours: thresholdHours,
      });
    }
  }

  return {
    checker: 'orphan-watch',
    layer: 'L0',
    ok: findings.length === 0 && errors.length === 0,
    threshold_hours: thresholdHours,
    worktrees_scanned: worktrees.filter((w) => !w.bare && !w.prunable).length,
    dirty_paths: dirtyPaths,
    unageable_paths: unageablePaths,
    findings,
    errors,
    doctor: {
      k: 'orphan-watch',
      t: 'Uncommitted/untracked worktree age',
      ok: findings.length === 0 && errors.length === 0,
      fix: '',
      detail: findings.length
        ? `${findings.length} path(s) older than ${thresholdHours}h`
        : `${dirtyPaths} dirty path(s); no age breach measured`,
    },
  };
}

module.exports = { DEFAULT_THRESHOLD_HOURS, fileAgeHours, safeWorktreePath, checkOrphans };

if (require.main === module) {
  const result = checkOrphans({ root: process.argv[2] || process.cwd() });
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  if (!result.ok) process.exitCode = 2;
}
