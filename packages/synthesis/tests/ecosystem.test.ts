import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  loadCatalog,
  searchCatalog,
  compatibilityScore,
  roiValue,
  recommend,
  summariseRoi,
  buildProfile,
  type CatalogItem,
  type RawDetect,
  type RoiEntry,
} from "../src/index.ts";

const CATALOG_PATH = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "audit", "ECOSYSTEM_CATALOG_v1.json");

function nvidiaProfile() {
  const raw: RawDetect = {
    platform: "linux",
    arch: "x64",
    os_release: "microsoft-standard-WSL2",
    node_version: "v20.20.2",
    python_version: null,
    docker_version: null,
    ollama_version: "0.5.2",
    ollama_models: ["qwen3:30b"],
    gpu: { vendor: "nvidia", name: "rtx 4090", vramMB: 24576, platform: "linux" },
    hw_tier: "gpu-high",
    vram: { used_mb: 1024, total_mb: 24576 },
    hardware_matcher: null,
    subscriptions: { anthropic: "max", openai: "none", codex_cli: "none", gemini: "none", ollama: "installed" },
  };
  return buildProfile(raw);
}

function item(over: Partial<CatalogItem> = {}): CatalogItem {
  return {
    id: "x",
    name: "X",
    category: "skill",
    description: "d",
    trust_score: 50,
    compatibility: { hardware: ["any"], os: ["any"], subscription: ["any"] },
    roi_estimate: {},
    install_cmd: "",
    docs_url: "",
    source_url: "",
    tags: [],
    verified: true,
    ...over,
  };
}

test("seed catalog loads with 100+ items across 5 categories", () => {
  const c = loadCatalog({ path: CATALOG_PATH });
  assert.ok(c.items.length >= 100, `expected ≥100 items, got ${c.items.length}`);
  const cats = new Set(c.items.map((i) => i.category));
  for (const k of ["skill", "plugin", "mcp", "pack", "provider"]) assert.ok(cats.has(k as CatalogItem["category"]), `missing ${k}`);
});

test("searchCatalog finds caveman in the seed catalog", () => {
  const c = loadCatalog({ path: CATALOG_PATH });
  const hits = searchCatalog("caveman", c.items);
  assert.ok(hits.length >= 1);
  assert.ok(/caveman/i.test(hits[0].id) || /caveman/i.test(hits[0].name));
});

test("compatibilityScore gates on hardware/os/subscription", () => {
  const p = nvidiaProfile();
  assert.equal(compatibilityScore(item({ compatibility: { hardware: ["any"], os: ["any"], subscription: ["any"] } }), p), 1);
  assert.equal(compatibilityScore(item({ compatibility: { hardware: ["apple-silicon"], os: ["any"], subscription: ["any"] } }), p), 0);
  assert.equal(compatibilityScore(item({ compatibility: { hardware: ["any"], os: ["darwin"], subscription: ["any"] } }), p), 0);
  assert.equal(compatibilityScore(item({ compatibility: { hardware: ["any"], os: ["any"], subscription: ["any"], requires_npu: true } }), p), 0);
  assert.equal(compatibilityScore(item({ compatibility: { hardware: ["any"], os: ["any"], subscription: ["any"], min_vram_gb: 80 } }), p), 0);
  assert.equal(compatibilityScore(item({ compatibility: { hardware: ["gpu-high"], os: ["wsl2"], subscription: ["claude-max"] } }), p), 1);
});

test("roiValue: baseline 0.1, climbs with savings", () => {
  assert.equal(roiValue(item({ roi_estimate: {} })), 0.1);
  assert.ok(roiValue(item({ roi_estimate: { token_savings_pct: 30 } })) > 0.1);
  assert.ok(roiValue(item({ roi_estimate: { token_savings_pct: 30 } })) <= 1);
});

test("recommend ranks compatible items by compat×roi×pastor, honours limit", () => {
  const p = nvidiaProfile();
  const items = [
    item({ id: "hi-roi", roi_estimate: { token_savings_pct: 50 }, trust_score: 60 }),
    item({ id: "lo-roi", roi_estimate: {}, trust_score: 90 }),
    item({ id: "incompatible", compatibility: { hardware: ["apple-silicon"], os: ["any"], subscription: ["any"] } }),
  ];
  const recs = recommend(p, items, { limit: 5 });
  assert.equal(recs.length, 2); // incompatible filtered out
  assert.equal(recs[0].item.id, "hi-roi"); // higher roi ranks first
  assert.ok(recs.every((r) => r.compatibility > 0));

  const limited = recommend(p, items, { limit: 1 });
  assert.equal(limited.length, 1);
});

test("pastorSignal=1.0 reduces ranking to compatibility × roi (kickoff parity)", () => {
  const p = nvidiaProfile();
  const it = item({ id: "a", roi_estimate: { token_savings_pct: 40 } });
  const def = recommend(p, [it], {});
  const explicit = recommend(p, [it], { pastorSignal: 1.0 });
  assert.equal(def[0].score, explicit[0].score);
});

test("summariseRoi aggregates entries", () => {
  const entries: RoiEntry[] = [
    { ts: "t1", item_id: "caveman", tokens_saved: 80, usd_saved: 0.07, source: "pack" },
    { ts: "t2", item_id: "caveman", tokens_saved: 20, usd_saved: 0.02, source: "pack" },
    { ts: "t3", item_id: "lingua", tokens_saved: 100, usd_saved: 0.09, source: "compression" },
  ];
  const s = summariseRoi(entries);
  assert.equal(s.total_tokens_saved, 200);
  assert.equal(s.events, 3);
  assert.equal(s.by_item.caveman.tokens_saved, 100);
  assert.equal(s.by_item.caveman.events, 2);
});
