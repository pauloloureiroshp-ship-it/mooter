#!/usr/bin/env node
/**
 * ancora.mjs — o produtor que faltava ao modo ANCORADO.
 *
 * O QUE ISTO CORRIGE, e nao e o que parece.
 *
 * Medido a 2026-08-25 no ledger deste device: `ancorado` correu ZERO vezes em
 * 10 624 recibos. Nao por estar partido — por nunca ter tido entrada. O
 * `~/.mooter/ancora-achados.json` nao existia, e NADA no repositorio o escrevia:
 * havia quem o lesse (`moo-runner.mjs` -> `context-pack.mjs`), quem o testasse
 * com fixtures, e um comentario a citar uma medicao real de 76 apontamentos
 * feita a mao a 2026-08-19. Produtor, nenhum.
 *
 * E a forma de falha e pior do que uma avaria: `readAnchor` devolve `[]` numa
 * ausencia — de proposito, para nao parar uma ronda — e a escada cai em silencio
 * para `caca`. **"Sem ancora" era indistinguivel de "ancora vazia".** Nenhum
 * ecra, nenhum log, nenhum recibo dizia a diferenca.
 *
 * Este ficheiro escreve SEMPRE os dois lados dessa distincao:
 *
 *   ancora-achados.json    o array que o `readAnchor` le. Contrato inalterado.
 *   ancora-manifesto.json  quando correu, que regras estavam ligadas, quantos
 *                          ficheiros varreu, e quantos apontamentos saiu.
 *
 * Um manifesto com `apontamentos: 0` e uma afirmacao. Um ficheiro que nao existe
 * nao e afirmacao nenhuma.
 *
 * ⚠️ NASCE COM ZERO REGRAS ACTIVAS, e isso NAO e um esqueleto por preencher — e
 * o estado medido. Sete regras candidatas foram sondadas em 288 ficheiros e
 * nenhuma passou o `portao-de-existencia` (>= 10 defeitos REAIS e >= 30% de
 * precisao). Os numeros de cada uma estao na sua entrada, como nos pilares.
 *
 * O QUE NAO ENTRA AQUI, e porque:
 *
 *   · PARSE (`node --check`) — 0 em 288 ficheiros. Um erro de parse e CERTO, e a
 *     ancora existe para dar ao modelo coisas por JULGAR. Mandar julgar uma
 *     certeza e gastar uma ronda a confirmar o obvio. Se um dia isto deixar de
 *     ser 0, o sitio dele e um alarme, nao esta fila.
 *
 * Uso:
 *   node tools/cockpit/runner/ancora.mjs            # gera e escreve
 *   node tools/cockpit/runner/ancora.mjs --estado   # so relata, nao escreve
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { expandirPadrao } from './context-pack.mjs';
import { excluido } from './portao-de-existencia.mjs';

const HOME = os.homedir();
const MOO_DIR = process.env.MOOTER_HOME || path.join(HOME, '.mooter');

/** Onde os pontos de partida vivem, quando a classe nao declara os seus. */
export const GLOBS_OMISSAO = [
  'tools/router/*.js',
  'tools/cockpit/runner/*.mjs',
  'packages/mooter-bridge/*.js',
];

/**
 * O catalogo de regras.
 *
 * Mesma forma que os pilares, e pela mesma razao: uma regra desligada FICA, com
 * o numero que a desligou escrito ao lado. Apagar a entrada tornaria ilegivel o
 * historico que explica porque ela nao corre — e convidaria a proxima pessoa a
 * reescreve-la de novo, por intuicao.
 *
 * Para uma regra entrar aqui com `activo: true` tem de passar o
 * `portao-de-existencia`: censo deterministico, triagem a mao, >= 10 defeitos
 * reais E >= 30% de precisao. Nenhuma das sete sondadas passou.
 */
export const REGRAS = {
  'catch-mudo': {
    activo: false,
    /**
     * ⛔ 58 candidatos em 288 ficheiros — e ja se sabia que era ruido.
     *
     * `REGRAS_IGNORADAS` do `context-pack` ja contem `no-empty`, e o comentario
     * que la esta diz: "Medido a 2026-08-19 no ancora-achados.json real: 76
     * apontamentos, 58 deles no-empty". A minha sondagem de 25/08 deu
     * exactamente 58 — a mesma classe, o mesmo numero, cinco dias depois.
     *
     * Neste repositorio um `catch {}` e quase sempre degradacao deliberada, e
     * quase sempre com o porque escrito por cima. Reprova na precisao antes de
     * chegar a leitura.
     */
    porque: '58 candidatos, e e a classe que o `REGRAS_IGNORADAS` ja filtra por ruido',
    detectar: (l) => /catch\s*(\([^)]*\))?\s*\{\s*\}\s*$/.test(l),
  },

  'no-self-compare': {
    activo: false,
    /** ⛔ 1 candidato, e falso: `cargoOf(job).cargo === cargo` sao expressoes diferentes. */
    porque: '1 candidato em 288 ficheiros, e esse e falso',
    detectar: (l) => {
      const m = /([A-Za-z_$][\w$.]*)\s*(===|!==|==|!=)\s*([A-Za-z_$][\w$.]*)/.exec(l);
      return Boolean(m && m[1] === m[3] && !/\bNaN\b/.test(l));
    },
  },

  'no-self-assign': {
    activo: false,
    /** ⛔ 1 candidato, e falso: a atribuicao continua na linha seguinte. */
    porque: '1 candidato, falso — o detector nao ve a linha seguinte',
    detectar: (l) => {
      const m = /^\s*([A-Za-z_$][\w$.]*)\s*=\s*([A-Za-z_$][\w$.]*)\s*;?\s*$/.exec(l);
      return Boolean(m && m[1] === m[2]);
    },
  },

  'ternario-igual': {
    activo: false,
    /**
     * ⛔ 1 candidato, e o repo responde-lhe: `hasGpu ? 0 : 0` com o comentario
     * "local is always free" na mesma linha. A doutrina do proprio motor diz
     * "esta explicado? le-o e acredita". Um achado que o excerto ja desmente.
     */
    porque: '1 candidato, e o comentario da mesma linha explica-o',
    detectar: (l) => {
      const m = /\?\s*([^:?]{1,40}?)\s*:\s*([^;)]{1,40}?)\s*[;)]/.exec(l);
      return Boolean(m && m[1].trim() === m[2].trim());
    },
  },

  'valid-typeof': {
    activo: false,
    /** ⛔ 0 candidatos em 288 ficheiros. Reprova sem leitura nenhuma. */
    porque: '0 candidatos',
    detectar: (l) => {
      const m = /typeof\s+[^=!]+(===|!==|==|!=)\s*['"]([a-z]+)['"]/.exec(l);
      const TIPOS = ['undefined', 'object', 'boolean', 'number', 'string', 'function', 'symbol', 'bigint'];
      return Boolean(m && !TIPOS.includes(m[2]));
    },
  },

  'length-negativo': {
    activo: false,
    /** ⛔ 0 candidatos. Uma comparacao de `.length` com um negativo nunca e verdade. */
    porque: '0 candidatos',
    detectar: (l) => /\.length\s*(===|==|<|<=)\s*-\d/.test(l),
  },
};

/** As que correm. Vazio hoje, por medicao — ver a entrada de cada uma. */
export function regrasActivas(regras = REGRAS) {
  return Object.keys(regras).filter((id) => regras[id] && regras[id].activo === true);
}

/** Comentario de linha fora, para o detector nao acusar prosa. */
export function limparLinha(l) {
  const s = String(l);
  const b = s.indexOf('//');
  if (b === -1) return s;
  // `https://` nao e um comentario. E o engano mais barato desta funcao.
  if (/[A-Za-z]+:$/.test(s.slice(0, b))) return s;
  return s.slice(0, b);
}

/**
 * Corre as regras activas e devolve os apontamentos + o manifesto.
 *
 * Nunca lanca por causa de um ficheiro: um ilegivel e CONTADO e declarado. Um
 * ficheiro que nao se le nao e um ficheiro sem apontamentos.
 */
export function gerar({
  repoRoot,
  regras = REGRAS,
  globs = GLOBS_OMISSAO,
  agora = null,
  readImpl = (p) => fs.readFileSync(p, 'utf8'),
  expandirImpl = expandirPadrao,
} = {}) {
  const activas = regrasActivas(regras);

  const vistos = new Set();
  const globsVazios = [];
  for (const g of globs) {
    let achados = [];
    try { achados = expandirImpl(repoRoot, g) || []; } catch { achados = []; }
    if (achados.length === 0) globsVazios.push(g);
    for (const f of achados) if (!excluido(f)) vistos.add(f);
  }
  const ficheiros = [...vistos].sort();

  const apontamentos = [];
  const ilegiveis = [];
  const porRegra = Object.fromEntries(activas.map((id) => [id, 0]));

  // Sem regras activas nao se le ficheiro nenhum: varrer 288 ficheiros para
  // aplicar zero regras seria trabalho a fingir que e trabalho.
  if (activas.length > 0) {
    for (const rel of ficheiros) {
      let linhas;
      try { linhas = String(readImpl(path.join(repoRoot, rel))).split('\n'); } catch { ilegiveis.push(rel); continue; }
      for (let i = 0; i < linhas.length; i += 1) {
        const l = limparLinha(linhas[i]);
        if (!l.trim()) continue;
        for (const id of activas) {
          let bate = false;
          try { bate = Boolean(regras[id].detectar(l, rel, i + 1)); } catch { bate = false; }
          if (bate) {
            apontamentos.push({ file: rel, line: i + 1, rule: id });
            porRegra[id] += 1;
          }
        }
      }
    }
  }

  const manifesto = {
    gerado_em: agora === null ? null : new Date(agora).toISOString().replace(/\.\d{3}Z$/, 'Z'),
    repo: repoRoot,
    regras_no_catalogo: Object.keys(regras).length,
    regras_activas: activas,
    ficheiros_varridos: activas.length > 0 ? ficheiros.length : 0,
    ficheiros_no_ambito: ficheiros.length,
    ilegiveis,
    globs_vazios: globsVazios,
    apontamentos: apontamentos.length,
    por_regra: porRegra,
    // A frase que o painel e o self-check leem. Um zero por DECISAO nao e o
    // mesmo que um zero por ninguem ter olhado, e tem de se distinguir aqui.
    porque: activas.length === 0
      ? 'zero regras activas — nenhuma das candidatas passou o portao de existencia'
      : `${activas.length} regra(s) activa(s)`,
  };

  return { apontamentos, manifesto };
}

/** Escreve os dois ficheiros. O de achados e um ARRAY — contrato do `readAnchor`. */
export function escrever({ dir, apontamentos, manifesto, writeImpl = fs.writeFileSync, mkdirImpl = fs.mkdirSync }) {
  mkdirImpl(dir, { recursive: true });
  const alvoAchados = path.join(dir, 'ancora-achados.json');
  const alvoManifesto = path.join(dir, 'ancora-manifesto.json');
  writeImpl(alvoAchados, JSON.stringify(apontamentos, null, 0));
  writeImpl(alvoManifesto, JSON.stringify(manifesto, null, 2));
  return { alvoAchados, alvoManifesto };
}

/** O manifesto do disco, ou `null` — e `null` quer dizer NUNCA CORREU. */
export function lerManifesto(dir, { readImpl = fs.readFileSync } = {}) {
  try {
    const o = JSON.parse(readImpl(path.join(dir, 'ancora-manifesto.json'), 'utf8'));
    return o && typeof o === 'object' && !Array.isArray(o) ? o : null;
  } catch { return null; }
}

// ─────────────────────────────────────────────────────────────── CLI

function principal(argv) {
  const i = argv.indexOf('--repo');
  const repoRoot = i === -1 ? process.cwd() : argv[i + 1];
  const soRelato = argv.includes('--estado');

  const { apontamentos, manifesto } = gerar({ repoRoot, agora: Date.now() });

  console.log(`ancora · ${manifesto.porque}`);
  console.log(`  catalogo: ${manifesto.regras_no_catalogo} regras · activas: ${manifesto.regras_activas.length}`);
  console.log(`  ambito  : ${manifesto.ficheiros_no_ambito} ficheiros`);
  console.log(`  saida   : ${manifesto.apontamentos} apontamentos`);
  for (const g of manifesto.globs_vazios) console.log(`  AVISO glob sem ficheiros: ${g}`);
  for (const f of manifesto.ilegiveis) console.log(`  AVISO ilegivel: ${f}`);

  if (soRelato) {
    console.log('\n(--estado: nao escrevi nada)');
    return;
  }
  const { alvoAchados, alvoManifesto } = escrever({ dir: MOO_DIR, apontamentos, manifesto });
  console.log(`\nescrito: ${alvoAchados}`);
  console.log(`         ${alvoManifesto}`);
  if (manifesto.apontamentos === 0) {
    console.log('\nA ancora esta VAZIA, e agora di-lo. Ate hoje o ficheiro nem existia,');
    console.log('e o runner caia em silencio para o modo de caca sem ninguem saber.');
  }
}

if (process.argv[1] && process.argv[1].endsWith('ancora.mjs')) principal(process.argv.slice(2));
