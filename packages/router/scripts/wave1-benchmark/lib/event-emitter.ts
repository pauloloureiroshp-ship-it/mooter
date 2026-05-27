// event-emitter.ts — JSONL append with schema validation + data-lake fan-out (§15.5).
//
// Every BenchEvent is schema-validated before it touches disk (DoD: 100% rows
// valid), appended to RAW_RESULTS.jsonl, and mirrored to the unified hot-tier
// data lake (~/.mooter/cache/events/<date>.jsonl). Parquet compaction is a
// batch step at end-of-run (parquet-write.ts), not per-row.

import { appendFileSync, writeFileSync, readFileSync, existsSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { assertValidEvent } from "./schema-validate.ts";
import type { BenchEvent } from "./types.ts";

function ensureDir(filePath: string): void {
  const dir = dirname(filePath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

export function appendJsonl(path: string, obj: unknown): void {
  ensureDir(path);
  appendFileSync(path, JSON.stringify(obj) + "\n", "utf8");
}

export function writeJsonl(path: string, objs: unknown[]): void {
  ensureDir(path);
  writeFileSync(path, objs.map((o) => JSON.stringify(o)).join("\n") + (objs.length ? "\n" : ""), "utf8");
}

export function readJsonl<T>(path: string): T[] {
  if (!existsSync(path)) return [];
  return readFileSync(path, "utf8")
    .split("\n")
    .filter((l) => l.trim().length > 0)
    .map((l) => JSON.parse(l) as T);
}

/** Data-lake hot-tier path for a given UTC date (YYYY-MM-DD). */
export function dataLakeEventsPath(date: string): string {
  return join(homedir(), ".mooter", "cache", "events", `${date}.jsonl`);
}

/** Validate, append to RAW_RESULTS.jsonl, and mirror to the data lake. */
export function emitEvent(rawResultsPath: string, ev: BenchEvent, lakeDate: string): void {
  assertValidEvent(ev);
  appendJsonl(rawResultsPath, ev);
  appendJsonl(dataLakeEventsPath(lakeDate), ev);
}

/** Rewrite RAW_RESULTS.jsonl in place (used after judging back-fills scores). */
export function rewriteEvents(rawResultsPath: string, events: BenchEvent[]): void {
  for (const ev of events) assertValidEvent(ev);
  writeJsonl(rawResultsPath, events);
}
