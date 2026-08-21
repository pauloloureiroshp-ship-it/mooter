/**
 * classes-da-fila.mjs — o que ESTA na fila de triagem, por classe, reconciliado.
 *
 * PORQUE EXISTE.
 *
 * A Onda 2a mandava "agrupar por assinatura de classe e fazer batch-patch da
 * maior classe LOW". Ninguem sabia quais eram as classes — nem sequer se
 * existiam. A primeira tentativa de agrupar (P4/docs) descobriu 62 achados
 * espalhados por 55 ficheiros: nao havia classe nenhuma para agrupar, e
 * 0 de 78 achados daquele pilar eram verdade.
 *
 * Este relatorio existe para que essa pergunta deixe de se responder por
 * intuicao. E deterministico: sem modelo, sem rede, $0. E RECONCILIA — a soma
 * das classes tem de bater com o numero de achados do ledger, senao imprime o
 * desvio em vez de o esconder.
 *
 * O QUE ELE JA MOSTROU (2026-08-21, 923 achados):
 *   · cada pilar produz essencialmente UMA classe (P5 287/288, P2 166/166,
 *     P4 76/76, P3 42/42, P7 3/3). "Classe" e, na pratica, "pilar" — um
 *     agrupador por classe seria um agrupador por pilar, e a 2a nao tinha
 *     material para existir;
 *   · tres pilares ACTIVOS (P8, P9, P10) correram 454 rondas cada e devolveram
 *     `sem-achado` em 100% delas — 1362 rondas de GPU, zero output e zero
 *     variacao. Um detector que so diz uma coisa nao esta a medir.
 *
 * Uso:  node tools/cockpit/runner/classes-da-fila.mjs [--com-p4]
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { refutarDeterminista, VEREDICTO } from './refutador.mjs';

/**
 * A assinatura de CLASSE de um achado: a FORMA do que ele afirma, sem os dados.
 *
 * Deriva-se do texto e nao do pilar de proposito — se um dia duas perguntas
 * diferentes produzirem a mesma forma de afirmacao, isto mostra-o. Hoje nao
 * produzem, e esse e o resultado.
 */
export function assinatura(recibo) {
  const t = String((recibo && recibo.resultado_resumo) || '');
  if (/^SAME SHAPE:/i.test(t)) return 'forma-repetida';
  if (/^THEY DIVERGE:/i.test(t)) return 'comentario-diverge-do-codigo';
  if (/^BROKEN:/i.test(t)) return 'texto-cortado';
  if (/^ACHADO:/i.test(t)) return 'defeito-narrado';
  if (/SEED VISIBLE|EXITS AT LINE/i.test(t)) return 'saida-precoce';
  if (/REPEATED:/i.test(t)) return 'linha-repetida';
  if (/^LINE \d+:/i.test(t)) return 'extraccao-de-linhas';
  return 'outra';
}

/** Le o ledger. Uma linha partida conta-se e reporta-se — nunca se engole. */
export function lerLedger(caminho, { readImpl = fs.readFileSync } = {}) {
  let bruto;
  try { bruto = readImpl(caminho, 'utf8'); } catch { return { recibos: [], partidas: 0, existe: false }; }
  const recibos = []; let partidas = 0;
  for (const linha of String(bruto).split(/\r?\n/)) {
    if (!linha.trim()) continue;
    try { recibos.push(JSON.parse(linha)); } catch { partidas += 1; }
  }
  return { recibos, partidas, existe: true };
}

/**
 * O relatorio. Devolve dados; quem imprime e o CLI.
 *
 * `desvio` e o coracao disto: se a soma das classes nao bater com os achados
 * contados, o numero aparece. Um relatorio que fecha sempre a conta e um
 * relatorio que nao esta a contar.
 */
export function relatorio(recibos, { repoRoot, semP4 = true } = {}) {
  const achados = recibos.filter((r) => r && !r.evento
    && r.conclusao === 'achado' && r.verdict === 'citacao-ok'
    && (!semP4 || r.pilar !== 'P4'));

  const porPilar = {};
  for (const r of recibos.filter((x) => x && !x.evento)) {
    const p = r.pilar || '?';
    const s = (porPilar[p] ||= { rondas: 0, achados: 0, semAchado: 0, refutadoPeloMotor: 0 });
    s.rondas += 1;
    if (r.conclusao === 'achado' && r.verdict === 'citacao-ok') s.achados += 1;
    if (r.verdict === 'sem-achado') s.semAchado += 1;
    if (r.verdict === 'refutado') s.refutadoPeloMotor += 1;
  }

  const porClasse = {};
  for (const r of achados) {
    const c = assinatura(r);
    const s = (porClasse[c] ||= { n: 0, refutado: 0, pilares: new Set() });
    s.n += 1;
    s.pilares.add(r.pilar || '?');
    if (repoRoot && refutarDeterminista(r, { repoRoot }).veredicto === VEREDICTO.REFUTADO) s.refutado += 1;
  }

  const soma = Object.values(porClasse).reduce((a, s) => a + s.n, 0);
  return {
    achados: achados.length,
    soma,
    desvio: soma - achados.length,
    porClasse,
    porPilar,
    // Um pilar que corre e nunca devolve nada e um facto que merece nome.
    mudos: Object.entries(porPilar)
      .filter(([, s]) => s.rondas >= 50 && s.achados === 0)
      .map(([p, s]) => ({ pilar: p, rondas: s.rondas, semAchado: s.semAchado })),
  };
}

function principal() {
  const semP4 = !process.argv.includes('--com-p4');
  const raiz = process.env.MOOTER_REPO || path.resolve(path.dirname(new URL(import.meta.url).pathname.slice(1)), '..', '..', '..');
  const { recibos, partidas, existe } = lerLedger(path.join(os.homedir(), '.mooter', 'runner-ledger.jsonl'));
  if (!existe) { console.log('sem ledger neste device — n/d'); return; }

  const r = relatorio(recibos, { repoRoot: raiz, semP4 });
  const pct = (a, b) => (b ? `${(100 * a / b).toFixed(1)}%` : 'n/d');

  console.log(`fila${semP4 ? ' (P4 excluido)' : ''}: ${r.achados} achados${partidas ? ` · ${partidas} linha(s) partida(s)` : ''}\n`);
  console.log('classe                          n   refutado pela camada 1   pilares');
  for (const [k, v] of Object.entries(r.porClasse).sort((a, b) => b[1].n - a[1].n)) {
    console.log(`${k.padEnd(30)}${String(v.n).padStart(4)}   ${String(v.refutado).padStart(4)} ${pct(v.refutado, v.n).padStart(7)}         ${[...v.pilares].sort().join(',')}`);
  }

  console.log('\npilar  rondas  achados    taxa');
  for (const p of Object.keys(r.porPilar).sort()) {
    const s = r.porPilar[p];
    console.log(`${p.padEnd(6)}${String(s.rondas).padStart(6)}${String(s.achados).padStart(9)}${pct(s.achados, s.rondas).padStart(8)}`);
  }

  if (r.mudos.length) {
    console.log('\n⚠️  PILARES MUDOS — correram e nunca devolveram um achado:');
    for (const m of r.mudos) console.log(`   ${m.pilar}: ${m.rondas} rondas, ${m.semAchado} sem-achado, 0 achados`);
  }

  console.log(`\nreconciliacao: soma das classes ${r.soma} · achados ${r.achados} · desvio ${r.desvio}`);
  if (r.desvio !== 0) {
    console.log('   ⚠️  DESVIO != 0 — ha achados que nenhuma classe apanhou.');
    process.exitCode = 1;
  }
}

if (process.argv[1] && process.argv[1].endsWith('classes-da-fila.mjs')) principal();
