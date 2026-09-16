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
