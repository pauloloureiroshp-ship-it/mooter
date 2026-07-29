'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const installer = require('./install-agent-sync-autosync.js');

function write(root, rel, text) {
  const file = path.join(root, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
  return file;
}

function fixture() {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'mooter-autosync-'));
  const vault = path.join(home, 'paulo-vault');
  write(vault, 'AGENTS.md', '# Vault\n');
  write(vault, '00-core/agent-sync-protocol.md', '# Protocol\n');
  write(vault, '10-projects/mooter.md', '# Mooter\n');
  const script = write(home, '.claude/tools/router/agent-sync-vault-git.js', '#!/usr/bin/env node\n');
  return { home, vault, script };
}

test('macOS autosync dry-run renders a path-safe five-minute LaunchAgent without writing', () => {
  const fx = fixture();
  try {
    const result = installer.install({
      home: fx.home,
      vault: fx.vault,
      script: fx.script,
      node: process.execPath,
      platform: 'darwin',
      dryRun: true,
    });
    assert.equal(result.ok, true);
    assert.equal(result.dry_run, true);
    assert.equal(fs.existsSync(result.file), false);
    assert.match(result.content, /StartInterval/);
    assert.match(result.content, /<integer>300<\/integer>/);
    assert.match(result.content, /agent-sync-vault-git\.js/);
    assert.match(result.content, /--vault/);
  } finally {
    fs.rmSync(fx.home, { recursive: true, force: true });
  }
});

test('Linux and Windows scheduler projections use the identical vault sync runtime', () => {
  const fx = fixture();
  try {
    const linux = installer.install({
      home: fx.home,
      vault: fx.vault,
      script: fx.script,
      node: process.execPath,
      platform: 'linux',
      dryRun: true,
    });
    const windows = installer.install({
      home: fx.home,
      vault: fx.vault,
      script: fx.script,
      node: process.execPath,
      platform: 'win32',
      dryRun: true,
    });
    assert.match(linux.content.service, /agent-sync-vault-git\.js" sync --vault/);
    assert.match(linux.content.timer, /OnUnitActiveSec=300s/);
    assert.match(windows.content, /agent-sync-vault-git\.js" sync --vault/);
    assert.equal(fs.existsSync(windows.file), false);
  } finally {
    fs.rmSync(fx.home, { recursive: true, force: true });
  }
});

test('scheduler interval is clamped to safe operational bounds', () => {
  const fx = fixture();
  try {
    assert.equal(installer.buildConfig({
      home: fx.home,
      vault: fx.vault,
      script: fx.script,
      interval: 1,
    }).interval, 60);
    assert.equal(installer.buildConfig({
      home: fx.home,
      vault: fx.vault,
      script: fx.script,
      interval: 99999,
    }).interval, 3600);
  } finally {
    fs.rmSync(fx.home, { recursive: true, force: true });
  }
});
