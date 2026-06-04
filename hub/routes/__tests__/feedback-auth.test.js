// Wave 13.x brand cleanup — admin auth dual-write (MOOTER_ADMIN_TOKEN canonical,
// FRUGAL_ADMIN_TOKEN fallback), constant-time compare. node:test, plain Node.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { adminAuthorized } from '../feedback.js';

const bearer = (t) => `Bearer ${t}`;

test('accepts the canonical MOOTER_ADMIN_TOKEN', () => {
  const env = { MOOTER_ADMIN_TOKEN: 'canonical-secret' };
  assert.equal(adminAuthorized(bearer('canonical-secret'), env), true);
  assert.equal(adminAuthorized(bearer('wrong'), env), false);
});

test('accepts the deprecated FRUGAL_ADMIN_TOKEN fallback', () => {
  const env = { FRUGAL_ADMIN_TOKEN: 'legacy-secret' };
  assert.equal(adminAuthorized(bearer('legacy-secret'), env), true);
  assert.equal(adminAuthorized(bearer('wrong'), env), false);
});

test('accepts either when BOTH are set (dual-write window)', () => {
  const env = { MOOTER_ADMIN_TOKEN: 'new-secret', FRUGAL_ADMIN_TOKEN: 'old-secret' };
  assert.equal(adminAuthorized(bearer('new-secret'), env), true, 'canonical works');
  assert.equal(adminAuthorized(bearer('old-secret'), env), true, 'fallback still works');
  assert.equal(adminAuthorized(bearer('neither'), env), false);
});

test('rejects when no admin token is provisioned', () => {
  assert.equal(adminAuthorized(bearer('anything'), {}), false);
  assert.equal(adminAuthorized(bearer('anything'), { MOOTER_ADMIN_TOKEN: '' }), false, 'empty secret never authorizes');
});

test('rejects malformed / missing Authorization headers', () => {
  const env = { MOOTER_ADMIN_TOKEN: 'secret' };
  assert.equal(adminAuthorized('', env), false);
  assert.equal(adminAuthorized('secret', env), false, 'no Bearer prefix');
  assert.equal(adminAuthorized('Bearer ', env), false, 'empty token');
  assert.equal(adminAuthorized(null, env), false);
  assert.equal(adminAuthorized(undefined, env), false);
});

test('rejects a token that is a prefix/extension of the secret (length-safe)', () => {
  const env = { MOOTER_ADMIN_TOKEN: 'secret' };
  assert.equal(adminAuthorized(bearer('secre'), env), false, 'shorter');
  assert.equal(adminAuthorized(bearer('secretx'), env), false, 'longer');
  assert.equal(adminAuthorized(bearer('Secret'), env), false, 'case-sensitive');
});
