#!/usr/bin/env node
'use strict';

// projection-drift — flags when SYNC.md's mechanical claims no longer match
// Git. It never edits SYNC.md: the projection has a human/reducer-owned writer.

const fs = require('node:fs');
const path = require('node:path');
const { listWorktrees, runGit } = require('./mesh-git');

function parseSyncProjection(text) {
  const source = String(text || '');
  const mainSha = source.match(/GitHub\s+`main`\s+@\*\*\s+`([0-9a-f]{7,40})`/i)
    || source.match(/GitHub[^\n@]*@[^\n`]*`([0-9a-f]{7,40})`/i);
  const extension = source.match(/extens[aã]o em main:\*\*\s+`?v?(\d+\.\d+\.\d+)/i);
  const registered = source.match(/\|\s*\*\*Registrados\*\*\s*\|\s*\*\*(\d+)\*\*/i);
  const updated = source.match(/\*\*Atualizado:\*\*\s*(\d{4}-\d{2}-\d{2})/i);
  return {
    main_sha: mainSha ? mainSha[1] : null,
    extension_version: extension ? extension[1] : null,
    registered_worktrees: registered ? Number(registered[1]) : null,
    updated_at: updated ? updated[1] : null,
  };
}

function actualGitProjection(root, opts = {}) {
  const exec = opts.runGit || runGit;
  const mainRef = opts.mainRef || 'origin/main';
  const mainSha = exec(root, ['rev-parse', mainRef], opts).trim();
  let extensionVersion = null;
  try {
    const raw = exec(root, ['show', `${mainRef}:packages/vscode-extension/package.json`], opts);
    extensionVersion = JSON.parse(raw).version || null;
  } catch { /* version remains honest n/d */ }
  const worktrees = listWorktrees(root, { ...opts, runGit: exec });
  return {
    main_ref: mainRef,
    main_sha: mainSha || null,
    extension_version: extensionVersion,
    registered_worktrees: worktrees.length,
  };
}

function checkProjectionDrift(opts = {}) {
  const root = path.resolve(opts.root || process.cwd());
  const syncFile = opts.syncFile || path.join(root, 'SYNC.md');
  let declared;
  try { declared = parseSyncProjection((opts.readFile || fs.readFileSync)(syncFile, 'utf8')); }
  catch (error) {
    return {
      checker: 'projection-drift', layer: 'L0', ok: false,
      declared: null, actual: null,
      findings: [{ claim: 'SYNC.md', declared: null, actual: null, reason: `unreadable: ${error.message}` }],
      doctor: { k: 'projection-drift', t: 'SYNC.md vs Git', ok: false, fix: '', detail: 'SYNC.md unreadable' },
    };
  }

  let actual;
  try { actual = opts.actual || actualGitProjection(root, opts); }
  catch (error) {
    return {
      checker: 'projection-drift', layer: 'L0', ok: false,
      declared, actual: null,
      findings: [{ claim: 'git', declared: null, actual: null, reason: `unavailable: ${error.message}` }],
      doctor: { k: 'projection-drift', t: 'SYNC.md vs Git', ok: false, fix: '', detail: 'Git truth unavailable' },
    };
  }

  const findings = [];
  if (declared.main_sha && actual.main_sha && !actual.main_sha.startsWith(declared.main_sha)) {
    findings.push({ claim: 'main_sha', declared: declared.main_sha, actual: actual.main_sha });
  }
  if (declared.extension_version && actual.extension_version && declared.extension_version !== actual.extension_version) {
    findings.push({ claim: 'extension_version', declared: declared.extension_version, actual: actual.extension_version });
  }
  if (Number.isFinite(declared.registered_worktrees) && declared.registered_worktrees !== actual.registered_worktrees) {
    findings.push({ claim: 'registered_worktrees', declared: declared.registered_worktrees, actual: actual.registered_worktrees });
  }
  return {
    checker: 'projection-drift',
    layer: 'L0',
    ok: findings.length === 0,
    declared,
    actual,
    findings,
    doctor: {
      k: 'projection-drift',
      t: 'SYNC.md vs Git',
      ok: findings.length === 0,
      fix: '',
      detail: findings.length ? `${findings.length} mechanical claim(s) drifted` : 'mechanical claims match Git',
    },
  };
}

module.exports = { parseSyncProjection, actualGitProjection, checkProjectionDrift };

if (require.main === module) {
  const result = checkProjectionDrift({ root: process.argv[2] || process.cwd() });
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  if (!result.ok) process.exitCode = 2;
}
