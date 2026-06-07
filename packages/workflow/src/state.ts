// SQLite checkpoint store — Phase F (T2).
//
// ~/.mooter/workflows/state.db via better-sqlite3. Tables: runs, checkpoints,
// agents. Enables cross-session resume: kill mid-run, restart, resumeFrom()
// continues exactly where it left off. This is the headline differentiator vs
// Anthropic Dynamic Workflows (which resume same-session only).
//
// better-sqlite3 is a native module. We import it LAZILY (createRequire inside
// loadDriver()) so that merely importing this file — or index.ts, which
// re-exports it — pulls in NO native binary until a store is actually opened.
// The type import is erased at compile time, so it costs nothing at load.

import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import type DatabaseCtor from "better-sqlite3";
import type { Database } from "better-sqlite3";
import type { CheckpointSink } from "./primitives.ts";
import { setSink } from "./primitives.ts";
import { priceTurn } from "./pricing.ts";

const require = createRequire(import.meta.url);

let _Driver: typeof DatabaseCtor | null = null;
function loadDriver(): typeof DatabaseCtor {
  if (!_Driver) _Driver = require("better-sqlite3") as typeof DatabaseCtor;
  return _Driver;
}

export type RunStatus = "running" | "completed" | "failed" | "cancelled";

/** A run row. The optional columns are populated as the run progresses
 *  (totals/cost on finish, script/args on creation for cross-session re-run). */
export interface RunRecord {
  run_id: string;
  workflow_name?: string;
  ts_start: number;
  ts_end?: number;
  status: RunStatus;
  num_phases?: number;
  num_agents_total?: number;
  num_agents_local?: number;
  num_agents_cloud?: number;
  actual_cost_usd?: number;
  estimated_savings_usd?: number;
  /** The orchestration script, persisted so a fresh process can resume it. */
  script?: string;
  /** JSON-encoded args passed to the script. */
  args?: string;
}

export interface CheckpointRecord {
  run_id: string;
  name: string;
  data: unknown;
  ts: number;
}

export interface AgentRecord {
  run_id: string;
  label?: string;
  backend?: string;
  model?: string;
  tokens_in?: number;
  tokens_out?: number;
  cost_usd?: number;
  latency_ms?: number;
  ts: number;
}

export interface StartRunInput {
  run_id: string;
  workflow_name?: string;
  num_phases?: number;
  script?: string;
  args?: unknown;
}

export interface AgentInput {
  label?: string;
  backend?: string;
  model?: string;
  tokens_in?: number;
  tokens_out?: number;
  cost_usd?: number;
  latency_ms?: number;
}

/** Baseline model used to estimate "what this run would have cost all-Opus".
 *  Local (ollama) agents are billed $0 actual; their savings = the Opus price
 *  for the same token counts. priceTurn() returns 0 if the id is unknown, so an
 *  unrecognised baseline degrades to "no savings reported" rather than throwing. */
const OPUS_BASELINE_MODEL = "claude-opus-4-8";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS runs (
  run_id TEXT PRIMARY KEY,
  workflow_name TEXT,
  ts_start INTEGER NOT NULL,
  ts_end INTEGER,
  status TEXT NOT NULL DEFAULT 'running',
  num_phases INTEGER,
  num_agents_total INTEGER,
  num_agents_local INTEGER,
  num_agents_cloud INTEGER,
  actual_cost_usd REAL,
  estimated_savings_usd REAL,
  script TEXT,
  args TEXT
);
CREATE TABLE IF NOT EXISTS checkpoints (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id TEXT NOT NULL,
  name TEXT NOT NULL,
  data TEXT,
  ts INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_checkpoints_run ON checkpoints(run_id, ts);
CREATE INDEX IF NOT EXISTS idx_checkpoints_name ON checkpoints(run_id, name, ts);
CREATE TABLE IF NOT EXISTS agents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id TEXT NOT NULL,
  label TEXT,
  backend TEXT,
  model TEXT,
  tokens_in INTEGER,
  tokens_out INTEGER,
  cost_usd REAL,
  latency_ms INTEGER,
  ts INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_agents_run ON agents(run_id, ts);
`;

function jsonOrNull(v: unknown): string | null {
  return v === undefined ? null : JSON.stringify(v);
}
function parseJson(v: unknown): unknown {
  if (typeof v !== "string") return null;
  try {
    return JSON.parse(v);
  } catch {
    return v;
  }
}

function rowToRun(r: Record<string, unknown> | undefined): RunRecord | null {
  if (!r) return null;
  const out: RunRecord = {
    run_id: String(r.run_id),
    ts_start: Number(r.ts_start),
    status: (r.status as RunStatus) ?? "running",
  };
  if (r.workflow_name != null) out.workflow_name = String(r.workflow_name);
  if (r.ts_end != null) out.ts_end = Number(r.ts_end);
  if (r.num_phases != null) out.num_phases = Number(r.num_phases);
  if (r.num_agents_total != null) out.num_agents_total = Number(r.num_agents_total);
  if (r.num_agents_local != null) out.num_agents_local = Number(r.num_agents_local);
  if (r.num_agents_cloud != null) out.num_agents_cloud = Number(r.num_agents_cloud);
  if (r.actual_cost_usd != null) out.actual_cost_usd = Number(r.actual_cost_usd);
  if (r.estimated_savings_usd != null) out.estimated_savings_usd = Number(r.estimated_savings_usd);
  if (r.script != null) out.script = String(r.script);
  if (r.args != null) out.args = String(r.args);
  return out;
}

/** A handle to one state.db file. Cheap to open; remember to close(). */
export class WorkflowStore {
  readonly db: Database;
  readonly path: string;

  constructor(dbPath: string) {
    this.path = dbPath;
    if (dbPath !== ":memory:") {
      fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    }
    const Driver = loadDriver();
    this.db = new Driver(dbPath);
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("foreign_keys = ON");
    this.db.exec(SCHEMA);
    this.db.pragma("user_version = 1");
  }

  /** Create (or re-arm, on resume) a run. ts_start is preserved across resumes;
   *  status is reset to 'running' and ts_end cleared so a resumed run is live. */
  startRun(input: StartRunInput): void {
    this.db
      .prepare(
        `INSERT INTO runs (run_id, workflow_name, ts_start, status, num_phases, script, args)
         VALUES (@run_id, @workflow_name, @ts_start, 'running', @num_phases, @script, @args)
         ON CONFLICT(run_id) DO UPDATE SET
           status='running',
           ts_end=NULL,
           workflow_name=COALESCE(excluded.workflow_name, runs.workflow_name),
           num_phases=COALESCE(excluded.num_phases, runs.num_phases),
           script=COALESCE(excluded.script, runs.script),
           args=COALESCE(excluded.args, runs.args)`,
      )
      .run({
        run_id: input.run_id,
        workflow_name: input.workflow_name ?? null,
        ts_start: Date.now(),
        num_phases: input.num_phases ?? null,
        script: input.script ?? null,
        args: jsonOrNull(input.args),
      });
  }

  /** Mark a run terminal and roll up totals/cost/savings from the agents table. */
  finishRun(runId: string, status: RunStatus): RunRecord | null {
    const agents = this.agentsFor(runId);
    let local = 0,
      cloud = 0,
      actual = 0,
      allOpus = 0;
    for (const a of agents) {
      if (a.backend === "ollama") local++;
      else if (a.backend === "claude-api") cloud++;
      actual += a.cost_usd ?? 0;
      allOpus += priceTurn(OPUS_BASELINE_MODEL, a.tokens_in ?? 0, a.tokens_out ?? 0);
    }
    const savings = Math.max(0, allOpus - actual);
    this.db
      .prepare(
        `UPDATE runs SET
           status=@status, ts_end=@ts_end,
           num_agents_total=@total, num_agents_local=@local, num_agents_cloud=@cloud,
           actual_cost_usd=@actual, estimated_savings_usd=@savings
         WHERE run_id=@run_id`,
      )
      .run({
        run_id: runId,
        status,
        ts_end: Date.now(),
        total: agents.length,
        local,
        cloud,
        actual,
        savings,
      });
    return this.loadRun(runId);
  }

  saveCheckpoint(runId: string, name: string, data: unknown): void {
    this.db
      .prepare(`INSERT INTO checkpoints (run_id, name, data, ts) VALUES (?, ?, ?, ?)`)
      .run(runId, name, jsonOrNull(data), Date.now());
  }

  recordAgent(runId: string, a: AgentInput): void {
    this.db
      .prepare(
        `INSERT INTO agents (run_id, label, backend, model, tokens_in, tokens_out, cost_usd, latency_ms, ts)
         VALUES (@run_id, @label, @backend, @model, @tokens_in, @tokens_out, @cost_usd, @latency_ms, @ts)`,
      )
      .run({
        run_id: runId,
        label: a.label ?? null,
        backend: a.backend ?? null,
        model: a.model ?? null,
        tokens_in: a.tokens_in ?? null,
        tokens_out: a.tokens_out ?? null,
        cost_usd: a.cost_usd ?? null,
        latency_ms: a.latency_ms ?? null,
        ts: Date.now(),
      });
  }

  loadRun(runId: string): RunRecord | null {
    const row = this.db.prepare(`SELECT * FROM runs WHERE run_id = ?`).get(runId) as
      | Record<string, unknown>
      | undefined;
    return rowToRun(row);
  }

  listRuns(limit = 50): RunRecord[] {
    const rows = this.db
      .prepare(`SELECT * FROM runs ORDER BY ts_start DESC, rowid DESC LIMIT ?`)
      .all(limit) as Record<string, unknown>[];
    return rows.map((r) => rowToRun(r)!).filter(Boolean);
  }

  agentsFor(runId: string): AgentRecord[] {
    const rows = this.db
      .prepare(`SELECT * FROM agents WHERE run_id = ? ORDER BY ts ASC, id ASC`)
      .all(runId) as Record<string, unknown>[];
    return rows.map((r) => ({
      run_id: String(r.run_id),
      label: r.label != null ? String(r.label) : undefined,
      backend: r.backend != null ? String(r.backend) : undefined,
      model: r.model != null ? String(r.model) : undefined,
      tokens_in: r.tokens_in != null ? Number(r.tokens_in) : undefined,
      tokens_out: r.tokens_out != null ? Number(r.tokens_out) : undefined,
      cost_usd: r.cost_usd != null ? Number(r.cost_usd) : undefined,
      latency_ms: r.latency_ms != null ? Number(r.latency_ms) : undefined,
      ts: Number(r.ts),
    }));
  }

  /** The latest data recorded under `name` for this run, or null if never seen. */
  getCheckpoint(runId: string, name: string): CheckpointRecord | null {
    const row = this.db
      .prepare(
        `SELECT run_id, name, data, ts FROM checkpoints
         WHERE run_id = ? AND name = ? ORDER BY ts DESC, id DESC LIMIT 1`,
      )
      .get(runId, name) as Record<string, unknown> | undefined;
    if (!row) return null;
    return { run_id: String(row.run_id), name: String(row.name), data: parseJson(row.data), ts: Number(row.ts) };
  }

  /** The resumable state: the LATEST data per checkpoint name, ordered by when
   *  each milestone was FIRST reached. A fresh process calls this to skip work
   *  already completed in a prior session — the cross-session resume primitive.
   *  (Ordering by first-seen, not the latest write, keeps phase order stable even
   *  when a milestone is re-checkpointed within the same millisecond.) */
  resumeFrom(runId: string): CheckpointRecord[] {
    const rows = this.db
      .prepare(
        `SELECT c.run_id, c.name, c.data, c.ts
         FROM checkpoints c
         JOIN (SELECT name, MAX(id) AS max_id, MIN(id) AS min_id
               FROM checkpoints WHERE run_id = ? GROUP BY name) latest
           ON c.id = latest.max_id
         ORDER BY latest.min_id ASC`,
      )
      .all(runId) as Record<string, unknown>[];
    return rows.map((r) => ({
      run_id: String(r.run_id),
      name: String(r.name),
      data: parseJson(r.data),
      ts: Number(r.ts),
    }));
  }

  close(): void {
    if (this.db.open) this.db.close();
  }
}

// ── Default (singleton) store ─────────────────────────────────────────────────

/** Resolve the on-disk path for the default store.
 *  Override with MOOTER_WORKFLOW_DB (full path) or MOOTER_HOME (home dir). */
export function defaultDbPath(): string {
  const explicit = process.env.MOOTER_WORKFLOW_DB;
  if (explicit) return explicit;
  const home = process.env.MOOTER_HOME || os.homedir();
  return path.join(home, ".mooter", "workflows", "state.db");
}

let _default: WorkflowStore | null = null;
function defaultStore(): WorkflowStore {
  if (!_default) _default = new WorkflowStore(defaultDbPath());
  return _default;
}

/** Close + drop the cached default store (next call reopens). Mainly for tests. */
export function closeDefaultStore(): void {
  if (_default) {
    _default.close();
    _default = null;
  }
}

export function startRun(input: StartRunInput): void {
  defaultStore().startRun(input);
}
export function finishRun(runId: string, status: RunStatus): RunRecord | null {
  return defaultStore().finishRun(runId, status);
}
export function saveCheckpoint(runId: string, name: string, data: unknown): void {
  defaultStore().saveCheckpoint(runId, name, data);
}
export function recordAgent(runId: string, a: AgentInput): void {
  defaultStore().recordAgent(runId, a);
}
export function loadRun(runId: string): RunRecord | null {
  return defaultStore().loadRun(runId);
}
export function listRuns(limit = 50): RunRecord[] {
  return defaultStore().listRuns(limit);
}
export function resumeFrom(runId: string): CheckpointRecord[] {
  return defaultStore().resumeFrom(runId);
}

// ── Sink wiring (the seam Phase D prepared via setSink) ────────────────────────

export interface SqliteSinkOptions {
  /** Store to persist into. Defaults to the singleton store. */
  store?: WorkflowStore;
  /** Side-channel for log lines (TUI/stderr). The schema has no logs table, so
   *  logs are forwarded here rather than persisted. Default: swallow. */
  onLog?: (message: string, metadata?: Record<string, unknown>) => void;
}

/** A CheckpointSink that durably persists checkpoints to SQLite under `runId`.
 *  log() forwards to onLog (logs aren't part of the resume schema). */
export function createSqliteSink(runId: string, options: SqliteSinkOptions = {}): CheckpointSink {
  const store = options.store ?? defaultStore();
  return {
    saveCheckpoint(name, data) {
      store.saveCheckpoint(runId, name, data);
    },
    log(message, metadata) {
      options.onLog?.(message, metadata);
    },
  };
}

/** Install the SQLite-backed sink as the ambient checkpoint sink for `runId`.
 *  This is the integration point Phase D left open via setSink(): after this,
 *  the primitives' checkpoint()/log() persist to state.db. Returns the store so
 *  the caller can finishRun()/loadRun() later. */
export function installSqliteSink(runId: string, options: SqliteSinkOptions = {}): WorkflowStore {
  const store = options.store ?? defaultStore();
  setSink(createSqliteSink(runId, { ...options, store }));
  return store;
}
