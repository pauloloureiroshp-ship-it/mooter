/**
 * voidar-fila.mjs — anular os achados de pilares que reprovaram o ensaio.
 *
 * O QUE ISTO NAO E: nao e dizer que os achados sao falsos. Nao os li um a um, e
 * afirma-lo seria inventar ao contrario. E dizer que **nao tem valor
 * probatorio** — o instrumento que os emitiu foi medido e nao discrimina:
 * responde o mesmo perante codigo com defeito e codigo limpo (metodo do defeito
 * semeado, `prova-de-pilar.mjs`). Um achado desses nao prova nada sobre o codigo;
 * prova alguma coisa sobre o pilar, e isso ja esta registado no commit que o
 * desligou.
 *
 * PORQUE E FERRAMENTA E NAO UM SCRIPT DE UMA VEZ: isto repete-se. Cada vez que um
 * pilar reprovar e for desligado, a fila dele fica para tras. Um one-shot invisivel
 * teria de ser reinventado — e reinventado sem o `--dry-run`, que e a parte que
 * importa quando se escrevem 1114 decisoes no ledger de outra pessoa.
 *
 * A FONTE DA VERDADE sobre quem esta activo e o `PILLAR_IDS` do `context-pack.mjs`,
 * nao uma lista escrita aqui. Uma segunda lista era uma segunda oportunidade de
 * divergir — a licao do #328, e a do piso de Node.
 *
 * Append-only: escreve por `registarTriagem`, nunca toca no `runner-ledger.jsonl`.
 * Uma decisao errada reverte-se com outra decisao, nao com um apagar.
 *
 * Uso:
 *   node tools/cockpit/runner/voidar-fila.mjs            # ensaio, nao escreve
 *   node tools/cockpit/runner/voidar-fila.mjs --aplicar   # escreve
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { ehAchado, chaveDoRecibo, lerTriagem, registarVarias } from './triagem.mjs';
import { PILLAR_IDS } from './context-pack.mjs';

export const MOTIVO = 'instrumento-nao-discrimina';

/** Le um .jsonl tolerando linhas partidas — mas contando-as. */
export function lerJsonl(caminho, { readImpl = fs.readFileSync } = {}) {
  let bruto = '';
  try { bruto = String(readImpl(caminho, 'utf8')); } catch { return { registos: [], partidas: 0 }; }
  const registos = []; let partidas = 0;
  for (const linha of bruto.split('\n')) {
    if (!linha.trim()) continue;
    try { registos.push(JSON.parse(linha)); } catch { partidas += 1; }
  }
  return { registos, partidas };
}

/**
 * Que achados devem ser anulados, e quais ficam.
 *
 * Fica de fora quem ja tem decisao: uma triagem do dono NAO se sobrepoe. Se ele
 * ja olhou para um achado, a opiniao dele ganha a minha inferencia sobre o pilar.
 */
export function planear(registos, { activos = PILLAR_IDS, decisoes = new Map() } = {}) {
  const anular = []; const ficam = []; const jaDecididos = [];
  const vistos = new Set();
  const act = new Set(activos);
  for (const r of registos) {
    if (!ehAchado(r)) continue;
    const chave = chaveDoRecibo(r);
    if (!chave || vistos.has(chave)) continue;
    vistos.add(chave);
    if (decisoes.has(chave)) { jaDecididos.push({ chave, pilar: r.pilar }); continue; }
    if (act.has(r.pilar)) ficam.push({ chave, pilar: r.pilar });
    else anular.push({ chave, pilar: r.pilar, ficheiro: r.ficheiro ?? null, ts: r.ts ?? null });
  }
  return { anular, ficam, jaDecididos };
}

const contarPorPilar = (xs) => xs.reduce((a, x) => ({ ...a, [x.pilar]: (a[x.pilar] || 0) + 1 }), {});

function principal() {
  const aplicar = process.argv.includes('--aplicar');
  const base = process.env.MOOTER_HOME || path.join(os.homedir(), '.mooter');
  const ledger = path.join(base, 'runner-ledger.jsonl');
  const triagemFile = path.join(base, 'triagem.jsonl');

  const { registos, partidas } = lerJsonl(ledger);
  if (!registos.length) { console.log(`sem ledger legivel em ${ledger} — n/d`); process.exitCode = 1; return; }
  if (partidas) console.log(`⚠️  ${partidas} linha(s) do ledger ilegiveis — contadas, nao engolidas\n`);

  const decisoes = lerTriagem(triagemFile).decisoes ?? new Map();
  const { anular, ficam, jaDecididos } = planear(registos, { decisoes });

  console.log(`pilares ACTIVOS (fonte: context-pack): ${PILLAR_IDS.join(', ')}\n`);
  console.log(`  a anular  ${String(anular.length).padStart(5)}   ${JSON.stringify(contarPorPilar(anular))}`);
  console.log(`  ficam     ${String(ficam.length).padStart(5)}   ${JSON.stringify(contarPorPilar(ficam))}  <- fila real do dono`);
  console.log(`  ja decididos ${String(jaDecididos.length).padStart(2)}   (nao se sobrepoe a decisao de ninguem)`);

  if (!aplicar) {
    console.log(`\nENSAIO — nada escrito. Para aplicar: --aplicar`);
    return;
  }

  const ts = registos[registos.length - 1]?.ts || null;
  // Uma colisao a meio fazia "apliquei a varredura" ser indistinguivel de
  // "escrevi ate a primeira decisao do dono". O lote tenta todas as chaves e
  // separa recusas esperadas de erros reais; sem essas contagens, a fila podia
  // ficar parcialmente anulada com uma mensagem de sucesso inteira.
  const r = registarVarias(triagemFile, anular.map((a) => ({
      chave: a.chave,
      decisao: 'descartado',
      motivo: MOTIVO,
      por: 'claude',
      nota: `pilar ${a.pilar} reprovou o ensaio do defeito semeado e foi desligado; o achado nao foi lido nem julgado`,
      ...(ts ? { ts } : {}),
    })));
  if (r.recusadas.length) console.log(`  ${r.recusadas.length} nao escritas — o dono ja decidiu essas chaves`);
  if (r.erros.length) {
    console.log(`  ${r.erros.length} falharam por outra razao: ${r.erros[0].porque.slice(0, 160)}`);
    process.exitCode = 1;
  }
  console.log(`\n${r.escritas.length} decisoes escritas em ${triagemFile} (append-only, por=claude)`);
}

if (process.argv[1] && process.argv[1].endsWith('voidar-fila.mjs')) principal();
