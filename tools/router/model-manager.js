#!/usr/bin/env node
/**
 * model-manager.js — Ollama model management and recommendations
 *
 * Usage:
 *   node model-manager.js                  # show installed models + recommendations
 *   node model-manager.js --check-updates  # compare with hub catalog
 *   node model-manager.js --benchmark      # run speed test on installed models
 *   node model-manager.js --json           # output as JSON
 */

'use strict';

const { execSync } = require('child_process');
const fs = require('fs');
const { getHubUrl } = require('./env');
const path = require('path');
const os = require('os');
const https = require('https');

// ── Paths ─────────────────────────────────────────────────────────────────────
const ROUTER_DIR = path.join(os.homedir(), '.claude', 'tools', 'router');
const HW_CAPABILITY_PATH = path.join(ROUTER_DIR, 'hw-capability.json');
const MODEL_PROFILE_PATH = path.join(__dirname, 'model-profile.json');

// ── VRAM estimates (MB) for "can this model probably run" sizing ───────────────
const VRAM_ESTIMATES = {
  '3b':  2048,
  '7b':  5120,
  '12b': 8192,
  '14b': 9216,
  '30b': 20480,
  '32b': 20480,
};

function estimateVramMb(modelName) {
  const lower = modelName.toLowerCase();
  for (const [tag, mb] of Object.entries(VRAM_ESTIMATES)) {
    if (lower.includes(`:${tag}`) || lower.includes(`-${tag}`)) return mb;
  }
  return null;
}

// ── Exec helper ───────────────────────────────────────────────────────────────
const EXEC_OPTS = {
  encoding: 'utf8',
  timeout: 30000,
  windowsHide: true,
  stdio: ['pipe', 'pipe', 'pipe'],
};

function tryExec(cmd, opts = {}) {
  try {
    return execSync(cmd, { ...EXEC_OPTS, ...opts });
  } catch (e) {
    return null;
  }
}

// ── 1. Check Ollama is installed ──────────────────────────────────────────────
function checkOllamaInstalled() {
  const result = tryExec('ollama --version', { timeout: 5000 });
  return result !== null;
}

// ── 2. getInstalledModels ─────────────────────────────────────────────────────
function getInstalledModels() {
  const output = tryExec('ollama list');
  if (!output) return [];

  const lines = output.trim().split(/\r?\n/);
  // First line is header: NAME  ID  SIZE  MODIFIED
  const models = [];
  for (const line of lines.slice(1)) {
    if (!line.trim()) continue;
    // Columns are tab or multiple-space separated
    const parts = line.trim().split(/\s{2,}|\t/);
    if (parts.length < 3) continue;
    const [name, , sizeRaw, ...modifiedParts] = parts;
    // Size comes as "1.9 GB" or "18.4 GB"
    const sizeMatch = sizeRaw && sizeRaw.match(/([\d.]+)\s*(GB|MB)/i);
    const sizeGb = sizeMatch
      ? sizeMatch[2].toUpperCase() === 'GB'
        ? parseFloat(sizeMatch[1])
        : parseFloat(sizeMatch[1]) / 1024
      : null;
    models.push({
      name: name.trim(),
      size_gb: sizeGb,
      modified: modifiedParts.join(' ').trim() || null,
    });
  }
  return models;
}

// ── 3. getModelSpeed ──────────────────────────────────────────────────────────
function getModelSpeed(modelName) {
  // ollama run --verbose outputs eval rate to stderr
  const result = tryExec(
    `ollama run --verbose ${modelName} "Hello"`,
    { timeout: 30000 }
  );
  if (!result) return null;

  // stderr is captured in result when using execSync with stdio pipe
  // Try to parse from the combined output (execSync merges stdout+stderr with pipe)
  const combined = result + '';
  const match = combined.match(/eval rate:\s*([\d.]+)\s*tokens?\s*\/\s*s/i);
  return match ? parseFloat(match[1]) : null;
}

// ── 4. getHwCapability ────────────────────────────────────────────────────────
function getHwCapability() {
  try {
    const raw = fs.readFileSync(HW_CAPABILITY_PATH, 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

// ── 5. getModelCatalog ────────────────────────────────────────────────────────
function getModelCatalog() {
  try {
    const raw = fs.readFileSync(MODEL_PROFILE_PATH, 'utf8');
    return JSON.parse(raw);
  } catch {
    return { models: {} };
  }
}

// ── Quality average helper ────────────────────────────────────────────────────
function qualityAvg(qualityObj) {
  if (!qualityObj) return null;
  const vals = Object.values(qualityObj).filter(v => typeof v === 'number');
  if (!vals.length) return null;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

// ── 6. analyzeModels ─────────────────────────────────────────────────────────
function analyzeModels() {
  const hw = getHwCapability();
  const catalog = getModelCatalog();
  const installed = getInstalledModels();

  const installedNames = new Set(installed.map(m => m.name));

  // Build installed model info, enriched with catalog data
  const installedEnriched = installed.map(m => {
    const catalogEntry = catalog.models[m.name] || null;
    const qa = catalogEntry ? qualityAvg(catalogEntry.quality) : null;
    return {
      ...m,
      catalog: catalogEntry,
      quality_avg: qa ? parseFloat(qa.toFixed(2)) : null,
      speed_toks: null, // filled by --benchmark
    };
  });

  // Determine available VRAM
  const vramMb = hw ? hw.vram_mb : null;

  // Build recommendations: catalog ollama models NOT installed
  const recommended = [];
  for (const [modelId, entry] of Object.entries(catalog.models)) {
    if (entry.provider !== 'ollama') continue;
    if (installedNames.has(modelId)) continue;

    const vramReq = estimateVramMb(modelId);
    const canRun = vramMb !== null && vramReq !== null ? vramMb >= vramReq : null;

    const qa = qualityAvg(entry.quality);
    // Estimated speed from latency_p50_ms: rough tok/s = 200 / (p50 / 1000)
    const estSpeed = entry.latency_p50_ms ? Math.round(200 / (entry.latency_p50_ms / 1000)) : null;
    const score = qa !== null && estSpeed !== null ? qa * Math.log1p(estSpeed) : 0;

    recommended.push({
      name: modelId,
      vram_req_mb: vramReq,
      can_run: canRun,
      quality_avg: qa ? parseFloat(qa.toFixed(2)) : null,
      est_speed_toks: estSpeed,
      score,
      catalog: entry,
    });
  }

  recommended.sort((a, b) => b.score - a.score);

  // Determine current T0 and delegation models from hw-capability
  const t0Model = hw ? hw.option_a_model : null;
  const delegationModel = hw ? hw.recommended_t0 : null;

  // Suggest upgrades: find a better scoring model than currently installed delegation model
  const delegationEntry = delegationModel ? catalog.models[delegationModel] : null;
  const delegationQa = delegationEntry ? qualityAvg(delegationEntry.quality) : null;
  const delegationP50 = delegationEntry ? delegationEntry.latency_p50_ms : null;

  const suggestions = recommended
    .filter(r => r.can_run !== false)
    .filter(r => {
      if (!delegationQa) return true;
      return r.quality_avg >= delegationQa * 0.9; // within 10% quality
    })
    .slice(0, 3);

  return {
    hw,
    installed: installedEnriched,
    recommendations: recommended.filter(r => r.can_run !== false).slice(0, 5),
    suggestions,
    t0_model: t0Model,
    delegation_model: delegationModel,
    delegation_latency_p50: delegationP50,
  };
}

// ── 7. renderReport ───────────────────────────────────────────────────────────
const C = {
  reset:  '\x1b[0m',
  bold:   '\x1b[1m',
  green:  '\x1b[32m',
  yellow: '\x1b[33m',
  cyan:   '\x1b[36m',
  dim:    '\x1b[2m',
  magenta:'\x1b[35m',
};

function pad(str, len) {
  const s = String(str);
  return s.length >= len ? s : s + ' '.repeat(len - s.length);
}

function renderReport(analysis) {
  const { hw, installed, recommendations, suggestions, t0_model, delegation_model, delegation_latency_p50 } = analysis;

  const BOX_W = 54;
  const line = (content = '') => {
    const visible = content.replace(/\x1b\[[0-9;]*m/g, '');
    const pad_right = Math.max(0, BOX_W - 2 - visible.length);
    return `│ ${content}${' '.repeat(pad_right)} │`;
  };
  const divider = `├${'─'.repeat(BOX_W - 2)}┤`;
  const top =    `╭${'─'.repeat(BOX_W - 2)}╮`;
  const bottom = `╰${'─'.repeat(BOX_W - 2)}╯`;

  const rows = [];
  rows.push(top);

  // Title
  const title = `${C.bold}${C.cyan}mooter model manager${C.reset}`;
  const titlePad = ' '.repeat(Math.max(0, BOX_W - 2 - 20));
  rows.push(`│ ${title}${titlePad} │`);
  rows.push(line());

  // Hardware
  if (hw) {
    const vramGb = hw.vram_mb ? `${(hw.vram_mb / 1024).toFixed(0)}GB VRAM` : 'VRAM unknown';
    rows.push(line(`${C.dim}Hardware:${C.reset} ${hw.name} · ${vramGb}`));
  } else {
    rows.push(line(`${C.dim}Hardware:${C.reset} unknown (run gpu-probe first)`));
  }
  rows.push(line());

  // Installed models
  rows.push(line(`${C.bold}Installed models:${C.reset}`));
  if (!installed.length) {
    rows.push(line(`  ${C.dim}(none — run: ollama pull qwen2.5:3b)${C.reset}`));
  }
  for (const m of installed) {
    const sizeStr = m.size_gb !== null ? `${m.size_gb.toFixed(1)} GB` : '???? ';
    const speedStr = m.speed_toks !== null ? `${m.speed_toks.toFixed(1)} tok/s` : '  ??  tok/s';
    const qualStr = m.quality_avg !== null ? `quality: ${m.quality_avg.toFixed(1)}` : '';
    rows.push(line(
      `  ${C.green}✓${C.reset} ${pad(m.name, 14)} ${pad(sizeStr, 8)} ${pad(speedStr, 12)} ${C.dim}${qualStr}${C.reset}`
    ));
  }
  rows.push(line());

  // Recommendations
  if (recommendations.length) {
    rows.push(line(`${C.bold}Recommended upgrades:${C.reset}`));
    for (const r of recommendations) {
      const vramStr = r.vram_req_mb ? `${(r.vram_req_mb / 1024).toFixed(1)} GB` : '???? ';
      const speedStr = r.est_speed_toks !== null ? `~${r.est_speed_toks} tok/s` : '?? tok/s';
      const qualStr = r.quality_avg !== null ? `quality: ${r.quality_avg.toFixed(1)}` : '';
      rows.push(line(
        `  ${C.yellow}→${C.reset} ${pad(r.name, 14)} ${pad(vramStr, 8)} ${pad(speedStr, 12)} ${C.dim}${qualStr}${C.reset}`
      ));
      rows.push(line(`    ${C.dim}ollama pull ${r.name}${C.reset}`));
    }
    rows.push(line());
  }

  // Current models
  rows.push(line(`${C.dim}Current T0 model:${C.reset}    ${t0_model || 'none'} ${C.dim}(Option A)${C.reset}`));
  rows.push(line(`${C.dim}Current delegation:${C.reset}  ${delegation_model || 'none'}`));

  // Suggestions
  if (suggestions.length) {
    rows.push(line());
    for (const s of suggestions) {
      if (!delegation_latency_p50 || !s.est_speed_toks) continue;
      const delegSpeed = Math.round(200 / (delegation_latency_p50 / 1000));
      if (s.est_speed_toks > delegSpeed) {
        const pct = Math.round(((s.est_speed_toks - delegSpeed) / delegSpeed) * 100);
        const q1 = s.quality_avg;
        const q2 = analysis.installed.find(m => m.name === delegation_model);
        const qDiff = q1 && q2 && q2.quality_avg
          ? Math.abs(q1 - q2.quality_avg) < 0.5 ? 'similar quality' : `quality ${q1.toFixed(1)}`
          : '';
        rows.push(line(
          `${C.magenta}Suggestion:${C.reset} ${s.name} would be ${C.bold}${pct}% faster${C.reset}`
        ));
        rows.push(line(
          `than ${delegation_model} with ${qDiff}`
        ));
      }
    }
  }

  rows.push(bottom);
  console.log(rows.join('\n'));
}

// ── --check-updates ───────────────────────────────────────────────────────────
async function checkUpdates() {
  const catalog = getModelCatalog();
  const ollamaModels = Object.entries(catalog.models)
    .filter(([, v]) => v.provider === 'ollama')
    .map(([k]) => k);

  console.log('Checking mooter hub for model updates...');

  const hubData = await new Promise((resolve) => {
    const url = getHubUrl() + '/api/models';
    const req = https.get(url, { timeout: 5000 }, (res) => {
      let body = '';
      res.on('data', d => { body += d; });
      res.on('end', () => {
        try { resolve(JSON.parse(body)); }
        catch { resolve(null); }
      });
    });
    req.on('error', () => resolve(null));
    req.on('timeout', () => { req.destroy(); resolve(null); });
  });

  if (!hubData) {
    console.log(`${C.yellow}Hub unavailable — using local catalog only${C.reset}`);
    console.log(`\nLocal catalog has ${ollamaModels.length} Ollama models:`);
    ollamaModels.forEach(m => console.log(`  • ${m}`));
    return;
  }

  // Hub returns array of model objects (assumed shape: [{id, ...}])
  const hubModels = Array.isArray(hubData) ? hubData : hubData.models || [];
  const hubIds = new Set(hubModels.map(m => m.id || m.name || m));
  const localIds = new Set(ollamaModels);

  const newInHub = [...hubIds].filter(id => !localIds.has(id));
  if (newInHub.length) {
    console.log(`\n${C.green}New models in hub not in local catalog:${C.reset}`);
    newInHub.forEach(id => console.log(`  ${C.yellow}+${C.reset} ${id}`));
  } else {
    console.log(`${C.green}Local catalog is up to date with hub.${C.reset}`);
  }
}

// ── --benchmark ───────────────────────────────────────────────────────────────
function runBenchmark() {
  const installed = getInstalledModels();
  if (!installed.length) {
    console.log('No Ollama models installed.');
    return;
  }

  console.log(`${C.bold}Benchmarking ${installed.length} model(s)...${C.reset}\n`);
  const benchmarks = {};

  for (const m of installed) {
    process.stdout.write(`  Testing ${m.name}... `);
    const toks = getModelSpeed(m.name);
    if (toks !== null) {
      console.log(`${C.green}${toks.toFixed(1)} tok/s${C.reset}`);
      benchmarks[m.name] = { tokens_per_second: toks, tested_at: new Date().toISOString() };
    } else {
      console.log(`${C.yellow}timeout / error${C.reset}`);
      benchmarks[m.name] = { tokens_per_second: null, tested_at: new Date().toISOString() };
    }
  }

  // Persist to hw-capability.json
  try {
    let hw = {};
    try { hw = JSON.parse(fs.readFileSync(HW_CAPABILITY_PATH, 'utf8')); } catch { /* ok */ }
    hw.model_benchmarks = { ...(hw.model_benchmarks || {}), ...benchmarks };
    fs.writeFileSync(HW_CAPABILITY_PATH, JSON.stringify(hw, null, 2) + '\n');
    console.log(`\n${C.dim}Benchmarks saved to ${HW_CAPABILITY_PATH}${C.reset}`);
  } catch (e) {
    console.log(`\n${C.yellow}Could not write hw-capability.json: ${e.message}${C.reset}`);
  }
}

// ── Sync installed models to hw-capability.json ──────────────────────────────
function syncModelsToHwCapability(installedModels) {
  try {
    let hw = {};
    try { hw = JSON.parse(fs.readFileSync(HW_CAPABILITY_PATH, 'utf8')); } catch { /* ok */ }
    hw.available_ollama_models = installedModels.map(m => ({
      name: m.name,
      size_gb: m.size_gb || m.sizeGB,
      vram_est_mb: estimateVramMb(m.name),
    }));
    hw.ollama_models_updated_at = new Date().toISOString();
    fs.writeFileSync(HW_CAPABILITY_PATH, JSON.stringify(hw, null, 2) + '\n');
  } catch { /* non-fatal */ }
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  const args = process.argv.slice(2);
  const jsonMode      = args.includes('--json');
  const checkUpdates_ = args.includes('--check-updates');
  const benchmark     = args.includes('--benchmark');

  // Gate: check Ollama is installed
  if (!checkOllamaInstalled()) {
    if (jsonMode) {
      console.log(JSON.stringify({ error: 'ollama not installed or not on PATH' }));
    } else {
      console.log(`${C.yellow}Ollama is not installed or not found on PATH.${C.reset}`);
      console.log('Install it from https://ollama.com and try again.');
    }
    process.exit(1);
  }

  if (checkUpdates_) {
    await checkUpdates();
    return;
  }

  if (benchmark) {
    runBenchmark();
    return;
  }

  const analysis = analyzeModels();

  // Sync installed models to hw-capability.json for warmup + budget-engine
  syncModelsToHwCapability(analysis.installed);

  if (jsonMode) {
    console.log(JSON.stringify(analysis, null, 2));
    return;
  }

  renderReport(analysis);
}

main().catch(e => {
  console.error(`Fatal: ${e.message}`);
  process.exit(1);
});
