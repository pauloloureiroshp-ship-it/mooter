'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const broker = require('./broker.js');

function withHome(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pmadapt-brk-'));
  const prev = process.env.MOOTER_HOME;
  process.env.MOOTER_HOME = dir;
  try { return fn(dir); }
  finally {
    if (prev === undefined) delete process.env.MOOTER_HOME; else process.env.MOOTER_HOME = prev;
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
  }
}

test('no token by default', () => {
  withHome(() => {
    for (const t of ['github', 'notion', 'linear', 'slack']) assert.equal(broker.hasToken(t), false);
    assert.equal(broker.getToken('notion'), null);
  });
});

test('set/get/revoke round-trips and records declared scope', () => {
  withHome((dir) => {
    assert.equal(broker.setToken('notion', 'ntn_secret', { scope: 'roadmap db only' }), true);
    assert.equal(broker.getToken('notion'), 'ntn_secret');
    assert.equal(broker.hasToken('notion'), true);
    const meta = JSON.parse(fs.readFileSync(path.join(dir, 'pm-adapters', 'token-scopes.json'), 'utf8'));
    assert.equal(meta.notion.declared_scope, 'roadmap db only');
    assert.ok(meta.notion.min_scope.includes('roadmap'));
    assert.equal(broker.revoke('notion'), true);
    assert.equal(broker.hasToken('notion'), false);
  });
});

test('unknown tool and empty token are rejected', () => {
  withHome(() => {
    assert.equal(broker.setToken('bogus', 'x'), false);
    assert.equal(broker.setToken('notion', '   '), false);
    assert.equal(broker.setToken('notion', 42), false);
  });
});

test('token file is written with 0600 perms (POSIX)', { skip: process.platform === 'win32' }, () => {
  withHome(() => {
    broker.setToken('github', 'ghp_abc');
    const mode = fs.statSync(broker.tokenFile('github')).mode & 0o777;
    assert.equal(mode, 0o600);
  });
});

test('redact never reveals a usable token', () => {
  assert.equal(broker.redact('ghp_1234567890'), 'ghp…7890');
  assert.equal(broker.redact('short'), '****');
  assert.equal(broker.redact(null), '(none)');
});

test('every tool declares a minimum scope; github is read-only', () => {
  assert.ok(broker.minScope('github').includes('repo:status'));
  assert.ok(broker.minScope('github').toLowerCase().includes('read'));
  for (const t of ['notion', 'linear', 'slack']) assert.ok(typeof broker.minScope(t) === 'string');
});
