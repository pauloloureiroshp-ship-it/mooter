// Wave 33.5 Block A.5 — cross-session Pastor aggregation.
//
// Merges classified decisions across ALL local sessions into a per-task-category
// tier histogram and emits an ADVISORY modal-tier suggestion. This enriches the
// per-task LORAUTER signal with cross-session evidence — it is advisory only and
// NEVER mutates classify.js or overrides a tier floor (doctrine guardrail). The
// per-task router stays the source of truth; this is a confidence hint.

import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import type { Tier } from "./types.ts";

export interface CategoryAggregate {
  category: string;
  counts: Record<Tier, number>;
  total: number;
  /** Most-used tier across sessions. */
  modalTier: Tier;
  /** Modal tier's share of the category's calls (0..1). */
  confidence: number;
  /** Distinct session_ids that contributed — the "cross-session" weight. */
  sessions: number;
}

export interface AggregateResult {
  generatedAtMs: number;
  totalDecisions: number;
  totalSessions: number;
  categories: CategoryAggregate[];
}

export interface AggregateOptions {
  home?: string;
  now?: number;
  /** Drop categories with fewer than this many decisions (defaults 3). */
  minSupport?: number;
}

function decisionsLogPath(home: string): string {
  return join(home, ".claude", "tools", "router", "decisions.log");
}

const ZERO = (): Record<Tier, number> => ({ T0: 0, T1: 0, T2: 0, T3: 0 });

export function aggregateCrossSession(opts: AggregateOptions = {}): AggregateResult {
  const home = opts.home ?? homedir();
  const now = opts.now ?? Date.now();
  const minSupport = opts.minSupport ?? 3;

  let data: string;
  try {
    data = readFileSync(decisionsLogPath(home), "utf8");
  } catch {
    return { generatedAtMs: now, totalDecisions: 0, totalSessions: 0, categories: [] };
  }

  const byCat = new Map<string, Record<Tier, number>>();
  const catSessions = new Map<string, Set<string>>();
  const allSessions = new Set<string>();
  let total = 0;

  for (const line of data.split("\n")) {
    if (!line || line.indexOf('"classified"') === -1) continue;
    try {
      const o = JSON.parse(line);
      if (o.event !== "classified") continue;
      const tier = String(o.tier ?? "");
      if (!/^T[0-3]$/.test(tier)) continue;
      const cat = String(o.task_category ?? "unknown");
      const sid = typeof o.session_id === "string" ? o.session_id : "";
      let rec = byCat.get(cat);
      if (!rec) {
        rec = ZERO();
        byCat.set(cat, rec);
        catSessions.set(cat, new Set());
      }
      rec[tier as Tier]++;
      total++;
      if (sid) {
        catSessions.get(cat)!.add(sid);
        allSessions.add(sid);
      }
    } catch {
      /* skip */
    }
  }

  const categories: CategoryAggregate[] = [];
  for (const [category, counts] of byCat) {
    const catTotal = counts.T0 + counts.T1 + counts.T2 + counts.T3;
    if (catTotal < minSupport) continue;
    let modalTier: Tier = "T0";
    for (const t of ["T1", "T2", "T3"] as Tier[]) {
      if (counts[t] > counts[modalTier]) modalTier = t;
    }
    categories.push({
      category,
      counts,
      total: catTotal,
      modalTier,
      confidence: Math.round((counts[modalTier] / catTotal) * 100) / 100,
      sessions: catSessions.get(category)?.size ?? 0,
    });
  }
  categories.sort((a, b) => b.total - a.total);

  return {
    generatedAtMs: now,
    totalDecisions: total,
    totalSessions: allSessions.size,
    categories,
  };
}

export function renderAggregate(r: AggregateResult): string {
  const out: string[] = [];
  out.push(
    `cross-session Pastor aggregate (advisory — does not override classify.js or tier floors)`,
  );
  out.push(`  ${r.totalDecisions} decisions across ${r.totalSessions} sessions`);
  if (!r.categories.length) {
    out.push(`  (no category has ≥ support threshold yet)`);
    return out.join("\n");
  }
  out.push("");
  out.push("  category                  modal  conf   sessions  T0/T1/T2/T3");
  for (const c of r.categories.slice(0, 15)) {
    const cat = c.category.padEnd(24);
    const mix = `${c.counts.T0}/${c.counts.T1}/${c.counts.T2}/${c.counts.T3}`;
    out.push(
      `  ${cat}  ${c.modalTier}    ${c.confidence.toFixed(2)}   ${String(c.sessions).padEnd(8)}  ${mix}`,
    );
  }
  return out.join("\n");
}
