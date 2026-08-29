#!/usr/bin/env node
// @ts-check
/**
 * gpu-probe.js — GPU detection for the frugal savings-tracker (v0.9).
 *
 * Exports:
 *   probeSync()      → { vendor, name_short, vramMB, utilPct, platform }
 *   fetchUtilSync()  → number | null   (NVIDIA only; current gpu-util %)
 *
 * Detection order:
 *   1. NVIDIA via `nvidia-smi` (Windows + Linux)
 *   2. macOS Apple Silicon via `system_profiler SPDisplaysDataType -json`
 *   3. Linux AMD via /sys/class/drm/card0/device/gpu_busy_percent
 *   4. Fallback: { vendor: 'cpu', name_short: 'CPU-only', ... }
 *
 * All probes use short timeouts and swallow errors — the tracker must never
 * crash because nvidia-smi isn't on PATH.
 */

'use strict';

/**
 * @typedef {Object} GpuProbe
 * @property {string} vendor  - 'nvidia' | 'apple' | 'amd' | 'cpu'
 * @property {string} name_short
 * @property {number|null} vramMB
 * @property {number|null} utilPct
 * @property {string} platform
 */

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

function runNvidiaSmi() {
  const r = spawnSync(
    'nvidia-smi',
    ['--query-gpu=name,memory.total,utilization.gpu', '--format=csv,noheader,nounits'],
    { encoding: 'utf8', timeout: 3000, windowsHide: true }
  );
  if (r.status !== 0 || !r.stdout) return null;
  // Use the first GPU line only.
  const firstLine = r.stdout.split(/\r?\n/).find(Boolean);
  if (!firstLine) return null;
  const parts = firstLine.split(',').map((s) => s.trim());
  if (parts.length < 3) return null;
  const [nameRaw, vramStr, utilStr] = parts;
  const nameShort = nameRaw.replace(/^NVIDIA\s+GeForce\s+/i, '').replace(/^NVIDIA\s+/i, '').trim();
  const vramMB = parseInt(vramStr, 10);
  const utilPct = parseInt(utilStr, 10);
  return {
    vendor: 'nvidia',
    name_short: nameShort || 'NVIDIA GPU',
    vramMB: Number.isFinite(vramMB) ? vramMB : null,
    utilPct: Number.isFinite(utilPct) ? utilPct : null,
    platform: process.platform,
  };
}

function runAppleProbe() {
  const r = spawnSync('system_profiler', ['SPDisplaysDataType', '-json'], {
    encoding: 'utf8',
    timeout: 3000,
  });
  if (r.status !== 0 || !r.stdout) return null;
  try {
    const data = JSON.parse(r.stdout);
    const entry =
      (data && data.SPDisplaysDataType && data.SPDisplaysDataType[0]) || null;
    if (!entry) return null;
    const name =
      entry.sppci_model || entry.spdisplays_device_name || entry._name || 'Apple GPU';
    // ── memoria unificada: FACTO, nao constante ──────────────────────────
    // Ate 2026-08-29 isto devolvia `vramMB: null`, e o `buildHwCapability`
    // compensava com um tecto de 9216 MB cravado para TODO o Apple. Medido
    // nesse dia num M4 Pro de 24 GB: um modelo com 16,0 GB carregados correu a
    // **100% GPU** (`ollama ps`). O tecto cravado dizia 9 GB. Era falso por
    // quase o dobro, e nao havia forma de o saber porque ninguem media.
    //
    // `iogpu.wired_limit_mb`, quando definido, e a autoridade — e o utilizador
    // a declarar o tecto. Quando esta a 0 (default do macOS), derivamos de
    // `hw.memsize` a 66%: 16,0/24 = 66,7% foi MEDIDO a funcionar, portanto 66%
    // e um piso conservador provado, nao um palpite. As fontes publicas
    // divergem entre 66% e 75%; ficamos pela que temos medida.
    const sysctlNum = (chave) => {
      const out = spawnSync('sysctl', ['-n', chave], { encoding: 'utf8', timeout: 2000 });
      if (out.status !== 0 || !out.stdout) return null;
      const n = Number(String(out.stdout).trim());
      return Number.isFinite(n) && n > 0 ? n : null;
    };
    const totalMB = (() => { const b = sysctlNum('hw.memsize'); return b ? Math.floor(b / 1048576) : null; })();
    const wired = sysctlNum('iogpu.wired_limit_mb');
    const vramMB = wired || (totalMB ? Math.floor(totalMB * 0.66) : null);
    return {
      vendor: 'apple',
      name_short: String(name).replace(/^Apple /, 'Apple '),
      vramMB,
      unified_memory_mb: totalMB,
      // de onde veio o numero acima — para que nunca mais seja preciso adivinhar
      vram_fonte: wired ? 'iogpu.wired_limit_mb' : (totalMB ? 'hw.memsize*0.66' : 'n/d'),
      utilPct: null, // powermetrics requires sudo — skip gracefully.
      platform: 'darwin',
    };
  } catch {
    return null;
  }
}

function runAmdLinuxProbe() {
  try {
    const raw = fs.readFileSync('/sys/class/drm/card0/device/gpu_busy_percent', 'utf8');
    const util = parseInt(raw.trim(), 10);
    if (Number.isFinite(util)) {
      return {
        vendor: 'amd',
        name_short: 'AMD GPU',
        vramMB: null,
        utilPct: util,
        platform: 'linux',
      };
    }
  } catch { /* no sysfs entry */ }
  return null;
}

function probeSync() {
  const plat = process.platform;
  // 1. NVIDIA first (Windows + Linux).
  if (plat === 'win32' || plat === 'linux') {
    const nv = runNvidiaSmi();
    if (nv) return nv;
  }
  // 2. macOS Apple Silicon.
  if (plat === 'darwin') {
    const apple = runAppleProbe();
    if (apple) return apple;
  }
  // 3. Linux AMD fallback.
  if (plat === 'linux') {
    const amd = runAmdLinuxProbe();
    if (amd) return amd;
  }
  // 4. Fallback.
  return {
    vendor: 'cpu',
    name_short: 'CPU-only',
    vramMB: null,
    utilPct: null,
    platform: plat,
  };
}

function fetchUtilSync() {
  // Cheap nvidia-smi for utilization only — used every 5s by the tracker.
  const r = spawnSync(
    'nvidia-smi',
    ['--query-gpu=utilization.gpu', '--format=csv,noheader,nounits'],
    { encoding: 'utf8', timeout: 2000, windowsHide: true }
  );
  if (r.status !== 0 || !r.stdout) return null;
  const n = parseInt(r.stdout.trim().split(/\r?\n/)[0], 10);
  return Number.isFinite(n) ? n : null;
}

// ── Hardware Capability (v0.9.1) ───────────────────────────────────────────
// Maps VRAM to available T0 models and writes hw-capability.json.
const HW_CAPABILITY_PATH = path.join(os.homedir(), '.claude', 'tools', 'router', 'hw-capability.json');

// ⚠️ DUAS SEMANTICAS NESTA TABELA, e isso fica escrito.
// As entradas antigas sao TAMANHO DE BLOB — nao contam o KV cache, e por isso
// subestimam. Provado a 2026-08-29: `qwen2.5-coder:14b` declara 9216 MB aqui e
// carrega **15,0 GB** a 32k de contexto. Nao lhes toquei porque corrigi-las
// mexe na frota inteira e e decisao do dono.
// As entradas de 2026 sao MEDIDAS CARREGADAS (pesos + KV a 65536 de contexto)
// num M4 Pro de 24 GB — que e o numero que decide mesmo se cabe.
// Recibo: _handoff/motor-mac-20260829-1155.log
const MODEL_VRAM_REQ = {
  // ── medidos carregados @65536 ctx, Mac mini M4 Pro, 2026-08-29 ──
  'granite4.2:3b':                 8294,
  'granite4.2:8b':                16384,
  'gemma4:12b':                    8294,
  'gpt-oss:20b':                  12288,
  'qwen2.5-coder:14b':            15360,
  // ── legado: tamanho de blob, subestima (ver aviso acima) ──
  'qwen2.5:3b':                    2048,
  'qwen2.5-coder:7b':              4096,
  'deepseek-r1:7b':                4096,
  'gemma3:12b':                    8192,
  'qwen2.5-coder:14b-q4':         9216,
  'gemma4:e4b':                    9830,
  'qwen2.5:32b-q4':               20480,
  'qwen3:30b':                    20480,
};

/**
 * @param {GpuProbe | null | undefined} probe
 * @returns {string}
 */
function classifyHwTier(probe) {
  if (!probe) return 'cpu-only';
  if (probe.vendor === 'apple') return 'apple-silicon';
  if (probe.vendor === 'cpu') return 'cpu-only';
  const vram = probe.vramMB || 0;
  if (vram >= 20480) return 'gpu-high';
  if (vram >= 8192)  return 'gpu-mid';
  if (vram >= 4096)  return 'gpu-low';
  return 'cpu-only';
}

/**
 * @param {GpuProbe | null | undefined} probe
 * @returns {Object | null}
 */
function buildHwCapability(probe) {
  if (!probe || (probe.vendor === 'cpu')) return null;

  const vram = probe.vramMB || 0;
  const hwTier = classifyHwTier(probe);

  const t0Models = Object.entries(MODEL_VRAM_REQ).map(([model, req]) => ({
    model,
    vram_req_mb: req,
    // O ramo `probe.vendor === 'apple' ? req <= 9216 : ...` saiu daqui a
    // 2026-08-29: existia porque o probe nao sabia a memoria do Mac. Agora sabe.
    can_run: vram >= req,
  }));

  // recommended_t0: largest model that can_run, preferring qwen3:30b over qwen2.5:32b
  // (qwen3 is the primary T0 model in the frugal doctrine)
  // Ordem de preferencia. Ate 2026-08-29 nao tinha um unico modelo de 2026 e
  // liderava com `qwen3:30b`, que nao esta instalado em device nenhum da frota.
  // A ordem nao e opiniao: e o que o MooterBench mediu neste device (B1 100%
  // para o `qwen2.5-coder:14b` contra 0% dos Granite no prompt actual do pilar).
  const PREFER_ORDER = ['qwen2.5-coder:14b', 'gpt-oss:20b', 'granite4.2:8b', 'gemma4:12b', 'granite4.2:3b', 'qwen3:30b', 'qwen2.5:32b-q4', 'qwen2.5-coder:14b-q4', 'gemma4:e4b', 'gemma3:12b', 'deepseek-r1:7b', 'qwen2.5-coder:7b', 'qwen2.5:3b'];
  const runnable = t0Models.filter(m => m.can_run);
  const recommended = PREFER_ORDER.find(m => runnable.some(r => r.model === m)) || 'qwen2.5:3b';

  const capability = {
    probed_at: new Date().toISOString(),
    vendor: probe.vendor,
    name: probe.name_short,
    vram_mb: vram || null,
    hw_tier: hwTier,
    t0_models_available: t0Models,
    recommended_t0: recommended,
    option_a_model: 'qwen2.5:3b', // Option A always uses fast model — qwen3 think mode is too slow
  };

  try {
    fs.writeFileSync(HW_CAPABILITY_PATH, JSON.stringify(capability, null, 2) + '\n');
  } catch { /* non-fatal — hw-capability is a cache */ }

  return capability;
}

module.exports = { probeSync, fetchUtilSync, buildHwCapability, classifyHwTier, MODEL_VRAM_REQ };

if (require.main === module) {
  const probe = probeSync();
  console.log(JSON.stringify(probe, null, 2));
  const cap = buildHwCapability(probe);
  if (cap) {
    console.log('\nhw-capability:');
    console.log(JSON.stringify(cap, null, 2));
  } else {
    console.log('\nNo GPU detected — hw-capability.json not written.');
  }
}

