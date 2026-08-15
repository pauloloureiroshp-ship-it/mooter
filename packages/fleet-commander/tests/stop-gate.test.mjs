// stop-gate.test.mjs — Fleet Commander · the pre-dispatch gate. Run: node --test
//
// The suite exists to prove the three properties the strategy asks for, mechanically:
//   ① the kill-switch FAILS CLOSED (the only way a kill-switch is real);
//   ② VRAM is never fabricated — a Mac reports n/d, an unreadable NVIDIA box blocks;
//   ③ one pilar per GPU, with the orphan REPORTED and never stolen.
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  readStop, vramVerdict, defaultVramProbe, createDispatchGate,
  MIN_VRAM_HEADROOM_GIB, STOP_PATH_DEFAULT,
} from "../src/stop-gate.mjs";
import { createLeaseManager } from "../src/lease.mjs";

// ── helpers ────────────────────────────────────────────────────────────────
const err = (code) => { const e = new Error(code); e.code = code; return e; };
const fileWith = (text) => () => text;
const fileThrowing = (code) => () => { throw err(code); };
const noFile = fileThrowing("ENOENT");

const A = { sessionId: "pilarA", loopId: "P4" };
const B = { sessionId: "pilarB", loopId: "P1" };

// ── ① STOP ─────────────────────────────────────────────────────────────────

test("readStop: no stop file → the loop runs (the normal case)", () => {
  const r = readStop({ readFile: noFile });
  assert.equal(r.stopped, false);
  assert.match(r.reason, /no stop file/);
});

test("readStop: {stop:true} halts, and carries the human's reason through", () => {
  const r = readStop({ readFile: fileWith('{"stop":true,"by":"paulo","reason":"vou usar a GPU"}') });
  assert.equal(r.stopped, true);
  assert.match(r.reason, /vou usar a GPU/);
  assert.equal(r.by, "paulo");
});

test("readStop: {stop:false} is an explicit resume — a leftover file must not halt the fleet forever", () => {
  const r = readStop({ readFile: fileWith('{"stop":false}') });
  assert.equal(r.stopped, false);
});

test("readStop: malformed JSON FAILS CLOSED", () => {
  const r = readStop({ readFile: fileWith("{not json") });
  assert.equal(r.stopped, true);
  assert.match(r.reason, /malformed/);
});

test("readStop: a file with no boolean `stop` key FAILS CLOSED", () => {
  for (const body of ['{"halt":true}', '{"stop":"yes"}', "[]", "null"]) {
    const r = readStop({ readFile: fileWith(body) });
    assert.equal(r.stopped, true, `expected fail-closed for ${body}`);
  }
});

test("readStop: unreadable file (EACCES) FAILS CLOSED — we cannot prove we were not stopped", () => {
  const r = readStop({ readFile: fileThrowing("EACCES") });
  assert.equal(r.stopped, true);
  assert.match(r.reason, /unreadable/);
});

test("readStop: a scoped stop halts only its own pilar", () => {
  const body = '{"stop":true,"scope":"pilar:P4"}';
  assert.equal(readStop({ readFile: fileWith(body), pilar: "P4" }).stopped, true);
  assert.equal(readStop({ readFile: fileWith(body), pilar: "P1" }).stopped, false);
  // No pilar declared → we cannot claim the stop is not ours.
  assert.equal(readStop({ readFile: fileWith(body) }).stopped, true);
});

test("readStop: an unrecognised scope FAILS CLOSED — an intent we cannot parse is still an intent", () => {
  const r = readStop({ readFile: fileWith('{"stop":true,"scope":"gpu-de-cima"}') });
  assert.equal(r.stopped, true);
  assert.match(r.reason, /unrecognised scope/);
});

test("STOP_PATH_DEFAULT lives outside the repo — killing the fleet never requires a commit", () => {
  assert.match(STOP_PATH_DEFAULT, /\.mooter[/\\]stop\.json$/);
});

// ── ② VRAM ─────────────────────────────────────────────────────────────────

test("vramVerdict: measured headroom above the floor passes, below the floor blocks", () => {
  assert.equal(vramVerdict({ kind: "nvidia", freeGiB: 8 }).state, "ok");
  const low = vramVerdict({ kind: "nvidia", freeGiB: 1.5 });
  assert.equal(low.state, "blocked");
  assert.match(low.why, /1\.5 GiB < 2\.2 GiB/);
  // Exactly at the floor is enough — the invariant is "≥".
  assert.equal(vramVerdict({ kind: "nvidia", freeGiB: MIN_VRAM_HEADROOM_GIB }).state, "ok");
});

test("vramVerdict: a discrete GPU we cannot measure BLOCKS (fail closed), never passes", () => {
  const r = vramVerdict({ kind: "nvidia", freeGiB: null, error: "nvidia-smi exit 9" });
  assert.equal(r.state, "blocked");
  assert.equal(r.freeGiB, null);
});

test("vramVerdict: unified memory is n/d — never a fabricated `ok`", () => {
  const r = vramVerdict({ kind: "unified" });
  assert.equal(r.state, "n/d");
  assert.equal(r.freeGiB, null);
  assert.match(r.why, /unificada/);
  // The honesty invariant, stated as an assertion: a Mac must never report `ok`.
  assert.notEqual(r.state, "ok");
});

test("defaultVramProbe: no nvidia-smi on darwin → unified; multi-GPU takes the TIGHTEST card", () => {
  const missing = () => ({ error: err("ENOENT") });
  assert.equal(defaultVramProbe({ run: missing, os: "darwin" }).kind, "unified");
  assert.equal(defaultVramProbe({ run: missing, os: "linux" }).kind, "unknown");

  const twoCards = () => ({ status: 0, stdout: "20480\n3072\n" });
  const p = defaultVramProbe({ run: twoCards, os: "linux" });
  assert.equal(p.kind, "nvidia");
  assert.equal(Math.round(p.freeGiB * 100) / 100, 3); // 3072 MiB — the least free card wins
});

// ── ③ the composite gate ───────────────────────────────────────────────────

const okProbe = () => ({ kind: "nvidia", freeGiB: 10 });

test("gate: allows, takes the GPU lease once, then RENEWS it — a long loop never orphans itself", () => {
  const leases = createLeaseManager();
  const g = createDispatchGate({ readFile: noFile, probe: okProbe, leases, owner: A });

  const first = g.check();
  assert.equal(first.allow, true);
  assert.equal(first.checks.gpu.acquired, true);

  const second = g.check();
  assert.equal(second.allow, true);
  assert.equal(second.checks.gpu.renewed, true);
  assert.equal(leases.holder("gpu:local").sessionId, "pilarA");

  g.release();
  assert.equal(leases.holder("gpu:local"), null);
});

test("gate: STOP denies AND releases the GPU — a halted pilar never holds the card hostage", () => {
  const leases = createLeaseManager();
  let stopped = false;
  const readFile = () => { if (!stopped) throw err("ENOENT"); return '{"stop":true}'; };
  const g = createDispatchGate({ readFile, probe: okProbe, leases, owner: A });

  assert.equal(g.check().allow, true);
  assert.equal(leases.holder("gpu:local").sessionId, "pilarA");

  stopped = true;
  const denied = g.check();
  assert.equal(denied.allow, false);
  assert.equal(denied.gate, "stop");
  assert.equal(leases.holder("gpu:local"), null, "the GPU must be free the moment we stop");
});

test("gate: the STOP is re-read on EVERY dispatch, not cached at boot", () => {
  let reads = 0;
  const readFile = () => { reads += 1; throw err("ENOENT"); };
  const g = createDispatchGate({ readFile, probe: okProbe, owner: A });
  g.check(); g.check(); g.check();
  assert.equal(reads, 3, "a kill-switch read once cannot kill a loop that is already running");
});

test("gate: VRAM below the floor denies before any work is dispatched", () => {
  const g = createDispatchGate({ readFile: noFile, probe: () => ({ kind: "nvidia", freeGiB: 1 }), owner: A });
  const r = g.check();
  assert.equal(r.allow, false);
  assert.equal(r.gate, "vram");
  assert.match(r.denyReason, /VRAM/);
});

test("gate: one pilar per GPU — the second pilar is refused, not queued behind a stolen lease", () => {
  const leases = createLeaseManager();
  const first = createDispatchGate({ readFile: noFile, probe: okProbe, leases, owner: A });
  const second = createDispatchGate({ readFile: noFile, probe: okProbe, leases, owner: B });

  assert.equal(first.check().allow, true);
  const r = second.check();
  assert.equal(r.allow, false);
  assert.equal(r.gate, "gpu-mutex");
  assert.match(r.denyReason, /pilar activo/);
});

test("gate: an ORPHAN lease is reported and refused — never stolen", () => {
  let t = 0;
  const leases = createLeaseManager({ now: () => t });
  leases.acquire(["gpu:local"], A);
  t = 10 * 60 * 1000; // long past the stale threshold

  const second = createDispatchGate({ readFile: noFile, probe: okProbe, leases, owner: B });
  const r = second.check();
  assert.equal(r.allow, false);
  assert.equal(r.gate, "gpu-mutex");
  assert.match(r.denyReason, /ÓRFÃ/);
  assert.equal(leases.holder("gpu:local").sessionId, "pilarA", "the orphan must still be there — reported, not reaped");
});

test("receipt: reports only what was measured — unified memory travels as n/d, never as a number", () => {
  const g = createDispatchGate({
    readFile: noFile, probe: () => ({ kind: "unified" }), owner: A, pilar: "P5", device: "mac-mini",
  });
  assert.equal(g.check().allow, true, "a Mac must still be allowed to work");

  const rec = g.receipt();
  assert.equal(rec.kind, "gate-receipt");
  assert.equal(rec.dispatches_gated, 1);
  assert.equal(rec.vram.state, "n/d");
  assert.equal(rec.vram.free_gib, "n/d");
  assert.equal(rec.pilar, "P5");
  assert.equal(rec.device, "mac-mini");
  assert.equal(JSON.stringify(rec).includes("undefined"), false);
});

test("receipt: with no check yet, every measured field is n/d — never an optimistic default", () => {
  const rec = createDispatchGate({ readFile: noFile, probe: okProbe, owner: A }).receipt();
  assert.equal(rec.stop, "n/d");
  assert.equal(rec.vram, "n/d");
  assert.equal(rec.dispatches_gated, 0);
});
