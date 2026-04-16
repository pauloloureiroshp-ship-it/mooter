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
  const installed = (hw && hw.available_ollama_models || []).map(m => m.name || m);

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
      const avgQuality = Object.values(modelDef.quality).reduce((a, b) => a + b, 0) / Object.values(modelDef.quality).length;
      subtierAssessment[subtier] = {
        model: modelName,
        installed: installed.includes(modelName),
        avg_quality: Math.round(avgQuality * 10) / 10,
        vram_mb: modelDef.vram_required_mb,
        strengths: modelDef.strengths,
      };
    }
  }

  const result = {
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
      lines.push(`  ${status} ${subtier.padEnd(8)} → ${detail.model.padEnd(28)} (${vramGb}GB, quality: ${detail.avg_quality}/10)`);
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
