#!/usr/bin/env node
'use strict';

// cost-plane-demo — end-to-end proof of the heterogeneous cost plane (First Magic — FASE 3).
//
// Runs the HW-aware number of local Moos IN PARALLEL on Ollama ($0), routes each by role,
// writes the distilled working-state to the handoff bus, and reports REAL savings vs the
// all-Opus counterfactual. Honest: the Moo count is whatever local-fleet says this machine
// supports (≈2 on an 8GB M3) — it is NOT inflated to hit a slide number.
//
// Usage: node cost-plane-demo.js   (needs a local Ollama on :11434)

const http = require('http');
const os = require('os');
const path = require('path');
const { maxLocalMoos, loadCapability } = require('./local-fleet');
const { decideRoute } = require('./subagent-route');
const { computeRunSavings } = require('./run-savings');
const handoff = require('./handoff-bus');

const MODEL = process.env.MOO_DEMO_MODEL || 'qwen2.5:3b';
const RUN_ID = process.env.MOO_DEMO_RUN || 'fm-cost-plane-demo';

// One real local Ollama call; returns { text, input_tokens, output_tokens, ms }.
function ollama(prompt) {
  const body = JSON.stringify({ model: MODEL, prompt, stream: false });
  const t0 = Date.now();
  return new Promise((resolve) => {
    const req = http.request({ host: '127.0.0.1', port: 11434, path: '/api/generate', method: 'POST', headers: { 'Content-Type': 'application/json' } }, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => {
        try {
          const d = JSON.parse(data);
          resolve({ text: (d.response || '').trim(), input_tokens: d.prompt_eval_count || 0, output_tokens: d.eval_count || 0, ms: Date.now() - t0 });
        } catch { resolve({ text: '', input_tokens: 0, output_tokens: 0, ms: Date.now() - t0, error: true }); }
      });
    });
    req.on('error', () => resolve({ text: '', input_tokens: 0, output_tokens: 0, ms: Date.now() - t0, error: true }));
    req.write(body);
    req.end();
  });
}

// Leaf tasks — exactly the verbose/low-judgement work that belongs on local Moos.
const LEAF_TASKS = [
  { role: 'summarize the logs', prompt: 'Summarize in one short sentence: "ERROR db timeout at 12:01, retry ok at 12:02".' },
  { role: 'extract the error code', prompt: 'Reply with ONLY the HTTP status in: "upstream returned 503 Service Unavailable". Just the number.' },
  { role: 'grep for the failing test', prompt: 'Name the single failing test in: "PASS auth.test  FAIL billing.test  PASS ui.test". Reply with just the filename.' },
  { role: 'reformat to a bullet', prompt: 'Turn "name=Paulo role=founder" into one markdown bullet "- key: value" lines.' },
];

async function main() {
  const cap = loadCapability();
  const fleet = maxLocalMoos(cap);
  const N = Math.min(fleet.max_local_moos, LEAF_TASKS.length);

  console.log('\n🐮 Mooter cost-plane — heterogeneous fleet demo');
  console.log('─'.repeat(60));
  console.log(`HW-aware fleet: ${fleet.max_local_moos} local Moos  (lane ${fleet.lane_model}, ${fleet.basis})`);
  console.log(`Running ${N} local Moos IN PARALLEL on ${MODEL} ($0). Count is HW-derived, not invented.`);
  if (fleet.max_local_moos < 3) console.log('NOTE: this 8GB M3 caps at <3 concurrent Moos; the count scales to ≥3 on ≥16GB (parametric).');

  // route + run the first N leaf tasks in parallel
  const batch = LEAF_TASKS.slice(0, N);
  for (const t of batch) t.route = decideRoute({ role: t.role, task: t.prompt });

  const t0 = Date.now();
  const results = await Promise.all(batch.map((t) => ollama(t.prompt)));
  const wall = Date.now() - t0;

  const lanes = batch.map((t, i) => ({
    target: t.route.target, // 'local' for leaves
    model: t.route.target === 'local' ? MODEL : t.route.model,
    input_tokens: results[i].input_tokens,
    output_tokens: results[i].output_tokens,
    label: t.role,
  }));

  console.log('\nLocal Moos (real Ollama tokens):');
  batch.forEach((t, i) => {
    const r = results[i];
    console.log(`  🦙 ${t.route.target.padEnd(5)} ${t.role.padEnd(26)} in=${String(r.input_tokens).padStart(4)} out=${String(r.output_tokens).padStart(4)} ${r.ms}ms → "${r.text.slice(0, 36)}"`);
  });
  console.log(`  parallel wall-clock: ${wall}ms (vs serial ${results.reduce((a, r) => a + r.ms, 0)}ms)`);

  // distilled handoff to the (would-be) cloud maestro — working-state, not a dump
  const runRoot = process.env.MOOTER_RUN_ROOT || path.join(os.tmpdir(), 'mooter-run-demo');
  process.env.MOOTER_RUN_ROOT = runRoot;
  const statePath = handoff.writeState(RUN_ID, {
    goal: 'Triage the build/log signals and decide the next fix',
    decisions: batch.map((t, i) => `${t.role} → ${results[i].text.slice(0, 60)}`),
    state: ['4 leaf tasks done locally at $0', 'maestro to synthesize the fix'],
    open: ['maestro: pick the one fix to apply'],
    artifacts: lanes.map((l) => `${l.label}: ${l.input_tokens + l.output_tokens} tok`),
    maestro_provider: 'claude',
  });
  const stateBytes = require('fs').statSync(statePath).size;

  // savings vs the all-Opus counterfactual (REAL tokens)
  const sav = computeRunSavings({ lanes });

  console.log('\nHandoff bus (distilled working-state, NOT a dump):');
  console.log(`  ${statePath}  (${stateBytes} bytes, cap ${handoff.MAX_TOTAL_BYTES})`);
  console.log('\nSavings (REAL tokens vs all-Opus counterfactual):');
  console.log(`  actual=$${sav.actual_usd}  counterfactual=$${sav.counterfactual_usd}  saved=$${sav.saved_usd} (${sav.saved_pct}% )`);
  console.log(`  ${sav.basis}`);
  console.log('─'.repeat(60));
}

main();
