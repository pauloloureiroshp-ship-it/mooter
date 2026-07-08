#!/usr/bin/env node
// fleet-forever.mjs — the $0 forever runner (F4, additive).
//
// Loops runFleet cycles with a VRAM-contention PRE-FLIGHT before EACH cycle. On a
// contended GPU (a foreign model resident + too little free VRAM for the fleet
// model) it backs off 2min and does NOT run the cycle — avoiding the silent CPU
// fallback that hangs a generation >120s. It NEVER unloads a model it does not own.
// The per-pillar guard in local-pillar records the incident + streak; this runner
// only decides "run vs wait" per cycle. Stops cleanly on the STOP sentinel.
//
// Run:  node _handoff/fleet/fleet-forever.mjs   (FLEET_MAX_CYCLES=N to bound it)

"use strict";

import { existsSync } from "node:fs";
import { join } from "node:path";

import { runFleet } from "./fleet-orchestrator.mjs";
import { localPillar } from "./local-pillar.mjs";
import { cronistaPillar } from "./cronista-pillar.mjs";
import { preflight } from "./vram-preflight.mjs";

function runPillar(loop, deps) {
  return loop.id === "cronista" ? cronistaPillar(loop, deps) : localPillar(loop, deps);
}

const FLEET_DIR = process.env.FLEET_DIR || "_handoff/fleet";
const STOP = join(FLEET_DIR, "STOP");
const roundsPerCycle = Number(process.env.FLEET_ROUNDS_PER_CYCLE) || 3;

// MODEL POLICY (Option C). By DAY the fleet runs a light coder model that fits
// alongside the router (FLEET_MODEL, e.g. qwen2.5-coder:14b ≈ 9GB) — set once, the
// per-pillar selector in local-pillar honours any fleet.json "model" override.
// NIGHT window (SPEC ONLY — not wired yet): when the clock is inside
// [FLEET_NIGHT_FROM, FLEET_NIGHT_TO] (e.g. "02:00".."07:00"), swap FLEET_MODEL for
// FLEET_NIGHT_MODEL (e.g. qwen3:30b) for an EXCLUSIVE heavy pass — the router load is
// lowest overnight, so the 30B fits. Wiring the clock check is a follow-up.
const NIGHT_MODEL = process.env.FLEET_NIGHT_MODEL || null; // reserved; window not yet enforced
if (NIGHT_MODEL) console.log(`[fleet-forever] night model reserved: ${NIGHT_MODEL} (window enforcement is a follow-up)`);
const backoffMs = Number(process.env.FLEET_CONTENTION_BACKOFF_MS) || 120_000;
const cycleGapMs = Number(process.env.FLEET_CYCLE_GAP_MS) || 5_000;
const maxCycles = Number(process.env.FLEET_MAX_CYCLES) || Infinity;
// Admission is opened; the VRAM gate in local-pillar governs real GPU concurrency.
const caps = {
  poolWidth: Number(process.env.FLEET_POOL_WIDTH) || 16,
  gpuHeavyConcurrent: Number(process.env.FLEET_GPU_CONCURRENT) || 16,
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let cycle = 0;
let contentionCycles = 0;
while (cycle < maxCycles) {
  // STOP sentinel = clean PAUSE, not process exit. Under pm2 (autorestart) an exit
  // would just be restarted into the same STOP — a crash-loop. Idle-wait until STOP
  // is removed; full shutdown is `pm2 stop mooter-fleet`.
  while (existsSync(STOP)) {
    console.log("[fleet-forever] STOP sentinel present — PAUSED (remove it to resume; `pm2 stop mooter-fleet` to shut down).");
    await sleep(Math.min(cycleGapMs, 15_000));
  }
  // Pre-flight BEFORE the cycle: a contended GPU means skip generation this cycle.
  const pf = await preflight({});
  if (!pf.ok) {
    contentionCycles++;
    console.log(`[fleet-forever] ${pf.reason} — cycle skipped (${contentionCycles} in a row), backing off ${Math.round(backoffMs / 1000)}s. Never unloads a foreign model.`);
    await sleep(backoffMs);
    continue;
  }
  contentionCycles = 0;
  cycle++;
  try {
    const s = await runFleet({ dryRun: false, runPillar, maxRounds: roundsPerCycle, caps });
    console.log(`[fleet-forever] cycle ${cycle} shutdown:`, JSON.stringify(s));
  } catch (e) {
    console.error(`[fleet-forever] cycle ${cycle} fatal:`, e && e.message);
  }
  await sleep(cycleGapMs);
}
console.log(`[fleet-forever] done after ${cycle} cycle(s).`);
