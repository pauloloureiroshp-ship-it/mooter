/**
 * ci-coerencia.mjs — os workflows do CI tambem nao levam pilar. Levam isto.
 *
 * PORQUE NAO E UM PILAR.
 *
 * Mediram-se SEIS classes candidatas nos 17 workflows antes de escrever qualquer
 * enunciado:
 *
 *     classe                              densidade   porque nao serve
 *     name: vs o que o run: faz              84        exige juizo
 *     token citado no name vs run            27        81% de falsos (22/27):
 *                                                      `Typecheck (tsc --noEmit)`
 *                                                      corre `npm run typecheck`,
 *                                                      que INVOCA o tsc; e
 *                                                      `(informativo)`/`(optional)`
 *                                                      sao descricoes, nao comandos
 *     portao com continue-on-error            1        e o unico e intencional e
 *                                                      documentado (typecheck)
 *     `if:` alcancavel                       19        exige juizo
 *     numero no name vs numero no run         2        raro demais
 *     "Setup Node N" vs node-version          1        raro demais
 *
 * Duas medicoes seguidas — o `landing/` e este — dizem a mesma coisa: **ficheiros
 * de configuracao e de marcacao nao tem a estrutura de pares literais densos que
 * os ficheiros de CODIGO tem.** Os dois pilares que funcionam (P2, P3) e o que se
 * criou de novo (P11) vivem todos sobre codigo.
 *
 * O QUE FICA AQUI, e porque e deterministico:
 * as duas coisas verificaveis no CI sao ENTRE FICHEIROS — que versao de Node cada
 * workflow usa, e se os scripts que ele manda correr existem. Uma janela de 70
 * linhas nunca ve nem uma nem outra. Um modelo tambem nao: nao e falta de
 * inteligencia, e falta de contexto.
 *
 * Uso: node tools/cockpit/runner/ci-coerencia.mjs [raiz-do-repo]
 */

import fs from 'node:fs';
import path from 'node:path';

/** Workflows que PUBLICAM alguma coisa para fora. */
const PUBLICA = /^publish-|^deploy-/;
/** O workflow que corre a suite — a referencia de runtime. */
const TESTA = /^test\.ya?ml$/;

export function lerWorkflows(dir, { readdirImpl = fs.readdirSync, readImpl = fs.readFileSync } = {}) {
  let nomes = [];
  try { nomes = readdirImpl(dir).filter((f) => /\.ya?ml$/.test(f)); } catch { return []; }
  return nomes.map((f) => {
    let src = '';
    try { src = String(readImpl(path.join(dir, f), 'utf8')); } catch { src = ''; }
    return { ficheiro: f, src };
  });
}

/** A versao MAIOR de Node que cada workflow instala. `null` quando nao instala. */
export function nodeDe(src) {
  const m = String(src || '').match(/node-version:\s*['"]?([0-9]+)/);
  return m ? m[1] : null;
}

/**
 * O que se PUBLICA foi construido no mesmo runtime em que se TESTOU?
 *
 * Medido a 2026-08-22: o `test.yml` corre em Node 22; o `publish-npm.yml` e o
 * `publish-cockpit.yml` correm em Node 20. Nao afirmo que seja um defeito —
 * publicar no Node mais antigo que se suporta e uma escolha legitima. O que nao
 * pode e ser uma escolha por acidente, e ninguem consegue ve-la sem juntar 17
 * ficheiros. Isto junta-os.
 */
export function runtimeDePublicacao(workflows) {
  const teste = workflows.find((w) => TESTA.test(w.ficheiro));
  const nodeTeste = teste ? nodeDe(teste.src) : null;
  const divergentes = [];
  for (const w of workflows) {
    if (!PUBLICA.test(w.ficheiro)) continue;
    const n = nodeDe(w.src);
    if (!n || !nodeTeste) continue;
    if (n !== nodeTeste) divergentes.push({ ficheiro: w.ficheiro, node: n });
  }
  return { nodeTeste, divergentes };
}

/** Os scripts que o CI manda correr existem mesmo no repo? */
export function scriptsEmFalta(workflows, raiz, { existsImpl = fs.existsSync } = {}) {
  const faltam = [];
  for (const w of workflows) {
    for (const m of String(w.src).matchAll(
      /(?:node|bash|sh)\s+((?:tools|packages|scripts|landing|hub)\/[A-Za-z0-9_./-]+\.(?:m?js|sh|ts))/g,
    )) {
      if (!existsImpl(path.join(raiz, m[1]))) faltam.push({ ficheiro: w.ficheiro, alvo: m[1] });
    }
  }
  return faltam;
}

function principal() {
  const raiz = process.argv[2] || process.env.MOOTER_REPO || process.cwd();
  const workflows = lerWorkflows(path.join(raiz, '.github', 'workflows'));
  if (!workflows.length) { console.log('sem workflows — n/d'); return; }

  const porVersao = {};
  for (const w of workflows) {
    const n = nodeDe(w.src) || '(nao instala)';
    (porVersao[n] ||= []).push(w.ficheiro);
  }
  console.log(`workflows: ${workflows.length}\n`);
  for (const [v, fs_] of Object.entries(porVersao).sort()) {
    console.log(`  Node ${String(v).padEnd(14)} ${fs_.length}: ${fs_.sort().join(', ')}`);
  }

  const { nodeTeste, divergentes } = runtimeDePublicacao(workflows);
  const faltam = scriptsEmFalta(workflows, raiz);

  console.log('');
  if (divergentes.length) {
    console.log(`⚠️  a suite corre em Node ${nodeTeste}, mas publica-se noutro runtime:`);
    for (const d of divergentes) console.log(`     ${d.ficheiro} -> Node ${d.node}`);
    console.log('     (nao e por si um defeito — mas tem de ser escolha, nao acidente)');
  } else {
    console.log(`publicacao e teste no mesmo runtime (Node ${nodeTeste ?? 'n/d'})`);
  }

  if (faltam.length) {
    console.log('\n⚠️  o CI manda correr scripts que nao existem:');
    for (const f of faltam) console.log(`     ${f.ficheiro} -> ${f.alvo}`);
    process.exitCode = 1;
  } else {
    console.log('todos os scripts citados pelo CI existem');
  }
}

if (process.argv[1] && process.argv[1].endsWith('ci-coerencia.mjs')) principal();
