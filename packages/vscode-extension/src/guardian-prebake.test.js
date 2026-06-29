// guardian-prebake.test.js — 🐮🛡️ Guardian · Fase 2 gate (headless, no GPU, no vscode).
// Proves the four contract guarantees with INJECTED deps:
//   (a) only sessions at pressure ≥ prune (ctx ≥85%) are ever pre-baked,
//   (b) it (re)generates ONLY on a semantic boundary or the min-interval — never every tick,
//   (c) the write is ATOMIC (tmp + rename),
//   (d) the pre-baked text is BYTE-IDENTICAL to what generateHandoff produces (== the
//       deterministic skeleton of the manual ⇄ Handoff button).
'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const gp = require('./guardian-prebake.js');
const extra = require('./host-extra.js');

const NOW = new Date('2026-06-29T12:00:00');
const ADV = gp._FALLBACK_ADVISOR; // deterministic; documented rungs + weighted-vote boundary

// A recording fs over real fs (into a throwaway dir) — lets us assert the tmp→rename
// sequence AND read the final bytes back.
function makeFs() {
  const ops = [];
  return {
    ops,
    mkdirSync: (...a) => { ops.push(['mkdir', a[0]]); return fs.mkdirSync(...a); },
    writeFileSync: (...a) => { ops.push(['write', a[0]]); return fs.writeFileSync(...a); },
    renameSync: (...a) => { ops.push(['rename', a[0], a[1]]); return fs.renameSync(...a); },
  };
}

function tmpDir(tag) {
  const d = path.join(os.tmpdir(), 'guardian-prebake-' + tag + '-' + process.pid + '-' + Math.floor(Math.random() * 1e6));
  fs.mkdirSync(d, { recursive: true });
  return d;
}

// A row that fills 86% of a 200k window → rung 'prune'. turns ≥12 → 'full' mode.
function fillingRow(over) {
  return Object.assign({
    fullId: 'sessAAAA', id: 'sessAAAA', name: 'wiring the prebake', branch: 'feat/guardian-f2-prebake',
    cwd: '/repo/frugal', turns: 20, model: 'claude-opus-4-8', ctxTokens: 172000,
    sessionGit: { sha: 'aaaaaaa', branch: 'feat/guardian-f2-prebake' },
    pending: { lastAssistantText: 'continuo com o gate?', lastToolActions: [] },
  }, over || {});
}

// deps WITHOUT composeHandoff → _bake uses generateHandoff (deterministic, byte-stable).
function baseDeps(over) {
  return Object.assign({
    advisor: ADV,
    generateHandoff: extra.generateHandoff,
    gitSnapshot: () => ({}),       // empty snapshot → all git facts render "—", fully deterministic
    vaultFreshness: () => null,
    readJournalLast: () => null,
    recent: [],
    now: NOW,
    store: new Map(),
    inflight: new Set(),
  }, over || {});
}

// ── (a) pressure gate ──────────────────────────────────────────────────────────
test('(a) only sessions at pressure ≥ prune are pre-baked; below-threshold is skipped', async () => {
  const dir = tmpDir('a');
  const sessions = [
    fillingRow({ fullId: 'hot', id: 'hot', ctxTokens: 172000 }),  // 86% → prune  → bake
    fillingRow({ fullId: 'warm', id: 'warm', ctxTokens: 160000 }), // 80% → mask   → skip
    fillingRow({ fullId: 'cool', id: 'cool', ctxTokens: 100000 }), // 50% → monitor→ skip
    fillingRow({ fullId: 'crit', id: 'crit', ctxTokens: 198000 }), // 99% → emergency → bake
  ];
  const rep = await gp.tickPrebake(sessions, baseDeps({ baseDir: dir }));
  const baked = rep.filter((r) => r.baked).map((r) => r.sid).sort();
  assert.deepEqual(baked, ['crit', 'hot'], 'only prune/emergency baked');
  // mask (80%) / monitor (50%) are skipped before any report entry is pushed.
  assert.ok(!rep.find((r) => r.sid === 'warm'), 'mask (80%) skipped — no report entry');
  assert.ok(!rep.find((r) => r.sid === 'cool'), 'monitor (50%) skipped — no report entry');
  assert.ok(fs.existsSync(path.join(dir, 'hot.md')), 'hot file written');
  assert.ok(!fs.existsSync(path.join(dir, 'warm.md')), 'warm file NOT written');
  assert.ok(!fs.existsSync(path.join(dir, 'cool.md')), 'cool file NOT written');
});

// ── (b) boundary / interval only — never every tick ──────────────────────────────
test('(b) re-generates only on a boundary (HEAD change) or the min-interval; holds otherwise', async () => {
  const dir = tmpDir('b');
  const store = new Map();
  const row = fillingRow();

  // tick 1: first sight → bake.
  let rep = await gp.tickPrebake([row], baseDeps({ baseDir: dir, store, now: NOW }));
  assert.equal(rep[0].baked, true);
  assert.equal(rep[0].reason, 'first');

  // tick 2: identical state, +1 min (< interval), no HEAD change → HOLD (no rebake).
  rep = await gp.tickPrebake([row], baseDeps({ baseDir: dir, store, now: new Date(NOW.getTime() + 60 * 1000) }));
  assert.equal(rep[0].baked, false, 'no boundary, within interval → hold');
  assert.equal(rep[0].reason, 'hold');

  // tick 3: a commit landed (HEAD sha changed) → boundary → rebake.
  const committed = fillingRow({ sessionGit: { sha: 'bbbbbbb', branch: 'feat/guardian-f2-prebake' } });
  rep = await gp.tickPrebake([committed], baseDeps({ baseDir: dir, store, now: new Date(NOW.getTime() + 90 * 1000) }));
  assert.equal(rep[0].baked, true, 'HEAD change → rebake');
  assert.equal(rep[0].reason, 'head_changed');

  // tick 4: no boundary but +6 min since last write (≥ 5 min) → interval catch-all rebake.
  rep = await gp.tickPrebake([committed], baseDeps({ baseDir: dir, store, now: new Date(NOW.getTime() + 90 * 1000 + 6 * 60 * 1000) }));
  assert.equal(rep[0].baked, true, 'interval elapsed → rebake');
  assert.equal(rep[0].reason, 'interval');
});

test('(b2) stage1Boundary semantic signals (category / focus change) trigger a rebake', async () => {
  const dir = tmpDir('b2');
  const store = new Map();
  const row = fillingRow({ category: 'code_generation' });
  await gp.tickPrebake([row], baseDeps({ baseDir: dir, store, now: NOW }));
  // category transition code_generation → debugging is a strong boundary (0.4) + focus change (0.3) ≥ STRONG.
  const pivoted = fillingRow({ category: 'debugging', cwd: '/repo/other' });
  const rep = await gp.tickPrebake([pivoted], baseDeps({ baseDir: dir, store, now: new Date(NOW.getTime() + 30 * 1000) }));
  assert.equal(rep[0].baked, true);
  assert.equal(rep[0].reason, 'boundary');
  assert.ok(rep[0].signals.some((s) => s.startsWith('category:')), 'category signal present');
});

// ── (c) atomic write (tmp + rename) ──────────────────────────────────────────────
test('(c) the write is atomic — a tmp file is written then renamed onto <sid>.md', async () => {
  const dir = tmpDir('c');
  const recFs = makeFs();
  const row = fillingRow();
  await gp.tickPrebake([row], baseDeps({ baseDir: dir, fs: recFs, store: new Map() }));

  const writeOp = recFs.ops.find((o) => o[0] === 'write');
  const renameOp = recFs.ops.find((o) => o[0] === 'rename');
  assert.ok(writeOp, 'a write happened');
  assert.ok(renameOp, 'a rename happened');
  assert.ok(/\.tmp-/.test(writeOp[1]), 'wrote to a .tmp- path, not the final file');
  assert.equal(recFs.ops.indexOf(writeOp) < recFs.ops.indexOf(renameOp), true, 'write precedes rename');
  assert.equal(renameOp[1], writeOp[1], 'rename source is the tmp file we wrote');
  assert.equal(renameOp[2], path.join(dir, 'sessAAAA.md'), 'rename targets <sid>.md');
  assert.ok(fs.existsSync(path.join(dir, 'sessAAAA.md')), 'final file exists');
  assert.ok(!fs.existsSync(writeOp[1]), 'no .tmp leftover after rename');
});

// ── (d) byte-comparable to generateHandoff / the manual handoff skeleton ─────────
test('(d) the pre-baked text is byte-identical to generateHandoff with the same opts', async () => {
  const dir = tmpDir('d');
  const row = fillingRow();
  const deps = baseDeps({ baseDir: dir, store: new Map() });
  await gp.tickPrebake([row], deps);

  const written = fs.readFileSync(path.join(dir, 'sessAAAA.md'), 'utf8');
  // The manual button computes: text0 = generateHandoff(row, pending, { mode, ...v3 }).
  const opts = gp.buildHandoffOpts(row, deps);
  const expected = extra.generateHandoff(row, row.pending, opts);
  assert.equal(written, expected, 'pre-baked file === manual deterministic skeleton (byte-for-byte)');
  assert.ok(written.includes('⇄ MOO HANDOFF'), 'it is a real handoff');
  assert.ok(written.includes('⇄ END HANDOFF'), 'complete handoff');
});

// ── never throws on junk input (best-effort doctrine) ────────────────────────────
test('robustness: junk/empty input never throws', async () => {
  assert.deepEqual(await gp.tickPrebake(null, baseDeps()), []);
  assert.deepEqual(await gp.tickPrebake([null, {}], baseDeps()), []); // no sid → skipped silently
  const rep = await gp.tickPrebake([fillingRow({ ctxTokens: null, ctxPct: null })], baseDeps());
  assert.equal(rep.length, 0, 'no ctx signal → rung monitor → skipped');
});
