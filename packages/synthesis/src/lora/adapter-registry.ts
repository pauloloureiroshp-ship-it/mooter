// L13 — LoRA hot-swap foundation (Wave 29 Phase 29.E, INFRA ONLY).
//
// This is the adapter *catalog* only. The actual per-task hot-swap engine
// (LORAUTER) lands in Wave 31 (Pastor v2). Here we just track which adapters
// exist locally, their base model, and whether they're ready to load. Nothing
// auto-swaps — see routing-stub.ts (always returns null). Doctrine: classify.js
// owns the tier decision; LoRA never overrides it.

import { existsSync } from "node:fs";
import { mooterPath, readJsonSafe, writeJson } from "../config.ts";

/** Wave that activates auto hot-swap. Anything above CURRENT_WAVE is registered but not swapped. */
export const CURRENT_WAVE = 29;

export interface LoraAdapter {
  name: string;
  base_model: string; // e.g. "qwen3:30b"
  path: string; // local adapter dir/file ("" if not materialised yet)
  task_tags: string[]; // ["pt-pt", "routing", "brevity"]
  trained_on: "user" | "global" | "none";
  description?: string;
  registered_at: string; // ISO
  wave_ready: number; // wave at which this adapter becomes auto-swappable
}

export interface AdapterRegistry {
  version: number;
  adapters: LoraAdapter[];
}

// Seed: the Wave 23 Pastor LoRA is *registered* but not yet materialised/trained
// (gate not met — see memory). It surfaces in `mooter lora list` and `mooter
// setup show` as "Wave 31 ready", with an empty path so the loader reports no_path.
export const DEFAULT_ADAPTERS: LoraAdapter[] = [
  {
    name: "pastor-v1-default",
    base_model: "qwen3:30b",
    path: "",
    task_tags: ["routing", "doctrine", "pt-pt"],
    trained_on: "global",
    description: "Mooter Pastor routing adapter (Wave 23 carry). Foundation registered; hot-swap in Wave 31.",
    registered_at: "2026-06-07T00:00:00.000Z",
    wave_ready: 31,
  },
];

function registryPath(): string {
  return mooterPath("lora", "registry.json");
}

/** Read the registry, falling back to the seeded defaults when no file exists. */
export function loadRegistry(): AdapterRegistry {
  const onDisk = readJsonSafe<AdapterRegistry | null>(registryPath(), null);
  if (onDisk && Array.isArray(onDisk.adapters)) return onDisk;
  return { version: 1, adapters: [...DEFAULT_ADAPTERS] };
}

export function listAdapters(): LoraAdapter[] {
  return loadRegistry().adapters;
}

export function getAdapter(name: string): LoraAdapter | null {
  return loadRegistry().adapters.find((a) => a.name === name) ?? null;
}

/** Upsert an adapter by name and persist the registry (seeds included). */
export function registerAdapter(adapter: LoraAdapter): AdapterRegistry {
  const reg = loadRegistry();
  const idx = reg.adapters.findIndex((a) => a.name === adapter.name);
  if (idx >= 0) reg.adapters[idx] = adapter;
  else reg.adapters.push(adapter);
  writeJson(registryPath(), reg);
  return reg;
}

export function removeAdapter(name: string): boolean {
  const reg = loadRegistry();
  const before = reg.adapters.length;
  reg.adapters = reg.adapters.filter((a) => a.name !== name);
  if (reg.adapters.length === before) return false;
  writeJson(registryPath(), reg);
  return true;
}

/** True when an adapter is materialised on disk (path set and exists). */
export function isMaterialised(adapter: LoraAdapter): boolean {
  return adapter.path.length > 0 && existsSync(adapter.path);
}
