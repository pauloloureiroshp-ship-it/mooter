#!/usr/bin/env node
// gpu-stream.mjs — ONE persistent nvidia-smi, ZERO periodic spawns (flicker fix, 2026-07-10).
//
// WHY: the fleet used to spawnSync("nvidia-smi") before every cycle (~15s) and per
// round, each time WITHOUT windowsHide — under pm2 (a windowless parent on Windows)
// every spawn opened a visible console window that stole focus (measured 8
// flashes/min; 0 with the fleet stopped). The fix is architectural, not a patch:
// keep ONE long-lived `nvidia-smi -l <interval>` child (hidden), stream its stdout,
// and serve the latest sample from memory. Consumers never spawn anything.
//
// HONESTY: no nvidia-smi / dead stream / stale sample → getGpuSample() returns
// null and callers show n/d — never an invented number. Samples older than
// 2×interval+5s are considered stale.
//
// RESILIENCE: if the child dies it is restarted with exponential backoff (1s→60s
// cap). ENOENT (no nvidia-smi on PATH) retries on a slow 5-min timer — a machine
// without a GPU never busy-loops. Child + timers are unref()ed so a bounded
// fleet-forever run (FLEET_MAX_CYCLES) still exits naturally.

"use strict";

import { spawn } from "node:child_process";
import { createInterface } from "node:readline";

const INTERVAL_S = Math.max(1, Math.round((Number(process.env.FLEET_GPU_POLL_MS) || 15_000) / 1000));
const STALE_MS = INTERVAL_S * 2 * 1000 + 5_000;
const ARGS = [
  "--query-gpu=utilization.gpu,temperature.gpu,memory.used,memory.total,memory.free",
  "--format=csv,noheader,nounits",
  "-l", String(INTERVAL_S),
];

let child = null;
let latest = null;          // { utilPct, tempC, usedMb, totalMb, freeMb, at }
let backoffMs = 1_000;
let stopped = false;
let firstSampleWaiters = [];

const num = (v) => (Number.isFinite(v) ? v : null);

// Parse one CSV line "util, temp, used, total, free" → sample or null.
// (Single-GPU box: every stdout line is one tick. On multi-GPU each line still
// updates `latest`; consumers read GPU0-equivalent aggregate freshness.)
export function parseGpuLine(line) {
  const p = String(line || "").trim().split(",").map((s) => parseInt(s.trim(), 10));
  if (p.length < 5 || !Number.isFinite(p[3])) return null; // no usable memory.total → garbage
  return { utilPct: num(p[0]), tempC: num(p[1]), usedMb: num(p[2]), totalMb: num(p[3]), freeMb: num(p[4]), at: Date.now() };
}

function startChild() {
  if (stopped || child) return;
  let cp;
  try {
    // windowsHide is THE point of this module — never remove it.
    cp = spawn("nvidia-smi", ARGS, { windowsHide: true, stdio: ["ignore", "pipe", "ignore"] });
  } catch {
    scheduleRestart(300_000); // spawn threw synchronously → treat like ENOENT
    return;
  }
  child = cp;
  // unref child AND its stdout pipe: the stream must never keep a bounded
  // fleet-forever run (FLEET_MAX_CYCLES) from exiting naturally.
  cp.unref();
  if (cp.stdout.unref) cp.stdout.unref();
  const rl = createInterface({ input: cp.stdout });
  rl.on("line", (line) => {
    const s = parseGpuLine(line);
    if (!s) return;
    latest = s;
    backoffMs = 1_000; // a good sample proves the stream is healthy → reset backoff
    const waiters = firstSampleWaiters; firstSampleWaiters = [];
    for (const w of waiters) w(s);
  });
  const cleanup = () => { try { rl.close(); cp.stdout.destroy(); } catch { /* already closed */ } };
  cp.on("error", (e) => {
    cleanup();
    child = null;
    scheduleRestart(e && e.code === "ENOENT" ? 300_000 : backoffMs);
  });
  cp.on("exit", () => {
    cleanup();
    child = null;
    scheduleRestart(backoffMs);
    backoffMs = Math.min(backoffMs * 2, 60_000);
  });
}

function scheduleRestart(ms) {
  if (stopped) return;
  const t = setTimeout(startChild, ms);
  if (t.unref) t.unref();
}

/** Latest sample, or null when none/stale (honest n/d). Starts the stream lazily. */
export function getGpuSample({ maxAgeMs = STALE_MS, now = Date.now() } = {}) {
  startChild();
  if (!latest) return null;
  return now - latest.at <= maxAgeMs ? latest : null;
}

/** Await the first sample (bounded). Resolves null on timeout — never blocks a cycle. */
export function waitForGpuSample(timeoutMs = 3_000) {
  startChild();
  const s = getGpuSample();
  if (s) return Promise.resolve(s);
  return new Promise((res) => {
    const t = setTimeout(() => {
      firstSampleWaiters = firstSampleWaiters.filter((w) => w !== res);
      res(null);
    }, timeoutMs);
    if (t.unref) t.unref();
    firstSampleWaiters.push((sample) => { clearTimeout(t); res(sample); });
  });
}

/** Test/shutdown hook: kill the child and stop restarting. */
export function stopGpuStream() {
  stopped = true;
  // Only signal a child that actually spawned (has a pid). Calling kill() on a
  // spawn that failed (ENOENT — pid undefined) can block under the node:test
  // harness (observed on Node 22, Linux).
  try { if (child && child.pid) child.kill(); } catch { /* already dead */ }
  child = null;
}

/** Test hook: inject a sample without a real GPU. */
export function _injectSample(sample) {
  latest = sample;
  const waiters = firstSampleWaiters; firstSampleWaiters = [];
  for (const w of waiters) w(sample);
}
