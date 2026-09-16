// journal.mjs — o diário de uma onda Prisma: append-only, fsync, cadeia de hashes,
// um token de tentativa por slot, e um relógio que não se renova.
//
// PORQUÊ ISTO EXISTE (2026-09-16 · cc-plan-20260916-v1, passo 1 de P1.0)
// A onda-01 de 11/09 teve três incidentes que nenhum registo do Mooter sabia
// guardar: uma captura parcial recuperada depois, uma pergunta (D02) cujo texto
// não entrou e NÃO foi enviada, e uma ligação que caiu deixando «7 pendentes»
// numa fotografia que a evidência posterior desmentiu. Reconstruir isto custou
// uma sessão inteira (addendum B, wave-reconciliation).
//
// O que já existe no repo não serve para este trabalho, e foi medido:
//   · packages/cli/src/commands/workflow.ts:215-227 regista o agente DEPOIS do
//     efeito externo; :208 cria run_id por relógio — re-run é run novo.
//   · packages/workflow/src/primitives.ts:125 — checkpoint() é só escrita; a
//     «retoma» da CLI é uma frase, não um mecanismo.
//   · tools/router/handoff-journal.js:26 roda a 50 linhas e :416 nunca lança —
//     certo para um diário de sessão, errado para evidência.
//
// O que este ficheiro garante (e o que NÃO promete):
//   1. Cada evento é UMA linha JSON, escrita e fsync'ada antes de devolver.
//      Falha de escrita LANÇA (JournalError) — nunca devolve `{ok:false}`.
//   2. Cada linha leva `prev_hash` = sha256 dos bytes da linha anterior. Um
//      byte alterado no meio parte a cadeia; `verifyChain` diz onde.
//   3. `commitIntent` cria `raw/<slot>/.intent` com O_CREAT|O_EXCL ('wx' —
//      o idioma de packages/worktree-conductor/src/locks.ts:65) ANTES de
//      escrever `intent_committed`. Só existe um token por slot; um segundo
//      pedido recebe `attempt_token_exists`. O ficheiro nunca é apagado: quando
//      há prova positiva de não-envio, é RENOMEADO para `.intent.void-N`.
//   4. `openWave` grava `deadline_at` e `closeout_at` UMA vez. `resume` lê-os;
//      nunca os recalcula. Não existe «reabrir».
//   5. `resume` é conservador: um slot em `intent_committed` sem `submitted`, ou
//      um `.intent` sem evento, passa a `submission_uncertain`. Nunca reenvia.
//   6. Não promete exactly-once do fornecedor. Promete ≤1 despacho da aplicação
//      por slot e incerteza explícita.
//
// A raiz dos dados (`root`) é OBRIGATÓRIA e tem de estar FORA deste repositório
// (decisão E-2: C:/Users/Paulo Loureiro/prisma-data/). Não há default.
//
// Zero dependências além de dois módulos do motor, pinados por sha256 em
// pins.json (condição C3): ledger-prov.js (provHash). Tudo o resto é node:.

import nodeFs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

import { assertPins, REPO_ROOT } from './pins.mjs';

const require = createRequire(import.meta.url);
// CJS pinado (pins.json). `provHash` = sha256 sobre JSON canónico (chaves ordenadas).
const { canonicalize, provHash } = require('../router/ledger-prov.js');

export const AQUI = path.dirname(fileURLToPath(import.meta.url));
export const SCHEMA = 'prisma-experiment-journal/0.1';
export const sha256 = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');

// ── vocabulário ──────────────────────────────────────────────────────────────
// Máquina de estados OPERACIONAL (annex/state-machine-0.3-cc.json). As
// observações científicas NÃO passam por aqui (contrato 0.3
// scientific_observations.not_an_operational_state_machine = true).

export const WAVE_KINDS = Object.freeze([
  'wave.frozen', 'wave.opened', 'wave.throttled', 'wave.reset_wait', 'wave.policy_review',
  'wave.closing', 'wave.closed',
  'journal.reconciled', 'journal.import_failed',
]);

export const SLOT_KINDS = Object.freeze([
  'prepared', 'preflight_ok', 'preflight_failed', 'queued',
  'intent_committed', 'submitted', 'submission_uncertain', 'known_not_submitted',
  'captured', 'capture_uncertain', 'policy_review', 'failed', 'scored', 'closed',
]);

/** Estado do slot → kinds de slot permitidos a seguir. `null` = ainda sem evento. */
export const SLOT_TRANSITIONS = Object.freeze({
  null:                   ['prepared'],
  prepared:               ['preflight_ok', 'preflight_failed'],
  preflight_failed:       ['prepared'],
  // submission_uncertain a partir de preflight_ok/queued só acontece no resume,
  // quando há um `.intent` órfão (ficheiro sem evento): conservador por desenho.
  preflight_ok:           ['queued', 'intent_committed', 'preflight_failed', 'submission_uncertain'],
  queued:                 ['intent_committed', 'preflight_failed', 'submission_uncertain'],
  intent_committed:       ['submitted', 'submission_uncertain', 'known_not_submitted'],
  known_not_submitted:    ['queued', 'prepared'],
  submitted:              ['captured', 'capture_uncertain', 'failed', 'policy_review'],
  submission_uncertain:   ['captured', 'capture_uncertain', 'failed'],
  capture_uncertain:      ['captured', 'failed'],
  policy_review:          ['captured', 'failed'],
  captured:               ['scored', 'policy_review'],
  scored:                 ['closed'],
  failed:                 [],
  closed:                 [],
});

/** Slots «em voo»: com estes estados, nenhum outro slot pode receber intent (concorrência 1). */
export const IN_FLIGHT = Object.freeze(['intent_committed', 'submitted', 'submission_uncertain']);

export const DEFAULT_WALLCLOCK_MINUTES = 45;
export const DEFAULT_RESERVE_MINUTES = 5;

/** Relógio por omissão. Identidade usada para registar `clock_source` na abertura. */
export const SYSTEM_NOW = () => Date.now();

export class JournalError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'JournalError';
    this.code = code;
    this.details = details;
  }
}

// ── contexto ─────────────────────────────────────────────────────────────────

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/;
function assertId(value, what) {
  if (typeof value !== 'string' || !SAFE_ID.test(value)) {
    throw new JournalError('bad_id', `${what} inválido: ${JSON.stringify(value)} (só [A-Za-z0-9._-], ≤80, sem começar por ponto)`);
  }
}

function isInside(child, parent) {
  const rel = path.relative(parent, child);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

/**
 * Abre (ou cria) o directório de uma onda sob `root`.
 *
 * @param {object} o
 * @param {string} o.root      OBRIGATÓRIO, absoluto, fora do repo Mooter (E-2).
 * @param {string} o.waveId
 * @param {object} [o.fs]      fs injectável (openSync/writeSync/fsyncSync/closeSync/readFileSync/existsSync/mkdirSync/renameSync/readdirSync).
 * @param {() => number} [o.now]  relógio injectável (ms).
 * @param {boolean} [o.checkPins=true]  C3: recusa se ledger-prov.js/provider-health.js não baterem com pins.json.
 * @param {object}  [o.pinsOpts]  passado a assertPins (testes: pinsPath/repoRoot alternativos).
 */
export function openJournal({ root, waveId, fs = nodeFs, now = SYSTEM_NOW, checkPins = true, pinsOpts = {}, repoRoot = REPO_ROOT } = {}) {
  if (!root || typeof root !== 'string') throw new JournalError('root_required', '`root` é obrigatório (E-2): a raiz dos dados Prisma não tem default');
  if (!path.isAbsolute(root)) throw new JournalError('root_required', `\`root\` tem de ser absoluto: ${root}`);
  if (isInside(path.resolve(root), path.resolve(repoRoot))) {
    throw new JournalError('root_inside_repo', `\`root\` está dentro do repositório Mooter (${repoRoot}); prisma-data/ vive fora`);
  }
  assertId(waveId, 'waveId');
  if (checkPins) assertPins(pinsOpts); // PinsError('pins_mismatch') se o motor mudou por baixo

  const dir = path.join(root, 'waves', waveId);
  const rawDir = path.join(dir, 'raw');
  fs.mkdirSync(rawDir, { recursive: true });
  return Object.freeze({
    schema: SCHEMA, root, waveId, dir, rawDir,
    eventsPath: path.join(dir, 'events.jsonl'),
    blockedPath: path.join(dir, 'journal.blocked'),
    fs, now,
  });
}

// ── leitura ──────────────────────────────────────────────────────────────────

function readLines(ctx) {
  let raw;
  try { raw = ctx.fs.readFileSync(ctx.eventsPath, 'utf8'); } catch (e) {
    if (e && e.code === 'ENOENT') return [];
    throw new JournalError('journal_unreadable', `events.jsonl ilegível: ${e && e.message}`);
  }
  if (raw === '') return [];
  const parts = raw.split('\n');
  // Uma escrita rasgada deixa a última linha sem '\n' ou sem JSON fechado.
  if (parts[parts.length - 1] !== '') {
    throw new JournalError('journal_torn', 'events.jsonl termina numa linha sem \\n — escrita rasgada; correr reconcile', { tail: parts[parts.length - 1].slice(0, 120) });
  }
  parts.pop();
  return parts;
}

/** Todas as entradas, mais antigas primeiro. Lança em linha ilegível (`journal_corrupt`) ou rasgada (`journal_torn`). */
export function readEvents(ctx) {
  const lines = readLines(ctx);
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    let e;
    try { e = JSON.parse(lines[i]); } catch {
      throw new JournalError('journal_corrupt', `events.jsonl linha ${i + 1} não é JSON`, { line: i + 1 });
    }
    out.push(e);
  }
  return out;
}

/**
 * Recalcula a cadeia. NUNCA lança por conteúdo: devolve `{ ok, length,
 * broken_at, reason }` (broken_at = nº da 1.ª linha que não bate, 1-based;
 * reason ∈ not_json | prev_hash_mismatch | payload_hash_mismatch | torn_tail).
 */
export function verifyChain(ctx) {
  let raw;
  try { raw = ctx.fs.readFileSync(ctx.eventsPath, 'utf8'); } catch (e) {
    if (e && e.code === 'ENOENT') return { ok: true, length: 0, broken_at: null, reason: null };
    throw new JournalError('journal_unreadable', `events.jsonl ilegível: ${e && e.message}`);
  }
  const parts = raw === '' ? [] : raw.split('\n');
  const torn = parts.length > 0 && parts[parts.length - 1] !== '';
  if (!torn && parts.length) parts.pop();
  const lines = torn ? parts.slice(0, -1) : parts;
  let prev = null;
  for (let i = 0; i < lines.length; i++) {
    let e;
    try { e = JSON.parse(lines[i]); } catch { return { ok: false, length: lines.length, broken_at: i + 1, reason: 'not_json' }; }
    if ((e.prev_hash ?? null) !== prev) return { ok: false, length: lines.length, broken_at: i + 1, reason: 'prev_hash_mismatch' };
    if (e.payload_hash !== provHash(e.payload ?? null)) return { ok: false, length: lines.length, broken_at: i + 1, reason: 'payload_hash_mismatch' };
    prev = sha256(lines[i]);
  }
  if (torn) return { ok: false, length: lines.length, broken_at: lines.length + 1, reason: 'torn_tail' };
  return { ok: true, length: lines.length, broken_at: null, reason: null };
}

// ── estado derivado (nunca descrito) ─────────────────────────────────────────

export function waveState(ctx, events = readEvents(ctx)) {
  const st = {
    state: 'registered', manifest_hash: null, frozen_at: null,
    opened_at: null, deadline_at: null, closeout_at: null,
    last_pause: null, next_action_at: null, closing_reason: null,
  };
  for (const e of events) {
    switch (e.kind) {
      case 'wave.frozen': st.state = 'frozen'; st.manifest_hash = e.payload?.manifest_hash ?? null; st.frozen_at = e.ts; break;
      case 'wave.opened':
        st.state = 'open';
        st.opened_at = e.payload?.opened_at ?? e.ts;
        st.deadline_at = e.payload?.deadline_at ?? null;
        st.closeout_at = e.payload?.closeout_at ?? null;
        break;
      case 'wave.throttled': case 'wave.reset_wait': case 'wave.policy_review':
        st.last_pause = { kind: e.kind, ts: e.ts, ...(e.payload || {}) };
        if (e.payload && e.payload.next_action_at) st.next_action_at = e.payload.next_action_at;
        break;
      case 'wave.closing': st.state = 'closing'; st.closing_reason = e.payload?.reason ?? null; break;
      case 'wave.closed': st.state = 'closed'; break;
      default: break;
    }
  }
  return st;
}

export function slotStates(ctx, events = readEvents(ctx)) {
  const slots = new Map();
  for (const e of events) {
    if (e.slot_id == null) continue;
    if (!SLOT_KINDS.includes(e.kind)) continue;
    const s = slots.get(e.slot_id) || { slot_id: e.slot_id, state: null, last: null, attempt_token: null, history: [] };
    s.state = e.kind;
    s.last = e;
    s.history.push(e.kind);
    if (e.kind === 'intent_committed') s.attempt_token = e.payload?.attempt_token ?? null;
    slots.set(e.slot_id, s);
  }
  return slots;
}

export function slotState(ctx, slotId, events = readEvents(ctx)) {
  return slotStates(ctx, events).get(slotId) || { slot_id: slotId, state: null, last: null, attempt_token: null, history: [] };
}

export function inFlightSlots(ctx, events = readEvents(ctx)) {
  return [...slotStates(ctx, events).values()].filter((s) => IN_FLIGHT.includes(s.state)).map((s) => s.slot_id);
}

// ── escrita ──────────────────────────────────────────────────────────────────

export function isBlocked(ctx) {
  return ctx.fs.existsSync(ctx.blockedPath);
}

function markBlocked(ctx, reason) {
  // Best-effort POR DESENHO: se o disco está mesmo morto, isto também falha —
  // e nesse caso a linha rasgada (journal_torn) ou a cadeia partida fazem o
  // bloqueio na leitura seguinte. Duas portas, nenhuma silenciosa.
  try {
    ctx.fs.writeFileSync(ctx.blockedPath, JSON.stringify({ ts: new Date(ctx.now()).toISOString(), reason: String(reason).slice(0, 500) }) + '\n');
  } catch { /* ver comentário acima */ }
}

function writeLineDurably(ctx, line) {
  const bytes = Buffer.from(line + '\n', 'utf8');
  let fd = null;
  try {
    fd = ctx.fs.openSync(ctx.eventsPath, 'a');
    const n = ctx.fs.writeSync(fd, bytes, 0, bytes.length);
    if (n !== bytes.length) throw new Error(`escrita parcial: ${n}/${bytes.length} bytes`);
    ctx.fs.fsyncSync(fd);
  } finally {
    if (fd !== null) { try { ctx.fs.closeSync(fd); } catch { /* o erro que interessa já foi lançado */ } }
  }
}

function assertTransition(ctx, events, { slot_id, kind }) {
  if (slot_id == null) {
    if (!WAVE_KINDS.includes(kind)) throw new JournalError('bad_kind', `kind de onda desconhecido: ${kind}`);
    const w = waveState(ctx, events);
    const rules = {
      'wave.frozen': () => events.length === 0 || 'wave.frozen tem de ser o primeiro evento',
      'wave.opened': () => (w.state === 'frozen') || (w.state === 'registered' ? 'a onda não está congelada (falta wave.frozen)' : w.state === 'open' ? 'already_open' : `onda em ${w.state}`),
      'wave.throttled': () => w.state === 'open' || `pausa exige onda aberta (está ${w.state})`,
      'wave.reset_wait': () => w.state === 'open' || `pausa exige onda aberta (está ${w.state})`,
      'wave.policy_review': () => w.state === 'open' || `policy_review exige onda aberta (está ${w.state})`,
      'wave.closing': () => w.state === 'open' || `closing exige onda aberta (está ${w.state})`,
      'wave.closed': () => w.state === 'closing' || `closed exige closing (está ${w.state})`,
      'journal.reconciled': () => events.length > 0 || 'nada para reconciliar',
      'journal.import_failed': () => events.length > 0 || 'onda inexistente',
    };
    const r = rules[kind]();
    if (r !== true) throw new JournalError(r === 'already_open' ? 'already_open' : 'bad_transition', `${kind}: ${r}`, { wave: w.state });
    return;
  }
  assertId(slot_id, 'slot_id');
  if (!SLOT_KINDS.includes(kind)) throw new JournalError('bad_kind', `kind de slot desconhecido: ${kind}`);
  const w = waveState(ctx, events);
  if (w.state === 'registered') throw new JournalError('bad_transition', `${kind}: a onda ainda não foi congelada`, { wave: w.state });
  if (w.state === 'closed') throw new JournalError('bad_transition', `${kind}: a onda já fechou; evidência nova vai para uma interpretação nova, não para este diário`, { wave: w.state });
  if (kind === 'intent_committed' && w.state !== 'open') throw new JournalError('wave_not_open', `intent_committed exige onda aberta (está ${w.state})`, { wave: w.state });
  const s = slotState(ctx, slot_id, events);
  const allowed = SLOT_TRANSITIONS[s.state === null ? 'null' : s.state] || [];
  if (!allowed.includes(kind)) {
    throw new JournalError('bad_transition', `slot ${slot_id}: ${s.state ?? '(sem evento)'} → ${kind} não é permitido (permitidos: ${allowed.join(', ') || 'nenhum'})`, { slot_id, from: s.state, to: kind });
  }
}

/**
 * Acrescenta UM evento, durável, encadeado. LANÇA em qualquer falha e marca o
 * diário como bloqueado (journal.blocked) quando a falha é de escrita.
 *
 * @returns {object} a entrada escrita
 */
export function appendEvent(ctx, { slot_id = null, kind, payload = {} } = {}) {
  if (isBlocked(ctx)) throw new JournalError('journal_blocked', 'o diário está bloqueado por uma falha anterior; correr reconcile antes de escrever', { blockedPath: ctx.blockedPath });
  const lines = readLines(ctx);           // lança journal_torn se a última linha estiver rasgada
  const events = lines.map((l, i) => { try { return JSON.parse(l); } catch { throw new JournalError('journal_corrupt', `events.jsonl linha ${i + 1} não é JSON`, { line: i + 1 }); } });
  assertTransition(ctx, events, { slot_id, kind });

  const prev_hash = lines.length ? sha256(lines[lines.length - 1]) : null;
  const entry = {
    schema: SCHEMA,
    seq: lines.length,
    ts: new Date(ctx.now()).toISOString(),
    wave_id: ctx.waveId,
    slot_id,
    kind,
    prev_hash,
    payload_hash: provHash(payload ?? null),
    payload: JSON.parse(canonicalize(payload ?? null)),
  };
  const line = JSON.stringify(entry);
  try {
    writeLineDurably(ctx, line);
  } catch (e) {
    markBlocked(ctx, `append ${kind} falhou: ${e && e.message}`);
    throw new JournalError('journal_write_failed', `não consegui persistir ${kind}${slot_id ? ` (${slot_id})` : ''}: ${e && e.message}`, { kind, slot_id, cause: e && e.code });
  }
  return entry;
}

// ── operações da onda ────────────────────────────────────────────────────────

/**
 * Abre a onda UMA vez: grava deadline_at e closeout_at derivados de `now` e das
 * janelas do manifesto. Segunda chamada ⇒ `already_open`. Nunca recalcula.
 */
export function openWave(ctx, { manifest_hash, wallclock_minutes = DEFAULT_WALLCLOCK_MINUTES, reserve_minutes = DEFAULT_RESERVE_MINUTES } = {}) {
  const events = readEvents(ctx);
  const w = waveState(ctx, events);
  if (w.state === 'open' || w.state === 'closing' || w.state === 'closed') throw new JournalError('already_open', `a onda ${ctx.waveId} já foi aberta em ${w.opened_at} (deadline ${w.deadline_at}); não há reabertura`, { opened_at: w.opened_at, deadline_at: w.deadline_at });
  if (w.state !== 'frozen') throw new JournalError('not_frozen', 'a onda não está congelada (falta wave.frozen do freeze)');
  if (typeof manifest_hash !== 'string' || manifest_hash !== w.manifest_hash) throw new JournalError('manifest_mismatch', `manifest_hash ${String(manifest_hash).slice(0, 12)}… ≠ congelado ${String(w.manifest_hash).slice(0, 12)}…`);
  if (!(wallclock_minutes > reserve_minutes)) throw new JournalError('bad_window', `janela ${wallclock_minutes} min tem de ser maior que a reserva ${reserve_minutes} min`);
  const opened_ms = ctx.now();
  const payload = {
    manifest_hash,
    opened_at: new Date(opened_ms).toISOString(),
    deadline_at: new Date(opened_ms + wallclock_minutes * 60_000).toISOString(),
    closeout_at: new Date(opened_ms + (wallclock_minutes - reserve_minutes) * 60_000).toISOString(),
    wallclock_minutes, reserve_minutes,
    clock_source: ctx.now === SYSTEM_NOW ? 'system' : 'injected',
  };
  return appendEvent(ctx, { kind: 'wave.opened', payload });
}

function intentPath(ctx, slotId) { return path.join(ctx.rawDir, slotId, '.intent'); }

function countIntentFiles(ctx, slotId) {
  try { return ctx.fs.readdirSync(path.join(ctx.rawDir, slotId)).filter((n) => n === '.intent' || n.startsWith('.intent.void-')).length; } catch { return 0; }
}

/**
 * Persiste a INTENÇÃO de enviar, antes de qualquer efeito externo.
 * Ordem: guardas → `.intent` com 'wx' (claim atómico) → evento `intent_committed` (fsync).
 * Só depois de isto devolver é que o operador cola o texto.
 */
export function commitIntent(ctx, { slot_id, prompt_hash, manifest_hash } = {}) {
  assertId(slot_id, 'slot_id');
  if (typeof prompt_hash !== 'string' || !/^[0-9a-f]{64}$/.test(prompt_hash)) throw new JournalError('bad_hash', 'prompt_hash tem de ser sha256 hex');
  if (isBlocked(ctx)) throw new JournalError('journal_blocked', 'o diário está bloqueado por uma falha anterior; correr reconcile antes de enviar', { blockedPath: ctx.blockedPath });

  const events = readEvents(ctx);
  const w = waveState(ctx, events);
  if (w.state !== 'open') throw new JournalError('wave_not_open', `a onda está ${w.state}; só se envia com a onda aberta`, { wave: w.state });
  if (manifest_hash !== w.manifest_hash) throw new JournalError('manifest_mismatch', 'manifest_hash ≠ o congelado nesta onda');
  const now_ms = ctx.now();
  if (now_ms >= Date.parse(w.closeout_at)) throw new JournalError('closeout_reached', `passou closeout_at (${w.closeout_at}); a onda fecha incompleta, não se envia mais`, { closeout_at: w.closeout_at, deadline_at: w.deadline_at });

  // O ficheiro é a verdade do claim; a mensagem de erro diz porquê antes do 'wx'.
  if (ctx.fs.existsSync(intentPath(ctx, slot_id))) throw new JournalError('attempt_token_exists', `o slot ${slot_id} já tem um token de tentativa (${intentPath(ctx, slot_id)}); nunca se reenvia — só recuperação ou known_not_submitted com prova`, { slot_id });

  const s = slotState(ctx, slot_id, events);
  if (!['preflight_ok', 'queued'].includes(s.state)) throw new JournalError('slot_not_ready', `slot ${slot_id} está ${s.state ?? '(sem evento)'}; commitIntent exige preflight_ok ou queued`, { slot_id, state: s.state });
  const flying = inFlightSlots(ctx, events).filter((id) => id !== slot_id);
  if (flying.length) throw new JournalError('slot_in_flight', `concorrência 1: ${flying.join(', ')} ainda em voo`, { in_flight: flying });

  const attempt_token = `${slot_id}-${String(countIntentFiles(ctx, slot_id) + 1).padStart(4, '0')}`;
  const file = intentPath(ctx, slot_id);
  ctx.fs.mkdirSync(path.dirname(file), { recursive: true });
  let fd = null;
  try {
    fd = ctx.fs.openSync(file, 'wx'); // O_CREAT|O_EXCL — exactamente um criador
  } catch (e) {
    if (e && e.code === 'EEXIST') throw new JournalError('attempt_token_exists', `o slot ${slot_id} já tem um token de tentativa`, { slot_id });
    throw new JournalError('intent_write_failed', `não consegui criar o token de tentativa: ${e && e.message}`, { slot_id, cause: e && e.code });
  }
  try {
    const tok = Buffer.from(JSON.stringify({ attempt_token, slot_id, wave_id: ctx.waveId, prompt_hash, manifest_hash, ts: new Date(now_ms).toISOString() }) + '\n', 'utf8');
    ctx.fs.writeSync(fd, tok, 0, tok.length);
    ctx.fs.fsyncSync(fd);
  } catch (e) {
    try { ctx.fs.closeSync(fd); } catch { /* já vamos lançar */ }
    fd = null;
    voidIntentFile(ctx, slot_id, 'token_write_failed');
    throw new JournalError('intent_write_failed', `não consegui persistir o token de tentativa: ${e && e.message}`, { slot_id, cause: e && e.code });
  }
  try { ctx.fs.closeSync(fd); } catch { /* fsync já passou */ }

  let entry;
  try {
    entry = appendEvent(ctx, { slot_id, kind: 'intent_committed', payload: { attempt_token, prompt_hash, manifest_hash, intent_file: path.relative(ctx.dir, file).split(path.sep).join('/') } });
  } catch (e) {
    // O operador ainda não colou nada (só o faz depois de isto devolver), logo
    // há prova positiva de não-envio: o token é anulado (renomeado, nunca
    // apagado). O diário já ficou bloqueado pelo appendEvent.
    const voided = voidIntentFile(ctx, slot_id, 'append_failed');
    if (e instanceof JournalError) { e.details = { ...e.details, voided }; throw e; }
    throw e;
  }
  return { entry, attempt_token, intent_file: file };
}

/** Renomeia `.intent` para `.intent.void-N` (nunca apaga). Devolve o novo nome ou null. Best-effort. */
function voidIntentFile(ctx, slotId, why) {
  const file = intentPath(ctx, slotId);
  const n = countIntentFiles(ctx, slotId); // inclui o .intent actual
  const target = `${file}.void-${String(n).padStart(4, '0')}`;
  try { ctx.fs.renameSync(file, target); return { file: target, why }; } catch { return null; }
}

/**
 * Prova positiva de não-envio (ex.: o texto não entrou no campo e nada saiu —
 * o D02 da onda-01). Regista `known_not_submitted` e anula o token. O slot
 * pode voltar a `queued` dentro do tecto.
 */
export function knownNotSubmitted(ctx, { slot_id, proof } = {}) {
  assertId(slot_id, 'slot_id');
  if (typeof proof !== 'string' || proof.trim().length < 8) throw new JournalError('proof_required', 'known_not_submitted exige uma prova positiva escrita (≥ 8 caracteres): o que se viu que garante que nada foi enviado');
  const entry = appendEvent(ctx, { slot_id, kind: 'known_not_submitted', payload: { proof } });
  const voided = voidIntentFile(ctx, slot_id, 'known_not_submitted');
  return { entry, voided };
}

/**
 * Retoma depois de interrupção. NÃO reabre, NÃO recalcula o deadline, NÃO reenvia.
 * Marca `submission_uncertain` em: (a) slots cujo último evento é
 * `intent_committed`; (b) slots com `.intent` no disco sem `intent_committed`
 * no diário (órfão — a escrita do evento falhou depois do claim).
 */
export function resume(ctx) {
  const events = readEvents(ctx);
  const w = waveState(ctx, events);
  const slots = slotStates(ctx, events);
  const marked = [];
  const orphans = [];

  for (const s of slots.values()) {
    if (s.state === 'intent_committed') {
      appendEvent(ctx, { slot_id: s.slot_id, kind: 'submission_uncertain', payload: { reason: 'resume_without_submitted', attempt_token: s.attempt_token } });
      marked.push(s.slot_id);
    }
  }
  let dirs = [];
  try { dirs = ctx.fs.readdirSync(ctx.rawDir); } catch { dirs = []; }
  for (const slotId of dirs) {
    if (!ctx.fs.existsSync(intentPath(ctx, slotId))) continue;
    const s = slots.get(slotId);
    const hasIntentEvent = s && s.history.includes('intent_committed');
    if (hasIntentEvent) continue;
    const from = s ? s.state : null;
    if (from === null || !SLOT_TRANSITIONS[from].includes('submission_uncertain')) {
      // Sem evento nenhum (ou estado que não pode receber submission_uncertain):
      // regista o órfão no relatório; não inventa transições.
      orphans.push({ slot_id: slotId, state: from, action: 'reported_only' });
      continue;
    }
    appendEvent(ctx, { slot_id: slotId, kind: 'submission_uncertain', payload: { reason: 'orphan_intent_file' } });
    marked.push(slotId);
    orphans.push({ slot_id: slotId, state: from, action: 'marked_submission_uncertain' });
  }

  const now_ms = ctx.now();
  const remaining_ms = w.closeout_at ? Math.max(0, Date.parse(w.closeout_at) - now_ms) : null;
  return {
    wave: w,
    marked, orphans,
    remaining_to_closeout_ms: remaining_ms,
    can_send: w.state === 'open' && remaining_ms > 0 && !isBlocked(ctx),
  };
}

/**
 * Reconciliação depois de um bloqueio: verifica a cadeia e, se estiver íntegra,
 * levanta o bloqueio e regista `journal.reconciled`. Cadeia partida ⇒ lança
 * `chain_broken` e o bloqueio fica.
 */
export function reconcile(ctx, { operator_note = '' } = {}) {
  const chain = verifyChain(ctx);
  if (!chain.ok) throw new JournalError('chain_broken', `cadeia partida na linha ${chain.broken_at} (${chain.reason}); não se reconcilia à mão — preserva-se e reporta-se`, chain);
  let blocked_reason = null;
  if (isBlocked(ctx)) {
    try { blocked_reason = JSON.parse(ctx.fs.readFileSync(ctx.blockedPath, 'utf8')); } catch { blocked_reason = 'ilegível'; }
    // O bloqueio sai ANTES do evento: appendEvent recusa escrever com o bloqueio posto.
    ctx.fs.renameSync(ctx.blockedPath, `${ctx.blockedPath}.${ctx.now()}`);
  }
  const entry = appendEvent(ctx, { kind: 'journal.reconciled', payload: { chain_length: chain.length, blocked_reason, operator_note: String(operator_note).slice(0, 500) } });
  return { entry, chain };
}
