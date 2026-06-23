// niche-t1-override.test.ts — Unit tests for WN1 R2 T1 uplift override.
//
// Coverage:
//   - No-op: non-T0 tiers pass through unchanged
//   - T2 guard blocks on property-based/fuzz/integration/concurrent
//   - Explain-error fires on nh-019 / nh-020 patterns
//   - Trivial test-gen fires on nh-022 / nh-023 / nh-024 / nh-025 patterns
//   - Summarize-comparison fires on nh-026 pattern
//   - Null tier passes through unchanged
//   - T2 case from R1 (nh-030 / nh-034 / nh-040) NOT uplifted

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { applyT1Uplift } from "../src/niche-t1-override.ts";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function assertPassThrough(tier: string | null, prompt: string, label: string) {
  const result = applyT1Uplift(tier, prompt);
  assert.equal(result.tier, tier, `${label}: tier should be unchanged (got ${result.tier})`);
  assert.equal(result.fired, false, `${label}: fired should be false`);
}

function assertUplift(prompt: string, expectedReason: string, label: string) {
  const result = applyT1Uplift("T0", prompt);
  assert.equal(result.tier, "T1", `${label}: tier should be T1`);
  assert.equal(result.fired, true, `${label}: fired should be true`);
  assert.equal(result.reason, expectedReason, `${label}: reason mismatch`);
}

// ---------------------------------------------------------------------------
// No-op / pass-through
// ---------------------------------------------------------------------------

describe("applyT1Uplift — pass-through (non-T0 or null)", () => {
  it("T1 prompt passes through unchanged", () => {
    assertPassThrough("T1", "generate a commit message for this diff", "T1 pass-through");
  });

  it("T2 prompt passes through unchanged", () => {
    assertPassThrough(
      "T2",
      "investigate why the websocket reconnect fails intermittently",
      "T2 pass-through",
    );
  });

  it("T3 prompt passes through unchanged", () => {
    assertPassThrough(
      "T3",
      "redesign the authentication module for multi-tenant SaaS",
      "T3 pass-through",
    );
  });

  it("null tier passes through unchanged", () => {
    assertPassThrough(null, "explain this error", "null pass-through");
  });

  it("T0 prompt with no signal stays T0", () => {
    assertPassThrough("T0", "add a semicolon at the end of line 87", "T0 no-signal");
  });

  it("T0 trivial rename stays T0", () => {
    assertPassThrough("T0", "rename variable foo to bar in auth.ts", "T0 rename");
  });
});

// ---------------------------------------------------------------------------
// T2 guard blocks uplifts
// ---------------------------------------------------------------------------

describe("applyT1Uplift — T2 guard prevents false uplift", () => {
  it("property-based test blocked (nh-034 pattern)", () => {
    assertPassThrough(
      "T0",
      "add property-based tests using fast-check for our JSON schema validator",
      "property-based blocked",
    );
  });

  it("fuzz test blocked (nh-040 pattern)", () => {
    assertPassThrough(
      "T0",
      "write a fuzz test for our URL parser that explores boundary inputs",
      "fuzz test blocked",
    );
  });

  it("integration tests blocked", () => {
    assertPassThrough(
      "T0",
      "write integration tests for the payment service end-to-end flow",
      "integration tests blocked",
    );
  });

  it("concurrent / race condition blocked", () => {
    assertPassThrough(
      "T0",
      "write a test that checks concurrent access to the session store",
      "concurrent blocked",
    );
  });
});

// ---------------------------------------------------------------------------
// Explain-error fires
// ---------------------------------------------------------------------------

describe("applyT1Uplift — explain-error signals", () => {
  it("nh-019 pattern: explain TypeScript error", () => {
    assertUplift(
      "explain this TypeScript error: 'Type string is not assignable to type number | undefined'",
      "explain-error",
      "nh-019",
    );
  });

  it("nh-020 pattern: what does traceback mean", () => {
    assertUplift(
      "what does this Python traceback mean: AttributeError: 'NoneType' object has no attribute 'split' at line 42",
      "explain-error",
      "nh-020",
    );
  });

  it("nh-021 pattern: explain why rule fires (T1→T2 in R1, but catch if T0 in future)", () => {
    assertUplift(
      "explain why this ESLint rule fires: 'no-unused-vars' on the err variable in the catch block",
      "explain-error",
      "nh-021-variant",
    );
  });

  it("explain exception variant", () => {
    assertUplift(
      "explain this exception: NullPointerException at com.example.Foo.bar:42",
      "explain-error",
      "explain-exception",
    );
  });

  it("what does exception mean variant", () => {
    assertUplift(
      "what does this exception mean: java.lang.ClassCastException",
      "explain-error",
      "exception-mean",
    );
  });
});

// ---------------------------------------------------------------------------
// Trivial test-gen fires
// ---------------------------------------------------------------------------

describe("applyT1Uplift — trivial test-gen signals", () => {
  it("nh-022 pattern: unit test for this pure function", () => {
    assertUplift(
      "write a unit test for this pure function: function clamp(n, min, max) { return Math.min(Math.max(n, min), max); }",
      "trivial-test-gen",
      "nh-022",
    );
  });

  it("nh-023 pattern: jest test stub", () => {
    assertUplift(
      "generate a Jest test stub for the formatCurrency(amount, currency) function — just the describe/it shells, no implementation needed",
      "trivial-test-gen",
      "nh-023",
    );
  });

  it("nh-024 pattern: playwright test", () => {
    assertUplift(
      "generate a Playwright test that clicks the login button and asserts the dashboard URL loads",
      "trivial-test-gen",
      "nh-024",
    );
  });

  it("nh-025 pattern: type stub (.pyi)", () => {
    assertUplift(
      "write a Python type stub (.pyi file) for our internal crypto.py module — it exports encrypt and decrypt",
      "trivial-test-gen",
      "nh-025",
    );
  });

  it("describe/it shells variant", () => {
    assertUplift(
      "generate the describe/it shells for the auth module, no assertions needed",
      "trivial-test-gen",
      "describe-shells",
    );
  });
});

// ---------------------------------------------------------------------------
// Summarize-comparison fires
// ---------------------------------------------------------------------------

describe("applyT1Uplift — summarize-comparison signals", () => {
  it("nh-026 pattern: summarize differences between X and Y", () => {
    assertUplift(
      "summarize the key differences between Promise.all() and Promise.allSettled() and when to prefer each in our codebase",
      "summarize-comparison",
      "nh-026",
    );
  });

  it("summarize key diff variant", () => {
    assertUplift(
      "summarize key differences between async/await and promise chains",
      "summarize-comparison",
      "summarize-key-diff",
    );
  });

  it("summarize when to prefer variant", () => {
    assertUplift(
      "summarize Array.forEach vs Array.map and when to prefer each",
      "summarize-comparison",
      "summarize-prefer",
    );
  });
});

// ---------------------------------------------------------------------------
// nh-008 false positive (package.json HIGH_RISK — no uplift should touch it)
// ---------------------------------------------------------------------------

describe("applyT1Uplift — nh-008: package.json false positive (no T1 uplift expected)", () => {
  it("package.json version bump stays at whatever classify says (no T1 signal)", () => {
    // classify.js routes this to T3 (HIGH_RISK). The uplift only fires at T0.
    // This test confirms: if classify had returned T0, the uplift would NOT fire
    // on this prompt (no T1 pattern matches it).
    assertPassThrough(
      "T0",
      "update the version field in package.json from 1.2.3 to 1.2.4",
      "nh-008 no-T1-signal",
    );
    // And the real case (T3) also passes through:
    assertPassThrough(
      "T3",
      "update the version field in package.json from 1.2.3 to 1.2.4",
      "nh-008 T3 pass-through",
    );
  });
});

// ---------------------------------------------------------------------------
// nh-030 pattern: heap OOM error — NOT an "explain error" (just mentions error)
// ---------------------------------------------------------------------------

describe("applyT1Uplift — nh-030: heap OOM (T2 territory, no uplift)", () => {
  it("'batch job throws heap out of memory error' does not uplift (no explain verb)", () => {
    // "error" appears but there's no "explain" anchor — guard works.
    assertPassThrough(
      "T0",
      "batch job runs fine for <1000 items but throws a heap out of memory error for larger batches",
      "nh-030 no-explain",
    );
  });
});
