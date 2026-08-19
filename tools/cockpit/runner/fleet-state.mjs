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
// The longest healthy gap between receipts is one round plus its sleep (~45s).
// 180s was 4x that: a loop that died with the endpoint still up stayed green for
// three minutes. 75s still tolerates a slow round without inventing patience.
export const STALE_AFTER_S = 75;
export const DEAD_AFTER_S = 300;
export const CLOCK_SKEW_TOLERANCE_S = 5;
/** Enough consecutive empty rounds to mean the loop is spinning, not working. */
export const IDLE_STREAK_ALARM = 8;

/** Reads a jsonl ledger into objects, skipping unparseable lines honestly. */
export function readLedger(ledgerPath, { readImpl = fs.readFileSync, maxLines = 5000 } = {}) {
  let raw;
  try {
    raw = String(readImpl(ledgerPath, 'utf8'));
  } catch {
    return { receipts: [], corrompidas: 0, existe: false };
  }
  const todas = raw.split('\n').filter((l) => l.trim());
  const lines = todas.slice(-maxLines);
  // O ledger e lido por uma JANELA (`maxLines`), mas o painel rotulava a
  // contagem como "recibos ao todo": com 5905 linhas no disco mostrava 5000 e
  // parava ali para sempre. Um numero com o rotulo errado e pior do que um
  // numero em falta.
  const truncado = todas.length > lines.length ? todas.length : null;
  const receipts = [];
  let corrompidas = 0;
  for (const line of lines) {
    try {
      receipts.push(JSON.parse(line));
    } catch {
      corrompidas += 1;
    }
  }
  return { receipts, corrompidas, existe: true, ledgerLinhas: todas.length, truncado };
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
  if (!lastTs) return { estado: 'morto', idade_s: null, motivo: 'no receipt' };
  const t = Date.parse(lastTs);
  if (!Number.isFinite(t)) return { estado: 'morto', idade_s: null, motivo: 'unreadable timestamp' };
  const raw = Math.round((nowMs - t) / 1000);
  // A receipt dated in the future used to clamp to age 0 and read as `vivo`
  // forever — a clock skew, or one bad line, would pin the cockpit green.
  // A timestamp we cannot place in the past is not freshness, it is a fault.
  if (raw < -CLOCK_SKEW_TOLERANCE_S) {
    return { estado: 'morto', idade_s: null, motivo: `receipt dated in the future (${-raw}s)` };
  }
  const age = Math.max(0, raw);
  if (age <= STALE_AFTER_S) return { estado: 'vivo', idade_s: age, motivo: null };
  if (age <= DEAD_AFTER_S) {
    return { estado: 'stale', idade_s: age, motivo: `no receipt for ${age}s` };
  }
  return { estado: 'morto', idade_s: age, motivo: `no receipt for ${age}s` };
}

export const FEED_LENGTH = 14;

/**
 * The last N receipts, newest first — the cockpit's actual event stream.
 * Trimmed server-side so the page never holds the whole ledger in memory, and
 * so a 50 MB ledger cannot turn the payload into a page freeze.
 */
export function buildFeed(receipts, limit = FEED_LENGTH) {
  return (receipts || [])
    .slice(-limit)
    .reverse()
    .map((r) => ({
      ts: r.ts ?? null,
      pilar: r.pilar ?? null,
      // 'geral' = o pilar nao tinha nada no diff e revimos o resto. Sem este
      // campo no payload, o B6 corrigia o pack e o painel continuava a vestir
      // o cartao "P1 · Routing & Custo" com trabalho que nao e do P1: o campo
      // era escrito no ledger e lido por ninguem.
      escopo: r.escopo ?? null,
      // Eventos do disjuntor (engine:down / engine:up) nao tem pilar nem
      // veredicto; sem isto apareciam no feed como uma linha muda.
      evento: r.evento ?? null,
      verdict: r.verdict ?? null,
      ficheiro: r.ficheiro ?? null,
      dur_s: r.dur_s ?? null,
      tokens_out: r.tokens_out ?? null,
      evidencia: r.evidencia ?? null,
      resumo: r.resultado_resumo ?? null,
    }));
}

/** How many receipts in a row produced no finding at all, counting backwards. */
export function emptyStreak(receipts) {
  let n = 0;
  for (let i = (receipts || []).length - 1; i >= 0; i -= 1) {
    const r = receipts[i];
    // Um evento do disjuntor nao e uma ronda: nao conta para a sequencia, mas
    // tambem NAO a quebra. Quebrava — e um `engine:down` no fim do ledger
    // punha o unico alarme de "a rodar sem produzir" a zero, calando-o.
    if (r && r.evento) continue;
    const v = r && r.verdict;
    if (v === VERDICT.NO_FINDING || v === VERDICT.UNCITED) n += 1;
    else break;
  }
  return n;
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
      escopo: r.escopo ?? null,
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
import { lerTriagem, porTriar, contarTriagem } from './triagem.mjs';
import { verReserva } from './reserva.mjs';

export function buildFleetState({
  // Sem default cravado: quem chama diz quem é, e a identidade vem toda de
  // `fleet-beacon.deviceName()`. Um nome inventado aqui foi o que fez o cockpit
  // do mac deixar de se reconhecer a si próprio na frota.
  device = null,
  ledgerPath,
  statePath,
  stopFile,
  // O registo de decisoes deste projecto. Ausente = ninguem triou nada ainda,
  // que e diferente de "nao ha achados".
  triagemPath = null,
  // A pasta de estado deste projecto, para se saber se a maquina foi cedida.
  baseDir = null,
  connector = '1.48.0',
  gpu = null,
  loadedModels = [],
  engineAlive = false,
  alignment = null,
  fleet = null,
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

  const { receipts, corrompidas, existe, ledgerLinhas, truncado } = readLedger(ledgerPath, { readImpl });
  const last = receipts.length ? receipts[receipts.length - 1] : null;
  const today = ownerDay(now);
  // `Date.parse` on junk yields NaN, and `Intl.DateTimeFormat` throws on it —
  // one malformed line in the ledger would take the whole endpoint down.
  const todays = receipts.filter((r) => {
    const t = r && r.ts ? Date.parse(r.ts) : NaN;
    return Number.isFinite(t) && ownerDay(t) === today;
  });

  const { decisoes, partidas: triagemPartidas } = triagemPath
    ? lerTriagem(triagemPath)
    : { decisoes: new Map(), partidas: 0 };
  const contasTriagem = contarTriagem(receipts, decisoes);
  const fila = porTriar(receipts, decisoes);

  const tally = tallyVerdicts(receipts);
  const tallyToday = tallyVerdicts(todays);
  const fresh = freshness(last && last.ts, now);
  const idleStreak = emptyStreak(receipts);

  return {
    device: state.device || device || 'device-sem-nome',
    running,
    // $0 is structural: `runner-core.assertLocalEngine` refuses any non-loopback
    // engine, so this field cannot drift away from the truth.
    usd: 0,
    // O ciclo de valor: quantos achados nasceram, e quantos ainda esperam por
    // uma decisao. Sem isto o painel media volume, nao trabalho.
    // Um device que CEDEU a maquina nao esta avariado, e ate aqui era
    // indistinguivel de um loop morto: o painel via "sem recibos ha 20 min" e
    // dizia stale. So se publica `activa` e `faltaS` — o `quem` e o `porque`
    // sao texto livre a caminho de um vault com remote, e nao precisam de sair.
    reserva: (() => {
      if (!baseDir) return null;
      const r = verReserva(baseDir);
      return { activa: r.activa, falta_s: r.activa ? r.faltaS : 0 };
    })(),
    // Quantas linhas o ledger tem MESMO, e de quantas se contou.
    ledger: { linhas: ledgerLinhas ?? null, janela: receipts.length, truncado: Boolean(truncado) },
    triagem: {
      ...contasTriagem,
      ...(triagemPartidas ? { linhas_partidas: triagemPartidas } : {}),
    },
    // A fila. E tambem o alerta: um achado por triar nao pode exigir que o dono
    // va procurar — ate hoje havia zero alertas no painel.
    por_triar: fila,
    alerta_achados: fila.length > 0,
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
    feed: buildFeed(receipts),

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
      // A model that answers "SEM ACHADO" forever burns the GPU and produces
      // nothing, while every other indicator stays green. This is the counter
      // that makes busy-but-useless visible.
      vazias_seguidas: idleStreak,
      alarme_ocioso: idleStreak >= IDLE_STREAK_ALARM,
    },

    // Alignment is measured by `alignment.mjs`, never assumed. When it could not
    // be computed the whole block is null, so the cockpit shows `n/d` rather
    // than a row of ticks it never earned.
    projeto: alignment,

    // Other devices, read from beacons they wrote. Null when we could not look
    // at all — an empty fleet and an unread fleet are different claims.
    frota: fleet,

    gpu: gpu || { util_pct: null, vram_inuse_gb: null, fonte: 'n/d' },
    modelos_carregados: loadedModels,
    heartbeat: Math.floor(now / 1000),
  };
}
