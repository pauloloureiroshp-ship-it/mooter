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
import { activeModel, parseHHMM } from "./night-window.mjs";

function runPillar(loop, deps) {
  return loop.id === "cronista" ? cronistaPillar(loop, deps) : localPillar(loop, deps);
}

const FLEET_DIR = process.env.FLEET_DIR || "_handoff/fleet";
const STOP = join(FLEET_DIR, "STOP");
const roundsPerCycle = Number(process.env.FLEET_ROUNDS_PER_CYCLE) || 3;

// MODEL POLICY (Option C). By DAY the fleet runs a light coder model that fits
// alongside the router (FLEET_MODEL, e.g. qwen2.5-coder:14b ≈ 9GB) — set once, the
// per-pillar selector in local-pillar honours any fleet.json "model" override.
// NIGHT window (WIRED): inside [FLEET_NIGHT_START, FLEET_NIGHT_END) local time in
// FLEET_NIGHT_TZ the fleet swaps FLEET_MODEL for FLEET_NIGHT_MODEL (e.g. qwen3:30b)
// for an exclusive heavy pass — router load is lowest overnight, so the 30B fits.
// The swap is re-evaluated at the START of each cycle (clean transition: a running
// cycle keeps its model, the next one picks up the change). VRAM pre-flight still
// governs — if the 30B does not fit it backs off, never CPU-fallback.
const DAY_MODEL = process.env.FLEET_MODEL || process.env.FLEET_LOCAL_MODEL || null;
const NIGHT_MODEL = process.env.FLEET_NIGHT_MODEL || null;
const NIGHT_TZ = process.env.FLEET_NIGHT_TZ || "America/Sao_Paulo";
const NIGHT_START_RAW = process.env.FLEET_NIGHT_START || "00:00";
const NIGHT_END_RAW = process.env.FLEET_NIGHT_END || "07:00";
const NIGHT_START_MIN = parseHHMM(NIGHT_START_RAW) ?? 0;
const NIGHT_END_MIN = parseHHMM(NIGHT_END_RAW) ?? 7 * 60;
if (NIGHT_MODEL) console.log(`[fleet-forever] night window ${NIGHT_START_RAW}-${NIGHT_END_RAW} ${NIGHT_TZ}: ${NIGHT_MODEL} (day: ${DAY_MODEL || "default"})`);
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
  // Night-window model selection — evaluated at the start of the cycle. local-pillar
  // reads FLEET_MODEL lazily, so this swap governs THIS cycle's generation.
  if (NIGHT_MODEL) {
    const want = activeModel({
      now: new Date(), dayModel: DAY_MODEL, nightModel: NIGHT_MODEL,
      startMin: NIGHT_START_MIN, endMin: NIGHT_END_MIN, tz: NIGHT_TZ,
    });
    if (want && want !== process.env.FLEET_MODEL) {
      console.log(`[fleet-forever] model window: FLEET_MODEL ${process.env.FLEET_MODEL || "(unset)"} -> ${want}`);
      process.env.FLEET_MODEL = want;
    }
  }
  try {
    const s = await runFleet({ dryRun: false, runPillar, maxRounds: roundsPerCycle, caps });
    console.log(`[fleet-forever] cycle ${cycle} shutdown:`, JSON.stringify(s));
  } catch (e) {
    console.error(`[fleet-forever] cycle ${cycle} fatal:`, e && e.message);
  }
  await sleep(cycleGapMs);
}
console.log(`[fleet-forever] done after ${cycle} cycle(s).`);
