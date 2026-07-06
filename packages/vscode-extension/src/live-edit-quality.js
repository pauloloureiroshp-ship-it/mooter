'use strict';
/**
 * live-edit-quality.js — LP-4.7 §1/§2 · the Moo Quality Engine for the fenced LOCAL path.
 *
 * The insight (study §1): our parse+fence+import-check is a PERFECT deterministic verifier, and
 * best-of-N against a cheap verifier is where small local models close the gap on big ones
 * (Weaver; "Budget Reallocation": N samples of the small model beat 1 of the big one). So:
 *
 *   Round 1 — 1 greedy sample (T=0.1, today's behaviour). Fails? → up to N=4 samples at T=0.7,
 *             sequential, FIRST VALID WINS (no wasted GPU after a pass).
 *   Round 2 — same shape, but every prompt carries the EXACT error the verifier produced
 *             (arxiv 2604.10508: 2 rounds capture 76-95% of the repair gain; parse-class errors
 *             repair at the highest rate; beyond 2 rounds rarely resolves).
 *   Exhausted → { ok:false, reason:'local-quality-exhausted', evidence } — the EVIDENCE for the
 *             panel's escalation offer ("o moo local falhou 2× (motivo) — subir para Sonnet?").
 *             Escalation is NEVER taken here: this module never talks to the cloud. The user
 *             clicks or nothing happens. That is routing-by-evidence, the product's whole point.
 *
 * The verifier each sample must pass, in order — exactly what the WRITE path will re-run later
 * (this loop only filters; extension.js re-fences everything against the live disk at write
 * time, so nothing this module does relaxes the write fence):
 *   1. spliceNodeRange dry-run against the loop-start source+range (parse · single root ·
 *      no comments · byte-bounded),
 *   2. verifyImports on the envelope's new_imports (resolve in node_modules/package.json;
 *      lucide names on the vendored whitelist),
 *   3. insertImports dry-run on the spliced output (collisions/junk refuse before any write).
 *
 * Infra failures (Ollama offline/timeout/http error) ABORT the loop as-is — sampling cannot
 * repair a dead daemon, and today's single-call UX already reports those honestly.
 *
 * Telemetry (pass-rate for the Director's Cut): one JSONL record per loop under
 * ~/.mooter/telemetry/live-edit-quality.jsonl — FEATURES ONLY (reasons, rounds, latency,
 * model). Never the prompt, never the node, never the reply. Fail-soft: telemetry can never
 * break an edit.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

const DEFAULT_GREEDY_T = 0.1;
const DEFAULT_SAMPLING_T = 0.7;
const DEFAULT_SAMPLES_PER_ROUND = 4; // T=0.7 burst AFTER the greedy try, per round
const DEFAULT_MAX_ROUNDS = 2;
// Sampling repairs quality, not infrastructure — these reasons abort the loop immediately.
const ABORT_REASONS = new Set(['local-model-offline', 'local-model-timeout', 'local-model-error', 'bad-request', 'node-too-large']);

function telemetryFile() { return path.join(os.homedir(), '.mooter', 'telemetry', 'live-edit-quality.jsonl'); }

function defaultTelemetrySink(record) {
  try {
    const file = telemetryFile();
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.appendFileSync(file, JSON.stringify(record) + '\n', 'utf8');
  } catch { /* telemetry must never break an edit */ }
}

// One sample through the full verifier. Returns { valid:true, replacement, imports } or
// { valid:false, reason, detail } or { abort:true, reply } (infra — bubble the honest reason).
function verifySample(reply, ctx) {
  if (!reply || reply.ok !== true) {
    const reason = (reply && reply.reason) || 'error';
    if (ABORT_REASONS.has(reason)) return { abort: true, reply: reply || { ok: false, reason: 'error' } };
    return { valid: false, reason, detail: reply && reply.detail };
  }
  const text = String(reply.text || '');
  const splice = ctx.ast.spliceNodeRange(ctx.source, ctx.range, text);
  if (!splice.ok) return { valid: false, reason: splice.reason, detail: splice.detail };
  const vi = ctx.assets.verifyImports(reply.newImports, { wsRoot: ctx.wsRoot, file: ctx.absFile });
  if (!vi.ok) return { valid: false, reason: vi.reason, detail: vi.detail };
  const statements = vi.imports.map((i) => i.statement);
  if (statements.length > 0) {
    const ins = ctx.ast.insertImports(splice.code, statements);
    if (!ins.ok) return { valid: false, reason: ins.reason, detail: ins.detail };
  }
  return { valid: true, replacement: text, imports: statements };
}

// The exact-error feedback block for round 2 — the verifier's words, verbatim, nothing invented.
function feedbackBlock(failure) {
  const what = String(failure.reason || 'recusado') + (failure.detail ? (': ' + String(failure.detail)) : '');
  return 'ATENÇÃO: a tua resposta anterior foi RECUSADA pela verificação — ' + what + '. '
    + 'Corrige exactamente este problema e devolve o elemento JSX completo de novo.';
}

/**
 * runQualityLoop({ nodeSource, prompt, file, line }, opts) →
 *   { ok:true, replacement, imports, model, passed:{round,sample,temperature}, samplesTried }
 * | { ok:false, reason:'local-quality-exhausted', evidence }
 * | { ok:false, reason:<infra>, detail? }   (aborted as-is, same UX as the single-call path)
 *
 * opts: source + range (loop-start fence context, REQUIRED) · wsRoot · absFile ·
 * rewrite/ast/assets/telemetrySink/onStatus (injectable) · greedyTemperature ·
 * samplingTemperature · samplesPerRound · maxRounds · model/baseUrl/timeoutMs/prefsFile/
 * fetchImpl passthrough.
 */
async function runQualityLoop(input, opts) {
  const o = opts || {};
  const ast = o.ast || require('./live-edit-ast.js');
  const assets = o.assets || require('./live-edit-assets.js');
  const rewrite = o.rewrite || require('./live-edit-model.js').rewriteElement;
  const sink = o.telemetrySink || defaultTelemetrySink;
  const onStatus = (typeof o.onStatus === 'function') ? o.onStatus : () => {};
  if (typeof o.source !== 'string' || !o.source || !o.range) return { ok: false, reason: 'bad-request', detail: 'no fence context' };
  const greedyT = Number.isFinite(o.greedyTemperature) ? o.greedyTemperature : DEFAULT_GREEDY_T;
  const samplingT = Number.isFinite(o.samplingTemperature) ? o.samplingTemperature : DEFAULT_SAMPLING_T;
  const perRound = (Number.isInteger(o.samplesPerRound) && o.samplesPerRound >= 0) ? o.samplesPerRound : DEFAULT_SAMPLES_PER_ROUND;
  const maxRounds = (Number.isInteger(o.maxRounds) && o.maxRounds > 0) ? o.maxRounds : DEFAULT_MAX_ROUNDS;
  const ctx = { ast, assets, source: o.source, range: o.range, wsRoot: o.wsRoot, absFile: o.absFile };
  const passthrough = { model: o.model, baseUrl: o.baseUrl, timeoutMs: o.timeoutMs, prefsFile: o.prefsFile, fetchImpl: o.fetchImpl };
  const assetBlock = assets.buildAssetBlock(input && input.prompt, { wsRoot: o.wsRoot });
  const t0 = Date.now();
  const failures = [];
  let modelUsed = o.model || null;
  let samplesTried = 0;
  let currentRound = 0;

  const record = (outcome, extra) => {
    sink(Object.assign({
      ts: new Date().toISOString(),
      engine: 'lp47-quality',
      model: modelUsed,
      outcome,
      rounds: currentRound,
      samplesTried,
      assetBlock: !!assetBlock,
      failures: failures.map((f) => ({ round: f.round, sample: f.sample, temperature: f.temperature, reason: f.reason })),
      latencyMs: Date.now() - t0,
    }, extra || {}));
  };

  for (let round = 1; round <= maxRounds; round++) {
    currentRound = round;
    const blocks = [];
    if (assetBlock) blocks.push(assetBlock);
    if (round > 1 && failures.length > 0) blocks.push(feedbackBlock(failures[failures.length - 1]));
    // Greedy first (sample 0), then the T-diverse burst. First valid wins the whole loop.
    for (let sample = 0; sample <= perRound; sample++) {
      const temperature = sample === 0 ? greedyT : samplingT;
      onStatus({ phase: 'sampling', round, rounds: maxRounds, sample: sample + 1, of: perRound + 1 });
      samplesTried++;
      const reply = await rewrite(input, Object.assign({}, passthrough, { envelope: true, temperature, extraBlocks: blocks }));
      if (reply && reply.model) modelUsed = reply.model;
      const v = verifySample(reply, ctx);
      if (v.abort) {
        record('aborted', { abortReason: v.reply.reason });
        return v.reply;
      }
      if (v.valid) {
        record('passed', { passed: { round, sample, temperature } });
        return { ok: true, replacement: v.replacement, imports: v.imports, model: modelUsed, passed: { round, sample, temperature }, samplesTried };
      }
      failures.push({ round, sample, temperature, reason: v.reason, detail: v.detail == null ? undefined : String(v.detail).slice(0, 200) });
    }
  }
  const last = failures[failures.length - 1];
  record('exhausted');
  return {
    ok: false,
    reason: 'local-quality-exhausted',
    evidence: {
      model: modelUsed,
      rounds: maxRounds,
      samplesTried,
      lastReason: last && last.reason,
      lastDetail: last && last.detail,
      failures,
    },
  };
}

module.exports = {
  runQualityLoop,
  verifySample,
  feedbackBlock,
  telemetryFile,
  DEFAULT_GREEDY_T,
  DEFAULT_SAMPLING_T,
  DEFAULT_SAMPLES_PER_ROUND,
  DEFAULT_MAX_ROUNDS,
  ABORT_REASONS,
};
