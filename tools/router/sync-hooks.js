#!/usr/bin/env node
'use strict';
/*
 * sync-hooks.js — mirror the WIRED ~/.claude/hooks/ copies during /mooter-update.
 *
 * Root cause this module exists to kill (proven in _handoff/accumulator-diag.json):
 *   settings.json wires the Stop hook at ~/.claude/hooks/gsd-turn-end.js, but
 *   /mooter-update only globbed tools/router/*.js → ~/.claude/tools/router/. The
 *   wired hooks copy was last touched by install.sh and never re-synced, so when
 *   the Live Context Accumulator (accumulateHandoff) shipped in the canonical
 *   hook, the WIRED copy never gained it → 63 sessions, 0 journals, silently.
 *
 * This restores the mirror + a post-sync self-check so the accumulator can never
 * silently die again. Cross-OS (pure Node: macOS + Windows identical). Idempotent
 * (skips identical files). Additive (never deletes). Safe (.bak before overwrite).
 *
 * Usage:
 *   node sync-hooks.js                 mirror wired hooks + self-check
 *   node sync-hooks.js --check         self-check only (no copy)
 *   node sync-hooks.js --dry-run       show what would change, write nothing
 *   node sync-hooks.js --src <dir>     override the canonical source dir
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

// The hooks settings.json wires under ~/.claude/hooks/. The canonical source for
// each is tools/router/<name>; install.sh copies this exact list. Kept in lockstep
// with install.sh so a fresh install and an update converge on the same files.
const WIRED_HOOKS = [
  'gsd-statusline.js',
  'gsd-turn-end.js',
  'mooter-turn-header.js',
  'frugal-turn-header.js',
  'exec-logger.js',
  'PostToolUse.js',
  // Live Preview · MP0 — the file-bus tap. Wired next to the existing hooks
  // (UserPromptSubmit/PostToolUse/Stop/SubagentStop) by register-hooks.js; this
  // entry keeps its WIRED ~/.claude/hooks/ copy fresh on every /mooter-update so
  // the tap can never go stale the way the accumulator hook once did. ADDITIVE,
  // read-only, fail-soft — a missing copy just means no events, never a broken turn.
  'live-preview-tap.js',
  // Os dois ficheiros que decidem QUE MOTOR fica escrito no execution.log. Nao
  // estavam em nenhum dos tres canais de distribuicao: o `exec-logger.js` e o
  // `PostToolUse.js` fazem `require('./_model-resolver')`, que em CommonJS
  // resolve para ~/.claude/hooks/ — e o install.sh so os copiava para
  // ~/.claude/tools/router/, onde ninguem os requer. Resultado medido: uma copia
  // ANTIGA vivia em ~/.claude/hooks/ desde uma colocacao nao gerida, e nenhum
  // `/mooter-update` lhe tocava. E a mesma falha do acumulador ('63 sessoes, 0
  // journals'), agora a fabricar 96% das linhas de motor.
  '_model-resolver.js',
  '_model-resolver-core.js',
];

// The Stop hook that carries the Live Context Accumulator. If the WIRED copy of
// this file lacks these markers, turn-end journaling dies silently. `effectiveCwd`
// is the Perfect Handoff v2.5 CAPTURE fix — its presence proves the wired hook
// records the REAL worktree (not the CC launch dir); a stale copy without it would
// silently re-introduce the worktree-crossing lie, so the self-check flags it.
// `accumulateTurnIO` is the Ledger Spine intent/outcome pair (2026-08-01): the
// canonical hook derives both from the transcript, and a wired copy without it
// goes back to a journal that knows a turn happened but not what was asked or
// delivered — the exact silence this file exists to make loud.
const ACCUMULATOR_HOOK = 'gsd-turn-end.js';
const ACCUMULATOR_MARKERS = ['accumulateHandoff', 'handoff-journal', 'effectiveCwd', 'agent-sync-ledger', 'accumulateTurnIO'];

function homeDir() {
  return process.env.HOME || process.env.USERPROFILE || os.homedir();
}

// Resolve the canonical repo source dir for the hook files.
// Precedence: explicit --src → $HOME/frugal/tools/router (the /mooter-update skill
// convention) → this script's own dir (the runtime router copy, already glob-synced).
function resolveSrcDir(explicit) {
  if (explicit && fs.existsSync(explicit)) return explicit;
  const conventional = path.join(homeDir(), 'frugal', 'tools', 'router');
  if (fs.existsSync(conventional)) return conventional;
  return __dirname;
}

function hooksDir(home) {
  return path.join(home || homeDir(), '.claude', 'hooks');
}

// Mirror the wired hooks from src → ~/.claude/hooks/.
// Idempotent (skips identical), additive (never deletes), safe (.bak backup).
function mirrorHooks({ srcDir, destDir, dryRun = false } = {}) {
  const src = srcDir || resolveSrcDir();
  const dest = destDir || hooksDir();
  const result = {
    srcDir: src,
    destDir: dest,
    copied: [],
    identical: [],
    backedUp: [],
    missingSrc: [],
  };

  if (!dryRun) fs.mkdirSync(dest, { recursive: true });

  for (const name of WIRED_HOOKS) {
    const s = path.join(src, name);
    if (!fs.existsSync(s)) {
      result.missingSrc.push(name);
      continue;
    }
    const d = path.join(dest, name);
    const srcBuf = fs.readFileSync(s);

    if (fs.existsSync(d)) {
      const dstBuf = fs.readFileSync(d);
      if (srcBuf.equals(dstBuf)) {
        result.identical.push(name);
        continue;
      }
      if (!dryRun) {
        fs.copyFileSync(d, d + '.bak'); // back up the runtime copy before overwriting
        result.backedUp.push(name);
      }
    }

    if (!dryRun) fs.writeFileSync(d, srcBuf);
    result.copied.push(name);
  }

  return result;
}

// Extract the WIRED Stop hook path straight from settings.json (handles quoted
// paths with spaces, e.g. "C:/Users/Paulo Loureiro/.claude/hooks/gsd-turn-end.js").
function findWiredStopHook(settingsPath) {
  try {
    const s = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
    const entries = (s.hooks && s.hooks.Stop) || [];
    for (const entry of entries) {
      for (const h of entry.hooks || []) {
        const m = h.command && h.command.match(/"([^"]+gsd-turn-end\.js)"|(\S+gsd-turn-end\.js)/);
        if (m) return m[1] || m[2];
      }
    }
  } catch {
    /* fall through to caller's default */
  }
  return null;
}

// Self-check: confirm the WIRED Stop hook actually contains the accumulator.
// Reads the real wired path from settings.json when possible; otherwise falls
// back to the canonical ~/.claude/hooks/gsd-turn-end.js.
function selfCheck({ settingsPath, home } = {}) {
  const h = home || homeDir();
  const sp = settingsPath || path.join(h, '.claude', 'settings.json');
  const wiredPath = findWiredStopHook(sp) || path.join(hooksDir(h), ACCUMULATOR_HOOK);
  const out = { hookPath: wiredPath, exists: false, hasAccumulator: false, missingMarkers: [] };

  if (!fs.existsSync(wiredPath)) {
    out.missingMarkers = ACCUMULATOR_MARKERS.slice();
    return out;
  }
  out.exists = true;
  const body = fs.readFileSync(wiredPath, 'utf8');
  out.missingMarkers = ACCUMULATOR_MARKERS.filter((m) => !body.includes(m));
  out.hasAccumulator = out.missingMarkers.length === 0;
  return out;
}

module.exports = {
  WIRED_HOOKS,
  ACCUMULATOR_HOOK,
  ACCUMULATOR_MARKERS,
  mirrorHooks,
  selfCheck,
  findWiredStopHook,
  resolveSrcDir,
  hooksDir,
};

if (require.main === module) {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const checkOnly = args.includes('--check');
  const srcIdx = args.indexOf('--src');
  const explicitSrc = srcIdx >= 0 ? args[srcIdx + 1] : null;

  if (!checkOnly) {
    const r = mirrorHooks({ srcDir: resolveSrcDir(explicitSrc), dryRun });
    const tag = dryRun ? ' (dry-run)' : '';
    console.log(`hooks mirror${tag}: ${r.srcDir} -> ${r.destDir}`);
    if (r.copied.length) console.log(`  + synced: ${r.copied.join(', ')}`);
    if (r.identical.length) console.log(`  . identical: ${r.identical.join(', ')}`);
    if (r.backedUp.length) console.log(`  ~ backed up (.bak): ${r.backedUp.join(', ')}`);
    if (r.missingSrc.length) console.log(`  ! source missing (skipped): ${r.missingSrc.join(', ')}`);
  }

  const c = selfCheck({});
  if (c.hasAccumulator) {
    console.log(`  OK self-check: wired Stop hook has the accumulator -> ${c.hookPath}`);
    process.exitCode = 0;
  } else {
    console.error('');
    console.error('WARNING: Stop hook ligado NAO tem o acumulador - re-sincroniza.');
    console.error(`  wired hook: ${c.hookPath}`);
    console.error(`  ${c.exists ? 'missing markers: ' + c.missingMarkers.join(', ') : 'file not found'}`);
    console.error('  fix: node ~/.claude/tools/router/sync-hooks.js');
    process.exitCode = 1;
  }
}
