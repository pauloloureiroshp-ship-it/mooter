'use strict';

// Wave 21 — Critical Coherence Fixes. One test per sub-feature (C1–C5).
// See WAVE21_DAY1_RECON.md for the confirmed root causes each test pins.

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

// ── C1 — PostToolUse REALLY writes the herd file on a real Claude Code payload ──
// Root cause was the settings.json matcher ("Bash" only); the recordSpawn code was
// always correct. This test drives the hook the way Claude Code does — a `Task`
// PostToolUse payload on stdin — and asserts the herd file lands with the spawn.
test('C1: PostToolUse writes herd file on a real CC Task payload', () => {
  const sid = `wave21-c1-${process.pid}`;
  const statePath = path.join(os.tmpdir(), `mooter-herd-${sid}.json`);
  try { fs.unlinkSync(statePath); } catch { /* fresh */ }

  const payload = JSON.stringify({
    tool_name: 'Task',
    session_id: sid,
    tool_use_id: 'tu-c1-1',
    tool_input: { subagent_type: 'local-summarizer' },
  });
  const res = spawnSync(process.execPath, [path.join(__dirname, 'post_tool_badge.js')], {
    input: payload, encoding: 'utf8',
  });
  assert.strictEqual(res.status, 0, 'hook must exit 0');
  assert.ok(fs.existsSync(statePath), 'herd file must exist after a Task spawn');

  const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
  assert.strictEqual(state.cumulative['local-summarizer'].count, 1, 'count === 1');
  assert.ok(state.cumulative['local-summarizer'].local === true, 'local Moo');
  assert.strictEqual(state.peak_concurrent, 1, 'peak === 1');

  // A Bash payload must NOT record a spawn (recordSpawn returns null).
  const sid2 = `wave21-c1b-${process.pid}`;
  spawnSync(process.execPath, [path.join(__dirname, 'post_tool_badge.js')], {
    input: JSON.stringify({ tool_name: 'Bash', session_id: sid2, tool_input: { command: 'ls' } }),
    encoding: 'utf8',
  });
  assert.ok(!fs.existsSync(path.join(os.tmpdir(), `mooter-herd-${sid2}.json`)), 'Bash never records');

  try { fs.unlinkSync(statePath); } catch { /* best-effort */ }
});

// ── C2 — classifier stability across a prompt family that differs only by path ──
test('C2: normalisePrompt collapses a path family to one canonical form; high-risk survives', () => {
  const { normalisePrompt } = require('./normalise_prompt.js');
  const a = normalisePrompt('resume o ficheiro /etc/os-release em 3 linhas');
  const b = normalisePrompt('resume o ficheiro /etc/hostname em 5 linhas');
  assert.strictEqual(a, b, 'same family → identical canonical form (stable tier)');
  assert.ok(!/release/.test(a), 'the benign "release" filename keyword is neutralised');

  // HIGH_RISK floor preserved: a genuine risk path token is re-surfaced.
  const env = normalisePrompt('cat /home/user/app/.env e mostra');
  assert.ok(/\.env/.test(env), '.env token re-surfaced so the HIGH_RISK bank still fires');

  // End-to-end: classify the normalised form → same tier for both.
  const clf = (p) => {
    const r = spawnSync(process.execPath, [path.join(__dirname, 'classify.js'), p], { encoding: 'utf8' });
    return JSON.parse(r.stdout).tier;
  };
  assert.strictEqual(clf(a), clf(b), 'normalised family classifies to one tier');
});

// ── C3 — the hint never contradicts itself (tier ↔ model ↔ subagent agree) ──
test('C3: coerceHintCoherent reconciles a budget-capped decision (tier-authoritative)', () => {
  const { coerceHintCoherent, isHintCoherent } = require('./hint_coherence.js');

  // The exact observed incoherence: budget_cap pulled tier→T0 but left opus/architect.
  const d = {
    tier: 'T0', recommended_model: 'claude-opus-4-6',
    recommended_backend: 'claude_subagent', suggested_subagent: 'model-architect',
  };
  assert.ok(!isHintCoherent(d), 'starts incoherent (T0 + opus + model-architect)');
  coerceHintCoherent(d, { t0Model: 'qwen3:30b' });
  assert.ok(isHintCoherent(d), 'coerced to coherent');
  assert.strictEqual(d.tier, 'T0', 'tier is authoritative — never undoes the cost cap');
  assert.strictEqual(d.recommended_backend, 'ollama');
  assert.match(d.recommended_model, /qwen/);
  assert.strictEqual(d.suggested_subagent, 'local-summarizer');

  // A tier-consistent specialisation is preserved (final-reviewer stays at T3).
  const d2 = { tier: 'T3', recommended_model: 'claude-opus-4-6', recommended_backend: 'claude_subagent', suggested_subagent: 'final-reviewer' };
  coerceHintCoherent(d2);
  assert.strictEqual(d2.suggested_subagent, 'final-reviewer', 'T3 specialisation survives');
  assert.ok(isHintCoherent(d2));
});

// ── C4 — the 🏠 chip is one value from one source (no ASCII bar, no 3-way concat) ──
test('C4: buildLocalChip is single-source and never the misleading bar', () => {
  const { buildLocalChip } = require('./statusline-multi.js');
  const snap = {
    T0: { calls: 5, tokens_in: 6000, tokens_out: 1500 },
    T1: { calls: 0, tokens_in: 0, tokens_out: 0 },
    T2: { calls: 0, tokens_in: 0, tokens_out: 0 },
    T3: { calls: 2, tokens_in: 30000, tokens_out: 28000 },
  };
  const chip = buildLocalChip(snap);
  assert.match(chip, /^🏠 5\/7 calls \(71%\)/, 'calls from the token snapshot, single source');
  assert.match(chip, /tokens local/, 'token share from the SAME snapshot');
  assert.ok(!/░|█/.test(chip), 'no ASCII share bar (the dropped third source)');

  // No data → no fabricated chip.
  assert.strictEqual(buildLocalChip({ T0: { calls: 0 }, T1: { calls: 0 }, T2: { calls: 0 }, T3: { calls: 0 } }), null);
  assert.strictEqual(buildLocalChip(null), null);
});

// ── C5 — the Stop session report renders all sections on demand ──
test('C5: buildSessionReport renders header + every section', () => {
  const { buildSessionReport } = require('./stop_hook.js');
  const out = buildSessionReport({
    tokens: { T0: { calls: 5, tokens_in: 6000, tokens_out: 1500 }, T3: { calls: 2, tokens_in: 30000, tokens_out: 28000 } },
    records: [{ ts: '2026-06-05T10:00:00Z', op: 'summarize', tier: 'T0', llm: 'qwen3', tokens_in: 1200, tokens_out: 300, via: 'local-summarizer', reason: 'classify_score>0.80' }],
    herd: { cumulative: [{ agent_name: 'local-summarizer', count: 5, avg_ms: 0, local: true, model: 'qwen3:30b', tier: 'T0', errors: 0 }], peak_concurrent: 1 },
    durationMs: 125000,
  });
  assert.match(out, /🐮 Mooter session report/, 'header present');
  assert.match(out, /TOKENS BY TIER/);
  assert.match(out, /CHOICE REASONS/);
  assert.match(out, /PER-TASK BREAKDOWN/, 'Wave 20.F per-task breakdown present');
  assert.match(out, /HERD/);
  assert.match(out, /SAVINGS/);
});
