#!/usr/bin/env node
/**
 * workflows-lint.mjs — o defeito que matou um gate durante 60 corridas.
 *
 * Medido a 2026-09-01: `version-sync.yml` falhou 60 de 60 corridas, TODAS a 0s,
 * com "This run likely failed because of a workflow file issue" — desde
 * 2026-08-29T23:02Z, que e o commit que lhe acrescentou o `gh pr create`. Causa:
 * o corpo do PR era um texto de varias linhas escrito A COMEcAR NA COLUNA 0,
 * dentro de um `run: |` indentado a 10 espacos. Em YAML isso TERMINA o bloco, e
 * as linhas seguintes passam a ser lixo no raiz do documento.
 *
 * O que torna esta classe perigosa nao e ser subtil — e o SINTOMA. Um workflow
 * que nao parseia nao corre passo nenhum: nao ha log, nao ha anotacao, nao ha
 * teste vermelho. Ha uma bolinha vermelha entre outras e um gate que deixou
 * silenciosamente de existir. O `version-sync` protege exactamente contra
 * deriva de versao — e derivou.
 *
 * Zero dependencias de proposito: nao ha parser de YAML instalado neste repo, e
 * acrescentar um para verificar cinco ficheiros seria pagar caro pela verificacao
 * errada. O que se verifica aqui e a REGRA que foi quebrada — a indentacao dos
 * blocos escalares — e nao "o YAML e valido em geral".
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
export const REPO = path.resolve(AQUI, '..');

/** Um `chave: |` ou `chave: >` (com os modificadores `-`, `+`, `2`…). */
const ABRE_BLOCO = /^(\s*)(?:-\s+)?[\w.$'"-]+\s*:\s*[|>][-+0-9]*\s*(?:#.*)?$/;
/** Uma linha que PODE fechar um bloco: chave, item de lista, comentario, `---`. */
const FECHA_LEGITIMO = /^\s*(?:#|-(?:\s|$)|---\s*$|\.\.\.\s*$|[\w.$'"-]+\s*:(?:\s|$))/;

/**
 * As linhas que escaparam do bloco a que pertenciam.
 *
 * A regra: dentro de um bloco escalar, uma linha nao vazia com indentacao MENOR
 * do que a do conteudo do bloco so e legitima se parecer YAML (chave, item,
 * comentario). Uma linha de prosa na coluna 0 no meio de um passo nunca e.
 *
 * @returns {Array<{linha:number, texto:string, bloco:number, indenta:number, porque:string}>}
 */
export function fugasDeBloco(texto) {
  const linhas = String(texto).split('\n');
  const fugas = [];
  let bloco = null;   // { abriu, indentaChave, indentaConteudo }
  for (let i = 0; i < linhas.length; i += 1) {
    const l = linhas[i];
    if (bloco) {
      if (!l.trim()) continue;                       // linha vazia nao fecha nada
      const indenta = l.length - l.trimStart().length;
      if (indenta > bloco.indentaChave) {
        if (bloco.indentaConteudo == null) bloco.indentaConteudo = indenta;
        continue;                                     // dentro do bloco
      }
      // Dedentou ate ao nivel da chave (ou abaixo). So vale se for YAML.
      if (FECHA_LEGITIMO.test(l) && indenta <= bloco.indentaChave) { bloco = null; }
      else {
        fugas.push({
          linha: i + 1,
          texto: l.slice(0, 90),
          bloco: bloco.abriu,
          indenta,
          porque: indenta === 0
            ? 'prosa na coluna 0 dentro de um bloco indentado — o bloco termina aqui e o resto vira lixo no raiz'
            : `indentacao ${indenta} <= ${bloco.indentaChave} da chave do bloco, e nao parece YAML`,
        });
        bloco = null;   // ja se reportou; nao inundar com a mesma fuga
      }
      continue;
    }
    const m = ABRE_BLOCO.exec(l);
    if (m) bloco = { abriu: i + 1, indentaChave: m[1].length, indentaConteudo: null };
  }
  return fugas;
}

/** Todos os workflows do repo, por ordem. */
export function workflows(repoRoot = REPO, { readdirImpl = fs.readdirSync } = {}) {
  const dir = path.join(repoRoot, '.github', 'workflows');
  let nomes = [];
  try { nomes = readdirImpl(dir); } catch { return []; }
  return nomes.filter((n) => /\.ya?ml$/.test(n)).sort().map((n) => path.join(dir, n));
}

export function verificar(repoRoot = REPO, { readImpl = fs.readFileSync } = {}) {
  const problemas = [];
  for (const f of workflows(repoRoot)) {
    for (const fuga of fugasDeBloco(readImpl(f, 'utf8'))) {
      problemas.push({ ficheiro: path.relative(repoRoot, f), ...fuga });
    }
  }
  return problemas;
}

function main() {
  const problemas = verificar();
  const n = workflows().length;
  if (!problemas.length) {
    process.stdout.write(`workflows-lint: OK — ${n} workflow(s), nenhum bloco escalar com fuga\n`);
    return;
  }
  for (const p of problemas) {
    process.stderr.write(
      `${p.ficheiro}:${p.linha}  FUGA do bloco aberto na linha ${p.bloco}\n` +
      `  ${p.porque}\n  | ${p.texto}\n`,
    );
  }
  process.stderr.write(
    `\n${problemas.length} fuga(s). Um workflow que nao parseia nao corre passo nenhum:\n` +
    'nao ha log, nao ha anotacao, so uma bolinha vermelha e um gate que deixou de existir.\n',
  );
  process.exit(1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
