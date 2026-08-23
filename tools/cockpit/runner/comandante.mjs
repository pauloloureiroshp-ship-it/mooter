/**
 * comandante.mjs — liga o Fleet Commander ao loop, que estava a produzir a direito.
 *
 * O `packages/fleet-commander/src/scheduler.mjs` existe desde a wave da frota e
 * NINGUEM o importava. Este ficheiro e a unica peca que faltava: traduz o estado
 * real (ledger + triagem + pilares activos) para a forma que o `pickNext` espera,
 * e devolve a decisao. Zero logica de escalonamento aqui — quem decide e ele.
 *
 * O QUE MUDA NO LOOP, e porque nao e cosmetico:
 *
 *   antes  `const pillar = focus || nextPillar(i, ids)`  — round-robin cego
 *   agora  o comandante pode dizer PAUSA, e o loop obedece
 *
 * Medido a 2026-08-23, no momento de ligar: 211 achados abertos (P2 134 · P3 77)
 * contra um tecto de fila humana de 6. Ou seja, o escalonador manda **parar de
 * gerar** na primeira ronda. Isso NAO e um defeito da ligacao — e a tese do
 * proprio scheduler a funcionar: "a full review queue PAUSES generation
 * (17 loops × 3 = 51 would be the 'dump 50' the thesis condemns)".
 *
 * O recurso escasso nao e a GPU: e a atencao do dono. Um loop que despeja 969
 * rondas/dia numa fila que ninguem consegue rever nao esta a produzir valor —
 * esta a produzir divida.
 *
 * HIT-RATE COM PROVA. O `measuredWins` conta so achados ACEITES pelo dono, nunca
 * descartes nem "aprovacoes" tacitas. Um pilar que despeja lixo afunda-se
 * sozinho pelo hit-rate, com Beta(1,1) a dar 0.5 a quem ainda nao tem historico
 * — nem premiado nem punido. E o mesmo mecanismo que hoje se aplicou A MAO aos
 * nove pilares desligados; a partir daqui e automatico e mede-se.
 */

import { pickNext, DEFAULT_CAPS } from '../../../packages/fleet-commander/src/scheduler.mjs';
import { ehAchado, chaveDoRecibo } from './triagem.mjs';

export { DEFAULT_CAPS };

/**
 * Traduz ledger + decisoes para os `loops` que o scheduler entende.
 *
 * `impact` fica em 0.5 para todos de proposito: nao ha medicao de impacto por
 * pilar, e inventar um numero aqui seria exactamente o que este repo proibe.
 * Quando existir, entra; ate la o ranking e staleness × hit-rate, que sao ambos
 * medidos.
 */
export function estatisticasDosLoops(registos, decisoes, ids, { agora = Date.now() } = {}) {
  const porPilar = new Map(ids.map((id) => [id, {
    id, state: 'ready', openProposals: 0, lastRunAt: 0,
    impact: 0.5, measuredWins: 0, measuredTotal: 0,
  }]));
  const vistos = new Set();

  for (const r of registos || []) {
    const l = porPilar.get(r && r.pilar);
    if (!l) continue;

    // `lastRunAt` conta QUALQUER ronda, com ou sem achado — o pilar correu.
    const t = Date.parse(r.ts || '');
    if (Number.isFinite(t) && t > l.lastRunAt) l.lastRunAt = t;

    if (!ehAchado(r)) continue;
    const chave = chaveDoRecibo(r);
    if (!chave || vistos.has(chave)) continue;
    vistos.add(chave);

    const d = decisoes && decisoes.get(chave);
    if (!d) { l.openProposals += 1; continue; }
    // So `aceite` conta como vitoria. Um descarte nao e sinal contrario ao
    // acaso: e sinal de que o pilar produziu ruido, e e assim que ele afunda.
    l.measuredTotal += 1;
    if (d.decisao === 'aceite') l.measuredWins += 1;
  }
  return [...porPilar.values()];
}

/** Quantos achados esperam decisao, em toda a fila — o tecto e sobre este numero. */
export function filaHumana(loops) {
  return (loops || []).reduce((a, l) => a + (l.openProposals || 0), 0);
}

/**
 * A decisao da ronda. Devolve `{ pilar, razao, pausa, ranked, fila }`.
 *
 * `pilar: null` com `pausa: true` quer dizer que o loop NAO deve correr — e a
 * razao vem do scheduler, em texto, para ir para o log e para o painel. Um loop
 * que pausa sem dizer porque e indistinguivel de um loop morto, e foi assim que
 * o acumulador morreu 63 sessoes.
 */
export function decidir({ registos, decisoes, ids, agora = Date.now(), gpu = null, caps = DEFAULT_CAPS }) {
  const loops = estatisticasDosLoops(registos, decisoes, ids, { agora });
  const fila = filaHumana(loops);
  const r = pickNext(loops, { now: agora, gpu, humanQueueSize: fila, caps });
  return {
    pilar: r.pick ? r.pick.id : null,
    pausa: !r.pick,
    razao: r.reason,
    prioridade: r.priority ?? null,
    ranked: r.ranked ?? null,
    fila,
    loops,
  };
}
