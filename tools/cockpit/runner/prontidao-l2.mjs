/**
 * prontidao-l2.mjs — a que distancia esta o nivel 2 de abrir, e porque.
 *
 * PORQUE EXISTE.
 *
 * O portao 2 exige 20 decisoes DO DONO com pelo menos 70% mantidas. Ate
 * 2026-08-24 o painel dizia-lhe que ele mantinha 0% do que o loop encontra —
 * sobre 1448 decisoes que nao eram dele, escritas por tres scripts. O numero
 * estava errado e a causa era invisivel: o denominador somava tudo e subtraia
 * uma unica assinatura.
 *
 * A FASE 1 corrigiu a conta. Isto responde a pergunta que fica depois dela, e
 * que a conta sozinha nao responde: **entao e agora, o que e que falta?**
 *
 * O QUE ISTO NAO FAZ. Nao promete que o nivel 2 vai abrir, nao estima quando, e
 * nao converte ausencia de dados em zero. Sem decisoes do dono a resposta e
 * `n/d` — nao `0%`. A diferenca entre "nao mantens nada" e "ainda nao decidiste
 * nada" e a diferenca entre acusar e informar.
 *
 * PROVENIENCIA, E PORQUE E DERIVADA. As 1448 decisoes `claude` ficam onde
 * estao. O `triagem.jsonl` e append-only e uma decisao errada reverte-se com
 * outra decisao, nunca reescrevendo o passado — reclassificar 1448 linhas no
 * disco seria exactamente o gesto que este projecto se recusa a fazer. A
 * proveniencia calcula-se na leitura, a partir do que ja esta escrito.
 *
 * E porque e que elas nao servem de material de calibracao, ja agora: o ensaio
 * do defeito semeado reprovou PILARES; o script anulou ACHADOS. Um pilar
 * reprovado pode ter tido verdadeiros positivos, e inferir o achado a partir do
 * pilar e falacia ecologica. Sao rotulos de varredura, nao juizos sobre codigo.
 *
 * Uso:  node tools/cockpit/runner/prontidao-l2.mjs
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { lerTriagem, contarTriagem, porTriar, ehAchado, chaveDoRecibo } from './triagem.mjs';
import { portoes, reservarParaODono, degrauDaReserva, naAmostraDeAuditoria, anomaliaDeDreno, AUDITORIA_1_EM, MIN_TRIADOS, MIN_PRECISAO_PCT } from './autopilot.mjs';

/**
 * De onde veio cada decisao, derivado do que esta escrito.
 *
 * SEIS baldes, e nenhum se chama "do dono" por omissao:
 *  · `dono`             — assinado `dono`. O unico que conta para o portao 2.
 *  · `varredura-ensaio` — `claude` + DESCARTE + `instrumento-nao-discrimina`:
 *                         os voids em massa de pilares reprovados no ensaio.
 *  · `filtro-mecanico`  — `claude` + DESCARTE + `nao-e-um-problema`: os
 *                         verificadores deterministas.
 *  · `agente`           — o autopilot.
 *  · `outro`            — o que nao se sabe classificar, VISIVEL e nao escondido.
 *  · `sem-assinatura`   — linhas sem `por`. Nunca promovidas a dono.
 */
export function proveniencia(decisoes) {
  const b = { dono: 0, varredura_ensaio: 0, filtro_mecanico: 0, agente: 0, outro: 0, sem_assinatura: 0 };
  for (const d of (decisoes || new Map()).values()) {
    if (!d) continue;
    const por = d.por;
    if (!por) { b.sem_assinatura += 1; continue; }
    if (por === 'dono') { b.dono += 1; continue; }
    if (por === 'agente') { b.agente += 1; continue; }
    if (por === 'claude') {
      // O `decisao` conta, e nao contava. O adversario da FASE 3 passou um
      // `aceite` e um `issue` com este motivo e os dois sairam rotulados
      // "voids em massa" — um aceite NAO e um void, e chamar-lhe isso e
      // exactamente o genero de arredondamento que este ficheiro existe para
      // nao fazer.
      if (d.decisao === 'descartado' && d.motivo === 'instrumento-nao-discrimina') { b.varredura_ensaio += 1; continue; }
      // As 325 `nao-e-um-problema` do `claude` sao dos filtros mecanicos
      // (`fora-do-enunciado`, `refutado-pela-fonte`), nao de uma varredura em
      // massa. Tinham caido em `outro`, que assim era um balde-caixote: o
      // maior grupo do ledger a seguir a varredura vivia numa gaveta chamada
      // "resto".
      if (d.decisao === 'descartado' && d.motivo === 'nao-e-um-problema') { b.filtro_mecanico += 1; continue; }
    }
    b.outro += 1;
  }
  return b;
}

/**
 * O estado do portao 2, em numeros que nao se inventam.
 *
 * `precisao` e `null` — nunca 0 — quando o dono ainda nao decidiu nada, e
 * `faltam` conta so o que falta em VOLUME. Nao ha previsao de data aqui: a
 * taxa de chegada depende dos pilares e do dono, e uma data estimada seria a
 * unica mentira que este ficheiro podia contar.
 */
export function prontidao({ receipts = [], decisoes = new Map() } = {}) {
  const contas = contarTriagem(receipts, decisoes);
  const p2 = portoes({
    recibos: {
      total: receipts.length,
      refutado: receipts.filter((r) => r && r.verdict === 'refutado').length,
    },
    triagem: contas,
  })[1];

  const doDono = contas.do_dono;
  const triados = doDono.aceite + doDono.descartado + doDono.issue;
  const mantidos = doDono.aceite + doDono.issue;
  const precisao = triados ? (mantidos / triados) * 100 : null;

  // Quantos achados estao reservados para ele AGORA — o material que existe
  // para ele decidir sem ter de ir procurar. A reserva olha para o alvo desde
  // a FASE 2, por isso este numero ja conta o complemento, nao so a amostra.
  const fila = porTriar(receipts, decisoes, Number.MAX_SAFE_INTEGER);
  const reservados = reservarParaODono(fila, { jaDoDono: triados }).size;
  const reservadosPorAmostra = fila.filter((a) => naAmostraDeAuditoria(a && a.chave)).length;
  const faltam = Math.max(0, MIN_TRIADOS - triados);

  return {
    proveniencia: proveniencia(decisoes),
    triados_pelo_dono: triados,
    mantidos,
    precisao,
    alvo_triados: MIN_TRIADOS,
    alvo_precisao: MIN_PRECISAO_PCT,
    faltam,
    fila: fila.length,
    reservados,
    reservados_por_amostra: reservadosPorAmostra,
    reservados_extra: Math.max(0, reservados - reservadosPorAmostra),
    degrau_da_reserva: degrauDaReserva(fila, { jaDoDono: triados }),
    // Chega o que ESTA reservado, ou vai ser preciso material novo? Isto sim e
    // uma pergunta que se responde com o que se tem.
    reserva_chega: reservados >= faltam,
    // Quantos achados novos seriam precisos.
    //
    // DUAS CORRECCOES, ambas do adversario, e a segunda e minha vergonha.
    //
    // 1.a ronda: eu chamava a isto "aritmetica, nao previsao". Era falso — a
    //    seleccao e por hash de chaves FUTURAS, e 160 chaves com prefixos
    //    diferentes deram 7, 11 e 12 reservadas em vez das 8 da formula.
    // 2.a ronda: eu mudei o ROTULO para "expectativa" e deixei a FORMULA
    //    intacta. Continuava a multiplicar por `AUDITORIA_1_EM`, quando desde a
    //    FASE 2 a `reservarParaODono` COMPLEMENTA deterministicamente ate ao
    //    alvo — o factor 1-em-N deixou de governar este caso. Media
    //    `5 achados -> 300` quando bastavam 15. Renomear nao corrige nada.
    //
    // Cada achado novo elegivel e reservavel pelo complemento, portanto o que
    // falta e a diferenca, e mais nada.
    achados_novos_necessarios: Math.max(0, faltam - reservados),
    achados_novos_pressupostos: [
      'os achados novos sao elegiveis (low com motivo tipado, ainda nao decididos)',
      'a reserva continua a complementar ate ao alvo (reservarParaODono)',
      'a fila nao encolhe por outra via entretanto',
    ],
    portao: { aberto: p2.aberto, medido: p2.medido, base: p2.base, porque_fechado: p2.porque_fechado },
    dreno: anomaliaDeDreno([...(decisoes || new Map()).values()].filter((d) => d && d.por === 'agente')),
  };
}

function principal() {
  const base = process.env.MOOTER_HOME || path.join(os.homedir(), '.mooter');
  const ledger = path.join(base, 'runner-ledger.jsonl');
  const triagemFile = path.join(base, 'triagem.jsonl');

  let receipts = [];
  let partidasLedger = 0;
  let linhasLedger = 0;
  try {
    for (const l of fs.readFileSync(ledger, 'utf8').split(/\r?\n/)) {
      if (!l.trim()) continue;
      linhasLedger += 1;
      try { receipts.push(JSON.parse(l)); } catch { partidasLedger += 1; }
    }
  } catch {
    console.log(`sem ledger em ${ledger} — n/d`);
    process.exitCode = 1;
    return;
  }
  // CORRUPCAO NAO E ZERO. Um ledger com linhas e nenhuma legivel dava
  // `exit=0 · 0 achados unicos` — um zero com autoridade, indistinguivel de um
  // device que ainda nao correu. "Nao consegui ler" e uma resposta diferente
  // de "nao ha nada", e este relatorio existe para nao as confundir.
  if (linhasLedger > 0 && receipts.length === 0) {
    console.log(`\nledger ILEGIVEL: ${linhasLedger} linha(s), 0 legiveis — n/d`);
    console.log('Isto NAO e "zero achados": e nao ter conseguido ler nenhum.\n');
    process.exitCode = 1;
    return;
  }
  const { decisoes, partidas } = lerTriagem(triagemFile);
  const r = prontidao({ receipts, decisoes });
  // ACHADOS UNICOS, nao eventos. O ledger repete a mesma chave (medido: 1695
  // eventos para 1667 chaves) e chamar "achados" aos eventos inflacionava o
  // numero mais visivel do relatorio em 28.
  const vistos = new Set();
  let semIdentidade = 0;
  for (const rec of receipts) {
    if (!ehAchado(rec)) continue;
    const k = chaveDoRecibo(rec);
    // Um achado sem chave nao se pode contar NEM desaparecer. Antes era
    // ignorado em silencio: dois achados sem identidade davam `0 achados
    // unicos`, que se le como "nao ha nada" quando a verdade e "ha e nao os
    // consigo identificar".
    if (k) vistos.add(k); else semIdentidade += 1;
  }
  const achados = vistos.size;

  const pct = (x) => (x == null ? 'n/d' : `${x.toFixed(1)}%`);

  console.log(`\nPRONTIDAO DO NIVEL 2 — ${achados} achados unicos no ledger${partidasLedger ? ` · ${partidasLedger} linha(s) partida(s)` : ''}${semIdentidade ? ` · ${semIdentidade} SEM identidade (nao contados, nao ignorados)` : ''}`);
  console.log(`${'─'.repeat(64)}\n`);

  console.log('DE QUEM SAO AS DECISOES QUE EXISTEM');
  const p = r.proveniencia;
  const total = Object.values(p).reduce((a, b) => a + b, 0);
  // Denominador zero nao vira 1. Forcar `|| 1` imprimia `0.0%` em todas as
  // linhas de um ledger vazio — percentagens de uma divisao que nao existe.
  const linha = (rot, n, nota) => console.log(
    `  ${rot.padEnd(22)}${String(n).padStart(6)}  ${(total ? `${((100 * n) / total).toFixed(1)}%` : 'n/d').padStart(6)}${nota ? `   ${nota}` : ''}`,
  );
  if (!total) {
    console.log('  nenhuma decisao no registo — n/d\n');
  } else {
    linha('do dono', p.dono, '<- o unico que abre o portao 2');
    linha('varredura-ensaio', p.varredura_ensaio, 'descartes em massa de pilares reprovados');
    linha('filtro-mecanico', p.filtro_mecanico, 'descartes dos verificadores deterministas');
    linha('autopilot (agente)', p.agente, '');
    if (p.outro) linha('outro', p.outro, '<- nao classificado: ver o ledger');
    if (p.sem_assinatura) linha('SEM assinatura', p.sem_assinatura, '<- nao contam como do dono');
  }
  if (partidas) console.log(`  ${partidas} linha(s) de triagem ilegiveis — contadas, nao engolidas`);
  if (partidas && !total) console.log('  ATENCAO: o registo tem linhas e NENHUMA legivel — isto e n/d, nao zero.');

  console.log('\nO QUE O PORTAO 2 EXIGE');
  console.log(`  decisoes do dono      ${String(r.triados_pelo_dono).padStart(6)} de ${r.alvo_triados}${r.faltam ? `   faltam ${r.faltam}` : '   ✓'}`);
  // "nao ha decisoes CORRENTES dele" e nao "ele nunca decidiu": a ultima
  // decisao por chave e a que vale, portanto ele pode ter decidido e um agente
  // ter sobreposto depois. Dizer-lhe que nunca decidiu nada seria falso, e ele
  // sabe que e falso — o que e pior do que ser impreciso.
  console.log(`  mantidas por ele      ${pct(r.precisao).padStart(6)} de ${r.alvo_precisao}%${r.precisao == null ? '   <- n/d, NAO 0%: nao ha decisoes correntes assinadas por ele' : ''}`);
  console.log(`  portao                ${r.portao.aberto ? 'ABERTO' : 'fechado'}`);
  if (!r.portao.aberto) console.log(`     porque: ${r.portao.porque_fechado}`);

  console.log('\nDE ONDE VAO SAIR AS DECISOES DELE');
  console.log(`  na fila agora         ${String(r.fila).padStart(6)}`);
  // O servidor ja separava as duas parcelas no log ("12 por amostra + 8 para o
  // portao") e este relatorio nao. Duas superficies a dizer a mesma coisa de
  // maneiras diferentes e como ter duas contagens: uma delas esta a mentir.
  console.log(`  reservados para ele   ${String(r.reservados).padStart(6)}   (${r.reservados_por_amostra} por amostra 1-em-${AUDITORIA_1_EM}`
    + `${r.reservados_extra > 0 ? ` + ${r.reservados_extra} para o portao 2 poder abrir, degrau 1-em-${r.degrau_da_reserva}` : ''})`);
  if (r.faltam === 0) {
    console.log('  ja ha volume que chegue — falta ele decidir');
  } else if (r.reserva_chega) {
    console.log(`  o que esta reservado CHEGA para os ${r.faltam} que faltam — nao e preciso material novo`);
  } else {
    console.log(`  o que esta reservado nao chega: faltam ${r.achados_novos_necessarios} achados novos`);
    console.log('  (a reserva complementa ate ao alvo, por isso e a diferenca — pressupoe:)');
    for (const s of r.achados_novos_pressupostos) console.log(`     · ${s}`);
  }

  if (r.dreno.anomalia) console.log(`\n⚠️  ANOMALIA DE DRENO: ${r.dreno.porque}`);

  console.log('\nO QUE ISTO NAO DIZ');
  console.log('  Nao promete que o portao vai abrir, nem quando. A taxa de chegada');
  console.log('  depende dos pilares; a taxa de decisao depende do dono. Uma data');
  console.log('  estimada seria a unica mentira que este relatorio podia contar.\n');
}

if (process.argv[1] && process.argv[1].endsWith('prontidao-l2.mjs')) principal();
