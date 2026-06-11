// packages/cli/src/fable-observe/cca-f-learn.ts — Wave 54 Phase C.
//
// Pastor learning loop — STAGING ONLY. Day-0 recon R4: no trained adapter exists
// on this machine and the adapter trainer is a stub, so this writes high-confidence
// training samples to ~/.mooter/pastor/training_data/cca-f-<session>.jsonl and
// stops. It triggers NO retrain and makes NO "Pastor delta" claim (that would be
// fabricated until a first adapter is actually trained). The samples are synthetic
// (generated questions) — no user prompt content.

import { mkdirSync, appendFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import { pastorTrainingDir } from "./config.ts";
import type { DecisionRecord } from "./cca-f-audit.ts";

export interface TrainingSample {
  source: "cca-f-audit";
  session_id: string;
  question_id: string;
  domain: string;
  difficulty: string;
  prompt_synthetic: true; // these are generated, not user prompts
  tier: string; // classify.js tier (the label)
  pastor_task_type: string | null;
  judgment_score: number;
  high_confidence: true;
}

export interface LearnResult {
  high_confidence_count: number;
  path: string | null;
  total_considered: number;
  note: string;
}

/**
 * High-confidence filter (R2-corrected). The brief's double `pastor_match` (tier
 * == tier) is meaningless and `pastor_matched` is always false with no adapter on
 * disk — requiring it would zero every sample. So the gate is:
 *   classify tier agreed with the expected tier  (tier_match)
 *   AND the question passed                        (pass)
 *   AND not a judge failure
 *   AND judgment_score >= 80                       (quality floor)
 * `pastor_matched` is recorded as a bonus signal, never required.
 */
export function filterHighConfidence(records: DecisionRecord[]): DecisionRecord[] {
  return records.filter(
    (r) => r.tier_match && r.pass && !r.judge_failure && r.judgment_score >= 80,
  );
}

export function toTrainingSample(r: DecisionRecord, sessionId: string): TrainingSample {
  return {
    source: "cca-f-audit",
    session_id: sessionId,
    question_id: r.question_id,
    domain: r.domain,
    difficulty: r.difficulty,
    prompt_synthetic: true,
    tier: r.tier_chosen,
    pastor_task_type: r.pastor_task_type,
    judgment_score: r.judgment_score,
    high_confidence: true,
  };
}

/**
 * Stage high-confidence samples. Returns the count + file path. Writes nothing
 * (path=null) when there are zero qualifying samples. Never retrains.
 */
export function stageLearning(
  records: DecisionRecord[],
  sessionId: string,
  home: string = homedir(),
): LearnResult {
  const high = filterHighConfidence(records);
  const note =
    "samples staged only — no retrain triggered, no Pastor delta claimed " +
    "(no trained adapter on disk; retrain is manual per LORA_TRAINING_RUNBOOK.md)";
  if (high.length === 0) {
    return { high_confidence_count: 0, path: null, total_considered: records.length, note };
  }
  const dir = pastorTrainingDir(home);
  mkdirSync(dir, { recursive: true });
  const path = join(dir, `cca-f-${sessionId}.jsonl`);
  const body = high.map((r) => JSON.stringify(toTrainingSample(r, sessionId))).join("\n") + "\n";
  appendFileSync(path, body, "utf8");
  return { high_confidence_count: high.length, path, total_considered: records.length, note };
}
