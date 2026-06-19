'use strict';

// local-fleet — HW-aware local Moo capacity (First Magic — FASE 1, feeds FASE 3/4).
//
// The cockpit shows "🦙×N" local Moos. That N must come from REAL hardware, never a
// hardcoded guess (doctrine: "sem inventar — falta = —"). This module is the single
// source of truth: given the probed hw-capability (gpu-probe.js → hw-capability.json)
// and the machine's RAM, it derives how many concurrent local lanes actually fit.
//
// Zero-LLM, pure, no side effects (safe to require). Reuses gpu-probe's MODEL_VRAM_REQ
// table — it does not re-probe or modify anything.

const os = require('os');
const fs = require('fs');
const { MODEL_VRAM_REQ } = require('./gpu-probe');
const { HW_CAPABILITY_PATH } = require('./paths');

// Fraction of total memory we let local Moos use concurrently. The rest is reserved
// for the OS and the maestro (Claude/host). Conservative on purpose.
const FLEET_MEM_FRACTION = 0.6;
const MAX_LANES_CAP = 8; // a sane ceiling regardless of RAM (Ollama scheduling overhead)

function loadCapability() {
  try {
    return JSON.parse(fs.readFileSync(HW_CAPABILITY_PATH, 'utf8'));
  } catch {
    return null;
  }
}

/**
 * Pick the model each parallel Moo lane runs. Defaults to the fast small model
 * (option_a) — leaf/verbose work parallelises better on a light model than on one
 * heavy model that hogs all the RAM. Falls back to recommended_t0, then qwen2.5:3b.
 */
function laneModel(cap) {
  if (cap && cap.option_a_model) return cap.option_a_model;
  if (cap && cap.recommended_t0) return cap.recommended_t0;
  return 'qwen2.5:3b';
}

/**
 * Derive the maximum number of concurrent local Moos for this hardware.
 * Pure function of (capability, totalMemMB) — never a constant.
 *
 * @param {object|null} cap   hw-capability (from hw-capability.json) or null
 * @param {number} [totalMemMB] override total RAM in MB (defaults to os.totalmem)
 * @returns {{recommended_t0:string|null, lane_model:string, lane_req_mb:number,
 *            total_mem_mb:number|null, max_local_moos:number, basis:string}}
 */
function maxLocalMoos(cap, totalMemMB) {
  // Only fall back to the real machine RAM when the caller omits the arg entirely.
  // An explicit non-finite value means "the caller has no memory signal".
  const total = (arguments.length >= 2)
    ? Number(totalMemMB)
    : Math.round(os.totalmem() / (1024 * 1024));
  const lane = laneModel(cap);
  const laneReq = MODEL_VRAM_REQ[lane] || 2048;

  // No hardware signal → be honest: we can't claim a fleet size.
  if (!total || !Number.isFinite(total) || total <= 0) {
    return { recommended_t0: cap ? cap.recommended_t0 : null, lane_model: lane, lane_req_mb: laneReq, total_mem_mb: null, max_local_moos: 1, basis: 'no memory signal — defaulting to a single lane' };
  }

  const budget = Math.floor(total * FLEET_MEM_FRACTION);
  const fit = Math.floor(budget / laneReq);
  const moos = Math.max(1, Math.min(MAX_LANES_CAP, fit));

  return {
    recommended_t0: cap ? cap.recommended_t0 : null,
    lane_model: lane,
    lane_req_mb: laneReq,
    total_mem_mb: total,
    max_local_moos: moos,
    basis: `floor(${total}MB × ${FLEET_MEM_FRACTION} / ${laneReq}MB per ${lane}) = ${fit}, clamped to [1, ${MAX_LANES_CAP}]`,
  };
}

module.exports = { maxLocalMoos, laneModel, loadCapability, FLEET_MEM_FRACTION, MAX_LANES_CAP };

if (require.main === module) {
  const cap = loadCapability();
  const fleet = maxLocalMoos(cap);
  process.stdout.write(JSON.stringify(fleet, null, 2) + '\n');
}
