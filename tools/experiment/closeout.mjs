// closeout.mjs — o fecho de uma onda: DERIVADO do diário, nunca descrito;
// contagens com denominadores completos; integridade recalculada; os campos de
// closeout_required do contrato 0.3 (lidos do ficheiro congelado — 21) preenchidos
// ou marcados; assinado por hash.
//
// PORQUÊ ISTO EXISTE (2026-09-16 · cc-plan-20260916-v1, passo 4 de P1.0)
// Regra do dono (commit f72aee42, 2026-08-17): «estado_persistente passa a ser
// DERIVADO do comportamento, nunca descrito. Se um recibo não pode ser
// calculado a partir do código, o campo não existe.» Aqui: planned, attempted,
// complete, partial, failed, unknown, not_started, denominadores, artefactos e
// hashes saem do events.jsonl e do disco. O que é julgamento humano
// (hipótese, contra-evidência, confounders, decisão, reviewer, próxima
// hipótese) entra marcado <<TODO>> até ser escrito — o padrão de
// tools/handoff-preflight.js. n/d é um valor, não um campo em branco.
//
// Condições do Cowork Prisma (16/09): conclusion.json leva
// semantics_version "0.3-proposed" e external_review "pending"; qualquer
// alteração posterior à SEMÂNTICA é uma AMENDMENT datada com testes, nunca
// edição silenciosa (SEMANTICS_VERSION abaixo é o que os testes fixam).
//
// O closeout NUNCA reescreve evidência: um manifesto ou uma captura
// adulterados aparecem em `integrity.violations` (caso 10). Interpretações
// novas vão para scores.jsonl ou para uma AMENDMENT; o conclusion.json final
// escreve-se uma vez.

import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';

import { appendEvent, readEvents, waveState, slotStates, verifyChain, JournalError } from './journal.mjs';
import { aggregateUsage } from './import.mjs';
import { readScores, countObservations, SCIENCE_FIELDS } from './scores.mjs';
import { verifyPins } from './pins.mjs';
import { loadContract } from './contract.mjs';

const require = createRequire(import.meta.url);
const { provHash } = require('../router/ledger-prov.js');

export const SEMANTICS_VERSION = '0.3-proposed';
export const CONCLUSION_SCHEMA = 'prisma-experiment-conclusion/0.3-proposed';
export const TODO = '<<TODO>>';
export const sha256 = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');

// AMENDMENT-001 (correcção mecânica): o vocabulário normativo vem do contrato
// congelado e pinado, não de constantes. A constante do passo 4 tinha 21 entradas
// e o comentário dizia «20»: é isso que uma cópia à mão faz.
const CONTRACT = loadContract();
/** contrato 0.3 storage.closeout_required — lido do ficheiro congelado (21 entradas em 0.3-proposed). */
export const CLOSEOUT_REQUIRED = CONTRACT.closeout_required;
/** Os que só um humano escreve. Os restantes são derivados. */
export const HUMAN_FIELDS = Object.freeze(['hypothesis_id', 'expected_result', 'counterevidence', 'confounders', 'decision', 'reviewer', 'next_hypothesis_id']);
export const DERIVED_FIELDS = Object.freeze(CLOSEOUT_REQUIRED.filter((k) => !HUMAN_FIELDS.includes(k)));
export const WAVE_DECISIONS = CONTRACT.wave_decisions;
export const OUTCOMES = CONTRACT.slot_outcomes;
export const CONTRACT_SHA256 = CONTRACT.sha256;

export class CloseoutError extends Error {
  constructor(code, message, details = {}) { super(message); this.name = 'CloseoutError'; this.code = code; this.details = details; }
}

// ── derivação ────────────────────────────────────────────────────────────────

function frozenPayload(events) {
  const f = events.find((e) => e.kind === 'wave.frozen');
  if (!f) throw new CloseoutError('not_frozen', 'sem wave.frozen no diário não há onda para fechar');
  const p = f.payload || {};
  if (!Array.isArray(p.slot_ids)) throw new CloseoutError('frozen_without_slots', 'o wave.frozen não traz slot_ids (manifesto congelado antes do passo 4?) — congelar de novo numa onda nova');
  return p;
}

/** Outcome de UM slot a partir do seu histórico. Puro. */
export function outcomeOf(slot) {
  const attempted = slot.history.includes('intent_committed');
  if (!attempted) return 'not_started';
  switch (slot.state) {
    case 'captured': case 'scored': case 'closed': {
      const cap = slot.captured;
      if (cap && cap.capture_completeness === 'full' && !cap.condition_divergent) return 'complete';
      return 'partial';
    }
    case 'failed': return 'failed';
    case 'known_not_submitted': return 'not_started'; // houve intenção, mas prova positiva de não-envio
    default: return 'unknown'; // intent_committed | submitted | submission_uncertain | capture_uncertain | policy_review
  }
}

/** Deriva tudo o que é mecânico. Não escreve. */
export function deriveOutcomes(events) {
  const frozen = frozenPayload(events);
  const states = slotStates(null, events);
  const per_slot = {};
  for (const slot_id of frozen.slot_ids) {
    const s = states.get(slot_id) || { slot_id, state: null, history: [], attempt_token: null };
    const capturedEv = [...events].reverse().find((e) => e.slot_id === slot_id && e.kind === 'captured');
    const failedEv = [...events].reverse().find((e) => e.slot_id === slot_id && e.kind === 'failed');
    const enriched = { ...s, captured: capturedEv ? capturedEv.payload : null };
    per_slot[slot_id] = {
      slot_id, prompt_id: frozen.prompt_of?.[slot_id] ?? null, role: frozen.roles?.[slot_id] ?? null,
      state: s.state, attempted: s.history.includes('intent_committed'), attempt_token: s.attempt_token,
      outcome: outcomeOf(enriched),
      capture_completeness: capturedEv ? capturedEv.payload.capture_completeness : null,
      condition_divergent: capturedEv ? !!capturedEv.payload.condition_divergent : null,
      refusal: capturedEv ? !!capturedEv.payload.refusal : null,
      search_used: capturedEv ? (capturedEv.payload.observed?.search_used ?? null) : null,
      answer_sha256: capturedEv ? capturedEv.payload.answer_sha256 : null,
      failure_class: failedEv ? failedEv.payload.class : null,
      usage: capturedEv ? capturedEv.payload.usage : null,
    };
  }
  const slots = Object.values(per_slot);
  const count = (pred) => slots.filter(pred).length;
  const counts = {
    planned: slots.length,
    attempted: count((x) => x.attempted),
    complete: count((x) => x.outcome === 'complete'),
    partial: count((x) => x.outcome === 'partial'),
    failed: count((x) => x.outcome === 'failed'),
    unknown: count((x) => x.outcome === 'unknown'),
    not_started: count((x) => x.outcome === 'not_started'),
    refusals: count((x) => x.refusal === true),
  };
  counts.identity_ok = counts.planned === counts.complete + counts.partial + counts.failed + counts.unknown + counts.not_started;
  const eligible = slots.filter((x) => x.role === 'eligible');
  const negative = slots.filter((x) => x.role === 'negative');
  const evaluable = (xs) => xs.filter((x) => x.outcome === 'complete' || x.outcome === 'partial');
  const denominators = {
    coverage_per_wave: slots.length,
    planned_eligible: eligible.length,
    negative: negative.length,
    eligible_evaluable: evaluable(eligible).length,
    eligible_complete: eligible.filter((x) => x.outcome === 'complete').length,
    negative_evaluable: evaluable(negative).length,
    caps_declared: frozen.caps ?? null,
  };
  const negative_control_outcomes = Object.fromEntries(OUTCOMES.map((o) => [o, negative.filter((x) => x.outcome === o).length]));
  const search_used_counts = { true: count((x) => x.search_used === true), false: count((x) => x.search_used === false), null: count((x) => x.answer_sha256 && x.search_used === null), no_capture: count((x) => !x.answer_sha256) };
  const usage = aggregateUsage(slots.map((x) => x.usage).filter(Boolean));
  return { frozen, per_slot, counts, denominators, negative_control_outcomes, search_used_counts, usage };
}

// ── integridade e artefactos ─────────────────────────────────────────────────

function walk(ctx, dir, rel = '') {
  const out = [];
  let names = [];
  try { names = ctx.fs.readdirSync(dir); } catch { return out; }
  for (const name of names.sort()) {
    const p = path.join(dir, name);
    const r = rel ? `${rel}/${name}` : name;
    let st = null;
    try { st = ctx.fs.statSync(p); } catch { continue; }
    if (st.isDirectory()) out.push(...walk(ctx, p, r));
    else out.push({ path: r, abs: p, bytes: st.size });
  }
  return out;
}

// events.jsonl fica de fora: o próprio fecho acrescenta wave.closing/wave.closed,
// logo o seu hash muda por construção. O diário é guardado pela cadeia e pela
// secção `journal` da conclusão (linhas antes do fecho + hash da última).
const SKIP = (p) => /^conclusion(\.draft)?\.json$/.test(p) || /^journal\.blocked/.test(p) || /\.tmp-\d+$/.test(p) || p === 'events.jsonl';

/** Todos os artefactos da onda com sha256 (excepto o próprio conclusion e temporários). */
export function artifactsAndHashes(ctx) {
  return walk(ctx, ctx.dir).filter((f) => !SKIP(f.path)).map((f) => ({ path: f.path, bytes: f.bytes, sha256: sha256(ctx.fs.readFileSync(f.abs)) }));
}

/** Recalcula tudo o que tem hash. Nunca lança por divergência — lista. */
export function integrityReport(ctx) {
  const violations = [];
  const report = { manifest: { file_sha256_ok: null, manifest_hash_ok: null, journal_hash_ok: null }, raw: [], chain: null, ok: null };
  // manifesto
  const mj = path.join(ctx.dir, 'manifest.json');
  const ms = path.join(ctx.dir, 'manifest.sha256');
  let manifestObj = null;
  if (ctx.fs.existsSync(mj)) {
    const bytes = ctx.fs.readFileSync(mj);
    const fileSha = sha256(bytes);
    let recorded = null;
    try { recorded = String(ctx.fs.readFileSync(ms, 'utf8')).trim().split(/\s+/)[0]; } catch { recorded = null; }
    report.manifest.file_sha256_ok = recorded === fileSha;
    if (!report.manifest.file_sha256_ok) violations.push({ what: 'manifest.json', kind: 'file_sha256_mismatch', expected: recorded, actual: fileSha });
    try { manifestObj = JSON.parse(bytes.toString('utf8')); } catch { manifestObj = null; violations.push({ what: 'manifest.json', kind: 'not_json' }); }
    if (manifestObj) {
      const { manifest_hash, ...semHash } = manifestObj;
      const rec = provHash(semHash);
      report.manifest.manifest_hash_ok = rec === manifest_hash;
      if (!report.manifest.manifest_hash_ok) violations.push({ what: 'manifest.json', kind: 'manifest_hash_mismatch', expected: manifest_hash, actual: rec });
      const w = waveState(ctx);
      report.manifest.journal_hash_ok = w.manifest_hash ? w.manifest_hash === manifest_hash : null;
      if (report.manifest.journal_hash_ok === false) violations.push({ what: 'manifest.json', kind: 'journal_hash_mismatch', expected: w.manifest_hash, actual: manifest_hash });
    }
  } else violations.push({ what: 'manifest.json', kind: 'missing' });
  // capturas
  let slotDirs = [];
  try { slotDirs = ctx.fs.readdirSync(ctx.rawDir); } catch { slotDirs = []; }
  for (const slot of slotDirs.sort()) {
    const a = path.join(ctx.rawDir, slot, 'answer.txt');
    const h = path.join(ctx.rawDir, slot, 'answer.sha256');
    if (!ctx.fs.existsSync(a)) continue;
    const actual = sha256(ctx.fs.readFileSync(a));
    let expected = null;
    try { expected = String(ctx.fs.readFileSync(h, 'utf8')).trim().split(/\s+/)[0]; } catch { expected = null; }
    const ok = expected === actual;
    report.raw.push({ slot_id: slot, file: `raw/${slot}/answer.txt`, expected, actual, ok });
    if (!ok) violations.push({ what: `raw/${slot}/answer.txt`, kind: expected ? 'answer_sha256_mismatch' : 'answer_sha256_missing', expected, actual });
  }
  // cadeia
  report.chain = verifyChain(ctx);
  if (!report.chain.ok) violations.push({ what: 'events.jsonl', kind: 'chain_broken', broken_at: report.chain.broken_at, reason: report.chain.reason });
  report.violations = violations;
  report.ok = violations.length === 0;
  return report;
}

// ── conclusão ────────────────────────────────────────────────────────────────

/** Fotografia do diário no momento da conclusão: nº de linhas e hash da última — o que a auditoria compara. */
function journalSnapshot(ctx, events) {
  let lines = [];
  try { lines = ctx.fs.readFileSync(ctx.eventsPath, 'utf8').split('\n').filter(Boolean); } catch { lines = []; }
  return { file: 'events.jsonl', events_at_conclusion: events.length, lines_at_conclusion: lines.length, last_line_sha256: lines.length ? sha256(lines[lines.length - 1]) : null, chain: verifyChain(ctx) };
}

function observabilityLimits({ per_intent, denominators, per_slot }) {
  const limits = [];
  const evaluableSlots = Object.values(per_slot).filter((x) => x.outcome === 'complete' || x.outcome === 'partial');
  for (const field of SCIENCE_FIELDS) {
    let n_null = 0, n_total = 0;
    for (const intent of Object.keys(per_intent)) { n_null += per_intent[intent][field].null; n_total += per_intent[intent][field].n_slots; }
    if (n_total && n_null === n_total) limits.push(`${field}: null em ${n_total}/${n_total} slots (não observado — não é «ausente»)`);
  }
  if (denominators.eligible_evaluable < denominators.planned_eligible) limits.push(`eligible_evaluable ${denominators.eligible_evaluable} < planned_eligible ${denominators.planned_eligible}: cobertura decisiva incompleta`);
  const usageUnknown = evaluableSlots.filter((x) => !x.usage || x.usage.tokens_out?.basis === 'unknown').length;
  if (evaluableSlots.length && usageUnknown) limits.push(`consumo: tokens_out unknown em ${usageUnknown}/${evaluableSlots.length} slots avaliáveis`);
  return limits;
}

/**
 * Constrói a conclusão (sem escrever). `human` traz os 7 campos de julgamento;
 * o que faltar fica <<TODO>>. `invalidated` = [{slot_id, reason}] adjudicados
 * pelo reviewer como inválidos entre os complete.
 */
export function buildConclusion(ctx, { human = {}, invalidated = [], closing_reason = null } = {}) {
  const events = readEvents(ctx);
  const w = waveState(ctx, events);
  const d = deriveOutcomes(events);
  const scores = readScores(ctx);
  const per_intent = countObservations({ scores, slot_ids: d.frozen.slot_ids, prompt_of: d.frozen.prompt_of || {} });
  const integrity = integrityReport(ctx);
  const artifacts = artifactsAndHashes(ctx);
  for (const inv of invalidated) {
    if (!d.per_slot[inv.slot_id]) throw new CloseoutError('bad_invalidation', `invalidated: slot ${inv.slot_id} desconhecido`);
    if (d.per_slot[inv.slot_id].outcome !== 'complete') throw new CloseoutError('bad_invalidation', `invalidated: slot ${inv.slot_id} não é complete (${d.per_slot[inv.slot_id].outcome})`);
    if (typeof inv.reason !== 'string' || inv.reason.trim().length < 8) throw new CloseoutError('bad_invalidation', `invalidated: ${inv.slot_id} sem razão (≥ 8 caracteres)`);
  }
  const h = (k) => (k in human && human[k] !== undefined && human[k] !== null && human[k] !== '' ? human[k] : TODO);
  const conclusion = {
    schema: CONCLUSION_SCHEMA,
    semantics_version: SEMANTICS_VERSION,
    contract: { version: CONTRACT.version, sha256: CONTRACT.sha256, closeout_required_count: CLOSEOUT_REQUIRED.length },
    external_review: 'pending',
    amendments: [],
    amendment_rule: 'Qualquer alteração à semântica (outcomes, denominadores, regras de derivação) é uma AMENDMENT datada, com testes, referenciada aqui — nunca edição silenciosa deste ficheiro.',
    wave_id: ctx.waveId,
    manifest_hash: w.manifest_hash,
    partition: d.frozen.partition ?? null,
    block_partition: d.frozen.partition ?? null,
    generated_at: new Date(ctx.now()).toISOString(),
    wave: { opened_at: w.opened_at, deadline_at: w.deadline_at, closeout_at: w.closeout_at, closing_reason: closing_reason ?? w.closing_reason ?? null, last_pause: w.last_pause },
    // ── julgamento humano (7) ──
    hypothesis_id: h('hypothesis_id'),
    expected_result: h('expected_result'),
    counterevidence: h('counterevidence'),
    confounders: h('confounders'),
    decision: h('decision'),
    reviewer: h('reviewer'),
    next_hypothesis_id: h('next_hypothesis_id'),
    // ── derivado (13) ──
    planned: d.counts.planned,
    attempted: d.counts.attempted,
    complete: d.counts.complete,
    valid: d.counts.complete - invalidated.length,
    invalidated,
    partial: d.counts.partial,
    failed: d.counts.failed,
    unknown: d.counts.unknown,
    not_started: d.counts.not_started,
    identity: { planned_equals_sum: d.counts.identity_ok, formula: 'planned = complete + partial + failed + unknown + not_started' },
    refusals: d.counts.refusals,
    negative_control_outcomes: d.negative_control_outcomes,
    per_intent_outcomes: per_intent,
    eligible_evaluable_denominator: d.denominators,
    search_used_counts: d.search_used_counts,
    usage: d.usage,
    per_slot: d.per_slot,
    observability_limits: observabilityLimits({ per_intent, denominators: d.denominators, per_slot: d.per_slot }),
    integrity,
    journal: journalSnapshot(ctx, events),
    artifacts_and_hashes: artifacts,
    engine_pins: (() => { const p = verifyPins(); return { ok: p.ok, pinned_at_sha: p.pinned_at_sha, checked: p.checked }; })(),
    inference_note: 'Contagens e diferenças são descritivas. Sem IC agregado, sem +2, sem efeito causal (PROTOCOLO 0.2 §7).',
  };
  return conclusion;
}

/** Lista os campos obrigatórios ainda por preencher. */
export function checkConclusion(c) {
  const todos = CLOSEOUT_REQUIRED.filter((k) => c[k] === TODO || c[k] === undefined);
  const problems = [];
  if (c.decision !== TODO && !WAVE_DECISIONS.includes(c.decision)) problems.push(`decision ∈ ${WAVE_DECISIONS.join('|')} (recebido ${JSON.stringify(c.decision)})`);
  if (!c.identity?.planned_equals_sum) problems.push('planned ≠ soma dos outcomes');
  // Regra do piloto (G6): cobertura decisiva incompleta força inconclusive.
  const den = c.eligible_evaluable_denominator || {};
  const primaryLike = c.partition && c.partition !== 'synthetic-qualification';
  if (primaryLike && c.decision === 'qualified_for_next_design' && (den.eligible_evaluable < den.planned_eligible || den.negative_evaluable < den.negative)) {
    problems.push(`inconclusive_forced: eligible_evaluable ${den.eligible_evaluable}/${den.planned_eligible}, negative_evaluable ${den.negative_evaluable}/${den.negative} — cobertura decisiva incompleta não qualifica`);
  }
  if (c.semantics_version !== SEMANTICS_VERSION) problems.push(`semantics_version ${c.semantics_version} ≠ ${SEMANTICS_VERSION}`);
  if (c.external_review !== 'pending' && c.external_review !== 'done') problems.push('external_review ∈ pending|done');
  return { ok: todos.length === 0 && problems.length === 0, todos, problems };
}

function writeDurably(ctx, file, bytes) {
  const tmp = `${file}.tmp-${process.pid}`;
  let fd = null;
  try { fd = ctx.fs.openSync(tmp, 'w'); ctx.fs.writeSync(fd, bytes, 0, bytes.length); ctx.fs.fsyncSync(fd); } finally { if (fd !== null) { try { ctx.fs.closeSync(fd); } catch { /* */ } } }
  ctx.fs.renameSync(tmp, file);
}

export const conclusionPath = (ctx) => path.join(ctx.dir, 'conclusion.json');
export const draftPath = (ctx) => path.join(ctx.dir, 'conclusion.draft.json');

function signed(conclusion) {
  const { integrity_sha256: _x, ...rest } = conclusion;
  return { ...rest, integrity_sha256: provHash(rest) };
}

/** Razão de fecho derivada do estado, ou a do operador. */
function closingReason(w, now_ms, reason) {
  if (w.state === 'closing') return w.closing_reason;
  if (now_ms >= Date.parse(w.closeout_at)) return 'closeout_at_reached';
  if (w.next_action_at && Date.parse(w.next_action_at) >= Date.parse(w.closeout_at)) return 'budget_exceeded';
  if (typeof reason === 'string' && reason.trim().length >= 8) return `operator: ${reason.trim()}`;
  throw new CloseoutError('wave_still_open', `a onda ainda está aberta (closeout_at ${w.closeout_at}); para fechar antes do tempo o operador escreve a razão (≥ 8 caracteres)`);
}

/**
 * Fecha a onda.
 *  - draft:true  → escreve conclusion.draft.json (pode ter <<TODO>>), NÃO fecha a onda.
 *  - draft:false → exige closeout_required completo (os 21 do contrato) sem TODO, decisão válida, regra do piloto; escreve
 *                  conclusion.json assinado e regista wave.closing (se ainda aberta)
 *                  + wave.closed. Uma vez. Depois disso: already_closed.
 */
export function closeoutWave(ctx, { human = {}, invalidated = [], reason = null, draft = false } = {}) {
  const events = readEvents(ctx);
  const w = waveState(ctx, events);
  if (w.state === 'registered' || w.state === 'frozen') throw new CloseoutError('wave_not_open', `a onda está ${w.state}; nada para fechar`);
  if (w.state === 'closed') throw new CloseoutError('already_closed', 'a onda já fechou; interpretações novas vão para scores.jsonl ou para uma AMENDMENT datada — não se reescreve conclusion.json');
  const now_ms = ctx.now();
  const closing_reason = closingReason(w, now_ms, reason);
  const conclusion = buildConclusion(ctx, { human, invalidated, closing_reason });
  const check = checkConclusion(conclusion);

  if (draft) {
    const bytes = Buffer.from(JSON.stringify({ ...conclusion, draft: true, check }, null, 2) + '\n', 'utf8');
    writeDurably(ctx, draftPath(ctx), bytes);
    return { draft: true, conclusion, check, file: draftPath(ctx) };
  }
  if (!check.ok) throw new CloseoutError('conclusion_incomplete', `conclusão não fecha: ${check.todos.length ? `por preencher: ${check.todos.join(', ')}` : ''}${check.problems.length ? ` · ${check.problems.join(' · ')}` : ''}`, check);
  if (ctx.fs.existsSync(conclusionPath(ctx))) throw new CloseoutError('conclusion_exists', 'conclusion.json já existe sem wave.closed no diário — reconciliar antes (auditClosed)');

  if (w.state === 'open') appendEvent(ctx, { kind: 'wave.closing', payload: { reason: closing_reason } });
  const final = signed(conclusion);
  const bytes = Buffer.from(JSON.stringify(final, null, 2) + '\n', 'utf8');
  writeDurably(ctx, conclusionPath(ctx), bytes);
  let closed;
  try {
    closed = appendEvent(ctx, { kind: 'wave.closed', payload: { conclusion_file: 'conclusion.json', conclusion_sha256: sha256(bytes), integrity_sha256: final.integrity_sha256, decision: final.decision, planned: final.planned, complete: final.complete } });
  } catch (e) {
    if (e instanceof JournalError) throw new CloseoutError('close_journal_failed', `conclusion.json escrito mas wave.closed não: ${e.message} — correr reconcile e auditClosed`, { cause: e.code });
    throw e;
  }
  return { draft: false, conclusion: final, check, file: conclusionPath(ctx), entry: closed };
}

/**
 * Auditoria de uma onda fechada, SEM escrever: a conclusão assina-se a si
 * própria? os artefactos ainda batem com o que a conclusão registou? a cadeia
 * está íntegra? Devolve o relatório; nunca corrige.
 */
export function auditClosed(ctx) {
  let bytes;
  try { bytes = ctx.fs.readFileSync(conclusionPath(ctx)); } catch { throw new CloseoutError('conclusion_missing', 'sem conclusion.json'); }
  let c;
  try { c = JSON.parse(bytes.toString('utf8')); } catch { return { ok: false, conclusion_intact: false, reason: 'conclusion_not_json' }; }
  const { integrity_sha256, ...rest } = c;
  const conclusion_intact = provHash(rest) === integrity_sha256;
  const now = integrityReport(ctx);
  const recorded = new Map((c.artifacts_and_hashes || []).map((a) => [a.path, a.sha256]));
  const live = artifactsAndHashes(ctx);
  const drift = [];
  for (const a of live) {
    if (!recorded.has(a.path)) drift.push({ path: a.path, kind: 'added_after_close', sha256: a.sha256 });
    else if (recorded.get(a.path) !== a.sha256) drift.push({ path: a.path, kind: 'changed_after_close', recorded: recorded.get(a.path), actual: a.sha256 });
  }
  for (const [p, h] of recorded) if (!live.some((a) => a.path === p)) drift.push({ path: p, kind: 'missing_after_close', recorded: h });
  const events = readEvents(ctx);
  const closedEv = [...events].reverse().find((e) => e.kind === 'wave.closed');
  const journal_matches = closedEv ? closedEv.payload.conclusion_sha256 === sha256(bytes) : false;
  const raw_mismatch = now.raw.filter((r) => !r.ok).map((r) => r.slot_id);
  // Diário: as linhas até à conclusão têm de ser as mesmas (hash da última), e o que veio depois só pode ser o fecho.
  let lines = [];
  try { lines = ctx.fs.readFileSync(ctx.eventsPath, 'utf8').split('\n').filter(Boolean); } catch { lines = []; }
  const snap = c.journal || {};
  const prefixOk = snap.lines_at_conclusion != null && lines.length >= snap.lines_at_conclusion && sha256(lines[snap.lines_at_conclusion - 1] || '') === snap.last_line_sha256;
  const tail = lines.slice(snap.lines_at_conclusion || 0).map((l) => { try { return JSON.parse(l).kind; } catch { return 'not_json'; } });
  const tailOk = tail.every((k) => ['wave.closing', 'wave.closed', 'journal.reconciled'].includes(k));
  const journal_intact = prefixOk && tailOk && now.chain.ok;
  return {
    ok: conclusion_intact && journal_matches && journal_intact && now.ok && drift.length === 0,
    conclusion_intact, journal_matches, journal_intact, journal_tail: tail,
    integrity: { manifest: now.manifest.file_sha256_ok && now.manifest.manifest_hash_ok && now.manifest.journal_hash_ok !== false ? 'OK' : 'MISMATCH', raw: raw_mismatch, chain: now.chain, violations: now.violations },
    artifact_drift: drift,
  };
}
