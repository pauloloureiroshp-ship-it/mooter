/**
 * recibos-por-hora.mjs — a metrica que substitui a percentagem de GPU.
 *
 * ── PORQUE A % DE GPU SAI DE CIMA DA DOBRA ──────────────────────────────────
 *
 * O cartao mais visivel deste painel media a UTILIZACAO da placa: um mostrador
 * grande com `47%` e uma sparkline que so existia enquanto o separador
 * estivesse aberto (`spark`, memoria do browser — fechar o painel apagava a
 * historia).
 *
 * Uma GPU a 100% nao entrega nada. Mede o esforco, nao o resultado, e este
 * projecto ja decidiu de que lado esta: os recibos contam-se POR VEREDICTO,
 * nunca por volume. A percentagem continua no payload e continua a poder
 * ver-se — o que muda e o que ocupa o lugar de mais valor do ecra.
 *
 * ── O QUE ENTRA NO LUGAR ────────────────────────────────────────────────────
 *
 * **Recibos que passam o check, por hora.** Um recibo `citacao-ok` e um em que
 * a linha citada foi lida do disco e existe. Nao quer dizer que o achado esteja
 * certo — isso e triagem, e e outro passo — mas quer dizer que houve trabalho
 * verificavel, e nenhuma outra metrica deste sistema diz isso.
 *
 * ── E QUANDO NAO HA NADA ────────────────────────────────────────────────────
 *
 * Zero recibos numa janela e um FACTO e sai `0`, com a idade do ultimo recibo
 * ao lado — porque `0/h` sem contexto le-se como avaria e neste momento e uma
 * paragem decidida (o loop esta parado desde 26/08 por portao de medicao).
 * O que NAO se pode e dividir por uma janela que nao existe: sem recibo
 * nenhum no ledger, `por_hora` sai `null` com o motivo.
 *
 * PURO: recebe recibos ja lidos e o relogio por injeccao. Sem fs.
 */

import { OWNER_TZ, ownerDay } from './fleet-state.mjs';

export { OWNER_TZ };

/** A janela curta. 24 h e um dia do dono, nao um dia UTC. */
export const JANELA_H = 24;
/** Quantos dias a serie mostra. Sete: uma semana le-se de relance. */
export const DIAS_DA_SERIE = 7;

const tsDe = (r) => {
  const t = Date.parse(r && r.ts);
  return Number.isFinite(t) ? t : null;
};

/** Um recibo que PASSA o check: a linha citada existe no disco. */
const passa = (r) => r && r.verdict === 'citacao-ok';

/**
 * @param {Array} receipts recibos ja lidos do ledger
 * @returns {{por_hora:(number|null), janela_h:number, passam_24h:number, rondas_24h:number,
 *            ultimo_ts:(string|null), idade_h:(number|null), serie:Array, fonte:string,
 *            porque:(string|null)}}
 */
export function recibosPorHora(receipts, { agora = Date.now(), tz = OWNER_TZ, janelaH = JANELA_H, dias = DIAS_DA_SERIE } = {}) {
  const lista = Array.isArray(receipts) ? receipts : [];
  const corte = agora - janelaH * 3600_000;
  let passam = 0; let rondas = 0; let ultimo = null;
  const porDia = new Map();
  for (const r of lista) {
    const t = tsDe(r);
    if (t == null) continue;
    if (ultimo == null || t > ultimo) ultimo = t;
    if (t >= corte && t <= agora) { rondas += 1; if (passa(r)) passam += 1; }
    const d = ownerDay(t, tz);
    if (!porDia.has(d)) porDia.set(d, { date: d, rounds: 0, passam: 0 });
    const linha = porDia.get(d);
    linha.rounds += 1;
    if (passa(r)) linha.passam += 1;
  }

  const serie = [...porDia.values()]
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-dias)
    .map((d) => ({ ...d, por_hora: Number((d.passam / 24).toFixed(2)) }));

  return {
    // `null` so quando nao ha recibo NENHUM: ai nao ha janela para dividir.
    // Com recibos no ledger mas nenhum nas ultimas 24 h, `0` e a verdade.
    por_hora: ultimo == null ? null : Number((passam / janelaH).toFixed(2)),
    janela_h: janelaH,
    passam_24h: passam,
    rondas_24h: rondas,
    ultimo_ts: ultimo == null ? null : new Date(ultimo).toISOString(),
    idade_h: ultimo == null ? null : Number(((agora - ultimo) / 3600_000).toFixed(1)),
    serie,
    fonte: 'runner-ledger.jsonl · verdict citacao-ok · hora do dono ' + tz,
    porque: ultimo == null
      ? 'n/d — o ledger deste device não tem um único recibo com data'
      : (passam === 0
        ? 'zero nas últimas ' + janelaH + ' h — o número é real, não é uma falha de medição'
        : null),
  };
}
