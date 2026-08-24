/**
 * triagem.mjs — fechar o ciclo: um achado nasce, e alguem decide sobre ele.
 *
 * Ate aqui o motor produzia recibos e mais nada acontecia. Um achado que
 * ninguem aceita nem descarta nao e trabalho: e ruido com carimbo. Sem triagem
 * nao ha um unico numero de ROI que signifique alguma coisa — nao se sabe
 * quantos achados valiam, so quantos foram impressos.
 *
 * O registo e append-only (`triagem.jsonl`, por projecto). A ultima decisao
 * sobre uma chave e a que vale, e as anteriores ficam: mudar de ideias e
 * legitimo, apagar o rasto nao.
 *
 * Determinístico, sem rede, sem LLM. Os precos vem de `tools/router/pricing.js`
 * — a tabela real do repo — e NUNCA sao inventados aqui.
 */

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

/** O que se pode decidir sobre um achado. Fechado de proposito. */
export const DECISOES = Object.freeze(['aceite', 'descartado', 'issue']);

/**
 * PORQUE e que foi descartado. Fechado, e obrigatorio no descarte.
 *
 * Medido a 2026-08-19: 74 decisoes de triagem, 72 DESCARTES. Uma taxa de
 * descarte de 97% que nao diz nada, porque a `nota` era texto livre e estava
 * quase sempre vazia. E o unico dado que distingue os dois futuros possiveis
 * deste produto:
 *
 *   `nao-e-um-problema` a dominar        -> o defeito esta na PERGUNTA
 *   `fora-do-que-estou-a-fazer` a dominar -> o defeito esta na RELEVANCIA
 *
 * Sao diagnosticos opostos e pedem trabalho oposto. Sem esta lista, escolher
 * entre eles seria adivinhar — e este projecto nao adivinha numeros.
 */
export const MOTIVOS = Object.freeze([
  'nao-e-um-problema',
  'ja-sabido',
  'fora-do-que-estou-a-fazer',
  'citacao-certa-conclusao-errada',
  'trivial',
  // Acrescentado a 2026-08-22, e a lista era fechada de proposito — por isso a
  // razao tem de ficar escrita.
  //
  // Os cinco de cima sao juizos sobre O ACHADO: alguem olhou e decidiu. Este nao
  // e: e um juizo sobre O INSTRUMENTO. O ensaio do defeito semeado provou que
  // P1, P4, P5 e P7 respondem o mesmo com defeito e sem defeito — nao
  // discriminam. Os 1114 achados que produziram nao sao falsos (nao os li um a
  // um, e dize-lo seria inventar ao contrario): sao SEM VALOR PROBATORIO, porque
  // a maquina que os emitiu emitiria o mesmo perante codigo limpo.
  //
  // Precisa de ser motivo proprio e nao um dos cinco. Carimbar 1114 achados com
  // `nao-e-um-problema` ou `fora-do-que-estou-a-fazer` afogaria as 74 decisoes
  // reais do dono e destruiria exactamente o sinal que esta lista existe para
  // produzir — a escolha entre "o defeito esta na PERGUNTA" e "esta na
  // RELEVANCIA". Um numero que se estraga a si proprio nao e um numero.
  'instrumento-nao-discrimina',
]);

/**
 * QUEM decidiu. Fechado de proposito, e a razao e o proprio numero de ROI: uma
 * decisao tomada por um agente e util, mas nao vale o mesmo que a do dono, e
 * juntar as duas numa contagem so tornaria a metrica exactamente aquilo que
 * este projecto se recusa a produzir. O painel escreve 'dono'; um agente tem
 * de se identificar.
 */
export const AUTORES = Object.freeze(['dono', 'claude', 'agente']);

/**
 * A identidade de um achado para efeitos de triagem.
 *
 * Prefere a `chave` do recibo (ficheiro:linhas:sha do conteudo): assim, decidir
 * sobre um achado decide sobre ELE, e nao sobre "o que quer que estivesse
 * naquela linha naquele instante". Sem chave (recibos antigos, eventos), cai
 * para a posicao mais o instante, que e o melhor que esses recibos permitem.
 */
export function chaveDoRecibo(r) {
  if (!r) return null;
  if (r.chave) return String(r.chave);
  if (r.ficheiro) return `${r.ficheiro}:${r.janela ?? '?'}@${r.ts ?? '?'}`;
  return null;
}

/** Um achado e uma ronda em que o modelo AFIRMOU alguma coisa e a citacao resolveu. */
export function ehAchado(r) {
  return Boolean(r) && !r.evento && r.conclusao === 'achado' && r.verdict === 'citacao-ok';
}

/**
 * Le o registo. Um ficheiro ilegivel devolve vazio — nao se para o painel por
 * causa disto — mas uma LINHA partida a meio de um ficheiro bom e contada e
 * reportada: engolir metade do registo em silencio seria dizer que ninguem
 * triou nada.
 */
export function lerTriagem(caminho, { readImpl = fs.readFileSync } = {}) {
  let bruto;
  try {
    bruto = readImpl(caminho, 'utf8');
  } catch {
    return { decisoes: new Map(), linhas: 0, partidas: 0 };
  }
  const decisoes = new Map();
  let linhas = 0;
  let partidas = 0;
  for (const linha of String(bruto).split('\n')) {
    if (!linha.trim()) continue;
    linhas += 1;
    let e;
    try {
      e = JSON.parse(linha);
    } catch {
      partidas += 1;
      continue;
    }
    if (!e || !e.chave || !DECISOES.includes(e.decisao)) { partidas += 1; continue; }
    // Append-only: a ultima decisao sobre uma chave e a que vale.
    decisoes.set(String(e.chave), e);
  }
  return { decisoes, linhas, partidas };
}

/** Regista uma decisao. Devolve a entrada escrita, para o endpoint a poder ecoar. */
export function registarTriagem(caminho, { chave, decisao, recibo = null, por, nota = null, motivo = null, via = null, ts }) {
  if (!chave) throw new Error('triagem sem chave: nao se decide sobre o que nao se consegue identificar');
  if (!DECISOES.includes(decisao)) throw new Error(`decisao desconhecida: ${decisao} (aceites: ${DECISOES.join(', ')})`);
  // `por` NAO tem valor por omissao, e a ausencia do default e a correccao.
  // Ate 2026-08-24 a assinatura em falta virava `dono` em silencio, aqui e em
  // `contarTriagem`. Um campo que se auto-preenche com a autoridade mais alta
  // do sistema nao e proveniencia — e uma porta. Nenhum dos cinco chamadores
  // dependia do default, por isso torna-lo obrigatorio nao custa nada hoje e
  // fecha a porta ao proximo autor que se esqueca do campo.
  if (por === undefined || por === null || por === '') {
    throw new Error(`triagem sem autor: quem decide tem de se identificar (aceites: ${AUTORES.join(', ')})`);
  }
  if (!AUTORES.includes(por)) throw new Error(`autor desconhecido: ${por} (aceites: ${AUTORES.join(', ')})`);
  // O descarte SEM motivo deixa de ser aceite. Um `descartado` anonimo custa o
  // mesmo a escrever e nao ensina nada — foi assim que se acumularam 72.
  if (decisao === 'descartado' && !motivo) {
    throw new Error(`descartar exige um motivo (aceites: ${MOTIVOS.join(', ')})`);
  }
  if (motivo && !MOTIVOS.includes(motivo)) {
    throw new Error(`motivo desconhecido: ${motivo} (aceites: ${MOTIVOS.join(', ')})`);
  }
  const entrada = {
    ts: ts || new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
    chave: String(chave),
    decisao,
    por,
    // POR QUE CANAL entrou esta decisao. `por` diz quem ASSINA; `via` diz por
    // onde PASSOU.
    //
    // O QUE `via` NAO E: prova. Quem escreve escolhe os dois campos, e um
    // script que passe `por:'dono', via:'painel'` nao e apanhado por nada aqui.
    // Chamar-lhe "proveniencia auditavel" seria prometer uma fechadura que nao
    // existe — a fechadura exige uma credencial no canal do painel, e essa nao
    // esta feita.
    //
    // O QUE `via` E: um campo que o servidor preenche com o que OBSERVOU (ha
    // `Origin` no pedido, ou nao). Serve para distinguir escritas que se
    // declaram, e para que uma auditoria futura tenha onde pegar. Detecta `via`
    // ausente ou inconsistente; nao prova `via` presente.
    ...(via ? { via: String(via).slice(0, 60) } : {}),
    ...(motivo ? { motivo } : {}),
    ...(nota ? { nota: String(nota).slice(0, 500) } : {}),
    // Uma copia magra do que se estava a ver ao decidir. Sem isto, um
    // `triagem.jsonl` de daqui a um mes e uma lista de shas sem significado.
    ...(recibo ? {
      ficheiro: recibo.ficheiro ?? null,
      janela: recibo.janela ?? null,
      pilar: recibo.pilar ?? null,
      evidencia: recibo.evidencia ?? null,
      resumo: recibo.resultado_resumo ?? null,
    } : {}),
  };
  // A pasta do projecto pode nao existir: a triagem e a PRIMEIRA escrita do
  // painel num projecto que o loop ainda nao tocou.
  fs.mkdirSync(path.dirname(caminho), { recursive: true });
  fs.appendFileSync(caminho, `${JSON.stringify(entrada)}\n`);
  return entrada;
}

/** Os achados que ainda esperam por uma decisao, do mais recente para tras. */
export const LIMITE_TRIAGEM = 50;

/**
 * A fila de triagem, cortada nos mais recentes.
 *
 * O corte e real e NAO se ve daqui: quem le esta lista nao sabe se ficaram 0
 * ou 400 de fora. Quem publica tem de emparelha-la com `contarTriagem().
 * por_triar`, que conta o ledger inteiro -- e e o que o `/fleet.json` faz.
 */
export function porTriar(receipts, decisoes, limite = LIMITE_TRIAGEM) {
  const out = [];
  for (let i = (receipts || []).length - 1; i >= 0 && out.length < limite; i -= 1) {
    const r = receipts[i];
    if (!ehAchado(r)) continue;
    const chave = chaveDoRecibo(r);
    if (!chave || (decisoes && decisoes.has(chave))) continue;
    out.push({
      chave,
      ts: r.ts ?? null,
      pilar: r.pilar ?? null,
      escopo: r.escopo ?? null,
      ficheiro: r.ficheiro ?? null,
      janela: r.janela ?? null,
      evidencia: r.evidencia ?? null,
      resumo: r.resultado_resumo ?? null,
    });
  }
  return out;
}

/** Quantos foram aceites, descartados, viraram issue — e quantos esperam. */
export function contarTriagem(receipts, decisoes) {
  // `do_dono` e a LISTA BRANCA: so entra aqui o que traz `por === 'dono'`
  // EXPLICITO. E o unico balde que o portao 2 pode usar, e a razao e o buraco
  // que ele fecha: uma lista negra ("tudo menos `agente`") deixa passar toda a
  // assinatura nova — foi assim que 1448 decisoes `claude` puseram o L2 a dizer
  // ao dono "you keep 0% of what it finds" sobre trabalho que nao era dele.
  const contas = {
    aceite: 0, descartado: 0, issue: 0, por_triar: 0, achados: 0,
    por_autor: {}, por_motivo: {}, sem_motivo: 0,
    do_dono: { aceite: 0, descartado: 0, issue: 0 },
  };
  const vistos = new Set();
  for (const r of receipts || []) {
    if (!ehAchado(r)) continue;
    const chave = chaveDoRecibo(r);
    if (!chave || vistos.has(chave)) continue;
    vistos.add(chave);
    contas.achados += 1;
    const d = decisoes && decisoes.get(chave);
    if (d) {
      contas[d.decisao] += 1;
      // Separado de proposito: 20 aceites do dono e 20 aceites de um agente nao
      // sao o mesmo dado, e uma contagem que os funde nao serve para decidir.
      //
      // A assinatura em falta cai em `n-d`, NAO em `dono`. Antes fazia
      // `d.por || 'dono'`: uma linha sem autor era promovida a decisao humana
      // na contagem que abre o nivel 2. Nao havia nenhuma no ledger real, mas
      // "ninguem pisou o buraco" nao e o mesmo que "nao ha buraco".
      const a = d.por || 'n-d';
      contas.por_autor[a] = (contas.por_autor[a] || 0) + 1;
      if (d.por === 'dono') contas.do_dono[d.decisao] += 1;
      // A distribuicao dos motivos E o dado da Fase A. `sem_motivo` conta os
      // descartes antigos, escritos antes de o motivo existir: sao 72 e nao se
      // reescrevem, mas tambem nao se disfarcam de dado que nunca foram.
      if (d.decisao === 'descartado') {
        if (d.motivo) contas.por_motivo[d.motivo] = (contas.por_motivo[d.motivo] || 0) + 1;
        else contas.sem_motivo += 1;
      }
    } else contas.por_triar += 1;
  }
  return contas;
}

/**
 * O custo de mandar UM achado a um motor pago, em USD.
 *
 * A tabela vem de `tools/router/pricing.js` — a do repo, em USD por milhao de
 * tokens. Um modelo que nao esteja la devolve `null`, e `null` mostra-se como
 * `n/d`: um custo inventado num botao seria a mentira mais cara que este
 * painel podia contar, porque e exactamente a tese do Mooter que ele afirma.
 */
export function custoEstimado(modelo, { tokensIn = 4000, tokensOut = 700 } = {}) {
  if (modelo === 'moo' || modelo === 'local' || modelo === 'ollama') {
    return { modelo, usd: 0, fonte: 'local', motivo: 'GPU do dono' };
  }
  let precos;
  try {
    ({ PRICES: precos } = require('../../router/pricing.js'));
  } catch {
    return { modelo, usd: null, fonte: 'n/a', motivo: 'tabela de precos ilegivel' };
  }
  const p = precos && precos[modelo];
  if (!p || typeof p.input !== 'number' || typeof p.output !== 'number') {
    return { modelo, usd: null, fonte: 'n/a', motivo: 'modelo fora da tabela' };
  }
  const usd = (tokensIn / 1e6) * p.input + (tokensOut / 1e6) * p.output;
  return { modelo, usd: Math.round(usd * 1e6) / 1e6, fonte: 'tools/router/pricing.js', tokensIn, tokensOut };
}

/**
 * O menu de motores para o selector, cada um com o seu custo REAL por achado.
 *
 * `claude-fable-5` (T5) fica DE FORA de proposito. Pela escada de tiers do
 * projecto, T5/Fable e opt-in exclusivamente via `@fable` e NUNCA e alcancavel
 * por escolha de tier — um menu de escalação que o oferecesse estaria a
 * violar essa doutrina, nao so a mostrar um preco.
 */
export function menuDeMotores(opts = {}) {
  return [
    { id: 'moo', etiqueta: 'moo (local)', tier: 'T0', ...custoEstimado('moo', opts) },
    { id: 'claude-haiku-4-5', etiqueta: 'Haiku', tier: 'T1', ...custoEstimado('claude-haiku-4-5', opts) },
    { id: 'claude-sonnet-5', etiqueta: 'Sonnet', tier: 'T2', ...custoEstimado('claude-sonnet-5', opts) },
    { id: 'claude-opus-5', etiqueta: 'Opus', tier: 'T3', ...custoEstimado('claude-opus-5', opts) },
  ];
}
