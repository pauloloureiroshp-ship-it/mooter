'use strict';
// mc-snapshot.test.js — Frente 0 · Foundation.
// Proves the MissionControlSnapshot contract (schema §6): full shape, EVERY field nullable,
// ZERO fabrication (missing → null, never 0/guess), honest per-session git from the journal,
// and GPU/remote/sync read from cache files (n/d when absent).

const { test, before, after } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const mc = require('./mc-snapshot.js');

let HOME, CACHE;
before(() => {
  HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'mooter-mcsnap-'));
  CACHE = path.join(HOME, 'cache');
  fs.mkdirSync(CACHE, { recursive: true });
  process.env.MOOTER_HOME = HOME;
});
after(() => { try { fs.rmSync(HOME, { recursive: true, force: true }); } catch {} delete process.env.MOOTER_HOME; });

// A fully-populated session row and a sparse one (to prove nullable honesty).
function fakeExtra(rows) {
  return {
    recentSessions: async () => rows,
    deviceProfile: () => ({ os: 'win32', id: 'dev-abc' }),
  };
}

const RICH = {
  fullId: 'sess-rich-0001', id: 'sess-ric', name: 'Build mc-snapshot', project: 'frugal',
  model: 'claude-opus-4-8', tokIn: 1200, tokOut: 800, ctxTokens: 100000, tokPerSec: 42,
  cost: 0.12, saved: 0.30, working: true, needsYou: false, auto: true, loop: false,
  mode: 'moo', coworkTitle: 'MC Foundation', worktree: 'frugal-front-0',
  branch: 'feat/mc-foundation',
  sessionGit: { branch: 'feat/mc-foundation', sha: 'abc1234', source: 'journal' },
  gitStage: { state: 'ahead', dirty: 2, staged: 1, ahead: 3, behind: 0 },
  notionPageId: 'pg1', notionSyncedAt: '2026-06-28T10:00:00Z',
  obsidianPath: '/vault/mc.md', obsidianSyncedAt: '2026-06-28T10:01:00Z',
};

const SPARSE = {
  fullId: 'sess-sparse-2', name: 'Unknown model session', project: 'other',
  model: 'some-unknown-model', // tier must be null (not guessed)
  // no tokens, no cost, no git, no sync → all must be null
};

test('buildSnapshot produces the full schema §6 shape', async () => {
  const s = await mc.buildSnapshot('/x/frugal-front-0', {
    extra: fakeExtra([RICH, SPARSE]), cacheDir: CACHE, now: 999,
    loopActive: false, pctLocal: 73,
  });
  // top-level keys
  for (const k of ['at', 'project', 'device', 'scope', 'sessions', 'loops', 'gpu', 'remote', 'sync', 'totals']) {
    assert.ok(k in s, 'missing top-level key: ' + k);
  }
  assert.equal(s.at, 999);
  assert.equal(s.project, 'frugal-front-0');
  assert.deepEqual(s.device, { os: 'win32', id: 'dev-abc' });
  assert.deepEqual(s.scope.architecture, []);
  assert.equal(s.sessions.length, 2);
});

test('rich session maps every field honestly (incl. per-session git from journal)', async () => {
  const s = await mc.buildSnapshot('/x/frugal', { extra: fakeExtra([RICH]), cacheDir: CACHE });
  const r = s.sessions[0];
  assert.equal(r.sid, 'sess-rich-0001');
  assert.equal(r.name, 'Build mc-snapshot');
  assert.equal(r.topic, 'MC Foundation');
  assert.equal(r.tier, 'T3'); // opus
  assert.equal(r.tokIn, 1200);
  assert.equal(r.tokOut, 800);
  assert.equal(r.ctxPct, 50); // 100000 / 200000
  assert.equal(r.status, 'working');
  assert.equal(r.tokPerSec, 42);
  assert.equal(r.cost, 0.12);
  assert.equal(r.saved, 0.30);
  // honest per-session git: branch+sha from sessionGit, dirty/ahead/pushNeeded from gitStage
  assert.equal(r.git.branch, 'feat/mc-foundation');
  assert.equal(r.git.sha, 'abc1234');
  assert.equal(r.git.dirty, 2);
  assert.equal(r.git.ahead, 3);
  assert.equal(r.git.pushNeeded, true);
  assert.deepEqual(r.sync.notion, { pageId: 'pg1', at: '2026-06-28T10:00:00Z' });
  assert.deepEqual(r.sync.obsidian, { path: '/vault/mc.md', at: '2026-06-28T10:01:00Z' });
  assert.equal(r.worktree, 'frugal-front-0');
  assert.equal(r.device, null); // local
});

test('sparse session NEVER fabricates: missing → null, unknown model → tier null', async () => {
  const s = await mc.buildSnapshot('/x/other', { extra: fakeExtra([SPARSE]), cacheDir: CACHE });
  const r = s.sessions[0];
  assert.equal(r.tier, null); // not guessed
  assert.equal(r.tokIn, null); // NOT 0
  assert.equal(r.tokOut, null);
  assert.equal(r.ctxPct, null);
  assert.equal(r.tokPerSec, null);
  assert.equal(r.cost, null);
  assert.equal(r.saved, null);
  assert.equal(r.git.branch, null);
  assert.equal(r.git.sha, null);
  assert.equal(r.git.dirty, null);
  assert.equal(r.git.pushNeeded, null); // unknown, not false
  assert.equal(r.sync.notion, null);
  assert.equal(r.sync.obsidian, null);
});

test('totals count honestly across sessions', async () => {
  const s = await mc.buildSnapshot('/x', { extra: fakeExtra([RICH, SPARSE]), cacheDir: CACHE, pctLocal: 73 });
  assert.equal(s.totals.commitsPending, 1); // only RICH has dirty>0
  assert.equal(s.totals.pushPending, 1); // only RICH ahead>0
  assert.equal(s.totals.needYou, 0);
  assert.equal(s.totals.savedToday, 0.30);
  assert.equal(s.totals.tokensToday, 2000); // RICH 1200+800; SPARSE contributes null
  assert.equal(s.totals.pctLocal, 73);
});

test('scope groups sessions by project with honest status', async () => {
  const s = await mc.buildSnapshot('/x', { extra: fakeExtra([RICH, SPARSE]), cacheDir: CACHE });
  const frugal = s.scope.projects.find((p) => p.name === 'frugal');
  const other = s.scope.projects.find((p) => p.name === 'other');
  assert.equal(frugal.status, 'active'); // RICH is working
  assert.equal(frugal.sessions, 1);
  assert.equal(other.status, 'idle');
});

test('gpu/remote/sync are null when no cache file (n/d), populated when present', async () => {
  // absent → null
  let s = await mc.buildSnapshot('/x', { extra: fakeExtra([]), cacheDir: CACHE });
  assert.equal(s.gpu, null);
  assert.equal(s.remote, null);
  // write a gpu cache file → read through
  fs.writeFileSync(path.join(CACHE, 'gpu-snapshot.json'), JSON.stringify({ totalMb: 24000, freeMb: 20000, fitsMoos: 3 }));
  s = await mc.buildSnapshot('/x', { extra: fakeExtra([]), cacheDir: CACHE });
  assert.equal(s.gpu.totalMb, 24000);
  assert.equal(s.gpu.fitsMoos, 3);
  // a cache file holding literal null → stays null (fail-soft writer)
  fs.writeFileSync(path.join(CACHE, 'gpu-snapshot.json'), 'null');
  s = await mc.buildSnapshot('/x', { extra: fakeExtra([]), cacheDir: CACHE });
  assert.equal(s.gpu, null);
});

test('loops: empty without state; single honest entry when loopActive', async () => {
  let s = await mc.buildSnapshot('/x', { extra: fakeExtra([]), cacheDir: CACHE, loopActive: false });
  assert.deepEqual(s.loops, []);
  s = await mc.buildSnapshot('/x', { extra: fakeExtra([]), cacheDir: CACHE, loopActive: true });
  assert.equal(s.loops.length, 1);
  assert.equal(s.loops[0].active, true);
  assert.equal(s.loops[0].round, null); // no STATE → null, not fabricated
  s = await mc.buildSnapshot('/x', {
    extra: fakeExtra([]), cacheDir: CACHE, loopActive: true,
    loopState: { id: 'rev', kind: 'review', round: 2, maxRounds: 5, model: 'qwen3:30b' },
  });
  assert.equal(s.loops[0].round, 2);
  assert.equal(s.loops[0].maxRounds, 5);
  assert.equal(s.loops[0].kind, 'review');
});

test('modelTier maps the ladder and refuses the unknown', () => {
  assert.equal(mc.modelTier('claude-opus-4-8'), 'T3');
  assert.equal(mc.modelTier('claude-sonnet-4-6'), 'T2');
  assert.equal(mc.modelTier('claude-haiku-4-5'), 'T1');
  assert.equal(mc.modelTier('claude-fable-5'), 'T5');
  assert.equal(mc.modelTier('qwen3:30b'), 'T0');
  assert.equal(mc.modelTier('mystery'), null);
  assert.equal(mc.modelTier(null), null);
});

test('ctxPct uses 1M window for [1m] models', () => {
  assert.equal(mc.ctxPct(100000, 'claude-opus-4-8'), 50);
  assert.equal(mc.ctxPct(100000, 'claude-opus-4-8[1m]'), 10);
  assert.equal(mc.ctxPct(null, 'x'), null);
});
