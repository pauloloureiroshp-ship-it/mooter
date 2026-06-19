#!/usr/bin/env node
'use strict';

// cockpit-demo — light up the First Magic cockpit from REAL mixed data (FASE 4).
//
// Honesty (user constraint): the savings number comes from the REAL mixed session
// (local + Claude) via the :7821 tracker /summary — NOT the 100%-local cost-plane demo.
// If the tracker is down, savings render "—" (never fabricated). Local Moo lanes use real
// Ollama tokens; the risk chip uses the real risk_blocked count from decisions.log (FASE 1).

const http = require('http');
const os = require('os');
const path = require('path');
const fs = require('fs');

// isolate run/spawn writes to a temp .mooter home so the demo never clobbers real ~/.mooter
// (MOOTER_HOME, when set, IS the .mooter dir → spawns at $MOOTER_HOME/spawns)
const HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'mooter-cockpit-demo-'));
process.env.MOOTER_HOME = HOME;
const SPAWNS = path.join(HOME, 'spawns');
fs.mkdirSync(SPAWNS, { recursive: true });

const { buildFeed, writeActiveRun } = require('./cockpit-feed');
const { renderCockpit } = require('./cockpit-live');
const { render6Seg } = require('./statusline-firstmagic');

const MODEL = process.env.MOO_DEMO_MODEL || 'qwen2.5:3b';

function ollama(prompt) {
  const body = JSON.stringify({ model: MODEL, prompt, stream: false });
  return new Promise((resolve) => {
    const req = http.request({ host: '127.0.0.1', port: 11434, path: '/api/generate', method: 'POST', headers: { 'Content-Type': 'application/json' } }, (res) => {
      let d = ''; res.on('data', (c) => (d += c));
      res.on('end', () => { try { const j = JSON.parse(d); resolve({ text: (j.response || '').trim(), tokens: (j.prompt_eval_count || 0) + (j.eval_count || 0) }); } catch { resolve({ text: '', tokens: 0, error: true }); } });
    });
    req.on('error', () => resolve({ text: '', tokens: 0, error: true }));
    req.write(body); req.end();
  });
}

// REAL mixed-session savings from the local tracker (best-effort; — if unavailable).
function trackerSavings() {
  return new Promise((resolve) => {
    const req = http.request({ host: '127.0.0.1', port: 7821, path: '/summary', method: 'GET', timeout: 1500 }, (res) => {
      let d = ''; res.on('data', (c) => (d += c));
      res.on('end', () => {
        const real = /Real\s*\(est\):\s*\$([\d.]+)/.exec(d);
        const naive = /Naive Opus:\s*\$([\d.]+)/.exec(d);
        const pct = /Saved pct:\s*([\d.]+)%/.exec(d);
        if (real && naive && pct) resolve({ actual_usd: +real[1], counterfactual_usd: +naive[1], saved_pct: +pct[1] });
        else resolve(null);
      });
    });
    req.on('error', () => resolve(null));
    req.on('timeout', () => { req.destroy(); resolve(null); });
    req.end();
  });
}

const LEAF = [
  { id: 'sp_grep', task: 'grep the logs for errors', prompt: 'In one short line, name the error in: "ERROR db timeout at 12:01".' },
  { id: 'sp_extract', task: 'extract the status code', prompt: 'Reply ONLY the number in: "upstream 503 unavailable".' },
];

async function main() {
  // 1) light up the run (cockpit reads ~/.mooter/workflows/active-run.json)
  writeActiveRun({ run_id: 'fm-first-magic', maestro_provider: 'claude', maestro_model: 'claude-sonnet-4-6', agents_total: LEAF.length + 1 });

  // 2) run local Moos in parallel (real Ollama tokens), record spawn lanes
  const results = await Promise.all(LEAF.map((t) => ollama(t.prompt)));
  LEAF.forEach((t, i) => {
    const dir = path.join(SPAWNS, t.id); fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'state.json'), JSON.stringify({ id: t.id, task: t.task, mode: 'local', model: MODEL, status: 'done', exitCode: 0, tokens: results[i].tokens, cost_usd: 0 }));
  });
  // the cloud maestro lane (synthesis) — real token data is NOT recorded per-lane here, so
  // it honestly shows "—" for tokens/$; the run-level savings come from the tracker below.
  const mdir = path.join(SPAWNS, 'sp_maestro'); fs.mkdirSync(mdir, { recursive: true });
  fs.writeFileSync(path.join(mdir, 'state.json'), JSON.stringify({ id: 'sp_maestro', task: 'synthesize the fix from the leaf findings', mode: 'cloud', model: 'claude-sonnet-4-6', status: 'running' }));

  // 3) REAL mixed-session savings (local+Claude) — not the 100%-local demo number
  const savings = await trackerSavings();

  // 4) build the feed. Read the REAL decisions.log (not the isolated temp home) so the
  //    risk chip reflects the actual FASE 1 risk_blocked count, and the real verify-last.
  const realRouter = path.join(os.homedir(), '.claude', 'tools', 'router', 'decisions.log');
  const realVerify = (() => { try { const v = JSON.parse(fs.readFileSync(path.join(os.homedir(), '.mooter', 'verify-last.json'), 'utf8')); return v.pass === true ? 'pass' : v.pass === false ? 'fail' : null; } catch { return null; } })();
  const feed = buildFeed({ nowMs: Date.now(), savings, decisionsLog: realRouter, verify: realVerify });

  console.log('\n' + renderCockpit(feed) + '\n');
  console.log('statusline: ' + render6Seg(feed) + '\n');
  console.log(savings
    ? `(savings from REAL mixed session via :7821 — local+Claude, not the 100%-local demo)`
    : `(savings tracker :7821 unavailable → rendered "—", never fabricated)`);
}

main().finally(() => { try { fs.rmSync(HOME, { recursive: true, force: true }); } catch { /* OS reaps tmp */ } });
