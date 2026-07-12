'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const gate = require('./gate.js');

function withHome(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pmadapt-gate-'));
  const prev = process.env.MOOTER_HOME;
  process.env.MOOTER_HOME = dir;
  try { return fn(dir); }
  finally {
    if (prev === undefined) delete process.env.MOOTER_HOME; else process.env.MOOTER_HOME = prev;
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
  }
}

test('no consent by default (the write-back gate is closed)', () => {
  withHome(() => {
    for (const t of ['notion', 'linear', 'slack']) assert.equal(gate.hasConsent(t), false);
    assert.equal(gate.record('notion'), null);
  });
});

test('grant records human consent once; revoke closes the gate again', () => {
  withHome(() => {
    assert.equal(gate.grant('notion', { by: 'cli', note: 'ok', at: '2026-07-03T00:00:00Z' }), true);
    assert.equal(gate.hasConsent('notion'), true);
    const rec = gate.record('notion');
    assert.equal(rec.granted, true);
    assert.equal(rec.granted_at, '2026-07-03T00:00:00Z');
    assert.equal(rec.by, 'cli');
    assert.equal(gate.revoke('notion'), true);
    assert.equal(gate.hasConsent('notion'), false);
  });
});

test('consent is per-tool — granting notion does not grant slack', () => {
  withHome(() => {
    gate.grant('notion', { at: 'T' });
    assert.equal(gate.hasConsent('notion'), true);
    assert.equal(gate.hasConsent('slack'), false);
  });
});
