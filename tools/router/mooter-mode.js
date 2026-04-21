#!/usr/bin/env node
/**
 * mooter-mode.js — CLI to set / get / clear the active mooter mode.
 *
 * Modes:
 *   beast  — Force T3 (Opus) on every prompt. GSD, full power, cost is irrelevant.
 *   zen    — Cap at T1 (Haiku/Ollama). Max savings.
 *   auto   — Clear any active mode. Router decides normally (default behaviour).
 *
 * Usage:
 *   node mooter-mode.js beast      → activates beast mode
 *   node mooter-mode.js zen        → activates zen mode
 *   node mooter-mode.js auto       → clears mode (back to auto routing)
 *   node mooter-mode.js            → shows current mode
 *   node mooter-mode.js --read     → returns JSON {mode, active_since}
 *
 * The active mode is persisted in ~/.claude/tools/router/.mooter-mode.json
 * (legacy .frugal-mode.json is still read as fallback for seamless migration).
 * inject_context.js reads this file on every hook invocation and overrides
 * the router tier decision accordingly.
 */

'use strict';

const path = require('path');
const fs   = require('fs');
const os   = require('os');

const ROUTER_DIR    = path.join(os.homedir(), '.claude', 'tools', 'router');
const MODE_FILE_NEW = path.join(ROUTER_DIR, '.mooter-mode.json');
const MODE_FILE_OLD = path.join(ROUTER_DIR, '.frugal-mode.json');
const MODE_FILE     = MODE_FILE_NEW;

const VALID_MODES = ['beast', 'zen', 'auto'];

const MODE_META = {
  beast: {
    emoji:    '🦁',
    label:    'Beast Mode',
    desc:     'T3 (Opus) forced on all prompts. Speed > cost. GSD.',
    tier_min: 'T3',
    tier_max: null,
  },
  zen: {
    emoji:    '🧘',
    label:    'Zen Mode',
    desc:     'Capped at T1 (Haiku/Ollama). Max savings. Every token counts.',
    tier_min: null,
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

function readMode() {
  try {
    const file = fs.existsSync(MODE_FILE_NEW) ? MODE_FILE_NEW
               : fs.existsSync(MODE_FILE_OLD) ? MODE_FILE_OLD
               : null;
    if (!file) return null;
    const raw = fs.readFileSync(file, 'utf8');
    const data = JSON.parse(raw);
    // Union schema: prefer `mode` string, fall back to legacy flags written by
    // mooter-autopilot.js before v1.1. See AUDIT-MOOTER-2026-04-19 finding F5.1.
    let mode = null;
    if (data.mode && VALID_MODES.includes(data.mode) && data.mode !== 'auto') mode = data.mode;
    else if (data.beast_mode === true) mode = 'beast';
    else if (data.zen_mode === true)   mode = 'zen';
    if (!mode) return null;
    return Object.assign({}, data, { mode });
  } catch {
    return null;
  }
}

function writeMode(mode) {
  // Preserve feature flags written by mooter-autopilot.js if the file already exists.
  // Union schema (v1.1) emits both `mode` string and `beast_mode`/`zen_mode` flags
  // so readers with either expectation stay in sync — see AUDIT-MOOTER-2026-04-19
  // finding F5.1 (schema fork).
  let cur = null;
  try {
    const f = fs.existsSync(MODE_FILE_NEW) ? MODE_FILE_NEW
            : fs.existsSync(MODE_FILE_OLD) ? MODE_FILE_OLD
            : null;
    if (f) cur = JSON.parse(fs.readFileSync(f, 'utf8'));
  } catch { cur = null; }
  if (!cur || typeof cur !== 'object') cur = {};

  const data = mode === 'auto'
    ? null
    : Object.assign({}, cur, {
        mode,
        beast_mode:   mode === 'beast',
        zen_mode:     mode === 'zen',
        active_since: new Date().toISOString(),
        version:      '1.1',
      });

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
    process.stderr.write(`mooter-mode: write error — ${e.message}\n`);
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

const args = process.argv.slice(2);

if (args[0] === '--read') {
  const current = readMode();
  console.log(JSON.stringify(current || { mode: 'auto', active: false }));
  process.exit(0);
}

if (args.length === 0) {
  const current = readMode();
  if (!current) {
    console.log('⚡ mooter — modo actual: Auto (router inteligente activo)');
    console.log('   Sem modo forçado. O router decide o tier mínimo viável para cada prompt.');
    console.log('');
    console.log('   /mooter-beast  →  força Opus em tudo (velocidade máxima)');
    console.log('   /mooter-zen    →  caps em Haiku/Ollama (poupança máxima)');
  } else {
    const meta = MODE_META[current.mode];
    console.log(`${meta.emoji} mooter — modo actual: ${meta.label}`);
    console.log(`   ${meta.desc}`);
    console.log(`   Activo há: ${formatDuration(current.active_since)}`);
    console.log('');
    console.log('   /mooter-auto   →  volta ao routing inteligente');
  }
  process.exit(0);
}

const requestedMode = args[0].toLowerCase().replace(/^(mooter|frugal)-/, '');

if (!VALID_MODES.includes(requestedMode)) {
  process.stderr.write(`mooter-mode: modo desconhecido "${args[0]}". Use: beast | zen | auto\n`);
  process.exit(1);
}

const meta    = MODE_META[requestedMode];
const success = writeMode(requestedMode);

if (!success) {
  process.stderr.write('mooter-mode: falhou ao escrever modo. Verifica permissões em ~/.claude/tools/router/\n');
  process.exit(1);
}

if (requestedMode === 'auto') {
  console.log('⚡ mooter — Auto mode activado');
  console.log('   Router inteligente voltou ao controlo. Tier mínimo viável por prompt.');
} else {
  console.log(`${meta.emoji} mooter — ${meta.label} activado!`);
  console.log(`   ${meta.desc}`);
  if (meta.tier_min) console.log(`   Tier mínimo forçado: ${meta.tier_min}`);
  if (meta.tier_max) console.log(`   Tier máximo: ${meta.tier_max}`);
  console.log('');
  console.log('   Usa /mooter-auto para voltar ao routing inteligente.');
}

process.exit(0);
