// Wave 32 (Phase F) — TensorBoard-like local view for Pastor LoRA training.
//
// Honest by design (matching synthesis' "the shell script is the only writer;
// never invents progress"): we render whatever the trainer recorded. The basic
// status (phase/adapter/samples) comes from train-status.json (Wave 31). Richer
// curves come from an OPTIONAL train-metrics.json the trainer may write:
//   { steps:[{step,loss,val_loss}], per_task:[{task,score}], total_steps, eta_sec }
// Absent → we show the status + a clear "no metrics recorded" notice and the
// registry's task adapters, rather than a fabricated loss curve.

import { boxTop, boxRow, boxSep, boxBottom, progressBar } from "../tui/box.ts";

export interface TrainStep { step: number; loss: number; valLoss?: number }
export interface TaskScore { task: string; score: number }

export interface TrainWatchView {
  phase: string; // none | pending | running | done | failed
  adapter?: string;
  taskType?: string;
  samples?: number;
  startedAt?: string;
  finishedAt?: string;
  steps?: TrainStep[];
  perTask?: TaskScore[];
  totalSteps?: number;
  etaSec?: number;
  /** fallback task list (from the registry) when no per-task scores recorded. */
  registryTasks?: string[];
  width?: number;
}

const SPARK = "▁▂▃▄▅▆▇█";
const DEFAULT_WIDTH = 72;

/** Map a numeric series to a unicode sparkline (min→max normalized). */
export function sparkline(values: number[]): string {
  if (!values.length) return "";
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  return values
    .map((v) => SPARK[Math.min(SPARK.length - 1, Math.floor(((v - min) / span) * (SPARK.length - 1)))])
    .join("");
}

function fmtEta(sec?: number): string {
  if (typeof sec !== "number" || sec <= 0) return "—";
  if (sec < 60) return `${Math.round(sec)}s`;
  if (sec < 3600) return `${Math.round(sec / 60)}m`;
  return `${(sec / 3600).toFixed(1)}h`;
}

const PHASE_GLYPH: Record<string, string> = {
  none: "○", pending: "◔", running: "▶", done: "✓", failed: "✗",
};

export function buildTrainWatch(view: TrainWatchView): string {
  const width = view.width ?? DEFAULT_WIDTH;
  const out: string[] = [];
  const g = PHASE_GLYPH[view.phase] ?? "·";

  out.push(boxTop(`🧬 Pastor LoRA Train-Watch · ${g} ${view.phase}${view.adapter ? ` · ${view.adapter}` : ""}`, width));

  // RUN — basic status (always available).
  out.push(boxRow("  RUN", width));
  if (view.phase === "none") {
    out.push(boxRow("    no training run recorded yet", width));
    out.push(boxRow("    train with: bash scripts/train_lora.sh (writes train-status.json)", width));
  } else {
    out.push(boxRow(`    task: ${view.taskType ?? "—"} · samples: ${view.samples ?? "—"}`, width));
    out.push(boxRow(`    started: ${view.startedAt ?? "—"}${view.finishedAt ? ` · finished: ${view.finishedAt}` : ""}`, width));
    if (view.phase === "running" && view.totalSteps && view.steps?.length) {
      const step = view.steps[view.steps.length - 1].step;
      const pct = Math.min(100, Math.round((step / view.totalSteps) * 100));
      out.push(boxRow(`    progress: ${progressBar(pct, 20)} ${pct}% · step ${step}/${view.totalSteps} · ETA ${fmtEta(view.etaSec)}`, width));
    }
  }
  out.push(boxSep(width));

  // LOSS — sparkline of training (and validation) loss.
  out.push(boxRow("  LOSS CURVE", width));
  if (view.steps && view.steps.length) {
    const tl = view.steps.map((s) => s.loss);
    const first = tl[0], last = tl[tl.length - 1];
    out.push(boxRow(`    train ${sparkline(tl)}  ${first.toFixed(3)} → ${last.toFixed(3)}`, width));
    const vl = view.steps.filter((s) => typeof s.valLoss === "number").map((s) => s.valLoss as number);
    if (vl.length) out.push(boxRow(`    val   ${sparkline(vl)}  ${vl[0].toFixed(3)} → ${vl[vl.length - 1].toFixed(3)}`, width));
  } else {
    out.push(boxRow("    (no loss metrics recorded — trainer did not write train-metrics.json)", width));
  }
  out.push(boxSep(width));

  // PER-TASK SCORES — bar per task type.
  out.push(boxRow("  PER-TASK SCORES", width));
  if (view.perTask && view.perTask.length) {
    for (const t of view.perTask.slice(0, 8)) {
      const pct = Math.max(0, Math.min(100, Math.round(t.score * 100)));
      out.push(boxRow(`    ${t.task.padEnd(16)} ${progressBar(pct, 16)} ${pct}%`, width));
    }
  } else if (view.registryTasks && view.registryTasks.length) {
    out.push(boxRow(`    no scores yet · ${view.registryTasks.length} task adapters registered:`, width));
    out.push(boxRow(`    ${view.registryTasks.slice(0, 6).join(", ")}${view.registryTasks.length > 6 ? ", …" : ""}`, width));
  } else {
    out.push(boxRow("    (no per-task scores recorded)", width));
  }
  out.push(boxBottom(width));

  return out.join("\n");
}
