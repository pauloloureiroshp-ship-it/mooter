// packages/cli/src/fable-observe/cca-f-judge.ts — Wave 54 Phase B.2.
//
// Self-judge: a Sonnet rubric scores an agent response 0-25 on four dimensions
// (→ /100) versus the question's pass_threshold. The rubric logic is modelled on
// the existing blind judge (wave2-benchmark/lib/judge.ts); the TRANSPORT is the
// `claude` CLI (Claude Max), NOT the Anthropic SDK — refutes the Wave 54 brief's
// reuse plan because ANTHROPIC_API_KEY is absent on this machine (Day-0 recon R3).
//
// Honest caveat (must surface in the report): an LLM grading another model's
// output is a biased proxy, not ground truth. Wave 55 may add a human-validated
// subset.

import { spawnSync } from "node:child_process";

import type { CCAFQuestion } from "./cca-f-questions.ts";

export interface JudgeScores {
  factual_accuracy: number; // 0-25
  completeness: number; // 0-25
  code_quality: number; // 0-25
  reasoning: number; // 0-25
}

export interface Judgment {
  scores: JudgeScores;
  total: number; // 0-100 (sum of the four)
  notes: string;
  pass: boolean; // total >= question.rubric.pass_threshold
  parse_ok: boolean;
  judge_failure: boolean; // transport failed or JSON unparseable
  raw: string;
}

export interface JudgeTransportResult {
  text: string;
  ok: boolean;
  error?: string;
}

/** Injectable transport. Default = `claude --print --model sonnet` over stdin. */
export type JudgeTransport = (prompt: string) => Promise<JudgeTransportResult>;

export const JUDGE_SYSTEM =
  "You are an impartial technical auditor. You score one response against a rubric. " +
  "Output JSON only — no markdown, no prose around it.";

export function buildJudgePrompt(question: CCAFQuestion, responseText: string): string {
  return `You are auditing an AI agent response against a rubric.

Question domain: ${question.domain} (difficulty: ${question.difficulty})
Question:
"""
${question.prompt}
"""

Rubric criteria (the response should address these):
${question.rubric.criteria.map((c, i) => `  ${i + 1}. ${c}`).join("\n")}

Response to score:
"""
${responseText || "(empty response)"}
"""

Score 0-25 for EACH dimension and output JSON ONLY in exactly this shape:
{"factual_accuracy": <0-25>, "completeness": <0-25>, "code_quality": <0-25>, "reasoning": <0-25>, "notes": "<one line>"}

Dimensions:
- factual_accuracy: are claims, APIs, file/field names correct and non-hallucinated?
- completeness: are the rubric criteria actually covered?
- code_quality: if code/config is shown, is it correct and idiomatic? (full marks if N/A and reasoning is sound)
- reasoning: is the decision/trade-off justified rather than asserted?`;
}

const clamp25 = (v: unknown): number => {
  const n = typeof v === "number" ? Math.round(v) : Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.min(25, Math.max(0, n));
};

/** Extract the first JSON object from a (possibly noisy) judge response. */
export function parseJudgeJson(raw: string): { scores: JudgeScores; notes: string } | null {
  const m = raw.match(/\{[\s\S]*\}/);
  if (!m) return null;
  let obj: Record<string, unknown>;
  try {
    obj = JSON.parse(m[0]) as Record<string, unknown>;
  } catch {
    return null;
  }
  // Require at least one recognised numeric dimension to count as a real parse.
  const keys = ["factual_accuracy", "completeness", "code_quality", "reasoning"];
  if (!keys.some((k) => k in obj)) return null;
  return {
    scores: {
      factual_accuracy: clamp25(obj.factual_accuracy),
      completeness: clamp25(obj.completeness),
      code_quality: clamp25(obj.code_quality),
      reasoning: clamp25(obj.reasoning),
    },
    notes: typeof obj.notes === "string" ? obj.notes.slice(0, 200) : "",
  };
}

/** Default transport: spawn the `claude` CLI in non-interactive print mode. */
export const claudeCliTransport: JudgeTransport = async (prompt) => {
  // `shell: true` so Windows resolves `claude.cmd`; prompt goes via stdin to
  // avoid arg-length limits. `--print` is non-interactive; `--model sonnet`
  // pins the judge tier (Claude Max — no API key, no per-token billing).
  try {
    const r = spawnSync("claude", ["--print", "--model", "sonnet"], {
      input: prompt,
      encoding: "utf8",
      shell: true,
      maxBuffer: 8 * 1024 * 1024,
      timeout: 120_000,
    });
    if (r.status !== 0 || r.error) {
      return { text: "", ok: false, error: r.error?.message ?? `claude exit ${r.status}: ${(r.stderr || "").slice(0, 200)}` };
    }
    return { text: r.stdout ?? "", ok: true };
  } catch (e) {
    return { text: "", ok: false, error: e instanceof Error ? e.message : String(e) };
  }
};

const NEUTRAL: JudgeScores = { factual_accuracy: 0, completeness: 0, code_quality: 0, reasoning: 0 };

/**
 * Judge one (question, response). A transport or parse failure yields a
 * judge_failure judgment with a zero score and pass=false — never a fabricated
 * pass. Caller logs the failure with a note (brief B.3 "judge_failure").
 */
export async function selfJudge(
  question: CCAFQuestion,
  responseText: string,
  transport: JudgeTransport = claudeCliTransport,
): Promise<Judgment> {
  const prompt = `${JUDGE_SYSTEM}\n\n${buildJudgePrompt(question, responseText)}`;
  const res = await transport(prompt);
  if (!res.ok) {
    return { scores: NEUTRAL, total: 0, notes: `judge_failure: ${res.error ?? "transport"}`, pass: false, parse_ok: false, judge_failure: true, raw: res.text };
  }
  const parsed = parseJudgeJson(res.text);
  if (!parsed) {
    return { scores: NEUTRAL, total: 0, notes: "judge_failure: malformed JSON", pass: false, parse_ok: false, judge_failure: true, raw: res.text };
  }
  const total =
    parsed.scores.factual_accuracy + parsed.scores.completeness + parsed.scores.code_quality + parsed.scores.reasoning;
  return {
    scores: parsed.scores,
    total,
    notes: parsed.notes,
    pass: total >= question.rubric.pass_threshold,
    parse_ok: true,
    judge_failure: false,
    raw: res.text,
  };
}
