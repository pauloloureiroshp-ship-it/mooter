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
const { priceTurn, TIER_TO_PRICING_KEY } = require('./pricing');

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

// ── poll mode (FASE 2): wrap the native /loop with a free local tick ──────────
//
// `moo-loop poll` does NOT reinvent cron. The native /loop fires on the interval;
// each fire runs `poll-tick`, which runs the check LOCALLY ($0) and only signals
// ACTIONABLE (→ the session may spend a paid model) when the check finds something
// AND the per-window budget still allows it. Everything here is deterministic.

const POLL_EST_IN = 6000;
const POLL_EST_OUT = 1200;

// Real /loop limits — confirmed from the official docs in FASE 0
// (code.claude.com/docs/en/scheduled-tasks): minimum interval 1 minute, units
// s/m/h/d, and a recurring task expires 7 days after creation.
const MIN_INTERVAL_SEC = 60;
const LOOP_EXPIRY_DAYS = 7;

/** Parse '30s'|'5m'|'2h'|'1d' → seconds. Sub-minute rounds UP to 60s (cron granularity). */
function parseInterval(s) {
  const m = String(s || '').trim().match(/^(\d+)\s*([smhd])$/i);
  if (!m) return null;
  const mult = { s: 1, m: 60, h: 3600, d: 86400 }[m[2].toLowerCase()];
  return Math.max(MIN_INTERVAL_SEC, parseInt(m[1], 10) * mult);
}

function fmtInterval(sec) {
  if (sec % 86400 === 0) return `${sec / 86400}d`;
  if (sec % 3600 === 0) return `${sec / 3600}h`;
  return `${Math.round(sec / 60)}m`;
}

function pollLog(id) { return path.join(loopHome(), `poll-${id}.jsonl`); }

/** Decide if a check result is actionable, per the rule. Deterministic, $0. */
function isActionable(result, rule) {
  const r = rule || 'nonempty';
  const out = (result.stdout || '').trim();
  if (r === 'nonempty') return out.length > 0;
  if (r === 'empty') return out.length === 0;
  if (r === 'nonzero') return result.code !== 0;
  if (r === 'zero') return result.code === 0;
  if (r.startsWith('match:')) { try { return new RegExp(r.slice(6)).test(out); } catch { return false; } }
  return out.length > 0;
}

/** Run the check locally ($0), in an isolated env. */
function runCheck(checkCmd, cwd) {
  const res = spawnSync('bash', ['-c', checkCmd], { cwd, env: cleanEnv({}), encoding: 'utf8' });
  return { code: res.status, stdout: res.stdout || '', stderr: res.stderr || '' };
}

/**
 * Escalation $ already committed this poll window, summed from its append-only log.
 * Relies on the native /loop firing ticks BETWEEN turns (never concurrently — FASE-0
 * docs), so this read-then-append accounting is race-free in practice.
 */
function windowSpent(id) {
  let spent = 0;
  try {
    for (const ln of fs.readFileSync(pollLog(id), 'utf8').split('\n')) {
      if (!ln) continue;
      try { const e = JSON.parse(ln); if (e.phase === 'tick' && e.escalated) spent += (e.cost || 0); } catch { /* skip */ }
    }
  } catch { /* no log yet */ }
  return spent;
}

/**
 * One poll fire — what the native /loop calls each interval. Runs the check
 * LOCALLY ($0); signals ACTIONABLE only when the check finds something AND the
 * per-window budget still allows the paid escalation. Never runs a destructive
 * check (risk-gated). Returns a verdict object and logs the tick.
 */
function pollTick(opts) {
  const cwd = opts.cwd || process.cwd();
  const id = opts.id || 'default';
  // Floor-tier ESTIMATE for the would-be escalation: the session that acts on an
  // ACTIONABLE signal may classify its own prompt higher (deploy/secrets → T3 Opus),
  // so the window cap is a floor, not a guarantee. Pass --escalate-tier T3 to budget
  // conservatively. The logged cost is always a real pricing.js figure, never fabricated.
  const escTier = (opts.escalateTier || 'T2').toUpperCase();
  const maxCost = opts.maxCost == null ? Infinity : opts.maxCost; // window budget (USD)
  const log = (v) => { appendLog(pollLog(id), v); return v; };

  // Never EXECUTE a destructive "check". NOTE: this vets the LITERAL command string,
  // not runtime-expanded forms (var indirection, base64|eval). That is sound here
  // because the check is the operator's own /loop command, not untrusted input.
  const rk = assess(opts.check || '', { layer: 'tool' });
  if (isBlocking(rk.action)) {
    return log({ phase: 'tick', id, actionable: false, escalated: false, cost: 0, verdict: 'risk-blocked', reason: rk.reason });
  }

  const result = runCheck(opts.check, cwd);
  if (!isActionable(result, opts.actionableWhen)) {
    return log({ phase: 'tick', id, actionable: false, escalated: false, cost: 0, exit: result.code ?? null, verdict: 'quiet' });
  }

  // actionable → a paid model would act; gate on the per-window budget
  const escModel = TIER_TO_PRICING_KEY[escTier] || 'claude-sonnet-4-6';
  const estCost = priceTurn(escModel, POLL_EST_IN, POLL_EST_OUT);
  const already = windowSpent(id);
  if (Number.isFinite(maxCost) && already + estCost > maxCost) {
    return log({ phase: 'tick', id, actionable: true, escalated: false, cost: 0, verdict: 'budget-exhausted', window_spent: Number(already.toFixed(6)), max_cost: maxCost });
  }
  return log({
    phase: 'tick', id, actionable: true, escalated: true, cost: estCost, model: escModel,
    verdict: 'actionable', escalate: opts.escalate || '', signal: (result.stdout || '').trim().slice(0, 200),
  });
}

/**
 * `moo-loop poll <interval> "<check>"` — validates the interval against the REAL
 * /loop limits, prints the native /loop wiring that runs a free local poll-tick
 * each fire, and initialises the budget window. Does NOT reinvent cron.
 */
function pollSetup(opts) {
  const sec = parseInterval(opts.interval);
  if (!sec) return { ok: false, error: `bad interval "${opts.interval}" — use 30s|5m|2h|1d` };
  const id = opts.id || Date.now().toString(36); // pollLog() adds the "poll-" prefix
  const cap = Number.isFinite(opts.maxCost) ? ` --max-cost $${opts.maxCost}` : '';
  const esc = opts.escalate ? ` --escalate ${JSON.stringify(opts.escalate)}` : '';
  const tickCmd =
    `node ${JSON.stringify(__filename)} poll-tick --id ${id} --check ${JSON.stringify(opts.check)}` +
    ` --actionable-when ${opts.actionableWhen || 'nonempty'}${cap}${esc}`;
  appendLog(pollLog(id), { phase: 'open', id, interval: fmtInterval(sec), max_cost: Number.isFinite(opts.maxCost) ? opts.maxCost : null });
  return { ok: true, id, interval: fmtInterval(sec), loopLine: `/loop ${fmtInterval(sec)} ${tickCmd}`, expiryDays: LOOP_EXPIRY_DAYS, log: pollLog(id) };
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
    'usage:\n' +
    '  node moo-loop.js until <verify-profile> --max-cost $X --max-iters N \\\n' +
    '       [--goal "<predicate>"] [--attempt-cmd "<cmd>"] [--cwd <path>] [--no-progress N] [--json]\n' +
    '    opt-in by design: BOTH --max-cost and --max-iters are required.\n' +
    '  node moo-loop.js poll <interval> "<check>" [--max-cost $X] [--actionable-when nonempty|empty|nonzero|zero|match:RE] [--escalate "<what>"]\n' +
    '    prints the native /loop wiring; the tick runs local ($0), pays only when ACTIONABLE.\n'
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

function cmdUntil(a) {
  const verifyProfile = (a._[1] || 'default').replace(/^verify:/, '');
  const maxCost = money(a['max-cost']);
  const maxIters = parseInt(a['max-iters'], 10);
  if (!Number.isFinite(maxCost) || !Number.isFinite(maxIters)) {
    usage('both --max-cost and --max-iters are required and must be numbers');
  }
  const verdict = runLoop({
    verifyProfile, maxCost, maxIters,
    goal: a.goal, attemptCmd: a['attempt-cmd'], cwd: a.cwd,
    noProgress: a['no-progress'] != null ? parseInt(a['no-progress'], 10) : undefined,
  });
  if (a.json) process.stdout.write(JSON.stringify(verdict, null, 2) + '\n');
  else process.stdout.write(summarize(verdict) + '\n');
  process.exit(exitFor(verdict.stop_reason));
}

function cmdPoll(a) {
  const interval = a._[1];
  const check = a._.slice(2).join(' ');
  if (!interval || !check) usage('poll needs an interval and a "<check>"');
  const r = pollSetup({
    interval, check,
    maxCost: a['max-cost'] != null ? money(a['max-cost']) : undefined,
    actionableWhen: a['actionable-when'], escalate: a.escalate,
  });
  if (!r.ok) usage(r.error);
  if (a.json) { process.stdout.write(JSON.stringify(r, null, 2) + '\n'); process.exit(0); }
  process.stdout.write(
    `🐮 moo-loop poll — wraps the native /loop (does not reinvent cron)\n` +
    `  interval: ${r.interval} (min 1m; a recurring /loop expires after ${r.expiryDays}d — recreate to extend)\n` +
    `  window log: ${r.log}\n` +
    `Paste this to start it:\n  ${r.loopLine}\n` +
    `The tick runs LOCAL ($0); a paid model is spent only on a tick that prints ACTIONABLE.\n`
  );
  process.exit(0);
}

function cmdPollTick(a) {
  if (a.check == null) usage('poll-tick needs --check "<cmd>"');
  const v = pollTick({
    id: a.id, check: a.check, cwd: a.cwd,
    actionableWhen: a['actionable-when'],
    maxCost: a['max-cost'] != null ? money(a['max-cost']) : undefined,
    escalate: a.escalate, escalateTier: a['escalate-tier'],
  });
  if (a.json) { process.stdout.write(JSON.stringify(v, null, 2) + '\n'); process.exit(v.verdict === 'actionable' ? 10 : 0); }
  const line = {
    quiet: `🐮 poll-tick QUIET ($0) — nothing actionable`,
    actionable: `🐮 poll-tick ACTIONABLE → escalate (est $${(v.cost || 0).toFixed(4)} via ${v.model}): ${v.signal}\n${v.escalate || ''}`,
    'budget-exhausted': `🐮 poll-tick BUDGET-EXHAUSTED — actionable but window cap $${v.max_cost} reached; staying local ($0)`,
    'risk-blocked': `🐮 poll-tick RISK-BLOCKED — refusing destructive check: ${v.reason}`,
  }[v.verdict] || v.verdict;
  process.stdout.write(line + '\n');
  process.exit(v.verdict === 'actionable' ? 10 : v.verdict === 'risk-blocked' ? 3 : 0);
}

if (require.main === module) {
  const a = parseArgs(process.argv.slice(2));
  const sub = a._[0];
  if (sub === 'until') cmdUntil(a);
  else if (sub === 'poll') cmdPoll(a);
  else if (sub === 'poll-tick') cmdPollTick(a);
  else usage(`unknown or missing subcommand "${sub || ''}" (use "until" or "poll")`);
}

module.exports = {
  runLoop, progressOf, routeTick, tickCostOf, riskGate, STOP, EXIT,
  pollTick, pollSetup, isActionable, parseInterval, fmtInterval,
};
