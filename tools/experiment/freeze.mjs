// freeze.mjs — o manifesto congelado: content-addressed, verificado antes de
// cada leitura, e nunca alterado no mesmo wave_id.
//
// PORQUÊ ISTO EXISTE (2026-09-16 · cc-plan-20260916-v1, passo 2 de P1.0)
// packages/workflow/src/state.ts:188-206 faz upsert do run: um resume com
// script novo SUBSTITUI o antigo, e a identidade do run é um timestamp
// (workflow.ts:208). Aqui a identidade é o CONTEÚDO: prompt_hash = sha256 dos
// bytes UTF-8 exactos de `text`; manifest_hash = provHash do manifesto
// canónico. Mudar um byte é outro manifesto — e outro manifesto no mesmo
// wave_id é recusado (nova condição ⇒ novo wave_id, denominador separado).
//
// O que se congela vem do contrato 0.3: condition_record.required_record
// (14 campos), prompts com texto e função (eligible/negative/synthetic),
// ordem dos slots, caps, queue_policy (intervalo, jitter com seed),
// adapter_version, rubric_ref, partition, operator/authorization. E os pins
// dos dois módulos do motor (C3): ficam DENTRO do manifesto, para que o
// preflight possa dizer «o motor de hoje é o motor de quando congelámos».
//
// Idioma reutilizado de tools/ab/correr-custo.mjs:598-603 — verificar os
// hashes ANTES de correr, acumular falhas, recusar em bloco. Hash canónico de
// tools/router/ledger-prov.js (pinado).

import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';

import { appendEvent, readEvents, waveState, JournalError, SCHEMA as JOURNAL_SCHEMA } from './journal.mjs';
import { verifyPins } from './pins.mjs';
import { loadContract } from './contract.mjs';

const require = createRequire(import.meta.url);
const { canonicalize, provHash } = require('../router/ledger-prov.js');

export const MANIFEST_SCHEMA = 'prisma-experiment-manifest/0.3-proposed';
export const sha256 = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');

/** condition_record.required_record — lido do contrato congelado (AMENDMENT-001; 14 em 0.3-proposed). Todas presentes; algumas só se preenchem por observação. */
export const CONDITION_KEYS = loadContract().condition_required;
/** Preenchidas só por observação (por slot, no preflight/importação): no manifesto têm de ser null. */
export const OBSERVED_ONLY_KEYS = Object.freeze(['observed_plan', 'observed_model_label', 'search_used', 'timestamp', 'prompt_hash']);
export const PARTITIONS = Object.freeze(['synthetic-qualification', 'primary', 'informed-diagnostic', 'independent-reserved']);
export const PROMPT_ROLES = Object.freeze(['eligible', 'negative', 'synthetic']);
// AMENDMENT-001b · B3: a partição reservada (R01/R02, PROTOCOLO 0.2 §3-4, ≤4 conversas)
// é REJEITADA operacionalmente pelo kit até existir custodiante nomeado + AMENDMENT própria.
// Não é código de custódia — é exclusão verificável: o freeze recusa, nada se escreve.
export const RESERVED_ID = /^R\d{2}$/;
export const RESERVED_REASON = 'reserved_partition_unsupported';

export class FreezeError extends Error {
  constructor(code, message, details = {}) { super(message); this.name = 'FreezeError'; this.code = code; this.details = details; }
}

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/;
const isStr = (v) => typeof v === 'string' && v.length > 0;

/**
 * Valida o manifesto de ENTRADA (o que o Prisma escreve) e devolve a lista de
 * falhas — vazia quando está bom. Não escreve nada.
 */
export function validateManifestInput(m, { waveId } = {}) {
  const f = [];
  const push = (code, detail) => f.push({ code, detail });
  if (!m || typeof m !== 'object' || Array.isArray(m)) return [{ code: 'not_an_object', detail: 'manifesto tem de ser um objecto JSON' }];
  if (m.schema !== MANIFEST_SCHEMA) push('bad_schema', `schema tem de ser ${MANIFEST_SCHEMA}`);
  for (const k of ['brief_id', 'wave_id', 'condition_id', 'surface', 'adapter_version']) if (!isStr(m[k])) push('missing_field', k);
  if (isStr(m.wave_id) && !SAFE_ID.test(m.wave_id)) push('bad_id', `wave_id ${m.wave_id}`);
  if (waveId && m.wave_id !== waveId) push('wave_id_mismatch', `manifesto diz ${m.wave_id}, diário é ${waveId}`);
  if (!PARTITIONS.includes(m.partition)) push('bad_partition', `partition ∈ ${PARTITIONS.join('|')}`);
  if (m.partition === 'independent-reserved') push('reserved_partition_unsupported', 'a partição reservada não tem custodiante nomeado: o kit recusa congelá-la (B3); activação exige custodiante + AMENDMENT própria');
  if (m.manifest_hash != null) push('manifest_hash_must_be_null', 'o freeze calcula o manifest_hash; a entrada não o traz');
  if (!('rubric_ref' in m)) push('missing_field', 'rubric_ref (string ou null)');
  if (!('authorization_ref' in m)) push('missing_field', 'authorization_ref (string ou null)');

  // condição pedida
  const c = m.condition_requested;
  if (!c || typeof c !== 'object') push('missing_field', 'condition_requested');
  else {
    for (const k of CONDITION_KEYS) if (!(k in c)) push('condition_key_missing', k);
    for (const k of OBSERVED_ONLY_KEYS) if (k in c && c[k] !== null) push('condition_observed_only', `${k} só se preenche por observação; no manifesto é null`);
    if (c.surface !== m.surface) push('condition_mismatch', 'condition_requested.surface ≠ surface');
    if (!isStr(c.selected_model_label)) push('condition_missing', 'selected_model_label');
    if (!isStr(c.prompt_language)) push('condition_missing', 'prompt_language');
    if (!isStr(c.capture_method)) push('condition_missing', 'capture_method');
    if (c.personalization !== 'off-required') push('condition_missing', "personalization tem de ser 'off-required' (o respondente não pode ter memória/personalização)");
    if (![true, false, null].includes(c.search_available)) push('condition_bad', 'search_available ∈ true|false|null');
    if (m.partition === 'primary') {
      if (c.search_available !== true) push('search_required', 'braço primário exige search_available=true (contrato 0.3 eligibility; caso 19)');
      if (!isStr(c.operator_id)) push('identity_missing', 'operator_id obrigatório fora de synthetic-qualification (caso 14)');
      if (!isStr(m.authorization_ref)) push('identity_missing', 'authorization_ref obrigatório fora de synthetic-qualification (caso 14)');
    }
  }

  // prompts
  const ids = new Set();
  if (!Array.isArray(m.prompts) || m.prompts.length === 0) push('missing_field', 'prompts[]');
  else m.prompts.forEach((p, i) => {
    if (!p || !isStr(p.id) || !SAFE_ID.test(p.id)) { push('bad_prompt', `prompts[${i}].id`); return; }
    if (ids.has(p.id)) push('duplicate_prompt_id', p.id);
    ids.add(p.id);
    if (RESERVED_ID.test(p.id)) push('reserved_partition_unsupported', `${p.id}: id reservado (R01/R02) numa onda do kit — sem custodiante, nada se congela`);
    if (p.role === 'reserved') push('reserved_partition_unsupported', `${p.id}: role reserved — sem custodiante, nada se congela`);
    if (!isStr(p.text)) push('bad_prompt', `prompts[${i}].text vazio`);
    if (!PROMPT_ROLES.includes(p.role)) push('bad_prompt', `prompts[${i}].role ∈ ${PROMPT_ROLES.join('|')}`);
    if (p.prompt_hash != null && isStr(p.text) && p.prompt_hash !== sha256(Buffer.from(p.text, 'utf8'))) push('prompt_hash_mismatch', `${p.id}: prompt_hash declarado ≠ sha256(bytes de text)`);
    if (m.partition === 'primary' && p.role === 'synthetic') push('bad_prompt', `${p.id}: role synthetic num braço primário`);
    if (m.partition === 'synthetic-qualification' && p.role !== 'synthetic') push('bad_prompt', `${p.id}: em W0 todos os prompts são synthetic (fora da avaliação)`);
    // AMENDMENT-001 A3: evidência declarada por prompt — o que torna um slot avaliável para
    // new_fact_used (fact_ref: o diff da página que o reviewer vai confrontar) e para
    // recommended_appropriately (asks_recommendation: o prompt pede uma recomendação). Opcional;
    // ausente = não declarado = não avaliável para esses campos (o closeout diz-o, não o esconde).
    if ('evidence' in p && p.evidence !== undefined) {
      const ev = p.evidence;
      if (!ev || typeof ev !== 'object' || Array.isArray(ev)) push('bad_prompt', `${p.id}: evidence tem de ser objecto { fact_ref: string|null, asks_recommendation: boolean }`);
      else {
        if (!('fact_ref' in ev) || !(ev.fact_ref === null || isStr(ev.fact_ref))) push('bad_prompt', `${p.id}: evidence.fact_ref ∈ string|null`);
        if (!('asks_recommendation' in ev) || typeof ev.asks_recommendation !== 'boolean') push('bad_prompt', `${p.id}: evidence.asks_recommendation ∈ true|false`);
      }
    }
  });

  // ordem → slots
  if (!Array.isArray(m.order) || m.order.length === 0) push('missing_field', 'order[]');
  else for (const id of m.order) { if (!ids.has(id)) push('order_unknown_prompt', id); if (RESERVED_ID.test(id)) push('reserved_partition_unsupported', `order contém ${id}`); }

  // caps
  const caps = m.caps;
  if (!caps || typeof caps !== 'object') push('missing_field', 'caps');
  else {
    for (const k of ['coverage_per_wave', 'planned_eligible', 'negative']) if (!(Number.isInteger(caps[k]) && caps[k] >= 0)) push('bad_caps', k);
    if (Array.isArray(m.order) && Number.isInteger(caps.coverage_per_wave) && m.order.length !== caps.coverage_per_wave) push('bad_caps', `order tem ${m.order.length} slots, coverage_per_wave diz ${caps.coverage_per_wave}`);
    if (m.partition === 'primary' && Number.isInteger(caps.planned_eligible) && Number.isInteger(caps.negative) && Number.isInteger(caps.coverage_per_wave)) {
      if (caps.planned_eligible + caps.negative !== caps.coverage_per_wave) push('bad_caps', 'primary: planned_eligible + negative tem de ser coverage_per_wave (6+2=8)');
      if (Array.isArray(m.order) && Array.isArray(m.prompts)) {
        const role = Object.fromEntries(m.prompts.filter((p) => p && p.id).map((p) => [p.id, p.role]));
        const nElig = m.order.filter((id) => role[id] === 'eligible').length;
        const nNeg = m.order.filter((id) => role[id] === 'negative').length;
        if (nElig !== caps.planned_eligible) push('bad_caps', `order tem ${nElig} slots eligible, caps diz ${caps.planned_eligible}`);
        if (nNeg !== caps.negative) push('bad_caps', `order tem ${nNeg} slots negative, caps diz ${caps.negative}`);
      }
    }
  }

  // queue_policy
  const q = m.queue_policy;
  if (!q || typeof q !== 'object') push('missing_field', 'queue_policy');
  else {
    if (q.max_concurrency_total !== 1) push('bad_queue_policy', 'max_concurrency_total tem de ser 1');
    if (q.primary_send_attempts_per_slot !== 1) push('bad_queue_policy', 'primary_send_attempts_per_slot tem de ser 1');
    if (!(Number.isFinite(q.interval_seconds) && q.interval_seconds >= 0)) push('bad_queue_policy', 'interval_seconds');
    if (!(Array.isArray(q.jitter_seconds) && q.jitter_seconds.length === 2 && q.jitter_seconds[0] >= 0 && q.jitter_seconds[1] >= q.jitter_seconds[0])) push('bad_queue_policy', 'jitter_seconds [min,max]');
    if (!isStr(q.jitter_seed)) push('bad_queue_policy', 'jitter_seed obrigatório (replay determinístico; C4)');
    if (!(Number.isFinite(q.wallclock_minutes) && Number.isFinite(q.closeout_reserve_minutes) && q.wallclock_minutes > q.closeout_reserve_minutes && q.closeout_reserve_minutes >= 0)) push('bad_queue_policy', 'wallclock_minutes > closeout_reserve_minutes ≥ 0');
  }
  if (m.forbidden_markers != null && !(Array.isArray(m.forbidden_markers) && m.forbidden_markers.every(isStr))) push('bad_field', 'forbidden_markers: lista de strings (marcadores do coordenador que NUNCA podem ir nos bytes)');
  return f;
}

/** Deriva os slots da ordem: `${prompt_id}-${repetição}` — determinístico, sem relógio. */
export function slotsFromOrder(m) {
  const role = Object.fromEntries(m.prompts.map((p) => [p.id, p.role]));
  const seen = {};
  return m.order.map((pid, i) => {
    seen[pid] = (seen[pid] || 0) + 1;
    return { index: i, slot_id: `${pid}-${seen[pid]}`, prompt_id: pid, repetition: seen[pid], role: role[pid] };
  });
}

/** Constrói o manifesto CONGELADO a partir da entrada válida (sem escrever). */
export function buildFrozen(input, { now, pins }) {
  const prompts = input.prompts.map((p) => ({ ...p, prompt_hash: sha256(Buffer.from(p.text, 'utf8')), byte_length: Buffer.byteLength(p.text, 'utf8') }));
  const frozen = {
    ...JSON.parse(canonicalize(input)),
    prompts,
    slots: slotsFromOrder({ ...input, prompts }),
    frozen_at: new Date(now()).toISOString(),
    journal_schema: JOURNAL_SCHEMA,
    engine_pins: { pinned_at_sha: pins.pinned_at_sha, files: Object.fromEntries(pins.checked.map((c) => [c.path, c.actual])) },
    manifest_hash: null,
  };
  const { manifest_hash: _omit, ...semHash } = frozen;
  frozen.manifest_hash = provHash(semHash);
  return frozen;
}

function manifestPaths(ctx) {
  return { json: path.join(ctx.dir, 'manifest.json'), sha: path.join(ctx.dir, 'manifest.sha256') };
}

/**
 * Lê e VERIFICA o manifesto congelado: sha256 do ficheiro == manifest.sha256,
 * manifest_hash recalculado == o gravado, e (se o diário já tiver wave.frozen)
 * == o hash congelado no diário. Qualquer desvio ⇒ FreezeError('manifest_tampered').
 */
export function loadFrozenManifest(ctx) {
  const p = manifestPaths(ctx);
  let bytes, shaFile;
  try { bytes = ctx.fs.readFileSync(p.json); } catch (e) { throw new FreezeError('manifest_missing', `sem manifest.json em ${ctx.dir}: ${e && e.message}`); }
  try { shaFile = String(ctx.fs.readFileSync(p.sha, 'utf8')).trim().split(/\s+/)[0]; } catch { throw new FreezeError('manifest_tampered', 'manifest.sha256 em falta'); }
  const fileSha = sha256(bytes);
  if (fileSha !== shaFile) throw new FreezeError('manifest_tampered', `manifest.json (${fileSha.slice(0, 12)}…) ≠ manifest.sha256 (${String(shaFile).slice(0, 12)}…)`, { file_sha256: fileSha, recorded: shaFile });
  let m;
  try { m = JSON.parse(bytes.toString('utf8')); } catch { throw new FreezeError('manifest_tampered', 'manifest.json não é JSON'); }
  const { manifest_hash, ...semHash } = m;
  const recomputed = provHash(semHash);
  if (recomputed !== manifest_hash) throw new FreezeError('manifest_tampered', `manifest_hash gravado ${String(manifest_hash).slice(0, 12)}… ≠ recalculado ${recomputed.slice(0, 12)}…`, { recorded: manifest_hash, recomputed });
  for (const pr of m.prompts || []) {
    const h = sha256(Buffer.from(pr.text, 'utf8'));
    if (h !== pr.prompt_hash) throw new FreezeError('manifest_tampered', `prompt ${pr.id}: texto ≠ prompt_hash`, { prompt_id: pr.id });
  }
  const w = waveState(ctx);
  if (w.manifest_hash && w.manifest_hash !== manifest_hash) throw new FreezeError('manifest_tampered', `o diário congelou ${w.manifest_hash.slice(0, 12)}…, o ficheiro diz ${String(manifest_hash).slice(0, 12)}…`, { journal: w.manifest_hash, file: manifest_hash });
  return m;
}

function appendFrozenEvent(ctx, frozen, fileSha) {
  return appendEvent(ctx, {
    kind: 'wave.frozen',
    payload: {
      manifest_hash: frozen.manifest_hash,
      manifest_file: 'manifest.json',
      manifest_file_sha256: fileSha,
      prompts: Object.fromEntries(frozen.prompts.map((x) => [x.id, x.prompt_hash])),
      slots: frozen.slots.length,
      // O closeout deriva `planned` DAQUI, não do ficheiro: se manifest.json for
      // adulterado depois, o diário continua a saber quantos slots havia e de que tipo.
      slot_ids: frozen.slots.map((x) => x.slot_id),
      roles: Object.fromEntries(frozen.slots.map((x) => [x.slot_id, x.role])),
      prompt_of: Object.fromEntries(frozen.slots.map((x) => [x.slot_id, x.prompt_id])),
      caps: frozen.caps,
      partition: frozen.partition,
      engine_pins: frozen.engine_pins,
      // AMENDMENT-001 A3: a evidência declarada por prompt e a rubrica vão para o diário —
      // a avaliabilidade por campo científico deriva DAQUI, não de um manifest.json que
      // pode ser adulterado depois. declared=false ⇒ o closeout reporta «não declarado».
      rubric_ref: frozen.rubric_ref ?? null,
      evidence: Object.fromEntries(frozen.prompts.map((x) => [x.id, x.evidence && typeof x.evidence === 'object'
        ? { declared: true, fact_ref: x.evidence.fact_ref ?? null, asks_recommendation: x.evidence.asks_recommendation === true }
        : { declared: false, fact_ref: null, asks_recommendation: false }])),
    },
  });
}

function writeFileDurably(ctx, file, bytes) {
  const tmp = `${file}.tmp-${process.pid}`;
  let fd = null;
  try {
    fd = ctx.fs.openSync(tmp, 'w');
    ctx.fs.writeSync(fd, bytes, 0, bytes.length);
    ctx.fs.fsyncSync(fd);
  } finally { if (fd !== null) { try { ctx.fs.closeSync(fd); } catch { /* já lançou */ } } }
  ctx.fs.renameSync(tmp, file);
}

/**
 * Congela: valida, calcula hashes, escreve manifest.json + manifest.sha256
 * (tmp+fsync+rename) e regista `wave.frozen` como PRIMEIRO evento do diário.
 * Idempotente para o MESMO conteúdo; conteúdo diferente no mesmo wave_id ⇒
 * FreezeError('manifest_conflict').
 */
export function freezeWave(ctx, { manifest, pinsOpts = {} } = {}) {
  const falhas = validateManifestInput(manifest, { waveId: ctx.waveId });
  if (falhas.length) throw new FreezeError('manifest_invalid', `manifesto inválido (${falhas.length}): ${falhas.map((x) => `${x.code}: ${x.detail}`).join('; ')}`, { failures: falhas });
  const pins = verifyPins(pinsOpts);
  if (!pins.ok) throw new FreezeError('pins_mismatch', 'não se congela contra um motor que não bate com pins.json', pins);

  const frozen = buildFrozen(manifest, { now: ctx.now, pins });
  const p = manifestPaths(ctx);
  const events = readEvents(ctx);
  const w = waveState(ctx, events);

  // Já existe algo com este wave_id?
  if (ctx.fs.existsSync(p.json) || w.manifest_hash) {
    const existente = loadFrozenManifest(ctx); // lança manifest_tampered se estiver estragado
    // Comparar sem os campos que dependem do instante do freeze.
    const strip = (x) => { const { manifest_hash: _a, frozen_at: _b, ...rest } = x; return provHash(rest); };
    if (strip(existente) === strip(frozen)) {
      // Mesmo conteúdo. Se o diário ainda não tem wave.frozen (crash entre o
      // ficheiro e o evento), completa-se o freeze agora — com o hash do ficheiro
      // que já lá está, não com um novo.
      if (!w.manifest_hash) {
        if (events.length) throw new FreezeError('journal_not_empty', 'manifest.json existe mas o diário tem eventos sem wave.frozen');
        const entry = appendFrozenEvent(ctx, existente, sha256(ctx.fs.readFileSync(p.json)));
        return { manifest: existente, manifest_hash: existente.manifest_hash, entry, idempotent: true, completed: true };
      }
      return { manifest: existente, manifest_hash: existente.manifest_hash, entry: null, idempotent: true };
    }
    throw new FreezeError('manifest_conflict', `o wave_id ${ctx.waveId} já tem um manifesto congelado (${existente.manifest_hash.slice(0, 12)}…) com conteúdo diferente; nova condição ⇒ novo wave_id`, { existing: existente.manifest_hash, proposed: frozen.manifest_hash });
  }
  if (events.length) throw new FreezeError('journal_not_empty', 'wave.frozen tem de ser o primeiro evento; este diário já tem eventos sem manifesto');

  const bytes = Buffer.from(JSON.stringify(frozen, null, 2) + '\n', 'utf8');
  writeFileDurably(ctx, p.json, bytes);
  writeFileDurably(ctx, p.sha, Buffer.from(`${sha256(bytes)}  manifest.json\n`, 'utf8'));
  let entry;
  try {
    entry = appendFrozenEvent(ctx, frozen, sha256(bytes));
  } catch (e) {
    // O ficheiro ficou; o diário não. Quem vier a seguir vê manifest.json sem
    // wave.frozen e o freeze idempotente completa — ou lança se o ficheiro mudou.
    if (e instanceof JournalError) throw new FreezeError('freeze_journal_failed', `manifest.json escrito mas wave.frozen não: ${e.message}`, { cause: e.code });
    throw e;
  }
  return { manifest: frozen, manifest_hash: frozen.manifest_hash, entry, idempotent: false };
}
