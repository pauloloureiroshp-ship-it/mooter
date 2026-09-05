#!/usr/bin/env node
/**
 * r24-ensaio.mjs — o ensaio geral do R-24, sem chamar o modelo.
 *
 * Uso: node tools/ab/r24-ensaio.mjs [--so N]
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * PORQUE EXISTE
 *
 * A 2026-09-05, com todo o aparato construído, testado e congelado, havia uma
 * coisa que ninguém tinha feito: **correr o laço completo**. O `--controlo` e
 * o `--verificar` exercitam a preparação do snapshot e mais nada. O caminho
 * braço → aceitação → linha de ledger → análise nunca tinha executado contra
 * uma tarefa real. Setenta e sete testes unitários provam as peças; nenhum
 * prova a montagem.
 *
 * Um defeito nesse caminho descobre-se à hora 12 de 23, com metade do ledger
 * escrito e a outra metade por escrever.
 *
 * Este ficheiro troca **só** o agente por um duplo determinístico e corre tudo
 * o resto a sério: snapshots do commit-pai, definições por braço, teste do
 * commit-filho reinstalado, aceitação, TVA, ledger, retoma e análise.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * O QUE ISTO NÃO É
 *
 * **Não é a experiência, e não pode ser confundido com ela.** Três barreiras,
 * porque uma só seria uma promessa:
 *
 *   1. Escreve noutro ficheiro: `_handoff/r24/ensaio.jsonl`, nunca o ledger.
 *   2. Cada linha leva `tipo: 'ensaio'`. O `desta()` do executor só aceita
 *      `tipo === 'braco'`, portanto uma linha de ensaio **não consegue** entrar
 *      na análise a sério nem que alguém copie o ficheiro por cima.
 *   3. Não produz veredicto. O resultado esperado é conhecido de antemão —
 *      23 de 23 — porque o duplo do braço ON aplica a solução e o do OFF não
 *      faz nada. Um ensaio cujo resultado se sabia antes não mede nada sobre
 *      o Mooter; mede o aparelho.
 *
 * O que ele responde é uma pergunta só: **quando o agente devolver trabalho
 * bom, o aparelho reconhece-o? E quando não devolver, marca-o como falha?**
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { correrUmBraco, primarias, primeiroDe, ordemDosBracos, prepararRouterPinado, prepararCacheNodeModules, lerLedgerCru } from './correr-r24.mjs';
import { zDaTarefa, escreverLedger } from './mooter-use-ab.mjs';
import { MARCA } from './r24-exposicao.mjs';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(AQUI, '..', '..');

/**
 * O duplo do agente.
 *
 * ON  → escreve os ficheiros do commit-filho (menos o teste, que o executor
 *       reinstala de qualquer maneira) e deixa a marca da exposição, como o
 *       hook faria. É o agente perfeito: resolve a tarefa.
 * OFF → não faz nada. É o agente que desiste.
 *
 * Devolve sempre um envelope VÁLIDO, para o ensaio exercitar o caminho feliz
 * do `validarCorrida`. Os caminhos infelizes já têm 38 defeitos plantados a
 * prová-los; o que faltava era o caminho que funciona.
 */
function duploDoAgente({ tarefa, braco, destino, spawnBase = spawnSync }) {
  return (cmd, args, opts) => {
    if (cmd !== 'claude' && !String(cmd).endsWith('claude.exe')) return spawnBase(cmd, args, opts);

    const t0 = Date.now();
    if (braco === 'ON') {
      for (const ficheiro of tarefa.files_changed) {
        if (ficheiro === tarefa.test_file) continue;
        const r = spawnBase('git', ['show', `${tarefa.commit}:${ficheiro}`], { cwd: REPO, encoding: 'buffer', maxBuffer: 64 * 1024 * 1024 });
        if (r.status !== 0) continue; // ficheiro apagado no commit-filho
        const alvo = path.join(destino, ficheiro);
        fs.mkdirSync(path.dirname(alvo), { recursive: true });
        fs.writeFileSync(alvo, r.stdout);
      }
      // o hook do braço ON deixaria isto
      fs.appendFileSync(path.join(destino, MARCA), 'x\n');
    }
    const ms = Date.now() - t0;

    return {
      status: 0,
      signal: null,
      error: null,
      stdout: JSON.stringify({
        is_error: false,
        duration_api_ms: Math.max(1, ms),
        usage: { input_tokens: 1000, output_tokens: 200 },
        total_cost_usd: 0,
        session_id: `ensaio-${braco}-${tarefa.task_id}`,
        result: 'duplo do agente',
      }),
      stderr: '',
    };
  };
}

const argv = process.argv.slice(2);
const iSo = argv.indexOf('--so');
const limite = iSo >= 0 ? Number(argv[iSo + 1]) : Infinity;

const prereg = JSON.parse(fs.readFileSync(path.join(REPO, 'tools/ab/r24-prereg.json'), 'utf8'));
const manifest = JSON.parse(fs.readFileSync(path.join(REPO, 'tools/ab/r24-manifest.json'), 'utf8'));
const tarefas = primarias(manifest, prereg).slice(0, limite);

const raiz = path.join(os.tmpdir(), 'r24-ensaio');
const ledger = path.join(REPO, '_handoff', 'r24', 'ensaio.jsonl');

console.log('r24 · ENSAIO GERAL — o agente é um duplo, o resto é a sério');
console.log(`  ${tarefas.length} tarefas · ledger do ensaio: ${ledger}`);
console.log('  isto NÃO é a experiência: não chama o modelo e o resultado é conhecido de antemão\n');

prepararCacheNodeModules({ repo: REPO, cache: raiz, dirs: [...new Set(['.', ...tarefas.map((t) => t.acceptance_cwd), 'tools/router'])], log: (m) => console.log(m) });
const router = prepararRouterPinado({ repo: REPO, cache: raiz });

fs.rmSync(ledger, { force: true });
const t0 = Date.now();
let mau = 0;

for (const t of tarefas) {
  const linhas = {};
  for (const braco of ordemDosBracos(primeiroDe(prereg, t.task_id))) {
    const destino = path.join(raiz, `${t.task_id}-${braco}`);
    const l = correrUmBraco({
      braco, tarefa: t, repo: REPO, raizSnapshots: raiz, prereg, router, cacheNm: raiz,
      spawnImpl: duploDoAgente({ tarefa: t, braco, destino }),
    });
    escreverLedger({ ...l, tipo: 'ensaio' }, { ledgerPath: ledger });
    linhas[braco === 'ON' ? 'on' : 'off'] = l;
    fs.rmSync(destino, { recursive: true, force: true });
  }
  const z = zDaTarefa(linhas);
  const esperado = z.z === 1;
  if (!esperado) mau++;
  const d = (n) => (n === null ? 'n/d' : `${n.toFixed(1)}s`);
  console.log(`  ${esperado ? 'ok   ' : 'FALHA'} ${t.task_id}  ON=${d(linhas.on.tva_s)} ${linhas.on.aceite ? 'passa' : 'falha'}`
    + ` · OFF=${d(linhas.off.tva_s)} ${linhas.off.aceite ? 'passa' : 'falha'}`
    + ` · Z=${z.z} (${z.motivo})`
    + (linhas.on.invalido || linhas.off.invalido ? `  INVÁLIDO: ${linhas.on.motivo || linhas.off.motivo}` : ''));
}

const mins = ((Date.now() - t0) / 60000).toFixed(1);
const escritas = lerLedgerCru(ledger).linhas.length;
console.log(`\n  ${tarefas.length - mau} de ${tarefas.length} com Z=1 · ${escritas} linhas escritas · ${mins} min`);
console.log(mau === 0
  ? '\nO APARELHO MONTA. Quando o agente resolver a tarefa, o aparelho reconhece-o;\nquando desistir, marca falha. O que falta é o agente ser o de verdade.'
  : `\n${mau} tarefa(s) não deram Z=1 com um agente que resolve a tarefa por construção.\nIsso é um defeito do aparelho, e apanhá-lo aqui custou minutos em vez de 23 horas.`);
process.exit(mau === 0 ? 0 : 1);
