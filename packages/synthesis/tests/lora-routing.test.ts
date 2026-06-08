import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  routeAdapter,
  selectAdapterForTask,
  autoSwapEnabled,
  tokenize,
  cosineSimilarity,
  extractFileExts,
  detectLang,
  buildIdf,
  hotSwapAdapter,
  swappedModelTag,
  listTaskAdapters,
  ROUTE_THRESHOLD,
  AUTO_SWAP_ENABLED,
  type RoutingFeatures,
} from "../src/index.ts";

let home: string;
const prevHome = process.env.MOOTER_HOME;
const prevSwap = process.env.MOOTER_LORA_AUTOSWAP;

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "mooter-route-"));
  process.env.MOOTER_HOME = home;
  delete process.env.MOOTER_LORA_AUTOSWAP;
});
afterEach(() => {
  if (prevHome === undefined) delete process.env.MOOTER_HOME;
  else process.env.MOOTER_HOME = prevHome;
  if (prevSwap === undefined) delete process.env.MOOTER_LORA_AUTOSWAP;
  else process.env.MOOTER_LORA_AUTOSWAP = prevSwap;
  rmSync(home, { recursive: true, force: true });
});

// ── tokenisation / helpers ────────────────────────────────────────────────────

test("tokenize lowercases, strips punctuation, drops stopwords", () => {
  const t = tokenize("Make the Button.tsx blue, please!");
  assert.ok(t.includes("make"));
  assert.ok(t.includes("button"));
  assert.ok(!t.includes("the"));
});

test("extractFileExts finds extensions and ignores version fragments", () => {
  const e = extractFileExts("edit Button.tsx and styles.css, not v1.2");
  assert.ok(e.includes(".tsx"));
  assert.ok(e.includes(".css"));
});

test("detectLang distinguishes pt vs en, other on no signal", () => {
  assert.equal(detectLang(tokenize("escreve um resumo do ficheiro em português")), "pt");
  assert.equal(detectLang(tokenize("write a summary of the file please")), "en");
  assert.equal(detectLang(tokenize("xyzzy qwop")), "other");
});

test("cosineSimilarity is 0 for disjoint, ~1 for identical", () => {
  const a = new Map([["x", 1], ["y", 2]]);
  const b = new Map([["z", 3]]);
  assert.equal(cosineSimilarity(a, b), 0);
  assert.ok(Math.abs(cosineSimilarity(a, a) - 1) < 1e-9);
});

test("buildIdf weighs distinctive terms above shared ones", () => {
  // Synthetic corpus: "shared" is in all 3 docs (common), "alpha" in one (distinctive).
  const fake = [
    { keyword_profile: ["shared", "alpha"] },
    { keyword_profile: ["shared", "beta"] },
    { keyword_profile: ["shared", "gamma"] },
  ] as unknown as Parameters<typeof buildIdf>[0];
  const idf = buildIdf(fake);
  assert.ok((idf.get("alpha") ?? 0) > (idf.get("shared") ?? 0), "distinctive term must outweigh shared term");
});

// ── routing: the five specialised task types ──────────────────────────────────

test("routes a clear frontend task to coding-frontend", () => {
  const d = routeAdapter({
    prompt: "muda a cor do botão de login e ajusta o layout do componente React no Button.tsx",
    prompt_class: "T2",
    task_category: "cross_file_change",
  });
  assert.equal(d.task_type, "coding-frontend");
  assert.ok(d.matched);
  assert.ok(d.confidence >= ROUTE_THRESHOLD);
});

test("routes a clear backend task to coding-backend", () => {
  const d = routeAdapter({
    prompt: "add an auth middleware to the API server route handler that validates the session token",
    prompt_class: "T2",
    task_category: "cross_file_change",
  });
  assert.equal(d.task_type, "coding-backend");
  assert.ok(d.matched);
});

test("routes a clear data task to coding-data", () => {
  const d = routeAdapter({
    prompt: "write a SQL query to aggregate the dataset and transform the dataframe pipeline in etl.sql",
    prompt_class: "T2",
    task_category: "cross_file_change",
  });
  assert.equal(d.task_type, "coding-data");
  assert.ok(d.matched);
});

test("routes PT-PT prose to prose-pt-pt", () => {
  const d = routeAdapter({
    prompt: "escreve um resumo em português sobre o artigo e redige um parágrafo de introdução",
    prompt_class: "T1",
    task_category: "simple_transform_or_explain",
    lang: "pt",
  });
  assert.equal(d.task_type, "prose-pt-pt");
  assert.ok(d.matched);
});

test("routes EN prose to prose-en", () => {
  const d = routeAdapter({
    prompt: "write a blog article and draft a summary paragraph, then proofread the copy",
    prompt_class: "T1",
    task_category: "simple_transform_or_explain",
    lang: "en",
  });
  assert.equal(d.task_type, "prose-en");
  assert.ok(d.matched);
});

test("ambiguous / empty prompt falls back to baseline (no match)", () => {
  const d = routeAdapter({ prompt: "what do you think about this?", prompt_class: "T2" });
  assert.equal(d.task_type, "baseline");
  assert.equal(d.matched, false);
  assert.ok(d.confidence < ROUTE_THRESHOLD);
});

test("a PT-PT *coding* task does not route to prose-pt-pt (language alone isn't evidence)", () => {
  const d = routeAdapter({
    prompt: "implementa o endpoint da API no servidor com o handler de autenticação",
    prompt_class: "T2",
    lang: "pt",
  });
  assert.notEqual(d.task_type, "prose-pt-pt");
});

// ── doctrine guardrail: tier is NEVER changed ─────────────────────────────────

test("doctrine guardrail: tier passes through unchanged for every tier", () => {
  for (const tier of ["T0", "T1", "T2", "T3"]) {
    const d = routeAdapter({
      prompt: "muda a cor do botão React no componente Button.tsx",
      prompt_class: tier,
    });
    assert.equal(d.tier, tier, `tier ${tier} must be preserved`);
  }
});

// ── opt-in gate (Wave 29 backward-compat contract) ────────────────────────────

test("selectAdapterForTask returns null by default (opt-in off)", () => {
  assert.equal(AUTO_SWAP_ENABLED, false);
  assert.equal(autoSwapEnabled(), false);
  const f: RoutingFeatures = { prompt: "react component Button.tsx", prompt_class: "T2" };
  assert.equal(selectAdapterForTask(f), null);
});

test("selectAdapterForTask returns the matched adapter when opted in", () => {
  process.env.MOOTER_LORA_AUTOSWAP = "1";
  assert.equal(autoSwapEnabled(), true);
  const a = selectAdapterForTask({
    prompt: "muda a cor do botão React no componente Button.tsx e ajusta o layout css",
    prompt_class: "T2",
  });
  assert.ok(a);
  assert.equal(a?.task_type, "coding-frontend");
});

// ── hot-swap (graceful, opt-in) ───────────────────────────────────────────────

test("hotSwapAdapter is opt-in: not_opted_in without the flag", () => {
  const r = hotSwapAdapter("pastor-frontend");
  assert.equal(r.reason, "not_opted_in");
  assert.equal(r.loaded, false);
});

test("hotSwapAdapter reports the loader reason when not ready (no_path)", () => {
  const r = hotSwapAdapter("pastor-frontend", { force: true, spawn: () => ({ status: 0 }) });
  // registered but not materialised → no_path, gracefully (never throws).
  assert.equal(r.loaded, false);
  assert.equal(r.reason, "no_path");
});

test("swappedModelTag derives a safe ollama tag", () => {
  assert.equal(swappedModelTag("pastor-frontend"), "mooter-pastor-frontend");
});
