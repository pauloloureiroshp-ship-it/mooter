// _harness.mjs — a costura comum dos testes do kit: raiz temporária FORA do
// repo, relógio injectado, fs com falhas programáveis, executor fake que conta.
//
// Nada aqui toca prisma-data/ real, ~/.mooter, ~/.claude nem o repo. As
// fixtures são SINTÉTICAS: nunca D01–D04, nunca marca-alvo, nunca rubrica.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import * as J from '../journal.mjs';

const criados = [];
export const tmpRoot = () => { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'prisma-kit-')); criados.push(d); return d; };
process.on('exit', () => { for (const d of criados) { try { fs.rmSync(d, { recursive: true, force: true }); } catch { /* best-effort */ } } });

export const T0 = Date.parse('2026-09-16T12:00:00.000Z');
export const MIN = 60_000;

/** Relógio injectável: `clock.t` é o «agora» em ms; `clock.now` é a função que o kit lê. */
export function clock(start = T0) {
  const c = { t: start };
  c.now = () => c.t;
  c.advance = (ms) => { c.t += ms; return c.t; };
  return c;
}

export const MANIFEST_HASH = 'a'.repeat(64);
export const PROMPT_HASH = 'b'.repeat(64);

/**
 * fs injectável: passa tudo ao node:fs real excepto o que estiver programado
 * para falhar. `fail.on(method, predicate, error)` faz a próxima chamada a
 * `method` cujo argumento passe no predicado lançar `error`. `fail.armed`
 * diz o que ainda não disparou.
 */
export function failingFs() {
  const fdPath = new Map();
  const arm = [];
  const wrap = (name, pathOf) => (...args) => {
    for (let i = 0; i < arm.length; i++) {
      const a = arm[i];
      if (a.method === name && a.when(pathOf(...args), ...args)) {
        arm.splice(i, 1);
        a.fired = true;
        throw a.error;
      }
    }
    return fs[name](...args);
  };
  const byFd = (fd) => fdPath.get(fd) || '';
  const proxy = {
    openSync: (...args) => {
      for (let i = 0; i < arm.length; i++) {
        const a = arm[i];
        if (a.method === 'openSync' && a.when(String(args[0]), ...args)) { arm.splice(i, 1); a.fired = true; throw a.error; }
      }
      const fd = fs.openSync(...args);
      fdPath.set(fd, String(args[0]));
      return fd;
    },
    writeSync: wrap('writeSync', byFd),
    fsyncSync: wrap('fsyncSync', byFd),
    closeSync: (fd) => { fdPath.delete(fd); return fs.closeSync(fd); },
    readFileSync: wrap('readFileSync', (p) => String(p)),
    writeFileSync: wrap('writeFileSync', (p) => String(p)),
    existsSync: (...a) => fs.existsSync(...a),
    mkdirSync: wrap('mkdirSync', (p) => String(p)),
    renameSync: wrap('renameSync', (p) => String(p)),
    readdirSync: (...a) => fs.readdirSync(...a),
    statSync: (...a) => fs.statSync(...a),
  };
  const err = (code, msg) => { const e = new Error(msg || code); e.code = code; return e; };
  return {
    fs: proxy,
    on(method, when, error = err('EIO', 'falha simulada')) { const a = { method, when, error, fired: false }; arm.push(a); return a; },
    get armed() { return arm.map((a) => a.method); },
    err,
  };
}

/** Executor fake: é o «operador cola e envia». Só conta; nunca chama nada. */
export function fakeExecutor() {
  return { calls: 0, sent: [], send(slotId) { this.calls++; this.sent.push(slotId); return { ok: true }; } };
}

/** Onda congelada e aberta em `clock.t`, com um slot em preflight_ok. Devolve { ctx, root }. */
export function openedWave({ root = tmpRoot(), waveId = 'W-test', clk = clock(), fsImpl = fs, slots = ['S01-1'] } = {}) {
  const ctx = J.openJournal({ root, waveId, now: clk.now, fs: fsImpl });
  J.appendEvent(ctx, { kind: 'wave.frozen', payload: { manifest_hash: MANIFEST_HASH, prompts: { 'S01': PROMPT_HASH } } });
  J.openWave(ctx, { manifest_hash: MANIFEST_HASH });
  for (const s of slots) {
    J.appendEvent(ctx, { slot_id: s, kind: 'prepared' });
    J.appendEvent(ctx, { slot_id: s, kind: 'preflight_ok', payload: { prompt_hash: PROMPT_HASH } });
  }
  return { ctx, root, clk };
}

/** O gesto do operador: só envia se commitIntent devolver. Devolve o erro (ou null). */
export function operatorTriesToSend(ctx, executor, slotId) {
  try {
    J.commitIntent(ctx, { slot_id: slotId, prompt_hash: PROMPT_HASH, manifest_hash: MANIFEST_HASH });
  } catch (e) {
    return e;
  }
  executor.send(slotId);
  return null;
}

export const linhas = (ctx) => fs.readFileSync(ctx.eventsPath, 'utf8').split('\n').filter(Boolean);
export const kindsDe = (ctx, slotId) => linhas(ctx).map((l) => JSON.parse(l)).filter((e) => e.slot_id === slotId).map((e) => e.kind);
export const intentFile = (ctx, slotId) => path.join(ctx.rawDir, slotId, '.intent');
export const voidFiles = (ctx, slotId) => { try { return fs.readdirSync(path.join(ctx.rawDir, slotId)).filter((n) => n.startsWith('.intent.void-')); } catch { return []; } };

// ── passo 2: manifestos SINTÉTICOS (ids Qxx/Nxx — nunca D01–D04, nunca marca) ──
import { freezeWave } from '../freeze.mjs';
import { openFromManifest } from '../open.mjs';

const CONDITION = (over = {}) => ({
  surface: 'chatgpt-web', observed_plan: null, selected_model_label: 'LBL-SYN', observed_model_label: null,
  reasoning_control: null, auto_switch: null, personalization: 'off-required', search_available: true, search_used: null,
  prompt_language: 'pt-BR', timestamp: null, prompt_hash: null, capture_method: 'manual-paste', operator_id: null, ...over,
});
const QUEUE = (over = {}) => ({ max_concurrency_total: 1, primary_send_attempts_per_slot: 1, interval_seconds: 60, jitter_seconds: [0, 15], jitter_seed: 'seed-synthetic', wallclock_minutes: 45, closeout_reserve_minutes: 5, ...over });

export function syntheticManifest(waveId, over = {}) {
  return {
    schema: 'prisma-experiment-manifest/0.3-proposed', brief_id: 'brief-syn', wave_id: waveId, condition_id: 'cond-syn', partition: 'synthetic-qualification', surface: 'chatgpt-web',
    condition_requested: CONDITION(over.condition || {}),
    prompts: [{ id: 'S01', text: 'Pergunta sintética número um, neutra.', role: 'synthetic', prompt_hash: null }, { id: 'S02', text: 'Pergunta sintética número dois, também neutra.', role: 'synthetic', prompt_hash: null }],
    order: ['S01', 'S02', 'S02', 'S01'], caps: { coverage_per_wave: 4, planned_eligible: 0, negative: 0 },
    queue_policy: QUEUE(over.queue || {}), adapter_version: 'manual-paste/0.1', rubric_ref: null, authorization_ref: null, manifest_hash: null,
    forbidden_markers: ['CANARY-COORD-7f3a', 'MASTER-PROMPT'],
    ...(over.top || {}),
  };
}

/** Braço primário sintético: 3 elegíveis + 1 negativo × 2 = 8, ordem espelhada. */
export function primaryManifest(waveId, over = {}) {
  return {
    schema: 'prisma-experiment-manifest/0.3-proposed', brief_id: 'brief-syn', wave_id: waveId, condition_id: 'cond-syn-primary', partition: 'primary', surface: 'chatgpt-web',
    condition_requested: CONDITION({ operator_id: 'op-syn', ...(over.condition || {}) }),
    prompts: [
      { id: 'Q01', text: 'Pergunta elegível sintética um.', role: 'eligible', prompt_hash: null },
      { id: 'Q02', text: 'Pergunta elegível sintética dois.', role: 'eligible', prompt_hash: null },
      { id: 'Q03', text: 'Pergunta elegível sintética três.', role: 'eligible', prompt_hash: null },
      { id: 'N04', text: 'Pergunta de controlo negativo sintética.', role: 'negative', prompt_hash: null },
    ],
    order: ['Q01', 'Q02', 'Q03', 'N04', 'N04', 'Q03', 'Q02', 'Q01'], caps: { coverage_per_wave: 8, planned_eligible: 6, negative: 2 },
    queue_policy: QUEUE(over.queue || {}), adapter_version: 'manual-paste/0.1', rubric_ref: 'rubric-syn-v0', authorization_ref: 'auth-syn-0001', manifest_hash: null,
    forbidden_markers: ['CANARY-COORD-7f3a', 'MASTER-PROMPT'],
    ...(over.top || {}),
  };
}

/** O que a UI mostra, coerente com o manifesto (o operador preenche isto à mão na vida real). */
export function observedFor(manifest, over = {}) {
  const c = manifest.condition_requested;
  return { surface: c.surface, observed_plan: null, selected_model_label: c.selected_model_label, observed_model_label: c.selected_model_label, reasoning_control: c.reasoning_control, auto_switch: c.auto_switch, personalization: 'off', search_available: c.search_available, prompt_language: c.prompt_language, capture_method: c.capture_method, operator_id: c.operator_id, ...over };
}

export const capabilityEligible = (over = {}) => ({ schema: 'prisma-capability-record/0.1-proposed', surface: 'chatgpt-web', eligible_primary: true, essential: { retries_controllable: { value: null } }, ...over });

export const bytesOf = (manifest, promptId) => Buffer.from(manifest.prompts.find((p) => p.id === promptId).text, 'utf8');

/** freeze + open a partir do manifesto; devolve { ctx, root, clk, manifest (congelado), input }. */
export function frozenOpenWave({ root = tmpRoot(), waveId = 'W-syn', clk = clock(), fsImpl = fs, manifest } = {}) {
  const input = manifest || syntheticManifest(waveId);
  const ctx = J.openJournal({ root, waveId, now: clk.now, fs: fsImpl });
  const f = freezeWave(ctx, { manifest: input });
  openFromManifest(ctx);
  return { ctx, root, clk, manifest: f.manifest, input };
}

// ── passo 4: levar um slot até um estado, pelo caminho oficial (preflight → intent → …) ──
import { preflight as _preflight } from '../preflight.mjs';
import { importCapture as _importCapture, importFailure as _importFailure, markCaptureUncertain as _markCaptureUncertain } from '../import.mjs';

/**
 * driveSlot: percorre o caminho real até `to` ∈ preflight_ok | intent | submitted |
 * captured | failed | capture_uncertain | submission_uncertain (via resume).
 * Devolve o que o último passo devolveu. Usa o executor fake se dado.
 */
export function driveSlot(ctx, manifest, slotId, { to = 'captured', exec = null, capability = null, observed = {}, answer = 'resposta sintética', completeness = 'full', literal = 'Something went wrong.', usage = {}, refusal = false } = {}) {
  const pid = manifest.slots.find((s) => s.slot_id === slotId).prompt_id;
  const cap = capability ?? (manifest.partition === 'synthetic-qualification' ? null : capabilityEligible());
  const r = _preflight(ctx, { slot_id: slotId, bytes: bytesOf(manifest, pid), observed: observedFor(manifest, observed), capability: cap });
  if (!r.ok) throw new Error(`driveSlot ${slotId}: preflight falhou ${JSON.stringify(r.reasons)}`);
  if (to === 'preflight_ok') return r;
  const c = J.commitIntent(ctx, { slot_id: slotId, prompt_hash: manifest.prompts.find((p) => p.id === pid).prompt_hash, manifest_hash: manifest.manifest_hash });
  if (exec) exec.send(slotId);
  if (to === 'intent') return c;
  if (to === 'submission_uncertain') return J.resume(ctx);
  const s = J.appendEvent(ctx, { slot_id: slotId, kind: 'submitted', payload: { ts_submitted: new Date(ctx.now()).toISOString() } });
  if (to === 'submitted') return s;
  if (to === 'failed') return _importFailure(ctx, { slot_id: slotId, literal });
  if (to === 'capture_uncertain') return _markCaptureUncertain(ctx, { slot_id: slotId, literal, partial_bytes: Buffer.from(String(answer).slice(0, 8)) });
  return _importCapture(ctx, { slot_id: slotId, answer_bytes: Buffer.from(answer, 'utf8'), capture_completeness: completeness, capture_method: 'manual-paste', observed: observedFor(manifest, { search_used: null, ...observed }), usage, refusal });
}

// AMENDMENT-001 A4: «n/d» só com justificação escrita — um «n/d» nu não é julgamento concluído.
export const HUMAN_OK = Object.freeze({ hypothesis_id: 'H-syn-01', expected_result: 'n/d (onda sintética: sem resultado esperado)', counterevidence: 'n/d — onda sintética, sem contra-evidência a registar', confounders: 'n/d — onda sintética, sem confounders observados', decision: 'inconclusive', reviewer: 'rev-syn', next_hypothesis_id: 'n/d — decide-se no fecho da W1' });
