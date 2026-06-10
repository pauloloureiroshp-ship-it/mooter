// Fable observation schema v1 (Wave Mega 50-51 Phase 5) — fixed contract.
//
// Every orchestration decision Claude Fable 5 makes (delegate vs inline, which
// subagent, which model, parallelism) is logged as a FEATURE-LEVEL observation.
// Privacy doctrine: prompt text is NEVER stored by default — only a 16-hex
// sha256 task_hash. `prompt_text` exists ONLY when the store_prompts opt-in is
// enabled. Pastor later trains on these features.
//
// NOTE: the original brief interface carried self-assessed quality floats
// (completeness/correctness 0-1). Deliberately replaced with factual outcome
// booleans (completed / tests_pass) per honesty doctrine — a model grading its
// own output is not a measurement.

export const TASK_TYPES = [
  "coding",
  "reasoning",
  "architecture",
  "docs",
  "review",
  "orchestration",
  "other",
] as const;
export type TaskType = (typeof TASK_TYPES)[number];

export const FABLE_ACTIONS = ["inline", "spawn_subagent", "workflow", "parallel_spawn"] as const;
export type FableAction = (typeof FABLE_ACTIONS)[number];

export const TRAINING_VALUES = ["high", "medium", "low"] as const;
export type TrainingValue = (typeof TRAINING_VALUES)[number];

export interface FableDecision {
  action: FableAction;
  subagent_type: string | null;
  model_chosen: string | null;
  parallel_count: number | null;
  rationale: string | null;
}

export interface RouterBaseline {
  tier: string;
  model: string;
  confidence: number;
  task_category: string;
}

export interface Outcome {
  completed: boolean | null;
  tests_pass: boolean | null;
}

export interface FableObservation {
  schema: 1;
  ts: string;
  ts_ms: number;
  session_id: string | null;
  orchestrator_model: string;
  task_hash: string; // 16 hex of sha256(prompt text) — hash only by default
  task_type: TaskType;
  prompt_len: number | null;
  prompt_text?: string; // ONLY present when store_prompts opt-in is enabled
  fable_decision: FableDecision;
  router_baseline: RouterBaseline | null;
  pattern_gap: string | null;
  outcome: Outcome;
  pastor_training_value: TrainingValue;
}

const TASK_HASH_RE = /^[0-9a-f]{16}$/;

function isStrOrNull(v: unknown): boolean {
  return v === null || typeof v === "string";
}
function isNumOrNull(v: unknown): boolean {
  return v === null || (typeof v === "number" && Number.isFinite(v));
}
function isBoolOrNull(v: unknown): boolean {
  return v === null || typeof v === "boolean";
}

/** Validate an object against observation schema v1. Returns [] when valid. */
export function validateObservation(obj: unknown): string[] {
  const errors: string[] = [];
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) {
    return ["observation must be a JSON object"];
  }
  const o = obj as Record<string, unknown>;

  if (o.schema !== 1) errors.push("schema must be 1");
  if (typeof o.ts !== "string" || !o.ts) errors.push("ts must be an ISO string");
  if (typeof o.ts_ms !== "number" || !Number.isFinite(o.ts_ms)) errors.push("ts_ms must be a number");
  if (!isStrOrNull(o.session_id)) errors.push("session_id must be string|null");
  if (typeof o.orchestrator_model !== "string" || !o.orchestrator_model) {
    errors.push("orchestrator_model must be a non-empty string");
  }
  if (typeof o.task_hash !== "string" || !TASK_HASH_RE.test(o.task_hash)) {
    errors.push("task_hash must be 16 lowercase hex chars (sha256 prefix)");
  }
  if (!TASK_TYPES.includes(o.task_type as TaskType)) {
    errors.push(`task_type must be one of: ${TASK_TYPES.join("|")}`);
  }
  if (!isNumOrNull(o.prompt_len ?? null)) errors.push("prompt_len must be number|null");
  if (o.prompt_text !== undefined && typeof o.prompt_text !== "string") {
    errors.push("prompt_text, when present, must be a string");
  }

  const fd = o.fable_decision as Record<string, unknown> | undefined;
  if (!fd || typeof fd !== "object" || Array.isArray(fd)) {
    errors.push("fable_decision must be an object");
  } else {
    if (!FABLE_ACTIONS.includes(fd.action as FableAction)) {
      errors.push(`fable_decision.action must be one of: ${FABLE_ACTIONS.join("|")}`);
    }
    if (!isStrOrNull(fd.subagent_type ?? null)) errors.push("fable_decision.subagent_type must be string|null");
    if (!isStrOrNull(fd.model_chosen ?? null)) errors.push("fable_decision.model_chosen must be string|null");
    if (!isNumOrNull(fd.parallel_count ?? null)) errors.push("fable_decision.parallel_count must be number|null");
    if (!isStrOrNull(fd.rationale ?? null)) errors.push("fable_decision.rationale must be string|null");
  }

  const rb = o.router_baseline as Record<string, unknown> | null | undefined;
  if (rb !== null && rb !== undefined) {
    if (typeof rb !== "object" || Array.isArray(rb)) {
      errors.push("router_baseline must be object|null");
    } else {
      if (typeof rb.tier !== "string") errors.push("router_baseline.tier must be a string");
      if (typeof rb.model !== "string") errors.push("router_baseline.model must be a string");
      if (typeof rb.confidence !== "number") errors.push("router_baseline.confidence must be a number");
      if (typeof rb.task_category !== "string") errors.push("router_baseline.task_category must be a string");
    }
  }

  if (!isStrOrNull(o.pattern_gap ?? null)) errors.push("pattern_gap must be string|null");

  const oc = o.outcome as Record<string, unknown> | undefined;
  if (!oc || typeof oc !== "object" || Array.isArray(oc)) {
    errors.push("outcome must be an object { completed, tests_pass }");
  } else {
    if (!isBoolOrNull(oc.completed ?? null)) errors.push("outcome.completed must be boolean|null");
    if (!isBoolOrNull(oc.tests_pass ?? null)) errors.push("outcome.tests_pass must be boolean|null");
  }

  if (!TRAINING_VALUES.includes(o.pastor_training_value as TrainingValue)) {
    errors.push(`pastor_training_value must be one of: ${TRAINING_VALUES.join("|")}`);
  }

  return errors;
}
