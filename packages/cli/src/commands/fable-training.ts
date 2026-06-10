// `mooter pastor train-on-fable` — Fable 5 observation → Pastor training features
// (Wave Mega 50-51 Phase 5, training half). Follows the learn-from-spans pattern
// EXACTLY: reads local observations, writes a FEATURES-ONLY training file at
// ~/.mooter/pastor/fable-training.jsonl, and NEVER touches Pastor adapter/LoRA
// state. Actual LoRA retraining is MANUAL on the RTX 4090 (LORA_TRAINING_RUNBOOK.md)
// — this command only prepares training INPUT.
//
//   mooter pastor train-on-fable [--observations-since <24h|7d|all>] [--dry-run]
//   mooter pastor train-on-fable --install-cron [--yes]   nightly 02:00 cron (dry-run default)
//
// PRIVACY: prompt_text and fable_decision.rationale (free-text that may contain
// prompt fragments) are NEVER copied into the training file. Features only.
//
// NOTE: this file deliberately does NOT import from src/fable-observe/ (built
// concurrently) — it duplicates the few constants it needs and parses the
// observation JSON defensively against schema v1.

import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import type { CmdResult } from "./trail.ts";

// --- schema v1 constants (duplicated on purpose; see header note) -----------

export function fableObservationsDir(home: string = homedir()): string {
  return join(home, ".mooter", "fable-observations");
}

export function fableTrainingPath(home: string = homedir()): string {
  return join(home, ".mooter", "pastor", "fable-training.jsonl");
}

/** Nightly cron: 02:00, last-24h window (matches the observation cadence). */
export const FABLE_CRON_LINE = "0 2 * * * mooter pastor train-on-fable --observations-since 24h";

// --- defensive observation parsing (schema v1) -------------------------------

interface RawObservation {
  schema?: unknown;
  ts?: unknown;
  ts_ms?: unknown;
  task_hash?: unknown;
  task_type?: unknown;
  prompt_len?: unknown;
  prompt_text?: unknown; // NEVER copied to training output
  fable_decision?: {
    action?: unknown;
    subagent_type?: unknown;
    model_chosen?: unknown;
    parallel_count?: unknown;
    rationale?: unknown; // NEVER copied (may contain prompt fragments)
  } | null;
  router_baseline?: {
    tier?: unknown;
    model?: unknown;
    confidence?: unknown;
    task_category?: unknown;
  } | null;
  pattern_gap?: unknown;
  outcome?: { completed?: unknown; tests_pass?: unknown } | null;
  pastor_training_value?: unknown;
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}
function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/** FEATURES-ONLY training row. No prompt_text. No rationale free-text. */
export interface FableTrainingRow {
  task_hash: string;
  ts_ms: number;
  task_type: string | null;
  prompt_len: number | null;
  fable_action: string | null;
  fable_subagent: string | null;
  fable_model: string | null;
  fable_parallel_count: number | null;
  baseline_tier: string | null;
  baseline_confidence: number | null;
  baseline_category: string | null;
  gap_present: boolean;
  outcome_completed: boolean | null;
  training_value: string | null;
}

export function toTrainingRow(obs: RawObservation): FableTrainingRow | null {
  const task_hash = str(obs.task_hash);
  const ts_ms = num(obs.ts_ms);
  if (!task_hash || ts_ms === null) return null; // can't dedup without the key
  const fd = obs.fable_decision ?? {};
  const rb = obs.router_baseline ?? null;
  const gap = obs.pattern_gap;
  return {
    task_hash,
    ts_ms,
    task_type: str(obs.task_type),
    prompt_len: num(obs.prompt_len),
    fable_action: str(fd?.action),
    fable_subagent: str(fd?.subagent_type),
    fable_model: str(fd?.model_chosen),
    fable_parallel_count: num(fd?.parallel_count),
    baseline_tier: rb ? str(rb.tier) : null,
    baseline_confidence: rb ? num(rb.confidence) : null,
    baseline_category: rb ? str(rb.task_category) : null,
    gap_present: gap === true || (typeof gap === "string" && gap !== "" && gap !== "none"),
    outcome_completed: typeof obs.outcome?.completed === "boolean" ? obs.outcome.completed : null,
    training_value: str(obs.pastor_training_value),
  };
}

export interface LoadResult {
  observations: RawObservation[];
  filesRead: number;
  skippedInvalid: number;
}

export function readFableObservations(home?: string): LoadResult {
  const dir = fableObservationsDir(home);
  if (!existsSync(dir)) return { observations: [], filesRead: 0, skippedInvalid: 0 };
  let files: string[] = [];
  try {
    files = readdirSync(dir).filter((f) => f.endsWith(".json"));
  } catch {
    return { observations: [], filesRead: 0, skippedInvalid: 0 };
  }
  const observations: RawObservation[] = [];
  let skippedInvalid = 0;
  for (const f of files) {
    try {
      const parsed = JSON.parse(readFileSync(join(dir, f), "utf8")) as RawObservation;
      if (parsed && typeof parsed === "object") observations.push(parsed);
      else skippedInvalid++;
    } catch {
      skippedInvalid++;
    }
  }
  return { observations, filesRead: files.length, skippedInvalid };
}

/** "24h" | "7d" | "all" (also accepts generic Nh/Nd) → window in ms, or null = all. */
export function parseSinceWindow(s: string | undefined): number | null | undefined {
  if (s === undefined || s === "all") return null;
  const m = /^(\d+)([hd])$/.exec(s);
  if (!m) return undefined; // invalid
  const n = Number(m[1]);
  return m[2] === "h" ? n * 60 * 60 * 1000 : n * 24 * 60 * 60 * 1000;
}

function readExistingKeys(outPath: string): Set<string> {
  const keys = new Set<string>();
  if (!existsSync(outPath)) return keys;
  try {
    for (const line of readFileSync(outPath, "utf8").split("\n")) {
      const t = line.trim();
      if (!t) continue;
      try {
        const r = JSON.parse(t) as { task_hash?: string; ts_ms?: number };
        if (typeof r.task_hash === "string" && typeof r.ts_ms === "number") {
          keys.add(`${r.task_hash}:${r.ts_ms}`);
        }
      } catch {
        /* skip corrupt line */
      }
    }
  } catch {
    /* unreadable → treat as empty */
  }
  return keys;
}

// --- cron plan (dogfood --install-cron pattern: DRY-RUN by default) ----------

export function fableCronPlan(platform: string = process.platform): {
  schedule: string;
  command: string;
  line: string;
  install: string;
  note: string;
} {
  const schedule = "0 2 * * *";
  const command = "mooter pastor train-on-fable --observations-since 24h";
  const line = `${schedule} ${command}`;
  if (platform === "win32") {
    return {
      schedule,
      command,
      line,
      install: `schtasks /Create /SC DAILY /TR "${command}" /ST 02:00 /TN MooterFableTrain`,
      note: "Windows: run the schtasks command above (or use WSL crontab). --yes auto-install is crontab-only.",
    };
  }
  return {
    schedule,
    command,
    line,
    install: `( crontab -l 2>/dev/null; echo "${line}" ) | crontab -`,
    note: "Adds a nightly 02:00 job. Review with `crontab -l`; remove the line to stop.",
  };
}

/** Actually appends the cron line (only when --yes). Idempotent; crontab-only. */
function installCron(plan: ReturnType<typeof fableCronPlan>): CmdResult {
  if (process.platform === "win32") {
    return { exitCode: 1, output: `✗ auto-install is crontab-only — on Windows run:\n   ${plan.install}` };
  }
  const probe = spawnSync("crontab", ["-l"], { encoding: "utf8" });
  if (probe.error) {
    return { exitCode: 1, output: `✗ crontab not available on this system (${probe.error.message}) — nothing installed.` };
  }
  const existing = probe.status === 0 ? probe.stdout : ""; // non-0 = empty crontab
  if (existing.includes(plan.command)) {
    return { exitCode: 0, output: `✓ cron already installed (found "${plan.command}" in crontab) — nothing changed.` };
  }
  const next = (existing.endsWith("\n") || existing === "" ? existing : existing + "\n") + plan.line + "\n";
  const write = spawnSync("crontab", ["-"], { input: next, encoding: "utf8" });
  if (write.status !== 0) {
    return { exitCode: 1, output: `✗ crontab write failed (${write.stderr?.trim() || "unknown error"}) — nothing installed.` };
  }
  return { exitCode: 0, output: `✓ installed nightly cron:\n   ${plan.line}\nReview with \`crontab -l\`; remove the line to stop.` };
}

// --- the command --------------------------------------------------------------

export const MANUAL_TRAINING_CAVEAT =
  "⚠ honest caveat: this writes training INPUT only — actual LoRA retraining is MANUAL on the RTX 4090 (see LORA_TRAINING_RUNBOOK.md). No automated training exists.";

export interface TrainOnFableOptions {
  home?: string;
  now?: Date;
}

export function runTrainOnFable(args: string[], opts: TrainOnFableOptions = {}): CmdResult {
  const json = args.includes("--json");

  if (args.includes("--install-cron")) {
    const plan = fableCronPlan();
    if (args.includes("--yes")) return installCron(plan);
    if (json) return { exitCode: 0, output: JSON.stringify({ ...plan, dry_run: true }, null, 2) };
    return {
      exitCode: 0,
      output: [
        "🐮 nightly fable-training cron (dry-run — nothing installed)",
        `   crontab line: ${plan.line}`,
        `   install:      ${plan.install}`,
        `   or rerun with --install-cron --yes to append it for you (crontab only).`,
        `   ${plan.note}`,
      ].join("\n"),
    };
  }

  const dryRun = args.includes("--dry-run");
  const sinceIdx = args.indexOf("--observations-since");
  const sinceArg =
    sinceIdx >= 0 ? args[sinceIdx + 1] : args.find((a) => a.startsWith("--observations-since="))?.split("=")[1];
  const windowMs = parseSinceWindow(sinceArg);
  if (windowMs === undefined) {
    return { exitCode: 1, output: `✗ invalid --observations-since "${sinceArg}" — use 24h, 7d or all.` };
  }

  const { observations, filesRead, skippedInvalid } = readFableObservations(opts.home);
  const nowMs = (opts.now ?? new Date()).getTime();
  const cutoff = windowMs === null ? null : nowMs - windowMs;

  let outsideWindow = 0;
  const candidates: FableTrainingRow[] = [];
  let invalidRows = skippedInvalid;
  for (const obs of observations) {
    const row = toTrainingRow(obs);
    if (!row) {
      invalidRows++;
      continue;
    }
    if (cutoff !== null && row.ts_ms < cutoff) {
      outsideWindow++;
      continue;
    }
    candidates.push(row);
  }

  const outPath = fableTrainingPath(opts.home);
  const seen = readExistingKeys(outPath);
  const fresh: FableTrainingRow[] = [];
  let dedupedOut = 0;
  for (const row of candidates) {
    const key = `${row.task_hash}:${row.ts_ms}`;
    if (seen.has(key)) {
      dedupedOut++;
      continue;
    }
    seen.add(key);
    fresh.push(row);
  }

  if (!dryRun && fresh.length > 0) {
    mkdirSync(dirname(outPath), { recursive: true });
    appendFileSync(outPath, fresh.map((r) => JSON.stringify(r)).join("\n") + "\n", "utf8");
  }

  const summary = {
    read: filesRead,
    invalid: invalidRows,
    outside_window: outsideWindow,
    converted: fresh.length,
    deduped_out: dedupedOut,
    window: sinceArg ?? "all",
    output: outPath,
    dry_run: dryRun,
  };
  if (json) return { exitCode: 0, output: JSON.stringify(summary, null, 2) };

  return {
    exitCode: 0,
    output: [
      `🧠 train-on-fable — Fable 5 observations → Pastor training features${dryRun ? " (dry-run, nothing written)" : ""}`,
      `  read:        ${filesRead} observation file(s)${invalidRows ? ` (${invalidRows} invalid skipped)` : ""}`,
      `  window:      ${sinceArg ?? "all"}${outsideWindow ? ` (${outsideWindow} outside window)` : ""}`,
      `  converted:   ${fresh.length} new training row(s)`,
      `  deduped-out: ${dedupedOut} already in the training file (task_hash+ts_ms)`,
      `  output:      ${outPath}`,
      `  ↳ features only (task_hash · ts_ms · task_type · prompt_len · fable_* · baseline_* · gap_present · outcome_completed · training_value) — prompt_text and rationale are NEVER copied.`,
      `  ${MANUAL_TRAINING_CAVEAT}`,
    ].join("\n"),
  };
}
