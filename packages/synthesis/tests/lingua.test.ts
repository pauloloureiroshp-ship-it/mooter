import { test } from "node:test";
import assert from "node:assert/strict";
import {
  SYNTHESIS_VERSION,
  SYNTHESIS_LAYERS,
  isSynthesisReady,
  compressPrompt,
  compressHeuristic,
  estimateTokens,
  planCompression,
  compressWithinBudget,
  DEFAULT_BUDGET,
  type BudgetConfig,
} from "../src/index.ts";

test("package version + readiness are published", () => {
  assert.equal(SYNTHESIS_VERSION, "0.1.0");
  assert.equal(isSynthesisReady(), true);
  assert.equal(SYNTHESIS_LAYERS.length, 5);
});

test("estimateTokens is monotonic and deterministic", () => {
  const a = estimateTokens("hello world");
  const b = estimateTokens("hello world again and again");
  assert.ok(a > 0);
  assert.ok(b > a);
  assert.equal(estimateTokens("hello world"), a); // deterministic
  assert.equal(estimateTokens(""), 0);
});

const VERBOSE = `Please note that in order to fix the bug you should really just simply
look at the file src/router/classify.js and check that the function classifyPrompt
actually returns the correct tier. It is very important that you basically verify
the TypeError: cannot read property 'tier' of undefined error is gone. The URL
https://mooter.ai/docs explains this in detail. Version 1.2.3 is affected.`;

test("heuristic compression reduces tokens while preserving entities", () => {
  const r = compressHeuristic(VERBOSE, { target_ratio: 3, preserve_entities: true });
  assert.equal(r.backend, "heuristic");
  assert.ok(r.compressed_tokens < r.original_tokens, "should shrink");
  assert.ok(r.ratio > 1, "ratio > 1");
  // Entities must survive.
  assert.ok(r.compressed.includes("src/router/classify.js"), "file path kept");
  assert.ok(r.compressed.includes("classifyPrompt"), "identifier kept");
  assert.ok(r.compressed.includes("https://mooter.ai/docs"), "URL kept");
  assert.ok(r.compressed.includes("1.2.3"), "version kept");
  assert.ok(r.compressed.includes("TypeError"), "error kept");
  assert.ok(r.preserved_entities > 0, "entity spans counted");
});

test("filler words are dropped, content words survive", () => {
  const r = compressHeuristic("you should really just simply verify the output", {
    target_ratio: 2,
    preserve_entities: false,
  });
  assert.ok(!/\breally\b/.test(r.compressed));
  assert.ok(!/\bsimply\b/.test(r.compressed));
  assert.ok(/verify/.test(r.compressed));
  assert.ok(/output/.test(r.compressed));
});

test("single-line error message does not over-protect the rest of the line", () => {
  // Regression: the error-line pattern used to be `[^\n]*` (greedy to EOL), which
  // on a single-line prompt swallowed everything after the error and blocked
  // compression of the following sentence.
  const oneLine =
    "you should really just simply verify the TypeError: cannot read property 'tier' of undefined is gone. The output is at https://mooter.ai/docs and it is really very important to check it.";
  const r = compressHeuristic(oneLine, { target_ratio: 3, preserve_entities: true });
  assert.ok(r.compressed.includes("TypeError"), "error type preserved");
  assert.ok(r.compressed.includes("https://mooter.ai/docs"), "URL preserved");
  // Filler in the SECOND sentence (after the error) must still be dropped.
  assert.ok(!/important to check it.*\breally\b/.test(r.compressed), "post-error filler dropped");
  assert.ok(r.compressed_tokens < r.original_tokens);
});

test("budget floor: tiny prompts pass through with backend none", () => {
  const r = compressPrompt("fix the bug", { target_ratio: 4, preserve_entities: true, budget_min_tokens: 64 });
  assert.equal(r.backend, "none");
  assert.equal(r.ratio, 1);
  assert.equal(r.compressed, "fix the bug");
});

test("backend none short-circuits regardless of size", () => {
  const r = compressPrompt(VERBOSE, { target_ratio: 4, preserve_entities: true, backend: "none" });
  assert.equal(r.backend, "none");
  assert.equal(r.compressed, VERBOSE);
});

test("auto backend falls back to heuristic when llmlingua import fails", () => {
  // Inject a spawn that reports python import failure → forces heuristic path.
  const fakeSpawn = () => ({ status: 1, stdout: "" });
  const r = compressPrompt(VERBOSE, {
    target_ratio: 3,
    preserve_entities: true,
    backend: "auto",
    spawn: fakeSpawn,
  });
  assert.equal(r.backend, "heuristic");
  assert.ok(r.compressed_tokens < r.original_tokens);
});

test("planCompression honours the opt-in switch and min-tokens gate", () => {
  const disabled = planCompression(VERBOSE, DEFAULT_BUDGET);
  assert.equal(disabled.compress, false);
  assert.equal(disabled.reason, "disabled");

  const cfg: BudgetConfig = { ...DEFAULT_BUDGET, enabled: true, min_tokens_to_compress: 10 };
  const eligible = planCompression(VERBOSE, cfg);
  assert.equal(eligible.compress, true);
  assert.equal(eligible.reason, "eligible");

  const tooSmall = planCompression("short prompt", { ...cfg, min_tokens_to_compress: 200 });
  assert.equal(tooSmall.compress, false);
  assert.equal(tooSmall.reason, "below_min_tokens");
});

test("compressWithinBudget: disabled is a clean no-op, enabled saves tokens", () => {
  const off = compressWithinBudget(VERBOSE, DEFAULT_BUDGET, () => ({ status: 1, stdout: "" }));
  assert.equal(off.result.backend, "none");
  assert.equal(off.saved_tokens, 0);
  assert.equal(off.result.compressed, VERBOSE);

  const on = compressWithinBudget(
    VERBOSE,
    { ...DEFAULT_BUDGET, enabled: true, min_tokens_to_compress: 10 },
    () => ({ status: 1, stdout: "" }),
  );
  assert.equal(on.result.backend, "heuristic");
  assert.ok(on.saved_tokens > 0);
});
