'use strict';
/**
 * gpu.js — mooter-bridge v1.3: which GPU, and how hard it is working.
 *
 * The panel could say a model was resident in VRAM. It could not say WHICH
 * card, how hot it was, or whether there was headroom to run more moos at once.
 * "O ideal é sempre mostrar o quanto de GPU está sendo utilizada em tempo real
 * no sidebar pra ver se não vale fazer o overclock" — that decision needs a
 * number, and the number has to be free to fetch.
 *
 * `nvidia-smi` costs 30–120 ms and the panel polls every 2–3 s, so we CACHE:
 *   · the static identity (name, total VRAM, driver) forever — it cannot change
 *   · the live gauges (utilisation, used VRAM, temp, power) for 1.5 s
 * If the binary is missing (no NVIDIA, or a Mac), we say so once and never
 * spawn again. Unknown is `null`, never zero — a zero would read as "idle".
 */

const { execFile } = require('child_process');

const LIVE_TTL_MS = 1500;
const PROBE_TIMEOUT_MS = 1200;

let identity = null;      // { name, memory_total_mb, driver } — probed once
let identityTried = false;
let unavailable = false;  // no nvidia-smi on this machine; stop trying
let liveCache = { at: 0, data: null };
let inFlight = null;

function run(args) {
  return new Promise((resolve) => {
    let done = false;
    const finish = (v) => { if (!done) { done = true; resolve(v); } };
    try {
      const child = execFile('nvidia-smi', args, { timeout: PROBE_TIMEOUT_MS, windowsHide: true },
        (err, stdout) => finish(err ? null : String(stdout || '')));
      child.on('error', () => finish(null));
    } catch { finish(null); }
  });
}

function num(s) {
  const n = Number(String(s == null ? '' : s).replace(/[^\d.-]/g, ''));
  return Number.isFinite(n) ? n : null;
}

/** Static identity of the first GPU. Probed once per process. */
async function gpuIdentity() {
  if (identity || identityTried) return identity;
  identityTried = true;
  const out = await run(['--query-gpu=name,memory.total,driver_version', '--format=csv,noheader,nounits']);
  if (out == null) { unavailable = true; return null; }
  const line = out.split('\n').map((l) => l.trim()).filter(Boolean)[0];
  if (!line) return null;
  const [name, total, driver] = line.split(',').map((s) => s.trim());
  identity = { name: name || null, memory_total_mb: num(total), driver: driver || null };
  return identity;
}

/**
 * Live gauges. Cheap enough for a 2s poll thanks to the TTL, and concurrent
 * callers share one in-flight probe instead of spawning a process each.
 */
async function gpuLive() {
  if (unavailable) return null;
  const now = Date.now();
  if (liveCache.data && now - liveCache.at < LIVE_TTL_MS) return liveCache.data;
  if (inFlight) return inFlight;

  inFlight = (async () => {
    const out = await run(['--query-gpu=utilization.gpu,utilization.memory,memory.used,memory.total,temperature.gpu,power.draw,power.limit',
      '--format=csv,noheader,nounits']);
    inFlight = null;
    if (out == null) { unavailable = true; return null; }
    const line = out.split('\n').map((l) => l.trim()).filter(Boolean)[0];
    if (!line) return null;
    const p = line.split(',').map((s) => s.trim());
    const data = {
      util_pct: num(p[0]),
      mem_util_pct: num(p[1]),
      memory_used_mb: num(p[2]),
      memory_total_mb: num(p[3]),
      temp_c: num(p[4]),
      power_w: num(p[5]),
      power_limit_w: num(p[6]),
      at: new Date().toISOString(),
    };
    if (data.memory_used_mb != null && data.memory_total_mb) {
      data.memory_pct = Math.round((data.memory_used_mb / data.memory_total_mb) * 100);
    }
    liveCache = { at: Date.now(), data };
    return data;
  })();
  return inFlight;
}

/**
 * Headroom advice — the honest version.
 *
 * The temptation is to say "GPU at 20%, run more!". But a single Ollama request
 * is serial: utilisation dips between tokens, and a 3B model on a 24 GB card is
 * memory-bound long before it is compute-bound. So the advice is driven by FREE
 * VRAM first (can another model even fit?) and utilisation second, and it always
 * shows the numbers it used so nobody has to trust the verdict.
 */
function headroom(live, id, residentCount) {
  if (!live) return null;
  const totalMb = live.memory_total_mb || (id && id.memory_total_mb) || null;
  const freeMb = (totalMb != null && live.memory_used_mb != null) ? totalMb - live.memory_used_mb : null;
  const util = live.util_pct;
  let verdict = 'n/d';
  let why = null;
  if (freeMb != null && util != null) {
    if (freeMb < 2048) { verdict = 'sem folga'; why = 'menos de 2 GB de VRAM livre'; }
    else if (util >= 85) { verdict = 'saturada'; why = 'utilização ' + util + '%'; }
    else if (util >= 40) { verdict = 'a trabalhar'; why = util + '% e ' + Math.round(freeMb / 1024) + ' GB livres'; }
    else { verdict = 'com folga'; why = 'só ' + util + '% e ' + Math.round(freeMb / 1024) + ' GB livres'; }
  }
  return {
    verdict, why,
    free_mb: freeMb,
    can_overclock: verdict === 'com folga' && (residentCount == null || residentCount < 4),
    note: 'decisão baseada em VRAM livre primeiro (um modelo tem de caber) e só depois em utilização — inferência serial faz a utilização oscilar entre tokens',
  };
}

/** Everything the panel needs about the card, in one call. */
async function gpuSnapshot(residentCount) {
  const id = await gpuIdentity();
  const live = await gpuLive();
  if (!id && !live) return { available: false, reason: 'nvidia-smi não encontrado nesta máquina', name: null };
  return {
    available: true,
    name: id ? id.name : null,
    driver: id ? id.driver : null,
    memory_total_mb: (live && live.memory_total_mb) || (id && id.memory_total_mb) || null,
    live,
    headroom: headroom(live, id, residentCount),
  };
}

function _reset() { identity = null; identityTried = false; unavailable = false; liveCache = { at: 0, data: null }; inFlight = null; }

module.exports = { gpuSnapshot, gpuIdentity, gpuLive, headroom, _reset };
