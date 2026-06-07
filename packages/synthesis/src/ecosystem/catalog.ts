// L15 — Ecosystem Awareness: catalog (Wave 29 Phase 29.H, Paulo Vector B).
//
// Loads the curated seed catalog (audit/ECOSYSTEM_CATALOG_v1.json) of skills,
// plugins, MCP servers, Mooter packs and providers. Resolution order:
//   1. explicit opts.path  2. MOOTER_ECOSYSTEM_CATALOG env
//   3. repo audit/ relative to this module  4. <cwd>/audit/
// Crash-safe: any failure yields an empty catalog (passive operation).

import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { readJsonSafe } from "../config.ts";

export type CatalogCategory = "skill" | "plugin" | "mcp" | "pack" | "provider";

export interface CatalogCompatibility {
  hardware: string[];
  os: string[];
  subscription: string[];
  requires_npu?: boolean;
  min_vram_gb?: number;
}

export interface CatalogRoi {
  token_savings_pct?: number;
  latency_gain_pct?: number;
  quality_uplift_pp?: number;
}

export interface CatalogItem {
  id: string;
  name: string;
  category: CatalogCategory;
  description: string;
  trust_score: number;
  compatibility: CatalogCompatibility;
  roi_estimate: CatalogRoi;
  install_cmd: string;
  docs_url: string;
  source_url: string;
  tags: string[];
  attribution?: string;
  verified: boolean;
}

export interface Catalog {
  version: number;
  count: number;
  categories: CatalogCategory[];
  items: CatalogItem[];
}

const EMPTY: Catalog = { version: 0, count: 0, categories: [], items: [] };

function candidatePaths(explicit?: string): string[] {
  const paths: string[] = [];
  if (explicit) paths.push(explicit);
  if (process.env.MOOTER_ECOSYSTEM_CATALOG) paths.push(process.env.MOOTER_ECOSYSTEM_CATALOG);
  // packages/synthesis/src/ecosystem/ → repo root → audit/
  paths.push(join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..", "audit", "ECOSYSTEM_CATALOG_v1.json"));
  paths.push(join(process.cwd(), "audit", "ECOSYSTEM_CATALOG_v1.json"));
  return paths;
}

export function loadCatalog(opts: { path?: string } = {}): Catalog {
  for (const p of candidatePaths(opts.path)) {
    const c = readJsonSafe<Catalog | null>(p, null);
    if (c && Array.isArray(c.items) && c.items.length > 0) {
      return { version: c.version ?? 1, count: c.items.length, categories: c.categories ?? [], items: c.items };
    }
  }
  return EMPTY;
}

export function getCatalogItem(id: string, items: CatalogItem[]): CatalogItem | null {
  return items.find((i) => i.id === id) ?? null;
}

/** Substring/tag search ranked by relevance then trust_score. */
export function searchCatalog(query: string, items: CatalogItem[]): CatalogItem[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const scored = items
    .map((it) => {
      const hay = `${it.id} ${it.name} ${it.description} ${it.tags.join(" ")} ${it.category}`.toLowerCase();
      let rel = 0;
      if (it.name.toLowerCase().includes(q) || it.id.toLowerCase().includes(q)) rel += 3;
      if (it.tags.some((t) => t.toLowerCase().includes(q))) rel += 2;
      if (hay.includes(q)) rel += 1;
      return { it, rel };
    })
    .filter((s) => s.rel > 0)
    .sort((a, b) => b.rel - a.rel || b.it.trust_score - a.it.trust_score);
  return scored.map((s) => s.it);
}
