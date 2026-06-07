import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  logDecision,
  readDecisions,
  aggregateStats,
  assertNoPromptContent,
  sanitizeRecord,
  selectArm,
  BANDIT_ENABLED,
  type DecisionRecord,
} from "../src/index.ts";

let home: string;
const prevHome = process.env.MOOTER_HOME;
beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "mooter-q-"));
  process.env.MOOTER_HOME = home;
});
afterEach(() => {
  if (prevHome === undefined) delete process.env.MOOTER_HOME;
  else process.env.MOOTER_HOME = prevHome;
  rmSync(home, { recursive: true, force: true });
});

test("assertNoPromptContent throws on content-bearing keys", () => {
  for (const bad of ["prompt", "prompt_text", "content", "text", "messages", "response_text"]) {
    assert.throws(() => assertNoPromptContent({ [bad]: "secret user prompt" }), /privacy violation/, `should reject ${bad}`);
  }
  // Feature keys that merely *contain* "prompt" are fine.
  assert.doesNotThrow(() => assertNoPromptContent({ prompt_class: "T2", prompt_tokens: 100, prompt_complexity: 0.4 }));
});

test("sanitizeRecord keeps allowlisted columns, drops the rest", () => {
  const r = sanitizeRecord({ device_id: "d1", tier_chosen: "T2", junk: "x", secret: "y", prompt_tokens: 50 });
  assert.equal(r.tier_chosen, "T2");
  assert.equal(r.prompt_tokens, 50);
  assert.equal((r as Record<string, unknown>).junk, undefined);
  assert.equal((r as Record<string, unknown>).secret, undefined);
});

test("logDecision: writes a sanitised row, fills id+ts, rejects content", () => {
  const rec = logDecision(
    { device_id: "dev-1", prompt_class: "T2", tier_chosen: "T2", model_chosen: "sonnet", classify_confidence: 0.8, tokens_in: 100, tokens_out: 40, cost_usd: 0.01 },
    { now: 1000, id: "fixed-id" },
  );
  assert.equal(rec.decision_id, "fixed-id");
  assert.equal(rec.ts, 1000);

  const rows = readDecisions();
  assert.equal(rows.length, 1);
  assert.equal(rows[0].tier_chosen, "T2");
  // No content key persisted.
  assert.equal((rows[0] as Record<string, unknown>).prompt, undefined);

  assert.throws(
    () => logDecision({ device_id: "dev-1", prompt: "the actual prompt text" } as never),
    /privacy violation/,
  );
});

test("aggregateStats summarises tiers/outcomes/cost/confidence", () => {
  const records: DecisionRecord[] = [
    { decision_id: "1", device_id: "d", ts: 1, tier_chosen: "T0", outcome_status: "accepted", tokens_in: 10, tokens_out: 5, cost_usd: 0, classify_confidence: 0.9, doctrine_violations: 0 },
    { decision_id: "2", device_id: "d", ts: 2, tier_chosen: "T2", outcome_status: "edited", tokens_in: 100, tokens_out: 40, cost_usd: 0.01, classify_confidence: 0.7, doctrine_violations: 1 },
    { decision_id: "3", device_id: "d", ts: 3, tier_chosen: "T0", outcome_status: "accepted", tokens_in: 20, tokens_out: 8, cost_usd: 0, classify_confidence: 0.8 },
  ];
  const s = aggregateStats(records);
  assert.equal(s.total, 3);
  assert.equal(s.by_tier.T0, 2);
  assert.equal(s.by_outcome.accepted, 2);
  assert.equal(s.total_tokens_in, 130);
  assert.equal(s.doctrine_violations, 1);
  assert.equal(s.avg_classify_confidence, 0.8);
});

test("bandit-stub never selects an arm in Wave 29", () => {
  assert.equal(BANDIT_ENABLED, false);
  assert.equal(selectArm({ prompt_class: "T2", hardware_class: "apple-silicon", subscription_tier: "claude-max" }), null);
});
