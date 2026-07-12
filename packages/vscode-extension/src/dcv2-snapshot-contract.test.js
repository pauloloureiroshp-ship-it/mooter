// dcv2-snapshot-contract.test.js — Director's Cut v2 · F1 source-contract guard (node --test).
// F1 is DATA ONLY: livePreviewSnapshot() must expose every nullable aggregate field
// (byDay/byModel/fleet/executive) on BOTH its success return and its catch return, and load
// lp-aggregates.js fail-soft (absent → LPA stays null, nothing else changes). This suite reads
// extension.js AS TEXT (no eval) so a distracted merge that drops a field or the fail-soft guard
// trips the build instead of silently shipping a half-wired snapshot. Mirrors the
// honest-controls / webview-syntax source-read pattern.
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const SRC = fs.readFileSync(path.join(__dirname, 'extension.js'), 'utf8');

// Isolate the livePreviewSnapshot() body so assertions cannot accidentally match some other
// function's return shape. The fn is short; the next top-level `function ` closes it out.
function snapshotBody() {
  const start = SRC.indexOf('function livePreviewSnapshot(');
  assert.ok(start !== -1, 'livePreviewSnapshot() must exist in extension.js');
  const rest = SRC.slice(start + 1);
  const nextRel = rest.indexOf('\nfunction ');
  return SRC.slice(start, nextRel === -1 ? SRC.length : start + 1 + nextRel);
}

test('F1: lp-aggregates.js is required fail-soft (absent → LPA stays null)', () => {
  assert.match(SRC, /LPA\s*=\s*require\('\.\/lp-aggregates\.js'\)/,
    'extension.js must require ./lp-aggregates.js');
  assert.match(SRC, /try\s*\{\s*LPA\s*=\s*require\('\.\/lp-aggregates\.js'\);\s*\}\s*catch\s*\{\s*LPA\s*=\s*null;\s*\}/,
    'the require must be fail-soft: catch leaves LPA = null');
});

test('F1: livePreviewSnapshot success return exposes byDay/byModel/fleet/executive', () => {
  const body = snapshotBody();
  for (const k of ['byDay', 'byModel', 'fleet', 'executive']) {
    assert.ok(body.includes(k + ':'), 'snapshot must return the ' + k + ' field');
  }
});

test('F1: the catch path returns every aggregate as null (honest fallback)', () => {
  const body = snapshotBody();
  const m = body.match(/catch\s*\{\s*return\s*\{([^}]*)\}/);
  assert.ok(m, 'livePreviewSnapshot must have a catch that returns an object');
  const caught = m[1];
  assert.match(caught, /byDay:\s*null/, 'catch must set byDay: null');
  assert.match(caught, /byModel:\s*null/, 'catch must set byModel: null');
  assert.match(caught, /fleet:\s*null/, 'catch must set fleet: null');
  assert.match(caught, /executive:\s*null/, 'catch must set executive: null');
});
