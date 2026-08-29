#!/usr/bin/env node
/**
 * hardware-matcher.js — recommends optimal Ollama model config per user.
 *
 * Reads hw-capability.json and model-intelligence.json to produce a
 * personalized recommendation: which models to install, which to warm,
 * and what the expected quality/latency tradeoff is.
 *
 * CLI:
 *   node hardware-matcher.js              → JSON recommendation
 *   node hardware-matcher.js --human      → human-readable report
 *   node hardware-matcher.js --install    → prints ollama pull commands
 */

'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');
const capModelo = require('./capacidades-modelo');

const ROUTER_DIR = path.join(os.homedir(), '.claude', 'tools', 'router');
const INTEL_PATH = path.join(__dirname, 'model-intelligence.json');
const HW_PATH = path.join(ROUTER_DIR, 'hw-capability.json');

function safeRead(p) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; }
}

function detectHwTier(hw) {
  if (!hw) return 'cpu-only';
  const vram = hw.vram_mb || 0;
  // Apple Silicon detection
  if ((hw.vendor || '').toLowerCase().includes('apple') || os.arch() === 'arm64' && process.platform === 'darwin') {
    return 'apple-silicon';
  }
  if (vram >= 16384) return 'gpu-high';
  if (vram >= 8192) return 'gpu-mid';
  if (vram >= 2048) return 'gpu-low';
  return 'cpu-only';
}

function run() {
  const intel = safeRead(INTEL_PATH);
  const hw = safeRead(HW_PATH);

  if (!intel) {
    console.error('ERROR: model-intelligence.json not found at', INTEL_PATH);
    process.exit(1);
  }

  const hwTier = detectHwTier(hw);
  const tierConfig = intel.hardware_tiers[hwTier];

  if (!tierConfig) {
    console.error('ERROR: unknown hardware tier:', hwTier);
    process.exit(1);
  }

  // What's installed on Ollama?
  // `hw.available_ollama_models` NUNCA e escrito por ninguem — o gpu-probe grava
  // `t0_models_available` (tabela estatica de VRAM), nao a lista do disco. Enquanto
  // isto foi a unica fonte, `installed` era falso para tudo. Passa a perguntar ao
  // Ollama, como o check-local-models.js e o catalogo-local.js ja faziam; a lista
  // do hw-capability fica como fallback. Medido 2026-08-29.
  function ollamaInstalled() {
    try {
      const r = spawnSync('ollama', ['list'], { encoding: 'utf8', timeout: 5000 });
      if (r.status !== 0 || !r.stdout) return null;
      return r.stdout.split('\n').slice(1)
        .map(l => l.trim().split(/\s+/)[0]).filter(Boolean);
    } catch { return null; }
  }
  const installed = ollamaInstalled()
    || (hw && hw.available_ollama_models || []).map(m => m.name || m);

  // What does the tier recommend?
  const recommended = tierConfig.recommended_models;
  const allRecommended = [...new Set(Object.values(recommended))];

  // What's missing?
  const missing = allRecommended.filter(m => !installed.includes(m));
  const extra = installed.filter(m => !allRecommended.includes(m));

  // Quality assessment per subtier
  const subtierAssessment = {};
  for (const [subtier, modelName] of Object.entries(recommended)) {
    const modelDef = intel.models.local[modelName];
    if (modelDef) {
      // `quality` pode ser null: um modelo entra no catalogo antes de ter notas
      // medidas. Sem esta guarda o unico jeito de o registar era inventar as notas
      // — e "numero nao medido = n/d, nunca inventado" e regra do projecto.
      const q = modelDef.quality && typeof modelDef.quality === 'object'
        ? Object.values(modelDef.quality) : [];
      const avgQuality = q.length ? q.reduce((a, b) => a + b, 0) / q.length : null;
      // O que este modelo sabe fazer, MEDIDO. O catálogo declarava `tools` para
      // o `qwen2.5-coder:14b` e a medição de 2026-08-29 mostrou 0 chamadas em
      // 20 tarefas que as exigiam. Uma recomendação que não diz isto manda
      // trabalho agêntico para um modelo que não o consegue fazer.
      const tools = capModelo.verificaTools(capModelo.capacidadesDe(modelName));
      const json = capModelo.verificaJson(capModelo.capacidadesDe(modelName));
      subtierAssessment[subtier] = {
        model: modelName,
        installed: installed.includes(modelName),
        avg_quality: avgQuality === null ? null : Math.round(avgQuality * 10) / 10,
        vram_mb: modelDef.vram_required_mb,
        strengths: modelDef.strengths,
        tool_calling: tools.estado,
        tool_calling_porque: tools.porque,
        json_schema: json.estado,
      };
    }
  }

  const desmentidas = capModelo.declaracoesDesmentidas();

  const result = {
    // Onde o catálogo DECLARA uma capacidade que a medição desmente. Vazio é a
    // resposta boa; não-vazio é um catálogo a mentir, e isso tem de ser visível
    // sem ninguém ter de ir procurar.
    declaracoes_desmentidas: desmentidas,
    hardware: {
      tier: hwTier,
      label: tierConfig.label,
      gpu: hw ? (hw.name || hw.gpu_name || 'unknown') : 'none',
      vram_mb: hw ? (hw.vram_mb || 0) : 0,
      hostname: os.hostname(),
      platform: process.platform,
    },
    recommendation: {
      models: recommended,
      subtier_details: subtierAssessment,
      note: tierConfig.optimal_config_note,
    },
    status: {
      installed,
      missing,
      extra,
      ready: missing.length === 0,
    },
    install_commands: missing.map(m => `ollama pull ${m}`),
  };

  const args = process.argv.slice(2);

  if (args.includes('--human')) {
    const lines = [
      '',
      '🖥️  MOOTER — Hardware Model Matcher',
      '━'.repeat(42),
      '',
      `Hardware: ${result.hardware.gpu} (${Math.round(result.hardware.vram_mb / 1024)}GB VRAM)`,
      `Tier: ${result.hardware.label} (${result.hardware.tier})`,
      `Machine: ${result.hardware.hostname} (${result.hardware.platform})`,
      '',
      '📋 Recommended Models:',
    ];

    for (const [subtier, detail] of Object.entries(subtierAssessment)) {
      const status = detail.installed ? '✅' : '❌';
      const vramGb = (detail.vram_mb / 1024).toFixed(1);
      const qLabel = detail.avg_quality === null ? 'quality: n/d' : `quality: ${detail.avg_quality}/10`;
      const tMark = detail.tool_calling === 'cumpre' ? 'tools ✅' : detail.tool_calling === 'nao-cumpre' ? 'tools ❌' : 'tools n/d';
      lines.push(`  ${status} ${subtier.padEnd(8)} → ${detail.model.padEnd(28)} (${vramGb}GB, ${qLabel}, ${tMark})`);
      if (detail.tool_calling === 'nao-cumpre') lines.push(`       ⚠️  ${detail.tool_calling_porque}`);
    }

    lines.push('');
    if (missing.length === 0) {
      lines.push('✅ All recommended models are installed!');
    } else {
      lines.push(`⚠ Missing ${missing.length} model(s). Install with:`);
      for (const m of missing) {
        lines.push(`  ollama pull ${m}`);
      }
    }

    if (extra.length > 0) {
      lines.push('');
      lines.push('ℹ Extra models installed (not in recommended set):');
      for (const m of extra) lines.push(`  • ${m}`);
    }

    lines.push('');
    lines.push('💡 ' + tierConfig.optimal_config_note);
    lines.push('');

    console.log(lines.join('\n'));
  } else if (args.includes('--install')) {
    if (missing.length === 0) {
      console.log('All recommended models are already installed.');
    } else {
      for (const cmd of result.install_commands) {
        console.log(cmd);
      }
    }
  } else {
    console.log(JSON.stringify(result, null, 2));
  }
}

run();
