/**
 * fleet-state.mjs — the honest payload behind `GET /fleet.json`.
 *
 * Two things the prototype got wrong and this file fixes:
 *  1. It reported `jobs_feitos: 174` as if 174 units of work had happened. The
 *     count was real; the work was not — none of those receipts carried a
 *     checkable citation. Counters here are broken out **by verdict**, so a
 *     wall of uncited rounds can never read as progress.
 *  2. It had no notion of staleness: a dead runner still served its last state
 *     with a fresh-looking heartbeat. `freshness()` labels the payload
 *     `vivo` / `stale` / `morto` from the age of the last receipt, so an offline
 *     device shows as disconnected instead of quietly green.
 *
 * `owner_tz` is `America/Sao_Paulo` by project canon: storage stays UTC, the
 * day boundary used for "hoje" is the owner's, never the host's.
 */

import fs from 'node:fs';
import { VERDICT, tallyVerdicts } from './evidence-verifier.mjs';

export const OWNER_TZ = 'America/Sao_Paulo';
export const STALE_AFTER_S = 180;
export const DEAD_AFTER_S = 900;

/** Reads a jsonl ledger into objects, skipping unparseable lines honestly. */
export function readLedger(ledgerPath, { readImpl = fs.readFileSync, maxLines = 5000 } = {}) {
  let raw;
  try {
    raw = String(readImpl(ledgerPath, 'utf8'));
  } catch {
    return { receipts: [], corrompidas: 0, existe: false };
  }
  const lines = raw.split('\n').filter((l) => l.trim()).slice(-maxLines);
  const receipts = [];
  let corrompidas = 0;
  for (const line of lines) {
    try {
      receipts.push(JSON.parse(line));
    } catch {
      corrompidas += 1;
    }
  }
  return { receipts, corrompidas, existe: true };
}

/** The calendar day in the owner's timezone, e.g. `2026-08-16`. */
export function ownerDay(ms, tz = OWNER_TZ) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(ms));
}

/**
 * Labels how much the payload can be trusted, from the age of the last receipt.
 * Any unparseable or missing timestamp is `morto`, never `vivo` — an unknown
 * age is not a fresh one.
 */
export function freshness(lastTs, nowMs) {
  if (!lastTs) return { estado: 'morto', idade_s: null, motivo: 'sem recibo' };
  const t = Date.parse(lastTs);
  if (!Number.isFinite(t)) return { estado: 'morto', idade_s: null, motivo: 'timestamp ilegivel' };
  const age = Math.max(0, Math.round((nowMs - t) / 1000));
  if (age <= STALE_AFTER_S) return { estado: 'vivo', idade_s: age, motivo: null };
  if (age <= DEAD_AFTER_S) {
    return { estado: 'stale', idade_s: age, motivo: `sem recibo ha ${age}s` };
  }
  return { estado: 'morto', idade_s: age, motivo: `sem recibo ha ${age}s` };
}

/** Last receipt per pillar, plus that pillar's own verdict split. */
export function perPillar(receipts) {
  const out = {};
  for (const r of receipts || []) {
    if (!r || !r.pilar) continue;
    const slot = (out[r.pilar] ||= {
      ultimo: null,
      total: 0,
      citacao_ok: 0,
      refutado: 0,
      sem_citacao: 0,
      sem_achado: 0,
      sem_veredicto: 0,
    });
    slot.total += 1;
    const key = { 'citacao-ok': 'citacao_ok', refutado: 'refutado', 'sem-citacao': 'sem_citacao', 'sem-achado': 'sem_achado' }[r.verdict];
    if (key) slot[key] += 1;
    else slot.sem_veredicto += 1;
    slot.ultimo = {
      ts: r.ts ?? null,
      verdict: r.verdict ?? null,
      ficheiro: r.ficheiro ?? null,
      evidencia: r.evidencia ?? null,
      resumo: r.resultado_resumo ?? null,
    };
  }
  return out;
}

/**
 * Builds the whole payload.
 *
 * @returns the object served at `/fleet.json`
 */
export function buildFleetState({
  device = 'mac-mini',
  ledgerPath,
  statePath,
  stopFile,
  connector = '1.48.0',
  gpu = null,
  loadedModels = [],
  engineAlive = false,
  alignment = null,
  now = Date.now(),
  readImpl = fs.readFileSync,
  existsImpl = fs.existsSync,
} = {}) {
  const running = !existsImpl(stopFile);

  let state = {};
  try {
    state = JSON.parse(String(readImpl(statePath, 'utf8')));
  } catch {
    state = {};
  }

  const { receipts, corrompidas, existe } = readLedger(ledgerPath, { readImpl });
  const last = receipts.length ? receipts[receipts.length - 1] : null;
  const today = ownerDay(now);
  const todays = receipts.filter((r) => r && r.ts && ownerDay(Date.parse(r.ts)) === today);

  const tally = tallyVerdicts(receipts);
  const tallyToday = tallyVerdicts(todays);
  const fresh = freshness(last && last.ts, now);

  return {
    device: state.device || device,
    running,
    // $0 is structural: `runner-core.assertLocalEngine` refuses any non-loopback
    // engine, so this field cannot drift away from the truth.
    usd: 0,
    engine: engineAlive ? 'ollama-local' : 'down',
    conector: connector,
    owner_tz: OWNER_TZ,

    pilar_atual: state.pilar_atual ?? null,
    foco: state.foco ?? null,
    modelo_atual: state.modelo ?? null,

    // Per-pillar last word, so the cockpit can show six honest cards instead of
    // one aggregate that hides a pillar which has produced nothing all day.
    pilares: perPillar(receipts),

    frescura: fresh,
    ultimo_recibo: last,

    // Volume is reported, but never alone — the verdict split is what says
    // whether any of it was work.
    recibos: {
      total: tally.total,
      hoje: tallyToday.total,
      citacao_ok: tally[VERDICT.CITED],
      refutado: tally[VERDICT.REFUTED],
      sem_citacao: tally[VERDICT.UNCITED],
      sem_achado: tally[VERDICT.NO_FINDING],
      sem_veredicto: tally.erro,
      linhas_corrompidas: corrompidas,
      ledger_existe: existe,
    },

    // Alignment is measured by `alignment.mjs`, never assumed. When it could not
    // be computed the whole block is null, so the cockpit shows `n/d` rather
    // than a row of ticks it never earned.
    projeto: alignment,

    gpu: gpu || { util_pct: null, vram_inuse_gb: null, fonte: 'n/d' },
    modelos_carregados: loadedModels,
    heartbeat: Math.floor(now / 1000),
  };
}
