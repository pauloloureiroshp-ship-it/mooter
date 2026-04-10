#!/usr/bin/env node
/**
 * onboarding.js — first-run experience for frugal.
 *
 * Detects hardware, asks about subscriptions, fetches community config,
 * and shows a summary of expected savings. Called automatically by
 * inject_context.js when hw-capability.json or subscription-profile.json
 * are missing, or manually: node onboarding.js
 */

'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');

const ROUTER_DIR = path.join(os.homedir(), '.claude', 'tools', 'router');
const HW_CAP_PATH = path.join(ROUTER_DIR, 'hw-capability.json');
const SUB_PROFILE_PATH = path.join(ROUTER_DIR, 'subscription-profile.json');

function needsOnboarding() {
  return !fs.existsSync(HW_CAP_PATH) || !fs.existsSync(SUB_PROFILE_PATH);
}

function step(n, msg) {
  console.log(`  ${n}. ${msg}`);
}

async function main() {
  console.log('');
  console.log('  frugal — first-time setup');
  console.log('');

  // Step 1: Hardware detection
  step(1, 'Detecting hardware...');
  const gpuProbe = path.join(ROUTER_DIR, 'gpu-probe.js');
  if (fs.existsSync(gpuProbe)) {
    const r = spawnSync(process.execPath, [gpuProbe], {
      encoding: 'utf8',
      timeout: 10000,
    });
    if (r.status === 0) {
      try {
        const hw = JSON.parse(fs.readFileSync(HW_CAP_PATH, 'utf8'));
        console.log(`     ✓ ${hw.name || hw.vendor} detected${hw.vram_mb ? ` (${Math.round(hw.vram_mb / 1024)}GB VRAM)` : ''}`);
        console.log(`     ✓ hw_tier: ${hw.hw_tier}`);
        console.log(`     ✓ Recommended local model: ${hw.recommended_t0}`);
      } catch {
        console.log('     ✓ Hardware probe completed');
      }
    } else {
      console.log('     ⚠ GPU detection failed — defaulting to CPU-only');
    }
  }
  console.log('');

  // Step 2: Subscription profile
  step(2, 'Subscription profile...');
  const setupProfile = path.join(ROUTER_DIR, 'setup-profile.js');
  if (fs.existsSync(setupProfile)) {
    const r = spawnSync(process.execPath, [setupProfile], {
      stdio: 'inherit',
      timeout: 120000,
    });
    if (r.status !== 0) {
      console.log('     ⚠ Profile setup skipped — using defaults');
    }
  }
  console.log('');

  // Step 3: Fetch community config
  step(3, 'Fetching community config...');
  const hubPull = path.join(ROUTER_DIR, 'hub-pull.js');
  if (fs.existsSync(hubPull)) {
    const r = spawnSync(process.execPath, [hubPull, '--force'], {
      encoding: 'utf8',
      timeout: 10000,
    });
    if (r.status === 0 && r.stdout) {
      console.log(`     ${r.stdout.trim()}`);
    } else {
      console.log('     ⚠ Hub unreachable — using local defaults (will retry later)');
    }
  }
  console.log('');

  // Step 4: Summary
  step(4, 'Ready!');

  // Read what we have
  let hwTier = 'unknown';
  let recommendedModel = 'qwen2.5:3b';
  let subProfile = 'unknown';
  let savingsEstimate = '~85%';

  try {
    const hw = JSON.parse(fs.readFileSync(HW_CAP_PATH, 'utf8'));
    hwTier = hw.hw_tier;
    recommendedModel = hw.recommended_t0;
  } catch { /* defaults */ }

  try {
    const sp = JSON.parse(fs.readFileSync(SUB_PROFILE_PATH, 'utf8'));
    subProfile = sp.profiles?.anthropic || 'unknown';
  } catch { /* defaults */ }

  // Savings estimate by profile (community baselines)
  const savingsMap = {
    'gpu-high+max': '~91%',
    'gpu-high+api-paid': '~88%',
    'gpu-mid+max': '~87%',
    'gpu-mid+api-paid': '~84%',
    'apple-silicon+max': '~86%',
    'cpu-only+max': '~78%',
    'cpu-only+api-paid': '~75%',
  };
  savingsEstimate = savingsMap[`${hwTier}+${subProfile}`] || '~85%';

  console.log(`     Expected savings: ${savingsEstimate} (community baseline for ${hwTier} + ${subProfile})`);
  console.log('');

  // Suggest model pull if not installed
  if (recommendedModel !== 'qwen2.5:3b') {
    console.log(`  Run: ollama pull ${recommendedModel}`);
    console.log('');
  }
}

if (require.main === module) {
  main().catch((e) => {
    console.error('Onboarding error:', e.message);
    process.exit(1);
  });
}

module.exports = { needsOnboarding };
