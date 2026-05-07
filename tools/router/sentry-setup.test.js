#!/usr/bin/env node
// @ts-check
/**
 * Unit tests for sentry-setup.js (Wave-1.5 task #7).
 */

'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const { summary } = require('./sentry-setup.js');

test('summary: returns shape with required keys regardless of state', () => {
  const s = summary();
  for (const k of ['enabled', 'config_path', 'has_env_dsn', 'user_id_hash', 'mooter_version']) {
    assert.ok(k in s, `missing key: ${k}`);
  }
  assert.equal(typeof s.enabled, 'boolean');
});

test('summary: dsn_masked never reveals full DSN', () => {
  const s = summary();
  if (s.enabled) {
    assert.ok(s.dsn_masked, 'dsn_masked should be set when enabled');
    assert.match(s.dsn_masked, /\*\*\*/, 'mask must contain ***');
  }
});
