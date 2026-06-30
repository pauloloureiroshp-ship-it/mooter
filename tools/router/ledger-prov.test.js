// ledger-prov.test.js — Ledger Spine L0: provenance primitives.
// Proves: canonicalize is order-independent + array-order-significant; provHash
// is stable for the same canonical I/O and diverges for different I/O.
'use strict';

const test = require('node:test');
const assert = require('node:assert');
const crypto = require('crypto');
const { canonicalize, provHash } = require('./ledger-prov.js');

test('canonicalize is independent of object key insertion order', () => {
  const a = canonicalize({ b: 1, a: 2, nested: { y: 1, x: 2 } });
  const b = canonicalize({ a: 2, nested: { x: 2, y: 1 }, b: 1 });
  assert.equal(a, b);
  assert.equal(a, '{"a":2,"b":1,"nested":{"x":2,"y":1}}', 'keys sorted recursively');
});

test('canonicalize preserves array order (order is semantic)', () => {
  assert.notEqual(canonicalize([1, 2, 3]), canonicalize([3, 2, 1]));
  assert.equal(canonicalize({ k: [{ z: 1, a: 2 }] }), '{"k":[{"a":2,"z":1}]}');
});

test('canonicalize drops undefined props and never returns undefined', () => {
  assert.equal(canonicalize({ a: 1, b: undefined }), canonicalize({ a: 1 }));
  assert.equal(canonicalize(undefined), 'null', 'top-level undefined → "null" string');
  assert.equal(typeof canonicalize(undefined), 'string');
});

test('provHash is stable for the same canonical I/O', () => {
  const io1 = { input: 'summarize this', output: { ok: true, n: 3 } };
  const io2 = { output: { n: 3, ok: true }, input: 'summarize this' }; // reordered
  assert.equal(provHash(io1), provHash(io2), 'same logical I/O → same hash');
  // and it is a real sha-256 hex digest
  assert.match(provHash(io1), /^[0-9a-f]{64}$/);
  assert.equal(
    provHash(io1),
    crypto.createHash('sha256').update(canonicalize(io1), 'utf8').digest('hex'),
  );
});

test('provHash diverges when the payload changes', () => {
  assert.notEqual(provHash({ x: 1 }), provHash({ x: 2 }));
  assert.notEqual(provHash('a'), provHash('b'));
});
