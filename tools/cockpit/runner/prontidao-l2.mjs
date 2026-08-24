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
import { portoes, reservarParaODono, anomaliaDeDreno, AUDITORIA_1_EM, MIN_TRIADOS, MIN_PRECISAO_PCT } from './autopilot.mjs';

/**
 * De onde veio cada decisao, derivado do que esta escrito.
 *
 * Tres baldes, e nenhum se chama "do dono" por omissao:
 *  · `dono`             — assinado `dono`. O unico que conta para o portao 2.
 *  · `varredura-ensaio` — assinado `claude` com `instrumento-nao-discrimina`:
 *                         os voids em massa de pilares reprovados no ensaio.
 *  · `agente`/`outro`   — o autopilot e tudo o resto.
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
    // Chega o que ESTA reservado, ou vai ser preciso material novo? Isto sim e
    // uma pergunta que se responde com o que se tem.
    reserva_chega: reservados >= faltam,
    // Quantos achados novos seriam precisos, EM EXPECTATIVA.
    //
    // A versao anterior chamava a isto "aritmetica, nao previsao" e estava
    // errada — o adversario da FASE 3 provou-o: a selecao e por HASH das chaves
    // FUTURAS, e 160 chaves diferentes deram 7, 11 e 12 reservadas em vez das 8
    // que a formula prometia. O numero depende de coisas que ainda nao
    // existem, e um numero desses e uma expectativa, nao uma conta.
    //
    // Fica, porque uma ordem de grandeza e util. Mas fica com o nome certo, e
    // com os pressupostos escritos ao lado em vez de escondidos na formula.
    achados_novos_em_expectativa: reservados >= faltam ? 0 : (faltam - reservados) * AUDITORIA_1_EM,
    expectativa_pressupostos: [
      'a taxa 1-em-N e uniforme sobre as chaves futuras (e por hash, nao por contagem)',
      'os achados novos sao elegiveis (low com motivo, nao ja decididos)',
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
  try {
    for (const l of fs.readFileSync(ledger, 'utf8').split(/\r?\n/)) {
      if (!l.trim()) continue;
      try { receipts.push(JSON.parse(l)); } catch { partidasLedger += 1; }
    }
  } catch {
    console.log(`sem ledger em ${ledger} — n/d`);
    process.exitCode = 1;
    return;
  }
  const { decisoes, partidas } = lerTriagem(triagemFile);
  const r = prontidao({ receipts, decisoes });
  // ACHADOS UNICOS, nao eventos. O ledger repete a mesma chave (medido: 1695
  // eventos para 1667 chaves) e chamar "achados" aos eventos inflacionava o
  // numero mais visivel do relatorio em 28.
  const vistos = new Set();
  for (const rec of receipts) {
    if (!ehAchado(rec)) continue;
    const k = chaveDoRecibo(rec);
    if (k) vistos.add(k);
  }
  const achados = vistos.size;

  const pct = (x) => (x == null ? 'n/d' : `${x.toFixed(1)}%`);

  console.log(`\nPRONTIDAO DO NIVEL 2 — ${achados} achados unicos no ledger${partidasLedger ? ` · ${partidasLedger} linha(s) partida(s)` : ''}`);
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
  console.log(`  reservados para ele   ${String(r.reservados).padStart(6)}   (amostra 1-em-${AUDITORIA_1_EM} + o que o portao 2 exige)`);
  if (r.faltam === 0) {
    console.log('  ja ha volume que chegue — falta ele decidir');
  } else if (r.reserva_chega) {
    console.log(`  o que esta reservado CHEGA para os ${r.faltam} que faltam — nao e preciso material novo`);
  } else {
    // NAO se chama a isto aritmetica. A selecao e por hash de chaves que ainda
    // nao existem: 160 chaves diferentes deram 7, 11 e 12 reservadas em vez das
    // 8 que a formula promete. E uma ordem de grandeza, e diz-se que e.
    console.log(`  o que esta reservado nao chega: EM EXPECTATIVA, ~${r.achados_novos_em_expectativa} achados novos`);
    console.log('  ATENCAO: isto e uma expectativa, nao uma conta. Pressupoe:');
    for (const s of r.expectativa_pressupostos) console.log(`     · ${s}`);
  }

  if (r.dreno.anomalia) console.log(`\n⚠️  ANOMALIA DE DRENO: ${r.dreno.porque}`);

  console.log('\nO QUE ISTO NAO DIZ');
  console.log('  Nao promete que o portao vai abrir, nem quando. A taxa de chegada');
  console.log('  depende dos pilares; a taxa de decisao depende do dono. Uma data');
  console.log('  estimada seria a unica mentira que este relatorio podia contar.\n');
}

if (process.argv[1] && process.argv[1].endsWith('prontidao-l2.mjs')) principal();
