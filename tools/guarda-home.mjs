#!/usr/bin/env node
/**
 * guarda-home.mjs — corre um comando e prova que ele nao mexeu no ~/.mooter.
 *
 * PORQUE EXISTE. O `~/.mooter` de quem corre a suite foi apagado duas vezes por
 * `npm test`:
 *
 *   2026-08-05  232 eventos de ledger + o `decisions.log` do router
 *   2026-08-20  o ledger vivo do loop e o `revistos.json`
 *
 * O PR #325 fechou a causa (testes que se isolavam so com `HOME`, que no Windows
 * nao e isolamento nenhum) e poe um guarda ESTATICO: falha na revisao se um
 * ficheiro de teste voltar a definir `HOME` sem `MOOTER_HOME`.
 *
 * Este e o guarda DINAMICO, e apanha o que o estatico nao pode ver: o caminho
 * que resolve para o home verdadeiro sem passar por `process.env.HOME` nenhum —
 * porque `os.homedir()` no Windows le o `USERPROFILE`, e nenhuma regex sobre o
 * codigo dos testes consegue prever isso. Aqui nao se le codigo: hasheia-se a
 * arvore antes, corre-se, hasheia-se depois.
 *
 * TRES REGRAS, e a assimetria entre elas e o ponto todo:
 *
 *   APAGADO   sempre falha. Nao ha caso legitimo. E o defeito de 05/08 e 20/08.
 *   ALTERADO  falha, excepto para os ficheiros que o LOOP escreve enquanto a
 *             suite corre (o ledger cresce de 35 em 35 segundos). Alterar e
 *             tolerado para esses; APAGAR nunca e, nem para esses.
 *   NOVO      falha, excepto o que estiver na baseline — a divida medida, com
 *             nome. A lista so pode encolher (ver `guarda-home.test.mjs`).
 *
 * A baseline NAO e uma absolvicao: e a poluicao que a suite ainda faz, escrita
 * onde se ve. Hoje inclui o `effort.json`, ou seja `npm test` muda o modo de
 * esforco da maquina de quem o corre. A raiz vive em `packages/*` congelado.
 *
 * Uso:
 *   node tools/guarda-home.mjs -- npm test
 *   node tools/guarda-home.mjs --cwd packages/cli -- npm test
 *   node tools/guarda-home.mjs --baseline outra.json -- node --test x.mjs
 *
 * Saida: o codigo do comando, ou 1 se houver violacao (a violacao ganha).
 *
 * ⚠️ UM COMANDO QUE NAO CORREU NAO E UMA ARVORE LIMPA. A primeira versao disto
 * imprimia "OK — nao apagou, nao alterou, nao poluiu" quando o `npm` rebentava
 * a arrancar: zero entradas antes, zero depois, verde. Apanhado a mao a
 * 2026-08-20 — e e exactamente a classe de defeito que este ficheiro existe
 * para cacar, a acontecer dentro dele proprio.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const AQUI = path.dirname(fileURLToPath(import.meta.url));

/** O mesmo contrato que o codigo sob teste honra. */
export function homeDoMooter(env = process.env) {
  return env.MOOTER_HOME || path.join(os.homedir(), '.mooter');
}

/**
 * Caminhos relativos -> sha256. Directorios entram como marca (`sha: null`)
 * para que criar uma pasta vazia tambem conte como novidade.
 */
export function fotografar(raiz, readdirImpl = fs.readdirSync, readImpl = fs.readFileSync) {
  const foto = new Map();
  const andar = (dir, prefixo) => {
    let entradas;
    try { entradas = readdirImpl(dir, { withFileTypes: true }); }
    catch { return; }
    for (const e of entradas) {
      const rel = prefixo ? `${prefixo}/${e.name}` : e.name;
      if (e.isDirectory()) {
        foto.set(`${rel}/`, null);
        andar(path.join(dir, e.name), rel);
      } else {
        let sha = 'ilegivel';
        try { sha = crypto.createHash('sha256').update(readImpl(path.join(dir, e.name))).digest('hex'); }
        catch { /* um ficheiro que nao abre continua a ser um ficheiro que existe */ }
        foto.set(rel, sha);
      }
    }
  };
  andar(raiz, '');
  return foto;
}

/** `cache/` na lista cobre `cache/` e tudo o que esteja la dentro. */
function coberto(rel, lista) {
  return lista.some((p) => (p.endsWith('/') ? rel === p || rel.startsWith(p) : rel === p));
}

export function comparar(antes, depois, baseline = {}) {
  const novosTolerados = baseline.novos_tolerados || [];
  const mutaveis = baseline.mutaveis_pelo_loop || [];
  const apagados = [];
  const alterados = [];
  const novos = [];

  for (const [rel, sha] of antes) {
    if (!depois.has(rel)) { apagados.push(rel); continue; }
    // `null` e marca de directorio: nao tem conteudo para comparar.
    if (sha !== null && depois.get(rel) !== sha && !coberto(rel, mutaveis)) alterados.push(rel);
  }
  for (const rel of depois.keys()) {
    if (!antes.has(rel) && !coberto(rel, novosTolerados)) novos.push(rel);
  }
  return { apagados, alterados, novos, limpo: !apagados.length && !alterados.length && !novos.length };
}

function principal(argv) {
  const corte = argv.indexOf('--');
  if (corte === -1) {
    process.stderr.write('uso: node tools/guarda-home.mjs [--baseline <f>] -- <comando...>\n');
    return 2;
  }
  const opcoes = argv.slice(0, corte);
  const comando = argv.slice(corte + 1);
  const iCwd = opcoes.indexOf('--cwd');
  const cwd = iCwd === -1 ? process.cwd() : path.resolve(opcoes[iCwd + 1]);
  const iBase = opcoes.indexOf('--baseline');
  const ficheiroBase = iBase === -1
    ? path.join(AQUI, 'guarda-home.baseline.json')
    : opcoes[iBase + 1];

  let baseline = {};
  try { baseline = JSON.parse(fs.readFileSync(ficheiroBase, 'utf8')); }
  catch { process.stderr.write(`guarda-home: baseline ilegivel (${ficheiroBase}) — a exigir arvore intacta\n`); }

  const raiz = homeDoMooter();
  const antes = fotografar(raiz);
  process.stdout.write(`guarda-home: ${raiz} — ${antes.size} entrada(s) antes\n`);

  const r = spawnSync(comando[0], comando.slice(1), {
    stdio: 'inherit', cwd, shell: process.platform === 'win32',
  });

  const depois = fotografar(raiz);
  const d = comparar(antes, depois, baseline);
  process.stdout.write(`guarda-home: ${depois.size} entrada(s) depois\n`);

  // A ordem importa. Se o comando nem chegou a arrancar, a arvore esta intacta
  // por razao NENHUMA, e dizer "OK" seria a mentira mais cara que este ficheiro
  // podia contar.
  if (r.error || r.status === null) {
    const porque = r.error ? r.error.message : 'sem codigo de saida';
    process.stderr.write(`::error::guarda-home: o comando NAO CORREU (${porque}) — uma arvore intacta nao prova nada aqui\n`);
    return 1;
  }
  if (d.limpo) {
    // "Limpo" quer dizer: nada apagado, nada alterado, e nada novo FORA da
    // baseline. Nao quer dizer que nao escreveu nada — a baseline e divida
    // medida, nao ausencia de sujidade, e a mensagem nao pode sugerir o
    // contrario.
    const novosNomeados = depois.size - antes.size;
    const nota = novosNomeados > 0
      ? ` (${novosNomeados} entrada(s) novas, todas nomeadas na baseline)`
      : '';
    process.stdout.write(r.status === 0
      ? `guarda-home: OK — nada apagado, nada alterado, nada novo por explicar${nota}\n`
      : `guarda-home: nada apagado nem alterado${nota}, mas o comando saiu ${r.status} — o vermelho e dele\n`);
    return r.status;
  }

  const linha = (t, xs) => xs.length && process.stderr.write(`::error::guarda-home ${t}: ${xs.join(', ')}\n`);
  linha('APAGOU', d.apagados);
  linha('ALTEROU', d.alterados);
  linha('POLUIU (fora da baseline)', d.novos);
  process.stderr.write(
    'Isto ja custou o ledger vivo desta maquina duas vezes (2026-08-05 e 2026-08-20).\n'
    + `Se a novidade for legitima, tem de ser NOMEADA em ${path.relative(process.cwd(), ficheiroBase)}.\n`
    + 'Um APAGADO nunca e legitimo — nao ha entrada na baseline que o perdoe.\n',
  );
  return 1;
}

const invocadoComoPrograma = process.argv[1]
  && import.meta.url === (await import('node:url')).pathToFileURL(process.argv[1]).href;
if (invocadoComoPrograma) process.exit(principal(process.argv.slice(2)));
