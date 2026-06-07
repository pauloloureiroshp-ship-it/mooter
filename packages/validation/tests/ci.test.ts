import { test } from "node:test";
import assert from "node:assert/strict";
import { detectRegression } from "../src/ci/regression-detect.ts";
import { formatPrComment, PR_COMMENT_MARKER } from "../src/ci/pr-comment.ts";
import type { BenchmarkSummary, MlwrByTier } from "../src/types.ts";

const base: MlwrByTier = { T0: 1.0, T1: 0.9, T2: 0.7, T3: 0.5, overall: 0.78 };

test("no regression when current matches baseline", () => {
  const r = detectRegression(base, base, 5);
  assert.equal(r.regressed, false);
  assert.equal(r.worstTier, null);
  assert.equal(r.overall.deltaPp, 0);
});

test("small drop within threshold does not regress", () => {
  const cur: MlwrByTier = { T0: 1.0, T1: 0.87, T2: 0.68, T3: 0.48, overall: 0.76 };
  const r = detectRegression(base, cur, 5);
  assert.equal(r.regressed, false);
});

test("a tier dropping past threshold regresses and names worst tier", () => {
  const cur: MlwrByTier = { T0: 1.0, T1: 0.9, T2: 0.5, T3: 0.5, overall: 0.7 };
  const r = detectRegression(base, cur, 5);
  assert.equal(r.regressed, true);
  assert.equal(r.worstTier, "T2");
  const t2 = r.perTier.find((t) => t.tier === "T2")!;
  assert.ok(t2.deltaPp <= -20);
  assert.equal(t2.regressed, true);
});

test("overall drop past threshold regresses even if no single tier does", () => {
  const cur: MlwrByTier = { T0: 0.96, T1: 0.85, T2: 0.65, T3: 0.45, overall: 0.7 };
  const r = detectRegression(base, cur, 5);
  assert.equal(r.regressed, true);
});

test("percentages clamp to 0..100 and round to one decimal", () => {
  const r = detectRegression(
    { T0: 1.5, T1: -0.2, T2: 0.333, T3: 0.5, overall: 0.789 },
    { T0: 1.0, T1: 0.0, T2: 0.333, T3: 0.5, overall: 0.789 },
    5,
  );
  const t2 = r.perTier.find((t) => t.tier === "T2")!;
  assert.equal(t2.basePct, 33.3);
  assert.equal(t2.curPct, 33.3);
  assert.equal(t2.deltaPp, 0);
});

test("PR comment renders a marker, verdict, and a row per tier + overall", () => {
  const cur: MlwrByTier = { T0: 1.0, T1: 0.9, T2: 0.5, T3: 0.5, overall: 0.7 };
  const reg = detectRegression(base, cur, 5);
  const b: BenchmarkSummary = { mlwr: base, runs: 360 };
  const c: BenchmarkSummary = { mlwr: cur, runs: 360 };
  const md = formatPrComment(b, c, reg);
  assert.ok(md.startsWith(PR_COMMENT_MARKER));
  assert.match(md, /MLWR regression/);
  assert.match(md, /\| T0 \|/);
  assert.match(md, /\| overall \|/);
  assert.match(md, /⚠️/); // the regressed tier is flagged
});

test("PR comment shows green verdict when no regression", () => {
  const reg = detectRegression(base, base, 5);
  const s: BenchmarkSummary = { mlwr: base, runs: 360 };
  const md = formatPrComment(s, s, reg);
  assert.match(md, /No MLWR regression/);
});
