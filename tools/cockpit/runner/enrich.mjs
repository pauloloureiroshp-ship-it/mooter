#!/usr/bin/env node
/**
 * enrich.mjs — dar ao modelo o que ele nao tinha, e NADA mais.
 *
 * O que o loop mostrava ao modelo era uma fatia de ficheiro sem numeros de
 * linha e sem contexto: nem onde o simbolo e definido, nem quem lhe chama, nem
 * em que funcao a linha vive. Depois pedia-se-lhe que citasse `ficheiro:linha`
 * e que dissesse o que la estava. Medido a 2026-09-01 sobre 1072 achados:
 * 18,8% transcreveram bem e apontaram a linha errada, e 40,2% nao transcreveram
 * linha nenhuma. Nao e um modelo mau a responder — e uma pergunta feita as
 * cegas.
 *
 * Este estagio monta o pacote {achado, snippet, trace} de forma determinística,
 * antes de qualquer chamada a um motor. Sem rede, sem LLM, $0.
 *
 * ⚠️ NAO JULGA NADA (M2: o instrumento nunca se auto-avalia). Nao ha veredicto,
 * nao ha score, nao ha "isto parece um bug". Se algum dia aparecer aqui um
 * campo com um juizo, este ficheiro deixou de ser o que diz que e.
 *
 * DEGRADACAO GRACIOSA, E DECLARADA: usa `ast-grep` quando existe, e cai para
 * uma varredura por expressao regular quando nao existe. O pacote DIZ SEMPRE
 * qual foi (`ferramenta`) — um contexto por regex apresentado como analise de
 * sintaxe seria exactamente a especie de verde-que-mente que este projecto
 * existe para nao produzir.
 */

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
export const REPO = path.resolve(AQUI, '..', '..', '..');

/** Quantas linhas de contexto, de cada lado do alvo. */
export const CONTEXTO = 12;
/** Tectos. Um pacote que nao cabe numa janela de contexto nao serve de nada. */
export const MAX_REFS = 20;
export const MAX_CALLERS = 12;

const LINGUAGEM = {
  '.js': 'js', '.mjs': 'js', '.cjs': 'js', '.jsx': 'jsx',
  '.ts': 'ts', '.tsx': 'tsx', '.py': 'python', '.sh': 'bash', '.html': 'html',
};

/** A ferramenta disponivel, medida — nunca assumida. */
export function ferramentaDisponivel({ execImpl = execFileSync } = {}) {
  for (const bin of ['ast-grep', 'sg']) {
    try {
      const v = String(execImpl(bin, ['--version'], { encoding: 'utf8' })).trim();
      // O \`--version\` do ast-grep ja imprime o nome ('ast-grep 0.45.3'); guardar
      // os dois e depois imprimir os dois dava 'ast-grep ast-grep 0.45.3'.
      return { nome: bin, versao: v.replace(new RegExp('^' + bin + '\\s+'), ''), ast: true };
    } catch { /* proximo */ }
  }
  return { nome: 'regex', versao: 'interno', ast: false };
}

/**
 * O simbolo de que a linha fala.
 *
 * Nao e "o primeiro identificador": e o primeiro que nao seja palavra da
 * linguagem, pela mesma razao que no `receipts-check.mjs` — `const` esta em
 * todas as linhas e nao identifica coisa nenhuma.
 */
const PALAVRAS = new Set([
  'const', 'let', 'var', 'function', 'return', 'class', 'import', 'export',
  'from', 'this', 'new', 'await', 'async', 'if', 'else', 'for', 'while',
  'try', 'catch', 'throw', 'typeof', 'def', 'self', 'null', 'true', 'false',
  'undefined', 'void', 'string', 'number', 'boolean', 'require', 'module',
]);

export function simboloDaLinha(linha) {
  for (const m of String(linha || '').matchAll(/[A-Za-z_$][\w$]{2,}/g)) {
    if (!PALAVRAS.has(m[0].toLowerCase())) return m[0];
  }
  return null;
}

/**
 * O contexto COM NUMEROS DE LINHA.
 *
 * Os numeros nao sao decoracao: sao o alvo directo do balde `linha-errada`.
 * Um modelo a quem se mostra texto sem numeros e depois se pede um numero esta
 * a ser convidado a contar linhas de cabeca.
 */
export function snippet(conteudo, linha, { contexto = CONTEXTO } = {}) {
  const linhas = String(conteudo).split('\n');
  const de = Math.max(1, linha - contexto);
  const ate = Math.min(linhas.length, linha + contexto);
  return {
    de,
    ate,
    total_do_ficheiro: linhas.length,
    texto: linhas.slice(de - 1, ate)
      .map((l, i) => `${String(de + i).padStart(5)}${de + i === linha ? ' >' : '  '}| ${l}`)
      .join('\n'),
  };
}

/**
 * A funcao (ou bloco de topo) onde a linha vive — subindo pela indentacao.
 *
 * Deliberadamente sintatico-por-indentacao e nao por AST: e o unico metodo que
 * funciona igual nas cinco linguagens deste repo e que nao muda de resposta
 * consoante a ferramenta que estiver instalada.
 */
export function trace(conteudo, linha) {
  const linhas = String(conteudo).split('\n');
  const alvo = linhas[linha - 1];
  if (alvo == null) return [];
  const indenta = (l) => (l.length - l.trimStart().length);
  let nivel = indenta(alvo);
  const cadeia = [];
  for (let i = linha - 2; i >= 0 && cadeia.length < 4; i -= 1) {
    const l = linhas[i];
    if (!l.trim()) continue;
    const n = indenta(l);
    if (n >= nivel) continue;
    if (/^\s*(?:\}|\)|\]|\*|\/\/|#)/.test(l)) { nivel = n; continue; }
    cadeia.push({ linha: i + 1, texto: l.trim().slice(0, 120) });
    nivel = n;
    if (n === 0) break;
  }
  return cadeia.reverse();
}

function correrAstGrep(bin, args, { execImpl = execFileSync, cwd = REPO } = {}) {
  try {
    const saida = String(execImpl(bin, args, { encoding: 'utf8', cwd, maxBuffer: 8 * 1024 * 1024 }));
    return saida.trim() ? JSON.parse(saida) : [];
  } catch { return []; }
}

const daMatch = (m) => ({
  ficheiro: m.file,
  // ast-grep conta linhas a partir de 0; toda a gente neste repo conta a
  // partir de 1. Converter aqui uma vez e melhor do que enganar-se em todo o
  // lado — e um off-by-one num numero de linha e exactamente o defeito que
  // este estagio existe para reduzir.
  linha: (m.range && m.range.start && m.range.start.line + 1) || null,
  texto: String(m.lines || m.text || '').trim().slice(0, 160),
});

/** Onde o simbolo e definido, referido e chamado. Vazio quando nao se sabe. */
export function vizinhosDoSimbolo(simbolo, {
  ferramenta = ferramentaDisponivel(), raiz = REPO, execImpl = execFileSync,
  linguagem = 'js', readdirImpl = null,
} = {}) {
  if (!simbolo) return { defs: [], refs: [], callers: [], via: ferramenta.nome };
  if (ferramenta.ast) {
    const corre = (padrao) => correrAstGrep(
      ferramenta.nome,
      ['run', '-p', padrao, '-l', linguagem, '--json=compact', '.'],
      { execImpl, cwd: raiz },
    ).map(daMatch);
    const defs = [
      ...corre(`function ${simbolo}($$$) { $$$ }`),
      ...corre(`const ${simbolo} = $$$`),
      ...corre(`class ${simbolo} { $$$ }`),
    ];
    const callers = corre(`${simbolo}($$$)`);
    const refs = corre(simbolo);
    return {
      via: `${ferramenta.nome} ${ferramenta.versao}`,
      defs: defs.slice(0, MAX_REFS),
      callers: callers.slice(0, MAX_CALLERS),
      refs: refs.slice(0, MAX_REFS),
    };
  }
  return {
    via: 'regex (ast-grep ausente — contexto SINTATICO nao foi feito)',
    defs: [], callers: [], refs: [],
    aviso: 'sem ast-grep instalado este pacote NAO traz defs/refs/callers. '
      + 'Instalar: npm i -g @ast-grep/cli',
  };
}

/**
 * O pacote. `achado` entra tal e qual — nao se reescreve o que o loop disse.
 */
export function enriquecer(achado, {
  raiz = REPO, readImpl = fs.readFileSync, ferramenta = null, execImpl = execFileSync,
  contexto = CONTEXTO,
} = {}) {
  const a = achado || {};
  const ficheiro = a.ficheiro;
  const linha = Number(a.linha);
  const ferr = ferramenta || ferramentaDisponivel({ execImpl });
  if (!ficheiro || !Number.isInteger(linha) || linha < 1) {
    return { achado: a, alvo: null, ferramenta: ferr, porque: 'o achado nao aponta ficheiro:linha' };
  }
  const abs = path.resolve(raiz, ficheiro);
  if (abs !== raiz && !abs.startsWith(raiz + path.sep)) {
    return { achado: a, alvo: null, ferramenta: ferr, porque: 'caminho fora do repo' };
  }
  let conteudo;
  try { conteudo = readImpl(abs, 'utf8'); }
  catch { return { achado: a, alvo: null, ferramenta: ferr, porque: 'ficheiro inexistente' }; }

  const linhas = conteudo.split('\n');
  if (linha > linhas.length) {
    return {
      achado: a, alvo: { ficheiro, linha }, ferramenta: ferr,
      porque: `a linha ${linha} nao existe (o ficheiro tem ${linhas.length})`,
    };
  }
  const texto = linhas[linha - 1];
  const simbolo = simboloDaLinha(texto);
  const lang = LINGUAGEM[path.extname(ficheiro)] || 'js';
  return {
    achado: a,
    alvo: { ficheiro, linha, texto: texto.trim().slice(0, 200), simbolo },
    ferramenta: ferr,
    snippet: snippet(conteudo, linha, { contexto }),
    trace: trace(conteudo, linha),
    ...vizinhosDoSimbolo(simbolo, { ferramenta: ferr, raiz, execImpl, linguagem: lang }),
  };
}

function main() {
  const arg = (n, o) => { const i = process.argv.indexOf(n); return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : o; };
  const ficheiro = arg('--ficheiro', null);
  const linha = Number(arg('--linha', 0));
  if (!ficheiro || !linha) {
    process.stderr.write('uso: enrich.mjs --ficheiro <caminho> --linha <n> [--json]\n');
    process.exit(2);
  }
  const p = enriquecer({ ficheiro, linha });
  if (process.argv.includes('--json')) { process.stdout.write(`${JSON.stringify(p, null, 2)}\n`); return; }
  process.stdout.write(
    `alvo: ${ficheiro}:${linha}${p.alvo && p.alvo.simbolo ? ` · simbolo \`${p.alvo.simbolo}\`` : ''}\n` +
    `ferramenta: ${p.via || p.ferramenta.nome}\n` +
    `${p.porque ? `${p.porque}\n` : ''}` +
    `${p.trace && p.trace.length ? `trace: ${p.trace.map((t) => `${t.linha}: ${t.texto}`).join(' > ')}\n` : ''}` +
    `${p.snippet ? `\n${p.snippet.texto}\n` : ''}` +
    `${p.defs ? `\ndefs ${p.defs.length} · callers ${p.callers.length} · refs ${p.refs.length}\n` : ''}` +
    `${p.aviso ? `⚠️  ${p.aviso}\n` : ''}`,
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
