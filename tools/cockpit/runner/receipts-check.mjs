#!/usr/bin/env node
/**
 * receipts-check.mjs — o estagio que faltava: a citacao existe, mas DIZ aquilo?
 *
 * O `evidence-verifier.mjs` (L0) responde a uma pergunta so: a linha citada
 * existe no disco? E uma boa pergunta e apanhou referencias fabricadas. Mas
 * deixa passar inteira a classe seguinte, que e a que domina o ledger deste
 * projecto: o modelo cita `ficheiro.js:491` — que existe — e a seguir escreve
 * o que supostamente esta la, e isso NAO e conferido contra nada.
 *
 * Um recibo assim e verde e nao prova coisa nenhuma. Foi por isso que 607 dos
 * 1071 achados triados (56,7%, ver `baseline-2026-09-01.json`) sairam com o
 * motivo `instrumento-nao-discrimina`: nao sao falsos — sao SEM VALOR
 * PROBATORIO, porque a maquina que os emitiu emitiria o mesmo perante codigo
 * limpo.
 *
 * Este estagio corre DEPOIS do achado e e determinístico: le a alegacao que o
 * proprio modelo escreveu (`LINE 491: event.agent || 'unknown'`), vai ao
 * ficheiro, e compara. Sem LLM, sem rede, $0.
 *
 * O QUE ELE NAO FAZ, de proposito: nao julga se o achado esta CERTO. Uma
 * alegacao que bate continua a poder ter a conclusao errada — esse motivo ja
 * existe na triagem e e outro eixo (M2: o instrumento nunca se auto-avalia).
 * Aqui so se separa "citou e transcreveu bem" de "citou e inventou o que la
 * estava".
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
export const REPO = path.resolve(AQUI, '..', '..', '..');

/**
 * Os veredictos deste estagio. Fechado, e `sem-evidencia` e o que interessa —
 * um balde PROPRIO, separado de `instrumento-nao-discrimina`. Misturar os dois
 * destruiria o unico sinal que a distincao produz: "a maquina nao sabe
 * distinguir" e "a maquina transcreveu mal" pedem trabalho oposto.
 */
export const VEREDICTO = Object.freeze({
  BATE: 'evidencia-bate',
  SEM: 'sem-evidencia',
  /**
   * O conteudo alegado EXISTE no ficheiro — noutra linha.
   *
   * Balde proprio, e a razao e a mesma que fez nascer o
   * `instrumento-nao-discrimina` na triagem: sao diagnosticos OPOSTOS e pedem
   * trabalho oposto. "Inventou o que la estava" ataca-se com um verificador;
   * "transcreveu bem e apontou o sitio errado" ataca-se com numeracao de
   * linhas no que se mostra ao modelo. Somar os dois destruiria a escolha
   * entre eles — e um numero que se estraga a si proprio nao e um numero.
   */
  LINHA_ERRADA: 'linha-errada',
  SEM_ALEGACAO: 'sem-alegacao',
  NAO_APLICA: 'nao-aplica',
});

/** Abaixo disto uma alegacao nao discrimina nada — `x` esta em qualquer linha. */
export const MIN_ALEGACAO = 8;

/**
 * Quantas linhas a seguir a citada ainda contam como a mesma coisa.
 *
 * A primeira versao deste ficheiro comparava SO a linha N, e acusou em falso.
 * Medido nos exemplos reais: o modelo escreve
 *   `LINE 170: spawnSync('nvidia-smi', ['--query-gpu=...'], ...)`
 * e no disco a linha 170 e `const r = spawnSync(` — a chamada continua nas
 * tres linhas seguintes. A transcricao esta CERTA; o que estava errado era o
 * verificador, que exigia que uma expressao multi-linha coubesse numa.
 *
 * Acusar em falso e o mesmo erro ao contrario, e num ficheiro cuja razao de
 * existir e separar prova de ruido seria o pior erro possivel. Por isso a
 * conferencia tem TRES resultados e nao dois: bate na linha, bate na vizinhanca
 * (e diz que foi na vizinhanca), ou nao esta la de todo.
 */
export const JANELA_LINHAS = 8;

/** Fraccao de uma alegacao que basta bater quando a geracao foi truncada. */
export const PREFIXO_MIN_PCT = 0.9;
/** Abaixo deste tamanho, um prefixo de 90% nao prova nada. */
export const MIN_ALEGACAO_TRUNCADA = 24;
/** E a cauda em falta tem de ser pequena em absoluto, nao so em percentagem. */
export const MAX_CAUDA_TRUNCADA = 12;

/**
 * `LINE 491: ...` / `LINHA 491: ...`. O conteudo vai ate a proxima alegacao ou
 * ao fim — os modelos escrevem-nas em cadeia, numa linha so.
 */
const ALEGACAO_RE = /\b(?:LINE|LINHA)\s+(\d+)\s*:\s*([\s\S]*?)(?=\b(?:LINE|LINHA)\s+\d+\s*:|\b(?:EXITS?\s+AT|PROOF|PROVA|SEED\s+VISIBLE|REPEATED|COMMENT|CODE)\b|$)/gi;

/**
 * Comparar codigo transcrito por um modelo com o disco tem uma armadilha: o
 * modelo reformata. Espacos, quebras de linha, `;` final, aspas curvas. Comparar
 * cru daria falso-negativos em massa e o estagio novo seria pior do que nenhum.
 *
 * Espreme-se TODO o espaco branco e normalizam-se as aspas. O que sobra e
 * substancia — e nao se toca em maiusculas, porque codigo distingue.
 */
export function espremer(s) {
  return String(s ?? '')
    .replace(/[‘’‛]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, '')
    // Uma virgula pendente antes de um fechador nao e substancia — e estilo.
    // Medido: o modelo transcreveu `{ encoding:'utf8', timeout:3000 }` e o
    // disco tem `{encoding:'utf8',timeout:3000,});` (virgula final + fecho na
    // linha seguinte). A transcricao estava CERTA e era acusada.
    .replace(/,(?=[)\]}])/g, '')
    .replace(/;$/, '');
}

/** As alegacoes de conteudo que o proprio modelo escreveu. */
export function extrairAlegacoes(texto, { max = 12 } = {}) {
  const out = [];
  const vistas = new Set();
  ALEGACAO_RE.lastIndex = 0;
  let m;
  while ((m = ALEGACAO_RE.exec(String(texto || ''))) !== null) {
    const linha = Number(m[1]);
    const conteudo = String(m[2] || '').trim().replace(/^```+|```+$/g, '').trim();
    if (!Number.isInteger(linha) || linha < 1) continue;
    const chave = `${linha}:${espremer(conteudo)}`;
    if (vistas.has(chave)) continue;
    vistas.add(chave);
    out.push({ linha, conteudo });
    if (out.length >= max) break;
  }
  return out;
}

/**
 * Palavras da linguagem, nao nomes de coisas.
 *
 * A deteccao de parafrase pergunta "o identificador de que ele fala esta nesta
 * linha?". Se a resposta puder ser `const`, esta em TODAS as linhas — e o
 * verificador absolve tudo. Foi o que aconteceu: `const inventado = 99` era
 * absolvido contra `const b = 2` porque as duas linhas tem a palavra `const`.
 */
const PALAVRAS_DA_LINGUAGEM = new Set([
  'const', 'let', 'var', 'function', 'return', 'class', 'import', 'export',
  'from', 'this', 'new', 'await', 'async', 'if', 'else', 'for', 'while',
  'type', 'interface', 'public', 'private', 'static', 'def', 'self', 'null',
  'true', 'false', 'undefined', 'void', 'string', 'number', 'boolean',
]);

/** O primeiro nome PROPRIO da alegacao — nunca uma palavra da linguagem. */
export function identificadorDe(texto) {
  for (const m of String(texto || '').matchAll(/[A-Za-z_$][\w$]{2,}/g)) {
    if (!PALAVRAS_DA_LINGUAGEM.has(m[0].toLowerCase())) return m[0];
  }
  return null;
}

/** Recusa qualquer caminho que saia do repo antes de tocar no disco. */
function dentroDoRepo(raiz, rel) {
  const root = path.resolve(raiz);
  const abs = path.resolve(root, rel);
  return abs === root || abs.startsWith(root + path.sep) ? abs : null;
}

/**
 * Confronta UMA alegacao com o disco.
 *
 * `bate` quando a substancia da alegacao esta na linha real, ou a linha real
 * esta na alegacao (o modelo cita ora um pedaco, ora a linha com contexto).
 * `curta` quando a alegacao e demasiado pequena para discriminar — nao e
 * falha, e ausencia de prova, e dizer o contrario seria inventar ao contrario.
 */
export function conferirAlegacao(raiz, ficheiro, alegacao, { readImpl = fs.readFileSync, janela = JANELA_LINHAS } = {}) {
  const base = { linha: alegacao.linha, alegado: alegacao.conteudo };
  const abs = dentroDoRepo(raiz, ficheiro);
  if (!abs) return { ...base, bate: false, porque: 'fora-do-repo', real: null };
  let cru;
  try { cru = readImpl(abs, 'utf8'); }
  catch { return { ...base, bate: false, porque: 'ficheiro-inexistente', real: null }; }
  const linhas = cru.split('\n');
  if (alegacao.linha > linhas.length) {
    return { ...base, bate: false, porque: `linha-fora-do-ficheiro (tem ${linhas.length})`, real: null };
  }
  const real = linhas[alegacao.linha - 1];
  const a = espremer(alegacao.conteudo);
  if (a.length < MIN_ALEGACAO) {
    return { ...base, bate: null, porque: 'alegacao-curta', real: real.trim().slice(0, 160) };
  }
  const r = espremer(real);
  if (r.includes(a) || (r.length >= MIN_ALEGACAO && a.includes(r))) {
    return { ...base, bate: true, porque: 'ok', real: real.trim().slice(0, 160) };
  }
  // A vizinhanca: uma expressao multi-linha citada como uma so continua a ser
  // uma transcricao verdadeira. Diz-se ONDE bateu — nao se finge que bateu na
  // linha pedida.
  // Ao juntar, tiram-se os marcadores de continuacao de comentario (` * `,
  // `//`, `#`): uma frase partida por um bloco `/** */` continua a ser a mesma
  // frase, e o `*` do inicio da linha seguinte nao faz parte dela.
  const vizinhanca = espremer(
    linhas.slice(alegacao.linha - 1, alegacao.linha - 1 + janela)
      .map((l, i) => (i === 0 ? l : l.replace(/^\s*(?:\*|\/\/|#)\s?/, '')))
      .join(''),
  );
  // A vizinhanca so absolve se o que foi citado COMECAR na linha citada. Sem
  // esta condicao, uma janela de 8 linhas engolia o caso oposto — conteudo real
  // tres linhas abaixo passava por "expressao multi-linha" e o balde
  // `linha-errada` ficava vazio por construcao.
  const posicao = vizinhanca.indexOf(a);
  if (posicao >= 0 && posicao < Math.max(r.length, 1)) {
    return { ...base, bate: true, porque: `bate nas ${janela} linhas a partir da citada`, real: real.trim().slice(0, 160) };
  }
  // GERACAO TRUNCADA. O modelo tem tecto de tokens e as respostas acabam a
  // meio. Medido: `...'hw-capability.json'), 'utf8')) R` — a transcricao esta
  // certa e o que sobra e meia palavra do que ele ia escrever a seguir. Um
  // prefixo longo que bate e prova; exigir o fim exacto seria castigar o
  // modelo pelo tecto que nos lhe pusemos.
  // So para alegacoes LONGAS, e so quando o que falta e pouco em termos
  // absolutos. Sem os dois limites, `temperature = 0` (13 caracteres) casava
  // com a palavra `temperature` sozinha e uma parafrase passava por
  // transcricao — o verificador absolvia por preguica.
  const prefixo = a.slice(0, Math.floor(a.length * PREFIXO_MIN_PCT));
  const posPrefixo = vizinhanca.indexOf(prefixo);
  if (a.length >= MIN_ALEGACAO_TRUNCADA
      && a.length - prefixo.length <= MAX_CAUDA_TRUNCADA
      && posPrefixo >= 0 && posPrefixo < Math.max(r.length, 1)) {
    return { ...base, bate: true, porque: 'bate ate onde a resposta foi truncada', real: real.trim().slice(0, 160) };
  }
  // PARAFRASE, NAO TRANSCRICAO. Metade das perguntas de pilar pedem ao modelo
  // que RESUMA a linha (`LINE 99: temperature = 0`), e no disco esta
  // `temperature: req.temperature ?? 0,`. Ele nao transcreveu nem inventou —
  // resumiu, que foi o que lhe pediram. Este verificador NAO consegue julgar
  // isso, e dizer que nao ha evidencia seria inventar ao contrario. Sai `null`:
  // nao conferivel, e conta como ausencia de prova, nunca como prova negativa.
  const identificador = identificadorDe(alegacao.conteudo);
  if (identificador && espremer(real).includes(identificador)) {
    return {
      ...base,
      bate: null,
      porque: 'alegacao parafraseada — o identificador esta na linha, a frase nao e uma transcricao',
      real: real.trim().slice(0, 160),
    };
  }
  // Antes de acusar, procura-se no ficheiro INTEIRO. Se a transcricao esta
  // certa e so a linha e que nao, isso e outro defeito — e nao se lhe pode
  // chamar "sem evidencia" quando a evidencia esta ali, dez linhas acima.
  const onde = linhas.findIndex((l) => espremer(l).includes(a));
  if (onde >= 0) {
    return {
      ...base,
      bate: false,
      linha_errada: true,
      encontrado_na_linha: onde + 1,
      porque: `transcricao certa, linha errada — esta na ${onde + 1}, foi citada a ${alegacao.linha}`,
      real: real.trim().slice(0, 160),
    };
  }
  return {
    ...base,
    bate: false,
    linha_errada: false,
    porque: 'o que esta na linha (e nas seguintes) nao e o que foi alegado, e nao esta no ficheiro',
    real: real.trim().slice(0, 160),
  };
}

/**
 * O veredicto de um recibo inteiro.
 *
 * UMA alegacao que nao bate chega para `sem-evidencia`: um recibo em que parte
 * da transcricao e inventada nao e meio-recibo, e um recibo que nao se pode
 * usar. E a mesma regra do L0, e existe pela mesma razao.
 */
export function conferirRecibo(recibo, { raiz = REPO, readImpl = fs.readFileSync } = {}) {
  const r = recibo || {};
  if (r.conclusao !== 'achado') {
    return { veredicto: VEREDICTO.NAO_APLICA, alegacoes: [], porque: 'nao e um achado' };
  }
  const ficheiro = r.ficheiro;
  // SO o `resultado_resumo`: e a resposta do MODELO. O campo `evidencia` e
  // escrito pelo nosso proprio verificador ("cited ... => <linha real>"), e
  // deixa-lo entrar aqui era conferir a maquina contra ela propria — a
  // alegacao passava por bater porque o texto ja continha a linha verdadeira.
  const texto = r.resultado_resumo || '';
  if (!ficheiro) {
    return { veredicto: VEREDICTO.SEM_ALEGACAO, alegacoes: [], porque: 'o recibo nao diz de que ficheiro fala' };
  }
  const alegacoes = extrairAlegacoes(texto).map((a) => conferirAlegacao(raiz, ficheiro, a, { readImpl }));
  const uteis = alegacoes.filter((a) => a.bate !== null);
  if (!uteis.length) {
    return {
      veredicto: VEREDICTO.SEM_ALEGACAO,
      alegacoes,
      porque: alegacoes.length
        ? 'so alegacoes curtas de mais para discriminar'
        : 'o achado nao transcreve uma unica linha — nao ha o que conferir',
    };
  }
  const falhadas = uteis.filter((a) => a.bate === false);
  if (!falhadas.length) {
    return { veredicto: VEREDICTO.BATE, alegacoes, porque: `${uteis.length} alegacao(oes) conferida(s)` };
  }
  // Se TODAS as falhas sao de sitio e nenhuma de substancia, o defeito e a
  // numeracao, nao a invencao. Uma unica alegacao inventada, porem, chega para
  // `sem-evidencia`: um recibo com parte da transcricao fabricada nao e
  // meio-recibo, e um recibo que nao se pode usar.
  const inventadas = falhadas.filter((a) => !a.linha_errada);
  return inventadas.length
    ? {
      veredicto: VEREDICTO.SEM,
      alegacoes,
      porque: `${inventadas.length} de ${uteis.length} alegacoes nao existem no ficheiro`,
    }
    : {
      veredicto: VEREDICTO.LINHA_ERRADA,
      alegacoes,
      porque: `${falhadas.length} de ${uteis.length} alegacoes estao noutra linha do mesmo ficheiro`,
    };
}

/** Corre sobre um ledger inteiro e conta. Para medir, nao para decidir. */
export function conferirLedger(recibos, opcoes = {}) {
  const contas = {
    [VEREDICTO.BATE]: 0, [VEREDICTO.SEM]: 0, [VEREDICTO.LINHA_ERRADA]: 0,
    [VEREDICTO.SEM_ALEGACAO]: 0, [VEREDICTO.NAO_APLICA]: 0,
  };
  const detalhe = [];
  for (const rec of recibos || []) {
    const v = conferirRecibo(rec, opcoes);
    contas[v.veredicto] += 1;
    if (v.veredicto === VEREDICTO.SEM) detalhe.push({ chave: rec.chave || null, ...v });
  }
  return { contas, detalhe };
}

function main() {
  const i = process.argv.indexOf('--ledger');
  const alvo = i >= 0 && process.argv[i + 1]
    ? process.argv[i + 1]
    : path.join(process.env.HOME || '.', '.mooter', 'runner-ledger.jsonl');
  const recibos = fs.readFileSync(alvo, 'utf8').trim().split('\n')
    .filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
  const { contas, detalhe } = conferirLedger(recibos);
  const achados = contas[VEREDICTO.BATE] + contas[VEREDICTO.SEM]
    + contas[VEREDICTO.LINHA_ERRADA] + contas[VEREDICTO.SEM_ALEGACAO];
  if (process.argv.includes('--json')) {
    process.stdout.write(`${JSON.stringify({ contas, achados, exemplos: detalhe.slice(0, 10) }, null, 2)}\n`);
    return;
  }
  const pct = (n) => (achados ? `${(n / achados * 100).toFixed(1)}%` : 'n/d');
  process.stdout.write(
    `receipts-check · ${recibos.length} recibos, ${achados} achados\n` +
    `  evidencia-bate  ${String(contas[VEREDICTO.BATE]).padStart(5)}  ${pct(contas[VEREDICTO.BATE])}\n` +
    `  sem-evidencia   ${String(contas[VEREDICTO.SEM]).padStart(5)}  ${pct(contas[VEREDICTO.SEM])}\n` +
    `  linha-errada    ${String(contas[VEREDICTO.LINHA_ERRADA]).padStart(5)}  ${pct(contas[VEREDICTO.LINHA_ERRADA])}\n` +
    `  sem-alegacao    ${String(contas[VEREDICTO.SEM_ALEGACAO]).padStart(5)}  ${pct(contas[VEREDICTO.SEM_ALEGACAO])}\n`,
  );
  for (const d of detalhe.slice(0, 5)) {
    const f = d.alegacoes.find((a) => a.bate === false);
    process.stdout.write(`\n  ${d.chave}\n    alegado: ${String(f.alegado).slice(0, 90)}\n    real:    ${f.real}\n`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
