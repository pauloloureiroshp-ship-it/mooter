// L15 — ROI tracker (Wave 29 STUB; full impl Wave 30).
//
// Append-only local log of realised savings per ecosystem item, plus a simple
// aggregate. Wave 30 adds attribution modelling + the statusline weekly digest.
// Local-only; nothing uploaded.

import { mooterPath, appendJsonl } from "../config.ts";
import { readFileSync, existsSync } from "node:fs";

export interface RoiEntry {
  ts: string; // ISO
  item_id: string;
  tokens_saved: number;
  usd_saved: number;
  source: string; // e.g. "caveman", "lingua"
}

export interface RoiSummary {
  total_tokens_saved: number;
  total_usd_saved: number;
  by_item: Record<string, { tokens_saved: number; usd_saved: number; events: number }>;
  events: number;
}

function roiPath(): string {
  return mooterPath("ecosystem", "roi.jsonl");
}

export function trackRoi(entry: RoiEntry): void {
  appendJsonl(roiPath(), entry);
}

export function readRoiEntries(path = roiPath()): RoiEntry[] {
  try {
    if (!existsSync(path)) return [];
    return readFileSync(path, "utf8")
      .split("\n")
      .filter((l) => l.trim())
      .map((l) => {
        try {
          return JSON.parse(l) as RoiEntry;
        } catch {
          return null;
        }
      })
      .filter((e): e is RoiEntry => e !== null);
  } catch {
    return [];
  }
}

export function summariseRoi(entries: RoiEntry[]): RoiSummary {
  const summary: RoiSummary = { total_tokens_saved: 0, total_usd_saved: 0, by_item: {}, events: entries.length };
  for (const e of entries) {
    summary.total_tokens_saved += e.tokens_saved || 0;
    summary.total_usd_saved += e.usd_saved || 0;
    const k = e.item_id || e.source || "unknown";
    const cur = summary.by_item[k] ?? { tokens_saved: 0, usd_saved: 0, events: 0 };
    cur.tokens_saved += e.tokens_saved || 0;
    cur.usd_saved += e.usd_saved || 0;
    cur.events += 1;
    summary.by_item[k] = cur;
  }
  return summary;
}

export function getRoiSummary(): RoiSummary {
  return summariseRoi(readRoiEntries());
}
