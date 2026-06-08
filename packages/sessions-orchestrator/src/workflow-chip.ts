// Wave 33.5 Block A.6 — workflow-visibility statusline chip.
//
// Wave 28 already writes a cheap live pointer at ~/.mooter/workflows/active-run.json
// (ActiveRunSnapshot) which the statusline reads WITHOUT pulling better-sqlite3.
// Block A reuses that pointer READ-ONLY — the @mooter/workflow package is INTOCADO
// (Wave 28-33 freeze). We render a richer chip (progress dots) from agents_done/
// agents_total. The pointer carries no token count, so tokens are shown only when
// a sibling `active-tokens` field is present — never fabricated.

import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import type { WorkflowProgress } from "./types.ts";

/** Minimal read-only mirror of Wave 28's ActiveRunSnapshot (we own no writes). */
interface ActiveRunSnapshot {
  run_id?: string;
  workflow_name?: string;
  status?: string;
  phase?: number;
  num_phases?: number;
  agents_done?: number;
  agents_total?: number;
  /** Not written by Wave 28 today; rendered only if a future writer adds it. */
  tokens?: number;
  ts?: number;
}

export interface WorkflowChipOptions {
  home?: string;
  now?: number;
  /** Hide stale pointers older than this (defaults 60s). */
  staleMs?: number;
  /** Animation tick (frame counter); rotates the in-flight glyph. */
  tick?: number;
  hidden?: boolean;
}

function pointerPath(home: string): string {
  // Mirrors active.ts: next to state.db under ~/.mooter/workflows, honouring
  // the same env overrides the engine uses.
  const explicit = process.env.MOOTER_WORKFLOW_ACTIVE;
  if (explicit) return explicit;
  return join(home, ".mooter", "workflows", "active-run.json");
}

export function readActiveWorkflow(opts: WorkflowChipOptions = {}): WorkflowProgress | null {
  const home = opts.home ?? homedir();
  const now = opts.now ?? Date.now();
  const staleMs = opts.staleMs ?? 60000;
  let snap: ActiveRunSnapshot;
  try {
    snap = JSON.parse(readFileSync(pointerPath(home), "utf8"));
  } catch {
    return null;
  }
  if (!snap || snap.status !== "running") return null;
  if (typeof snap.ts === "number" && now - snap.ts > staleMs) return null;
  const done = Math.max(0, Number(snap.agents_done ?? 0));
  const total = Math.max(done, Number(snap.agents_total ?? 0));
  return {
    id: String(snap.run_id ?? snap.workflow_name ?? "wf"),
    done,
    total,
    tokens: Number.isFinite(snap.tokens) ? Number(snap.tokens) : 0,
    status: String(snap.status),
  };
}

const SPIN = ["◐", "◓", "◑", "◒"];

/** Progress dots, e.g. `●●●◓○○○` — capped to `width` glyphs. */
export function progressDots(done: number, total: number, width = 7, tick = 0): string {
  if (total <= 0) return "";
  const cap = Math.min(width, Math.max(total, 1));
  const filled = Math.round((done / total) * cap);
  const out: string[] = [];
  for (let i = 0; i < cap; i++) {
    if (i < filled) out.push("●");
    else if (i === filled && done < total) out.push(SPIN[((tick % SPIN.length) + SPIN.length) % SPIN.length]);
    else out.push("○");
  }
  return out.join("");
}

/** Full chip text for A.6, e.g. `🔄 wf-ab12 3/7 ●●●◓○○○ · 4.2k tk`. Empty when none/hidden. */
export function workflowChip(opts: WorkflowChipOptions = {}): string {
  if (opts.hidden) return "";
  const wf = readActiveWorkflow(opts);
  if (!wf) return "";
  const id = wf.id.length > 8 ? wf.id.slice(0, 8) : wf.id;
  const dots = progressDots(wf.done, wf.total, 7, opts.tick ?? 0);
  const tok = wf.tokens > 0 ? ` · ${(wf.tokens / 1000).toFixed(1)}k tk` : "";
  return `🔄 wf-${id} ${wf.done}/${wf.total} ${dots}${tok}`;
}
