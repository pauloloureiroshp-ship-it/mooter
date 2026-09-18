// preflight.mjs — o que se verifica ANTES de o operador colar o texto numa
// sessão nova da superfície. Nada aqui toca o fornecedor.
//
// PORQUÊ ISTO EXISTE (2026-09-16 · cc-plan-20260916-v1, passo 2 de P1.0)
// G5 (gap-audit): «Payload byte hash matches frozen question before send» e
// «Synthetic canary coordinator context never appears in outbound payload».
// G1: «Mutating any registered field after freeze blocks before adapter side
// effect». Caso 19: search_available (elegibilidade) ≠ search_used
// (observação). Caso 14: sem identidade não há envio oficial; ensaios
// sintéticos continuam, marcados.
//
// O preflight avalia TODAS as verificações e devolve a lista completa de
// razões — o operador corrige tudo de uma vez, não uma por corrida. Uma
// única razão chega para `preflight_failed`; zero razões dá `preflight_ok`
// com `next_action_at` (intervalo + jitter determinístico, reset do
// fornecedor, pausa do operador — o max() do contrato 0.3).
//
// Repetido sobre um slot já em preflight_ok e ainda válido: não escreve nada
// (idempotente). Se agora falha: escreve preflight_failed — o diário conta a
// história, não a esconde.

import crypto from 'node:crypto';
import { createRequire } from 'node:module';

import { appendEvent, readEvents, waveState, slotState, inFlightSlots, isBlocked, JournalError } from './journal.mjs';
import { loadFrozenManifest, OBSERVED_ONLY_KEYS, FreezeError } from './freeze.mjs';
import { verifyPins } from './pins.mjs';
import { jitterMs, nextActionAt, TERMINAL_FOR_SPACING } from './schedule.mjs';

const require = createRequire(import.meta.url);
const providerHealth = require('../router/provider-health.js'); // pinado (C3); usado aqui só para expor a taxonomia ao operador

export const sha256 = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');

/** Caracteres que não se vêem e mudam o que o modelo lê: zero-width, BOM, controlos (excepto \n \r \t). */
// Construído por code point para o ficheiro fonte não conter os próprios
// caracteres invisíveis (U+2028 é um terminador de linha em JS).
const HIDDEN_RANGES = [[0x200b, 0x200f], [0x2028, 0x2029], [0x202a, 0x202e], [0x2060, 0x2064], [0xfeff, 0xfeff], [0x0000, 0x0008], [0x000b, 0x000c], [0x000e, 0x001f], [0x007f, 0x007f]];
const cp = (n) => '\\u{' + n.toString(16) + '}';
export const HIDDEN_CHARS = new RegExp('[' + HIDDEN_RANGES.map(([a, b]) => (a === b ? cp(a) : cp(a) + '-' + cp(b))).join('') + ']', 'u');

/** Estados a partir dos quais o preflight faz `prepared` sozinho. */
const AUTO_PREPARE_FROM = Object.freeze([null, 'preflight_failed', 'known_not_submitted']);

export function prepareSlot(ctx, slot_id) {
  const s = slotState(ctx, slot_id);
  if (s.state === 'prepared') return { entry: null, already: true };
  if (!AUTO_PREPARE_FROM.includes(s.state)) throw new JournalError('slot_not_preparable', `slot ${slot_id} está ${s.state}; prepared só a partir de (sem evento) | preflight_failed | known_not_submitted`, { state: s.state });
  return { entry: appendEvent(ctx, { slot_id, kind: 'prepared' }), already: false };
}

/** Último instante «terminal» entre os slots (para o intervalo), ou null. */
function lastTerminalAt(events) {
  let last = null;
  for (const e of events) if (e.slot_id != null && TERMINAL_FOR_SPACING.includes(e.kind)) last = e.ts;
  return last;
}

/**
 * @param {object} ctx           de openJournal
 * @param {object} o
 * @param {string} o.slot_id
 * @param {Buffer|Uint8Array} o.bytes   EXACTAMENTE o que vai ser colado (lido de ficheiro/clipboard)
 * @param {object} o.observed     controlos observáveis AGORA na UI: { surface, observed_plan, selected_model_label, observed_model_label, reasoning_control, auto_switch, personalization ('off'|'on'|null), search_available, operator_id, ... }
 * @param {object|null} [o.capability]  capability record da superfície (obrigatório fora de synthetic)
 * @param {string|null} [o.pause_until] ISO — pausa do operador
 * @param {object} [o.pinsOpts]
 * @returns {{ ok: boolean, reasons: Array<{code, detail}>, entry: object|null, prompt_hash: string, next_action_at?: string }}
 */
export function preflight(ctx, { slot_id, bytes, observed = {}, capability = null, pause_until = null, pinsOpts = {} } = {}) {
  if (typeof slot_id !== 'string') throw new JournalError('bad_id', 'slot_id obrigatório');
  if (!(bytes instanceof Uint8Array)) throw new JournalError('bad_input', 'bytes tem de ser Buffer/Uint8Array — os bytes exactos a colar, não uma string');
  const reasons = [];
  const push = (code, detail, extra = {}) => reasons.push({ code, detail, ...extra });
  const seen_hash = sha256(bytes);
  // search_used só existe DEPOIS de haver resposta (caso 19). Se o operador o
  // passar aqui, não vale como observação — mas também não se apaga: fica
  // registado como reportado-antes-da-captura e ignorado, com o valor
  // (decisão do Cowork Prisma, 16/09: nada se apaga, tudo tem proveniência).
  if ('search_used' in observed) {
    const { search_used, ...resto } = observed;
    observed = { ...resto, search_used_reported_pre_capture: { value: search_used ?? null, ignored: true, why: 'search_used é observação pós-resposta; registado no importador' } };
  }

  // 0 · diário utilizável
  if (isBlocked(ctx)) push('journal_blocked', 'o diário está bloqueado; correr reconcile');
  let events;
  try { events = readEvents(ctx); } catch (e) { if (e instanceof JournalError) { push(e.code, e.message); events = []; } else throw e; }

  // 1 · motor pinado (C3), duas vezes: pins.json vs disco, e manifesto vs disco
  const pins = verifyPins(pinsOpts);
  if (!pins.ok) push('pins_mismatch', pins.mismatches.map((m) => `${m.path}: ${m.actual.slice(0, 12)}≠${m.expected.slice(0, 12)}`).join('; '));

  // 2 · manifesto íntegro
  let manifest = null;
  try { manifest = loadFrozenManifest(ctx); } catch (e) { if (e instanceof FreezeError) push(e.code === 'manifest_missing' ? 'manifest_missing' : 'manifest_tampered', e.message); else throw e; }
  if (manifest && pins.ok) {
    for (const [rel, sha] of Object.entries(manifest.engine_pins?.files || {})) {
      const live = pins.checked.find((c) => c.path === rel);
      if (!live || live.actual !== sha) push('engine_drift', `${rel}: congelado ${String(sha).slice(0, 12)}…, agora ${live ? live.actual.slice(0, 12) : 'AUSENTE'}…`);
    }
  }

  // 3 · onda aberta, dentro da janela
  const w = waveState(ctx, events);
  const now_ms = ctx.now();
  if (w.state !== 'open') push('wave_not_open', `a onda está ${w.state}`);
  else if (now_ms >= Date.parse(w.closeout_at)) push('closeout_reached', `passou closeout_at (${w.closeout_at})`, { closeout_at: w.closeout_at, deadline_at: w.deadline_at });

  // 4 · slot conhecido, no estado certo, sozinho em voo
  const slotDef = manifest ? (manifest.slots || []).find((s) => s.slot_id === slot_id) : null;
  if (manifest && !slotDef) push('slot_unknown', `slot ${slot_id} não está no manifesto (${(manifest.slots || []).map((s) => s.slot_id).join(', ')})`);
  const s = slotState(ctx, slot_id, events);
  const reRun = s.state === 'preflight_ok' || s.state === 'queued';
  if (!reRun && !AUTO_PREPARE_FROM.includes(s.state) && s.state !== 'prepared') push('slot_not_ready', `slot ${slot_id} está ${s.state}; preflight só antes do intent`);
  const flying = inFlightSlots(ctx, events).filter((id) => id !== slot_id);
  if (flying.length) push('slot_in_flight', `concorrência 1: ${flying.join(', ')} em voo`);

  // 5 · bytes = pergunta congelada (G1/G5, caso 01)
  const prompt = manifest && slotDef ? manifest.prompts.find((p) => p.id === slotDef.prompt_id) : null;
  if (prompt) {
    if (seen_hash !== prompt.prompt_hash) push('prompt_hash_mismatch', `bytes a colar ${seen_hash.slice(0, 12)}… ≠ congelado ${prompt.prompt_hash.slice(0, 12)}… (${bytes.length} vs ${prompt.byte_length} bytes)`, { seen: seen_hash, frozen: prompt.prompt_hash });
  }

  // 6 · canário e caracteres escondidos (G5, caso 02a)
  const text = Buffer.from(bytes).toString('utf8');
  for (const marker of manifest?.forbidden_markers || []) {
    if (text.toLowerCase().includes(String(marker).toLowerCase())) push('coordinator_context_detected', `marcador «${marker}» presente nos bytes a colar`);
  }
  if (HIDDEN_CHARS.test(text)) push('hidden_characters', 'os bytes contêm caracteres invisíveis (zero-width/BOM/controlo)');

  // 7 · condição observada ⊇ pedida (caso 02b/02c, 19)
  const req = manifest?.condition_requested || null;
  const primary = manifest ? manifest.partition !== 'synthetic-qualification' : false;
  if (req) {
    for (const [k, v] of Object.entries(req)) {
      if (OBSERVED_ONLY_KEYS.includes(k) || v === null || k === 'personalization' || k === 'operator_id') continue;
      if (!(k in observed)) push('condition_unobserved', `${k}: pedido ${JSON.stringify(v)}, não observado (preencher com o que a UI mostra, ou null se não exposto)`);
      else if (observed[k] !== null && observed[k] !== v) push('condition_mismatch', `${k}: pedido ${JSON.stringify(v)}, observado ${JSON.stringify(observed[k])}`);
      else if (observed[k] === null && primary && ['surface', 'selected_model_label', 'search_available'].includes(k)) push('condition_unobserved', `${k}: essencial e não observável — no braço primário isso bloqueia`);
    }
    if (observed.observed_model_label != null && observed.observed_model_label !== req.selected_model_label) push('model_label_drift', `UI mostra «${observed.observed_model_label}», pedido «${req.selected_model_label}» — fechar condição, não corrigir em silêncio`);
    if (observed.personalization !== 'off') push(primary ? 'personalization_not_off' : 'personalization_unobserved', `personalização observada: ${JSON.stringify(observed.personalization ?? null)} (pedido: off)`);
    if (primary && observed.search_available !== true) push('search_unavailable', `search_available observado ${JSON.stringify(observed.search_available ?? null)}; o braço primário exige true (search_used pode ser false/null — é observação, não elegibilidade)`);
    if (primary) {
      if (!manifest.authorization_ref || !req.operator_id) push('identity_missing', 'manifesto primário sem authorization_ref/operator_id');
      if (observed.operator_id !== req.operator_id) push('identity_missing', `operator_id observado ${JSON.stringify(observed.operator_id ?? null)} ≠ ${JSON.stringify(req.operator_id)}`);
    }
  }

  // 8 · superfície elegível (caso 06/19) — só fora de synthetic
  if (primary) {
    if (!capability || typeof capability !== 'object') push('ineligible_surface', 'sem capability record; a elegibilidade é observada em W0, não presumida');
    else if (capability.eligible_primary !== true) push('ineligible_surface', `capability.eligible_primary = ${JSON.stringify(capability.eligible_primary ?? null)}`);
  }
  const retries_controllable = capability?.essential?.retries_controllable?.value ?? capability?.retries_controllable ?? null;

  // 9 · quando
  let schedule = null;
  if (w.state === 'open' && manifest && slotDef) {
    const q = manifest.queue_policy;
    const jitter = jitterMs({ seed: q.jitter_seed, slot_id, range_seconds: q.jitter_seconds });
    schedule = nextActionAt({ opened_at: w.opened_at, last_terminal_at: lastTerminalAt(events), interval_seconds: q.interval_seconds, jitter_ms: jitter, reset_at: w.next_action_at, pause_until });
    schedule.jitter_ms = jitter;
    const next = Date.parse(schedule.next_action_at);
    if (next >= Date.parse(w.closeout_at)) push('budget_exceeded', `next_action_at ${schedule.next_action_at} ≥ closeout_at ${w.closeout_at}: a onda fecha incompleta (caso 07)`, { next_action_at: schedule.next_action_at });
    else if (now_ms < next) push('too_early', `esperar até ${schedule.next_action_at} (${schedule.basis.join('+')})`, { next_action_at: schedule.next_action_at, wait_ms: next - now_ms });
  }

  // ── decisão ──
  const synthetic = manifest ? manifest.partition === 'synthetic-qualification' : null;
  if (reasons.length) {
    let entry = null;
    // Regista só se o diário está utilizável e o slot pode receber o evento.
    const bloqueadoPeloDiario = reasons.some((r) => ['journal_blocked', 'journal_torn', 'journal_corrupt'].includes(r.code));
    const canWrite = !bloqueadoPeloDiario && (s.state === 'prepared' || s.state === 'preflight_ok' || s.state === 'queued' || AUTO_PREPARE_FROM.includes(s.state));
    if (canWrite) {
      if (AUTO_PREPARE_FROM.includes(s.state)) appendEvent(ctx, { slot_id, kind: 'prepared' });
      entry = appendEvent(ctx, { slot_id, kind: 'preflight_failed', payload: { reasons, prompt_hash_seen: seen_hash, byte_length: bytes.length, observed, synthetic } });
    }
    return { ok: false, reasons, entry, prompt_hash: seen_hash, synthetic };
  }
  if (reRun) return { ok: true, reasons: [], entry: null, idempotent: true, prompt_hash: seen_hash, next_action_at: schedule.next_action_at, synthetic };
  if (AUTO_PREPARE_FROM.includes(s.state)) appendEvent(ctx, { slot_id, kind: 'prepared' });
  const entry = appendEvent(ctx, {
    slot_id, kind: 'preflight_ok',
    payload: {
      prompt_hash: seen_hash, byte_length: bytes.length,
      next_action_at: schedule.next_action_at, schedule_basis: schedule.basis, jitter_ms: schedule.jitter_ms,
      observed, retries_controllable, synthetic,
      manifest_hash: manifest.manifest_hash,
      engine_pins_ok: true,
      failure_classes_available: Object.keys(providerHealth.CAUSAS || {}),
    },
  });
  return { ok: true, reasons: [], entry, prompt_hash: seen_hash, next_action_at: schedule.next_action_at, synthetic };
}
