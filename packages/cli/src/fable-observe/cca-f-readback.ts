// packages/cli/src/fable-observe/cca-f-readback.ts — Wave 54.
//
// Read decisions.jsonl back from disk so Phase C/D operate on exactly what was
// logged (single source of truth). Corrupt lines are skipped, never invented.

import { readFileSync } from "node:fs";

import type { DecisionRecord } from "./cca-f-audit.ts";

export function readDecisions(path: string): DecisionRecord[] {
  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch {
    return [];
  }
  const out: DecisionRecord[] = [];
  for (const line of raw.split("\n")) {
    const t = line.trim();
    if (!t) continue;
    try {
      out.push(JSON.parse(t) as DecisionRecord);
    } catch {
      /* skip corrupt line */
    }
  }
  return out;
}
