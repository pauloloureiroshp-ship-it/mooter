#!/usr/bin/env node
// autopilot-install.js — install/uninstall mooter-autopilot as a Stop hook.
//
// The Stop hook runs after every Claude Code turn. With autopilot wired,
// mooter checks subscription usage + recommendation at turn end and flips
// .mooter-mode.json automatically if needed (1h hysteresis).
//
// Usage:
//   node tools/router/autopilot-install.js          → install
//   node tools/router/autopilot-install.js --remove → uninstall
//   node tools/router/autopilot-install.js --status → show current wiring

'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

const SETTINGS_FILE = path.join(os.homedir(), '.claude', 'settings.json');
const AUTOPILOT_CMD = `node "${path.join(os.homedir(), '.claude', 'tools', 'router', 'mooter-autopilot.js').replace(/\\/g, '/')}" 2>/dev/null`;
const HOOK_MARKER = 'mooter-autopilot'; // substring used to identify our hook

const DIM = '\x1b[2m';
const BOLD = '\x1b[1m';
const RESET = '\x1b[0m';
const GREEN = '\x1b[38;2;50;220;120m';
const DANGER = '\x1b[38;2;227;70;70m';
const BRAND = '\x1b[38;2;194;95;101m';
const WARN = '\x1b[38;2;220;220;170m';

function loadSettings() {
  if (!fs.existsSync(SETTINGS_FILE)) {
    throw new Error(`settings.json not found at ${SETTINGS_FILE}`);
  }
  return JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8'));
}

function saveSettings(s, backup) {
  if (backup) {
    const bak = SETTINGS_FILE + `.bak-autopilot-${Date.now()}`;
    fs.copyFileSync(SETTINGS_FILE, bak);
    console.log(`  ${DIM}backup:${RESET} ${bak}`);
  }
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(s, null, 2) + '\n');
}

function findAutopilotHook(s) {
  const stop = s.hooks && s.hooks.Stop;
  if (!Array.isArray(stop)) return { group: -1, hook: -1 };
  for (let i = 0; i < stop.length; i++) {
    const hooks = stop[i] && stop[i].hooks;
    if (!Array.isArray(hooks)) continue;
    for (let j = 0; j < hooks.length; j++) {
      if (hooks[j] && hooks[j].command && hooks[j].command.includes(HOOK_MARKER)) {
        return { group: i, hook: j };
      }
    }
  }
  return { group: -1, hook: -1 };
}

function showStatus() {
  let s;
  try { s = loadSettings(); }
  catch (e) { console.log(`${DANGER}${e.message}${RESET}`); process.exit(1); }
  const found = findAutopilotHook(s);
  console.log(`\n${BRAND}${BOLD}🐮 autopilot hook status${RESET}`);
  if (found.hook >= 0) {
    console.log(`  ${GREEN}✓ installed${RESET}`);
    console.log(`  Stop hook group ${found.group}, slot ${found.hook}`);
    console.log(`  command: ${DIM}${s.hooks.Stop[found.group].hooks[found.hook].command}${RESET}\n`);
  } else {
    console.log(`  ${DIM}not installed${RESET}`);
    console.log(`  run ${BOLD}node autopilot-install.js${RESET} to enable auto-flipping\n`);
  }
}

function install() {
  console.log(`\n${BRAND}${BOLD}🐮 installing autopilot as Stop hook${RESET}\n`);
  let s;
  try { s = loadSettings(); }
  catch (e) { console.log(`${DANGER}${e.message}${RESET}`); process.exit(1); }

  const found = findAutopilotHook(s);
  if (found.hook >= 0) {
    console.log(`  ${WARN}already installed${RESET} (Stop hook group ${found.group}, slot ${found.hook})`);
    console.log(`  run ${BOLD}--remove${RESET} first to reinstall.\n`);
    return;
  }

  if (!s.hooks) s.hooks = {};
  if (!Array.isArray(s.hooks.Stop)) s.hooks.Stop = [];

  s.hooks.Stop.push({
    hooks: [{
      type: 'command',
      command: AUTOPILOT_CMD,
      timeout: 3,
    }],
  });

  saveSettings(s, true);
  console.log(`  ${GREEN}✓ installed${RESET}`);
  console.log(`  After every Claude Code turn, autopilot will check usage`);
  console.log(`  and flip .mooter-mode.json if recommendation differs.`);
  console.log(`  ${DIM}hysteresis: 60 minutes between flips${RESET}\n`);
  console.log(`  Log: ${DIM}~/.claude/tools/router/.autopilot-flips.log${RESET}`);
  console.log(`  Remove: ${BOLD}node autopilot-install.js --remove${RESET}\n`);
}

function remove() {
  console.log(`\n${BRAND}${BOLD}🐮 removing autopilot hook${RESET}\n`);
  let s;
  try { s = loadSettings(); }
  catch (e) { console.log(`${DANGER}${e.message}${RESET}`); process.exit(1); }

  const found = findAutopilotHook(s);
  if (found.hook < 0) {
    console.log(`  ${DIM}nothing to remove — autopilot hook not installed.${RESET}\n`);
    return;
  }

  const group = s.hooks.Stop[found.group];
  group.hooks.splice(found.hook, 1);
  if (group.hooks.length === 0) {
    s.hooks.Stop.splice(found.group, 1);
  }
  if (s.hooks.Stop.length === 0) delete s.hooks.Stop;

  saveSettings(s, true);
  console.log(`  ${GREEN}✓ removed${RESET}`);
  console.log(`  autopilot no longer runs automatically. You can still invoke`);
  console.log(`  it manually: ${BOLD}node tools/router/mooter-autopilot.js${RESET}\n`);
}

if (require.main === module) {
  const args = process.argv.slice(2);
  if (args.includes('--status')) { showStatus(); process.exit(0); }
  if (args.includes('--remove') || args.includes('--uninstall')) { remove(); process.exit(0); }
  install();
}
