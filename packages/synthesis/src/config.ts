// Shared local config + paths for the synthesis layers.
//
// Everything lives under ~/.mooter (override with MOOTER_HOME for tests). All
// reads are crash-safe: a missing/corrupt file yields the provided fallback so
// passive (opt-in-off) operation never throws.

import { homedir } from "node:os";
import { join } from "node:path";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";

export function mooterHome(): string {
  return process.env.MOOTER_HOME && process.env.MOOTER_HOME.length > 0
    ? process.env.MOOTER_HOME
    : join(homedir(), ".mooter");
}

export function mooterPath(...parts: string[]): string {
  return join(mooterHome(), ...parts);
}

export function readJsonSafe<T>(path: string, fallback: T): T {
  try {
    if (!existsSync(path)) return fallback;
    const raw = readFileSync(path, "utf8");
    if (!raw.trim()) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function writeJson(path: string, data: unknown): void {
  const dir = path.slice(0, path.lastIndexOf("/"));
  if (dir && !existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(path, JSON.stringify(data, null, 2) + "\n", "utf8");
}

export function appendJsonl(path: string, record: unknown): void {
  const dir = path.slice(0, path.lastIndexOf("/"));
  if (dir && !existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(path, JSON.stringify(record) + "\n", { flag: "a" });
}

export interface Preferences {
  [key: string]: unknown;
}

export function readPreferences(): Preferences {
  return readJsonSafe<Preferences>(mooterPath("preferences.json"), {});
}
