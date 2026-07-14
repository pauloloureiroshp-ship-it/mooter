'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Dev = require('./lp-dev-server.js');

test('resolveDevTarget selects landing when the root package has no dev script', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lp-dev-target-'));
  try {
    fs.mkdirSync(path.join(root, 'landing'));
    fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ private: true }));
    fs.writeFileSync(path.join(root, 'landing', 'package.json'), JSON.stringify({ scripts: { dev: 'next dev -p 7819' } }));
    const target = Dev.resolveDevTarget(root);
    assert.strictEqual(target.cwd, path.join(root, 'landing'));
    assert.strictEqual(target.relativeDir, 'landing');
    assert.strictEqual(target.command, 'npm run dev');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('resolveDevTarget falls back to a root dev script and returns null without one', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lp-dev-root-'));
  try {
    fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ scripts: { dev: 'vite' } }));
    assert.strictEqual(Dev.resolveDevTarget(root).cwd, root);
    fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ scripts: { test: 'node --test' } }));
    assert.strictEqual(Dev.resolveDevTarget(root), null);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('restartShell is explicit about the port and always ends by starting the dev script', () => {
  const target = path.resolve('project', 'landing');
  const win = Dev.restartShell(7819, 'win32', target);
  assert.strictEqual(win.shellPath, 'powershell.exe');
  assert.match(win.command, /Get-NetTCPConnection -LocalPort 7819/);
  assert.match(win.command, /Get-CimInstance/);
  assert.match(win.command, /CommandLine\.IndexOf/);
  assert.strictEqual(win.ownershipScoped, true);
  assert.match(win.command, /npm run dev$/);
  const posix = Dev.restartShell(7819, 'linux', target);
  assert.strictEqual(posix.shellPath, '/bin/sh');
  assert.match(posix.command, /lsof -tiTCP:7819 -sTCP:LISTEN/);
  assert.match(posix.command, /-d cwd/);
  assert.match(posix.command, /mooter_target/);
  assert.strictEqual(posix.ownershipScoped, true);
  assert.match(posix.command, /npm run dev$/);
});

test('restartShell without a proven target cwd never kills a listener', () => {
  for (const platform of ['win32', 'linux']) {
    const result = Dev.restartShell(7819, platform, null);
    assert.strictEqual(result.command, 'npm run dev');
    assert.strictEqual(result.stopsPort, false);
    assert.strictEqual(result.ownershipScoped, true);
  }
});

test('restartShell quotes target paths instead of allowing shell injection', () => {
  const hostile = path.resolve("project's; landing");
  const win = Dev.restartShell(7819, 'win32', hostile);
  const posix = Dev.restartShell(7819, 'linux', hostile);
  assert.ok(win.command.includes(Dev.psQuote(hostile)));
  assert.ok(posix.command.includes(Dev.shQuote(hostile)));
});
