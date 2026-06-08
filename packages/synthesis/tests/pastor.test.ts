import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  routeRequest,
  loadPastorState,
  recordRoute,
  summarizePastor,
  pastorStatePath,
  recordFeedback,
  adapterBias,
  applyFeedbackBias,
  loadFeedback,
  trainSpec,
  trainStatus,
  type AdapterScore,
} from "../src/index.ts";

let home: string;
const prevHome = process.env.MOOTER_HOME;

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "mooter-pastor-"));
  process.env.MOOTER_HOME = home;
});
afterEach(() => {
  if (prevHome === undefined) delete process.env.MOOTER_HOME;
  else process.env.MOOTER_HOME = prevHome;
  rmSync(home, { recursive: true, force: true });
});

// ── per-task router ───────────────────────────────────────────────────────────

test("routeRequest routes a frontend task and preserves the classifier tier", () => {
  const r = routeRequest({
    prompt: "ajusta o layout do componente React e muda a cor do botão no Button.tsx",
    classify: { tier: "T2", task_category: "cross_file_change", lang_detected: "pt" },
  });
  assert.equal(r.task_type, "coding-frontend");
  assert.equal(r.tier, "T2"); // doctrine: tier unchanged
  assert.ok(r.matched);
});

test("routeRequest persists pastor state (active adapter) on a match", () => {
  routeRequest({
    prompt: "add an API auth middleware to the server route handler and validate the token",
    classify: { tier: "T2", task_category: "cross_file_change" },
  });
  const s = loadPastorState();
  assert.equal(s.active_type, "coding-backend");
  assert.ok(s.usage["pastor-backend"]);
  assert.equal(s.usage["pastor-backend"].count, 1);
});

test("routeRequest telemetry is FEATURES ONLY — never the prompt", () => {
  const secret = "SUPERSECRETPROMPTTOKEN write a blog article summary copy draft";
  routeRequest({ prompt: secret, classify: { tier: "T1", lang_detected: "en" } });
  const log = join(home, "pastor", "routes.jsonl");
  assert.ok(existsSync(log));
  const text = readFileSync(log, "utf8");
  assert.ok(!text.includes("SUPERSECRETPROMPTTOKEN"), "prompt content must not be logged");
  const rec = JSON.parse(text.trim().split("\n").pop()!);
  assert.ok("task_type" in rec && "tier" in rec && "confidence" in rec);
  assert.ok(!("prompt" in rec));
});

test("routeRequest dryRun does not persist state or telemetry", () => {
  routeRequest({
    prompt: "react component Button.tsx layout css",
    classify: { tier: "T2" },
    dryRun: true,
  });
  assert.ok(!existsSync(pastorStatePath()));
  assert.ok(!existsSync(join(home, "pastor", "routes.jsonl")));
});

test("routeRequest: feedback bias drops a matched winner below threshold → baseline", () => {
  const prompt = "muda a cor do botão React no componente Button.tsx e ajusta o layout css";
  // Baseline (no feedback) matches coding-frontend.
  assert.equal(routeRequest({ prompt, dryRun: true }).task_type, "coding-frontend");
  // Heavy rejection pulls the bias down enough to drop below the 0.7 threshold.
  for (let i = 0; i < 20; i++) recordFeedback("coding-frontend", false);
  const r = routeRequest({ prompt, dryRun: true });
  assert.equal(r.matched, false);
  assert.equal(r.task_type, "baseline");
  assert.equal(r.biased, true);
});

test("routeRequest: feedback bias elevates a sub-threshold specialist (accurate reason)", () => {
  const prompt = "fix the button"; // one mild frontend signal → base confidence < 0.7
  assert.equal(routeRequest({ prompt, dryRun: true }).matched, false); // baseline without feedback
  for (let i = 0; i < 10; i++) recordFeedback("coding-frontend", true);
  const r = routeRequest({ prompt, dryRun: true });
  assert.equal(r.matched, true);
  assert.equal(r.task_type, "coding-frontend");
  assert.match(r.reason, /elevated/); // not the stale "…→ baseline" string
  assert.ok(!/→ baseline/.test(r.reason));
});

// ── pastor state ──────────────────────────────────────────────────────────────

test("recordRoute updates rolling average confidence", () => {
  recordRoute("pastor-frontend", "coding-frontend", 0.8);
  recordRoute("pastor-frontend", "coding-frontend", 0.6);
  const s = loadPastorState();
  assert.equal(s.usage["pastor-frontend"].count, 2);
  assert.ok(Math.abs(s.usage["pastor-frontend"].avg_confidence - 0.7) < 1e-6);
});

test("summarizePastor reports registered count and active type", () => {
  recordRoute("pastor-data", "coding-data", 0.9);
  const sum = summarizePastor();
  assert.equal(sum.active_type, "coding-data");
  assert.equal(sum.registered, 5); // five specialised adapters (baseline excluded)
  assert.equal(sum.total_routes, 1);
});

// ── feedback incorporation ────────────────────────────────────────────────────

test("adapterBias is neutral (1.0) until ≥3 signals accumulate", () => {
  recordFeedback("coding-frontend", true);
  recordFeedback("coding-frontend", true);
  assert.equal(adapterBias("coding-frontend"), 1.0); // n=2 < 3
  recordFeedback("coding-frontend", true);
  assert.ok(adapterBias("coding-frontend") > 1.0); // n=3, all accepted → bias up
});

test("adapterBias drops below 1.0 when mostly rejected", () => {
  recordFeedback("coding-backend", false);
  recordFeedback("coding-backend", false);
  recordFeedback("coding-backend", false);
  assert.ok(adapterBias("coding-backend") < 1.0);
});

test("bias stays within the clamp band [0.75, 1.25]", () => {
  for (let i = 0; i < 50; i++) recordFeedback("coding-data", true);
  const b = adapterBias("coding-data");
  assert.ok(b >= 0.75 && b <= 1.25, `bias ${b} out of band`);
});

test("applyFeedbackBias re-sorts scores by biased confidence", () => {
  const scores: AdapterScore[] = [
    { adapter: "pastor-frontend", task_type: "coding-frontend", confidence: 0.5, cosine: 0.4, keyword_hits: [], ext_match: false, lang_match: true },
    { adapter: "pastor-backend", task_type: "coding-backend", confidence: 0.55, cosine: 0.4, keyword_hits: [], ext_match: false, lang_match: true },
  ];
  for (let i = 0; i < 10; i++) recordFeedback("coding-frontend", true);
  for (let i = 0; i < 10; i++) recordFeedback("coding-backend", false);
  const out = applyFeedbackBias(scores, loadFeedback());
  assert.equal(out[0].task_type, "coding-frontend"); // boosted past backend despite lower raw
});

// ── trainer stub (honest) ─────────────────────────────────────────────────────

test("trainSpec describes (does not run) a training spec", () => {
  const spec = trainSpec("coding-frontend");
  assert.ok(spec);
  assert.equal(spec?.method, "lora");
  assert.equal(spec?.adapter_name, "pastor-frontend");
  assert.ok(spec?.dataset_path.includes("coding-frontend"));
});

test("trainStatus reports phase 'none' when no run recorded", () => {
  assert.equal(trainStatus().phase, "none");
});
