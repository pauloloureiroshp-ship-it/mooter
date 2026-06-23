/**
 * smoke-W4-council-chip.mjs — W4 Council statusline chip regression smoke.
 *
 * Tests:
 *  1. OFF (default): statusLine() returns '' → byte-identical to baseline
 *  2. ON + no vault state: statusLine() returns '🏛 —' (honest placeholder)
 *  3. ON + real vault state: statusLine() returns well-formed chip with real numbers
 *  4. Pure renderer: buildCouncilChip matches expected format
 *
 * Run: node _handoff/council-eval/smoke-W4-council-chip.mjs
 * Exit 0 = all pass. Exit 1 = failure (prints diff).
 */
import { strict as assert } from 'node:assert';
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir, homedir } from 'node:os';

// ── helpers ──────────────────────────────────────────────────────────────────────

const SEP = '─'.repeat(60);
let passed = 0; let failed = 0;

function ok(label, fn) {
  try {
    fn();
    console.log(`  ✅  ${label}`);
    passed++;
  } catch (e) {
    console.error(`  ❌  ${label}`);
    console.error(`       ${e.message}`);
    failed++;
  }
}

// ── baseline: capture current statusLine() with no prefs (OFF state) ────────────

// We need to isolate the chip module from real ~/.mooter/preferences.json.
// Strategy: set MOOTER_HOME to a temp dir with no council-last.json, and
// override the require cache to inject a controlled prefs() result.

const tmpVault = join(tmpdir(), `smoke-W4-council-${Date.now()}`);
mkdirSync(tmpVault, { recursive: true });
process.env.MOOTER_HOME = tmpVault;

// Use a relative path from __dirname so this resolves in both the repo
// (tools/router/) and the runtime (~/.claude/tools/router/).
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dir = dirname(__filename);

// Resolve council-status from the repo root tools/router/
const repoRoot = join(__dir, '..', '..'); // _handoff/council-eval → up 2 = repo root
const chipPath = join(repoRoot, 'tools', 'router', 'council-status.js');

const require = createRequire(import.meta.url);

// Fresh require (no cache contamination between subtests)
function freshChip() {
  // Delete from require cache if present
  delete require.cache[chipPath];
  return require(chipPath);
}

console.log(`\n${SEP}`);
console.log('smoke-W4-council-chip: council statusline chip regression');
console.log(`${SEP}\n`);
console.log(`chip path: ${chipPath}`);
console.log(`vault:     ${tmpVault}\n`);

// ── BASELINE: OFF (default) ──────────────────────────────────────────────────────
// No preferences.json in tmpVault → optedIn() returns false → '' → byte-identical.

ok('OFF (no prefs): statusLine() === "" — byte-identical baseline', () => {
  const chip = freshChip();
  const result = chip.statusLine();
  assert.equal(result, '', `Expected '' (byte-identical), got: ${JSON.stringify(result)}`);
});

// ── ON + no vault state ──────────────────────────────────────────────────────────
// Write preferences.json with statusline_council: true; no council-last.json.

ok('ON + no vault state: statusLine() === "🏛 —" (honest placeholder)', () => {
  writeFileSync(join(tmpVault, 'preferences.json'), JSON.stringify({ statusline_council: true }));
  // council-last.json NOT written → readLastState() returns null
  const chip = freshChip();
  const result = chip.statusLine();
  assert.equal(result, '🏛 —', `Expected '🏛 —', got: ${JSON.stringify(result)}`);
});

// ── ON + real vault state ────────────────────────────────────────────────────────
// Write a realistic council-last.json; verify chip renders real numbers.

const mockState = {
  latencyMs: 1234,
  costUsd: 0,
  modelCalls: 9,
  convergence: 'CONFIRMED',
  savedPct: 100,
  category: 'routing_decision',
};

ok('ON + real state: chip contains latency seconds', () => {
  writeFileSync(join(tmpVault, 'council-last.json'), JSON.stringify(mockState));
  const chip = freshChip();
  const result = chip.statusLine();
  assert.ok(result.includes('1.2s'), `Expected '1.2s' in chip: ${JSON.stringify(result)}`);
});

ok('ON + real state: chip contains cost "$0.00"', () => {
  const chip = freshChip();
  const result = chip.statusLine();
  assert.ok(result.includes('$0.00'), `Expected '$0.00' in chip: ${JSON.stringify(result)}`);
});

ok('ON + real state: chip contains "saved ~100%"', () => {
  const chip = freshChip();
  const result = chip.statusLine();
  assert.ok(result.includes('saved ~100%'), `Expected 'saved ~100%' in chip: ${JSON.stringify(result)}`);
});

ok('ON + real state: chip starts with 🏛 council', () => {
  const chip = freshChip();
  const result = chip.statusLine();
  assert.ok(result.startsWith('🏛 council '), `Expected '🏛 council …', got: ${JSON.stringify(result)}`);
});

// ── pure renderer edge cases ─────────────────────────────────────────────────────

ok('buildCouncilChip(null) === "🏛 —"', () => {
  const { buildCouncilChip } = freshChip();
  assert.equal(buildCouncilChip(null), '🏛 —');
});

ok('buildCouncilChip: no savedStr when savedPct===0', () => {
  const { buildCouncilChip } = freshChip();
  const s = buildCouncilChip({ latencyMs: 500, costUsd: 0.5, savedPct: 0 });
  assert.ok(!s.includes('saved'), `Unexpected 'saved' in: ${JSON.stringify(s)}`);
});

ok('fmtUsd(0) === "$0.00"', () => {
  const { fmtUsd } = freshChip();
  assert.equal(fmtUsd(0), '$0.00');
});

ok('fmtUsd(0.003) starts with "$0.00" (4dp for tiny)', () => {
  const { fmtUsd } = freshChip();
  assert.ok(fmtUsd(0.003).startsWith('$0.00'), `Got: ${fmtUsd(0.003)}`);
});

ok('fmtUsd(1.23) === "$1.23"', () => {
  const { fmtUsd } = freshChip();
  assert.equal(fmtUsd(1.23), '$1.23');
});

// ── OFF state: even with vault state, prefs off → '' ────────────────────────────

ok('OFF state overrides even with vault data present: returns ""', () => {
  writeFileSync(join(tmpVault, 'preferences.json'), JSON.stringify({})); // no statusline_council
  const chip = freshChip();
  const result = chip.statusLine();
  assert.equal(result, '', `Expected '' (byte-identical), got: ${JSON.stringify(result)}`);
});

// ── cleanup ──────────────────────────────────────────────────────────────────────

rmSync(tmpVault, { recursive: true, force: true });
delete process.env.MOOTER_HOME;

// ── summary ──────────────────────────────────────────────────────────────────────

console.log(`\n${SEP}`);
if (failed === 0) {
  console.log(`✅  smoke-W4 PASS — ${passed}/${passed + failed} assertions green`);
  console.log(`    OFF → '' (byte-identical baseline preserved)`);
  console.log(`    ON  → '🏛 —' when no run, real chip when state exists`);
} else {
  console.error(`❌  smoke-W4 FAIL — ${failed} assertion(s) failed`);
}
console.log(SEP);
process.exit(failed > 0 ? 1 : 0);
