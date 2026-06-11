// Span feedback loop (Wave Mega 50-51 Phase 2.E) — LOCAL ONLY, no network.
//
//   mooter feedback span <span_id> <score 1-5> [--note "..."]   score one routing span
//   mooter feedback spans [--last N]                            list recent decisions + span ids
//   mooter pastor learn-from-spans                              join scores with decisions → training features
//
// This is a deliberately SEPARATE path from the existing `mooter feedback
// "<message>"` (which POSTs product feedback to the hub) — span scores never
// leave the machine. They append to ~/.mooter/span-feedback.jsonl and the join
// writes ~/.mooter/pastor/span-training.jsonl with FEATURES ONLY — never the
// prompt text/preview. It does NOT touch any Pastor adapter/LoRA state.

import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

import { looksLikePII } from "./feedback.ts";
import { readDecisionsTail, defaultDecisionsLogPath, type RawDecision } from "../observability/convert.ts";
import { spanId } from "../observability/span-id.ts";

export interface CmdResult {
  exitCode: number;
  output: string;
}

export const SCORE_MIN = 1;
export const SCORE_MAX = 5;
const SPAN_ID_RE = /^[0-9a-f]{16}$/;
const MAX_NOTE = 500;

export function spanFeedbackPath(home: string = homedir()): string {
  return join(home, ".mooter", "span-feedback.jsonl");
}

export function spanTrainingPath(home: string = homedir()): string {
  return join(home, ".mooter", "pastor", "span-training.jsonl");
}

export interface SpanFeedbackRow {
  span_id: string;
  score: number;
  note?: string;
  ts: string;
}

// ---------------------------------------------------------------------------
// `mooter feedback span <span_id> <score>` — score one span (local append)

export interface FeedbackSpanOptions {
  spanIdArg: string;
  scoreArg: string;
  note?: string;
  home?: string;
}

export function runFeedbackSpan(opts: FeedbackSpanOptions): CmdResult {
  const id = String(opts.spanIdArg ?? "").trim().toLowerCase();
  if (!SPAN_ID_RE.test(id)) {
    return {
      exitCode: 1,
      output: `✗ "${opts.spanIdArg}" is not a span id (16 hex chars). Find ids with \`mooter feedback spans\`.`,
    };
  }

  const score = Number(opts.scoreArg);
  if (!Number.isInteger(score) || score < SCORE_MIN || score > SCORE_MAX) {
    return { exitCode: 1, output: `✗ score must be an integer ${SCORE_MIN}-${SCORE_MAX} (got "${opts.scoreArg}").` };
  }

  const note = typeof opts.note === "string" ? opts.note.trim() : undefined;
  if (note && looksLikePII(note)) {
    return {
      exitCode: 1,
      output: "✗ Note looks like it contains an email — span feedback stays PII-free, please remove it.",
    };
  }

  const row: SpanFeedbackRow = {
    span_id: id,
    score,
    ...(note ? { note: note.slice(0, MAX_NOTE) } : {}),
    ts: new Date().toISOString(),
  };
  const path = spanFeedbackPath(opts.home);
  mkdirSync(dirname(path), { recursive: true });
  appendFileSync(path, JSON.stringify(row) + "\n", "utf8");

  return {
    exitCode: 0,
    output: `✓ scored span ${id} → ${score}/${SCORE_MAX}.\nℹ local only (${path}) · no network · no PII`,
  };
}

/** Read all recorded span scores. Missing file → []; malformed lines skipped. */
export function readSpanFeedback(home?: string): SpanFeedbackRow[] {
  let raw: string;
  try {
    raw = readFileSync(spanFeedbackPath(home), "utf8");
  } catch {
    return [];
  }
  const out: SpanFeedbackRow[] = [];
  for (const line of raw.split("\n")) {
    const t = line.trim();
    if (!t) continue;
    try {
      const p = JSON.parse(t) as SpanFeedbackRow;
      if (p && typeof p === "object" && typeof p.span_id === "string" && typeof p.score === "number") out.push(p);
    } catch {
      /* skip malformed line */
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// `mooter feedback spans [--last N]` — discover span ids to score

export interface FeedbackSpansOptions {
  last?: number;
  decisionsLog?: string;
}

export function runFeedbackSpans(opts: FeedbackSpansOptions = {}): CmdResult {
  const logPath = opts.decisionsLog ?? defaultDecisionsLogPath();
  const last = Number.isFinite(opts.last) && (opts.last as number) > 0 ? (opts.last as number) : 10;
  const decisions = readDecisionsTail(logPath, last);

  if (decisions.length === 0) {
    return {
      exitCode: 0,
      output: `🐮 no routing decisions found in ${logPath} — nothing to score yet.`,
    };
  }

  const rows = decisions
    .slice()
    .reverse() // most recent first
    .map((d) => {
      const ts = typeof d.ts === "string" ? d.ts : "unknown time";
      const tier = typeof d.tier === "string" ? d.tier : "?";
      const model =
        (typeof d.recommended_model === "string" && d.recommended_model) ||
        (typeof d.model_used === "string" && d.model_used) ||
        "?";
      const conf = typeof d.confidence === "number" && Number.isFinite(d.confidence) ? d.confidence.toFixed(2) : "n/a";
      return `  ${spanId(d)}  ${ts}  ${tier.padEnd(3)} ${model}  conf ${conf}`;
    });

  return {
    exitCode: 0,
    output: [
      `🐮 last ${decisions.length} routing decision(s) — span_id · ts · tier · model · confidence`,
      ...rows,
      ``,
      `Score one:  mooter feedback span <span_id> <1-5> [--note "..."]   (local only, no network)`,
    ].join("\n"),
  };
}

// ---------------------------------------------------------------------------
// `mooter pastor learn-from-spans` — join scores with decisions → features file

export interface LearnFromSpansOptions {
  home?: string;
  decisionsLog?: string;
}

export interface SpanTrainingRow {
  span_id: string;
  task_category: string | null;
  tier: string | null;
  model: string | null;
  confidence: number | null;
  prompt_len: number | null;
  score: number;
  ts: string;
}

function toFeatures(d: RawDecision, fb: SpanFeedbackRow, id: string): SpanTrainingRow {
  // FEATURES ONLY — prompt_preview / any prompt text is NEVER copied.
  return {
    span_id: id,
    task_category: typeof d.task_category === "string" ? d.task_category : null,
    tier: typeof d.tier === "string" ? d.tier : null,
    model:
      (typeof d.recommended_model === "string" && d.recommended_model) ||
      (typeof d.model_used === "string" && d.model_used) ||
      null,
    confidence: typeof d.confidence === "number" && Number.isFinite(d.confidence) ? d.confidence : null,
    prompt_len: typeof d.prompt_len === "number" && Number.isFinite(d.prompt_len) ? d.prompt_len : null,
    score: fb.score,
    ts: fb.ts,
  };
}

export function learnFromSpans(opts: LearnFromSpansOptions = {}): CmdResult {
  const feedback = readSpanFeedback(opts.home);
  if (feedback.length === 0) {
    return {
      exitCode: 0,
      output: `🧠 no span feedback recorded yet — score a span first:\n  mooter feedback spans            (list recent span ids)\n  mooter feedback span <id> <1-5>  (score one, local only)`,
    };
  }

  const logPath = opts.decisionsLog ?? defaultDecisionsLogPath();
  const decisions = readDecisionsTail(logPath, Number.MAX_SAFE_INTEGER);
  const byId = new Map<string, RawDecision>();
  for (const d of decisions) byId.set(spanId(d), d);

  const joined: SpanTrainingRow[] = [];
  const orphaned: string[] = [];
  for (const fb of feedback) {
    const d = byId.get(fb.span_id);
    if (d) joined.push(toFeatures(d, fb, fb.span_id));
    else orphaned.push(fb.span_id);
  }

  const outPath = spanTrainingPath(opts.home);
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, joined.map((r) => JSON.stringify(r)).join("\n") + (joined.length ? "\n" : ""), "utf8");

  return {
    exitCode: 0,
    output: [
      `🧠 learn-from-spans — joined span scores with routing decisions`,
      `  joined:   ${joined.length} feedback row(s) matched a logged decision`,
      `  orphaned: ${orphaned.length} feedback id(s) with no matching decision${orphaned.length ? ` (${orphaned.slice(0, 3).join(", ")}${orphaned.length > 3 ? ", …" : ""})` : ""}`,
      `  wrote:    ${outPath}`,
      `  ↳ features only (span_id · task_category · tier · model · confidence · prompt_len · score · ts) — no prompt text.`,
      `  ↳ training INPUT only — no Pastor adapter/LoRA state was modified.`,
    ].join("\n"),
  };
}
