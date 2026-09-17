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
// AMENDMENT-001 (2026-09-17, revisão científica do GPT; ficheiro
// AMENDMENT-001-20260916.txt; contrato 0.3 sha256 61acea27…, PROTOCOLO 0.2
// sha256 4564ab1d…): A4 vocabulário lido do contrato congelado (21 campos);
// A1 redução determinística do histórico do slot (reduceSlotHistory, abaixo);
// A3 denominadores por POSIÇÃO (planned_eligible / negative_planned /
// coverage_per_wave) e avaliabilidade por outcome operacional E por campo
// científico (EVALUABILITY_BY_OUTCOME, FIELD_EVIDENCE, abaixo).
//
// O closeout NUNCA reescreve evidência: um manifesto ou uma captura
// adulterados aparecem em `integrity.violations` (caso 10). Interpretações
// novas vão para scores.jsonl ou para uma AMENDMENT; o conclusion.json final
// escreve-se uma vez.

import path from 'node:path';
import crypto from 'node:crypto';
import nodeFs from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

import { appendEvent, readEvents, waveState, slotStates, verifyChain, JournalError, SLOT_KINDS, SLOT_TRANSITIONS } from './journal.mjs';
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
export const EXTERNAL_REVIEW_STATES = Object.freeze(['pending', 'corrections_applied_pending_confirmation', 'done']);

// ── registo de emendas ───────────────────────────────────────────────────────
// Cada AMENDMENT é um ficheiro datado em amendments/AMENDMENT-NNN.json (o que a
// revisão pediu, o que se aplicou, em que commits, com que testes, e o que ficou
// de fora). A conclusão lista-as com o sha256 de cada ficheiro, e o estado de
// external_review deriva da mais recente — nunca se escreve à mão.
const AMENDMENTS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'amendments');
export function loadAmendments({ fs = nodeFs, dir = AMENDMENTS_DIR } = {}) {
  let names = [];
  try { names = fs.readdirSync(dir).filter((n) => /^AMENDMENT-\d{3}\.json$/.test(n)).sort(); } catch { names = []; }
  return names.map((n) => {
    const bytes = fs.readFileSync(path.join(dir, n));
    let a;
    try { a = JSON.parse(bytes.toString('utf8')); } catch { throw new CloseoutError('amendment_corrupt', `${n} não é JSON`); }
    for (const k of ['id', 'date', 'items', 'semantics_version', 'external_review_after']) if (!(k in a)) throw new CloseoutError('amendment_invalid', `${n}: falta ${k}`);
    if (a.id !== n.replace(/\.json$/, '')) throw new CloseoutError('amendment_invalid', `${n}: id ${a.id} ≠ nome do ficheiro`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(a.date)) throw new CloseoutError('amendment_invalid', `${n}: date tem de ser YYYY-MM-DD`);
    if (!EXTERNAL_REVIEW_STATES.includes(a.external_review_after)) throw new CloseoutError('amendment_invalid', `${n}: external_review_after ∈ ${EXTERNAL_REVIEW_STATES.join('|')}`);
    if (a.semantics_version !== SEMANTICS_VERSION) throw new CloseoutError('amendment_invalid', `${n}: semantics_version ${a.semantics_version} ≠ ${SEMANTICS_VERSION} — outra versão da semântica é outro kit`);
    if (!Array.isArray(a.items) || !a.items.every((it) => it && typeof it.id === 'string' && typeof it.status === 'string')) throw new CloseoutError('amendment_invalid', `${n}: items[] com id e status`);
    // Suplementos (AMENDMENT-001b): secções supplement_<sufixo> no mesmo ficheiro — só provas,
    // limite operacional e annex; nunca desenho. Validados como a emenda-mãe.
    const supplements = Object.entries(a).filter(([k]) => /^supplement_/.test(k)).map(([k, s]) => {
      for (const kk of ['id', 'date', 'items', 'external_review_after']) if (!s || !(kk in s)) throw new CloseoutError('amendment_invalid', `${n}.${k}: falta ${kk}`);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(s.date)) throw new CloseoutError('amendment_invalid', `${n}.${k}: date tem de ser YYYY-MM-DD`);
      if (!EXTERNAL_REVIEW_STATES.includes(s.external_review_after)) throw new CloseoutError('amendment_invalid', `${n}.${k}: external_review_after ∈ ${EXTERNAL_REVIEW_STATES.join('|')}`);
      if (!Array.isArray(s.items) || !s.items.every((it) => it && typeof it.id === 'string' && typeof it.status === 'string')) throw new CloseoutError('amendment_invalid', `${n}.${k}: items[] com id e status`);
      return { key: k, id: s.id, date: s.date, source_sha256: s.source?.sha256 ?? null, items: s.items.map((it) => ({ id: it.id, kind: it.kind ?? null, status: it.status, commit: it.commit ?? null })), external_review_after: s.external_review_after };
    });
    return { id: a.id, date: a.date, file: `amendments/${n}`, sha256: sha256(bytes), source_sha256: a.source?.sha256 ?? null, items: a.items.map((it) => ({ id: it.id, kind: it.kind ?? null, status: it.status, commit: it.commit ?? null })), external_review_after: a.external_review_after, supplements };
  });
}
/** Estado de revisão externa DERIVADO do registo: sem emendas ⇒ pending; com emendas ⇒ o da mais recente (suplementos incluídos). */
export function externalReviewState(amendments) {
  if (!amendments.length) return 'pending';
  const all = amendments.flatMap((a) => [{ date: a.date, id: a.id, state: a.external_review_after }, ...(a.supplements || []).map((s) => ({ date: s.date, id: s.id, state: s.external_review_after }))]);
  return all.sort((a, b) => (a.date + a.id).localeCompare(b.date + b.id)).at(-1).state;
}
/** «corrections_applied_pending_confirmation (001+001b)» — o estado com o alcance, derivado do registo. */
export function externalReviewDetail(amendments) {
  const state = externalReviewState(amendments);
  const ids = amendments.flatMap((a) => [a.id, ...(a.supplements || []).map((s) => s.id)]).map((id) => id.replace(/^AMENDMENT-/, ''));
  return ids.length ? `${state} (${ids.join('+')})` : state;
}

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

// ── AMENDMENT-001 · A1 (2026-09-17) · redução determinística do histórico ────
//
// Revisão científica do GPT (AMENDMENT-001-20260916.txt, A1): «"último evento"
// não é exclusivo nem exaustivo». O outcomeOf do passo 4 lia `slot.state` num
// switch — casos sem classe única: preflight_failed sem intenção, submitted sem
// captura ao fechar, known_not_submitted sem nova tentativa, captured com
// completeness=unknown, eventos de scoring/fecho a mascarar o outcome.
//
// Correcção: reduceSlotHistory(events) é uma função PURA que recebe o histórico
// do slot (por ordem de diário) e devolve exactamente UMA classe ∈
// contract.state_machine.slot_outcomes, pela precedência abaixo (a primeira
// regra que casa vence; a lista é exaustiva sobre SLOT_KINDS):
//
//   R1  `failed` em qualquer ponto do histórico ⇒ failed
//       (falha terminal explícita prevalece sobre not_started — A1 §1)
//   R2  o último evento OPERACIONAL é `captured` ⇒ pela captura (A1 §3, §5):
//       completeness unknown ⇒ unknown · partial OU condição divergente ⇒ partial
//       · full E condição == pedida ⇒ complete. «Último captured» = a recuperação
//       (--recover) supersede a interpretação anterior sem apagar evidência.
//   R3  o último evento operacional é intent_committed | submitted |
//       submission_uncertain | capture_uncertain | policy_review ⇒ unknown
//       (envio confirmado ou incerto SEM captura suficiente ao fechar — A1 §2;
//       captured seguido de policy_review por resolver cai aqui: a captura
//       existe, mas não é «suficiente» enquanto está sob revisão)
//   R4  o último evento operacional é known_not_submitted | prepared |
//       preflight_ok | preflight_failed | queued, ou não há evento ⇒ not_started
//       (A1 §4: known_not_submitted sem tentativa posterior; preflight_failed
//       sem intenção não é `failed` — é um slot que nunca saiu)
//   R0  histórico só com eventos não-operacionais ⇒ unknown, rule
//       inconsistent_history (o diário não deixa isto acontecer; a função é
//       exaustiva na mesma)
//
// `scored` e `closed` são ignorados na redução (A1 §6). `attempted` é uma
// DIMENSÃO separada: há intent_committed E a classe não é not_started — o
// known_not_submitted fica no diário e conta à parte como attempted=false (A1 §4).

/** Kinds que não alteram a classe operacional (A1 §6). */
export const NON_OPERATIONAL_KINDS = Object.freeze(['scored', 'closed']);
const OPERATIONAL_KINDS = Object.freeze(SLOT_KINDS.filter((k) => !NON_OPERATIONAL_KINDS.includes(k)));
// AMENDMENT-001b · B1: a falha que decide R1 é a TERMINAL — a que não tem transição de
// saída em SLOT_TRANSITIONS (hoje só `failed`). preflight_failed tem saída (→ prepared): é
// uma falha HISTÓRICA, fica no history[] e é reportada, mas não decide a classe.
export const TERMINAL_FAILURE_KINDS = Object.freeze(SLOT_KINDS.filter((k) => /fail/.test(k) && (SLOT_TRANSITIONS[k] || []).length === 0));
export const HISTORICAL_FAILURE_KINDS = Object.freeze(SLOT_KINDS.filter((k) => /fail/.test(k) && !TERMINAL_FAILURE_KINDS.includes(k)));
const R3_KINDS = Object.freeze(['intent_committed', 'submitted', 'submission_uncertain', 'capture_uncertain', 'policy_review']);
const R4_KINDS = Object.freeze(['known_not_submitted', 'prepared', 'preflight_ok', 'preflight_failed', 'queued']);
const SENT_KINDS = Object.freeze(['submitted', 'submission_uncertain']);

/**
 * Reduz o histórico de UM slot a exactamente uma classe, com a regra que a
 * produziu. Puro. `events` = eventos desse slot, por ordem de diário (kinds fora
 * de SLOT_KINDS são ignorados).
 */
export function reduceSlotHistory(events) {
  const ops = events.filter((e) => OPERATIONAL_KINDS.includes(e.kind));
  const intent_recorded = ops.some((e) => e.kind === 'intent_committed');
  const known_not_submitted_recorded = ops.some((e) => e.kind === 'known_not_submitted');
  const last = ops.length ? ops[ops.length - 1] : null;
  const failedEv = ops.find((e) => TERMINAL_FAILURE_KINDS.includes(e.kind)) || null;
  // B1 (c): known_not_submitted só produz attempted=false quando NÃO há submitted |
  // submission_uncertain DEPOIS dele — uma tentativa posterior que chegou a sair conta.
  const lastKnsIdx = ops.map((e) => e.kind).lastIndexOf('known_not_submitted');
  const sentAfterKns = lastKnsIdx >= 0 && ops.slice(lastKnsIdx + 1).some((e) => SENT_KINDS.includes(e.kind));
  const attempted = intent_recorded && (lastKnsIdx < 0 || sentAfterKns);
  const prior_failures = Object.fromEntries(HISTORICAL_FAILURE_KINDS.map((k) => [k, ops.filter((e) => e.kind === k).length]));
  const capturedEv = last && last.kind === 'captured' ? last : null;
  const lastCapturedAny = [...ops].reverse().find((e) => e.kind === 'captured') || null;
  let outcome, rule;
  if (failedEv) { outcome = 'failed'; rule = 'R1_failed_terminal'; }
  else if (capturedEv) {
    const cap = capturedEv.payload || {};
    if (cap.capture_completeness === 'unknown') { outcome = 'unknown'; rule = 'R2_captured_completeness_unknown'; }
    else if (cap.capture_completeness === 'partial') { outcome = 'partial'; rule = 'R2_captured_partial'; }
    else if (cap.condition_divergent) { outcome = 'partial'; rule = 'R2_captured_condition_divergent'; }
    else if (cap.capture_completeness === 'full') { outcome = 'complete'; rule = 'R2_captured_full_condition_ok'; }
    else { outcome = 'unknown'; rule = 'R2_captured_completeness_missing'; }
  }
  else if (last && R3_KINDS.includes(last.kind)) { outcome = 'unknown'; rule = `R3_${last.kind}_without_sufficient_capture`; }
  else if (last && R4_KINDS.includes(last.kind)) { outcome = 'not_started'; rule = `R4_${last.kind}`; }
  else if (!last && !events.some((e) => SLOT_KINDS.includes(e.kind))) { outcome = 'not_started'; rule = 'R4_no_event'; }
  else { outcome = 'unknown'; rule = 'R0_inconsistent_history'; } // só scored/closed sem evento operacional, ou kind fora da lista
  if (!OUTCOMES.includes(outcome)) throw new CloseoutError('outcome_out_of_contract', `redução devolveu ${outcome}, fora de slot_outcomes do contrato`);
  return {
    outcome, rule,
    attempted,
    intent_recorded,
    not_submitted_proven: known_not_submitted_recorded && outcome === 'not_started',
    history: events.map((e) => e.kind),          // B1 (a): a falha anterior fica no histórico e é reportada, nunca apagada
    prior_failures,                               // falhas HISTÓRICAS (com saída na máquina), por kind
    last_operational_kind: last ? last.kind : null,
    captured: capturedEv ? capturedEv.payload : null,          // a captura que decidiu a classe (só em R2)
    last_capture_any: lastCapturedAny ? lastCapturedAny.payload : null, // para hashes/consumo mesmo quando a classe não é R2
    failed: failedEv ? failedEv.payload : null,
  };
}

/** Compatibilidade: outcome de um slot a partir da sua lista de eventos. */
export function outcomeOf(slotEvents) { return reduceSlotHistory(slotEvents).outcome; }

// ── AMENDMENT-001 · A3 (2026-09-17) · denominadores e avaliabilidade ─────────
//
// Revisão científica do GPT (AMENDMENT-001-20260916.txt, A3): «8 planeados = 6
// elegíveis planeados (planned_eligible) + 2 negativos (negative_planned). Os 6
// NÃO são automaticamente avaliáveis.» E: «avaliabilidade reportada POR OUTCOME
// científico quando a evidência variar (um slot pode ser avaliável para
// target_mentioned e não para new_fact_used).»
//
// Duas camadas, ambas derivadas do diário:
//  1. avaliabilidade OPERACIONAL por outcome (há resposta para observar?):
//     complete e partial sim; failed, unknown, not_started não.
//  2. avaliabilidade por CAMPO científico: o que cada campo exige além da resposta.
//     new_fact_used exige a referência ao facto revisto (fact_ref, o diff da
//     página) declarada no manifesto para o prompt — sem diff não há «uso do
//     facto novo» que se possa julgar (contrato 0.3: «Require page diff and
//     answer excerpt»). recommended_appropriately exige rubric_ref na onda e o
//     prompt declarado como pedido de recomendação (asks_recommendation) — a
//     elegibilidade para este campo vem daqui, NUNCA de search_used (A3 §19).
//     crawl_access é observação do servidor: não precisa de resposta.
//  Não declarado ⇒ não avaliável, e o closeout diz porquê (eligible_not_evaluable_why).

/** Avaliabilidade operacional por outcome (A3). */
export const EVALUABILITY_BY_OUTCOME = Object.freeze({ complete: true, partial: true, failed: false, unknown: false, not_started: false });

/** O que cada campo científico exige para um slot ser avaliável, além do outcome. */
export const FIELD_EVIDENCE = Object.freeze({
  crawl_access:              Object.freeze({ needs_response: false, needs: Object.freeze([]) }),
  retrieved_target_url:      Object.freeze({ needs_response: true,  needs: Object.freeze([]) }),
  page_or_domain_cited:      Object.freeze({ needs_response: true,  needs: Object.freeze([]) }),
  new_fact_used:             Object.freeze({ needs_response: true,  needs: Object.freeze(['fact_ref']) }),
  recommended_appropriately: Object.freeze({ needs_response: true,  needs: Object.freeze(['rubric_ref', 'asks_recommendation']) }),
  target_mentioned:          Object.freeze({ needs_response: true,  needs: Object.freeze([]) }),
  search_available:          Object.freeze({ needs_response: true,  needs: Object.freeze([]) }),
  search_used:               Object.freeze({ needs_response: true,  needs: Object.freeze([]) }),
  competitor_included:       Object.freeze({ needs_response: true,  needs: Object.freeze([]) }),
});

for (const f of SCIENCE_FIELDS) if (!FIELD_EVIDENCE[f]) throw new CloseoutError('field_without_evidence_rule', `o campo científico ${f} (contrato) não tem regra de avaliabilidade em FIELD_EVIDENCE — outro contrato é outra AMENDMENT`);

function evidenceOf(frozen, prompt_id) {
  const ev = frozen.evidence && frozen.evidence[prompt_id];
  return ev && typeof ev === 'object' ? ev : { declared: false, fact_ref: null, asks_recommendation: false };
}

// AMENDMENT-001b · B2: três camadas, NUNCA igualadas.
//   applicable        — o manifesto congelado declara a evidência que o campo exige
//                       (fact_ref / rubric_ref / asks_recommendation). Pré-registada;
//                       independente do que aconteceu ao slot.
//   capture_sufficient — applicable E há resposta para observar (outcome complete|partial,
//                       ou campo que não precisa de resposta).
//   evaluable         — capture_sufficient E adjudicação ≠ null em scores.jsonl (o reviewer
//                       olhou e decidiu; null é «não observado», e não conta).
// As duas primeiras derivam do diário (deriveOutcomes); a terceira precisa do ledger
// científico e é preenchida em buildConclusion.

/** Razões pelas quais um slot NÃO é aplicável para um campo (vazio = aplicável). Só manifesto. */
export function notApplicableReasons(slot, field, frozen) {
  const req = FIELD_EVIDENCE[field];
  if (!req) return [`campo_desconhecido:${field}`];
  const why = [];
  const ev = evidenceOf(frozen, slot.prompt_id);
  for (const n of req.needs) {
    if (n === 'fact_ref' && !(typeof ev.fact_ref === 'string' && ev.fact_ref.length > 0)) why.push(ev.declared ? 'fact_ref:null' : 'evidence:not_declared');
    if (n === 'rubric_ref' && !(typeof frozen.rubric_ref === 'string' && frozen.rubric_ref.length > 0)) why.push('rubric_ref:null');
    if (n === 'asks_recommendation' && ev.asks_recommendation !== true) why.push(ev.declared ? 'asks_recommendation:false' : 'evidence:not_declared');
  }
  return why;
}

/** Razões pelas quais um slot aplicável NÃO tem captura suficiente para um campo (vazio = suficiente). */
export function notEvaluableReasons(slot, field, frozen) {
  const req = FIELD_EVIDENCE[field];
  if (!req) return [`campo_desconhecido:${field}`];
  const why = [];
  if (req.needs_response && EVALUABILITY_BY_OUTCOME[slot.outcome] !== true) why.push(`outcome:${slot.outcome}`);
  return [...why, ...notApplicableReasons(slot, field, frozen)];
}

export function applicableFor(slot, field, frozen) { return notApplicableReasons(slot, field, frozen).length === 0; }
export function captureSufficientFor(slot, field, frozen) { return notEvaluableReasons(slot, field, frozen).length === 0; }

function tally(slots, field, frozen, fn) {
  const t = {};
  for (const x of slots) for (const w of fn(x, field, frozen)) t[w] = (t[w] || 0) + 1;
  return t;
}

/** Deriva tudo o que é mecânico. Não escreve. Lança se a identidade planned = Σ outcomes falhar. */
export function deriveOutcomes(events) {
  const frozen = frozenPayload(events);
  const states = slotStates(null, events);
  const per_slot = {};
  for (const slot_id of frozen.slot_ids) {
    const s = states.get(slot_id) || { slot_id, state: null, history: [], attempt_token: null };
    const mine = events.filter((e) => e.slot_id === slot_id && SLOT_KINDS.includes(e.kind));
    const r = reduceSlotHistory(mine);
    const cap = r.last_capture_any;
    per_slot[slot_id] = {
      slot_id, prompt_id: frozen.prompt_of?.[slot_id] ?? null, role: frozen.roles?.[slot_id] ?? null,
      state: s.state, attempt_token: s.attempt_token,
      outcome: r.outcome, rule: r.rule,
      attempted: r.attempted, intent_recorded: r.intent_recorded, not_submitted_proven: r.not_submitted_proven,
      history: r.history, prior_failures: r.prior_failures,
      last_operational_kind: r.last_operational_kind,
      capture_completeness: cap ? cap.capture_completeness : null,
      condition_divergent: cap ? !!cap.condition_divergent : null,
      refusal: cap ? !!cap.refusal : null,
      search_used: cap ? (cap.observed?.search_used ?? null) : null,
      answer_sha256: cap ? cap.answer_sha256 : null,
      failure_class: r.failed ? r.failed.class : null,
      usage: cap ? cap.usage : null,
    };
  }
  const slots = Object.values(per_slot);
  const count = (pred) => slots.filter(pred).length;
  const counts = {
    planned: slots.length,
    attempted: count((x) => x.attempted),
    intent_recorded: count((x) => x.intent_recorded),
    not_submitted_proven: count((x) => x.not_submitted_proven),
    complete: count((x) => x.outcome === 'complete'),
    partial: count((x) => x.outcome === 'partial'),
    failed: count((x) => x.outcome === 'failed'),
    unknown: count((x) => x.outcome === 'unknown'),
    not_started: count((x) => x.outcome === 'not_started'),
    refusals: count((x) => x.refusal === true),
  };
  // A1: identidade afirmada no closeout, não só reportada. attempted, valid e as
  // contagens científicas são dimensões separadas — nunca parcelas desta soma.
  counts.identity_ok = counts.planned === counts.complete + counts.partial + counts.failed + counts.unknown + counts.not_started;
  if (!counts.identity_ok) throw new CloseoutError('outcome_identity_broken', `planned ${counts.planned} ≠ complete ${counts.complete} + partial ${counts.partial} + failed ${counts.failed} + unknown ${counts.unknown} + not_started ${counts.not_started}`);
  // ── AMENDMENT-001 · A3 · denominadores por posição e avaliabilidade por campo ──
  for (const x of slots) {
    x.applicable_for = Object.fromEntries(SCIENCE_FIELDS.map((f) => [f, applicableFor(x, f, frozen)]));
    x.capture_sufficient_for = Object.fromEntries(SCIENCE_FIELDS.map((f) => [f, captureSufficientFor(x, f, frozen)]));
    x.evaluable_for = Object.fromEntries(SCIENCE_FIELDS.map((f) => [f, null])); // B2: precisa de scores.jsonl — buildConclusion preenche
  }
  const eligible = slots.filter((x) => x.role === 'eligible');
  const negative = slots.filter((x) => x.role === 'negative');
  const other = slots.filter((x) => x.role !== 'eligible' && x.role !== 'negative');
  const byOutcome = (xs) => Object.fromEntries(OUTCOMES.map((o) => [o, xs.filter((x) => x.outcome === o).length]));
  const evaluable = (xs) => xs.filter((x) => EVALUABILITY_BY_OUTCOME[x.outcome] === true);
  const caps = frozen.caps ?? null;
  const denominators = {
    basis: 'positions',
    note: '«8/8 planned» é cobertura de POSIÇÕES planeadas, nunca de respostas; os elegíveis planeados NÃO são automaticamente avaliáveis (A3).',
    coverage_per_wave: slots.length,
    planned_eligible: eligible.length,
    negative_planned: negative.length,
    other_planned: other.length,
    positions_identity_ok: eligible.length + negative.length + other.length === slots.length,
    contract_declared: { ...CONTRACT.denominators },
    contract_match: frozen.partition === 'primary'
      ? eligible.length === CONTRACT.denominators.planned_eligible_per_wave && negative.length === CONTRACT.denominators.negative_per_wave && slots.length === CONTRACT.denominators.coverage_per_wave
      : null,
    // caps do manifesto congelado (freeze.mjs chama `negative` ao que aqui é negative_planned — mesma grandeza, nome do passo 2).
    caps_declared: caps ? { coverage_per_wave: caps.coverage_per_wave ?? null, planned_eligible: caps.planned_eligible ?? null, negative_planned: caps.negative ?? null } : null,
    evaluability_by_outcome: { ...EVALUABILITY_BY_OUTCOME },
    eligible_by_outcome: byOutcome(eligible),
    negative_by_outcome: byOutcome(negative),
    eligible_evaluable: evaluable(eligible).length,
    eligible_complete: eligible.filter((x) => x.outcome === 'complete').length,
    negative_evaluable: evaluable(negative).length,
    // B2: por campo, três contagens que nunca se igualam — applicable (pré-registado no
    // manifesto), capture_sufficient (aplicável e com resposta), evaluable (adjudicado ≠ null;
    // preenchido em buildConclusion, porque precisa de scores.jsonl).
    by_field: Object.fromEntries(SCIENCE_FIELDS.map((f) => [f, {
      needs_response: FIELD_EVIDENCE[f].needs_response,
      needs: [...FIELD_EVIDENCE[f].needs],
      applicable: { eligible: eligible.filter((x) => x.applicable_for[f]).length, negative: negative.filter((x) => x.applicable_for[f]).length },
      capture_sufficient: { eligible: eligible.filter((x) => x.capture_sufficient_for[f]).length, negative: negative.filter((x) => x.capture_sufficient_for[f]).length },
      evaluable: { eligible: null, negative: null },
      eligible_not_applicable_why: tally(eligible, f, frozen, notApplicableReasons),
      eligible_not_evaluable_why: tally(eligible, f, frozen, notEvaluableReasons),
    }])),
  };
  denominators.applicable_by_field = Object.fromEntries(SCIENCE_FIELDS.map((f) => [f, { ...denominators.by_field[f].applicable }]));
  denominators.evaluable_by_field = null; // B2: preenchido em buildConclusion a partir de scores.jsonl
  if (!denominators.positions_identity_ok) throw new CloseoutError('positions_identity_broken', `planned_eligible ${eligible.length} + negative_planned ${negative.length} + other ${other.length} ≠ coverage ${slots.length}`);
  const negative_control_outcomes = byOutcome(negative);
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
  const evaluableSlots = Object.values(per_slot).filter((x) => EVALUABILITY_BY_OUTCOME[x.outcome] === true);
  for (const field of SCIENCE_FIELDS) {
    let n_null = 0, n_total = 0;
    for (const intent of Object.keys(per_intent)) { n_null += per_intent[intent][field].null; n_total += per_intent[intent][field].n_slots; }
    if (n_total && n_null === n_total) limits.push(`${field}: null em ${n_total}/${n_total} slots (não observado — não é «ausente»)`);
  }
  const d = denominators;
  if (d.eligible_evaluable < d.planned_eligible) limits.push(`eligible_evaluable ${d.eligible_evaluable} < planned_eligible ${d.planned_eligible}: cobertura decisiva incompleta`);
  if (d.negative_evaluable < d.negative_planned) limits.push(`negative_evaluable ${d.negative_evaluable} < negative_planned ${d.negative_planned}: controlo negativo incompleto`);
  if (d.contract_match === false) limits.push(`posições ≠ contrato (planned_eligible ${d.planned_eligible}/${d.contract_declared.planned_eligible_per_wave}, negative_planned ${d.negative_planned}/${d.contract_declared.negative_per_wave}, coverage ${d.coverage_per_wave}/${d.contract_declared.coverage_per_wave})`);
  // A3: avaliabilidade por campo — onde a evidência falta, diz-se por campo e porquê.
  for (const field of SCIENCE_FIELDS) {
    const bf = d.by_field[field];
    if (bf.needs.length && bf.capture_sufficient.eligible < d.eligible_evaluable) {
      const why = Object.entries(bf.eligible_not_applicable_why).map(([k, v]) => `${k}×${v}`).join(', ');
      limits.push(`${field}: aplicável com captura suficiente em ${bf.capture_sufficient.eligible}/${d.eligible_evaluable} slots elegíveis com resposta (exige ${bf.needs.join('+')}; falta: ${why || 'n/d'})`);
    }
    // B2: aplicável ≠ avaliável — o que ficou por adjudicar (null) diz-se, por campo.
    if (bf.evaluable && bf.evaluable.eligible !== null && bf.evaluable.eligible < bf.capture_sufficient.eligible) {
      limits.push(`${field}: adjudicado (≠ null) em ${bf.evaluable.eligible}/${bf.capture_sufficient.eligible} slots elegíveis aplicáveis com captura suficiente`);
    }
  }
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
  // B2: evaluable = capture_sufficient E adjudicação ≠ null em scores.jsonl (a última observação do campo para o slot vence).
  const adjudicated = (slot_id, field) => { const recs = scores.filter((r) => r.slot_id === slot_id && r.field === field); return recs.length ? recs[recs.length - 1].value !== null : false; };
  for (const x of Object.values(d.per_slot)) {
    x.evaluable_for = Object.fromEntries(SCIENCE_FIELDS.map((f) => [f, x.capture_sufficient_for[f] && adjudicated(x.slot_id, f)]));
  }
  for (const f of SCIENCE_FIELDS) {
    const bf = d.denominators.by_field[f];
    bf.evaluable = {
      eligible: Object.values(d.per_slot).filter((x) => x.role === 'eligible' && x.evaluable_for[f]).length,
      negative: Object.values(d.per_slot).filter((x) => x.role === 'negative' && x.evaluable_for[f]).length,
    };
    if (bf.evaluable.eligible > bf.capture_sufficient.eligible || bf.capture_sufficient.eligible > bf.applicable.eligible) throw new CloseoutError('field_layers_broken', `${f}: evaluable ≤ capture_sufficient ≤ applicable violado`);
  }
  d.denominators.evaluable_by_field = Object.fromEntries(SCIENCE_FIELDS.map((f) => [f, { ...d.denominators.by_field[f].evaluable }]));
  const per_intent = countObservations({
    scores, slot_ids: d.frozen.slot_ids, prompt_of: d.frozen.prompt_of || {},
    applicable_of: Object.fromEntries(Object.values(d.per_slot).map((x) => [x.slot_id, x.applicable_for])),
    capture_sufficient_of: Object.fromEntries(Object.values(d.per_slot).map((x) => [x.slot_id, x.capture_sufficient_for])),
  });
  const integrity = integrityReport(ctx);
  const artifacts = artifactsAndHashes(ctx);
  for (const inv of invalidated) {
    if (!d.per_slot[inv.slot_id]) throw new CloseoutError('bad_invalidation', `invalidated: slot ${inv.slot_id} desconhecido`);
    if (d.per_slot[inv.slot_id].outcome !== 'complete') throw new CloseoutError('bad_invalidation', `invalidated: slot ${inv.slot_id} não é complete (${d.per_slot[inv.slot_id].outcome})`);
    if (typeof inv.reason !== 'string' || inv.reason.trim().length < 8) throw new CloseoutError('bad_invalidation', `invalidated: ${inv.slot_id} sem razão (≥ 8 caracteres)`);
  }
  const h = (k) => (k in human && human[k] !== undefined && human[k] !== null && human[k] !== '' ? human[k] : TODO);
  const amendments = loadAmendments();
  const conclusion = {
    schema: CONCLUSION_SCHEMA,
    semantics_version: SEMANTICS_VERSION,
    contract: { version: CONTRACT.version, sha256: CONTRACT.sha256, closeout_required_count: CLOSEOUT_REQUIRED.length },
    external_review: externalReviewState(amendments),
    external_review_detail: externalReviewDetail(amendments),
    amendments,
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
  // A4: completude = campos com julgamento concluído / len(closeout_required). <<TODO>> e
  // «n/d» sem justificação escrita contam como em falta.
  const missing = missingFields(conclusion);
  conclusion.completeness = { required: CLOSEOUT_REQUIRED.length, concluded: CLOSEOUT_REQUIRED.length - missing.length, missing: missing.map((m) => m.field), rule: 'concluded / required; <<TODO>> e «n/d» sem justificação (≥ 8 caracteres) contam como em falta' };
  return conclusion;
}

/** «n/d» só com justificação escrita (A4): `n/d — <porquê>` com ≥ 8 caracteres úteis depois do n/d. */
export function isBareNd(v) {
  if (typeof v !== 'string') return false;
  const m = v.trim().match(/^n\/d\b(.*)$/i);
  if (!m) return false;
  const just = m[1].replace(/^[\s—–\-:(),.]+/, '').replace(/[\s).]+$/, '');
  return just.length < 8;
}
function missingFields(c) {
  const out = [];
  for (const k of CLOSEOUT_REQUIRED) {
    if (c[k] === TODO || c[k] === undefined) out.push({ field: k, why: c[k] === undefined ? 'undefined' : TODO });
    else if (isBareNd(c[k])) out.push({ field: k, why: 'n/d sem justificação escrita' });
  }
  return out;
}

/** Lista os campos obrigatórios ainda por preencher. */
export function checkConclusion(c) {
  const missing = missingFields(c);
  const todos = missing.map((m) => m.field);
  const problems = [];
  for (const m of missing) if (m.why === 'n/d sem justificação escrita') problems.push(`${m.field}: «n/d» só com justificação escrita (A4) — n/d não é julgamento concluído`);
  if (c.decision !== TODO && !WAVE_DECISIONS.includes(c.decision)) problems.push(`decision ∈ ${WAVE_DECISIONS.join('|')} (recebido ${JSON.stringify(c.decision)})`);
  if (!c.identity?.planned_equals_sum) problems.push('planned ≠ soma dos outcomes');
  // Regra do piloto (G6): cobertura decisiva incompleta força inconclusive.
  const den = c.eligible_evaluable_denominator || {};
  const primaryLike = c.partition && c.partition !== 'synthetic-qualification';
  if (primaryLike && c.decision === 'qualified_for_next_design' && (den.eligible_evaluable < den.planned_eligible || den.negative_evaluable < den.negative_planned)) {
    problems.push(`inconclusive_forced: eligible_evaluable ${den.eligible_evaluable}/${den.planned_eligible}, negative_evaluable ${den.negative_evaluable}/${den.negative_planned} — cobertura decisiva incompleta não qualifica`);
  }
  if (den.positions_identity_ok === false) problems.push('planned_eligible + negative_planned + other ≠ coverage_per_wave');
  if (c.semantics_version !== SEMANTICS_VERSION) problems.push(`semantics_version ${c.semantics_version} ≠ ${SEMANTICS_VERSION}`);
  if (!EXTERNAL_REVIEW_STATES.includes(c.external_review)) problems.push(`external_review ∈ ${EXTERNAL_REVIEW_STATES.join('|')}`);
  if (Array.isArray(c.amendments) && c.external_review !== externalReviewState(c.amendments)) problems.push(`external_review ${c.external_review} não corresponde ao registo de emendas (${externalReviewState(c.amendments)}) — não se escreve à mão`);
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
