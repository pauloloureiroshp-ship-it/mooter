// Wave 58 batch 3 (A.17) — `mooter route adaptive`. node:test + tsx.
// Run: cd packages/cli && npm test
//
// The command's --dry-run swaps in a deterministic stub executor + judge so the
// whole escalation path is exercised WITHOUT calling a real model. We assert on
// the human + --json surfaces and on honest behaviour (best-so-far on failure,
// no fabricated numbers, partial-cost honesty via the real engine's empty-pool
// path). classify.js is never touched.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { runRouteAdaptive, ROUTE_ADAPTIVE_USAGE } from "../src/commands/route-adaptive.ts";

describe("mooter route adaptive — usage / arg validation", () => {
  test("no subcommand prints usage, exit 0", async () => {
    const r = await runRouteAdaptive([]);
    assert.equal(r.exitCode, 0);
    assert.match(r.output, /mooter route adaptive/);
    assert.equal(r.output, ROUTE_ADAPTIVE_USAGE);
  });

  test("--help prints usage", async () => {
    const r = await runRouteAdaptive(["--help"]);
    assert.equal(r.exitCode, 0);
    assert.match(r.output, /Fable-5-inspired adaptive escalation/);
  });

  test("unknown subcommand → exit 1 + usage", async () => {
    const r = await runRouteAdaptive(["bogus"]);
    assert.equal(r.exitCode, 1);
    assert.match(r.output, /unknown subcommand 'bogus'/);
  });

  test("missing task → exit 1 with a helpful message", async () => {
    const r = await runRouteAdaptive(["adaptive"]);
    assert.equal(r.exitCode, 1);
    assert.match(r.output, /a task is required/);
  });

  test("out-of-range --min-confidence → exit 1", async () => {
    const r = await runRouteAdaptive(["adaptive", "t", "--min-confidence", "2"]);
    assert.equal(r.exitCode, 1);
    assert.match(r.output, /--min-confidence must be a number in \[0,1\]/);
  });

  test("non-numeric --max-attempts → exit 1", async () => {
    const r = await runRouteAdaptive(["adaptive", "t", "--max-attempts", "abc"]);
    assert.equal(r.exitCode, 1);
    assert.match(r.output, /--max-attempts must be a number >= 1/);
  });

  test("out-of-range --min-score → exit 1", async () => {
    const r = await runRouteAdaptive(["adaptive", "t", "--min-score", "-0.1"]);
    assert.equal(r.exitCode, 1);
    assert.match(r.output, /--min-score must be a number in \[0,1\]/);
  });
});

describe("mooter route adaptive --dry-run — deterministic, no real model", () => {
  // coding.backend has a real measured+priced candidate in the seed; --min-score 0
  // keeps it in the pool, and the dry-run stub then drives the judge.
  const baseArgs = ["adaptive", "implement the auth service", "--category", "coding.backend", "--min-score", "0", "--dry-run"];

  test("dry-run accepts a single candidate (max-attempts 1) deterministically", async () => {
    const r = await runRouteAdaptive([...baseArgs, "--max-attempts", "1"]);
    assert.equal(r.exitCode, 0);
    assert.match(r.output, /dry-run · stub executor \+ judge/);
    assert.match(r.output, /Attempts \(TES-descending/);
    // single attempt #1 is the final allowed one → judge passes it.
    assert.match(r.output, /Winner:.*\(met ≥\)/s);
    assert.match(r.output, /conf 0\.95/);
  });

  test("dry-run --json emits the engine result + dry_run flag", async () => {
    const r = await runRouteAdaptive([...baseArgs, "--max-attempts", "1", "--json"]);
    assert.equal(r.exitCode, 0);
    const obj = JSON.parse(r.output);
    assert.equal(obj.dry_run, true);
    assert.equal(obj.category, "coding.backend");
    assert.equal(obj.final_confidence_met, true);
    assert.equal(obj.final_confidence, 0.95);
    assert.ok(Array.isArray(obj.attempts) && obj.attempts.length >= 1);
    // cost is real & known in dry-run (the stub reports a number, never invented).
    assert.equal(obj.cost_complete, true);
    assert.equal(typeof obj.total_cost, "number");
  });

  test("dry-run renders a per-model emoji for the winner", async () => {
    const r = await runRouteAdaptive([...baseArgs, "--max-attempts", "1"]);
    // The attempt line carries one of the family emojis.
    assert.match(r.output, /[🐮✨🌟🟢💎🦙🤖]/u);
  });

  test("dry-run is HONEST: a single-candidate pool with --max-attempts 3 reports threshold-not-met, never a faked pass", async () => {
    // coding.backend has exactly one measured+priced candidate in the seed, so
    // the engine clamps to 1 attempt; the multi-attempt stub judge fails it.
    const r = await runRouteAdaptive([...baseArgs, "--max-attempts", "3", "--json"]);
    const obj = JSON.parse(r.output);
    assert.equal(obj.attempts.length, 1, "clamped to the single real candidate");
    assert.equal(obj.final_confidence_met, false, "must NOT fake a pass");
    assert.match(obj.escalation_reason, /threshold not reached/i);
    assert.equal(obj.cost_complete, true, "stub cost is known");
  });
});

describe("mooter route adaptive — honest failure / empty pool", () => {
  test("a category with no measured+priced candidate runs nothing, exit 1, honest reason", async () => {
    // context.audio is unmeasured in the seed → empty candidate pool → nothing run.
    const r = await runRouteAdaptive(["adaptive", "transcribe this", "--category", "context.audio", "--dry-run"]);
    assert.equal(r.exitCode, 1);
    assert.match(r.output, /\(nothing run\)/);
    assert.match(r.output, /no viable candidate/i);
  });

  test("an unknown category runs nothing and explains why (exit 1)", async () => {
    const r = await runRouteAdaptive(["adaptive", "t", "--category", "coding.nope", "--dry-run"]);
    assert.equal(r.exitCode, 1);
    assert.match(r.output, /unknown task_category/i);
  });

  test("--json never fabricates: unknown-category result is honest nulls", async () => {
    const r = await runRouteAdaptive(["adaptive", "t", "--category", "coding.nope", "--dry-run", "--json"]);
    assert.equal(r.exitCode, 1);
    const obj = JSON.parse(r.output);
    assert.equal(obj.final, null);
    assert.equal(obj.winning_model, null);
    assert.equal(obj.final_confidence, null);
    assert.equal(obj.final_confidence_met, false);
    assert.deepEqual(obj.attempts, []);
  });
});

describe("mooter route adaptive — no hyperbole / honesty", () => {
  test("usage and output avoid hype words", async () => {
    const r = await runRouteAdaptive([
      "adaptive",
      "implement X",
      "--category",
      "coding.backend",
      "--min-score",
      "0",
      "--dry-run",
      "--max-attempts",
      "1",
    ]);
    assert.ok(!/revolutionary|magic|guaranteed|best-in-class/i.test(r.output));
    // It honestly states confidence is the judge score, never the classifier's.
    assert.match(ROUTE_ADAPTIVE_USAGE, /never re-tiers|never re-tier|it never re-tiers/i);
  });
});
