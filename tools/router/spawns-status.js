#!/usr/bin/env node
/**
 * spawns-status.js — Wave 33.5 Block B.5.
 *
 * Opt-in line-3 chip: `🐝 N spawns active · $X total` from the spawn records
 * under ~/.mooter/spawns/<id>/state.json. Read-only, no subprocess. Mirrors
 * @mooter/spawn-orchestrator chip.ts. `hidden_chips: ["spawns"]` drops it.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

function spawnsRoot() {
  const home = process.env.MOOTER_HOME || os.homedir();
  return process.env.MOOTER_HOME ? path.join(home, 'spawns') : path.join(home, '.mooter', 'spawns');
}

function hidden() {
  try {
    const prefs = JSON.parse(fs.readFileSync(path.join(os.homedir(), '.mooter', 'preferences.json'), 'utf8'));
    return Array.isArray(prefs.hidden_chips) && prefs.hidden_chips.includes('spawns');
  } catch {
    return false;
  }
}

function summary() {
  let ids;
  try {
    ids = fs.readdirSync(spawnsRoot());
  } catch {
    return { active: 0, cost: 0 };
  }
  let active = 0;
  let cost = 0;
  for (const id of ids) {
    try {
      const r = JSON.parse(fs.readFileSync(path.join(spawnsRoot(), id, 'state.json'), 'utf8'));
      if (r.status === 'running' || r.status === 'sandboxed') active++;
      if (Number.isFinite(r.estCostUsd)) cost += Number(r.estCostUsd);
    } catch {
      /* skip a malformed record */
    }
  }
  return { active, cost };
}

function statusLine() {
  if (hidden()) return '';
  const { active, cost } = summary();
  if (active === 0) return '';
  const c = cost > 0 ? ` · $${cost.toFixed(2)} total` : '';
  return `🐝 ${active} spawn${active === 1 ? '' : 's'} active${c}`;
}

module.exports = { summary, statusLine };

if (require.main === module) {
  const out = statusLine();
  if (out) process.stdout.write(out + '\n');
}
