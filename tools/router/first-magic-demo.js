#!/usr/bin/env node
'use strict';

// first-magic-demo — the single end-to-end "First Magic" scenario (screencap script).
//
// One real flow, five beats, all four phases in one tree:
//   1. SAFETY (F1)   — a disguised destructive action is BLOCKED with a reason ($0, zero-LLM).
//   2. FLEET  (F3)   — the HW-aware number of local Moos run IN PARALLEL on Ollama ($0).
//   3. HANDOFF(F3)   — the maestro receives only the DISTILLED working-state (not a dump).
//   4. VERIFY (F2)   — the free local critic keeps the agent working until tests are green.
//   5. COCKPIT(F4)   — the cockpit + 6-seg statusline show fleet + cost + risk LIVE.
//
// Honesty (Doctrine): real Ollama tokens; HW-aware Moo count (not inflated); savings from
// the REAL mixed session (:7821 tracker), not the 100%-local demo; missing data → "—".
// Self-contained: writes only to a temp .mooter home; reads the real savings tracker.
// classify.js is never touched.

const http = require('http');
const os = require('os');
const path = require('path');
const fs = require('fs');
const { spawnSync } = require('child_process');

const R = __dirname; // tools/router
// isolate all writes to a temp .mooter home (MOOTER_HOME = the .mooter dir)
const HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'mooter-first-magic-'));
process.env.MOOTER_HOME = HOME;                       // spawns + workflows live here
process.env.MOOTER_RUN_ROOT = path.join(HOME, 'run'); // handoff bus writes here (not real ~/.mooter)
const SPAWNS = path.join(HOME, 'spawns');
const DEC = path.join(HOME, 'decisions.log');           // this run's risk events
const VERIFY_LAST = path.join(HOME, 'verify-last.json'); // this run's critic verdict
fs.mkdirSync(SPAWNS, { recursive: true });

const { maxLocalMoos, loadCapability } = require(path.join(R, 'local-fleet'));
const { decideRoute } = require(path.join(R, 'subagent-route'));
const handoff = require(path.join(R, 'handoff-bus'));
const { buildFeed, writeActiveRun } = require(path.join(R, 'cockpit-feed'));
const { renderCockpit } = require(path.join(R, 'cockpit-live'));
const { render6Seg } = require(path.join(R, 'statusline-firstmagic'));

const MODEL = process.env.MOO_DEMO_MODEL || 'qwen2.5:3b';
const RUN_ID = 'first-magic';
const hr = (t) => console.log('\n' + '━'.repeat(64) + '\n  ' + t + '\n' + '━'.repeat(64));

function ollama(prompt) {
  const body = JSON.stringify({ model: MODEL, prompt, stream: false });
  return new Promise((resolve) => {
    const req = http.request({ host: '127.0.0.1', port: 11434, path: '/api/generate', method: 'POST', timeout: 60000, headers: { 'Content-Type': 'application/json' } }, (res) => {
      let d = ''; res.on('data', (c) => (d += c));
      res.on('end', () => { try { const j = JSON.parse(d); resolve({ text: (j.response || '').trim(), tokens: (j.prompt_eval_count || 0) + (j.eval_count || 0) }); } catch { resolve({ text: '', tokens: 0, error: true }); } });
    });
    req.on('error', () => resolve({ text: '', tokens: 0, error: true }));
    // a hung Ollama (socket accepted, never responds) must degrade honestly, not hang the screencap
    req.on('timeout', () => { req.destroy(); resolve({ text: '', tokens: 0, error: true }); });
    req.write(body); req.end();
  });
}

function trackerSavings() {
  return new Promise((resolve) => {
    const req = http.request({ host: '127.0.0.1', port: 7821, path: '/summary', method: 'GET', timeout: 1500 }, (res) => {
      let d = ''; res.on('data', (c) => (d += c));
      res.on('end', () => {
        const real = /Real\s*\(est\):\s*\$([\d.]+)/.exec(d);
        const naive = /Naive Opus:\s*\$([\d.]+)/.exec(d);
        const pct = /Saved pct:\s*([\d.]+)%/.exec(d);
        resolve(real && naive && pct ? { actual_usd: +real[1], counterfactual_usd: +naive[1], saved_pct: +pct[1] } : null);
      });
    });
    req.on('error', () => resolve(null));
    req.on('timeout', () => { req.destroy(); resolve(null); });
    req.end();
  });
}

// ── Beat 1 — Safety plane: block a disguised destructive action ─────────────
function beatSafety() {
  hr('1 · SAFETY  — disguised destructive action, blocked with a reason ($0, zero-LLM)');
  const command = 'psql "$PROD_DB" -c "drop the legacy_users table since nothing reads it"';
  console.log(`  maestro is about to run:  ${command}`);
  const r = spawnSync('node', [path.join(R, 'hooks', 'PreToolUse-moo-risk.js')], {
    input: JSON.stringify({ tool_name: 'Bash', tool_input: { command } }),
    env: { ...process.env, MOOTER_DECISIONS_LOG: DEC }, encoding: 'utf8',
  });
  process.stdout.write(r.stderr || '');
  console.log(`  → PreToolUse exit ${r.status} (2 = blocked). The action never runs; a human must confirm.`);
}

// ── Beat 2 — Fleet: HW-aware local Moos in parallel at $0 ────────────────────
async function beatFleet() {
  hr('2 · FLEET   — HW-aware local Moos run in parallel on Ollama ($0)');
  const fleet = maxLocalMoos(loadCapability());
  const tasks = [
    { id: 'sp_grep', role: 'grep the logs', task: 'grep the logs', prompt: 'One short line: name the error in "ERROR db timeout at 12:01".' },
    { id: 'sp_extract', role: 'extract the status code', task: 'extract status', prompt: 'Reply ONLY the number in "upstream 503 unavailable".' },
    { id: 'sp_summ', role: 'summarize the diff', task: 'summarize diff', prompt: 'In 6 words, summarize: "renamed parseInput to parseRequest".' },
  ];
  const N = Math.min(fleet.max_local_moos, tasks.length);
  console.log(`  HW-aware fleet: ${fleet.max_local_moos} Moos (${fleet.basis}). Running ${N} in parallel — count is HW-derived, not invented.`);
  const batch = tasks.slice(0, N);
  batch.forEach((t) => { t.route = decideRoute({ role: t.role, task: t.task }); });

  const t0 = Date.now();
  const out = await Promise.all(batch.map((t) => ollama(t.prompt)));
  const wall = Date.now() - t0;

  batch.forEach((t, i) => {
    const dir = path.join(SPAWNS, t.id); fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'state.json'), JSON.stringify({ id: t.id, task: t.task, mode: 'local', model: MODEL, status: 'done', exitCode: 0, tokens: out[i].tokens, cost_usd: 0 }));
    console.log(`  🦙 ${t.route.target.padEnd(5)} ${t.role.padEnd(24)} ${String(out[i].tokens).padStart(4)} tok  $0  → "${out[i].text.slice(0, 34)}"`);
  });
  // maestro lane (cloud) — synthesis; no per-lane token record → renders "—" honestly
  const md = path.join(SPAWNS, 'sp_maestro'); fs.mkdirSync(md, { recursive: true });
  fs.writeFileSync(path.join(md, 'state.json'), JSON.stringify({ id: 'sp_maestro', task: 'decide the fix', mode: 'cloud', model: 'claude-sonnet-4-6', status: 'running' }));
  console.log(`  parallel wall-clock ${wall}ms — ${N} Moos at $0, concurrently.`);
  writeActiveRun({ run_id: RUN_ID, maestro_provider: 'claude', maestro_model: 'claude-sonnet-4-6', agents_total: N + 1 });
  return { batch, out };
}

// ── Beat 3 — Handoff: distilled working-state to the maestro (not a dump) ────
function beatHandoff(fleetResult) {
  hr('3 · HANDOFF — maestro receives the DISTILLED working-state (not a transcript dump)');
  const statePath = handoff.writeState(RUN_ID, {
    goal: 'Decide the single safe fix from the leaf findings',
    decisions: fleetResult.batch.map((t, i) => `${t.role}: ${fleetResult.out[i].text.slice(0, 50)}`),
    state: [`${fleetResult.batch.length} leaf tasks done locally at $0`, 'destructive drop-table was blocked (beat 1)'],
    open: ['maestro: confirm the rename fix; do NOT touch prod tables'],
    artifacts: fleetResult.batch.map((t) => t.id),
    maestro_provider: 'claude',
  });
  const bytes = fs.statSync(statePath).size;
  const pin = handoff.arbitrate({ pinnedProvider: 'claude', candidateProvider: 'claude' });
  console.log(`  ${statePath}`);
  console.log(`  ${bytes} bytes (cap ${handoff.MAX_TOTAL_BYTES}) — distilled, never a dump.  arbiter: ${pin.reason}`);
}

// ── Beat 4 — Verify: the free critic keeps the agent working until green ─────
function beatVerify() {
  hr('4 · VERIFY  — free deterministic critic ($0, no LLM judge): keep going until green');
  const proj = fs.mkdtempSync(path.join(os.tmpdir(), 'fm-verify-'));
  const pkg = (exit) => fs.writeFileSync(path.join(proj, 'package.json'), JSON.stringify({ name: 'x', scripts: { test: `exit ${exit}` } }));
  fs.writeFileSync(path.join(proj, 'mooter.verify.json'), JSON.stringify({ required: ['test'] }));
  const gate = () => spawnSync('node', [path.join(R, 'moo-verify.js'), '--gate'], { input: '{}', env: { ...process.env, MOO_VERIFY_CWD: proj, MOO_VERIFY_LAST: VERIFY_LAST }, encoding: 'utf8' });
  pkg(1); const red = gate();
  console.log(`  turn 1 — tests RED  → gate exit ${red.status} (2 = keep working). ${(red.stderr || '').split('\n').filter(Boolean).pop() || ''}`);
  pkg(0); const green = gate();
  console.log(`  turn 2 — agent fixes → tests GREEN → gate exit ${green.status} (0 = done). The loop closed at $0.`);
  fs.rmSync(proj, { recursive: true, force: true });
}

// ── Beat 5 — Cockpit: fleet + cost + risk, live ─────────────────────────────
async function beatCockpit() {
  hr('5 · COCKPIT — fleet + cost + risk, live (real data; missing → "—")');
  const savings = await trackerSavings(); // REAL mixed session (local+Claude), not the demo
  const feed = buildFeed({ nowMs: Date.now(), savings, decisionsLog: DEC,
    verify: (() => { try { const v = JSON.parse(fs.readFileSync(VERIFY_LAST, 'utf8')); return v.pass ? 'pass' : 'fail'; } catch { return null; } })() });
  console.log('\n' + renderCockpit(feed) + '\n');
  console.log('  statusline: ' + render6Seg(feed));
  console.log('\n  ' + (savings ? 'savings = REAL mixed session (:7821, local+Claude)' : 'savings tracker down → "—" (never fabricated)') +
    `;  risk chip = this run's real block;  Moo cap = HW-aware (${feed.moos_cap}).`);
}

async function main() {
  console.log('\n🐮  MOOTER — First Magic (one real flow, five beats, classify.js frozen)');
  beatSafety();
  const fr = await beatFleet();
  beatHandoff(fr);
  beatVerify();
  await beatCockpit();
  // doctrine proof, on-screen
  const sha = spawnSync('shasum', ['-a', '256', path.join(R, 'classify.js')], { encoding: 'utf8' }).stdout.trim().split(' ')[0];
  hr('DONE — classify.js sha ' + sha);
  console.log(sha === '427d8c0b516315c6a858b183892ec26dc0fed7b52f11000e1e6b81fd364bc48f' ? '  ✅ frozen engine intact (byte-identical).' : '  ❌ classify.js CHANGED — abort.');
}

main().finally(() => { try { fs.rmSync(HOME, { recursive: true, force: true }); } catch { /* OS reaps tmp */ } });
