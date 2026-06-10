// Wave Mega 50-51 Phase 5 — `mooter fable-observe` (Fable 5 observation loop).
// HOME-isolated (pattern from observability.test.ts). The baseline test runs
// the REAL sha-frozen tools/router/classify.js read-only.
import { test } from "node:test";
import assert from "node:assert";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { runFableObserve } from "../src/commands/fable-observe.ts";
import { validateObservation, type FableObservation } from "../src/fable-observe/schema.ts";
import { writeObservation, listObservations, statsObservations, patternsFor } from "../src/fable-observe/store.ts";

const REPO_ROOT = fileURLToPath(new URL("../../..", import.meta.url));
const CLASSIFY_JS = join(REPO_ROOT, "tools", "router", "classify.js");
const HOOK_JS = join(REPO_ROOT, "tools", "router", "hooks", "fable-observe-posttool.js");

function freshHome(): string {
  return mkdtempSync(join(tmpdir(), "mooter-fable-obs-"));
}

function obsDir(home: string): string {
  return join(home, ".mooter", "fable-observations");
}

function obsFiles(home: string): string[] {
  try {
    return readdirSync(obsDir(home)).filter((f) => f.endsWith(".json"));
  } catch {
    return [];
  }
}

function validObservation(overrides: Partial<FableObservation> = {}): FableObservation {
  return {
    schema: 1,
    ts: "2026-06-09T12:00:00.000Z",
    ts_ms: 1781006400000,
    session_id: "s-fable",
    orchestrator_model: "claude-fable-5",
    task_hash: "0123456789abcdef",
    task_type: "coding",
    prompt_len: 42,
    fable_decision: {
      action: "spawn_subagent",
      subagent_type: "model-reasoner",
      model_chosen: "claude-sonnet-4-6",
      parallel_count: null,
      rationale: "bug hunt fits Sonnet",
    },
    router_baseline: { tier: "T2", model: "claude-sonnet-4-6", confidence: 0.7, task_category: "reasoning_intermediate" },
    pattern_gap: null,
    outcome: { completed: true, tests_pass: null },
    pastor_training_value: "high",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// 1. schema validation accepts a valid observation

test("validateObservation accepts a fully valid schema-v1 observation", () => {
  assert.deepStrictEqual(validateObservation(validObservation()), []);
  // router_baseline null is also valid
  assert.deepStrictEqual(validateObservation(validObservation({ router_baseline: null })), []);
});

// ---------------------------------------------------------------------------
// 2. schema validation rejects bad observations

test("validateObservation rejects bad task_type, bad hash, missing action, bad training value", () => {
  const badType = validateObservation(validObservation({ task_type: "banana" as never }));
  assert.ok(badType.some((e) => e.includes("task_type")));

  const badHash = validateObservation(validObservation({ task_hash: "XYZ" }));
  assert.ok(badHash.some((e) => e.includes("task_hash")));

  const noAction = validObservation();
  // @ts-expect-error intentional break
  delete noAction.fable_decision.action;
  assert.ok(validateObservation(noAction).some((e) => e.includes("fable_decision.action")));

  const badValue = validateObservation(validObservation({ pastor_training_value: "amazing" as never }));
  assert.ok(badValue.some((e) => e.includes("pastor_training_value")));

  assert.ok(validateObservation("not an object").length > 0);
});

// ---------------------------------------------------------------------------
// 3. enable/disable roundtrip + privacy warning on --store-prompts

test("enable/disable roundtrip persists to ~/.mooter/fable-observe.json; --store-prompts warns", async () => {
  const home = freshHome();

  let r = await runFableObserve(["status"], { home });
  assert.strictEqual(r.exitCode, 0);
  assert.match(r.output, /fable-observe: disabled/);
  assert.match(r.output, /hash-only/);

  r = await runFableObserve(["enable"], { home });
  assert.strictEqual(r.exitCode, 0);
  let onDisk = JSON.parse(readFileSync(join(home, ".mooter", "fable-observe.json"), "utf8"));
  assert.strictEqual(onDisk.enabled, true);
  assert.strictEqual(onDisk.store_prompts, false);
  assert.doesNotMatch(r.output, /privacy warning/);

  r = await runFableObserve(["enable", "--store-prompts"], { home });
  assert.match(r.output, /privacy warning/i);
  assert.match(r.output, /RAW PROMPT TEXT/);
  onDisk = JSON.parse(readFileSync(join(home, ".mooter", "fable-observe.json"), "utf8"));
  assert.strictEqual(onDisk.store_prompts, true);

  r = await runFableObserve(["disable"], { home });
  assert.strictEqual(r.exitCode, 0);
  onDisk = JSON.parse(readFileSync(join(home, ".mooter", "fable-observe.json"), "utf8"));
  assert.strictEqual(onDisk.enabled, false);
});

// ---------------------------------------------------------------------------
// 4. log --json with prompt → hash computed, text NOT stored by default

test("log --json hashes a prompt field and does NOT store the text by default", async () => {
  const home = freshHome();
  await runFableObserve(["enable"], { home });

  const prompt = "investigate why websocket reconnect fails";
  const payload = {
    task_type: "reasoning",
    prompt,
    fable_decision: { action: "spawn_subagent", subagent_type: "model-reasoner" },
    pastor_training_value: "high",
  };
  const r = await runFableObserve(["log", "--json", JSON.stringify(payload)], { home, classifyJs: CLASSIFY_JS });
  assert.strictEqual(r.exitCode, 0, r.output);
  assert.match(r.output, /observation recorded/);
  assert.match(r.output, /hash-only/);

  const files = obsFiles(home);
  assert.strictEqual(files.length, 1);
  const obs = JSON.parse(readFileSync(join(obsDir(home), files[0]), "utf8"));
  const expectedHash = createHash("sha256").update(prompt, "utf8").digest("hex").slice(0, 16);
  assert.strictEqual(obs.task_hash, expectedHash);
  assert.strictEqual(obs.prompt_len, prompt.length);
  assert.strictEqual(obs.prompt_text, undefined);
  assert.strictEqual(obs.schema, 1);
  assert.strictEqual(obs.orchestrator_model, "claude-fable-5");
  assert.ok(!JSON.stringify(obs).includes(prompt), "raw prompt text must not appear anywhere in the file");
  // filename convention <ts_ms>_<task_hash>.json
  assert.match(files[0], new RegExp(`^\\d+_${expectedHash}\\.json$`));
});

// ---------------------------------------------------------------------------
// 5. store_prompts opt-in stores the text

test("log --json stores prompt_text when store_prompts opt-in is enabled", async () => {
  const home = freshHome();
  await runFableObserve(["enable", "--store-prompts"], { home });

  const prompt = "summarize the llm.ts module";
  const r = await runFableObserve(
    ["log", "--json", JSON.stringify({ task_type: "docs", prompt, fable_decision: { action: "inline" }, pastor_training_value: "low" })],
    { home, classifyJs: CLASSIFY_JS },
  );
  assert.strictEqual(r.exitCode, 0, r.output);
  assert.match(r.output, /prompt text STORED/);

  const files = obsFiles(home);
  assert.strictEqual(files.length, 1);
  const obs = JSON.parse(readFileSync(join(obsDir(home), files[0]), "utf8"));
  assert.strictEqual(obs.prompt_text, prompt);
});

// ---------------------------------------------------------------------------
// 6. baseline auto-fill from the real classify.js

test("log --json auto-fills router_baseline from the real classify.js", async () => {
  assert.ok(existsSync(CLASSIFY_JS), `classify.js missing at ${CLASSIFY_JS}`);
  const home = freshHome();
  await runFableObserve(["enable"], { home });

  const prompt = "investigate why websocket reconnect fails";
  const r = await runFableObserve(
    ["log", "--json", JSON.stringify({ task_type: "reasoning", prompt, fable_decision: { action: "spawn_subagent", subagent_type: "model-reasoner" }, pastor_training_value: "high" })],
    { home, classifyJs: CLASSIFY_JS },
  );
  assert.strictEqual(r.exitCode, 0, r.output);

  const obs = JSON.parse(readFileSync(join(obsDir(home), obsFiles(home)[0]), "utf8"));
  // Cross-check against a direct read-only run of the same frozen classifier.
  const direct = JSON.parse(execFileSync("node", [CLASSIFY_JS, prompt], { encoding: "utf8" }));
  assert.ok(obs.router_baseline, "router_baseline must be auto-filled when a prompt is available");
  assert.strictEqual(obs.router_baseline.tier, direct.tier);
  assert.strictEqual(obs.router_baseline.model, direct.recommended_model);
  assert.strictEqual(obs.router_baseline.task_category, direct.task_category);
  assert.strictEqual(typeof obs.router_baseline.confidence, "number");
});

// ---------------------------------------------------------------------------
// 7. log refused while disabled; invalid payload rejected with schema errors

test("log is refused while disabled; schema-invalid payload is rejected", async () => {
  const home = freshHome();
  let r = await runFableObserve(["log", "--json", "{}"], { home });
  assert.strictEqual(r.exitCode, 1);
  assert.match(r.output, /disabled/);

  await runFableObserve(["enable"], { home });
  r = await runFableObserve(["log", "--json", JSON.stringify({ task_type: "coding", prompt: "x", fable_decision: {}, pastor_training_value: "nope" })], { home, classifyJs: CLASSIFY_JS });
  assert.strictEqual(r.exitCode, 1);
  assert.match(r.output, /observation rejected/);
  assert.match(r.output, /fable_decision\.action/);
  assert.match(r.output, /pastor_training_value/);
  assert.strictEqual(obsFiles(home).length, 0);

  r = await runFableObserve(["log", "--json", "not json"], { home });
  assert.strictEqual(r.exitCode, 1);
  assert.match(r.output, /invalid JSON/);
});

// ---------------------------------------------------------------------------
// 8. last + stats + pattern empty states

test("last/stats/pattern are honest about the empty state", async () => {
  const home = freshHome();
  let r = await runFableObserve(["last"], { home });
  assert.strictEqual(r.exitCode, 0);
  assert.match(r.output, /no Fable observations yet/);

  r = await runFableObserve(["stats"], { home });
  assert.strictEqual(r.exitCode, 0);
  assert.match(r.output, /no Fable observations yet/);

  r = await runFableObserve(["pattern", "coding"], { home });
  assert.strictEqual(r.exitCode, 0);
  assert.match(r.output, /no observations for task_type "coding"/);
});

// ---------------------------------------------------------------------------
// 9. last/stats render real observations; store list/since/limit + stats math

test("last + stats render observations; listObservations honors since/limit", async () => {
  const home = freshHome();
  writeObservation(validObservation({ ts_ms: 1000, task_hash: "aaaaaaaaaaaaaaaa", task_type: "coding", pastor_training_value: "high", pattern_gap: "router said inline, Fable spawned" }), home);
  writeObservation(validObservation({ ts_ms: 2000, task_hash: "bbbbbbbbbbbbbbbb", task_type: "docs", pastor_training_value: "low", router_baseline: null, fable_decision: { action: "inline", subagent_type: null, model_chosen: null, parallel_count: null, rationale: null } }), home);
  writeObservation(validObservation({ ts_ms: 3000, task_hash: "cccccccccccccccc", task_type: "coding", pastor_training_value: "medium" }), home);

  const all = listObservations(home);
  assert.deepStrictEqual(all.map((o) => o.ts_ms), [3000, 2000, 1000]);
  assert.deepStrictEqual(listObservations(home, { since: 2000 }).map((o) => o.ts_ms), [3000, 2000]);
  assert.deepStrictEqual(listObservations(home, { limit: 1 }).map((o) => o.ts_ms), [3000]);

  const s = statsObservations(all);
  assert.strictEqual(s.total, 3);
  assert.strictEqual(s.by_task_type.coding, 2);
  assert.strictEqual(s.by_action.spawn_subagent, 2);
  assert.strictEqual(s.by_action.inline, 1);
  assert.strictEqual(s.with_pattern_gap, 1);
  assert.strictEqual(s.with_baseline, 2);
  assert.ok(Math.abs(s.high_value_share - 1 / 3) < 1e-9);

  let r = await runFableObserve(["last", "2"], { home });
  assert.strictEqual(r.exitCode, 0);
  assert.match(r.output, /last 2 Fable observation/);
  assert.match(r.output, /spawn_subagent→model-reasoner/);
  assert.match(r.output, /inline/);

  r = await runFableObserve(["stats"], { home });
  assert.match(r.output, /3 observation/);
  assert.match(r.output, /coding:2/);
  assert.match(r.output, /1\/3 observation\(s\) diverged/);
});

// ---------------------------------------------------------------------------
// 10. pattern aggregation

test("pattern <task_type> aggregates action+subagent combos with counts and rationales", async () => {
  const home = freshHome();
  writeObservation(validObservation({ ts_ms: 1, task_hash: "aaaaaaaaaaaaaaa1" }), home);
  writeObservation(validObservation({ ts_ms: 2, task_hash: "aaaaaaaaaaaaaaa2" }), home);
  writeObservation(validObservation({ ts_ms: 3, task_hash: "aaaaaaaaaaaaaaa3", fable_decision: { action: "inline", subagent_type: null, model_chosen: null, parallel_count: null, rationale: "single-file typo" } }), home);

  const entries = patternsFor(listObservations(home), "coding");
  assert.strictEqual(entries.length, 2);
  assert.strictEqual(entries[0].count, 2);
  assert.strictEqual(entries[0].action, "spawn_subagent");
  assert.strictEqual(entries[0].subagent_type, "model-reasoner");
  assert.deepStrictEqual(entries[0].models, ["claude-sonnet-4-6"]);

  const r = await runFableObserve(["pattern", "coding"], { home });
  assert.strictEqual(r.exitCode, 0);
  assert.match(r.output, /2×\s+spawn_subagent → model-reasoner/);
  assert.match(r.output, /"single-file typo"/);
});

// ---------------------------------------------------------------------------
// 11. hook: enabled + Task spawn payload → minimal observation, no prompt text

test("PostToolUse hook writes a minimal auto-observation for an Agent/Task spawn", async () => {
  const home = freshHome();
  await runFableObserve(["enable"], { home });

  const payload = {
    session_id: "s-hook",
    tool_name: "Task",
    tool_input: {
      subagent_type: "model-reasoner",
      description: "hunt the reconnect bug",
      prompt: "SECRET PROMPT TEXT do not persist",
    },
  };
  execFileSync("node", [HOOK_JS], { input: JSON.stringify(payload), env: { ...process.env, HOME: home } });

  const files = obsFiles(home);
  assert.strictEqual(files.length, 1);
  const raw = readFileSync(join(obsDir(home), files[0]), "utf8");
  const obs = JSON.parse(raw);
  assert.deepStrictEqual(validateObservation(obs), []);
  assert.strictEqual(obs.fable_decision.action, "spawn_subagent");
  assert.strictEqual(obs.fable_decision.subagent_type, "model-reasoner");
  assert.strictEqual(obs.task_type, "orchestration");
  assert.strictEqual(obs.pastor_training_value, "medium");
  assert.strictEqual(obs.session_id, "s-hook");
  assert.strictEqual(obs.prompt_len, payload.tool_input.prompt.length);
  assert.ok(!raw.includes("SECRET PROMPT TEXT"), "hook must never store prompt text");
});

// ---------------------------------------------------------------------------
// 12. hook: disabled → no write, exit 0; non-spawn payload → no write; garbage stdin → exit 0

test("PostToolUse hook degrades silently: disabled config, non-spawn tool, garbage input", async () => {
  const home = freshHome(); // no config at all → disabled
  const spawnPayload = { tool_name: "Task", tool_input: { subagent_type: "cheap-triage", prompt: "x" } };

  execFileSync("node", [HOOK_JS], { input: JSON.stringify(spawnPayload), env: { ...process.env, HOME: home } });
  assert.strictEqual(obsFiles(home).length, 0, "disabled → no observation written");

  await runFableObserve(["enable"], { home });
  // a plain Bash call is not an orchestration decision
  execFileSync("node", [HOOK_JS], { input: JSON.stringify({ tool_name: "Bash", tool_input: { command: "ls" } }), env: { ...process.env, HOME: home } });
  assert.strictEqual(obsFiles(home).length, 0, "non-spawn tool → no observation");

  // garbage stdin must still exit 0 (execFileSync throws on non-zero)
  execFileSync("node", [HOOK_JS], { input: "{{{ not json", env: { ...process.env, HOME: home } });
  execFileSync("node", [HOOK_JS], { input: "", env: { ...process.env, HOME: home } });
  assert.strictEqual(obsFiles(home).length, 0);
});
