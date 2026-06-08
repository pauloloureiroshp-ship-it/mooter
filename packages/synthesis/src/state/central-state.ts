// central-state.ts — single source of truth for wave/phase state.
//
// Lives at ~/.mooter/state.json (override via MOOTER_HOME). Wave 30 Phase D.
//
// This is a NEW subdir under packages/synthesis (Wave 29 LIVE code is untouched —
// we only import the existing config helpers from ../config.ts and add nothing to
// synthesis/src/index.ts). All reads are crash-safe; writes are JSON pretty-print.
//
// Clock is injected (default `new Date()`) so tests are deterministic.

import { mooterPath, readJsonSafe, writeJson } from "../config.ts";

export const STATE_VERSION = 1;

/** The doctrine-gated classify.js sha. `mooter wave status` verifies against this. */
export const EXPECTED_CLASSIFY_SHA =
  "7b01eb8623a0b8fcff17b976e9afcf572f3a762bf60c578a5099dac014b87762";

export type PhaseStatus = "todo" | "in_progress" | "done";

export interface PhaseState {
  id: string; // "A".."O"
  title: string;
  status: PhaseStatus;
  commit?: string;
  notes?: string;
  updatedAt?: string;
}

export interface WaveState {
  number: number;
  branch: string;
  phase: string; // current phase id, "" if none
  phases: PhaseState[];
  startedAt: string;
  shippedAt?: string;
  tag?: string;
  mergeCommit?: string;
}

export interface CentralState {
  version: number;
  classifySha: string | null; // last-recorded sha
  currentWave: WaveState | null;
  history: WaveState[];
  updatedAt: string;
}

export function statePath(): string {
  return mooterPath("state.json");
}

export function emptyState(): CentralState {
  return {
    version: STATE_VERSION,
    classifySha: null,
    currentWave: null,
    history: [],
    updatedAt: new Date(0).toISOString(),
  };
}

/** Load state, normalising shape so callers never crash on a partial/corrupt file. */
export function loadState(): CentralState {
  const s = readJsonSafe<CentralState>(statePath(), emptyState());
  if (typeof s.version !== "number") return emptyState();
  if (!Array.isArray(s.history)) s.history = [];
  if (s.currentWave && !Array.isArray(s.currentWave.phases)) {
    s.currentWave.phases = [];
  }
  return s;
}

export function saveState(s: CentralState, now: Date = new Date()): CentralState {
  s.updatedAt = now.toISOString();
  writeJson(statePath(), s);
  return s;
}

export interface StartWaveInput {
  number: number;
  branch: string;
  phases?: Array<{ id: string; title: string }>;
  startPhase?: string;
}

/**
 * Begin (or restart) a wave. Idempotent: re-running replaces the current wave's
 * scaffold but preserves `history`. The first (or `startPhase`) phase is marked
 * in_progress.
 */
export function startWave(input: StartWaveInput, now: Date = new Date()): CentralState {
  const s = loadState();
  const phases: PhaseState[] = (input.phases ?? []).map((p) => ({
    id: p.id,
    title: p.title,
    status: "todo" as PhaseStatus,
  }));
  const phase = input.startPhase ?? phases[0]?.id ?? "";
  const wave: WaveState = {
    number: input.number,
    branch: input.branch,
    phase,
    phases,
    startedAt: now.toISOString(),
  };
  const cur = wave.phases.find((p) => p.id === phase);
  if (cur) {
    cur.status = "in_progress";
    cur.updatedAt = now.toISOString();
  }
  s.currentWave = wave;
  return saveState(s, now);
}

/** Update one phase (creating it if absent). Sets the current-phase pointer when status→in_progress. */
export function setPhase(
  id: string,
  patch: Partial<Pick<PhaseState, "status" | "commit" | "notes">>,
  now: Date = new Date(),
): CentralState {
  const s = loadState();
  if (!s.currentWave) {
    throw new Error("no active wave — run `mooter wave start <n>` first");
  }
  let ph = s.currentWave.phases.find((p) => p.id === id);
  if (!ph) {
    ph = { id, title: id, status: "todo" };
    s.currentWave.phases.push(ph);
  }
  if (patch.status) ph.status = patch.status;
  if (patch.commit) ph.commit = patch.commit;
  if (patch.notes) ph.notes = patch.notes;
  ph.updatedAt = now.toISOString();
  if (patch.status === "in_progress") s.currentWave.phase = id;
  return saveState(s, now);
}

export function recordClassifySha(sha: string, now: Date = new Date()): CentralState {
  const s = loadState();
  s.classifySha = sha;
  return saveState(s, now);
}

/** True iff `actual` matches the doctrine-gated sha. */
export function classifyShaOk(actual: string): boolean {
  return actual === EXPECTED_CLASSIFY_SHA;
}

export interface ShipWaveInput {
  tag?: string;
  mergeCommit?: string;
}

/** Close the current wave: stamp shippedAt/tag, move to history, clear currentWave. */
export function shipWave(input: ShipWaveInput = {}, now: Date = new Date()): CentralState {
  const s = loadState();
  if (!s.currentWave) throw new Error("no active wave to ship");
  s.currentWave.shippedAt = now.toISOString();
  if (input.tag) s.currentWave.tag = input.tag;
  if (input.mergeCommit) s.currentWave.mergeCommit = input.mergeCommit;
  s.history.push(s.currentWave);
  s.currentWave = null;
  return saveState(s, now);
}

export interface WaveSummary {
  active: boolean;
  number: number | null;
  branch: string | null;
  phase: string | null;
  done: number;
  total: number;
  phases: PhaseState[];
  classifyShaRecorded: string | null;
  historyCount: number;
}

export function summarize(s: CentralState = loadState()): WaveSummary {
  const w = s.currentWave;
  return {
    active: !!w,
    number: w?.number ?? null,
    branch: w?.branch ?? null,
    phase: w?.phase ?? null,
    done: w ? w.phases.filter((p) => p.status === "done").length : 0,
    total: w ? w.phases.length : 0,
    phases: w?.phases ?? [],
    classifyShaRecorded: s.classifySha,
    historyCount: s.history.length,
  };
}
