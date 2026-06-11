#!/usr/bin/env node
/**
 * setup-profile.js — interactive device + subscription profile setup for frugal.
 *
 * Captures four dimensions required for customised install + algorithm learning:
 *   1. Hardware (auto-detected): platform, arch, CPU, RAM, hw_tier
 *   2. Software (auto-detected): Node, Claude Code, VS Code, Ollama
 *   3. Subscriptions (prompts): Anthropic, OpenAI, Gemini
 *   4. Budget (prompt): monthly ceiling in USD or auto
 *
 * Writes two files:
 *   ~/.claude/tools/router/subscription-profile.json (backward-compat, existing consumers)
 *   ~/.claude/tools/router/device-profile.json       (new, full 4-dimension snapshot)
 *
 * Flags:
 *   --non-interactive   auto-detect hardware/software only; skip subs+budget prompts
 *                       (intended for install.sh automation)
 *   --force             overwrite existing profiles without confirmation
 */

'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');
const readline = require('readline');

const SUB_PROFILE_PATH = path.join(os.homedir(), '.claude', 'tools', 'router', 'subscription-profile.json');
const DEVICE_PROFILE_PATH = path.join(os.homedir(), '.claude', 'tools', 'router', 'device-profile.json');

const args = new Set(process.argv.slice(2));
const NON_INTERACTIVE = args.has('--non-interactive');
const FORCE = args.has('--force');

function ask(rl, question) {
  return new Promise((resolve) => rl.question(question, (a) => resolve(a.trim())));
}

function isYes(answer) {
  const a = answer.toLowerCase();
  return a === 'y' || a === 'yes' || a === 's' || a === 'sim';
}

function tryExec(cmd) {
  try {
    return execSync(cmd, { stdio: ['ignore', 'pipe', 'ignore'], timeout: 3000 }).toString().trim();
  } catch {
    return null;
  }
}

function detectHardware() {
  const platform = os.platform();
  const arch = os.arch();
  const cpus = os.cpus() || [];
  const cpuModel = cpus[0] ? cpus[0].model : 'unknown';
  const cpuCores = cpus.length;
  const ramGb = Math.round(os.totalmem() / (1024 ** 3));

  let hwTier = 'cpu-only';
  if (platform === 'darwin' && arch === 'arm64') {
    hwTier = 'apple-silicon';
  } else if (tryExec('nvidia-smi --query-gpu=memory.total --format=csv,noheader,nounits')) {
    const gpuMem = parseInt(tryExec('nvidia-smi --query-gpu=memory.total --format=csv,noheader,nounits'), 10);
    if (gpuMem >= 16000) hwTier = 'gpu-high';
    else if (gpuMem >= 8000) hwTier = 'gpu-mid';
    else hwTier = 'gpu-low';
  }

  return { platform, arch, cpu_model: cpuModel, cpu_cores: cpuCores, ram_gb: ramGb, hw_tier: hwTier };
}

function detectSoftware() {
  const nodeVersion = process.version;
  const claudeCodeVersion = (tryExec('claude --version') || '').split('\n')[0] || null;
  const vscodeInstalled = !!tryExec('command -v code') || fs.existsSync('/Applications/Visual Studio Code.app');
  const ollamaInstalled = !!tryExec('command -v ollama');
  const ollamaModels = ollamaInstalled ? (tryExec('ollama list') || '').split('\n').slice(1).filter(Boolean).map((l) => l.split(/\s+/)[0]) : [];
  return {
    node_version: nodeVersion,
    claude_code_version: claudeCodeVersion,
    vscode_installed: vscodeInstalled,
    ollama_installed: ollamaInstalled,
    ollama_models: ollamaModels,
  };
}

async function promptSubscriptions(rl) {
  const profiles = { anthropic: 'none', openai: 'none', gemini: 'none', ollama: 'none' };

  const hasMax = await ask(rl, '  Do you have Claude Max (unlimited)? [y/N]: ');
  if (isYes(hasMax)) {
    profiles.anthropic = 'max';
    console.log('    → budget_cap disabled for anthropic');
  } else {
    const hasApiKey = await ask(rl, '  Do you have an Anthropic API key (pay-per-token)? [y/N]: ');
    if (isYes(hasApiKey)) {
      profiles.anthropic = 'api-paid';
    } else {
      profiles.anthropic = 'api-free';
      console.log('    → anthropic: api-free, aggressive budget cap');
    }
  }

  const hasOpenai = await ask(rl, '  Do you have an OpenAI API key? [y/N]: ');
  if (isYes(hasOpenai)) profiles.openai = 'api-paid';

  const hasGemini = await ask(rl, '  Do you have Gemini API access? [y/N]: ');
  if (isYes(hasGemini)) profiles.gemini = 'api-paid';

  if (tryExec('command -v ollama')) profiles.ollama = 'installed';

  return profiles;
}

async function promptBudget(rl) {
  console.log('');
  console.log('Budget ceiling — optional, controls hard caps on paid-API usage.');
  const ceiling = await ask(rl, '  Monthly ceiling in USD (press Enter for auto/unlimited): ');
  if (!ceiling) return { strategy: 'auto', monthly_ceiling_usd: null, currency: 'USD' };

  const num = parseFloat(ceiling);
  if (!Number.isFinite(num) || num < 0) {
    console.log('    → invalid value, defaulting to auto');
    return { strategy: 'auto', monthly_ceiling_usd: null, currency: 'USD' };
  }
  const currency = (await ask(rl, '  Currency [USD]: ')).toUpperCase() || 'USD';
  return { strategy: 'fixed', monthly_ceiling_usd: num, currency };
}

async function main() {
  console.log('');
  console.log('mooter — device + subscription profile setup');
  console.log('');

  const hardware = detectHardware();
  const software = detectSoftware();
  console.log(`  Detected: ${hardware.hw_tier} · ${hardware.ram_gb}GB RAM · ${hardware.cpu_cores} cores · ${hardware.platform}/${hardware.arch}`);
  console.log(`  Software: node ${software.node_version} · claude ${software.claude_code_version || 'n/a'} · vscode ${software.vscode_installed ? 'yes' : 'no'} · ollama ${software.ollama_installed ? 'yes' : 'no'}`);
  console.log('');

  let subscriptions = { anthropic: 'unknown', openai: 'none', gemini: 'none', ollama: software.ollama_installed ? 'installed' : 'none' };
  let budget = { strategy: 'auto', monthly_ceiling_usd: null, currency: 'USD' };

  if (!NON_INTERACTIVE) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    subscriptions = await promptSubscriptions(rl);
    budget = await promptBudget(rl);
    rl.close();
  } else {
    if (fs.existsSync(SUB_PROFILE_PATH) && !FORCE) {
      try {
        const existing = JSON.parse(fs.readFileSync(SUB_PROFILE_PATH, 'utf8'));
        if (existing.profiles) subscriptions = { ...subscriptions, ...existing.profiles };
      } catch { /* ignore */ }
    }
    console.log('  (non-interactive mode: subscriptions preserved from existing profile, budget=auto)');
  }

  // Normalize subscription labels for cohort consistency across the hub:
  // legacy runs wrote "claude_max", current writes "max" — collapse to "max".
  if (subscriptions.anthropic === 'claude_max') subscriptions.anthropic = 'max';

  const subProfile = {
    updated_at: new Date().toISOString(),
    profiles: subscriptions,
    budget_strategy: budget.strategy,
    notes: NON_INTERACTIVE ? 'updated by setup-profile.js --non-interactive' : 'interactive setup',
  };
  fs.writeFileSync(SUB_PROFILE_PATH, JSON.stringify(subProfile, null, 2) + '\n');

  const deviceProfile = {
    version: '1.0',
    updated_at: new Date().toISOString(),
    device_id: require('./identity').readDeviceId(),
    hardware,
    software,
    subscriptions,
    budget,
  };
  fs.writeFileSync(DEVICE_PROFILE_PATH, JSON.stringify(deviceProfile, null, 2) + '\n');

  console.log('');
  console.log(`Subscription profile: ${SUB_PROFILE_PATH}`);
  console.log(`Device profile:       ${DEVICE_PROFILE_PATH}`);
  console.log('');
  console.log('mooter is now aware of your hardware, software, subscriptions, and budget.');
  console.log('');
}

main().catch((err) => {
  console.error('setup-profile error:', err.message);
  process.exit(1);
});
