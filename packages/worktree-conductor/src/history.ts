// Wave 33.5 Block H — append-only operations log + tail reader.

import { appendFileSync, mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";

import { historyPath } from "./paths.ts";
import type { HistoryEntry } from "./types.ts";

export function appendHistory(entry: HistoryEntry, home?: string): void {
  const p = historyPath(home);
  try {
    mkdirSync(dirname(p), { recursive: true });
    appendFileSync(p, JSON.stringify(entry) + "\n");
  } catch {
    /* history is advisory — never block an op on a log write */
  }
}

export function readHistory(home?: string, limit = 50): HistoryEntry[] {
  let data: string;
  try {
    data = readFileSync(historyPath(home), "utf8");
  } catch {
    return [];
  }
  const out: HistoryEntry[] = [];
  for (const line of data.split("\n")) {
    if (!line) continue;
    try {
      out.push(JSON.parse(line) as HistoryEntry);
    } catch {
      /* skip */
    }
  }
  return out.slice(-limit).reverse();
}
