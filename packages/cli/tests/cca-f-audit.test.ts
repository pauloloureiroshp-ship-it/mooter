// Wave 54 — CCA-F audit harness. HOME-isolated, LLM transports injected (offline,
// deterministic). Asserts: seed reproducibility, exact domain allocation, rubric
// scoring, honest failure handling (no fabricated pass), report aggregation,
// learning staging (R4 — staged only), and the mandatory honest disclaimer.
import { test } from "node:test";
import assert from "node:assert";
import { mkdtempSync, readFileSync, existsSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  generateQuestions,
  validateQuestions,
  difficultySplit,
  DOMAIN_ALLOCATION,
  TOTAL_QUESTIONS,
  type CCAFQuestion,
} from "../src/fable-observe/cca-f-questions.ts";
import { selfJudge, parseJudgeJson, buildJudgePrompt } from "../src/fable-observe/cca-f-judge.ts";
import {
  buildReport,
  measureClassifyIntegrity,
  FROZEN_CLASSIFY_SHA,
  type DecisionRecord,
  type AuditDeps,
} from "../src/fable-observe/cca-f-audit.ts";
import { filterHighConfidence, stageLearning } from "../src/fable-observe/cca-f-learn.ts";
import { renderReportMarkdown } from "../src/fable-observe/cca-f-report.ts";
import { runAuditPipeline } from "../src/fable-observe/cca-f-audit-cmd.ts";
import { buildPublishPayload } from "../src/fable-observe/cca-f-publish.ts";

function freshHome(): string {
  return mkdtempSync(join(tmpdir(), "ccaf-audit-"));
}

// ── Phase A — question generator ────────────────────────────────────────────

test("generateQuestions: same seed ⇒ identical 60 questions (reproducible)", () => {
  const a = generateQuestions(42);
  const b = generateQuestions(42);
  assert.deepStrictEqual(a, b);
  assert.strictEqual(a.length, TOTAL_QUESTIONS);
});

test("generateQuestions: different seed ⇒ different questions", () => {
  assert.notDeepStrictEqual(generateQuestions(42), generateQuestions(7));
});

test("generateQuestions: exact official domain allocation 16+12+12+11+9 = 60", () => {
  const qs = generateQuestions(42);
  const counts: Record<string, number> = {};
  for (const q of qs) counts[q.domain] = (counts[q.domain] ?? 0) + 1;
  assert.deepStrictEqual(counts, DOMAIN_ALLOCATION);
  assert.strictEqual(Object.values(DOMAIN_ALLOCATION).reduce((a, b) => a + b, 0), 60);
});

test("validateQuestions: canonical set is valid; prompts 300-800 chars; cited", () => {
  const v = validateQuestions(generateQuestions(42));
  assert.strictEqual(v.ok, true, v.errors.join("; "));
  assert.ok(v.prompt_len_min >= 300, `min ${v.prompt_len_min}`);
  assert.ok(v.prompt_len_max <= 800, `max ${v.prompt_len_max}`);
  for (const q of generateQuestions(42)) assert.match(q.citation, /cca-f/i);
});

test("validateQuestions: detects an out-of-range prompt", () => {
  const bad: CCAFQuestion = { ...generateQuestions(42)[0], prompt: "too short" };
  const v = validateQuestions([bad]);
  assert.strictEqual(v.ok, false);
  assert.ok(v.errors.some((e) => /outside 300-800/.test(e)));
});

test("difficultySplit spreads counts, remainder to easier tiers", () => {
  assert.deepStrictEqual(difficultySplit(16), [6, 5, 5]);
  assert.deepStrictEqual(difficultySplit(12), [4, 4, 4]);
  assert.deepStrictEqual(difficultySplit(11), [4, 4, 3]);
  assert.deepStrictEqual(difficultySplit(9), [3, 3, 3]);
});

test("ids are unique and zero-padded wave54-qNNN", () => {
  const qs = generateQuestions(42);
  const ids = new Set(qs.map((q) => q.id));
  assert.strictEqual(ids.size, qs.length);
  assert.match(qs[0].id, /^wave54-q\d{3}$/);
});

// ── Phase B — self-judge ─────────────────────────────────────────────────────

const Q0 = (): CCAFQuestion => generateQuestions(42)[0];

test("selfJudge: parses rubric JSON → total /100 and pass vs threshold", async () => {
  const j = await selfJudge(Q0(), "an answer", async () => ({
    text: '{"factual_accuracy":20,"completeness":20,"code_quality":20,"reasoning":20,"notes":"ok"}',
    ok: true,
  }));
  assert.strictEqual(j.total, 80);
  assert.strictEqual(j.parse_ok, true);
  assert.strictEqual(j.judge_failure, false);
  assert.strictEqual(j.pass, true); // threshold 60
});

test("selfJudge: transport failure ⇒ judge_failure, score 0, NOT a pass", async () => {
  const j = await selfJudge(Q0(), "answer", async () => ({ text: "", ok: false, error: "claude not found" }));
  assert.strictEqual(j.judge_failure, true);
  assert.strictEqual(j.total, 0);
  assert.strictEqual(j.pass, false);
});

test("selfJudge: malformed JSON ⇒ judge_failure (never a fabricated pass)", async () => {
  const j = await selfJudge(Q0(), "answer", async () => ({ text: "the answer is great, 95/100!", ok: true }));
  assert.strictEqual(j.judge_failure, true);
  assert.strictEqual(j.pass, false);
});

test("parseJudgeJson clamps scores to 0-25 and tolerates surrounding noise", () => {
  const p = parseJudgeJson('prefix {"factual_accuracy":99,"completeness":-3,"code_quality":12,"reasoning":25} suffix');
  assert.ok(p);
  assert.strictEqual(p!.scores.factual_accuracy, 25);
  assert.strictEqual(p!.scores.completeness, 0);
  assert.strictEqual(p!.scores.code_quality, 12);
});

test("buildJudgePrompt embeds the rubric criteria and demands JSON only", () => {
  const p = buildJudgePrompt(Q0(), "resp");
  assert.match(p, /JSON ONLY/);
  for (const c of Q0().rubric.criteria) assert.ok(p.includes(c));
});

// ── Phase B — report aggregation (pure) ──────────────────────────────────────

function rec(over: Partial<DecisionRecord>): DecisionRecord {
  return {
    question_id: "wave54-q001", domain: "agentic", difficulty: "foundational",
    tier_expected: "T1", tier_chosen: "T1", tier_match: true, classify_confidence: 0.8,
    pastor_adapter: "baseline", pastor_task_type: "coding", pastor_matched: false, pastor_confidence: 0.2,
    resolve_model: "qwen3:30b", resolve_downgraded: false, response_summary: "x", response_tokens: 10,
    resolve_ms: 5, judgment_score: 85, judgment_notes: "", judge_failure: false, pass: true,
    cost_usd: 0, duration_ms: 10, error: null, ...over,
  };
}

test("buildReport: pass rate, routing accuracy, per-domain stats", () => {
  const records = [
    rec({ domain: "agentic", pass: true, tier_match: true, judgment_score: 90 }),
    rec({ domain: "agentic", pass: false, tier_match: false, judgment_score: 40 }),
    rec({ domain: "mcp", pass: true, tier_match: true, judgment_score: 80 }),
  ];
  const r = buildReport(records, {
    session_id: "s", seed: 42, algorithm_version: "v1", started_at: "2026-06-11T02:00:00.000Z",
    finished_at: "2026-06-11T02:10:00.000Z", duration_ms: 600000,
  });
  assert.strictEqual(r.summary.total, 3);
  assert.strictEqual(r.summary.passed, 2);
  assert.strictEqual(r.summary.pass_rate, 0.667);
  assert.strictEqual(r.summary.routing_accuracy, 0.667);
  assert.strictEqual(r.by_domain.agentic.total, 2);
  assert.strictEqual(r.by_domain.agentic.passed, 1);
  assert.strictEqual(r.summary.total_cost_usd, 0);
});

test("buildReport: judge failures surfaced as a failure pattern", () => {
  const r = buildReport([rec({ judge_failure: true, pass: false, judgment_score: 0 })], {
    session_id: "s", seed: 1, algorithm_version: null, started_at: "2026-06-11T00:00:00.000Z",
    finished_at: "2026-06-11T00:00:01.000Z", duration_ms: 1000,
  });
  assert.strictEqual(r.summary.judge_failures, 1);
  assert.ok(r.failure_patterns.some((p) => /judge failure/.test(p)));
});

// ── Phase C — learning (staged only; R4) ─────────────────────────────────────

test("filterHighConfidence: tier_match + pass + score>=80, no judge_failure", () => {
  const recs = [
    rec({ tier_match: true, pass: true, judgment_score: 85 }), // keep
    rec({ tier_match: false, pass: true, judgment_score: 90 }), // drop (tier mismatch)
    rec({ tier_match: true, pass: true, judgment_score: 70 }), // drop (low score)
    rec({ tier_match: true, pass: true, judgment_score: 95, judge_failure: true }), // drop
  ];
  assert.strictEqual(filterHighConfidence(recs).length, 1);
});

test("stageLearning: writes jsonl when there are high-confidence samples", () => {
  const home = freshHome();
  const r = stageLearning([rec({ tier_match: true, pass: true, judgment_score: 88 })], "wave54-42-x", home);
  assert.strictEqual(r.high_confidence_count, 1);
  assert.ok(r.path && existsSync(r.path));
  const sample = JSON.parse(readFileSync(r.path!, "utf8").trim());
  assert.strictEqual(sample.source, "cca-f-audit");
  assert.strictEqual(sample.prompt_synthetic, true);
  assert.match(r.note, /no retrain|no Pastor delta/i);
});

test("stageLearning: zero high-confidence ⇒ no file written, count 0", () => {
  const home = freshHome();
  const r = stageLearning([rec({ tier_match: false, pass: false, judgment_score: 30 })], "s", home);
  assert.strictEqual(r.high_confidence_count, 0);
  assert.strictEqual(r.path, null);
});

// ── Phase D — report markdown ────────────────────────────────────────────────

test("renderReportMarkdown: contains honest disclaimer + Pastor delta N/A", () => {
  const r = buildReport([rec({})], {
    session_id: "wave54-42-x", seed: 42, algorithm_version: "v1.34", started_at: "2026-06-11T02:00:00.000Z",
    finished_at: "2026-06-11T03:00:00.000Z", duration_ms: 3600000,
  });
  const md = renderReportMarkdown(r);
  assert.match(md, /NOT the official Anthropic exam/);
  assert.match(md, /Pastor delta.*N\/A/);
  assert.match(md, /mooter cca-f audit --seed 42/);
});

// ── Phase E — publish payload ────────────────────────────────────────────────

test("buildPublishPayload: Notion title, HQ parent, tags, dashboard chip", () => {
  const r = buildReport([rec({})], {
    session_id: "wave54-42-x", seed: 42, algorithm_version: null,
    integrity: { sha: FROZEN_CLASSIFY_SHA, intact: true },
    started_at: "2026-06-11T02:00:00.000Z", finished_at: "2026-06-11T02:30:00.000Z", duration_ms: 1800000,
  });
  const p = buildPublishPayload(r, "# body");
  assert.match(p.notion_title, /Wave 54 CCA-F Audit Report/);
  assert.ok(p.notion_tags.includes("cca-f-audit"));
  assert.strictEqual(p.chip.classify_intact, true); // MEASURED (sha matches frozen)
  assert.match(p.chip.pass_rate, /%$/);
});

// ── classify.js integrity is MEASURED, not asserted ──────────────────────────

test("measureClassifyIntegrity: live classify.js matches the frozen sha", () => {
  const r = measureClassifyIntegrity();
  // From the cli package cwd the walk-up finds the repo's tools/router/classify.js.
  assert.strictEqual(r.intact, true, `sha=${r.sha}`);
  assert.strictEqual(r.sha, FROZEN_CLASSIFY_SHA);
});

test("buildReport: surfaces a drift warning when integrity.intact === false", () => {
  const drift = buildReport([rec({})], {
    session_id: "s", seed: 1, algorithm_version: null,
    integrity: { sha: "deadbeef".repeat(8), intact: false },
    started_at: "2026-06-11T00:00:00.000Z", finished_at: "2026-06-11T00:00:01.000Z", duration_ms: 1000,
  });
  assert.strictEqual(drift.classify_intact, false);
  assert.match(drift.classify_sha_note, /DOES NOT MATCH|drift/i);
});

test("buildReport: integrity omitted ⇒ classify_intact null, note says not measured", () => {
  const r = buildReport([rec({})], {
    session_id: "s", seed: 1, algorithm_version: null,
    started_at: "2026-06-11T00:00:00.000Z", finished_at: "2026-06-11T00:00:01.000Z", duration_ms: 1000,
  });
  assert.strictEqual(r.classify_intact, null);
  assert.match(r.classify_sha_note, /not measured/);
});

// ── End-to-end pipeline (B→E) with injected transports ───────────────────────

function fakeDeps(home: string): AuditDeps {
  let t = Date.parse("2026-06-11T02:00:00.000Z");
  return {
    home,
    now: () => (t += 1000),
    classify: (p) => ({ tier: /architect/i.test(p) ? "T3" : "T1", confidence: 0.8, task_category: "x" }),
    pastorRoute: () => ({ adapter: "baseline", task_type: "coding", matched: false, confidence: 0.2 }),
    resolve: async () => ({ text: "A complete answer addressing the rubric.", model: "qwen3:30b", tokens: 100, duration_ms: 20, ok: true }),
    judge: async () => ({ text: '{"factual_accuracy":22,"completeness":21,"code_quality":20,"reasoning":21,"notes":"ok"}', ok: true }),
  };
}

test("runAuditPipeline: writes all artefacts and a coherent report", async () => {
  const home = freshHome();
  const { report, dir, reportMarkdown } = await runAuditPipeline({ seed: 42, count: 10 }, fakeDeps(home));
  const files = readdirSync(dir).sort();
  for (const f of ["chip.json", "decisions.jsonl", "heartbeat.json", "notion-page.md", "report.json", "report.md"]) {
    assert.ok(files.includes(f), `missing ${f}`);
  }
  assert.strictEqual(report.summary.total, 10);
  assert.strictEqual(report.summary.pass_rate, 1); // all judged 84/100
  const decisions = readFileSync(join(dir, "decisions.jsonl"), "utf8").trim().split("\n");
  assert.strictEqual(decisions.length, 10);
  assert.match(reportMarkdown, /NOT the official Anthropic exam/);
  // report.json on disk reflects the learning count
  const onDisk = JSON.parse(readFileSync(join(dir, "report.json"), "utf8"));
  assert.strictEqual(onDisk.learning.high_confidence_count, report.learning.high_confidence_count);
});

test("runAuditPipeline: resolve failure ⇒ logged, scored 0, not a pass", async () => {
  const home = freshHome();
  const deps = fakeDeps(home);
  deps.resolve = async () => ({ text: "", model: "qwen3:30b", tokens: 0, duration_ms: 5, ok: false, error: "ollama down" });
  const { report } = await runAuditPipeline({ seed: 42, count: 5 }, deps);
  assert.strictEqual(report.summary.passed, 0);
  assert.ok(report.failure_patterns.some((p) => /resolve failure/.test(p)));
});

test("runAuditPipeline: same seed ⇒ same question ids logged (reproducible run)", async () => {
  const homeA = freshHome();
  const homeB = freshHome();
  const a = await runAuditPipeline({ seed: 99, count: 8 }, fakeDeps(homeA));
  const b = await runAuditPipeline({ seed: 99, count: 8 }, fakeDeps(homeB));
  const idsA = readFileSync(join(a.dir, "decisions.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l).question_id);
  const idsB = readFileSync(join(b.dir, "decisions.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l).question_id);
  assert.deepStrictEqual(idsA, idsB);
});
