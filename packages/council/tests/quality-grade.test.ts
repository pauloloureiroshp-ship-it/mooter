// quality-grade.test.ts — deterministic graders for the Council Quality Eval.
// No model calls: feeds ground-truth (should grade correct) and wrong answers (should
// grade incorrect) through each grader. Validates the judge-free verifiable path so the
// accuracy numbers in the eval can be trusted (Doctrine §5: graded, not vibed).
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  gradeVerifiable, evalContains, polarity, allNumbers, wilson, extractCode,
} from "../scripts/quality-grade.ts";

test("exact_number: gt present anywhere in the answer → correct", () => {
  assert.equal(gradeVerifiable({ id: "r01", verifiable: true, grading: "exact_number", ground_truth: "100" }, "The original price was $100."), true);
  assert.equal(gradeVerifiable({ id: "r01", verifiable: true, grading: "exact_number", ground_truth: "100" }, "It is 96."), false);
});

test("exact_yesno / yesno_plus_reason: graded by polarity of first yes/no", () => {
  assert.equal(gradeVerifiable({ id: "r03", verifiable: true, grading: "exact_yesno", ground_truth: "Yes" }, "Yes, by transitivity."), true);
  assert.equal(gradeVerifiable({ id: "r08", verifiable: true, grading: "exact_yesno", ground_truth: "No" }, "No, 1 is not prime."), true);
  assert.equal(gradeVerifiable({ id: "r04", verifiable: true, grading: "yesno_plus_reason", ground_truth: "No — conjunction fallacy." }, "No, a conjunction can't exceed a conjunct."), true);
  assert.equal(gradeVerifiable({ id: "r04", verifiable: true, grading: "yesno_plus_reason", ground_truth: "No — ..." }, "Yes it can."), false);
});

test("exact_yesno_no: must say No (catches invented vulns)", () => {
  assert.equal(gradeVerifiable({ id: "s06", verifiable: true, grading: "exact_yesno_no", ground_truth: "No — ..." }, "No, it is parameterized."), true);
  assert.equal(gradeVerifiable({ id: "s06", verifiable: true, grading: "exact_yesno_no", ground_truth: "No — ..." }, "Yes, SQL injection."), false);
});

test("exact_fraction: matches 1/3 or its decimal", () => {
  assert.equal(gradeVerifiable({ id: "r06", verifiable: true, grading: "exact_fraction", ground_truth: "1/3" }, "The probability is 1/3."), true);
  assert.equal(gradeVerifiable({ id: "r06", verifiable: true, grading: "exact_fraction", ground_truth: "1/3" }, "About 0.333."), true);
  assert.equal(gradeVerifiable({ id: "r06", verifiable: true, grading: "exact_fraction", ground_truth: "1/3" }, "It is 1/2."), false);
});

test("exact_label: NLI label must appear", () => {
  assert.equal(gradeVerifiable({ id: "f02", verifiable: true, grading: "exact_label", ground_truth: "Not supported" }, "Verdict: Not supported by the passage."), true);
  assert.equal(gradeVerifiable({ id: "f04", verifiable: true, grading: "exact_label", ground_truth: "Contradicted" }, "It is Supported."), false);
});

test("set_match: all listed options present", () => {
  assert.equal(gradeVerifiable({ id: "f03", verifiable: true, grading: "set_match", ground_truth: "A and B" }, "Only A and B are correct."), true);
  assert.equal(gradeVerifiable({ id: "f03", verifiable: true, grading: "set_match", ground_truth: "A and B" }, "Only A."), false);
});

test("refusal_correct: rewards declining, punishes a fabricated answer", () => {
  assert.equal(gradeVerifiable({ id: "f01", verifiable: true, grading: "refusal_correct", ground_truth: "decline" }, "I cannot find any data on that place."), true);
  assert.equal(gradeVerifiable({ id: "f05", verifiable: true, grading: "refusal_correct", ground_truth: "cannot be determined" }, "It cannot be determined from the given info."), true);
  assert.equal(gradeVerifiable({ id: "f01", verifiable: true, grading: "refusal_correct", ground_truth: "decline" }, "The population is 48,000."), false);
});

test("contains: boolean grammar (AND/OR/parens, alternatives, mentions)", () => {
  // d01: null OR undefined AND (loading OR guard OR optional chaining)
  const d01 = "contains:null OR undefined AND (loading OR guard OR optional chaining)";
  assert.equal(evalContains(d01, "user is undefined on first render; add a loading guard"), true);
  assert.equal(evalContains(d01, "it just fails sometimes"), false);
  // s02: bcrypt OR argon2 OR scrypt AND mentions salt or slow
  const s02 = "bcrypt OR argon2 OR scrypt AND mentions salt or slow";
  assert.equal(evalContains(s02, "use argon2, a slow salted KDF"), true);
  assert.equal(evalContains(s02, "use sha256"), false);
  // c06: mid+1 AND mid-1
  assert.equal(evalContains("mid+1 AND mid-1", "set lo=mid+1 and hi=mid-1"), true);
  assert.equal(evalContains("mid+1 AND mid-1", "set lo=mid"), false);
});

test("extractCode: prefers fenced block, falls back to raw", () => {
  assert.equal(extractCode("Here:\n```python\ndef add(a,b):\n    return a+b\n```\nDone"), "def add(a,b):\n    return a+b");
  assert.match(extractCode("def add(a,b): return a+b"), /return a\+b/);
});

test("polarity / allNumbers helpers", () => {
  assert.equal(polarity("No, that's wrong"), "no");
  assert.equal(polarity("Hmm, Yes indeed"), "yes");
  assert.equal(polarity("maybe"), null);
  assert.deepEqual(allNumbers("sum is 1,683 not 1684"), ["1683", "1684"]);
});

test("wilson: degenerate + known interval shape", () => {
  assert.deepEqual(wilson(0, 0), { lo: 0, hi: 0, p: 0 });
  const w = wilson(8, 10);
  assert.equal(w.p, 0.8);
  assert.ok(w.lo > 0 && w.lo < 0.8 && w.hi > 0.8 && w.hi <= 1);
});

test("unknown grading → null (excluded, never silently counted)", () => {
  assert.equal(gradeVerifiable({ id: "zz", verifiable: true, grading: "mystery", ground_truth: "x" }, "anything"), null);
});
