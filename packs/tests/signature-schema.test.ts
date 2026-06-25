// F3 supply-chain hardening — the optional `signature` block on a pack.yaml.
// Enforcement is DEFERRED (first-party packs are git-trusted, so a missing
// signature is valid); validatePack only checks the SHAPE when it is present,
// so the contract exists for a future marketplace without premature key infra.
//
// Run: cd packs && npx tsx --test tests/signature-schema.test.ts

import { test } from "node:test";
import assert from "node:assert/strict";
import { validatePack } from "../validate.ts";

// A fully-valid baseline pack (no signature).
const base = () => ({
  name: "typed-pack",
  version: "1.0.0",
  description: "a pack",
  domain_signals: { keywords: ["x"] },
  model_floor: "T1",
  model_ceiling: "T2",
  metadata: { author: "someone", created: "2026-06-25" },
});

const sigErrors = (p: unknown) => validatePack(p).filter((e) => e.startsWith("signature"));

test("F3: a pack with NO signature is fully valid (deferred enforcement)", () => {
  assert.deepEqual(validatePack(base()), []);
});

test("F3: a well-formed signature is accepted", () => {
  const p = { ...base(), signature: { algo: "ed25519", value: "abc", key_id: "k1", signed_hash: "h" } };
  assert.deepEqual(sigErrors(p), []);
});

test("F3: a non-mapping signature is rejected", () => {
  assert.ok(sigErrors({ ...base(), signature: "nope" }).length > 0);
});

test("F3: a signature with a non-string value is rejected", () => {
  const errs = sigErrors({ ...base(), signature: { algo: "ed25519", value: 123 } });
  assert.ok(errs.some((e) => e.includes("value")));
});

test("F3: a signature missing algo+value is rejected (shape, not presence)", () => {
  const errs = sigErrors({ ...base(), signature: { key_id: "k1" } });
  assert.ok(errs.some((e) => e.includes("requires at least")));
});
