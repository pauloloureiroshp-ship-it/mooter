import { test } from "node:test";
import assert from "node:assert/strict";
import { ERROR_CATALOG, SCENARIO_IDS, lookup } from "../src/recovery/error-catalog.ts";
import { planRecovery, autoActions, DEFAULT_THRESHOLDS } from "../src/recovery/auto-recover.ts";

test("catalog has all 7 scenarios, each with a recovery + detect", () => {
  assert.equal(SCENARIO_IDS.length, 7);
  for (const id of SCENARIO_IDS) {
    const s = lookup(id);
    assert.ok(s.recovery.length > 0, `${id} missing recovery`);
    assert.ok(s.detect.length > 0, `${id} missing detect`);
    assert.ok(s.statuslineChip, `${id} missing chip`);
  }
});

test("healthy signals → no recovery actions", () => {
  const actions = planRecovery({
    ollamaReachable: true,
    ollamaModelCount: 3,
    hubReachable: true,
    quotaRemainingPct: 80,
    diskFreeMb: 100000,
    avgLatencyMs: 800,
  });
  assert.equal(actions.length, 0);
});

test("ollama down OR zero models → repair_ollama", () => {
  assert.equal(planRecovery({ ollamaReachable: false })[0].kind, "repair_ollama");
  assert.equal(planRecovery({ ollamaModelCount: 0 })[0].kind, "repair_ollama");
});

test("quota exhausted → bias_local_hard (auto)", () => {
  const a = planRecovery({ quotaRemainingPct: 5 });
  assert.equal(a[0].kind, "bias_local_hard");
  assert.equal(a[0].auto, true);
});

test("disk low + network slow + hub offline compose", () => {
  const a = planRecovery({
    hubReachable: false,
    diskFreeMb: 200,
    avgLatencyMs: 9000,
  });
  const kinds = a.map((x) => x.kind).sort();
  assert.deepEqual(kinds, ["audit_disk", "degrade_tier", "queue_local"].sort());
});

test("workflow crash is NOT auto-recoverable; disk low NOT auto", () => {
  const wf = planRecovery({ workflowCrashed: true });
  assert.equal(wf[0].kind, "resume_workflow");
  assert.equal(wf[0].auto, false);
  assert.equal(autoActions(wf).length, 0);
});

test("thresholds are honoured (quota at boundary)", () => {
  // exactly at the min → triggers (<=)
  assert.equal(planRecovery({ quotaRemainingPct: DEFAULT_THRESHOLDS.quotaPctMin }).length, 1);
  assert.equal(planRecovery({ quotaRemainingPct: DEFAULT_THRESHOLDS.quotaPctMin + 1 }).length, 0);
});

test("autoActions filters to the auto-recoverable subset", () => {
  const a = planRecovery({ ollamaReachable: false, diskFreeMb: 100 });
  // ollama_down auto, disk_low not auto
  assert.equal(a.length, 2);
  assert.equal(autoActions(a).length, 1);
  assert.equal(autoActions(a)[0].kind, "repair_ollama");
});
