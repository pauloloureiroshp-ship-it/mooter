// Wave 33.5 Block B — spawn record persistence (~/.mooter/spawns/<id>/).
//
// Each spawn owns a directory: state.json (the SpawnRecord) + output.log (the
// streamed stdout/stderr). Local-first, crash-safe reads.

import { writeFileSync, readFileSync, readdirSync, appendFileSync, mkdirSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import type { SpawnRecord } from "./types.ts";

export function spawnsRoot(home = process.env.MOOTER_HOME || homedir()): string {
  return process.env.MOOTER_HOME ? join(home, "spawns") : join(home, ".mooter", "spawns");
}

export function spawnDir(id: string, home?: string): string {
  return join(spawnsRoot(home), id);
}

export function statePath(id: string, home?: string): string {
  return join(spawnDir(id, home), "state.json");
}

export function outputPath(id: string, home?: string): string {
  return join(spawnDir(id, home), "output.log");
}

export function writeRecord(rec: SpawnRecord, home?: string): void {
  const dir = spawnDir(rec.id, home);
  mkdirSync(dir, { recursive: true });
  writeFileSync(statePath(rec.id, home), JSON.stringify(rec, null, 2) + "\n");
}

export function readRecord(id: string, home?: string): SpawnRecord | null {
  try {
    return JSON.parse(readFileSync(statePath(id, home), "utf8")) as SpawnRecord;
  } catch {
    return null;
  }
}

export function listRecords(home?: string): SpawnRecord[] {
  let ids: string[];
  try {
    ids = readdirSync(spawnsRoot(home));
  } catch {
    return [];
  }
  const out: SpawnRecord[] = [];
  for (const id of ids) {
    const r = readRecord(id, home);
    if (r) out.push(r);
  }
  return out.sort((a, b) => b.createdAtMs - a.createdAtMs);
}

export function appendOutput(id: string, chunk: string, home?: string): void {
  const dir = spawnDir(id, home);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  try {
    appendFileSync(outputPath(id, home), chunk);
  } catch {
    /* best-effort */
  }
}

export function readOutput(id: string, home?: string): string {
  try {
    return readFileSync(outputPath(id, home), "utf8");
  } catch {
    return "";
  }
}

/** Update mutable fields on a record and persist. Returns the updated record. */
export function patchRecord(id: string, patch: Partial<SpawnRecord>, now: number, home?: string): SpawnRecord | null {
  const rec = readRecord(id, home);
  if (!rec) return null;
  const next = { ...rec, ...patch, updatedAtMs: now };
  writeRecord(next, home);
  return next;
}
