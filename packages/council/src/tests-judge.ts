// Tests as judge — deterministic ground truth first, vibes only to break ties.
//
// LLM-generated unit tests used as a judge in Best-of-N beat trained 8B reward models
// (design 11e). Protocol: pass-rate = utility. The LLM judge (Opus) only breaks ties
// AMONG implementations that ALREADY pass, with judge hygiene (design 11d):
//   - length-neutral rubric ("concise ≥ verbose at equal correctness"),
//   - anonymized candidates (no seat ids), and
//   - randomized order (kills position bias).
// If nothing passes, the answer is an honest "no winner" — never fabricated.

import type { ModelSpec } from "./types.ts";
import type { MemberBuild } from "./builder.ts";

export interface JudgeResult {
  winner: MemberBuild | null;
  ranked: MemberBuild[];
  note: string;
}

export interface JudgeOptions {
  /** LLM judge to break ties among passing builds (anonymized + randomized). */
  llmJudge?: ModelSpec | null;
  /** Deterministic rotation seed for "randomized" order (no Math.random). */
  orderSeed?: number;
}

/** Length-neutral pick: fewest diff lines, ties broken stably by branch name. */
export function lengthNeutralPick(passing: MemberBuild[]): MemberBuild {
  return [...passing].sort((a, b) => a.diffLines - b.diffLines || a.branch.localeCompare(b.branch))[0];
}

async function llmTieBreak(
  passing: MemberBuild[],
  judge: ModelSpec,
  seed: number,
): Promise<MemberBuild | null> {
  const n = passing.length;
  const rot = ((seed % n) + n) % n;
  const ordered = [...passing.slice(rot), ...passing.slice(0, rot)]; // randomized order
  const labels = ordered.map((_, i) => String.fromCharCode(65 + i)); // A, B, C — anonymized
  const prompt = [
    "You are a code judge. EVERY candidate below already PASSES the tests (equal correctness).",
    "Pick the BEST. Rubric (length-neutral): a more concise, clearer solution is >= a more",
    "verbose one. Do NOT reward length. Judge only by clarity/minimalism at equal correctness.",
    "Answer EXACTLY in this format: WINNER: <letter>",
    "",
    ...ordered.map((m, i) => `--- CANDIDATE ${labels[i]} ---\n${(m.diff ?? "(diff unavailable)").slice(0, 1500)}`),
  ].join("\n");
  let raw: string;
  try {
    raw = (await judge.call(prompt)).text;
  } catch {
    return null;
  }
  const mm = raw.toUpperCase().match(/WINNER:\s*([A-Z])/);
  if (!mm) return null;
  const idx = mm[1].charCodeAt(0) - 65;
  return ordered[idx] ?? null;
}

/**
 * Judge builds by tests. Pass-rate is ground truth; the LLM judge only breaks ties
 * among passing builds. Falls back to the length-neutral pick when there is no judge
 * or the judge can't decide.
 */
export async function judgeByTests(members: MemberBuild[], opts: JudgeOptions = {}): Promise<JudgeResult> {
  const ranked = [...members].sort(
    (a, b) => Number(b.passed) - Number(a.passed) || a.diffLines - b.diffLines || a.branch.localeCompare(b.branch),
  );
  const passing = members.filter((m) => m.passed);

  if (passing.length === 0) {
    return { winner: null, ranked, note: "no implementation passed the tests — no winner (honest)" };
  }
  if (passing.length === 1) {
    return { winner: passing[0], ranked, note: "single passing implementation" };
  }
  if (opts.llmJudge) {
    const picked = await llmTieBreak(passing, opts.llmJudge, opts.orderSeed ?? passing.length);
    if (picked) {
      return { winner: picked, ranked, note: "LLM judge tie-break (anonymized, randomized, length-neutral)" };
    }
  }
  return { winner: lengthNeutralPick(passing), ranked, note: "length-neutral tie-break (fewest diff lines)" };
}
