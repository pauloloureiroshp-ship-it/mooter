// Pastor v2 adapter state (Wave 31). The live record of which per-task adapter is
// active and per-adapter usage. Persisted at ~/.mooter/pastor/adapters-active.json
// — this is exactly the file the statusline line-3 chip (pastor-status.js) reads to
// render "🧠 pastor: N adapters · <type> active". Features only; no prompt content.

import { mooterPath, readJsonSafe, writeJson } from "../config.ts";
import { listTaskAdapters, type TaskType } from "../lora/adapter-registry.ts";

export interface AdapterUsage {
  count: number;
  last_used: string; // ISO
  avg_confidence: number;
}

export interface PastorState {
  version: number;
  registered: number; // count of registered task adapters
  active_adapter: string | null; // adapter NAME (e.g. "pastor-frontend")
  active_type: TaskType | null; // adapter TASK TYPE (e.g. "coding-frontend")
  usage: Record<string, AdapterUsage>;
  updated_at: string;
}

export function pastorStatePath(): string {
  return mooterPath("pastor", "adapters-active.json");
}

export function emptyPastorState(): PastorState {
  return {
    version: 1,
    registered: 0,
    active_adapter: null,
    active_type: null,
    usage: {},
    updated_at: new Date(0).toISOString(),
  };
}

export function loadPastorState(): PastorState {
  const s = readJsonSafe<PastorState>(pastorStatePath(), emptyPastorState());
  if (typeof s.version !== "number") return emptyPastorState();
  if (!s.usage || typeof s.usage !== "object") s.usage = {};
  return s;
}

export function savePastorState(s: PastorState, now: Date = new Date()): PastorState {
  s.updated_at = now.toISOString();
  s.registered = listTaskAdapters().filter((a) => a.task_type !== "baseline").length;
  writeJson(pastorStatePath(), s);
  return s;
}

/**
 * Record that a route selected `adapterName` (task_type) with `confidence`. Updates
 * the active pointer + per-adapter rolling average. Pure given the clock.
 */
export function recordRoute(
  adapterName: string,
  taskType: TaskType,
  confidence: number,
  now: Date = new Date(),
): PastorState {
  const s = loadPastorState();
  const prev = s.usage[adapterName] ?? { count: 0, last_used: now.toISOString(), avg_confidence: 0 };
  const count = prev.count + 1;
  const avg = (prev.avg_confidence * prev.count + confidence) / count;
  s.usage[adapterName] = { count, last_used: now.toISOString(), avg_confidence: Math.round(avg * 1000) / 1000 };
  s.active_adapter = adapterName;
  s.active_type = taskType;
  return savePastorState(s, now);
}

export interface PastorSummary {
  registered: number;
  active_type: TaskType | null;
  active_adapter: string | null;
  total_routes: number;
}

export function summarizePastor(s: PastorState = loadPastorState()): PastorSummary {
  const total = Object.values(s.usage).reduce((n, u) => n + (u.count || 0), 0);
  const registered = s.registered || listTaskAdapters().filter((a) => a.task_type !== "baseline").length;
  return {
    registered,
    active_type: s.active_type,
    active_adapter: s.active_adapter,
    total_routes: total,
  };
}
