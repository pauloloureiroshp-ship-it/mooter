#!/usr/bin/env node
// register-hooks.js — called by install.sh / install.ps1 to idempotently
// merge mooter hooks into ~/.claude/settings.json without clobbering user
// hooks.
//
// Usage: node register-hooks.js <settings.json> <routerDir> <hooksDir>

const fs = require('fs');

const [, , settingsPath, routerDir, hooksDir] = process.argv;

if (!settingsPath || !routerDir || !hooksDir) {
  console.error('usage: register-hooks.js <settings.json> <routerDir> <hooksDir>');
  process.exit(2);
}

if (!fs.existsSync(settingsPath)) {
  console.error(`settings.json not found at ${settingsPath}`);
  process.exit(3);
}

const fwd = (p) => p.replace(/\\/g, '/');
const routerFwd = fwd(routerDir);
const hooksFwd = fwd(hooksDir);

const s = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
s.hooks = s.hooks || {};

let added = 0;

const ensure = (key, needle, command) => {
  s.hooks[key] = s.hooks[key] || [];
  if (JSON.stringify(s.hooks[key]).includes(needle)) return;
  s.hooks[key].push({ hooks: [{ type: 'command', command, timeout: 3 }] });
  added++;
};

ensure('UserPromptSubmit', 'inject_context.js', `node "${routerFwd}/inject_context.js"`);

// Kill Frugal W3: migrate any legacy frugal-turn-header entry in place, then
// ensure the canonical mooter-turn-header hook exists.
for (const entry of (s.hooks.UserPromptSubmit || [])) {
  for (const h of (entry.hooks || [])) {
    if (h.command && h.command.includes('frugal-turn-header.js')) {
      h.command = h.command.split('frugal-turn-header.js').join('mooter-turn-header.js');
      added++;
    }
  }
}
ensure('UserPromptSubmit', 'mooter-turn-header.js', `node "${hooksFwd}/mooter-turn-header.js"`);

// Wave A (Moo Packs wired): migrate any hand-installed pack-hint.js entry to
// the shipped .cjs bundle in place, then ensure the canonical hook exists.
// Anchored ([/"]pack-hint.js") so pack-hint.json / *-pack-hint.js never
// false-positive, and token-swapped so the rest of the command is preserved.
for (const entry of (s.hooks.UserPromptSubmit || [])) {
  for (const h of (entry.hooks || [])) {
    if (h.command && /[\/"]pack-hint\.js"/.test(h.command)) {
      h.command = h.command.split('pack-hint.js').join('pack-hint.cjs');
      added++;
    }
  }
}
ensure('UserPromptSubmit', 'pack-hint.cjs', `node "${hooksFwd}/pack-hint.cjs"`);
ensure('Stop', 'gsd-turn-end.js', `node "${hooksFwd}/gsd-turn-end.js"`);

// Matcher migration: existing hooks that reference exec-logger.js, PostToolUse.js
// or post_tool_badge.js with matcher "Bash" need "Bash|Agent|Task" so subagent
// spawns get tracked. Wave 21 (C1): post_tool_badge.js was MISSING from this list,
// so the herd tracker hook only ever fired after Bash and never recorded a single
// subagent spawn (the herd file was never written across 50+ spawns). Adding it
// here makes the fix reproducible on reinstall / mooter-update.
if (s.hooks.PostToolUse) {
  for (const h of s.hooks.PostToolUse) {
    if (h.matcher === 'Bash') {
      const json = JSON.stringify(h);
      if (json.includes('exec-logger.js') || json.includes('PostToolUse.js') || json.includes('post_tool_badge.js')) {
        h.matcher = 'Bash|Agent|Task';
        added++;
      }
    }
  }
}

fs.writeFileSync(settingsPath, JSON.stringify(s, null, 2));
console.log(`hooks_added=${added}`);
