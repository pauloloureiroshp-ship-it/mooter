'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '../..');

test('Mac/Linux installer converges a fresh profile without changing its canonical device id', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'mooter-install-e2e-'));
  const bin = path.join(home, 'fake-bin');
  fs.mkdirSync(path.join(home, '.claude'), { recursive: true });
  fs.mkdirSync(path.join(home, '.mooter'), { recursive: true });
  fs.mkdirSync(bin, { recursive: true });
  fs.writeFileSync(path.join(home, '.mooter', 'device.id'), 'stable-device-id\n');
  fs.symlinkSync(process.execPath, path.join(bin, 'node'));
  fs.writeFileSync(path.join(bin, 'claude'), '#!/bin/sh\nexit 0\n', { mode: 0o755 });

  const env = {
    ...process.env,
    HOME: home,
    CLAUDE_DIR: path.join(home, '.claude'),
    PATH: [bin, '/usr/bin', '/bin', '/usr/sbin', '/sbin'].join(path.delimiter),
    MOOTER_HUB_URL: 'http://127.0.0.1:1',
    MOOTER_NO_PULL: '1',
  };
  try {
    for (let attempt = 0; attempt < 2; attempt++) {
      const run = spawnSync('/bin/bash', [path.join(ROOT, 'install.sh'), '--no-path'], {
        cwd: ROOT,
        env,
        encoding: 'utf8',
        timeout: 30000,
      });
      assert.equal(run.status, 0, `installer attempt ${attempt + 1}: ${run.stderr}\n${run.stdout}`);
    }

    assert.equal(fs.readFileSync(path.join(home, '.mooter', 'device.id'), 'utf8'), 'stable-device-id\n');
    assert.equal(fs.existsSync(path.join(home, '.frugal', 'device.id')), false, 'no second legacy identity');
    assert.equal(fs.existsSync(path.join(home, '.claude', 'tools', 'router', 'agent-sync-ledger.js')), true);
    assert.equal(fs.existsSync(path.join(home, '.claude', 'hooks', 'gsd-turn-end.js')), true);
    assert.equal(fs.existsSync(path.join(home, '.claude', 'skills', 'agent-sync', 'SKILL.md')), true);

    const settings = JSON.parse(fs.readFileSync(path.join(home, '.claude', 'settings.json'), 'utf8'));
    const hooks = JSON.stringify(settings.hooks || {});
    assert.match(hooks, /gsd-turn-end\.js/);
    assert.match(hooks, /live-preview-tap\.js/);
    assert.match(hooks, new RegExp(process.execPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), 'hooks pin the working Node executable');
    assert.equal((hooks.match(/gsd-turn-end\.js/g) || []).length, 1, 'reinstall does not duplicate Stop hook');
    const shim = fs.readFileSync(path.join(home, '.local', 'bin', 'mooter'), 'utf8');
    assert.match(shim, /NODE_BIN=".*fake-bin\/node"/, 'shim does not depend on the future shell PATH');
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});
