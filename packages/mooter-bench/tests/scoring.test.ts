import { test } from "node:test";
import assert from "node:assert/strict";
import { score, type Prediction, type WorkflowEntry } from "../src/lib.ts";

function entry(id: string, tier: WorkflowEntry["expected_tier"], category: WorkflowEntry["category"]): WorkflowEntry {
  return { id, prompt: `stub prompt for ${id}`, category, expected_tier: tier, rationale: "stub" };
}

function pred(id: string, tier: string | null, completed = true): Prediction {
  return { id, predicted_tier: tier, completed };
}

const ENTRIES: WorkflowEntry[] = [
  entry("a", "T0", "trivial-edit"),
  entry("b", "T0", "summarize"),
  entry("c", "T1", "commit-msg"),
  entry("d", "T2", "bug-investigation"),
  entry("e", "T3", "architecture"),
];

test("score: perfect stubbed classifier gives 100% accuracy and diagonal confusion", () => {
  const preds = ENTRIES.map((e) => pred(e.id, e.expected_tier));
  const r = score(ENTRIES, preds);
  assert.equal(r.total, 5);
  assert.equal(r.correct, 5);
  assert.equal(r.accuracy, 1);
  assert.equal(r.completion_rate, 1);
  assert.equal(r.confusion.T0.T0, 2);
  assert.equal(r.confusion.T1.T1, 1);
  assert.equal(r.confusion.T2.T2, 1);
  assert.equal(r.confusion.T3.T3, 1);
  assert.equal(r.confusion.T0.T1 + r.confusion.T0.T2 + r.confusion.T0.T3, 0);
});

test("score: misroutes land in the right confusion cell and lower accuracy", () => {
  const preds = [
    pred("a", "T1"), // T0 misrouted up to T1
    pred("b", "T0"),
    pred("c", "T1"),
    pred("d", "T3"), // T2 misrouted up to T3
    pred("e", "T3"),
  ];
  const r = score(ENTRIES, preds);
  assert.equal(r.correct, 3);
  assert.equal(r.accuracy, 0.6);
  assert.equal(r.confusion.T0.T1, 1);
  assert.equal(r.confusion.T2.T3, 1);
  // per-category: trivial-edit 0/1, summarize 1/1
  assert.equal(r.per_category["trivial-edit"].accuracy, 0);
  assert.equal(r.per_category["summarize"].accuracy, 1);
  assert.equal(r.per_category["commit-msg"].correct, 1);
});

test("score: failed decisions hit completion_rate and count as incorrect", () => {
  const preds = [
    pred("a", "T0"),
    pred("b", null, false), // classifier crashed / bad JSON
    pred("c", "T1"),
    pred("d", "T5"), // tier outside T0-T3 → "other", incorrect
    pred("e", "T3"),
  ];
  const r = score(ENTRIES, preds);
  assert.equal(r.completed, 4); // the null one is incomplete; T5 still parsed
  assert.equal(r.completion_rate, 0.8);
  assert.equal(r.correct, 3);
  assert.equal(r.accuracy, 0.6);
  assert.equal(r.confusion.T0.invalid, 1);
  assert.equal(r.confusion.T2.other, 1);
});

test("score: missing prediction for an entry counts as invalid", () => {
  const preds = [pred("a", "T0")]; // b..e have no prediction at all
  const r = score(ENTRIES, preds);
  assert.equal(r.completed, 1);
  assert.equal(r.completion_rate, 0.2);
  assert.equal(r.confusion.T0.invalid, 1); // b
  assert.equal(r.confusion.T1.invalid, 1); // c
  assert.equal(r.confusion.T2.invalid, 1); // d
  assert.equal(r.confusion.T3.invalid, 1); // e
});
