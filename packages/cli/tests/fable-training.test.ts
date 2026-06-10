// Wave Mega 50-51 Phase 5 (training+validation half) — train-on-fable +
// replicate-test. HOME-isolated via explicit `home` option (span-feedback
// pattern); fixtures use schema v1 verbatim; ZERO network except the
// deliberately-unreachable port in the Ollama-down test.
import { test } from "node:test";
import assert from "node:assert";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  runTrainOnFable,
  fableTrainingPath,
  fableObservationsDir,
  fableCronPlan,
  FABLE_CRON_LINE,
  parseSinceWindow,
} from "../src/commands/fable-training.ts";
import { runFableReplicate } from "../src/fable-observe/replicate.ts";

// --- fixtures (schema v1 — duplicated on purpose; do not import the store) ---

const NOW_MS = Date.UTC(2026, 5, 10, 12, 0, 0); // 2026-06-10T12:00:00Z

function makeObservation(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    schema: 1,
    ts: new Date(NOW_MS - 60_000).toISOString(),
    ts_ms: NOW_MS - 60_000,
    session_id: "sess-test",
    orchestrator_model: "claude-fable-5",
    task_hash: "abcdef0123456789",
    task_type: "docs",
    prompt_len: 420,
    fable_decision: {
      action: "spawn_subagent",
      subagent_type: "general",
      model_chosen: "claude-fable-5",
      parallel_count: 2,
      rationale: "SECRET-RATIONALE doc task delegated to keep frontier context clean",
    },
    router_baseline: { tier: "T1", model: "claude-haiku-4", confidence: 0.82, task_category: "docs" },
    pattern_gap: "fable parallel-spawned where router suggested single T1",
    outcome: { completed: true, tests_pass: null },
    pastor_training_value: "high",
    ...overrides,
  };
}

function seedHome(observations: Record<string, unknown>[]): string {
  const home = mkdtempSync(join(tmpdir(), "mooter-fabletrain-"));
  const dir = fableObservationsDir(home);
  mkdirSync(dir, { recursive: true });
  for (const o of observations) {
    writeFileSync(join(dir, `${o.ts_ms}_${o.task_hash}.json`), JSON.stringify(o), "utf8");
  }
  return home;
}

// --- 1. conversion is FEATURES-ONLY (no prompt_text, no rationale) -----------

test("train-on-fable converts observations to features-only rows", () => {
  const home = seedHome([
    makeObservation({ prompt_text: "TOP-SECRET full prompt body that must never leak" }),
  ]);
  const res = runTrainOnFable([], { home, now: new Date(NOW_MS) });
  assert.equal(res.exitCode, 0);
  assert.match(res.output, /converted:\s+1 new training row/);
  // standing honest caveat: training is manual
  assert.match(res.output, /MANUAL on the RTX 4090/);
  assert.match(res.output, /LORA_TRAINING_RUNBOOK\.md/);

  const raw = readFileSync(fableTrainingPath(home), "utf8").trim();
  const row = JSON.parse(raw);
  // privacy invariants
  assert.ok(!raw.includes("TOP-SECRET"), "prompt_text leaked into training file");
  assert.ok(!raw.includes("SECRET-RATIONALE"), "rationale leaked into training file");
  assert.equal(row.prompt_text, undefined);
  assert.equal(row.rationale, undefined);
  // expected features
  assert.equal(row.task_hash, "abcdef0123456789");
  assert.equal(row.ts_ms, NOW_MS - 60_000);
  assert.equal(row.task_type, "docs");
  assert.equal(row.prompt_len, 420);
  assert.equal(row.fable_action, "spawn_subagent");
  assert.equal(row.fable_subagent, "general");
  assert.equal(row.fable_model, "claude-fable-5");
  assert.equal(row.fable_parallel_count, 2);
  assert.equal(row.baseline_tier, "T1");
  assert.equal(row.baseline_confidence, 0.82);
  assert.equal(row.baseline_category, "docs");
  assert.equal(row.gap_present, true);
  assert.equal(row.outcome_completed, true);
  assert.equal(row.training_value, "high");
});

// --- 2. window filter ----------------------------------------------------------

test("train-on-fable --observations-since 24h excludes old observations", () => {
  const old = makeObservation({
    task_hash: "1111111111111111",
    ts_ms: NOW_MS - 3 * 24 * 60 * 60 * 1000, // 3 days old
  });
  const recent = makeObservation({ task_hash: "2222222222222222", ts_ms: NOW_MS - 60_000 });
  const home = seedHome([old, recent]);
  const res = runTrainOnFable(["--observations-since", "24h"], { home, now: new Date(NOW_MS) });
  assert.equal(res.exitCode, 0);
  assert.match(res.output, /converted:\s+1 new training row/);
  assert.match(res.output, /1 outside window/);
  const lines = readFileSync(fableTrainingPath(home), "utf8").trim().split("\n");
  assert.equal(lines.length, 1);
  assert.equal(JSON.parse(lines[0]).task_hash, "2222222222222222");
  // sanity on the parser itself
  assert.equal(parseSinceWindow("24h"), 24 * 60 * 60 * 1000);
  assert.equal(parseSinceWindow("7d"), 7 * 24 * 60 * 60 * 1000);
  assert.equal(parseSinceWindow("all"), null);
  assert.equal(parseSinceWindow("nonsense"), undefined);
});

// --- 3. dedup by task_hash+ts_ms -------------------------------------------------

test("train-on-fable dedups by task_hash+ts_ms across runs", () => {
  const home = seedHome([makeObservation()]);
  const first = runTrainOnFable([], { home, now: new Date(NOW_MS) });
  assert.match(first.output, /converted:\s+1 new training row/);
  const second = runTrainOnFable([], { home, now: new Date(NOW_MS) });
  assert.match(second.output, /converted:\s+0 new training row/);
  assert.match(second.output, /deduped-out: 1/);
  const lines = readFileSync(fableTrainingPath(home), "utf8").trim().split("\n");
  assert.equal(lines.length, 1, "second run must not append a duplicate");
});

// --- 4. --dry-run writes nothing -------------------------------------------------

test("train-on-fable --dry-run prints summary without writing", () => {
  const home = seedHome([makeObservation()]);
  const res = runTrainOnFable(["--dry-run"], { home, now: new Date(NOW_MS) });
  assert.equal(res.exitCode, 0);
  assert.match(res.output, /dry-run, nothing written/);
  assert.match(res.output, /converted:\s+1 new training row/);
  assert.ok(!existsSync(fableTrainingPath(home)), "dry-run must not create the training file");
});

// --- 5. replicate: feature-comparison fallback (no prompt stored, no Ollama) -----

test("replicate-test falls back to honest feature comparison when no prompt_text", async () => {
  const home = seedHome([makeObservation()]); // default: NO prompt_text
  const res = await runFableReplicate(["abcdef0123456789"], { home });
  assert.equal(res.exitCode, 0);
  assert.match(res.output, /prompt_text was NOT stored/);
  assert.match(res.output, /Full replication is impossible/);
  assert.match(res.output, /router baseline:\s+T1/);
  assert.match(res.output, /not-replayable/);
  assert.match(res.output, /no claim about quality parity/i);
  // and --with-ollama is honestly ignored without a prompt
  const res2 = await runFableReplicate(["abcdef0123456789", "--with-ollama"], { home });
  assert.match(res2.output, /--with-ollama ignored/);
});

// --- 6. replicate: Ollama down → graceful fallback -------------------------------

test("replicate-test --with-ollama degrades gracefully when Ollama is unreachable", async () => {
  const home = seedHome([
    makeObservation({ prompt_text: "write a haiku about routers" }),
  ]);
  const res = await runFableReplicate(["abcdef0123456789", "--with-ollama"], {
    home,
    ollamaUrl: "http://127.0.0.1:59999", // deliberately unused port
  });
  assert.equal(res.exitCode, 0, "Ollama-down must not be a hard failure");
  assert.match(res.output, /Ollama unreachable/);
  assert.match(res.output, /FEATURE comparison/);
  assert.match(res.output, /verdict: inconclusive/);
});

// --- 7. --install-cron is a dry-run by default ------------------------------------

test("train-on-fable --install-cron prints the crontab line without installing", () => {
  const home = mkdtempSync(join(tmpdir(), "mooter-fablecron-"));
  const res = runTrainOnFable(["--install-cron"], { home });
  assert.equal(res.exitCode, 0);
  assert.match(res.output, /dry-run — nothing installed/);
  assert.ok(res.output.includes(FABLE_CRON_LINE), "must print the exact crontab line");
  assert.ok(
    res.output.includes("0 2 * * * mooter pastor train-on-fable --observations-since 24h"),
    "02:00 nightly line",
  );
  // plan helper is the single source of the line
  assert.equal(fableCronPlan("linux").line, FABLE_CRON_LINE);
  assert.match(fableCronPlan("win32").install, /schtasks/);
});

// --- 8. replicate: unknown hash → honest error -----------------------------------

test("replicate-test reports honestly when the task_hash has no observation", async () => {
  const home = mkdtempSync(join(tmpdir(), "mooter-fablerep-empty-"));
  const res = await runFableReplicate(["deadbeefdeadbeef"], { home });
  assert.equal(res.exitCode, 1);
  assert.match(res.output, /no observation found for task_hash deadbeefdeadbeef/);
  const bad = await runFableReplicate(["nothex"], { home });
  assert.equal(bad.exitCode, 1);
  assert.match(bad.output, /not a task_hash/);
});
