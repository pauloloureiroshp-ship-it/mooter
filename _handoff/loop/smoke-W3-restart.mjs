#!/usr/bin/env node
/**
 * smoke-W3-restart.mjs — W3 Autopilot Loop polish · Piece 3 restart smoke.
 *
 * Proves cross-restart persistence: a brand-new Node.js subprocess (no shared
 * memory, no prior context) reads STATE.json + ledger.jsonl from disk and
 * recovers wave / round / sessionId / per-wave cost accurately.
 *
 * The "restart" is simulated by spawnSync() — a completely fresh process that
 * has never seen any variable from this parent session.
 *
 * Usage:
 *   node _handoff/loop/smoke-W3-restart.mjs
 *
 * Exits 0 when all checks pass, 1 on any failure.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── ANSI helpers ─────────────────────────────────────────────────────────────────
const G = '\x1b[32m✓\x1b[0m';
const R = '\x1b[31m✗\x1b[0m';
let failures = 0;

function check(label, got, expected, eq = (a, b) => String(a) === String(b)) {
  const ok = eq(got, expected);
  process.stdout.write(`${ok ? G : R} ${label}\n`);
  if (!ok) {
    process.stdout.write(`    got:      ${JSON.stringify(got)}\n`);
    process.stdout.write(`    expected: ${JSON.stringify(expected)}\n`);
    failures++;
  }
}

// ── 1. Build a controlled temp loop bus ──────────────────────────────────────────
// All writes happen HERE, in this parent process.
// The child process has ZERO access to these variables — it can only read the files.
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mooter-smoke-w3-'));
const loopDir = path.join(tmp, '_handoff', 'loop');
fs.mkdirSync(loopDir, { recursive: true });

const WAVE = 'W3';
const ROUND = 7;
const SESSION = 'smoke-session-01';
// W3 cost entries: 0.08 + 0.12 + 0.09 = 0.29 (W2 entry 0.05 must be excluded)
const COST_W3 = 0.08 + 0.12 + 0.09; // 0.29000000000000004 (float)

// Write STATE.json
fs.writeFileSync(path.join(loopDir, 'STATE.json'), JSON.stringify({
  loop_id: 'smoke-test-w3',
  wave: WAVE,
  title: 'Smoke test — W3 restart persistence',
  branch: 'wave-W3-loop-polish',
  status: 'cc_running',
  round: ROUND,
  sessionId: SESSION,
  maxRounds: 12,
  updated: '2026-06-23T10:00:00Z',
  lastOk: true,
}, null, 2));

// Write ledger.jsonl with mixed waves and some entries lacking `cost`
const ledgerLines = [
  { ts: '2026-06-23T08:00:00Z', wave: 'W2', round: 5, ok: true, cost: 0.05 },   // other wave → excluded
  { ts: '2026-06-23T09:10:00Z', wave: 'W3', round: 1, ok: true, cost: 0.08 },
  { ts: '2026-06-23T09:20:00Z', wave: 'W3', round: 2, ok: true, cost: 0.12 },
  { ts: '2026-06-23T09:30:00Z', wave: 'W3', round: 3, ok: true },               // no cost field
  { ts: '2026-06-23T09:40:00Z', wave: 'W3', round: 4, ok: false, cost: 0.09 },  // ok=false, cost still real
].map(e => JSON.stringify(e)).join('\n') + '\n';
fs.writeFileSync(path.join(loopDir, 'ledger.jsonl'), ledgerLines);

// ── 2. Fresh subprocess reads from disk (the "restart simulation") ────────────────
// This script is the ENTIRE "newly started service after a reboot".
// It receives only the loopDir path — zero shared memory with the parent.
const readerScript = /* js */`
'use strict';
const fs = require('fs');
const path = require('path');
const ld = process.argv[1]; // node -e 'script' ARG → argv[0]=node, argv[1]=ARG

// Read STATE
const state = JSON.parse(fs.readFileSync(path.join(ld, 'STATE.json'), 'utf8'));

// Aggregate cost from ledger for this wave
let cost = null;
const text = fs.readFileSync(path.join(ld, 'ledger.jsonl'), 'utf8');
for (const line of text.split(/\\r?\\n/)) {
  if (!line.trim()) continue;
  try {
    const e = JSON.parse(line);
    if (e.wave !== state.wave) continue;
    const c = Number(e.cost);
    if (Number.isFinite(c) && c > 0) cost = (cost || 0) + c;
  } catch {}
}

// Report what was recovered (pure disk, no prior state)
process.stdout.write(JSON.stringify({
  wave: state.wave,
  round: state.round,
  sessionId: state.sessionId,
  status: state.status,
  cost,
}));
`;

const proc = spawnSync(process.execPath, ['-e', readerScript, loopDir], { encoding: 'utf8' });

if (proc.error || proc.status !== 0) {
  process.stderr.write('Subprocess failed:\n' + (proc.error?.message || proc.stderr) + '\n');
  process.exit(1);
}

let recovered;
try {
  recovered = JSON.parse(proc.stdout);
} catch {
  process.stderr.write('Subprocess output was not valid JSON:\n' + proc.stdout + '\n');
  process.exit(1);
}

// ── 3. Verify recovery ───────────────────────────────────────────────────────────
console.log('\n[smoke-W3-restart] Cross-restart persistence — all reads from disk:\n');

check('wave recovered', recovered.wave, WAVE);
check('round recovered', recovered.round, ROUND, (a, b) => Number(a) === Number(b));
check('sessionId recovered', recovered.sessionId, SESSION);
check('status recovered', recovered.status, 'cc_running');

// Cost: float comparison with tolerance (JavaScript float arithmetic)
check(
  `per-wave cost (W3 only, W2 excluded)  got=${Number(recovered.cost).toFixed(4)} exp≈${COST_W3.toFixed(4)}`,
  recovered.cost,
  COST_W3,
  (a, b) => Math.abs(Number(a) - Number(b)) < 1e-9,
);

// ── 4. Also smoke the loop-status.js chip with MOOTER_REPO_ROOT override ─────────
// This proves the chip itself reads from disk via env-var override.
const chipPath = path.join(__dirname, '..', '..', 'tools', 'router', 'loop-status.js');
const chipScript = /* js */`
'use strict';
// node -e 'script' arg1 arg2 → argv[0]=node, argv[1]=arg1, argv[2]=arg2
process.env.MOOTER_REPO_ROOT = process.argv[1];
// Simulate opted-in preference by monkey-patching readFileSync for prefs only
const fs = require('fs');
const os = require('os');
const path = require('path');
const origReadFile = fs.readFileSync.bind(fs);
fs.readFileSync = (p, enc) => {
  if (p === path.join(os.homedir(), '.mooter', 'preferences.json')) {
    return JSON.stringify({ statusline_loop: true });
  }
  return origReadFile(p, enc);
};
const { statusLine } = require(process.argv[2]);
process.stdout.write(statusLine());
`;
// Pass loopDir's parent (the tmp root) as MOOTER_REPO_ROOT
const tmpRoot = path.join(tmp); // tmp itself contains _handoff/loop/
const chipProc = spawnSync(
  process.execPath,
  ['-e', chipScript, tmpRoot, chipPath],
  { encoding: 'utf8' },
);

const chipOut = (chipProc.stdout || '').trim();
const chipOk = chipOut.startsWith('🔄 W3·r') && chipOut.includes('·');
check(
  `loop-status chip renders via env override  (got: "${chipOut}")`,
  chipOk,
  true,
  (a, b) => a === b,
);

// ── 5. Cleanup ───────────────────────────────────────────────────────────────────
try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {}

// ── Result ───────────────────────────────────────────────────────────────────────
if (failures === 0) {
  console.log('\n✅  All smoke checks PASS — cross-restart persistence verified.\n');
  process.exit(0);
} else {
  console.log(`\n❌  ${failures} check(s) FAILED.\n`);
  process.exit(1);
}
