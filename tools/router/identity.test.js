#!/usr/bin/env node
/**
 * identity.test.js — W1 migration acceptance tests (Kill Frugal).
 * Run: node tools/router/identity.test.js   (uses a temp HOME)
 */
'use strict';
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const RUNNER = `
  const id = require(process.env.IDENTITY_MOD);
  console.log(JSON.stringify({ deviceId: id.readDeviceId(), ensured: id.ensureDeviceId() }));
`;

function withTempHome(setup) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'mooter-id-test-'));
  setup(home);
  const out = execFileSync(process.execPath, ['-e', RUNNER], {
    env: { ...process.env, HOME: home, USERPROFILE: home, IDENTITY_MOD: path.resolve(__dirname, 'identity.js') },
    encoding: 'utf8',
  });
  return { home, result: JSON.parse(out.trim().split('\n').pop()) };
}

let failures = 0;
function check(name, cond) {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}`);
  if (!cond) failures++;
}

// (a) fresh install — no ~/.frugal: id generated under ~/.mooter
{
  const { home, result } = withTempHome(() => {});
  check('fresh: no legacy id read', result.deviceId === null);
  check('fresh: id generated', /^[0-9a-f-]{36}$/.test(result.ensured));
  check('fresh: lives in ~/.mooter', fs.existsSync(path.join(home, '.mooter', 'device.id')));
}

// (b) upgrade — legacy device.id is preserved byte-for-byte and moved
{
  const LEGACY_ID = '41c9d48c-f40a-4a80-a764-c76a784fc9e0';
  const { home, result } = withTempHome((h) => {
    fs.mkdirSync(path.join(h, '.frugal'), { recursive: true });
    fs.writeFileSync(path.join(h, '.frugal', 'device.id'), LEGACY_ID + '\n');
  });
  check('upgrade: id preserved', result.deviceId === LEGACY_ID && result.ensured === LEGACY_ID);
  check('upgrade: moved to ~/.mooter', fs.readFileSync(path.join(home, '.mooter', 'device.id'), 'utf8').trim() === LEGACY_ID);
  check('upgrade: legacy file gone', !fs.existsSync(path.join(home, '.frugal', 'device.id')));
  check('upgrade: empty ~/.frugal removed', !fs.existsSync(path.join(home, '.frugal')));
}

// (c) both exist — ~/.mooter wins, legacy discarded
{
  const NEW_ID = 'b14321f5-0000-4719-9a32-d9d4e25b0e84';
  const { home, result } = withTempHome((h) => {
    fs.mkdirSync(path.join(h, '.frugal'), { recursive: true });
    fs.mkdirSync(path.join(h, '.mooter'), { recursive: true });
    fs.writeFileSync(path.join(h, '.frugal', 'device.id'), 'old-stale-id\n');
    fs.writeFileSync(path.join(h, '.mooter', 'device.id'), NEW_ID + '\n');
  });
  check('both: ~/.mooter wins', result.deviceId === NEW_ID);
  check('both: stale legacy removed', !fs.existsSync(path.join(home, '.frugal', 'device.id')));
}

// (d) other migratable files travel together
{
  const { home } = withTempHome((h) => {
    fs.mkdirSync(path.join(h, '.frugal'), { recursive: true });
    fs.writeFileSync(path.join(h, '.frugal', 'auth.token'), 'tok123\n');
    fs.writeFileSync(path.join(h, '.frugal', 'user.hash'), 'abcd1234abcd1234\n');
  });
  check('bundle: auth.token migrated', fs.readFileSync(path.join(home, '.mooter', 'auth.token'), 'utf8').trim() === 'tok123');
  check('bundle: user.hash migrated', fs.existsSync(path.join(home, '.mooter', 'user.hash')));
}

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
