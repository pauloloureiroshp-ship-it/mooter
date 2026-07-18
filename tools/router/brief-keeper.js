#!/usr/bin/env node
'use strict';

// brief-keeper — FC-5 guard.
// The agent-sync ledger owns brief generation. This checker only preserves
// already-generated Markdown briefs from sibling/gitignored worktrees in the
// primary worktree. It never overwrites divergent content.

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const agentSync = require('./agent-sync-ledger');
const { listWorktrees } = require('./mesh-git');

function digest(data) {
  return crypto.createHash('sha256').update(data).digest('hex');
}

function samePath(a, b) {
  const left = path.resolve(a);
  const right = path.resolve(b);
  return process.platform === 'win32' ? left.toLowerCase() === right.toLowerCase() : left === right;
}

function uniqueDirs(dirs) {
  const out = [];
  for (const dir of dirs) {
    if (!dir || out.some((known) => samePath(known, dir))) continue;
    out.push(dir);
  }
  return out;
}

function sourceBriefDirs(worktrees) {
  const dirs = [];
  for (const worktree of worktrees) {
    if (!worktree.path || worktree.bare || worktree.prunable) continue;
    dirs.push(path.join(worktree.path, '_handoff', 'agent-sync', 'briefs'));
    dirs.push(agentSync.paths(worktree.path).briefsDir);
  }
  return uniqueDirs(dirs);
}

function keeperDestination(targetDir, name, data) {
  const direct = path.join(targetDir, path.basename(name));
  try {
    const current = fs.readFileSync(direct);
    if (digest(current) === digest(data)) return { path: direct, state: 'identical' };
  } catch {
    return { path: direct, state: 'new' };
  }
  const parsed = path.parse(direct);
  return { path: path.join(parsed.dir, `${parsed.name}-${digest(data).slice(0, 8)}${parsed.ext}`), state: 'conflict' };
}

function keepBriefs(opts = {}) {
  const root = path.resolve(opts.root || process.cwd());
  let worktrees;
  try { worktrees = opts.worktrees || listWorktrees(root, opts); }
  catch (error) {
    return {
      checker: 'brief-keeper', layer: 'L0', ok: false, copied: [], skipped: [], conflicts: [],
      errors: [{ error: error.message }],
      doctor: { k: 'brief-keeper', t: 'Preserve gitignored briefs', ok: false, fix: '', detail: 'worktree discovery failed' },
    };
  }
  const targetRoot = path.resolve(opts.targetRoot || (worktrees[0] && worktrees[0].path) || root);
  const targetDir = path.resolve(opts.targetDir || path.join(targetRoot, '_handoff', 'agent-sync', 'briefs'));
  const sources = uniqueDirs(opts.sourceDirs || sourceBriefDirs(worktrees));
  const copied = [];
  const skipped = [];
  const conflicts = [];
  const errors = [];

  for (const sourceDir of sources) {
    if (samePath(sourceDir, targetDir)) continue;
    let entries;
    try { entries = fs.readdirSync(sourceDir, { withFileTypes: true }); }
    catch { continue; }
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.toLowerCase().endsWith('.md')) continue;
      const source = path.join(sourceDir, entry.name);
      let data;
      try { data = fs.readFileSync(source); }
      catch (error) { errors.push({ source, error: error.message }); continue; }
      const destination = keeperDestination(targetDir, entry.name, data);
      if (destination.state === 'identical') {
        skipped.push({ source, destination: destination.path, reason: 'identical' });
        continue;
      }
      if (destination.state === 'conflict') conflicts.push({ source, destination: destination.path });
      if (!opts.dryRun) {
        try {
          fs.mkdirSync(targetDir, { recursive: true });
          try { fs.writeFileSync(destination.path, data, { flag: 'wx', mode: 0o600 }); }
          catch (error) {
            if (error.code !== 'EEXIST' || digest(fs.readFileSync(destination.path)) !== digest(data)) throw error;
          }
        } catch (error) { errors.push({ source, destination: destination.path, error: error.message }); continue; }
      }
      copied.push({ source, destination: destination.path, dry_run: !!opts.dryRun });
    }
  }

  return {
    checker: 'brief-keeper',
    layer: 'L0',
    ok: errors.length === 0,
    primary_worktree: targetRoot,
    target_dir: targetDir,
    sources_scanned: sources.length,
    copied,
    skipped,
    conflicts,
    errors,
    doctor: {
      k: 'brief-keeper',
      t: 'Preserve gitignored briefs',
      ok: errors.length === 0,
      fix: '',
      detail: `${copied.length} copied; ${skipped.length} already durable; ${conflicts.length} collision(s) preserved`,
    },
  };
}

module.exports = { digest, sourceBriefDirs, keeperDestination, keepBriefs };

if (require.main === module) {
  const args = process.argv.slice(2);
  const root = args.find((arg) => !arg.startsWith('--')) || process.cwd();
  const result = keepBriefs({ root, dryRun: args.includes('--dry-run') });
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  if (!result.ok) process.exitCode = 2;
}
