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

const ensureScoped = (key, needle, command, matcher) => {
  s.hooks[key] = s.hooks[key] || [];
  if (JSON.stringify(s.hooks[key]).includes(needle)) return;
  s.hooks[key].push({ matcher, hooks: [{ type: 'command', command, timeout: 3 }] });
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
      // Anchored swap mirrors the guard above so only the boundary-delimited
      // token migrates (a path that merely contains "pack-hint.js" elsewhere
      // is left intact).
      h.command = h.command.replace(/([\/"])pack-hint\.js"/g, '$1pack-hint.cjs"');
      added++;
    }
  }
}
ensure('UserPromptSubmit', 'pack-hint.cjs', `node "${hooksFwd}/pack-hint.cjs"`);
ensure('Stop', 'gsd-turn-end.js', `node "${hooksFwd}/gsd-turn-end.js"`);

// Perfect Handoff Gate 5 — serialize conductor-sensitive Bash operations.
// PreToolUse propagates exit 2 on a live conflict; both post paths release the
// acquired lock. The bridge delegates lock semantics to worktree-conductor.
const conductorGuard = `node "${hooksFwd}/conductor-git-guard.js"`;
ensureScoped('PreToolUse', 'conductor-git-guard.js', conductorGuard, 'Bash');
ensureScoped('PostToolUse', 'conductor-git-guard.js', `${conductorGuard} --release`, 'Bash');
ensureScoped('PostToolUseFailure', 'conductor-git-guard.js', `${conductorGuard} --release`, 'Bash');

// Live Preview · MP0 — arm the file-bus tap alongside the existing hooks. Each
// entry passes the hook name as argv so hook-collector.mapEvent maps it to the
// right event kind (UserPromptSubmit→reason, PostToolUse→file, Stop/SubagentStop→
// server). ADDITIVE, read-only, fail-soft: the tap never blocks a turn and a
// missing collector just yields no events. Idempotent — skips if the target hook
// array already references the tap (needle checked per-key, so all 4 wire once).
const tapCmd = (evt) => `node "${hooksFwd}/live-preview-tap.js" ${evt}`;
const ensureTap = (key, entry) => {
  s.hooks[key] = s.hooks[key] || [];
  if (JSON.stringify(s.hooks[key]).includes('live-preview-tap.js')) return;
  s.hooks[key].push(entry);
  added++;
};
ensureTap('UserPromptSubmit', { hooks: [{ type: 'command', command: tapCmd('UserPromptSubmit'), timeout: 3 }] });
// Matcher scopes the extra node spawn to edit-family tools; the collector also
// filters to Write|Edit internally, so an unmatched tool is a no-op either way.
ensureTap('PostToolUse', { matcher: 'Write|Edit|MultiEdit|NotebookEdit', hooks: [{ type: 'command', command: tapCmd('PostToolUse'), timeout: 3 }] });
ensureTap('Stop', { hooks: [{ type: 'command', command: tapCmd('Stop'), timeout: 3 }] });
ensureTap('SubagentStop', { hooks: [{ type: 'command', command: tapCmd('SubagentStop'), timeout: 3 }] });

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
