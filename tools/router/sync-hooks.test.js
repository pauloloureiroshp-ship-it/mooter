'use strict';
// sync-hooks.test.js — hermetic: every test uses a temp src + temp HOME so it
// never touches the developer's real ~/.claude/hooks/. Covers the mirror
// (idempotent / backup / additive / missing-src / dry-run) and the self-check
// (accumulator present / stale hook / settings.json path resolution).

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  WIRED_HOOKS,
  ACCUMULATOR_HOOK,
  mirrorHooks,
  selfCheck,
  findWiredStopHook,
} = require('./sync-hooks.js');

// A COMPLETE wired hook: journaling (accumulateHandoff + handoff-journal) AND the v2.5 CAPTURE fix
// (journal.effectiveCwd) — the marker set the self-check now requires.
const ACCUMULATOR_BODY = 'function accumulateHandoff(){ const j = require("./handoff-journal.js"); j.effectiveCwd([], null); }';
const STALE_BODY = '// old turn-end, no journaling here';

function tmp(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

// Write the full wired-hook set into a src dir. gsd-turn-end.js gets the
// accumulator body so a downstream self-check on a mirror of it passes.
function seedSrc(dir, { staleTurnEnd = false } = {}) {
  fs.mkdirSync(dir, { recursive: true });
  for (const name of WIRED_HOOKS) {
    const body =
      name === ACCUMULATOR_HOOK ? (staleTurnEnd ? STALE_BODY : ACCUMULATOR_BODY) : `// ${name} stub`;
    fs.writeFileSync(path.join(dir, name), body);
  }
}

// ── mirrorHooks ───────────────────────────────────────────────────────────────

test('mirrors every wired hook into a fresh dest', () => {
  const src = tmp('sh-src-');
  const dest = tmp('sh-dst-');
  seedSrc(src);

  const r = mirrorHooks({ srcDir: src, destDir: dest });

  assert.deepEqual(r.copied.sort(), [...WIRED_HOOKS].sort());
  assert.equal(r.missingSrc.length, 0);
  for (const name of WIRED_HOOKS) {
    assert.ok(fs.existsSync(path.join(dest, name)), `${name} should exist in dest`);
  }
});

test('is idempotent — a second run reports identical and makes no backup', () => {
  const src = tmp('sh-src-');
  const dest = tmp('sh-dst-');
  seedSrc(src);

  mirrorHooks({ srcDir: src, destDir: dest });
  const second = mirrorHooks({ srcDir: src, destDir: dest });

  assert.equal(second.copied.length, 0);
  assert.deepEqual(second.identical.sort(), [...WIRED_HOOKS].sort());
  assert.equal(second.backedUp.length, 0);
  assert.equal(fs.existsSync(path.join(dest, ACCUMULATOR_HOOK + '.bak')), false);
});

test('backs up the stale runtime copy before overwriting (the accumulator fix)', () => {
  const src = tmp('sh-src-');
  const dest = tmp('sh-dst-');
  seedSrc(src);
  // Simulate the real bug: a stale wired copy lacking the accumulator.
  fs.mkdirSync(dest, { recursive: true });
  fs.writeFileSync(path.join(dest, ACCUMULATOR_HOOK), STALE_BODY);

  const r = mirrorHooks({ srcDir: src, destDir: dest });

  assert.ok(r.backedUp.includes(ACCUMULATOR_HOOK));
  // .bak holds the OLD stale content; the live file now has the accumulator.
  assert.equal(fs.readFileSync(path.join(dest, ACCUMULATOR_HOOK + '.bak'), 'utf8'), STALE_BODY);
  assert.equal(fs.readFileSync(path.join(dest, ACCUMULATOR_HOOK), 'utf8'), ACCUMULATOR_BODY);
});

test('is additive — leaves unrelated files in dest untouched', () => {
  const src = tmp('sh-src-');
  const dest = tmp('sh-dst-');
  seedSrc(src);
  fs.mkdirSync(dest, { recursive: true });
  const unrelated = path.join(dest, 'my-custom-hook.js');
  fs.writeFileSync(unrelated, 'keep me');

  mirrorHooks({ srcDir: src, destDir: dest });

  assert.equal(fs.existsSync(unrelated), true);
  assert.equal(fs.readFileSync(unrelated, 'utf8'), 'keep me');
});

test('reports missing source hooks without throwing', () => {
  const src = tmp('sh-src-');
  const dest = tmp('sh-dst-');
  fs.mkdirSync(src, { recursive: true });
  // Only seed the accumulator hook; the rest are absent from src.
  fs.writeFileSync(path.join(src, ACCUMULATOR_HOOK), ACCUMULATOR_BODY);

  const r = mirrorHooks({ srcDir: src, destDir: dest });

  assert.deepEqual(r.copied, [ACCUMULATOR_HOOK]);
  assert.ok(r.missingSrc.includes('exec-logger.js'));
  assert.equal(r.missingSrc.length, WIRED_HOOKS.length - 1);
});

test('dry-run writes nothing', () => {
  const src = tmp('sh-src-');
  const dest = tmp('sh-dst-');
  seedSrc(src);

  const r = mirrorHooks({ srcDir: src, destDir: dest, dryRun: true });

  assert.deepEqual(r.copied.sort(), [...WIRED_HOOKS].sort());
  for (const name of WIRED_HOOKS) {
    assert.equal(fs.existsSync(path.join(dest, name)), false, `${name} must not be written`);
  }
});

// ── selfCheck ─────────────────────────────────────────────────────────────────

test('self-check passes when the wired Stop hook has the accumulator', () => {
  const home = tmp('sh-home-');
  const hooks = path.join(home, '.claude', 'hooks');
  fs.mkdirSync(hooks, { recursive: true });
  fs.writeFileSync(path.join(hooks, ACCUMULATOR_HOOK), ACCUMULATOR_BODY);

  const c = selfCheck({ home });

  assert.equal(c.hasAccumulator, true);
  assert.equal(c.missingMarkers.length, 0);
});

test('self-check FAILS (and lists missing markers) on a stale hook', () => {
  const home = tmp('sh-home-');
  const hooks = path.join(home, '.claude', 'hooks');
  fs.mkdirSync(hooks, { recursive: true });
  fs.writeFileSync(path.join(hooks, ACCUMULATOR_HOOK), STALE_BODY);

  const c = selfCheck({ home });

  assert.equal(c.hasAccumulator, false);
  assert.ok(c.missingMarkers.includes('accumulateHandoff'));
  assert.ok(c.missingMarkers.includes('handoff-journal'));
});

test('self-check reports file-not-found when the wired hook is absent', () => {
  const home = tmp('sh-home-');
  const c = selfCheck({ home });
  assert.equal(c.exists, false);
  assert.equal(c.hasAccumulator, false);
});

test('self-check resolves the wired path from settings.json (spaces in path)', () => {
  const home = tmp('sh-home-');
  const claude = path.join(home, '.claude');
  fs.mkdirSync(claude, { recursive: true });
  // A custom wired location with a space in the path, like the real machine.
  const wiredDir = path.join(home, 'My Hooks');
  fs.mkdirSync(wiredDir, { recursive: true });
  const wired = path.join(wiredDir, ACCUMULATOR_HOOK);
  fs.writeFileSync(wired, ACCUMULATOR_BODY);

  const settingsPath = path.join(claude, 'settings.json');
  fs.writeFileSync(
    settingsPath,
    JSON.stringify({
      hooks: { Stop: [{ hooks: [{ type: 'command', command: `node "${wired}"` }] }] },
    }),
  );

  assert.equal(findWiredStopHook(settingsPath), wired);
  const c = selfCheck({ home, settingsPath });
  assert.equal(c.hookPath, wired);
  assert.equal(c.hasAccumulator, true);
});

test('findWiredStopHook returns null on unparseable settings.json', () => {
  const home = tmp('sh-home-');
  const settingsPath = path.join(home, 'settings.json');
  fs.writeFileSync(settingsPath, '{ not json');
  assert.equal(findWiredStopHook(settingsPath), null);
});
