#!/usr/bin/env node
/**
 * mooter-focus.js — Set/show/reset the tester's directed focus.
 *
 * The running tester reads focus config EVERY cycle, so changes take
 * effect immediately (next cycle, ~45s). No restart needed.
 *
 * Usage:
 *   node mooter-focus.js                          # show current focus
 *   node mooter-focus.js onboarding-ux            # set focus (70/30 split)
 *   node mooter-focus.js "improve landing page UX" # custom theme (creates area on the fly)
 *   node mooter-focus.js reset                    # return to balanced weights
 *   node mooter-focus.js list                     # list available focus areas
 *   node mooter-focus.js add security-audit "Test security patterns and vulnerabilities"
 *
 * Designed to be called by /mooter-focus skill in Claude Code.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const FOCUS_PATH = path.join(__dirname, 'mooter-tester-focus.json');

function loadConfig() {
  try {
    return JSON.parse(fs.readFileSync(FOCUS_PATH, 'utf8'));
  } catch {
    return { focus_areas: [], progressive_chains: { enabled: true, max_chain_length: 4 }, quality_tracking: { track_per_theme: true, track_per_model: true, track_best_strategies: true } };
  }
}

function saveConfig(cfg) {
  cfg._updated = new Date().toISOString().slice(0, 10);
  fs.writeFileSync(FOCUS_PATH, JSON.stringify(cfg, null, 2));
}

function showCurrent(cfg) {
  const areas = (cfg.focus_areas || []).filter(a => a.enabled !== false);
  if (areas.length === 0) {
    console.log('No focus areas configured. Tester runs in general mode.');
    return;
  }

  const totalWeight = areas.reduce((s, a) => s + (a.weight || 0), 0);
  const primary = areas.reduce((best, a) => (a.weight || 0) > (best.weight || 0) ? a : best, areas[0]);
  const isPrimary = primary.weight / totalWeight > 0.5;

  console.log(`
╔══════════════════════════════════════════════════════════════════╗
║  🎯 MOOTER FOCUS — ${isPrimary ? primary.name.padEnd(43) : 'Balanced'.padEnd(43)} ║
╚══════════════════════════════════════════════════════════════════╝
`);

  for (const a of areas) {
    const pct = totalWeight > 0 ? Math.round(a.weight / totalWeight * 100) : 0;
    const icon = a.icon || '●';
    const bar = '█'.repeat(Math.round(pct / 5)) + '░'.repeat(20 - Math.round(pct / 5));
    const marker = a === primary && isPrimary ? ' ◀ PRIMARY' : '';
    const issues = a.known_issues ? ` (${a.known_issues.length} known issues)` : '';
    console.log(`  ${icon} ${a.id.padEnd(14)} ${bar} ${String(pct + '%').padStart(4)}${marker}`);
    if (isPrimary && a === primary) {
      console.log(`    ${a.description}`);
      if (a.known_issues) {
        for (const issue of a.known_issues) {
          console.log(`    ⚠ ${issue}`);
        }
      }
    }
  }

  console.log(`\n  Chains: ${cfg.progressive_chains?.enabled ? 'ON' : 'OFF'} (every 4th cycle)`);
  console.log(`\n  Commands: /mooter-focus <pillar>  |  /mooter-focus reset  |  /mooter-focus list\n`);
}

function setFocus(cfg, targetId) {
  const areas = cfg.focus_areas || [];
  const target = areas.find(a => a.id === targetId);

  if (target) {
    // Known area: set to 70%, distribute 30% among the rest
    const others = areas.filter(a => a.id !== targetId && a.enabled !== false);
    const otherWeight = others.length > 0 ? 0.3 / others.length : 0;
    for (const a of areas) {
      if (a.id === targetId) { a.weight = 0.7; a.enabled = true; }
      else if (a.enabled !== false) a.weight = +otherWeight.toFixed(2);
    }
    saveConfig(cfg);
    console.log(`\n  🎯 Focus set: ${target.name} (70%)`);
    console.log(`  Other areas share remaining 30%.`);
    console.log(`  Takes effect on next tester cycle (~45s).\n`);
  } else {
    // Custom theme: create a new area on the fly
    const newArea = {
      id: targetId.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 30),
      name: targetId,
      weight: 0.7,
      description: targetId,
      prompt_guidance: `Generate realistic developer prompts focused on: ${targetId}. Be specific, actionable, and mix English with Portuguese (Portugal).`,
      enabled: true,
    };
    // Reduce existing weights
    const existingActive = areas.filter(a => a.enabled !== false);
    const otherWeight = existingActive.length > 0 ? 0.3 / existingActive.length : 0;
    for (const a of areas) {
      if (a.enabled !== false) a.weight = +otherWeight.toFixed(2);
    }
    areas.push(newArea);
    cfg.focus_areas = areas;
    saveConfig(cfg);
    console.log(`\n  🎯 New focus created: "${targetId}" (70%)`);
    console.log(`  ID: ${newArea.id}`);
    console.log(`  Existing areas share remaining 30%.`);
    console.log(`  Takes effect on next tester cycle (~45s).\n`);
  }
}

function resetFocus(cfg) {
  const areas = (cfg.focus_areas || []).filter(a => a.enabled !== false);
  if (areas.length === 0) {
    console.log('No areas to reset.');
    return;
  }
  const equalWeight = +(1 / areas.length).toFixed(2);
  for (const a of cfg.focus_areas) {
    if (a.enabled !== false) a.weight = equalWeight;
  }
  saveConfig(cfg);
  console.log(`\n  🔄 Focus reset to balanced (${areas.length} areas at ${Math.round(equalWeight * 100)}% each).`);
  console.log(`  Takes effect on next tester cycle (~45s).\n`);
}

function listAreas(cfg) {
  const areas = cfg.focus_areas || [];
  if (areas.length === 0) {
    console.log('No focus areas defined.');
    return;
  }
  console.log(`
╔══════════════════════════════════════════════════════════════════╗
║  🐮 MOOTER PILLARS — Project Focus Areas                        ║
╚══════════════════════════════════════════════════════════════════╝
`);
  for (const a of areas) {
    const icon = a.icon || '●';
    const status = a.enabled !== false ? 'active' : 'OFF';
    const issues = (a.known_issues || []).length;
    console.log(`  ${icon} ${a.id.padEnd(14)} ${a.name}`);
    console.log(`    ${a.description}`);
    if (issues > 0) console.log(`    ⚠ ${issues} known issue${issues > 1 ? 's' : ''}`);
    console.log('');
  }
  console.log(`  Usage: /mooter-focus <pillar-id>`);
  console.log(`  Example: /mooter-focus security`);
  console.log(`           /mooter-focus landing`);
  console.log(`           /mooter-focus statusline\n`);
}

function addArea(cfg, id, description) {
  const existing = (cfg.focus_areas || []).find(a => a.id === id);
  if (existing) {
    console.log(`Area "${id}" already exists. Use "node mooter-focus.js ${id}" to focus on it.`);
    return;
  }
  cfg.focus_areas = cfg.focus_areas || [];
  cfg.focus_areas.push({
    id,
    name: id.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
    weight: 0.1,
    description: description || id,
    prompt_guidance: `Generate realistic developer prompts focused on: ${description || id}. Be specific and actionable.`,
    enabled: true,
  });
  saveConfig(cfg);
  console.log(`\n  ✅ Added area: "${id}" (weight: 10%)`);
  console.log(`  Use: node mooter-focus.js ${id} to make it primary.\n`);
}

// ── Main ─────────────────────────────────────────────────────────────
const cfg = loadConfig();
const cmd = process.argv[2];

if (!cmd) {
  showCurrent(cfg);
} else if (cmd === 'reset') {
  resetFocus(cfg);
} else if (cmd === 'list') {
  listAreas(cfg);
} else if (cmd === 'add') {
  const id = process.argv[3];
  const desc = process.argv.slice(4).join(' ');
  if (!id) { console.log('Usage: node mooter-focus.js add <id> [description]'); process.exit(1); }
  addArea(cfg, id, desc);
} else {
  setFocus(cfg, cmd);
}
