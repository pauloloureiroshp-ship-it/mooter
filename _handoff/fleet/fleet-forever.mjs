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
  if (existsSync(STOP)) { console.log("[fleet-forever] STOP sentinel — exiting."); break; }
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
