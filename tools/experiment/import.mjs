// import.mjs — o que entra no diário DEPOIS de haver resposta (ou de não haver):
// a captura ligada ao slot que a pediu, o consumo com proveniência por métrica,
// a falha com o literal do fornecedor, e a recuperação da MESMA resposta.
//
// PORQUÊ ISTO EXISTE (2026-09-16 · cc-plan-20260916-v1, passo 3 de P1.0)
// G4 (gap-audit), medido no motor em 8dfdb8b8:
//   · packages/workflow/src/agent.ts:65-67 — tokens em falta viram ceil(len/4)
//     sem dizer que são estimados;
//   · packages/workflow/src/state.ts:213-224 — `cost_usd ?? 0`, `tokens ?? 0`,
//     e uma «poupança» calculada por cima de zeros;
//   · tools/router/pricing.js:179,240-246,256-261 — FALLBACK_PRICE {3, 15}
//     para QUALQUER modelo desconhecido e `Number(x) || 0` nos tokens: o SSOT
//     nunca responde «não sei»;
//   · tools/router/cost-perf-tracker.js:70-75 — um lado em falta vira 0.
// E a onda-01 (addendum B): uma captura parcial recuperada depois — a mesma
// resposta, não uma conversa nova.
//
// O que este ficheiro garante:
//   1. Uma captura liga-se SEMPRE a um slot que já tem intent_committed. Nunca
//      cria slot; nunca cria conversa (caso 05).
//   2. Cada métrica de consumo é { value, basis, source }, basis ∈ observed |
//      estimated | imputed | unknown. value null ⇒ basis unknown. Nenhuma soma
//      trata null como 0 (caso 09). Input conhecido + output desconhecido ⇒
//      custo `partial`, nunca total (caso 18).
//   3. O preço vem da linha EXACTA de pricing.js (PRICES[model_key]); sem linha
//      ⇒ custo unknown com reason 'no_price_row'. O fallback do SSOT nunca é
//      chamado. O envelope grava o sha256 e o «Last reviewed» de pricing.js —
//      proveniência sem congelar preços.
//   4. Falha do fornecedor: classe = provider-health.classificarFalha(literal)
//      (pinado, C3), literal SEMPRE guardado; reset lido do literal. Falha de
//      CAPTURA nunca passa pelo classificador — é capture_failure por
//      definição (caso 08: «capture failure not recoded as quota»). Recusa é
//      uma resposta capturada com refusal:true, nunca parafraseada.
//   5. Recuperação: o parcial anterior é RENOMEADO (answer.partial-N.txt) e o
//      seu hash entra no evento como `supersedes`; nada se apaga.
//   6. Condição observada ≠ pedida depois da resposta ⇒ policy_review antes de
//      captured; a captura fica (raw), o slot sai `partial` no fecho (caso 02).

import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';

import { appendEvent, readEvents, waveState, slotState, JournalError } from './journal.mjs';
import { loadFrozenManifest, FreezeError } from './freeze.mjs';
import { verifyPins, REPO_ROOT } from './pins.mjs';

const require = createRequire(import.meta.url);
const providerHealth = require('../router/provider-health.js'); // pinado (C3)
const pricing = require('../router/pricing.js');               // NÃO pinado: proveniência por sha256 + «Last reviewed»

export const sha256 = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
export const BASIS = Object.freeze(['observed', 'estimated', 'imputed', 'unknown']);
export const COMPLETENESS = Object.freeze(['full', 'partial', 'unknown']);
export const IMPORTABLE_FROM = Object.freeze(['submitted', 'submission_uncertain', 'capture_uncertain', 'policy_review']);

export class ImportError extends Error {
  constructor(code, message, details = {}) { super(message); this.name = 'ImportError'; this.code = code; this.details = details; }
}

// ── consumo com proveniência ─────────────────────────────────────────────────

/** Normaliza uma métrica para { value, basis, source }. null ⇒ unknown; estimated/imputed exigem source. */
export function metric(input, { name = 'metric' } = {}) {
  if (input == null) return { value: null, basis: 'unknown', source: null };
  if (typeof input === 'number') throw new ImportError('metric_without_basis', `${name}: um número sem basis não é evidência — passar { value, basis, source }`);
  const { value = null, basis, source = null } = input;
  if (value === null || value === undefined) return { value: null, basis: 'unknown', source: source ?? null };
  if (!(typeof value === 'number' && Number.isFinite(value) && value >= 0)) throw new ImportError('metric_bad_value', `${name}: value tem de ser número finito ≥ 0 ou null`);
  if (!BASIS.includes(basis)) throw new ImportError('metric_bad_basis', `${name}: basis ∈ ${BASIS.join('|')} (recebido ${JSON.stringify(basis)})`);
  if (basis === 'unknown') throw new ImportError('metric_bad_basis', `${name}: basis unknown com value ${value} é contradição — ou há valor com base, ou não há valor`);
  if ((basis === 'estimated' || basis === 'imputed') && !source) throw new ImportError('metric_needs_source', `${name}: basis ${basis} exige source (ex.: 'chars/4')`);
  return { value, basis, source };
}

let _pricingProv = null;
/** Proveniência do módulo de preços: sha256 dos bytes + «Last reviewed» do cabeçalho. */
export function pricingProvenance({ fs = null } = {}) {
  if (_pricingProv && !fs) return _pricingProv;
  const nodeFs = fs || require('node:fs');
  const p = path.join(REPO_ROOT, 'tools', 'router', 'pricing.js');
  let bytes = null;
  try { bytes = nodeFs.readFileSync(p); } catch { return { module: 'tools/router/pricing.js', sha256: null, last_reviewed: null }; }
  const m = bytes.toString('utf8').match(/Last reviewed:\s*(\d{4}-\d{2}-\d{2})/);
  const prov = { module: 'tools/router/pricing.js', sha256: sha256(bytes), last_reviewed: m ? m[1] : null, unit: 'USD per MTok, list price' };
  if (!fs) _pricingProv = prov;
  return prov;
}

/**
 * Custo com proveniência. NUNCA chama pricing.getPrice/priceTurn (fallback
 * silencioso): lê a linha exacta. Devolve sempre um envelope, nunca lança por
 * falta de dados.
 */
export function costEnvelope({ model_key = null, tokens_in, tokens_out }) {
  const ti = metric(tokens_in, { name: 'tokens_in' });
  const to = metric(tokens_out, { name: 'tokens_out' });
  const prov = pricingProvenance();
  const row = model_key && Object.prototype.hasOwnProperty.call(pricing.PRICES, model_key) ? pricing.PRICES[model_key] : null;
  const base = { model_key: model_key ?? null, price_basis: row ? { input_per_mtok: row.input, output_per_mtok: row.output, ...prov } : { ...prov, row: null } };
  if (!row) return { value: null, basis: 'unknown', reason: model_key ? 'no_price_row' : 'no_model_key', ...base, input_component: null, output_component: null };
  const comp = (m, per) => (m.value === null ? { value: null, basis: 'unknown' } : { value: (m.value * per) / 1e6, basis: m.basis, source: m.source });
  const ic = comp(ti, row.input);
  const oc = comp(to, row.output);
  if (ic.value === null && oc.value === null) return { value: null, basis: 'unknown', reason: 'no_usage', ...base, input_component: ic, output_component: oc };
  if (ic.value === null || oc.value === null) return { value: null, basis: 'partial', reason: ic.value === null ? 'input_unknown' : 'output_unknown', ...base, input_component: ic, output_component: oc };
  const worst = [ti.basis, to.basis].includes('imputed') ? 'imputed' : [ti.basis, to.basis].includes('estimated') ? 'estimated' : 'observed';
  return { value: ic.value + oc.value, basis: worst, reason: null, ...base, input_component: ic, output_component: oc };
}

/** Envelope completo de consumo de uma resposta. */
export function usageEnvelope({ model_key = null, tokens_in = null, tokens_out = null, latency_ms = null } = {}) {
  const ti = metric(tokens_in, { name: 'tokens_in' });
  const to = metric(tokens_out, { name: 'tokens_out' });
  const lat = metric(latency_ms, { name: 'latency_ms' });
  return { model_key: model_key ?? null, tokens_in: ti, tokens_out: to, latency_ms: lat, cost_usd: costEnvelope({ model_key, tokens_in: ti, tokens_out: to }) };
}

/**
 * Agrega envelopes SEM tratar null como 0: soma só o que tem value, e conta
 * por basis. É a função que o closeout (passo 4) usa.
 */
export function aggregateUsage(envelopes) {
  const out = {};
  for (const k of ['tokens_in', 'tokens_out', 'cost_usd']) {
    const acc = { observed_sum: 0, estimated_sum: 0, imputed_sum: 0, partial_sum: null, n_observed: 0, n_estimated: 0, n_imputed: 0, n_partial: 0, n_unknown: 0, n_total: 0, coverage: null };
    for (const env of envelopes) {
      const m = env && env[k];
      acc.n_total++;
      if (!m || m.value === null || m.basis === 'unknown') { acc.n_unknown++; continue; }
      if (m.basis === 'partial') { acc.n_partial++; continue; }
      acc[`n_${m.basis}`]++;
      acc[`${m.basis}_sum`] += m.value;
    }
    acc.coverage = acc.n_total ? acc.n_observed / acc.n_total : null;
    acc.exact_total = null; // nunca existe um «total exacto» com unknown/estimated/partial no meio
    out[k] = acc;
  }
  return out;
}

// ── ficheiros ────────────────────────────────────────────────────────────────

function slotDir(ctx, slotId) { return path.join(ctx.rawDir, slotId); }

function writeDurably(ctx, file, bytes) {
  const tmp = `${file}.tmp-${process.pid}`;
  let fd = null;
  try {
    fd = ctx.fs.openSync(tmp, 'w');
    ctx.fs.writeSync(fd, bytes, 0, bytes.length);
    ctx.fs.fsyncSync(fd);
  } finally { if (fd !== null) { try { ctx.fs.closeSync(fd); } catch { /* já lançou */ } } }
  ctx.fs.renameSync(tmp, file);
}

/** Renomeia answer.txt existente para answer.partial-N.txt e devolve { file, sha256 } ou null. */
function shelveExisting(ctx, slotId) {
  const dir = slotDir(ctx, slotId);
  const file = path.join(dir, 'answer.txt');
  if (!ctx.fs.existsSync(file)) return null;
  let n = 1;
  try { n = ctx.fs.readdirSync(dir).filter((f) => /^answer\.partial-\d+\.txt$/.test(f)).length + 1; } catch { n = 1; }
  const target = path.join(dir, `answer.partial-${String(n).padStart(2, '0')}.txt`);
  const bytes = ctx.fs.readFileSync(file);
  ctx.fs.renameSync(file, target);
  return { file: path.relative(ctx.dir, target).split(path.sep).join('/'), sha256: sha256(bytes), bytes: bytes.length };
}

function requireSlotWithIntent(ctx, slot_id, events) {
  let manifest = null;
  try { manifest = loadFrozenManifest(ctx); } catch (e) { if (e instanceof FreezeError) throw new ImportError(e.code === 'manifest_missing' ? 'manifest_missing' : 'manifest_tampered', e.message); throw e; }
  const def = (manifest.slots || []).find((s) => s.slot_id === slot_id);
  if (!def) throw new ImportError('slot_unknown', `slot ${slot_id} não está no manifesto — o importador nunca cria slots`);
  const s = slotState(ctx, slot_id, events);
  if (!s.history.includes('intent_committed')) throw new ImportError('no_intent_for_slot', `slot ${slot_id} nunca teve intent_committed (está ${s.state ?? 'sem evento'}); uma resposta sem intenção registada não é deste slot`);
  return { manifest, def, s };
}

// ── captura ──────────────────────────────────────────────────────────────────

/**
 * Importa a resposta capturada para o slot que a pediu.
 *
 * @param {object} ctx
 * @param {object} o
 * @param {string} o.slot_id
 * @param {Buffer|Uint8Array} o.answer_bytes   bytes tal como capturados (nada normalizado)
 * @param {'full'|'partial'|'unknown'} o.capture_completeness
 * @param {string} o.capture_method
 * @param {object} o.observed          condição observada DEPOIS da resposta (inclui search_used ∈ true|false|null, observed_model_label, citation_count…)
 * @param {Array}  [o.citations]       [{ url, domain?, position?, excerpt? }]
 * @param {object} [o.usage]           { model_key?, tokens_in?, tokens_out?, latency_ms? } — cada um { value, basis, source } ou null
 * @param {string|null} [o.provider_run_id]
 * @param {boolean} [o.refusal=false]  a resposta é uma recusa: fica como está, marcada
 * @param {boolean} [o.recover=false]  recuperação da MESMA resposta (submission_uncertain/capture_uncertain)
 * @param {string} [o.operator_id]
 * @param {string} [o.note]
 */
export function importCapture(ctx, { slot_id, answer_bytes, capture_completeness, capture_method, observed = {}, citations = [], usage = {}, provider_run_id = null, refusal = false, recover = false, operator_id = null, note = '' } = {}) {
  if (typeof slot_id !== 'string') throw new ImportError('bad_input', 'slot_id obrigatório');
  if (!(answer_bytes instanceof Uint8Array)) throw new ImportError('bad_input', 'answer_bytes tem de ser Buffer/Uint8Array — os bytes capturados, não uma string');
  if (!COMPLETENESS.includes(capture_completeness)) throw new ImportError('bad_input', `capture_completeness ∈ ${COMPLETENESS.join('|')}`);
  if (typeof capture_method !== 'string' || !capture_method) throw new ImportError('bad_input', 'capture_method obrigatório');
  if (![true, false, null, undefined].includes(observed.search_used)) throw new ImportError('bad_input', 'observed.search_used ∈ true|false|null');
  const pins = verifyPins();
  if (!pins.ok) throw new ImportError('pins_mismatch', 'motor mudou por baixo do kit', pins);

  const events = readEvents(ctx);
  const { manifest, s } = requireSlotWithIntent(ctx, slot_id, events);
  const w = waveState(ctx, events);
  if (w.state === 'closed') throw new ImportError('wave_closed', 'a onda fechou; evidência nova vai para uma interpretação nova');
  if (!IMPORTABLE_FROM.includes(s.state)) throw new ImportError('slot_not_importable', `slot ${slot_id} está ${s.state}; importa-se a partir de ${IMPORTABLE_FROM.join('|')}`, { state: s.state });
  const uncertain = s.state === 'submission_uncertain' || s.state === 'capture_uncertain';
  if (uncertain && !recover) throw new ImportError('recover_required', `slot ${slot_id} está ${s.state}: só se importa com recover:true — e só a MESMA resposta (provider_run_id ou inspecção manual registada em note)`, { state: s.state });
  if (recover && !provider_run_id && !(typeof note === 'string' && note.trim().length >= 8)) throw new ImportError('recover_needs_proof', 'recuperação exige provider_run_id ou uma nota (≥ 8 caracteres) de como se confirmou que é a mesma resposta');

  // Condição observada depois da resposta: drift ⇒ policy_review ANTES de captured.
  const req = manifest.condition_requested;
  const drift = [];
  if (observed.observed_model_label != null && observed.observed_model_label !== req.selected_model_label) drift.push({ field: 'observed_model_label', requested: req.selected_model_label, observed: observed.observed_model_label });
  if (observed.surface != null && observed.surface !== req.surface) drift.push({ field: 'surface', requested: req.surface, observed: observed.surface });
  if (observed.personalization != null && observed.personalization !== 'off') drift.push({ field: 'personalization', requested: 'off', observed: observed.personalization });
  if (drift.length && s.state !== 'policy_review') {
    appendEvent(ctx, { slot_id, kind: 'policy_review', payload: { reason: 'condition_drift', drift, condition_closed: true, note: 'não se corrige em silêncio; a captura fica, o slot sai partial' } });
  }

  // Ficheiros: o anterior (se existir) é guardado, nunca apagado.
  const dir = slotDir(ctx, slot_id);
  ctx.fs.mkdirSync(dir, { recursive: true });
  const supersedes = shelveExisting(ctx, slot_id);
  const answerFile = path.join(dir, 'answer.txt');
  const bytes = Buffer.from(answer_bytes);
  const answer_sha256 = sha256(bytes);
  writeDurably(ctx, answerFile, bytes);
  writeDurably(ctx, path.join(dir, 'answer.sha256'), Buffer.from(`${answer_sha256}  answer.txt\n`, 'utf8'));

  // Citações: ficheiro da onda, append (uma linha por citação, com o slot).
  const cites = Array.isArray(citations) ? citations : [];
  if (cites.length) {
    const lines = cites.map((c, i) => JSON.stringify({ ts: new Date(ctx.now()).toISOString(), wave_id: ctx.waveId, slot_id, answer_sha256, position: i, ...c })).join('\n') + '\n';
    const cfile = path.join(ctx.dir, 'citations.jsonl');
    let fd = null;
    try { fd = ctx.fs.openSync(cfile, 'a'); const b = Buffer.from(lines, 'utf8'); ctx.fs.writeSync(fd, b, 0, b.length); ctx.fs.fsyncSync(fd); } finally { if (fd !== null) { try { ctx.fs.closeSync(fd); } catch { /* */ } } }
  }

  const env = usageEnvelope(usage);
  const payload = {
    answer_file: 'raw/' + slot_id + '/answer.txt',
    answer_sha256, answer_bytes: bytes.length,
    capture_completeness, capture_method,
    recovered: !!recover, supersedes,
    provider_run_id: provider_run_id ?? null,
    refusal: !!refusal,
    observed: { ...observed, search_used: observed.search_used ?? null },
    citation_count: cites.length,
    usage: env,
    condition_divergent: drift.length > 0 || s.state === 'policy_review',
    operator_id: operator_id ?? null,
    note: String(note || '').slice(0, 500),
  };
  const entry = appendEvent(ctx, { slot_id, kind: 'captured', payload });
  return { entry, answer_sha256, supersedes, usage: env, drift };
}

/**
 * A resposta existe mas a captura falhou (ligação caiu, UI não mostrou): o slot
 * fica capture_uncertain com o literal. NUNCA passa pelo classificador de
 * falhas do fornecedor — uma falha de captura não é quota (caso 08).
 */
export function markCaptureUncertain(ctx, { slot_id, literal, partial_bytes = null, capture_method = null } = {}) {
  if (typeof literal !== 'string' || !literal) throw new ImportError('bad_input', 'literal obrigatório: o que se viu, tal como se viu');
  const events = readEvents(ctx);
  const { s } = requireSlotWithIntent(ctx, slot_id, events);
  if (!['submitted', 'submission_uncertain'].includes(s.state)) throw new ImportError('slot_not_importable', `capture_uncertain só a partir de submitted|submission_uncertain (está ${s.state})`);
  let partial = null;
  if (partial_bytes instanceof Uint8Array) {
    const dir = slotDir(ctx, slot_id);
    ctx.fs.mkdirSync(dir, { recursive: true });
    const shelved = shelveExisting(ctx, slot_id);
    const b = Buffer.from(partial_bytes);
    writeDurably(ctx, path.join(dir, 'answer.txt'), b);
    // O parcial também é evidência: leva o seu hash ao lado, para o integrityReport o verificar
    // como a qualquer captura (apanhado pelo teste 10c).
    writeDurably(ctx, path.join(dir, 'answer.sha256'), Buffer.from(`${sha256(b)}  answer.txt\n`, 'utf8'));
    partial = { file: 'raw/' + slot_id + '/answer.txt', sha256: sha256(b), bytes: b.length, shelved };
  }
  return appendEvent(ctx, { slot_id, kind: 'capture_uncertain', payload: { class: 'capture_failure', literal: literal.slice(0, 2000), partial, capture_method } });
}

/**
 * O fornecedor devolveu um erro em vez de resposta. Classe via provider-health
 * (pinado), literal guardado, reset lido do literal. Quota/ritmo geram também
 * a pausa de onda correspondente, para o scheduler honrar o reset.
 */
export function importFailure(ctx, { slot_id, literal, http_status = null, operator_id = null } = {}) {
  if (typeof literal !== 'string' || !literal) throw new ImportError('bad_input', 'literal obrigatório: a mensagem do fornecedor tal como apareceu');
  const events = readEvents(ctx);
  const { s } = requireSlotWithIntent(ctx, slot_id, events);
  if (!IMPORTABLE_FROM.includes(s.state)) throw new ImportError('slot_not_importable', `failed só a partir de ${IMPORTABLE_FROM.join('|')} (está ${s.state})`);
  const cls = providerHealth.classificarFalha({ message: literal, status: http_status ?? undefined });
  const now_ms = ctx.now();
  const resetMs = providerHealth.lerReposicao(literal, now_ms);
  const reset_at = resetMs ? new Date(resetMs).toISOString() : null;
  const entry = appendEvent(ctx, { slot_id, kind: 'failed', payload: { class: cls, literal: literal.slice(0, 2000), http_status, reset_at, operator_id } });
  let pause = null;
  const w = waveState(ctx, events);
  if ((cls === 'rate_limited' || cls === 'quota_exhausted') && w.state === 'open') {
    const kind = cls === 'rate_limited' ? 'wave.throttled' : 'wave.reset_wait';
    const fallbackMs = providerHealth.CAUSAS[cls].recuperaEmMs;
    const next = reset_at ?? new Date(now_ms + fallbackMs).toISOString();
    pause = appendEvent(ctx, { kind, payload: { slot_id, class: cls, literal: literal.slice(0, 500), reset_at, next_action_at: next, basis: reset_at ? 'provider_literal' : `provider-health CAUSAS.${cls}.recuperaEmMs` } });
  }
  return { entry, class: cls, reset_at, pause };
}
