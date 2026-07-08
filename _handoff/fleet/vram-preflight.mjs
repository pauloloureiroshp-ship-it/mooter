#!/usr/bin/env node
// vram-preflight.mjs — the router-vs-fleet contention guard (F4, additive).
//
// The 4090 is SHARED: the Mooter router keeps a small Ollama model resident and
// classifies every prompt, while the fleet wants qwen3:30b (~19GB). On a 23GB card
// the two do not both fit with headroom — and when they don't, Ollama silently
// spills qwen3:30b to CPU: a single generation then hangs >120s (proven, re-run
// 2026-07-08), cascading into timeout incidents. This guard makes that state a
// FIRST-CLASS, VISIBLE decision instead of a silent CPU fallback: if a foreign
// model is resident AND free VRAM is too small to load the fleet model, the round
// does NOT generate — it records a `vram-contention` incident and backs off.
//
// IT NEVER UNLOADS A MODEL IT DOES NOT OWN. The router's model is not ours to evict
// — we only wait, log, and signal. Ownership is a hard line.

"use strict";

import { spawnSync } from "node:child_process";

export const FLEET_MODEL = process.env.FLEET_LOCAL_MODEL || "qwen3:30b";
const MODEL_VRAM_MB = (Number(process.env.FLEET_MODEL_VRAM_GB) || 19) * 1024;
const HEADROOM_MB = Number(process.env.FLEET_VRAM_HEADROOM_MB) || 1024;
const PS_TIMEOUT_MS = 3000;

// Two models "are the same family" when they share the base name before the tag
// (qwen3:30b vs qwen3:30b-instruct). Foreign = a different family entirely.
function sameFamily(name, fleetModel) {
  if (!name) return false;
  const base = (s) => String(s).split(":")[0];
  return name === fleetModel || base(name) === base(fleetModel);
}

// ── pure decision (inject both probes → fully testable offline) ──────────────
export function assessContention({ psModels = [], freeMb = null, fleetModel = FLEET_MODEL, modelVramMb = MODEL_VRAM_MB, headroomMb = HEADROOM_MB } = {}) {
  const names = psModels.map((m) => m.name || m.model).filter(Boolean);
  const fleetResident = names.some((n) => sameFamily(n, fleetModel));
  const foreignModels = names.filter((n) => !sameFamily(n, fleetModel));
  // Fleet model already resident → its VRAM is accounted for, no fresh load needed.
  if (fleetResident) return { ok: true, freeMb, foreignModels, fleetResident, reason: null };
  // Fleet model must load → it needs room. Only block when we can PROVE the gap:
  // a foreign model is resident and measured free VRAM < model + headroom.
  if (foreignModels.length && Number.isFinite(freeMb) && freeMb < modelVramMb + headroomMb) {
    return {
      ok: false, freeMb, foreignModels, fleetResident: false,
      reason: `vram-contention: ${foreignModels.join(", ")} resident — ${freeMb}MB free < ${modelVramMb + headroomMb}MB needed for ${fleetModel}`,
    };
  }
  // No proof of contention (probe failed, or enough room) → never block on a probe.
  return { ok: true, freeMb, foreignModels, fleetResident, reason: null };
}

// ── live probes (best-effort; a probe failure NEVER blocks the fleet) ────────
export async function probeOllamaPs(host, timeoutMs = PS_TIMEOUT_MS) {
  try {
    const res = await fetch(`${host}/api/ps`, { signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) return [];
    const j = await res.json();
    return Array.isArray(j.models) ? j.models : [];
  } catch { return []; }
}

export function probeVramFreeMb() {
  const r = spawnSync("nvidia-smi", ["--query-gpu=memory.free", "--format=csv,noheader,nounits"], { encoding: "utf8" });
  if (r.status !== 0 || !r.stdout) return null;
  const v = parseInt((r.stdout.trim().split("\n")[0] || "").trim(), 10);
  return Number.isFinite(v) ? v : null;
}

// One-call convenience: probe both, then decide. Returns the assessContention shape
// plus the raw probe values (freeMb, foreignModels) for the heartbeat/DIGEST.
export async function preflight({ ollamaHost, fleetModel = FLEET_MODEL } = {}) {
  const host = (ollamaHost || process.env.OLLAMA_HOST || "http://127.0.0.1:11434").replace(/\/$/, "");
  const [psModels, freeMb] = [await probeOllamaPs(host), probeVramFreeMb()];
  return assessContention({ psModels, freeMb, fleetModel });
}

export default preflight;
