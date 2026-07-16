'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const SCRIPT = path.join(__dirname, 'no-frugal-ratchet.js');

function git(cwd, ...args) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
  assert.equal(result.status, 0, `git ${args.join(' ')} failed: ${result.stderr}`);
  return result.stdout.trim();
}

function commit(cwd, message) {
  git(cwd, 'add', 'tools');
  git(cwd, '-c', 'user.name=Ratchet Test', '-c', 'user.email=ratchet@example.invalid', 'commit', '-m', message);
  return git(cwd, 'rev-parse', 'HEAD');
}

function fixture() {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'mooter-no-frugal-'));
  git(cwd, 'init');
  fs.mkdirSync(path.join(cwd, 'tools'));
  fs.writeFileSync(path.join(cwd, 'tools', 'existing.js'), 'const legacyBrand = "frugal";\n');
  const base = commit(cwd, 'base');
  return { cwd, base };
}

test('one added tracked live-code file fails the ratchet', () => {
  const { cwd, base } = fixture();
  try {
    fs.writeFileSync(path.join(cwd, 'tools', 'regression.js'), 'export const brand = "FRUGAL";\n');
    commit(cwd, 'add regression');
    const result = spawnSync(process.execPath, [SCRIPT, '--base', base, '--head', 'HEAD'], { cwd, encoding: 'utf8' });
    assert.equal(result.status, 1, `expected strict failure, got stdout=${result.stdout} stderr=${result.stderr}`);
    assert.match(result.stdout, /1 .* -> 2 /);
    assert.match(result.stderr, /frugal references INCREASED \(2 > 1\)/);
    assert.match(result.stderr, /tools\/regression\.js/);
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});

test('untracked build artifacts cannot change the Git-tree count', () => {
  const { cwd, base } = fixture();
  try {
    fs.writeFileSync(path.join(cwd, 'tools', 'untracked-build.js'), 'frugal\n');
    const result = spawnSync(process.execPath, [SCRIPT, '--base', base, '--head', 'HEAD'], { cwd, encoding: 'utf8' });
    assert.equal(result.status, 0, `tracked tree is unchanged: ${result.stderr}`);
    assert.match(result.stdout, /1 .* -> 1 /);
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});
