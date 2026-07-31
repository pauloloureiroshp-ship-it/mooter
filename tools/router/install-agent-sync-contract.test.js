'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '../..');

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

test('Mac/Linux installers preserve one canonical device identity and install sync skills', () => {
  for (const rel of ['install.sh', 'landing/public/install.sh']) {
    const body = read(rel);
    assert.match(body, /DEVICE_DIR="\$MOOTER_DIR"/, `${rel} writes canonical identity`);
    assert.match(body, /LEGACY_DEVICE_FILE="\$HOME\/\.frugal\/device\.id"/, `${rel} preserves legacy identity`);
    assert.match(body, /SRC_DIR\/\.claude\/skills/, `${rel} copies versioned product skills`);
    assert.match(body, /Created empty settings\.json/, `${rel} wires hooks on a fresh profile`);
    assert.match(body, /live-preview-tap\.js/, `${rel} mirrors the complete wired hook set`);
    assert.doesNotMatch(body, /DEVICE_DIR="\$HOME\/\.frugal"/, `${rel} never mints a second legacy identity`);
  }
});

test('Windows installers preserve one canonical device identity and install sync skills', () => {
  for (const rel of ['install.ps1', 'landing/public/install.ps1']) {
    const body = read(rel);
    assert.match(body, /\$DeviceDir\s*=\s*\$MooterDir/, `${rel} writes canonical identity`);
    assert.match(body, /LegacyDeviceIdFile.*\.frugal\\device\.id/, `${rel} preserves legacy identity`);
    assert.match(body, /\.claude\\skills/, `${rel} copies versioned product skills`);
    assert.match(body, /Create empty settings\.json/, `${rel} wires hooks on a fresh profile`);
    assert.match(body, /live-preview-tap\.js/, `${rel} mirrors the complete wired hook set`);
    assert.doesNotMatch(body, /\$DeviceDir\s*=\s*Join-Path \$HOME "\.frugal"/, `${rel} never mints a second legacy identity`);
  }
});

test('runtime diagnostics prefer canonical identity with an explicit legacy fallback', () => {
  const doctor = read('tools/router/mooter-doctor.js');
  const preflight = read('tools/audit/preflight-audit.js');
  assert.match(doctor, /path\.join\(MOOTER_DIR, 'device\.id'\)/);
  assert.match(doctor, /legacyDeviceIdPath/);
  assert.match(preflight, /canonicalDeviceIdPath/);
  assert.match(preflight, /legacyDeviceIdPath/);
});
