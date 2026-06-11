import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { CATEGORIES, TIERS, validateDataset, type WorkflowEntry } from "../src/lib.ts";

const DATASET = join(dirname(dirname(fileURLToPath(import.meta.url))), "dataset", "workflows.json");

function load(): WorkflowEntry[] {
  const raw = JSON.parse(readFileSync(DATASET, "utf8")) as { workflows: unknown };
  validateDataset(raw.workflows);
  return raw.workflows;
}

test("dataset has exactly 50 well-formed entries", () => {
  const workflows = load(); // validateDataset throws on any malformed entry
  assert.equal(workflows.length, 50);
});

test("dataset ids are unique and tiers/categories are valid", () => {
  const workflows = load();
  const ids = new Set(workflows.map((w) => w.id));
  assert.equal(ids.size, 50);
  for (const w of workflows) {
    assert.ok((TIERS as readonly string[]).includes(w.expected_tier), `${w.id}: tier`);
    assert.ok((CATEGORIES as readonly string[]).includes(w.category), `${w.id}: category`);
    assert.ok(w.prompt.trim().length >= 10, `${w.id}: prompt too short`);
    assert.ok(w.rationale.trim().length > 0, `${w.id}: rationale`);
  }
});

test("dataset tier distribution matches the documented split (15/12/13/10)", () => {
  const workflows = load();
  const counts: Record<string, number> = { T0: 0, T1: 0, T2: 0, T3: 0 };
  for (const w of workflows) counts[w.expected_tier]++;
  assert.deepEqual(counts, { T0: 15, T1: 12, T2: 13, T3: 10 });
});

test("dataset covers all 15 categories at least once", () => {
  const workflows = load();
  const seen = new Set(workflows.map((w) => w.category));
  for (const c of CATEGORIES) assert.ok(seen.has(c), `missing category ${c}`);
});

test("validateDataset rejects malformed entries", () => {
  assert.throws(() => validateDataset([{ id: "x" }]), /prompt/);
  assert.throws(
    () =>
      validateDataset([
        { id: "x", prompt: "a realistic prompt here", category: "nope", expected_tier: "T1", rationale: "r" },
      ]),
    /category/,
  );
  assert.throws(
    () =>
      validateDataset([
        { id: "x", prompt: "a realistic prompt here", category: "regex", expected_tier: "T9", rationale: "r" },
      ]),
    /expected_tier/,
  );
});
