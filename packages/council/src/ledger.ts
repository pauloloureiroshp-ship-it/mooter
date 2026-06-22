// Vault ledger + last-council state.
//
// The ledger is a local append-only JSONL of content-free telemetry records, kept in
// the Mooter home (~/.mooter, the "vault" — outside the repo). The last-council state
// is a tiny JSON the persistent statusline reads to render the 🏛 chip between turns
// (the data layer the chip needs; wiring it into tools/router/*.js statusline is a
// follow-up that must pick the right of the dual statusline files — see SYNC).

import { mkdirSync, appendFileSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { CouncilVerdict } from "./types.ts";
import type { CouncilTelemetry, TelemetryMeta } from "./telemetry.ts";
import { buildTelemetryRecord } from "./telemetry.ts";
import { allOpusBaselineUsd } from "./chip.ts";

export interface VaultOptions {
  /** Override the Mooter home (vault) dir. Default: $MOOTER_HOME or ~/.mooter. */
  home?: string;
}

export function mooterHome(opts: VaultOptions = {}): string {
  return opts.home ?? process.env.MOOTER_HOME ?? join(homedir(), ".mooter");
}

/** Append a content-free telemetry record to the vault ledger (JSONL). Returns path. */
export function appendLedger(rec: CouncilTelemetry, opts: VaultOptions = {}): string {
  const dir = mooterHome(opts);
  mkdirSync(dir, { recursive: true });
  const file = join(dir, "council-ledger.jsonl");
  appendFileSync(file, JSON.stringify(rec) + "\n");
  return file;
}

export interface LastCouncilState {
  latencyMs: number;
  costUsd: number;
  modelCalls: number;
  convergence: string;
  savedPct: number;
  category: string;
  ts?: number;
}

/** Write the small state file the statusline chip reads. Content-free. Returns path. */
export function writeLastCouncilState(
  verdict: CouncilVerdict,
  meta: { category: string; ts?: number },
  opts: VaultOptions = {},
): string {
  const dir = mooterHome(opts);
  mkdirSync(dir, { recursive: true });
  const baseline = allOpusBaselineUsd(verdict);
  const savedPct = baseline > 0 ? Math.max(0, Math.round(((baseline - verdict.costUsd) / baseline) * 100)) : 0;
  const state: LastCouncilState = {
    latencyMs: verdict.latencyMs,
    costUsd: verdict.costUsd,
    modelCalls: verdict.modelCalls,
    convergence: verdict.convergence,
    savedPct,
    category: meta.category,
    ts: meta.ts,
  };
  const file = join(dir, "council-last.json");
  writeFileSync(file, JSON.stringify(state, null, 2));
  return file;
}

export function readLastCouncilState(opts: VaultOptions = {}): LastCouncilState | null {
  const file = join(mooterHome(opts), "council-last.json");
  if (!existsSync(file)) return null;
  try {
    return JSON.parse(readFileSync(file, "utf8")) as LastCouncilState;
  } catch {
    return null;
  }
}

/**
 * One-call persistence after a deliberation: build the content-free record, append it
 * to the vault ledger, and refresh the statusline state. Returns the record + paths.
 */
export function recordCouncil(
  verdict: CouncilVerdict,
  meta: TelemetryMeta,
  opts: VaultOptions = {},
): { record: CouncilTelemetry; ledgerPath: string; statePath: string } {
  const record = buildTelemetryRecord(verdict, meta);
  const ledgerPath = appendLedger(record, opts);
  const statePath = writeLastCouncilState(verdict, { category: meta.category, ts: meta.ts }, opts);
  return { record, ledgerPath, statePath };
}
