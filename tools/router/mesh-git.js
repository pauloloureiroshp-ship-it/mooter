'use strict';

// Shared, read-only Git plumbing for the Harmony Mesh L0 checkers.
// Keep raw Git calls in one place so worktree discovery/status parsing cannot
// drift into four subtly different implementations.

const childProcess = require('node:child_process');

function runGit(root, args, opts = {}) {
  const command = opts.gitBin || process.env.MOOTER_GIT_BIN || 'git';
  const result = childProcess.spawnSync(command, ['-C', root, ...args], {
    encoding: 'utf8',
    timeout: opts.timeoutMs || 10_000,
    maxBuffer: opts.maxBuffer || 8 * 1024 * 1024,
    windowsHide: true,
  });
  if (result.error || result.status !== 0) {
    const detail = result.error && result.error.message
      ? result.error.message
      : String(result.stderr || '').trim() || `git exited ${result.status}`;
    const error = new Error(detail);
    error.status = result.status;
    throw error;
  }
  return String(result.stdout || '');
}

function parseWorktreeList(text) {
  const out = [];
  let current = null;
  for (const line of String(text || '').replace(/\r\n?/g, '\n').split('\n')) {
    if (line.startsWith('worktree ')) {
      if (current) out.push(current);
      current = { path: line.slice(9), head: null, branch: null, bare: false, prunable: false };
    } else if (!current) {
      continue;
    } else if (line.startsWith('HEAD ')) {
      current.head = line.slice(5);
    } else if (line.startsWith('branch ')) {
      current.branch = line.slice(7).replace(/^refs\/heads\//, '');
    } else if (line === 'bare') {
      current.bare = true;
    } else if (line.startsWith('prunable')) {
      current.prunable = true;
    }
  }
  if (current) out.push(current);
  return out;
}

function listWorktrees(root, opts = {}) {
  if (Array.isArray(opts.worktrees)) return opts.worktrees;
  const exec = opts.runGit || runGit;
  return parseWorktreeList(exec(root, ['worktree', 'list', '--porcelain'], opts));
}

function parseStatusZ(text) {
  const tokens = String(text || '').split('\0');
  const out = [];
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (!token || token.length < 4) continue;
    const xy = token.slice(0, 2);
    const relPath = token.slice(3);
    const renamed = /[RC]/.test(xy);
    const originalPath = renamed && tokens[i + 1] ? tokens[++i] : null;
    out.push({ xy, path: relPath, original_path: originalPath });
  }
  return out;
}

module.exports = { runGit, parseWorktreeList, listWorktrees, parseStatusZ };
