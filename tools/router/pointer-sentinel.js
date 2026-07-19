#!/usr/bin/env node
'use strict';

// pointer-sentinel — FC-1/FC-6 guard.
// The parser and path:line validator live in handoff-preflight so pre-handoff
// validation and the scheduled mesh share one definition of a valid pointer.

const path = require('node:path');
const { pointerSourceFiles, validatePointers } = require('../handoff-preflight');

function checkPointers(opts = {}) {
  const root = path.resolve(opts.root || process.cwd());
  const verdict = validatePointers({
    ...opts,
    root,
    files: opts.files || pointerSourceFiles(root),
  });
  return {
    checker: 'pointer-sentinel',
    layer: 'L0',
    ...verdict,
    doctor: {
      k: 'pointer-sentinel',
      t: 'Repo and path:line pointers',
      ok: verdict.ok,
      fix: '',
      detail: verdict.ok
        ? `${verdict.pointers_checked} pointer(s) resolved`
        : `${verdict.findings.length} dead or invalid pointer(s)`,
    },
  };
}

module.exports = { checkPointers };

if (require.main === module) {
  const result = checkPointers({ root: process.argv[2] || process.cwd() });
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  if (!result.ok) process.exitCode = 2;
}
