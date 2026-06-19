'use strict';

/**
 * moo-loop — cheap, safe agentic loop engine. FASE 1: `until <verify>`.
 *
 * The governance layer under Boris-style loop engineering ("I write loops, not
 * prompts"). The native loop runs expensive, stops on an opinion, and can wreck
 * things. moo-loop keeps the loop but:
 *   - STOPS BY PROOF       — the stop-condition is moo-verify ($0, deterministic),
 *                            never the model's self-assessment (no self-preference).
 *   - CAPS HARD            — --max-cost and --max-iters are ENFORCEMENT (they stop
 *                            the loop), plus a no-progress abort. Not advisory.
 *   - NEVER WRECKS         — moo-risk vets every attempt before it runs; a
 *                            destructive action is blocked and the loop stops.
 *   - ROUTES LOCAL-FIRST   — the attempt is a leaf tick routed local ($0) via the
 *                            cost plane. (Near-objective escalation to a frontier
 *                            model is FASE 3; this file leaves an explicit seam.)
 *
 * The whole stop / risk / budget path is pure Node + shell — ZERO paid LLM. The
 * code-fixing "attempt" is DELEGATED via --attempt-cmd (the coder), never owned
 * here. That is what keeps this engine deterministic and unit-testable at $0.
 *
 * Imports (never duplicates — see CLAUDE.md "importa, não dupliques"):
 *   ./moo-verify.js      the deterministic critic / stop-condition (spawned as CLI)
 *   ./moo-risk.js        assess(action, {layer:'tool'}) — destructive-action gate
 *   ./subagent-route.js  decideRoute({role,task}) — local-first tick routing
 *   ./pricing.js         priceTurn() — honest cost accounting for cloud ticks
 */

const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { assess, isBlocking } = require('./moo-risk');
const { decideRoute } = require('./subagent-route');
const { priceTurn } = require('./pricing');

const VERIFY_CLI = path.join(__dirname, 'moo-verify.js');

// Token estimate for a single cloud attempt turn. Used ONLY to price a cloud
// tick so the budget gate trips before the spend, not after. Local ticks are
// always $0 and never consult this. Conservative-high so the cap errs early.
const ATTEMPT_EST_IN = 6000;
const ATTEMPT_EST_OUT = 1200;

const DEFAULT_NO_PROGRESS = 3; // consecutive non-improving verifies → abort

/** The loop's verdict vocabulary. `verified` is the ONLY success stop. */
const STOP = {
  VERIFIED: 'verified', // moo-verify pass:true — stop the instant it's proven done
  MAX_ITERS: 'max-iters', // backstop hit
  MAX_COST: 'max-cost', // budget enforcement cut the expensive source
  NO_PROGRESS: 'no-progress', // signal stalled — stop "trying the same thing"
  RISK_BLOCKED: 'risk-blocked', // moo-risk vetoed a destructive attempt
};

/** Exit codes: success 0, risk veto 2 (mirrors moo-risk), other non-met 1. */
const EXIT = { [STOP.VERIFIED]: 0, [STOP.RISK_BLOCKED]: 2 };
const exitFor = (reason) => (reason in EXIT ? EXIT[reason] : 1);

function loopHome() {
  const home = process.env.MOOTER_HOME || path.join(os.homedir(), '.mooter');
  try { fs.mkdirSync(home, { recursive: true }); } catch { /* best effort */ }
  return home;
}

/**
 * A pristine environment for the critic and the coder. moo-verify runs the
 * TARGET project's own test runner; it must never inherit a parent Node
 * test-runner context (e.g. running moo-loop from inside `node --test` or CI),
 * which would make a nested `node --test` falsely report green. Strip those.
 */
function cleanEnv(extra) {
  const env = { ...process.env, ...extra };
  delete env.NODE_TEST_CONTEXT;
  delete env.NODE_OPTIONS;
  return env;
}

/**
 * Run the deterministic critic and parse its verdict. $0, no LLM.
 * moo-verify prints `{pass, checks, blocking, project}` to stdout (exit 0 pass /
 * 2 fail). If it cannot emit JSON we treat that as an HONEST failure — never a
 * fabricated pass.
 */
function runVerify(cwd, profile) {
  const res = spawnSync(process.execPath, [VERIFY_CLI], {
    cwd,
    env: cleanEnv({ MOO_VERIFY_CWD: cwd, MOO_VERIFY_PROFILE: profile || '' }),
    encoding: 'utf8',
  });
  let parsed = null;
  try { parsed = JSON.parse(res.stdout); } catch { /* fall through */ }
  if (!parsed || typeof parsed.pass !== 'boolean') {
    const why = (res.stderr || res.stdout || 'moo-verify produced no parseable output').trim();
    parsed = { pass: false, checks: [], blocking: [{ name: 'verify', signal: why.slice(0, 200) }] };
  }
  return parsed;
}

/**
 * Progress metric from a verify result. `signal` = number of failing required
 * checks (lower = closer to green; 0 == done). Deterministic, computed locally —
 * this is what governs the no-progress abort and, in FASE 3, near-objective
 * escalation.
 */
function progressOf(result) {
  const failing = (result.checks || []).filter((c) => c.pass === false).length;
  const blocking = (result.blocking || []).length;
  return Math.max(failing, blocking);
}

/**
 * Route this tick. FASE 1 is local-first: the attempt is a leaf "run tests / fix
 * failing checks" tick, which the cost plane routes to local Ollama ($0). The one
 * exception is a SAFETY upgrade — if the goal text itself is high-risk, decideRoute
 * forces cloud+Opus (never a silent downgrade), and the budget gate then governs it.
 * Near-objective escalation by `signal` is FASE 3.
 */
function routeTick(goal) {
  return decideRoute({ role: 'run tests', task: goal || '' }); // {target, model, risk, role_class, reason}
}

/** Price a tick. Local is always free; a cloud tick is priced via the SSOT. */
function tickCostOf(route) {
  return route.target === 'cloud' ? priceTurn(route.model, ATTEMPT_EST_IN, ATTEMPT_EST_OUT) : 0;
}

/** Deterministic risk gate, run on the attempt command before it executes. */
function riskGate(attemptCmd) {
  if (!attemptCmd) return { blocked: false, verdict: null };
  const verdict = assess(attemptCmd, { layer: 'tool' });
  return { blocked: isBlocking(verdict.action), verdict };
}

/** Execute the delegated coder. Fresh process each tick + goal re-injected via env. */
function runAttempt(attemptCmd, ctx) {
  if (!attemptCmd) return { code: 0, skipped: true };
  const res = spawnSync('bash', ['-c', attemptCmd], {
    cwd: ctx.cwd,
    env: cleanEnv({
      MOO_LOOP_GOAL: ctx.goal || '', // re-inject the goal every tick (anti goal-drift)
      MOO_LOOP_STATE_FILE: ctx.stateFile,
      MOO_LOOP_SIGNAL: String(ctx.signal),
      MOO_LOOP_ITER: String(ctx.iter),
    }),
    encoding: 'utf8',
  });
  return { code: res.status, stdout: res.stdout, stderr: res.stderr };
}

/**
 * The versioned scratchpad. Re-hydrated and re-written every tick so the loop's
 * memory lives on disk, not in a context window (Ralph pattern). The attempt
 * reads this fresh each iteration via MOO_LOOP_STATE_FILE.
 */
function renderState({ id, goal, iter, signal, spent, maxCost, result, history }) {
  const blocking = (result.blocking || []).map((b) => `- ${b.name}: ${b.signal}`).join('\n') || '- (none)';
  const hist = history.map((h) =>
    `- iter ${h.iter}: signal ${h.signal} · ${h.target} ${h.model} · $${h.cost.toFixed(4)}`).join('\n') || '- (none yet)';
  return [
    `# MOO_LOOP — ${id}`,
    `<!-- versioned scratchpad: re-hydrated + goal re-injected each tick. NOT a transcript. -->`,
    ``,
    `## Goal (re-injected every tick)`,
    goal ? goal : '(none — verify-only mode)',
    ``,
    `## Status`,
    `- iteration: ${iter}`,
    `- signal (failing required checks): ${signal}`,
    `- spent: $${spent.toFixed(4)} / cap $${maxCost.toFixed(4)}`,
    `- last verify: ${result.pass ? 'GREEN ✓' : 'RED ✗'}`,
    ``,
    `## Blocking (what is red)`,
    blocking,
    ``,
    `## History`,
    hist,
    ``,
  ].join('\n');
}

function appendLog(logFile, entry) {
  try { fs.appendFileSync(logFile, JSON.stringify(entry) + '\n'); } catch { /* advisory */ }
}

/**
 * The loop. Returns a verdict object; does not exit the process (the CLI does).
 * @param {object} opts
 * @param {string} opts.verifyProfile  e.g. 'default' (label; moo-verify auto-detects)
 * @param {number} opts.maxCost        hard USD cap (enforcement)
 * @param {number} opts.maxIters       backstop iteration cap
 * @param {string} [opts.goal]         verifiable predicate, re-injected each tick
 * @param {string} [opts.attemptCmd]   the delegated coder (one fix attempt per tick)
 * @param {string} [opts.cwd]          target repo
 * @param {number} [opts.noProgress]   abort after N non-improving verifies (0 = off)
 */
function runLoop(opts) {
  const cwd = opts.cwd || process.env.MOO_VERIFY_CWD || process.cwd();
  const maxIters = opts.maxIters;
  const maxCost = opts.maxCost;
  const noProgressN = opts.noProgress == null ? DEFAULT_NO_PROGRESS : opts.noProgress;
  const goal = opts.goal || '';
  const attemptCmd = opts.attemptCmd || '';
  const id = opts.id || `loop-${Date.now().toString(36)}`;
  const stateFile = path.join(cwd, 'MOO_LOOP.md');
  const logFile = path.join(loopHome(), `${id}.jsonl`);

  let spent = 0;
  let bestSignal = Infinity;
  let sinceImprove = 0;
  const history = [];

  const finish = (reason, extra) => {
    const verdict = {
      id, stop_reason: reason, cwd, goal: goal || null,
      iters: extra.iter, signal: extra.signal,
      spent_usd: Number(spent.toFixed(6)), max_cost: maxCost, max_iters: maxIters,
      pass: reason === STOP.VERIFIED,
      blocking: (extra.result && extra.result.blocking) || [],
      history,
      ...(extra.risk ? { risk: extra.risk } : {}),
    };
    appendLog(logFile, { phase: 'stop', ...verdict });
    try { fs.writeFileSync(stateFile, renderState({ id, goal, iter: extra.iter, signal: extra.signal, spent, maxCost, result: extra.result || { pass: reason === STOP.VERIFIED, blocking: [] }, history })); } catch { /* advisory */ }
    return verdict;
  };

  for (let iter = 0; ; iter++) {
    // 1. STOP-CONDITION FIRST — the deterministic critic, $0. Success is checked
    //    before any cap so we never "fail" a loop that is actually green.
    const result = runVerify(cwd, opts.verifyProfile);
    const signal = progressOf(result);
    appendLog(logFile, { phase: 'verify', iter, signal, pass: result.pass });

    if (result.pass) return finish(STOP.VERIFIED, { iter, signal, result });

    // 2. HARD CAP: iterations.
    if (iter >= maxIters) return finish(STOP.MAX_ITERS, { iter, signal, result });

    // 3. NO-PROGRESS abort: if the failing-check count has not reached a new low
    //    in N consecutive verifies, stop (don't keep paying to try the same thing).
    if (signal < bestSignal) { bestSignal = signal; sinceImprove = 0; }
    else { sinceImprove += 1; }
    if (noProgressN > 0 && sinceImprove >= noProgressN) {
      return finish(STOP.NO_PROGRESS, { iter, signal, result });
    }

    // 4. ROUTE (local-first; near-objective escalation = FASE 3).
    const route = routeTick(goal);
    const tickCost = tickCostOf(route);

    // 5. BUDGET gate — cut the expensive source BEFORE paying for the attempt.
    if (spent + tickCost > maxCost) return finish(STOP.MAX_COST, { iter, signal, result });

    // 6. RISK gate — deterministic veto before ANY action runs.
    const { blocked, verdict } = riskGate(attemptCmd);
    if (blocked) {
      appendLog(logFile, { phase: 'risk_blocked', iter, reason: verdict.reason });
      return finish(STOP.RISK_BLOCKED, { iter, signal, result, risk: verdict });
    }

    // 7. Record the tick, refresh the scratchpad, run the delegated coder.
    history.push({ iter, signal, target: route.target, model: route.model, cost: tickCost });
    try { fs.writeFileSync(stateFile, renderState({ id, goal, iter, signal, spent, maxCost, result, history })); } catch { /* advisory */ }
    const attempt = runAttempt(attemptCmd, { cwd, goal, stateFile, signal, iter });
    spent += tickCost;
    appendLog(logFile, { phase: 'attempt', iter, target: route.target, model: route.model, cost: tickCost, code: attempt.code, skipped: !!attempt.skipped });
  }
}

// ── CLI ──────────────────────────────────────────────────────────────────────
// Usage:
//   node moo-loop.js until <verify-profile> --max-cost $X --max-iters N \
//        [--goal "<predicate>"] [--attempt-cmd "<cmd>"] [--cwd <path>] \
//        [--no-progress N] [--json]
//
// OPT-IN BY CONSTRUCTION: refuses to run without BOTH --max-cost AND --max-iters.
function parseArgs(argv) {
  const a = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const t = argv[i];
    if (t === '--json') { a.json = true; continue; }
    if (t.startsWith('--')) { a[t.slice(2)] = argv[++i]; continue; }
    a._.push(t);
  }
  return a;
}

function usage(msg) {
  if (msg) process.stderr.write(`moo-loop: ${msg}\n`);
  process.stderr.write(
    'usage: node moo-loop.js until <verify-profile> --max-cost $X --max-iters N \\\n' +
    '         [--goal "<predicate>"] [--attempt-cmd "<cmd>"] [--cwd <path>] [--no-progress N] [--json]\n' +
    '  opt-in by design: BOTH --max-cost and --max-iters are required.\n'
  );
  process.exit(64);
}

function money(s) {
  if (s == null) return NaN;
  return parseFloat(String(s).replace(/^\$/, ''));
}

function summarize(v) {
  const head = {
    [STOP.VERIFIED]: '✓ VERIFIED — stopped by proof (tests green)',
    [STOP.MAX_ITERS]: '■ MAX-ITERS — backstop hit',
    [STOP.MAX_COST]: '■ MAX-COST — budget cut the expensive source',
    [STOP.NO_PROGRESS]: '■ NO-PROGRESS — signal stalled, stopped trying the same thing',
    [STOP.RISK_BLOCKED]: '⛔ RISK-BLOCKED — destructive action vetoed by moo-risk',
  }[v.stop_reason] || v.stop_reason;
  const lines = [
    `moo-loop ${v.id}`,
    head,
    `  iters: ${v.iters}/${v.max_iters} · signal: ${v.signal} · spent: $${v.spent_usd.toFixed(4)}/$${v.max_cost.toFixed(2)}`,
  ];
  if (!v.pass && v.blocking && v.blocking.length) {
    lines.push(`  red: ${v.blocking.map((b) => `${b.name} (${b.signal})`).join(', ')}`);
  }
  if (v.risk) lines.push(`  risk: ${v.risk.reason}`);
  return lines.join('\n');
}

if (require.main === module) {
  const a = parseArgs(process.argv.slice(2));
  const sub = a._[0];
  if (sub !== 'until') usage(`unknown or missing subcommand "${sub || ''}" (only "until" in FASE 1)`);

  const verifyProfile = (a._[1] || 'default').replace(/^verify:/, '');
  const maxCost = money(a['max-cost']);
  const maxIters = parseInt(a['max-iters'], 10);
  if (!Number.isFinite(maxCost) || !Number.isFinite(maxIters)) {
    usage('both --max-cost and --max-iters are required and must be numbers');
  }

  const verdict = runLoop({
    verifyProfile,
    maxCost,
    maxIters,
    goal: a.goal,
    attemptCmd: a['attempt-cmd'],
    cwd: a.cwd,
    noProgress: a['no-progress'] != null ? parseInt(a['no-progress'], 10) : undefined,
  });

  if (a.json) process.stdout.write(JSON.stringify(verdict, null, 2) + '\n');
  else process.stdout.write(summarize(verdict) + '\n');
  process.exit(exitFor(verdict.stop_reason));
}

module.exports = { runLoop, progressOf, routeTick, tickCostOf, riskGate, STOP, EXIT };
