// cronista-pillar.test.mjs — offline unit test for the U2 re-verification (no I/O).
// Run: node --test _handoff/fleet/cronista-pillar.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";

import { u2Reverify } from "./cronista-pillar.mjs";

test("u2Reverify confirms a consistent claim", () => {
  const snaps = [{ id: "matriz", last: { round: 2, est_cloud_tokens_avoided: 300, prompt_tokens: 100, eval_tokens: 200 } }];
  const v = u2Reverify(snaps);
  assert.equal(v.ok, true);
  assert.equal(v.derived, 300);
});

test("u2Reverify catches a fabricated claim", () => {
  const snaps = [{ id: "matriz", last: { round: 2, est_cloud_tokens_avoided: 999, prompt_tokens: 100, eval_tokens: 200 } }];
  const v = u2Reverify(snaps);
  assert.equal(v.ok, false);
  assert.equal(v.derived, 300);
});

test("u2Reverify returns null when no numeric claim exists", () => {
  const snaps = [{ id: "x", last: { round: 1, est_cloud_tokens_avoided: "n/d" } }, { id: "y", last: null }];
  assert.equal(u2Reverify(snaps), null);
});
