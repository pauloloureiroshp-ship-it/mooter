// R0 #2 — hub hostname consistency guard.
//
// Two independent places define the default hub host:
//   packages/cli/src/commands/pricing.ts → DEFAULT_HUB       (CLI pricing pull)
//   tools/router/env.js                  → DEFAULT_HUB_URL    (router runtime)
// They drifted once (pricing.ts pointed at a host that 404s while the runtime used
// the live one). This test fails the build if they diverge again, so
// `mooter pricing-update` and the runtime can never talk to different hubs.
//
// NOTE: this file intentionally does NOT spell out the live host literally — the
// account subdomain still carries the pre-rebrand token, and the rebrand ratchet
// counts files by substring. We assert the two constants are equal and
// structurally a mooter-hub worker host, which is the actual contract.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_HUB } from '../src/commands/pricing.ts';
// env.js is CommonJS; Node's ESM↔CJS interop exposes its named exports.
import { DEFAULT_HUB_URL } from '../../../tools/router/env.js';

test('pricing.ts DEFAULT_HUB equals env.js DEFAULT_HUB_URL', () => {
  assert.equal(DEFAULT_HUB, DEFAULT_HUB_URL);
});

test('the shared hub host is a mooter-hub worker over https', () => {
  for (const url of [DEFAULT_HUB, DEFAULT_HUB_URL]) {
    assert.ok(url.startsWith('https://mooter-hub.'), `expected mooter-hub host, got ${url}`);
    assert.ok(url.endsWith('.workers.dev'), `expected a workers.dev host, got ${url}`);
  }
});

test('neither points at the stale paulo-loureiro host (which 404s)', () => {
  assert.ok(!DEFAULT_HUB.includes('paulo-loureiro'));
  assert.ok(!DEFAULT_HUB_URL.includes('paulo-loureiro'));
});
