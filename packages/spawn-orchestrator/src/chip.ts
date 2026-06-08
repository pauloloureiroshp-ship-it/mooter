// Wave 33.5 Block B.5 — 🐝 spawns statusline chip data.
//
// Pure data builder; the live statusline JS module (tools/router/spawns-status.js)
// mirrors this read. Hidden via preferences.json hidden_chips: ["spawns"].

import { listRecords } from "./state.ts";
import type { SpawnRecord } from "./types.ts";

export function spawnSummary(records: SpawnRecord[]): { active: number; totalCostUsd: number } {
  const active = records.filter((r) => r.status === "running" || r.status === "sandboxed").length;
  const totalCostUsd = records.reduce((a, r) => a + (Number(r.estCostUsd) || 0), 0);
  return { active, totalCostUsd };
}

export function spawnChip(opts: { home?: string; hidden?: boolean } = {}): string {
  if (opts.hidden) return "";
  const { active, totalCostUsd } = spawnSummary(listRecords(opts.home));
  if (active === 0) return "";
  const cost = totalCostUsd > 0 ? ` · $${totalCostUsd.toFixed(2)} total` : "";
  return `🐝 ${active} spawn${active === 1 ? "" : "s"} active${cost}`;
}
