#!/usr/bin/env node
// fleet-local-launch.mjs — the $0 launcher (FASE3 F1).
//
// Wires the real local workforce into the orchestrator: runFleet() with
// dryRun:false and runPillar dispatched to the right worker per pillar
//   • cronista → cronistaPillar (coherence report, no GPU)
//   • all else → localPillar     ($0 Ollama round on the 4090)
//
// $0 by construction: FLEET_ALLOW_CLOUD is never touched. The STOP sentinel
// (_handoff/fleet/STOP) and every cap are honoured by runFleet itself.
//
// Run one supervised pass:  FLEET_MAX_ROUNDS=3 node _handoff/fleet/fleet-local-launch.mjs

"use strict";

import { runFleet } from "./fleet-orchestrator.mjs";
import { localPillar } from "./local-pillar.mjs";
import { cronistaPillar } from "./cronista-pillar.mjs";

// One dispatcher matching the orchestrator's runPillar(loop, {now}) contract.
function runPillar(loop, deps) {
  return loop.id === "cronista" ? cronistaPillar(loop, deps) : localPillar(loop, deps);
}

const maxRounds = Number(process.env.FLEET_MAX_ROUNDS) || 6;

// Admission is no longer the GPU governor — local-pillar's VRAM gate is. Open
// poolWidth + gpuHeavyConcurrent so every eligible pillar gets its round (the old
// gpuHeavyConcurrent:1 admitted ONE gpu-heavy pillar per round, starving council +
// seguranca below the ≥2-real-rounds gate). The VRAM gate still serializes real
// generation to what the 4090 physically fits (≈1 qwen3:30b). Env-overridable.
const caps = {
  poolWidth: Number(process.env.FLEET_POOL_WIDTH) || 16,
  gpuHeavyConcurrent: Number(process.env.FLEET_GPU_CONCURRENT) || 16,
};

runFleet({ dryRun: false, runPillar, maxRounds, caps })
  .then((s) => { console.log("[fleet-local] shutdown:", JSON.stringify(s)); process.exit(0); })
  .catch((e) => { console.error("[fleet-local] fatal:", e && e.message); process.exit(1); });
