#!/usr/bin/env node
/**
 * frugal-mode.js — CLI to set / get / clear the active frugal mode.
 *
 * Modes:
 *   beast  — Force T3 (Opus) on every prompt. GSD, full power, cost is irrelevant.
 *   zen    — Cap at T1 (Haiku/Ollama). Max savings. Good for end-of-month crunch.
 *   auto   — Clear any active mode. Router decides normally (default behaviour).
 *
 * Usage:
 *   node frugal-mode.js beast      → activates beast mode
 *   node frugal-mode.js zen        → activates zen mode
 *   node frugal-mode.js auto       → clears mode (back to auto routing)
 *   node frugal-mode.js            → shows current mode
 *   node frugal-mode.js --read     → returns JSON {mode, active_since}
 *
 * The active mode is persisted in ~/.claude/tools/router/.frugal-mode.json
 * inject_context.js reads this file on every hook invocation and overrides
 * the router tier decision accordingly.
 *
 * Design principles:
 *  - Zero dependencies (Node built-ins only)
 *  - Never throws — errors are logged to stderr, exit 0
 *  - Any write failure leaves previous mode untouched
 *  - Mode survives Claude Code restarts (file-based persistence)
 */

'use strict';

const path = require('path');
const fs   = require('fs');
const os   = require('os');

const ROUTER_DIR  = path.join(os.homedir(), '.claude', 'tools', 'router');
const MODE_FILE_NEW = path.join(ROUTER_DIR, '.mooter-mode.json');
const MODE_FILE_OLD = path.join(ROUTER_DIR, '.frugal-mode.json');
// Write to new; read from new with fallback to old (legacy migration).
const MODE_FILE = MODE_FILE_NEW;

const VALID_MODES = ['beast', 'zen', 'auto'];

const MODE_META = {
  beast: {
    emoji:    '🦁',
    label:    'Beast Mode',
    desc:     'T3 (Opus) forced on all prompts. Speed > cost. GSD.',
    tier_min: 'T3',
    tier_max: null,   // no ceiling — already forced to max
  },
  zen: {
    emoji:    '🧘',
    label:    'Zen Mode',
    desc:     'Capped at T1 (Haiku/Ollama). Max savings. Every token counts.',
    tier_min: null,   // no floor
    tier_max: 'T1',
  },
  auto: {
    emoji:    '⚡',
    label:    'Auto (router decides)',
    desc:     'Normal intelligent routing. Minimum cost for each task.',
    tier_min: null,
    tier_max: null,
  },
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function readMode() {
  try {
    // Prefer new file; fall back to legacy .frugal-mode.json
    const file = fs.existsSync(MODE_FILE_NEW) ? MODE_FILE_NEW
               : fs.existsSync(MODE_FILE_OLD) ? MODE_FILE_OLD
               : null;
    if (!file) return null;
    const raw = fs.readFileSync(file, 'utf8');
    const data = JSON.parse(raw);
    if (!data.mode || !VALID_MODES.includes(data.mode) || data.mode === 'auto') return null;
    return data;
  } catch {
    return null;
  }
}

function writeMode(mode) {
  const data = mode === 'auto'
    ? null
    : { mode, active_since: new Date().toISOString(), version: '1.0' };

  try {
    if (data === null) {
      if (fs.existsSync(MODE_FILE_NEW)) fs.unlinkSync(MODE_FILE_NEW);
      if (fs.existsSync(MODE_FILE_OLD)) fs.unlinkSync(MODE_FILE_OLD);
    } else {
      if (!fs.existsSync(ROUTER_DIR)) fs.mkdirSync(ROUTER_DIR, { recursive: true });
      fs.writeFileSync(MODE_FILE, JSON.stringify(data, null, 2), 'utf8');
    }
    return true;
  } catch (e) {
    process.stderr.write(`frugal-mode: write error — ${e.message}\n`);
    return false;
  }
}

function formatDuration(isoString) {
  const ms = Date.now() - new Date(isoString).getTime();
  const minutes = Math.floor(ms / 60000);
  const hours   = Math.floor(minutes / 60);
  if (hours > 0) return `${hours}h ${minutes % 60}min`;
  if (minutes > 0) return `${minutes}min`;
  return 'menos de 1 min';
}

// ── CLI ───────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);

// --read flag → used by inject_context.js for machine-readable output
if (args[0] === '--read') {
  const current = readMode();
  console.log(JSON.stringify(current || { mode: 'auto', active: false }));
  process.exit(0);
}

// No args → show current mode
if (args.length === 0) {
  const current = readMode();
  if (!current) {
    console.log('⚡ frugal — modo actual: Auto (router inteligente activo)');
    console.log('   Sem modo forçado. O router decide o tier mínimo viável para cada prompt.');
    console.log('');
    console.log('   /frugal-beast  →  força Opus em tudo (velocidade máxima)');
    console.log('   /frugal-zen    →  caps em Haiku/Ollama (poupança máxima)');
  } else {
    const meta = MODE_META[current.mode];
    console.log(`${meta.emoji} frugal — modo actual: ${meta.label}`);
    console.log(`   ${meta.desc}`);
    console.log(`   Activo há: ${formatDuration(current.active_since)}`);
    console.log('');
    console.log('   /frugal-auto   →  volta ao routing inteligente');
  }
  process.exit(0);
}

// Set mode
const requestedMode = args[0].toLowerCase().replace(/^frugal-/, '');

if (!VALID_MODES.includes(requestedMode)) {
  process.stderr.write(`frugal-mode: modo desconhecido "${args[0]}". Use: beast | zen | auto\n`);
  process.exit(1);
}

const meta    = MODE_META[requestedMode];
const success = writeMode(requestedMode);

if (!success) {
  process.stderr.write('frugal-mode: falhou ao escrever modo. Verifica permissões em ~/.claude/tools/router/\n');
  process.exit(1);
}

if (requestedMode === 'auto') {
  console.log('⚡ frugal — Auto mode activado');
  console.log('   Router inteligente voltou ao controlo. Tier mínimo viável por prompt.');
} else {
  console.log(`${meta.emoji} frugal — ${meta.label} activado!`);
  console.log(`   ${meta.desc}`);
  if (meta.tier_min) console.log(`   Tier mínimo forçado: ${meta.tier_min}`);
  if (meta.tier_max) console.log(`   Tier máximo: ${meta.tier_max}`);
  console.log('');
  console.log('   Usa /frugal-auto para voltar ao routing inteligente.');
}

process.exit(0);
