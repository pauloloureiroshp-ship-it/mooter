#!/usr/bin/env node
// fleet-watchdog.mjs — the EXTERNAL watchdog (F4 hardened).
//
// The cronista lives INSIDE the loop and dies with it — an internal watchdog is no
// watchdog. This runs OUTSIDE the process (schtasks /SC MINUTE /MO 5): if the fleet
// heartbeat is older than FLEET_HEARTBEAT_MAX_AGE_MIN (default 20) AND no STOP
// sentinel exists, it restarts the pm2 app and logs an incident. Cheap, idempotent,
// no state of its own. It NEVER acts when STOP is present (a deliberate shutdown).

"use strict";

import { readFileSync, existsSync, appendFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const FLEET_DIR = process.env.FLEET_DIR || HERE;
const HB = join(FLEET_DIR, "fleet-heartbeat.json");
const STOP = join(FLEET_DIR, "STOP");
const LEDGER = join(FLEET_DIR, "fleet-ledger.jsonl");
const APP = process.env.FLEET_PM2_APP || "mooter-fleet";
const MAX_AGE_MS = (Number(process.env.FLEET_HEARTBEAT_MAX_AGE_MIN) || 20) * 60_000;

function log(rec) {
  try { appendFileSync(LEDGER, JSON.stringify({ ts: new Date().toISOString(), ...rec }) + "\n"); } catch { /* never throw from a watchdog */ }
}

if (existsSync(STOP)) { console.log("[watchdog] STOP sentinel present — standing down (deliberate shutdown)."); process.exit(0); }

let ageMs = Infinity;
try { ageMs = Date.now() - Date.parse(JSON.parse(readFileSync(HB, "utf8")).ts); }
catch { /* missing/corrupt heartbeat → treat as stale */ }

if (ageMs > MAX_AGE_MS) {
  const ageMin = Number.isFinite(ageMs) ? Math.round(ageMs / 60_000) : "n/d";
  console.log(`[watchdog] heartbeat stale (${ageMin}min > ${MAX_AGE_MS / 60_000}min) — restarting ${APP}.`);
  try {
    execSync(`pm2 restart ${APP}`, { stdio: "inherit" });
    log({ event: "incident", source: "watchdog", reason: "heartbeat-stale-restart", age_min: ageMin, app: APP });
  } catch (e) {
    log({ event: "incident", source: "watchdog", reason: "pm2-restart-failed", detail: e && e.message, app: APP });
    process.exit(1);
  }
} else {
  console.log(`[watchdog] heartbeat fresh (${Math.round(ageMs / 60_000)}min) — OK.`);
}
