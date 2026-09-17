// scores.mjs — o ledger CIENTÍFICO: observações independentes, com proveniência,
// que NÃO são uma máquina de estados (contrato 0.3 scientific_observations,
// not_an_operational_state_machine = true).
//
// PORQUÊ ISTO EXISTE (2026-09-16 · cc-plan-20260916-v1, passo 4 de P1.0)
// Dois ledgers (G6): o operacional (events.jsonl — o que aconteceu ao slot) e
// o científico (scores.jsonl — o que o reviewer observou na resposta). Ligados
// por (wave_id, slot_id, answer_sha256), nunca fundidos. Um campo científico
// nunca é derivado de outro: «acesso do crawler» não promove «citação», e
// «citação» não promove «uso do facto novo» (caso 20). Cada valor é
// true | false | null, com fonte, instante, referência à evidência e reviewer.
// null é «não observado», não «ausente».
//
// O LLM local pode SUGERIR uma extracção; quem escreve aqui é um humano com
// acesso ao original (PROTOCOLO §8). Este módulo só recusa o que não tem
// proveniência — não julga o conteúdo.

import path from 'node:path';
import crypto from 'node:crypto';

import { readEvents, waveState, slotState, JournalError } from './journal.mjs';
import { loadContract } from './contract.mjs';

export const SCORES_SCHEMA = 'prisma-experiment-scores/0.3-proposed';
export const sha256 = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');

// AMENDMENT-001 (correcção mecânica): campos, domínio de valores e proveniência lidos
// do contrato congelado. `competitor_included` é a chave própria do contrato
// (scientific_observations.competitor_included: «Per-brand observations, descriptive
// comparisons only») — entra como campo por marca, fora dos 8 de `fields`.
const CONTRACT = loadContract();
export const SCIENCE_FIELDS = Object.freeze([...CONTRACT.science_fields, 'competitor_included']);
export const VALUE_DOMAIN = CONTRACT.science_value_domain;
export const REQUIRED_PROVENANCE = CONTRACT.science_provenance;

export class ScoreError extends Error {
  constructor(code, message, details = {}) { super(message); this.name = 'ScoreError'; this.code = code; this.details = details; }
}

export const scoresPath = (ctx) => path.join(ctx.dir, 'scores.jsonl');

/** Valida um registo científico. Devolve a lista de falhas (vazia = bom). Não escreve. */
export function validateScore(rec, { knownSlots = null } = {}) {
  const f = [];
  const push = (code, detail) => f.push({ code, detail });
  if (!rec || typeof rec !== 'object') return [{ code: 'not_an_object', detail: 'registo tem de ser objecto' }];
  if (typeof rec.slot_id !== 'string' || !rec.slot_id) push('missing_field', 'slot_id');
  else if (knownSlots && !knownSlots.includes(rec.slot_id)) push('slot_unknown', `slot ${rec.slot_id} não está no manifesto — observações só sobre slots congelados (o holdout não passa por aqui)`);
  if (!SCIENCE_FIELDS.includes(rec.field)) push('bad_field', `field ∈ ${SCIENCE_FIELDS.join('|')}`);
  if (!VALUE_DOMAIN.includes(rec.value)) push('bad_value', 'value ∈ true|false|null');
  for (const k of REQUIRED_PROVENANCE) if (!(k in rec)) push('provenance_missing', k);
  if ('source' in rec && (typeof rec.source !== 'string' || !rec.source)) push('provenance_missing', 'source vazio');
  if ('reviewer' in rec && (typeof rec.reviewer !== 'string' || !rec.reviewer)) push('provenance_missing', 'reviewer vazio');
  if ('timestamp' in rec && !(typeof rec.timestamp === 'string' && Number.isFinite(Date.parse(rec.timestamp)))) push('provenance_missing', 'timestamp ISO inválido');
  if (rec.field === 'new_fact_used' && rec.value === true) {
    const ev = rec.evidence_reference;
    const ok = ev && typeof ev === 'object' && typeof ev.diff === 'string' && ev.diff.length > 0 && typeof ev.excerpt === 'string' && ev.excerpt.length > 0;
    if (!ok) push('evidence_required', 'new_fact_used=true exige evidence_reference{diff, excerpt}: o diff da página e o excerto da resposta (contrato 0.3: «A cited URL alone does not prove use of the revised fact»)');
  }
  if (rec.field === 'competitor_included' && rec.value !== null && (typeof rec.brand !== 'string' || !rec.brand)) push('missing_field', 'competitor_included exige brand (observação por marca, descritiva)');
  if ('answer_sha256' in rec && rec.answer_sha256 != null && !/^[0-9a-f]{64}$/.test(String(rec.answer_sha256))) push('bad_value', 'answer_sha256');
  return f;
}

function knownSlotsOf(ctx, events) {
  const frozen = events.find((e) => e.kind === 'wave.frozen');
  return frozen && Array.isArray(frozen.payload?.slot_ids) ? frozen.payload.slot_ids : null;
}

/**
 * Acrescenta UMA observação a scores.jsonl (append, fsync). Recusa registos
 * sem proveniência, campos fora da lista, slots fora do manifesto, e
 * new_fact_used=true sem diff+excerto. Nunca deriva nada.
 */
export function appendScore(ctx, rec) {
  const events = readEvents(ctx);
  const w = waveState(ctx, events);
  if (w.state === 'registered') throw new ScoreError('wave_not_frozen', 'sem manifesto congelado não há slots para observar');
  const known = knownSlotsOf(ctx, events);
  const falhas = validateScore(rec, { knownSlots: known });
  if (falhas.length) throw new ScoreError('score_invalid', `observação inválida (${falhas.length}): ${falhas.map((x) => `${x.code}: ${x.detail}`).join('; ')}`, { failures: falhas });
  // Liga ao operacional: o slot tem de ter uma captura (há resposta para observar) — excepto campos de acesso (crawl_access), que são sobre o servidor, não sobre a resposta.
  const s = slotState(ctx, rec.slot_id, events);
  const capturedEv = [...events].reverse().find((e) => e.slot_id === rec.slot_id && e.kind === 'captured');
  if (!capturedEv && rec.field !== 'crawl_access') throw new ScoreError('no_capture_for_slot', `slot ${rec.slot_id} não tem captura (está ${s.state ?? 'sem evento'}); só crawl_access se observa sem resposta`);
  if (capturedEv && rec.answer_sha256 != null && rec.answer_sha256 !== capturedEv.payload.answer_sha256) throw new ScoreError('answer_hash_mismatch', `a observação refere answer_sha256 ${String(rec.answer_sha256).slice(0, 12)}…, a captura do slot é ${capturedEv.payload.answer_sha256.slice(0, 12)}…`);
  const entry = {
    schema: SCORES_SCHEMA,
    recorded_at: new Date(ctx.now()).toISOString(),
    wave_id: ctx.waveId,
    answer_sha256: capturedEv ? capturedEv.payload.answer_sha256 : null,
    ...rec,
  };
  const line = Buffer.from(JSON.stringify(entry) + '\n', 'utf8');
  let fd = null;
  try {
    fd = ctx.fs.openSync(scoresPath(ctx), 'a');
    ctx.fs.writeSync(fd, line, 0, line.length);
    ctx.fs.fsyncSync(fd);
  } catch (e) {
    throw new JournalError('journal_write_failed', `não consegui persistir a observação: ${e && e.message}`);
  } finally { if (fd !== null) { try { ctx.fs.closeSync(fd); } catch { /* */ } } }
  return entry;
}

/** Lê scores.jsonl (vazio se não existir). Linha ilegível ⇒ ScoreError('scores_corrupt'). */
export function readScores(ctx) {
  let raw;
  try { raw = ctx.fs.readFileSync(scoresPath(ctx), 'utf8'); } catch (e) { if (e && e.code === 'ENOENT') return []; throw e; }
  const out = [];
  raw.split('\n').filter(Boolean).forEach((l, i) => {
    try { out.push(JSON.parse(l)); } catch { throw new ScoreError('scores_corrupt', `scores.jsonl linha ${i + 1} não é JSON`); }
  });
  return out;
}

/**
 * Contagens DESCRITIVAS por intenção (prompt_id) e por campo: quantos true,
 * false, null — contando registos, nunca inferindo. Um slot sem registo para um
 * campo conta como null («não observado»). Nada é promovido de campo para campo.
 */
export function countObservations({ scores, slot_ids, prompt_of, applicable_of = null, capture_sufficient_of = null }) {
  const byIntent = {};
  const intents = [...new Set(slot_ids.map((s) => prompt_of[s]))];
  const layered = !!(applicable_of && capture_sufficient_of);
  for (const intent of intents) {
    byIntent[intent] = {};
    const slotsOf = slot_ids.filter((s) => prompt_of[s] === intent);
    for (const field of SCIENCE_FIELDS) {
      // AMENDMENT-001 A3 / 001b B2: os denominadores por campo vêm do closeout, nunca daqui —
      // n_applicable (manifesto declara a evidência), n_capture_sufficient (aplicável e com
      // resposta) e n_evaluable (capture_sufficient E adjudicado ≠ null). Um valor observado
      // num slot sem captura suficiente fica contado à parte (observed_outside_denominator) —
      // não se apaga, não se promove. null nunca conta como avaliável.
      const c = { true: 0, false: 0, null: 0, n_slots: slotsOf.length, n_records: 0, n_applicable: layered ? 0 : null, n_capture_sufficient: layered ? 0 : null, n_evaluable: layered ? 0 : null, observed_outside_denominator: layered ? 0 : null };
      for (const slot of slotsOf) {
        // Última observação desse campo para esse slot vence (revisões posteriores supersedem, e ficam no ficheiro).
        const recs = scores.filter((r) => r.slot_id === slot && r.field === field);
        c.n_records += recs.length;
        const last = recs.length ? recs[recs.length - 1] : null;
        const v = last ? last.value : null;
        c[String(v)]++;
        if (layered) {
          const ap = applicable_of[slot] && applicable_of[slot][field] === true;
          const cs = capture_sufficient_of[slot] && capture_sufficient_of[slot][field] === true;
          if (ap) c.n_applicable++;
          if (cs) c.n_capture_sufficient++;
          if (cs && v !== null) c.n_evaluable++;
          if (!cs && v !== null) c.observed_outside_denominator++;
        }
      }
      byIntent[intent][field] = c;
    }
  }
  return byIntent;
}
