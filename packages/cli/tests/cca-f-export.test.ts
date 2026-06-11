// Wave 53 Phase I — `mooter cca-f export` (CCA-F audit data export).
// HOME-isolated. Reads the REAL FableObservation store; asserts privacy + that
// no per-decision token/cost fields are fabricated.
import { test } from "node:test";
import assert from "node:assert";
import { mkdtempSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { runCcaFExport, classifyDomain, toCcaFRecord, parseSince } from "../src/fable-observe/cca-f-export.ts";
import { writeObservation } from "../src/fable-observe/store.ts";
import type { FableObservation } from "../src/fable-observe/schema.ts";

const NOW = Date.parse("2026-06-10T12:00:00.000Z");
const fixedNow = () => NOW;

function freshHome(): string {
  return mkdtempSync(join(tmpdir(), "mooter-ccaf-"));
}

function obs(overrides: Partial<FableObservation> = {}): FableObservation {
  return {
    schema: 1,
    ts: new Date(NOW - 3600_000).toISOString(),
    ts_ms: NOW - 3600_000,
    session_id: "s1",
    orchestrator_model: "claude-fable-5",
    task_hash: "0123456789abcdef",
    task_type: "coding",
    prompt_len: 42,
    fable_decision: { action: "spawn_subagent", subagent_type: "model-reasoner", model_chosen: "sonnet", parallel_count: null, rationale: null },
    router_baseline: { tier: "T2", model: "sonnet", confidence: 0.7, task_category: "bug" },
    pattern_gap: null,
    outcome: { completed: true, tests_pass: null },
    pastor_training_value: "medium",
    ...overrides,
  };
}

function exportFile(home: string): string {
  return join(home, ".mooter", "cca-f", "export-2026-06-10.jsonl");
}

test("export writes one JSONL record per observation with real fields only", () => {
  const home = freshHome();
  writeObservation(obs(), home);
  const res = runCcaFExport(["export"], { home, now: fixedNow });
  assert.strictEqual(res.exitCode, 0);
  assert.ok(existsSync(exportFile(home)), "export file should exist");
  const lines = readFileSync(exportFile(home), "utf8").trim().split("\n");
  assert.strictEqual(lines.length, 1);
  const rec = JSON.parse(lines[0]);
  assert.strictEqual(rec.prompt_classification, "T2");
  assert.strictEqual(rec.model_chosen, "sonnet");
  assert.strictEqual(rec.confidence, 0.7);
  assert.strictEqual(rec.completed, true);
  // honesty: NO fabricated per-decision token/cost/duration fields
  for (const k of ["tokens_in", "tokens_out", "cost_usd", "duration_ms"]) {
    assert.ok(!(k in rec), `record must not carry ${k}`);
  }
});

test("privacy: prompt_ref is the task_hash (≤50) when prompts are not stored", () => {
  const r = toCcaFRecord(obs());
  assert.strictEqual(r.prompt_ref, "0123456789abcdef");
  assert.strictEqual(r.prompt_is_hash, true);
  assert.ok(r.prompt_ref.length <= 50);
});

test("privacy: prompt_ref is a ≤50-char preview when store_prompts opted in", () => {
  const long = "spawn a subagent to ".repeat(10); // > 50 chars
  const r = toCcaFRecord(obs({ prompt_text: long }));
  assert.strictEqual(r.prompt_is_hash, false);
  assert.strictEqual(r.prompt_ref, long.slice(0, 50));
  assert.ok(r.prompt_ref.length <= 50);
});

test("classifyDomain: task_type base + keyword refinement when prompt present", () => {
  assert.strictEqual(classifyDomain(obs({ task_type: "orchestration" })), "agentic");
  assert.strictEqual(classifyDomain(obs({ task_type: "coding" })), "coding");
  assert.strictEqual(classifyDomain(obs({ task_type: "docs" })), "docs");
  // prompt text overrides via deterministic keyword heuristic
  assert.strictEqual(classifyDomain(obs({ task_type: "other", prompt_text: "use an MCP tool server" })), "mcp");
  assert.strictEqual(classifyDomain(obs({ task_type: "coding", prompt_text: "delegate to a subagent" })), "agentic");
});

test("parseSince parses N{h,d,w}; undefined when absent or malformed", () => {
  assert.strictEqual(parseSince(["export", "--last", "7d"], NOW), NOW - 7 * 86400000);
  assert.strictEqual(parseSince(["export", "--last", "24h"], NOW), NOW - 24 * 3600000);
  assert.strictEqual(parseSince(["export", "--last", "2w"], NOW), NOW - 2 * 604800000);
  assert.strictEqual(parseSince(["export"], NOW), undefined);
  assert.strictEqual(parseSince(["export", "--last", "soon"], NOW), undefined);
});

test("--last window filters out older decisions", () => {
  const home = freshHome();
  writeObservation(obs({ task_hash: "aaaaaaaaaaaaaaaa", ts_ms: NOW - 2 * 86400000 }), home); // 2d ago
  writeObservation(obs({ task_hash: "bbbbbbbbbbbbbbbb", ts_ms: NOW - 10 * 86400000 }), home); // 10d ago
  runCcaFExport(["export", "--last", "7d"], { home, now: fixedNow });
  const lines = readFileSync(exportFile(home), "utf8").trim().split("\n").filter(Boolean);
  assert.strictEqual(lines.length, 1);
  assert.strictEqual(JSON.parse(lines[0]).decision_id, `aaaaaaaaaaaaaaaa-${NOW - 2 * 86400000}`);
});

test("empty store → 0 records, file still created, exit 0", () => {
  const home = freshHome();
  const res = runCcaFExport(["export"], { home, now: fixedNow });
  assert.strictEqual(res.exitCode, 0);
  assert.ok(existsSync(exportFile(home)));
  assert.strictEqual(readFileSync(exportFile(home), "utf8"), "");
});

test("unknown subcommand → exit 1", () => {
  const res = runCcaFExport(["frobnicate"], { home: freshHome(), now: fixedNow });
  assert.strictEqual(res.exitCode, 1);
});
