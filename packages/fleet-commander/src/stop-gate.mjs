// stop-gate.mjs — Fleet Commander · the gate that runs before EVERY dispatch.
//
// docs/strategy/MOOTER_EVOLUTION_FLEET.md §11 (F0.5) + the GPU-por-pilar strategy
// (2026-08-15). The Scheduler decides WHAT should run; this decides WHETHER anything
// may run AT ALL, right now, on this machine. Three mechanical questions, asked
// before each turn — never once at boot:
//
//   ① STOP      — is there a kill-switch file? (~/.mooter/stop.json)
//   ② VRAM      — is there real headroom, or would we evict the human's model?
//   ③ GPU lease — is another pilar already on this GPU? (1 active pilar per GPU)
//
// WHY BEFORE EVERY DISPATCH, NOT ONCE
// A kill-switch checked at boot is a kill-switch that cannot kill anything: the loop
// it must stop is, by definition, already running. The drill (F3) measures the real
// number — time from `stop.json` written to the last dispatch refused.
//
// WHY THE STOP FAILS CLOSED
// An unreadable or malformed stop file is treated as STOP. The asymmetry is the whole
// point: a false stop costs one idle round; a false go costs an autonomous loop the
// human believed they had halted. A kill-switch that fails open is decoration.
//
// WHY VRAM IS TRI-STATE AND NOT A BOOLEAN
// "≥2.2 GiB free VRAM" is a real invariant on a discrete-GPU box and a CATEGORY ERROR
// on Apple Silicon, where memory is unified and there is no separate VRAM pool to
// reserve. Reporting `ok` on a Mac would be fabricating a measurement we never took —
// the one thing this project forbids. So the probe answers ok · blocked · n/d, and
// `n/d` travels into the receipt as `n/d`, never silently as a pass.
//
// The GPU mutex is NOT reimplemented here: `lease.mjs` already gives all-or-nothing
// acquisition with orphan-reported-never-stolen. A pilar simply leases `gpu:<id>`.
//
// Everything is injected (clock, file reader, probe, leases) so the whole gate is
// testable with zero GPU, zero filesystem and zero real Ollama.

"use strict";

import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { homedir, platform } from "node:os";
import { join } from "node:path";

import { createLeaseManager } from "./lease.mjs";

/** The kill-switch the human writes. Outside the repo on purpose: killing the fleet
 *  must never require a commit, a branch, or a working tree that parses. */
export const STOP_PATH_DEFAULT = join(homedir(), ".mooter", "stop.json");

/** Blocking headroom on a discrete GPU. Below this, a dispatch would evict whatever
 *  the human has resident — the fleet lives on IDLE VRAM or it is not invisible. */
export const MIN_VRAM_HEADROOM_GIB = 2.2;

export const GPU_RESOURCE_DEFAULT = "gpu:local";

// ───────────────────────── ① STOP ─────────────────────────

/**
 * Read the kill-switch. Fail-CLOSED by construction.
 *
 * States:
 *   file absent          → { stopped:false }                (the normal, running case)
 *   { "stop": false }    → { stopped:false }                (explicit resume)
 *   { "stop": true }     → { stopped:true }                 (the kill)
 *   unreadable / not JSON / no `stop` key → { stopped:true } (fail closed)
 *
 * `scope` narrows a stop to one pilar or device: absent (or "all") stops everything.
 * A scope we do not recognise is NOT treated as "not mine" — it stops, because an
 * unparseable intent from the human is still an intent to stop.
 *
 * @returns {{stopped:boolean, reason:string, since?:string, by?:string, scope?:string}}
 */
export function readStop({ path = STOP_PATH_DEFAULT, readFile = readFileSync, pilar = null, device = null } = {}) {
  let raw;
  try {
    raw = readFile(path, "utf8");
  } catch (e) {
    // ENOENT is the ONLY error that means "no stop". Anything else (EACCES, EISDIR,
    // a mount that vanished) means we cannot prove the human did not stop us.
    if (e && (e.code === "ENOENT" || e.code === "ENOTDIR")) {
      return { stopped: false, reason: "no stop file" };
    }
    return { stopped: true, reason: `stop-file-unreadable (${e?.code || e?.message || "unknown"}) — failing closed` };
  }

  let doc;
  try {
    doc = JSON.parse(String(raw));
  } catch {
    return { stopped: true, reason: "stop-file-malformed (not JSON) — failing closed" };
  }
  if (!doc || typeof doc !== "object" || Array.isArray(doc)) {
    return { stopped: true, reason: "stop-file-malformed (not an object) — failing closed" };
  }
  if (typeof doc.stop !== "boolean") {
    return { stopped: true, reason: "stop-file-malformed (no boolean `stop`) — failing closed" };
  }
  if (doc.stop === false) {
    return { stopped: false, reason: "stop file present but stop:false (explicit resume)" };
  }

  const scope = doc.scope == null ? "all" : String(doc.scope);
  const meta = { since: doc.since ? String(doc.since) : undefined, by: doc.by ? String(doc.by) : undefined, scope };
  if (scope === "all") {
    return { stopped: true, reason: doc.reason ? `STOP: ${doc.reason}` : "STOP (scope: all)", ...meta };
  }
  const m = scope.match(/^(pilar|device):(.+)$/);
  if (m) {
    const [, kind, value] = m;
    const mine = kind === "pilar" ? pilar : device;
    if (mine != null && String(mine) !== value) {
      return { stopped: false, reason: `stop scoped to ${scope}; this is ${kind}:${mine}`, ...meta };
    }
    return { stopped: true, reason: doc.reason ? `STOP (${scope}): ${doc.reason}` : `STOP (${scope})`, ...meta };
  }
  // Unrecognised scope → stop. An intent we cannot parse is still an intent.
  return { stopped: true, reason: `STOP (unrecognised scope '${scope}') — failing closed`, ...meta };
}

// ───────────────────────── ② VRAM headroom ─────────────────────────

/**
 * Default probe. Discrete GPU → real numbers. Apple Silicon → an explicit "unified"
 * verdict, never a fabricated free-VRAM figure.
 * @returns {{kind:'nvidia'|'unified'|'unknown', freeGiB?:number|null, error?:string}}
 */
export function defaultVramProbe({ run = spawnSync, os = platform() } = {}) {
  const r = run("nvidia-smi", ["--query-gpu=memory.free", "--format=csv,noheader,nounits"], { encoding: "utf8", timeout: 5000 });
  const missing = r?.error?.code === "ENOENT" || r?.status === 127;
  if (!missing && r && r.status === 0) {
    // Multi-GPU: the fleet may only use the LEAST free card — the tightest constraint wins.
    const values = String(r.stdout || "").trim().split(/\r?\n/)
      .map((line) => Number(String(line).trim())).filter((n) => Number.isFinite(n));
    if (!values.length) return { kind: "nvidia", freeGiB: null, error: "nvidia-smi returned no parseable value" };
    return { kind: "nvidia", freeGiB: Math.min(...values) / 1024 };
  }
  if (!missing) {
    return { kind: "nvidia", freeGiB: null, error: `nvidia-smi exit ${r?.status ?? "n/d"}` };
  }
  if (os === "darwin") return { kind: "unified" };
  return { kind: "unknown" };
}

/**
 * Turn a probe reading into a gate verdict.
 *   ok      — measured headroom at or above the floor
 *   blocked — measured below the floor, OR a discrete GPU we could not measure
 *   n/d     — no dedicated VRAM to reserve (unified memory) or no probe at all
 *
 * Note the deliberate asymmetry: a machine we KNOW has a discrete GPU but cannot
 * measure is BLOCKED (fail closed — we might be about to evict the human's model);
 * a machine with no discrete GPU is `n/d` and allowed, because there is no pool to
 * protect and blocking it would make the Mac permanently useless.
 */
export function vramVerdict(reading, { minHeadroomGiB = MIN_VRAM_HEADROOM_GIB } = {}) {
  const p = reading || { kind: "unknown" };
  if (p.kind === "nvidia") {
    if (!Number.isFinite(p.freeGiB)) {
      return { state: "blocked", freeGiB: null, why: `GPU discreta presente mas ilegível (${p.error || "sem valor"}) — falha fechada` };
    }
    const free = Math.round(p.freeGiB * 100) / 100;
    if (free < minHeadroomGiB) {
      return { state: "blocked", freeGiB: free, why: `folga ${free} GiB < ${minHeadroomGiB} GiB` };
    }
    return { state: "ok", freeGiB: free, why: `folga ${free} GiB ≥ ${minHeadroomGiB} GiB` };
  }
  if (p.kind === "unified") {
    return { state: "n/d", freeGiB: null, why: "memória unificada (Apple Silicon) — não há VRAM dedicada para reservar; a folga não é medível aqui" };
  }
  return { state: "n/d", freeGiB: null, why: "sem sonda de GPU nesta máquina — folga não medida" };
}

// ───────────────────────── The composite gate ─────────────────────────

/**
 * Create the gate a runner calls before every dispatch.
 *
 * The GPU lease is acquired on the FIRST allowed check and renewed on every later
 * one, so a long loop never goes stale and gets reported as an orphan by its own
 * fleet. `release()` is the caller's duty at end-of-job (success or failure).
 *
 * @returns {{ check: function, release: function, receipt: function }}
 */
export function createDispatchGate({
  stopPath = STOP_PATH_DEFAULT,
  readFile = readFileSync,
  probe = () => defaultVramProbe(),
  leases = createLeaseManager(),
  owner = { sessionId: "local", loopId: "local" },
  gpuResource = GPU_RESOURCE_DEFAULT,
  minHeadroomGiB = MIN_VRAM_HEADROOM_GIB,
  pilar = null,
  device = null,
  now = () => Date.now(),
} = {}) {
  let held = false;
  let dispatches = 0;
  let lastChecks = null;

  function check() {
    dispatches += 1;

    // ① STOP first — it is the cheapest and the most absolute. Nothing else matters
    //    if the human has pulled the switch.
    const stop = readStop({ path: stopPath, readFile, pilar, device });
    if (stop.stopped) {
      // A stop RELEASES the GPU immediately: a halted pilar must not keep the card
      // hostage while the human decides what to do.
      if (held) { leases.release([gpuResource], owner); held = false; }
      lastChecks = { stop, vram: null, gpu: null, at: now() };
      return { allow: false, denyReason: stop.reason, gate: "stop", checks: lastChecks };
    }

    // ② VRAM headroom.
    const vram = vramVerdict(probe(), { minHeadroomGiB });
    if (vram.state === "blocked") {
      if (held) { leases.release([gpuResource], owner); held = false; }
      lastChecks = { stop, vram, gpu: null, at: now() };
      return { allow: false, denyReason: `VRAM: ${vram.why}`, gate: "vram", checks: lastChecks };
    }

    // ③ One active pilar per GPU — reusing the Lease Manager (orphan reported, never stolen).
    let gpu;
    if (held) {
      leases.renew([gpuResource], owner);
      gpu = { ok: true, renewed: true, resource: gpuResource };
    } else {
      const acq = leases.acquire([gpuResource], owner);
      if (!acq.ok) {
        lastChecks = { stop, vram, gpu: acq, at: now() };
        const why = acq.reason === "orphan-lease"
          ? `GPU ${gpuResource} presa a uma lease ÓRFÃ (${acq.orphan?.sessionId || "n/d"}) — reportada, nunca roubada; o humano decide`
          : `GPU ${gpuResource} já tem um pilar activo (${acq.by || "n/d"})`;
        return { allow: false, denyReason: why, gate: "gpu-mutex", checks: lastChecks };
      }
      held = true;
      gpu = { ok: true, acquired: true, resource: gpuResource };
    }

    lastChecks = { stop, vram, gpu, at: now() };
    return { allow: true, gate: null, checks: lastChecks };
  }

  /**
   * A side-effect-free read of the kill-switch ONLY — no lease, no VRAM probe, no
   * dispatch counter. This is what a watcher polls WHILE a model call is in flight:
   * `check()` would renew leases and inflate the receipt, and a poller must be able
   * to run every 250ms without changing anything it observes.
   */
  function peek() {
    return readStop({ path: stopPath, readFile, pilar, device });
  }

  function release() {
    if (held) { leases.release([gpuResource], owner); held = false; }
    return { ok: true };
  }

  /**
   * The per-job receipt. Only measured things; anything unmeasured says `n/d`.
   * This is what lands in the Ledger — the proof a job ran under the invariants.
   */
  function receipt() {
    return {
      kind: "gate-receipt",
      dispatches_gated: dispatches,
      gpu_resource: gpuResource,
      gpu_held: held,
      stop_path: stopPath,
      stop: lastChecks ? lastChecks.stop.reason : "n/d",
      vram: lastChecks && lastChecks.vram
        ? { state: lastChecks.vram.state, free_gib: lastChecks.vram.freeGiB ?? "n/d", why: lastChecks.vram.why }
        : "n/d",
      pilar: pilar ?? "n/d",
      device: device ?? "n/d",
    };
  }

  return { check, peek, release, receipt };
}
