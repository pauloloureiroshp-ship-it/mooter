// `mooter pastor` — Pastor v2 per-task adapter routing + distillation (Wave 31).
//
//   mooter pastor adapters             list the registered per-task adapters
//   mooter pastor route "<prompt>"     show which adapter LORAUTER would pick (dry-run)
//   mooter pastor distill [--from <log>] [--name <n>]   distil decisions → installable .skill.md
//   mooter pastor train-status         status of the overnight train_lora.sh job
//   mooter pastor state                current active adapter + usage summary
//
// Pure delegator to @mooter/synthesis. Routing is deterministic (no LLM); distill
// reads the local decisions log (features only).

import type { CmdResult } from "./trail.ts";
import {
  listTaskAdapters,
  routeRequest,
  summarizePastor,
  trainStatus,
  emitSkill,
  type RouteRequestResult,
} from "../../../synthesis/src/index.ts";
import { buildTrainWatch, type TrainStep, type TaskScore } from "../../../transparency/src/index.ts";
import { learnFromSpans } from "./span-feedback.ts";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export const PASTOR_USAGE = `mooter pastor — per-task LoRA adapter routing + distillation (Wave 31)

  mooter pastor adapters             list registered per-task adapters
  mooter pastor route "<prompt>"     preview which adapter LORAUTER routes to (no side effects)
  mooter pastor distill [--from <log>] [--name <n>]   distil learned routing → .skill.md
  mooter pastor train-status         overnight LoRA training status
  mooter pastor train-watch          TensorBoard-like local view (loss curve · per-task scores)
  mooter pastor state                active adapter + usage summary
  mooter pastor learn-from-spans     join span scores with decisions → training features (no adapter state touched)

Flags: --json (machine-readable, all subcommands)`;

function flag(args: string[], name: string): string | undefined {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
}

export function runPastor(args: string[]): CmdResult {
  const [sub] = args;
  const json = args.includes("--json");

  if (!sub || sub === "help" || sub === "--help" || sub === "-h") {
    return { exitCode: 0, output: PASTOR_USAGE };
  }

  if (sub === "adapters") {
    const adapters = listTaskAdapters();
    if (json) return { exitCode: 0, output: JSON.stringify(adapters, null, 2) };
    const lines = [
      "🧠 Pastor v2 — per-task adapters (LORAUTER)",
      "──────────────────────────────────────────",
    ];
    for (const a of adapters) {
      const trained = a.path ? "materialised" : "not trained yet";
      lines.push(`${a.task_type?.padEnd(16) ?? "—".padEnd(16)} ${a.name.padEnd(20)} [${a.base_model}]  ${trained}`);
    }
    lines.push("", `${adapters.length} adapters · auto-swap opt-in (MOOTER_LORA_AUTOSWAP=1)`);
    return { exitCode: 0, output: lines.join("\n") };
  }

  if (sub === "route") {
    const prompt = args.slice(1).filter((a) => !a.startsWith("--")).join(" ").trim();
    if (!prompt) return { exitCode: 1, output: 'usage: mooter pastor route "<prompt>"' };
    const d: RouteRequestResult = routeRequest({ prompt, dryRun: true });
    if (json) return { exitCode: 0, output: JSON.stringify(d, null, 2) };
    const lines = [
      `🧠 LORAUTER route (deterministic, dry-run)`,
      `  adapter:    ${d.adapter} (${d.task_type})`,
      `  matched:    ${d.matched ? "yes" : "no — baseline"}  ·  confidence ${d.confidence.toFixed(2)} (threshold ${d.threshold})`,
      `  tier:       ${d.tier || "—"} (classifier owns this — never changed)`,
      `  lang:       ${d.detected_lang}`,
      `  top scores: ${d.scores.slice(0, 3).map((s) => `${s.task_type} ${s.confidence.toFixed(2)}`).join(" · ")}`,
      `  ${d.reason}`,
    ];
    return { exitCode: 0, output: lines.join("\n") };
  }

  if (sub === "distill") {
    const res = emitSkill({ decisionsPath: flag(args, "--from"), name: flag(args, "--name") });
    if (json) {
      return {
        exitCode: res.ok ? 0 : 1,
        output: JSON.stringify({ ok: res.ok, path: res.path, total: res.patterns.total, reason: res.reason }, null, 2),
      };
    }
    if (!res.ok) {
      return { exitCode: 1, output: `✗ distill: ${res.reason}` };
    }
    const lines = [
      `✓ distilled ${res.patterns.total} routing decisions → skill`,
      `  ${res.path}`,
      `  install: npx skills add ${res.path}`,
      `  top patterns: ${res.patterns.patterns.slice(0, 3).map((p) => `${p.task_category}→${p.tier}`).join(" · ")}`,
    ];
    return { exitCode: 0, output: lines.join("\n") };
  }

  if (sub === "train-status") {
    const st = trainStatus();
    if (json) return { exitCode: 0, output: JSON.stringify(st, null, 2) };
    const glyph = st.phase === "done" ? "✓" : st.phase === "running" ? "◐" : st.phase === "failed" ? "✗" : "·";
    const extra = st.samples ? ` · ${st.samples} samples` : "";
    return { exitCode: 0, output: `${glyph} train: ${st.phase}${st.adapter ? ` (${st.adapter})` : ""}${extra}${st.detail ? `\n  ${st.detail}` : ""}` };
  }

  if (sub === "state") {
    const s = summarizePastor();
    if (json) return { exitCode: 0, output: JSON.stringify(s, null, 2) };
    return {
      exitCode: 0,
      output: [
        `🧠 Pastor v2 state`,
        `  registered: ${s.registered} per-task adapters`,
        `  active:     ${s.active_type ?? "none"}${s.active_adapter ? ` (${s.active_adapter})` : ""}`,
        `  routes:     ${s.total_routes} recorded`,
      ].join("\n"),
    };
  }

  if (sub === "train-watch") {
    // Wave 32 (Phase F) — TensorBoard-like local view. Reads the basic status
    // (Wave 31 train-status.json) + an OPTIONAL train-metrics.json (loss curve /
    // per-task scores) the trainer may write. Absent metrics → honest fallback.
    const st = trainStatus();
    let metrics: { steps?: TrainStep[]; per_task?: TaskScore[]; total_steps?: number; eta_sec?: number } = {};
    try {
      metrics = JSON.parse(readFileSync(join(homedir(), ".mooter", "pastor", "train-metrics.json"), "utf8"));
    } catch { /* no metrics file — honest fallback below */ }
    const registryTasks = listTaskAdapters().map((a) => a.task_type ?? a.name).filter(Boolean) as string[];
    const view = {
      phase: st.phase,
      adapter: st.adapter,
      taskType: st.task_type,
      samples: st.samples,
      startedAt: st.started_at,
      finishedAt: st.finished_at,
      steps: metrics.steps,
      perTask: metrics.per_task,
      totalSteps: metrics.total_steps,
      etaSec: metrics.eta_sec,
      registryTasks,
    };
    if (json) return { exitCode: 0, output: JSON.stringify(view, null, 2) };
    return { exitCode: 0, output: buildTrainWatch(view) };
  }

  if (sub === "learn-from-spans") {
    // Wave Mega 50-51 Phase 2.E — joins ~/.mooter/span-feedback.jsonl with
    // decisions.log by span_id and writes the FEATURES-ONLY training file
    // ~/.mooter/pastor/span-training.jsonl. Never touches adapter/LoRA state.
    return learnFromSpans({});
  }

  return { exitCode: 1, output: `mooter pastor: unknown subcommand '${sub}'\n\n${PASTOR_USAGE}` };
}
