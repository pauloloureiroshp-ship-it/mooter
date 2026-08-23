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
 * Medido a 2026-08-23T16:23Z, com o ledger em 9858 linhas: 215 achados abertos
 * (P2 137 · P3 78) contra o tecto de fila humana EM VIGOR nesta maquina, que e
 * 50 (`preferences.json`) e nao os 6 do `DEFAULT_CAPS` — esses so valem para
 * quem nunca mexeu no ficheiro. Pausa com 50 tal como pausaria com 6.
 *
 * A data e o tamanho do ledger vao juntos de proposito: este numero MEXE a cada
 * ronda, e um numero que mexe sem dizer contra o que foi medido nao se consegue
 * reproduzir. (Este comentario ja disse 211/134/77 — era a leitura de quando o
 * ficheiro foi escrito, e ficou para tras quando o loop continuou a produzir.)
 *
 * Ou seja, o escalonador manda **parar de gerar** na primeira ronda. Isso NAO e
 * um defeito da ligacao — e a tese do proprio scheduler a funcionar: "a full
 * review queue PAUSES generation (17 loops × 3 = 51 would be the 'dump 50' the
 * thesis condemns)".
 *
 * O recurso escasso nao e a GPU: e a atencao do dono. Um loop que despeja ~3400
 * rondas/dia (medido no ledger: 3469 em 08-21 e 3290 em 08-22, os dois unicos
 * dias completos; o `context-pack.mjs:20` tinha 2950/dia em 08-18) numa fila que
 * ninguem consegue rever nao esta a produzir valor — esta a produzir divida.
 * Uma versao anterior deste comentario dizia 969 rondas/dia: nao havia fonte
 * para esse numero em lado nenhum do repo, e nao ha registo de como la foi
 * parar.
 *
 * HIT-RATE. O `measuredWins` conta `aceite` e `issue`, e o denominador exclui o
 * que o `agente` decidiu — nao por escolha minha, mas porque o `ab-report.mjs` e
 * o `autopilot.mjs` ja tinham decidido assim e um terceiro criterio so criaria
 * tres verdades. Um pilar que despeja lixo afunda-se sozinho, com Beta(1,1) a
 * dar 0.5 a quem ainda nao tem historico — nem premiado nem punido. E o mesmo
 * mecanismo que se aplicou A MAO aos nove pilares desligados; daqui em diante e
 * automatico e mede-se.
 *
 * O que este numero NAO e: o `scheduler.mjs:24-25` define `measuredWins` como
 * ganho medido e confirmado, "NOT mere approvals". Uma decisao de triagem e uma
 * aprovacao, nao uma medicao de efeito. Fica declarado aqui em vez de corrigido
 * em silencio, tal como o `impact: 0.5` — usar um proxy e legitimo; chamar-lhe
 * outra coisa nao e.
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
    // A CONTA NAO E MINHA — e a que este repo ja tinha decidido em dois sitios,
    // e eu contradizia os dois:
    //
    //   ab-report.mjs:118    `d === 'aceite' || d === 'issue'` -> vitoria
    //   autopilot.mjs:186    denominador = aceite+descartado+issue MENOS o que
    //                        o `agente` decidiu
    //
    // `issue` E vitoria: o dono achou o problema real e mandou-o para uma issue
    // em vez de aceitar o patch. Contar isso como derrota afundava o pilar por
    // ter acertado. Hoje ha 0 issues no registo, mas o botao existe no painel —
    // era uma bomba com temporizador, nao um caso teorico.
    //
    // Decisoes do `agente` saem do denominador INTEIRO. Um agente a julgar o
    // resultado do seu proprio pilar nao e prova de nada: e acreditar em quem se
    // devia estar a auditar. O comentario do autopilot conta como isso acabou —
    // "puseram o L2 a dizer you keep 0% of what it finds".
    //
    // As do `claude` FICAM. Foram refutacoes mecanicas derivadas da regra do
    // proprio pilar; sao a melhor prova que ha de que ele produziu ruido.
    if (d.por === 'agente') continue;
    l.measuredTotal += 1;
    if (d.decisao === 'aceite' || d.decisao === 'issue') l.measuredWins += 1;
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
