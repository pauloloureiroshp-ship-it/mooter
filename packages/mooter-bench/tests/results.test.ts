// Wave 55 (Phase G) — writeResults() persists RESULTS.json in the exact shape
// tools/router/bench-status.js consumes. The contract is load-bearing: a wrong
// key (e.g. `timestamp` instead of `generated_at`, or `workflows` instead of
// `total`) silently demotes the live chip to `🧪 bench ?`.

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { score, estimateSavings, type Prediction, type WorkflowEntry } from "../src/lib.ts";
import { writeResults } from "../src/run.ts";

function entry(id: string, tier: WorkflowEntry["expected_tier"], category: WorkflowEntry["category"]): WorkflowEntry {
  return { id, prompt: `stub prompt for ${id}`, category, expected_tier: tier, rationale: "stub" };
}
function pred(id: string, tier: string | null, completed = true): Prediction {
  return { id, predicted_tier: tier, completed };
}

test("writeResults: persists the bench-status reader contract", () => {
  const entries: WorkflowEntry[] = [
    entry("a", "T0", "trivial-edit"),
    entry("b", "T2", "bug-investigation"),
    entry("c", "T3", "architecture"),
  ];
  const preds = entries.map((e) => pred(e.id, e.expected_tier));
  const report = score(entries, preds);
  const savings = estimateSavings(preds);

  const dir = mkdtempSync(join(tmpdir(), "mooter-bench-results-"));
  try {
    const out = writeResults(report, savings, { sha256: "deadbeef", dataset: "test.json" }, dir);
    assert.equal(out, join(dir, "RESULTS.json"));
    const parsed = JSON.parse(readFileSync(out, "utf8"));

    // generated_at (NOT `timestamp`) — bench-status isFresh() keys off this.
    assert.equal(typeof parsed.generated_at, "string");
    assert.ok(!Number.isNaN(Date.parse(parsed.generated_at)), "generated_at is ISO-parseable");
    // total (NOT `workflows`) drives the "(N wf)" label.
    assert.equal(parsed.total, 3);
    // numeric cohorts (NOT the `cohort` string) drives "n=1".
    assert.equal(parsed.cohorts, 1);
    assert.equal(parsed.accuracy, report.accuracy);
    assert.equal(parsed.est_savings_pct, Number(savings.saved_pct.toFixed(1)));
    assert.ok(Array.isArray(parsed.honest_caveats) && parsed.honest_caveats.length >= 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
