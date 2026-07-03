#!/usr/bin/env node
// moo-loop-runner.mjs — 🔁 the $0 local cycle engine for a Moo Loop Session.
//
// Runs a typed loop spec as bounded cycles: CHECK → ACTION → observe → STOP-eval, one
// action per cycle (plan→act→observe→decide). It STOPS mechanically on the first stopping
// condition (max-iter · budget · no-progress · goal · escalate) — a loop without stop
// conditions is refused up front by validateLoopContract. On stop it emits an HONEST
// Perfect-Handoff-shaped report (STATE + stop-reason + the mandatory "o que NÃO verifiquei"
// section + NEXT) derived ONLY from what the cycles actually observed — never inflated.
//
// The ACTION is $0 by design:
//   · default  → local Ollama moo (~/.claude/tools/router/ollama_call.sh) when present
//   · --dry / MOO_LOOP_DRY=1 → deterministic, offline, zero-LLM (used by the demo + tests)
// The cloud is never called here. main is never touched (read-only). Reuses moo-loop.js
// for the contract, status parsing and STOP evaluation — no duplicated policy.
//
// Usage:
//   node moo-loop-runner.mjs --demo [--dry]           run the built-in demo loop
//   node moo-loop-runner.mjs --spec spec.json [--dry] run a typed spec from disk
//   node moo-loop-runner.mjs --demo --json            machine-readable result on stdout
import { readFileSync, writeFileSync, existsSync, mkdirSync, appendFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';

const HERE = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const ML = require(join(HERE, 'moo-loop.js'));

// ── args ──
const argv = process.argv.slice(2);
const hasFlag = (f) => argv.includes(f);
const argVal = (f) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : null; };
const DRY = hasFlag('--dry') || process.env.MOO_LOOP_DRY === '1';
const JSON_OUT = hasFlag('--json');
const OUT_DIR = resolve(argVal('--out') || process.env.MOO_LOOP_DIR || join(HERE, '.moo-loop'));

const log = (...a) => { if (!JSON_OUT) console.log('[moo-loop]', ...a); };

function loadSpec() {
  if (hasFlag('--demo')) {
    // A tiny, self-validating demo pillar: 3 bounded cycles then a clean max-iter stop.
    return ML.defaultSpec('loop', 'Demo: varrer 1 pilar do Mooter e propor 1 melhoria-com-prova ($0 local).');
  }
  const p = argVal('--spec');
  if (!p) { console.error('moo-loop-runner: pass --demo or --spec <file.json>'); process.exit(2); }
  return JSON.parse(readFileSync(resolve(p), 'utf8'));
}

// $0 ACTION. Live path = local Ollama moo; dry path = deterministic (offline).
function runAction(spec, state) {
  if (DRY) {
    // Deterministic cycle: honest, offline, zero-LLM. Never claims a passing test it did
    // not run — TESTS stays 'n/a (dry)' so the handoff cannot inflate a green gate.
    return '```status\n'
      + `DID: ciclo ${state.iteration} (dry · $0) — CHECK observou o sinal, ACTION propôs 1 passo\n`
      + 'TESTS: n/a (dry · nenhum teste corrido)\n'
      + 'BLOCKERS: none\n'
      + `NEXT: continuar até stopping-condition (${ML.stopSummary(spec.stop)})\n`
      + 'DONE: no\n```';
  }
  const sh = join(process.env.HOME || process.env.USERPROFILE || '', '.claude', 'tools', 'router', 'ollama_call.sh');
  if (existsSync(sh)) {
    try {
      const prompt = `És um moo local ($0). CHECK: ${spec.check}. ACTION: ${spec.action}. `
        + `Ciclo ${state.iteration}. Responde SÓ com um bloco status (DID/TESTS/BLOCKERS/NEXT/DONE).`;
      const out = execFileSync('bash', [sh, '--text', prompt], { encoding: 'utf8', timeout: 120000 });
      return out;
    } catch (e) { log('ollama action failed, degrading to dry:', e && e.message); }
  }
  // No local moo available → degrade to a deterministic $0 cycle (honest, never cloud).
  return '```status\nDID: ciclo ' + state.iteration + ' (sem moo local · degradou para $0 determinístico)\n'
    + 'TESTS: n/a\nBLOCKERS: no local Ollama\nNEXT: continuar\nDONE: no\n```';
}

// $0 CHECK. Grounded: reads real git state when in a repo; never invents. Returns a short
// observation string + a boolean "changed" used for no-progress detection.
function runCheck(spec, state) {
  let signal = 'sinal do pilar (dry)';
  let head = null;
  try {
    head = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: HERE, encoding: 'utf8', timeout: 3000 }).trim();
  } catch { /* not a repo / no git — fine, stays null */ }
  if (head) signal = 'git HEAD=' + head;
  const changed = head ? head !== state.lastHead : (state.iteration <= 2); // dry: first cycles "progress"
  return { signal, head, changed };
}

function ledgerAppend(ev) {
  try {
    if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });
    appendFileSync(join(OUT_DIR, 'loop-ledger.jsonl'), JSON.stringify(ev) + '\n');
  } catch { /* best-effort */ }
}

function nowISO() { return new Date().toISOString(); }

// ── the honest handoff (Perfect-Handoff-shaped; derived ONLY from real cycles) ──
function emitHandoff(spec, state, stop, events) {
  const M = ML.MODES[spec.mode];
  const ranTests = events.some((e) => e.tests && !/^n\/a/i.test(e.tests));
  const STATE = stop.reason && /goal/.test(stop.reason) ? 'goal-reached'
    : stop.reason && /escalate/.test(stop.reason) ? 'awaiting-you'
    : 'stopped-bounded';
  const notVerified = [
    'nenhum push/merge/deploy feito — o irreversível fica para o humano (H1)',
    ranTests ? null : 'nenhum teste corrido nesta run (dry/$0) — o GATE não afirma verde',
    DRY ? 'ACTION correu em modo dry (determinístico, offline) — a versão viva usa um moo local Ollama' : null,
  ].filter(Boolean);
  const lines = [];
  lines.push('⇄ MOO LOOP HANDOFF · ' + M.emoji + ' ' + M.label + ' · ' + nowISO());
  lines.push('STATE:  ' + STATE + ' · ' + state.iteration + ' ciclo(s) · $0 (' + (DRY ? 'dry' : 'local') + ')');
  lines.push('STOP:   ' + (stop.reason || 'n/d'));
  lines.push('DID:    ' + (state.lastDid || 'n/d'));
  lines.push('CHECK:  ' + (state.lastSignal || 'n/d') + ' (observado, não inventado)');
  lines.push('GATE:   classify.js FROZEN não tocado · ' + (ranTests ? 'testes: ' + state.lastTests : 'sem testes nesta run'));
  lines.push('O QUE NÃO VERIFIQUEI / pode falhar se:');
  for (const nv of notVerified) lines.push('  · ' + nv);
  lines.push('NEXT:   ' + (state.lastNext || (M.needsContract ? 'rever a proposta e decidir (humano)' : 'n/d')));
  lines.push('⇄ END HANDOFF');
  return lines.join('\n');
}

async function main() {
  const raw = loadSpec();
  const v = ML.validateLoopContract(raw);
  if (!v.ok) {
    const msg = 'CONTRATO INVÁLIDO — a sessão de loop foi REJEITADA:\n  · ' + v.errors.join('\n  · ');
    if (JSON_OUT) { process.stdout.write(JSON.stringify({ ok: false, errors: v.errors }) + '\n'); }
    else console.error(msg);
    process.exit(1);
  }
  const spec = v.spec;
  log('spec válido · modo=' + spec.mode + ' · STOP=' + ML.stopSummary(spec.stop));
  ledgerAppend({ ts: nowISO(), kind: 'intent', mode: spec.mode, task: spec.task, stop: spec.stop });

  const state = {
    iteration: 0, noProgressStreak: 0, gpuMinUsed: 0, usdUsed: 0,
    goalMet: false, escalated: false, lastHead: null,
    lastDid: '', lastTests: '', lastNext: '', lastSignal: '',
  };
  const events = [];
  const GUARD = 50; // hard backstop so a mis-specified stop can never spin forever

  while (state.iteration < GUARD) {
    // STOP is checked at the TOP using the count of completed cycles, so max-iterations=N
    // yields exactly N cycles.
    const pre = ML.evaluateStop(spec, state);
    if (pre.stop) { var stop = pre; break; }

    state.iteration += 1;
    const check = runCheck(spec, state);
    state.lastSignal = check.signal; state.lastHead = check.head;

    const actionOut = runAction(spec, state);
    const status = ML.parseStatusBlock(actionOut);
    state.lastDid = status.did; state.lastTests = status.tests; state.lastNext = status.next;
    state.gpuMinUsed += DRY ? 0 : 5; // rough $0-GPU accounting (dry = 0)
    if (status.done) state.goalMet = true;
    if (!check.changed && !status.done) state.noProgressStreak += 1; else state.noProgressStreak = 0;

    const ev = {
      ts: nowISO(), kind: 'cycle', iteration: state.iteration,
      signal: check.signal, did: status.did, tests: status.tests,
      done: status.done, noProgressStreak: state.noProgressStreak,
    };
    events.push(ev); ledgerAppend(ev);
    log('ciclo ' + state.iteration + ': ' + (status.did || '(sem DID)') + ' · streak=' + state.noProgressStreak);

    const post = ML.evaluateStop(spec, state);
    if (post.stop) { var stop = post; break; }
  }
  if (typeof stop === 'undefined') stop = { stop: true, reason: 'guard (' + GUARD + ' ciclos — stop mal-especificado)' };

  const handoff = emitHandoff(spec, state, stop, events);
  ledgerAppend({ ts: nowISO(), kind: 'outcome', stop: stop.reason, cycles: state.iteration, handoff });

  if (JSON_OUT) {
    process.stdout.write(JSON.stringify({
      ok: true, mode: spec.mode, cycles: state.iteration, stop: stop.reason, events, handoff,
    }) + '\n');
  } else {
    log('STOP: ' + stop.reason + ' após ' + state.iteration + ' ciclo(s)');
    console.log('\n' + handoff + '\n');
    log('ledger → ' + join(OUT_DIR, 'loop-ledger.jsonl'));
  }
}

main().catch((e) => { console.error('moo-loop-runner fatal:', e && e.stack || e); process.exit(1); });
