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
import { excluido, LIMIARES } from './portao-de-existencia.mjs';

const HOME = os.homedir();
const MOO_DIR = process.env.MOOTER_HOME || path.join(HOME, '.mooter');

/**
 * Quanto do `msg` chega ao juiz. O `context-pack` faz `.slice(0, 200)` antes de
 * o imprimir debaixo de `A ferramenta apontou a LINHA N, regra "...":`. Um
 * enunciado mais comprido chega cortado a meio de uma frase — e um enunciado
 * truncado e pior do que nenhum, porque parece completo.
 */
export const MSG_MAX = 200;

/** Um `catch` a abrir, com ou sem `(e)`. */
const CATCH = /catch\s*(\([^)]*\))?\s*\{/;
/** Contagens e coleccoes vazias. `null`/`undefined` NAO entram: sao a resposta certa. */
const NEUTRO = /^\s*return\s*(\[\s*\]|\{\s*\}|0)\s*;?\s*$/;
const NEUTRO_NA_MESMA = /catch\s*(\([^)]*\))?\s*\{\s*return\s*(\[\s*\]|\{\s*\}|0)\s*;?\s*\}/;

/**
 * O detector da regra `catch-neutro`. E de FICHEIRO e nao de linha, porque o
 * `catch` e o `return` estao em linhas diferentes na maior parte dos casos.
 *
 * Olha no maximo cinco linhas para a frente: um `catch` com dez linhas ja nao e
 * "engolir em silencio", e um comentario pelo meio conta como explicacao — o
 * motor manda "esta explicado? le-o e acredita".
 */
export function detectarFicheiro(linhas) {
  const achados = [];
  for (let i = 0; i < linhas.length; i += 1) {
    if (!CATCH.test(linhas[i])) continue;

    const naMesma = NEUTRO_NA_MESMA.exec(linhas[i]);
    if (naMesma) { achados.push({ linha: i + 1, valor: naMesma[2] }); continue; }

    let explicado = false;
    for (let j = i + 1; j < Math.min(i + 6, linhas.length); j += 1) {
      const l = linhas[j];
      if (/^\s*\}/.test(l)) break;
      if (/^\s*(\/\/|\/\*|\*)/.test(l)) { explicado = true; continue; }
      // ⚠️ UMA FALHA ANUNCIADA JA NAO E SILENCIOSA.
      //
      // Descoberto a 2026-08-25 pela pre-triagem: o `seamless.js:414` continuava
      // marcado DEPOIS de ter sido corrigido no #387. A correccao anunciou a
      // falha em codigo — `log('ledger nao lido: ' + erro)` antes do `return []`
      // — mas este detector so perdoava um COMENTARIO. Resultado: a regra
      // marcava o proprio remedio, e a precisao dela ia CAIR a medida que as
      // correccoes entrassem. Um detector que acusa quem o obedeceu mede o
      // trabalho ao contrario.
      if (/\b(log|warn|error|write|stderr|console)\b/i.test(l)) { explicado = true; continue; }
      const m = NEUTRO.exec(l);
      if (m && !explicado) { achados.push({ linha: j + 1, valor: m[1] }); break; }
      if (m) break;                    // explicado ou anunciado: nao conta
    }
  }
  return achados;
}

/** Onde os pontos de partida vivem, quando a classe nao declara os seus. */
/**
 * O que a ancora NUNCA pode apontar.
 *
 * O `classify.js` e FROZEN — o sha esta em CI. Um apontamento nele so pode dar
 * duas coisas: uma ronda de GPU gasta a julgar codigo que ninguem pode tocar, ou
 * pior, alguem a tocar-lhe. E ja aconteceu: um dos 11 achados do P2 que o dono
 * descartou apontava exactamente para la.
 *
 * Nao chega excluir o glob: `tools/router/*.js` tem de continuar no ambito
 * porque foi com ele que o censo mediu. O que se exclui e o FICHEIRO.
 */
export const NUNCA_APONTAR = [
  /(^|[\\/])classify\.js$/,
];

export function congelado(ficheiro) {
  const p = String(ficheiro || '').replace(/\\/g, '/');
  return NUNCA_APONTAR.some((re) => re.test(p));
}

export const GLOBS_OMISSAO = [
  'tools/router/*.js',
  'tools/cockpit/runner/*.mjs',
  'packages/mooter-bridge/*.js',
  // `tools/*.js` entrou porque foi medido: o censo do portao correu com ele, e
  // um produtor de ambito mais estreito do que a medicao que o autoriza mente
  // sobre o que foi provado. Sem ele ficavam de fora casos dos fortes — o
  // `docs-hygiene.js` a devolver `[]` de uma pasta ilegivel faz o proprio
  // ratchet ver uma melhoria que nao existe.
  'tools/*.js',
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
  /**
   * ✅ A PRIMEIRA REGRA ACTIVA, e a primeira classe a passar o portao.
   *
   * O NUMERO: 84 candidatos em 289 ficheiros; amostra de 40 lida a mao;
   * 28 reais, 70,0% de precisao. Passa os dois limiares (>= 10 reais E >= 30%).
   *
   * A CLASSE: um `catch` que devolve uma CONTAGEM ou COLECCAO vazia — `[]`, `{}`
   * ou `0` — onde "nao consegui ler" fica com a mesma cara que "nao ha nada".
   *
   * Nao e uma preferencia: e a regra escrita do proprio motor, e violada. O
   * cabecalho do `self-check.mjs` diz "o que nao se consegue medir devolve
   * `n/d`, NUNCA `ok`. Um verde por ignorancia e pior do que um vermelho."
   *
   * PORQUE ESTA E NAO OUTRA, em tres pontos:
   *
   *   1. e SEMPRE defeito quando e verdadeira — pela doutrina acima;
   *   2. e DECIDIVEL NA JANELA: o `catch` e o `return` sao adjacentes, e era
   *      essa a condicao que a sintese identificou como a razao estrutural
   *      pela qual todas as outras classes falharam;
   *   3. e a ferida recorrente deste motor. So a 2026-08-25: o `readAnchor` a
   *      devolver `[]` numa ausencia deixou o modo ANCORADO a zero rondas em
   *      10 624; o arnes graduava `NO FINDING` como deteccao; a prova de
   *      publicacao contava commits do repo em vez do beacon.
   *
   * A v1 desta regra aceitava tambem `return false` e `return ''`, e REPROVOU:
   * 8 reais em 40, 20%. A triagem mostrou porque — um `false` a fechar uma
   * ACCAO (escrever, apagar, matar) significa mesmo "nao aconteceu", e quem
   * chama distingue-o. Estreitou-se pelo criterio, nao pela fasquia: a fasquia
   * esta congelada, e a amostra da v2 foi nova.
   *
   * OS QUE MAIS DOEM, dos 28:
   *   badge.js:86        devolve `0` de POUPANCA, e esse numero vai ao ecra
   *   docs-hygiene.js:31 `[]` de uma pasta ilegivel faz o ratchet ver melhoria
   *   quota.js:394       uma contagem de dias que vira zero
   *
   * O QUE NAO CONTA, e o detector tem de o saber:
   *   · `return null` / `undefined` — sao a resposta CERTA;
   *   · `prefs()` a devolver `{}` — os defaults aplicam-se, e a ausencia e
   *     legitimamente igual ao vazio (12 dos 40 falsos eram isto);
   *   · um comentario dentro do `catch` — o motor manda "esta explicado? le-o
   *     e acredita", e um porque escrito e a resposta a objeccao.
   */
  'catch-neutro': {
    activo: true,
    // O que DECIDE. Estruturado, portanto verificavel — ver `podeEntrar`.
    // A precisao nao se declara: deriva-se de reais/lidos.
    medicao: { candidatos: 84, lidos: 40, reais: 28 },
    porque: '84 candidatos, 28 reais em 40 lidos a mao, 70,0% de precisao — passa os dois limiares do portao',
    /**
     * O ENUNCIADO que o juiz le.
     *
     * Vai para o campo `msg`, e o `context-pack` imprime-o debaixo de
     * `A ferramenta apontou a LINHA N, regra "catch-neutro":`. Sem isto o juiz
     * receberia uma linha em branco onde devia estar a razao.
     *
     * Diz o que VERIFICAR, nao afirma o defeito. O contrato do modo ancorado ja
     * nao tem saida gratis (`ACHADO:` ou `FALSO POSITIVO:`, os dois a exigir
     * `PROVA:`), portanto nao e preciso empurrar — e empurrar so inflacionaria
     * os falsos positivos, que e o que este loop nao pode voltar a fazer.
     *
     * ⚠️ TEM DE CABER EM `MSG_MAX`. O `context-pack` faz
     * `String(hit.msg || '').slice(0, 200)` antes de o imprimir. A primeira
     * versao disto tinha 341 caracteres e chegava ao juiz cortada a meio de uma
     * frase — "...Se sim, e d". Um enunciado truncado e pior do que nenhum:
     * parece completo. Ha um teste que trava isto.
     */
    enunciado: (valor) => `devolve ${valor} quando falha — igual a um vazio de verdade. `
      + 'VERIFICA: este valor e contado, mostrado ou comparado? Se sim e defeito, devia ser '
      + '`null`. Se ha comentario a explica-lo, e falso positivo.',
    detectarFicheiro,
  },

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

/**
 * O portao vive agora em `portao.mjs`, sem dependencias, para `context-pack.mjs`
 * o poder usar tambem sem fechar um ciclo de imports (o motivo esta escrito la).
 * Re-exportado daqui porque era daqui que toda a gente o importava — e mudar o
 * sitio de onde se importa uma decisao e uma boa maneira de a perder de vista.
 */
import { podeEntrar } from './portao.mjs';

export { podeEntrar };

/**
 * As que correm — e so entram as que o `podeEntrar` deixa.
 *
 * Uma regra com `activo: true` e medicao insuficiente NAO corre. Nao rebenta,
 * nao avisa a meio de uma ronda: simplesmente nao entra, e o manifesto diz
 * porque. E a diferenca entre um portao e um lembrete.
 */
export function regrasActivas(regras = REGRAS, opts = {}) {
  return Object.keys(regras).filter((id) => podeEntrar(regras[id], opts).pode);
}

/** As que quiseram entrar e o portao recusou, com o motivo de cada uma. */
export function regrasRecusadas(regras = REGRAS, opts = {}) {
  return Object.keys(regras)
    .filter((id) => regras[id] && regras[id].activo === true && !podeEntrar(regras[id], opts).pode)
    .map((id) => ({ id, porque: podeEntrar(regras[id], opts).porque }));
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
    for (const f of achados) if (!excluido(f) && !congelado(f)) vistos.add(f);
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
      // Regras de FICHEIRO primeiro: um `catch` e o seu `return` estao em
      // linhas diferentes, e uma regra que so ve uma linha de cada vez nunca os
      // liga. Cada apontamento leva o seu `msg` — o ENUNCIADO que o juiz le no
      // modo ancorado. Sem ele o `context-pack` imprime uma linha em branco
      // onde devia estar a razao, e o juiz julga sem saber o que julgar.
      for (const id of activas) {
        const r = regras[id];
        if (typeof r.detectarFicheiro !== 'function') continue;
        let marcas = [];
        try { marcas = r.detectarFicheiro(linhas, rel) || []; } catch { marcas = []; }
        for (const m of marcas) {
          const n = Number(m && m.linha);
          if (!Number.isInteger(n) || n < 1 || n > linhas.length) continue;
          const msg = typeof r.enunciado === 'function' ? String(r.enunciado(m.valor)) : '';
          apontamentos.push({ file: rel, line: n, rule: id, msg });
          porRegra[id] += 1;
        }
      }

      for (let i = 0; i < linhas.length; i += 1) {
        const l = limparLinha(linhas[i]);
        if (!l.trim()) continue;
        for (const id of activas) {
          if (typeof regras[id].detectar !== 'function') continue;
          let bate = false;
          try { bate = Boolean(regras[id].detectar(l, rel, i + 1)); } catch { bate = false; }
          if (bate) {
            const msg = typeof regras[id].enunciado === 'function' ? String(regras[id].enunciado(l.trim())) : '';
            apontamentos.push({ file: rel, line: i + 1, rule: id, msg });
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
    regras_recusadas: regrasRecusadas(regras, { limiares: LIMIARES }),
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
