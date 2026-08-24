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

import { lerTriagem, contarTriagem, porTriar, ehAchado } from './triagem.mjs';
import { portoes, naAmostraDeAuditoria, anomaliaDeDreno, AUDITORIA_1_EM, MIN_TRIADOS, MIN_PRECISAO_PCT } from './autopilot.mjs';

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
  const b = { dono: 0, varredura_ensaio: 0, agente: 0, outro: 0, sem_assinatura: 0 };
  for (const d of (decisoes || new Map()).values()) {
    if (!d) continue;
    const por = d.por;
    if (!por) { b.sem_assinatura += 1; continue; }
    if (por === 'dono') { b.dono += 1; continue; }
    if (por === 'agente') { b.agente += 1; continue; }
    if (por === 'claude' && d.motivo === 'instrumento-nao-discrimina') { b.varredura_ensaio += 1; continue; }
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
  // para ele decidir sem ter de ir procurar.
  const fila = porTriar(receipts, decisoes, Number.MAX_SAFE_INTEGER);
  const reservados = fila.filter((a) => naAmostraDeAuditoria(a && a.chave)).length;

  return {
    proveniencia: proveniencia(decisoes),
    triados_pelo_dono: triados,
    mantidos,
    precisao,
    alvo_triados: MIN_TRIADOS,
    alvo_precisao: MIN_PRECISAO_PCT,
    faltam: Math.max(0, MIN_TRIADOS - triados),
    fila: fila.length,
    reservados,
    // Quantos achados NOVOS teriam de chegar para a amostra sozinha dar o que
    // falta. Aritmetica, nao previsao: nao diz QUANDO chegam.
    achados_novos_necessarios: reservados >= MIN_TRIADOS - triados
      ? 0
      : (MIN_TRIADOS - triados - reservados) * AUDITORIA_1_EM,
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
  const achados = receipts.filter(ehAchado).length;

  const pct = (x) => (x == null ? 'n/d' : `${x.toFixed(1)}%`);

  console.log(`\nPRONTIDAO DO NIVEL 2 — ${achados} achados no ledger${partidasLedger ? ` · ${partidasLedger} linha(s) partida(s)` : ''}`);
  console.log(`${'─'.repeat(64)}\n`);

  console.log('DE QUEM SAO AS DECISOES QUE EXISTEM');
  const p = r.proveniencia;
  const total = Object.values(p).reduce((a, b) => a + b, 0) || 1;
  const linha = (rot, n, nota) => console.log(
    `  ${rot.padEnd(22)}${String(n).padStart(6)}  ${`${((100 * n) / total).toFixed(1)}%`.padStart(6)}${nota ? `   ${nota}` : ''}`,
  );
  linha('do dono', p.dono, '<- o unico que abre o portao 2');
  linha('varredura-ensaio', p.varredura_ensaio, 'voids em massa de pilares reprovados');
  linha('autopilot (agente)', p.agente, '');
  linha('outro', p.outro, '');
  if (p.sem_assinatura) linha('SEM assinatura', p.sem_assinatura, '<- nao contam como do dono');
  if (partidas) console.log(`  ${partidas} linha(s) de triagem ilegiveis — contadas, nao engolidas`);

  console.log('\nO QUE O PORTAO 2 EXIGE');
  console.log(`  decisoes do dono      ${String(r.triados_pelo_dono).padStart(6)} de ${r.alvo_triados}${r.faltam ? `   faltam ${r.faltam}` : '   ✓'}`);
  console.log(`  mantidas por ele      ${pct(r.precisao).padStart(6)} de ${r.alvo_precisao}%${r.precisao == null ? '   <- n/d, NAO 0%: ele ainda nao decidiu nada' : ''}`);
  console.log(`  portao                ${r.portao.aberto ? 'ABERTO' : 'fechado'}`);
  if (!r.portao.aberto) console.log(`     porque: ${r.portao.porque_fechado}`);

  console.log('\nDE ONDE VAO SAIR AS DECISOES DELE');
  console.log(`  na fila agora         ${String(r.fila).padStart(6)}`);
  console.log(`  reservados para ele   ${String(r.reservados).padStart(6)}   (1 em ${AUDITORIA_1_EM}, amostra de auditoria)`);
  if (r.faltam === 0) {
    console.log('  ja ha volume que chegue — falta ele decidir');
  } else if (r.reservados >= r.faltam) {
    console.log(`  a amostra que ja existe CHEGA para os ${r.faltam} que faltam`);
  } else {
    console.log(`  a amostra nao chega: faltariam ~${r.achados_novos_necessarios} achados NOVOS para a completar`);
    console.log('  (aritmetica, nao previsao — nao diz quando chegam)');
  }

  if (r.dreno.anomalia) console.log(`\n⚠️  ANOMALIA DE DRENO: ${r.dreno.porque}`);

  console.log('\nO QUE ISTO NAO DIZ');
  console.log('  Nao promete que o portao vai abrir, nem quando. A taxa de chegada');
  console.log('  depende dos pilares; a taxa de decisao depende do dono. Uma data');
  console.log('  estimada seria a unica mentira que este relatorio podia contar.\n');
}

if (process.argv[1] && process.argv[1].endsWith('prontidao-l2.mjs')) principal();
