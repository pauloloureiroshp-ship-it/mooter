#!/usr/bin/env node
// @mooter/cli — npm installer for mooter (https://mooter.ai).
//
// `npm i -g @mooter/cli && mooter-install` (or `npx @mooter/cli`) clones the
// public repo and runs the official installer. The real runtime lives in
// ~/.claude/tools/router + ~/.mooter after install; this package is just the
// front door. MIT.

'use strict';

const { execSync } = require('child_process');
const os = require('os');
const fs = require('fs');
const path = require('path');

const REPO = 'https://github.com/pauloloureiroshp-ship-it/mooter.git';

function main() {
  console.log('\n  🐄 mooter — intelligent model routing for Claude Code\n');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mooter-install-'));
  const dir = path.join(tmp, 'mooter');
  try {
    console.log('  Fetching latest release...');
    execSync(`git clone --depth 1 --branch main ${REPO} "${dir}"`, { stdio: 'inherit' });
    if (process.platform === 'win32') {
      console.log('  Running installer (PowerShell)...\n');
      execSync(`powershell -ExecutionPolicy Bypass -File "${path.join(dir, 'install.ps1')}"`, { stdio: 'inherit' });
    } else {
      console.log('  Running installer...\n');
      execSync(`bash "${path.join(dir, 'install.sh')}"`, { stdio: 'inherit', cwd: dir });
    }
  } catch (err) {
    console.error('\n  Install failed:', err.message);
    console.error('  Manual install: https://mooter.ai/install\n');
    process.exit(1);
  }
}

main();
