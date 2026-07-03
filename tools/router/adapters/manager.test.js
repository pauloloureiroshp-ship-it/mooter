'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const mgr = require('./index.js');
const { MAX_PER_WINDOW } = require('./debounce.js');

// async-aware: awaits the (possibly async) body so MOOTER_HOME + the tmpdir survive until
// every await inside the test has resolved. A sync withHome would restore/delete mid-flight.
async function withHome(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pmadapt-mgr-'));
  const prev = process.env.MOOTER_HOME;
  process.env.MOOTER_HOME = dir;
  try { return await fn(dir); }
  finally {
    if (prev === undefined) delete process.env.MOOTER_HOME; else process.env.MOOTER_HOME = prev;
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
  }
}

const EVENT = { kind: 'outcome', ts: 1720000000000, agent: 'gsd-executor', tier: 'T3', gate: 'pass', idem_key: 'k1', sid: 's1' };

test('ZERO-BY-DEFAULT: with nothing enabled, the core is inert', async () => {
  await withHome(async () => {
    assert.deepEqual(mgr.emit(EVENT), []);                 // connects nothing
    assert.deepEqual(await mgr.flushDue(), []);
    assert.deepEqual(await mgr.enrich({ owner: 'o', repo: 'r', ref: 'abc' }), {});
    const s = mgr.status();
    assert.equal(s.zero_by_default, true);
    for (const t of Object.keys(s.tools)) assert.equal(s.tools[t].enabled, false);
  });
});

test('NEVER THROWS on malformed input or unknown tool', async () => {
  await withHome(async () => {
    assert.doesNotThrow(() => mgr.emit(null));
    assert.doesNotThrow(() => mgr.emit(undefined));
    const r = await mgr.flush('bogus', { force: true });
    assert.equal(r.blocked, 'not_outbound');
  });
});

test('WRITE-BACK GATE: enabled + token is NOT enough — first write needs human consent', async () => {
  await withHome(async () => {
    const sent = [];
    const transport = async (req) => { sent.push(req); return { ok: true, status: 200 }; };
    mgr.enable('notion', { database_id: 'db_1' });
    mgr.setToken('notion', 'ntn_tok');
    mgr.emit(EVENT, { now: 0 });

    const blocked = await mgr.flush('notion', { force: true, now: 0, transport });
    assert.equal(blocked.blocked, 'consent_required');
    assert.equal(sent.length, 0, 'nothing may leave the machine before consent');

    mgr.grantConsent('notion', { by: 'test' });
    const ok = await mgr.flush('notion', { force: true, now: 0, transport });
    assert.equal(ok.delivered, true);
    assert.equal(ok.count, 1);
    assert.equal(sent.length, 1);
  });
});

test('UNIDIRECTIONAL: the outbound payload carries the ledger_event_id watermark', async () => {
  await withHome(async () => {
    const sent = [];
    const transport = async (req) => { sent.push(req); return { ok: true, status: 200 }; };
    mgr.enable('notion', { database_id: 'db_1' });
    mgr.setToken('notion', 'ntn_tok');
    mgr.grantConsent('notion', { by: 'test' });
    mgr.emit({ ...EVENT, input: 'SECRET', output: 'SECRET' }, { now: 0 });
    await mgr.flush('notion', { force: true, now: 0, transport });

    assert.equal(sent.length, 1);
    assert.match(sent[0].url, /api\.notion\.com/);
    assert.match(sent[0].body, /mooter-ledger/);        // source watermark present
    assert.match(sent[0].body, /led_/);                 // ledger_event_id present
    assert.ok(!sent[0].body.includes('SECRET'), 'verbatim payload never leaves');
  });
});

test('UNIDIRECTIONAL: enrich is DISPLAY-ONLY, tagged presentation, never forecast-shaped', async () => {
  await withHome(async () => {
    // github disabled → no data
    assert.deepEqual(await mgr.enrich({ owner: 'o', repo: 'r', ref: 'abc' }), {});

    mgr.enable('github');
    const runner = async (args) => {
      if (args[0] === 'pr') return { ok: true, stdout: JSON.stringify({ number: 7, state: 'OPEN', url: 'u' }) };
      if (args[0] === 'api') return { ok: true, stdout: JSON.stringify({ state: 'success', total: 3 }) };
      return { ok: false, stdout: '' };
    };
    const out = await mgr.enrich({ owner: 'o', repo: 'r', ref: 'abc', prNumber: 7 }, { deps: { runner } });
    assert.equal(out.github._kind, 'presentation');     // tagged so it can never be mistaken for forecast input
    assert.equal(out.github.pr.number, 7);
    assert.equal(out.github.ci.state, 'success');
    // there is NO forecast-writing method on the manager surface
    assert.equal(typeof mgr.emit, 'function');
    assert.ok(!('writeForecast' in mgr) && !('toForecast' in mgr));
  });
});

test('KILL-SWITCH: once tripped, emit refuses the tool (loop protection)', async () => {
  await withHome(async () => {
    mgr.enable('notion', { database_id: 'db_1' });
    for (let i = 0; i <= MAX_PER_WINDOW; i++) mgr.emit({ ...EVENT, idem_key: 'k' + i }, { now: 0 });
    const after = mgr.emit({ ...EVENT, idem_key: 'kEND' }, { now: 0 });
    assert.equal(after[0].blocked, 'killswitch');
    // and flush of a tripped tool is blocked
    const f = await mgr.flush('notion', { force: true, now: 0 });
    assert.equal(f.blocked, 'killswitch');
    // human reset re-opens it
    mgr.resetKillswitch('notion');
    assert.equal(mgr.emit(EVENT, { now: 0 })[0].queued, true);
  });
});

test('enrich degrades to {} when the runner throws (best-effort)', async () => {
  await withHome(async () => {
    mgr.enable('github');
    const runner = async () => { throw new Error('gh exploded'); };
    assert.deepEqual(await mgr.enrich({ owner: 'o', repo: 'r', ref: 'abc' }, { deps: { runner } }), {});
  });
});
