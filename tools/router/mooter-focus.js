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

// ── Live Status (reads tester history to show per-pillar progress) ──
function showStatus(cfg) {
  // Read tester history for focus area stats
  const historyPath = path.join(__dirname, 'mooter-tester-history.jsonl');
  let events = [];
  try {
    events = require('fs').readFileSync(historyPath, 'utf8')
      .split('\n').filter(Boolean).map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
  } catch { /* no history yet */ }

  // Count per-focus-area from classification events
  const areaStats = {};
  const areaLast = {};
  for (const e of events) {
    if (e.event === 'tester_classification' && e.focus_area) {
      if (!areaStats[e.focus_area]) areaStats[e.focus_area] = { prompts: 0, chains: 0, misroutings: 0 };
      areaStats[e.focus_area].prompts++;
      if (e.chain_position) areaStats[e.focus_area].chains++;
      areaLast[e.focus_area] = e.ts;
    }
    if (e.event === 'tester_misrouting' && e.focus_area) {
      if (!areaStats[e.focus_area]) areaStats[e.focus_area] = { prompts: 0, chains: 0, misroutings: 0 };
      areaStats[e.focus_area].misroutings++;
    }
  }

  // Also count autopilot
  for (const e of events) {
    if (e.event === 'tester_classification' && e.prompt_source === 'autopilot') {
      if (!areaStats['autopilot']) areaStats['autopilot'] = { prompts: 0, chains: 0, misroutings: 0 };
      areaStats['autopilot'].prompts++;
    }
  }

  // Total events and time range
  const totalClassifications = events.filter(e => e.event === 'tester_classification').length;
  const first = events[0]?.ts?.slice(0, 16) || 'n/a';
  const last = events[events.length - 1]?.ts?.slice(0, 16) || 'n/a';

  const areas = (cfg.focus_areas || []).filter(a => a.enabled !== false);
  const totalWeight = areas.reduce((s, a) => s + (a.weight || 0), 0);
  const primary = areas.reduce((best, a) => (a.weight || 0) > (best.weight || 0) ? a : best, areas[0]);
  const isPrimary = primary && primary.weight / totalWeight > 0.5;

  console.log(`
╔══════════════════════════════════════════════════════════════════╗
║  🐮 MOOTER PILLAR STATUS — All Dimensions Live                  ║
╚══════════════════════════════════════════════════════════════════╝

  ${isPrimary ? '🎯 PRIMARY: ' + primary.name : '🔄 Mode: Balanced (autopilot active)'}
  Data range: ${first} → ${last}
  Total classifications: ${totalClassifications}
`);

  // Show each pillar with real data
  for (const a of areas) {
    const icon = a.icon || '●';
    const pct = totalWeight > 0 ? Math.round((a.weight || 0) / totalWeight * 100) : 0;
    const stats = areaStats[a.id] || { prompts: 0, chains: 0, misroutings: 0 };
    const lastSeen = areaLast[a.id] ? areaLast[a.id].slice(11, 16) : '—';
    const issues = (a.known_issues || []).length;
    const skills = (a.skills || []).length;
    const verifyCount = (a.verify || []).length;
    const improveCount = (a.improve || []).length;

    const bar = '█'.repeat(Math.min(20, Math.round(stats.prompts / 5))) + '░'.repeat(Math.max(0, 20 - Math.round(stats.prompts / 5)));
    const marker = isPrimary && a === primary ? ' ◀' : '';

    console.log(`  ${icon} ${a.id.padEnd(14)} ${bar} ${String(stats.prompts).padStart(4)}p ${String(stats.chains).padStart(2)}ch ${String(stats.misroutings).padStart(2)}mis │ ${skills}sk ${verifyCount}vf ${improveCount}im │ ${lastSeen}${marker}`);
  }

  // Autopilot line
  const apStats = areaStats['autopilot'] || { prompts: 0, chains: 0, misroutings: 0 };
  if (apStats.prompts > 0) {
    const apBar = '█'.repeat(Math.min(20, Math.round(apStats.prompts / 5))) + '░'.repeat(Math.max(0, 20 - Math.round(apStats.prompts / 5)));
    console.log(`  🤖 autopilot      ${apBar} ${String(apStats.prompts).padStart(4)}p                │ 6sk         │`);
  }

  console.log(`
  Legend: p=prompts ch=chains mis=misroutings sk=skills vf=verify im=improve

  Commands:
    /mooter-focus <pillar>    Set primary focus (70/30 split)
    /mooter-focus reset       Balanced + autopilot
    /mooter-focus list        Full pillar catalog
    /mooter-review            See delta findings + recommendations
`);
}

// ── Main ─────────────────────────────────────────────────────────────
const cfg = loadConfig();
const cmd = process.argv[2];

if (!cmd) {
  showCurrent(cfg);
} else if (cmd === 'status' || cmd === 'dashboard') {
  showStatus(cfg);
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
