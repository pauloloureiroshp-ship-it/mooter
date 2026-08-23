/**
 * latencia-local.js — que modelo local usar no pre-calculo, por LATENCIA MEDIDA.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * PORQUE ISTO EXISTE
 *
 * Ate 2026-08-23 o modelo do Option A era o que o router recomendava, e o router
 * recomenda por VRAM DISPONIVEL: numa 4090 escolhe o maior que la cabe. Medido
 * nesta maquina, com o motor quente:
 *
 *   qwen3:30b           9206 ms   resposta VAZIA   <- recomendado em 123/127
 *   qwen2.5-coder:14b   6778 ms   resposta boa
 *   qwen2.5:3b          1557 ms   resposta em TURCO
 *
 * O maior modelo que cabe na placa nao e o melhor modelo para responder em 8
 * segundos. Sao criterios diferentes, e ninguem tinha medido o segundo.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * A REGRA QUE GOVERNA ESTE FICHEIRO
 *
 * **Nao ha lista de modelos bons aqui.** Uma lista cravada hoje caduca quando o
 * dono instalar outro modelo, e seria o mesmo erro do timeout de 3500 ms — um
 * valor afinado uma vez que ninguem volta a rever.
 *
 * A escolha sai da medicao da PROPRIA utilizacao: cada tentativa do Option A
 * deixa uma amostra `{modelo, ms, ok, motivo}`, e a proxima escolha le-as. Um
 * modelo que falha desqualifica-se sozinho; um que nunca foi tentado tem a sua
 * vez. O sistema aprende com o que lhe corre mal, que e o unico sitio onde ha
 * informacao nova.
 *
 * E o veredicto e sempre `{ modelo, razao }` — nunca so o modelo. Uma escolha
 * que nao se explica e indistinguivel de um valor cravado.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * O QUE ISTO NAO MEDE, e e o limite importante
 *
 * **Correccao.** "ok" aqui quer dizer *devolveu texto dentro do prazo*, e mais
 * nada. Medido a 2026-08-23: o `qwen2.5:3b` respondeu a um prompt PORTUGUES em
 * TURCO, em 1557 ms — e isso conta como sucesso, porque nao ha aqui nada que
 * saiba distinguir uma resposta certa de uma errada.
 *
 * Nao inventei um criterio de qualidade de proposito. Um heuristico de idioma,
 * ou um juiz LLM a validar cada pre-calculo, seriam ambos piores: o primeiro
 * erra em codigo e em texto tecnico; o segundo gasta o modelo caro para poupar
 * o modelo caro. Enquanto nao houver medicao honesta de correccao, este ficheiro
 * ordena por VELOCIDADE e por NAO-VAZIO, e diz que e so isso que faz.
 *
 * A rede de seguranca esta noutro sitio: o `<suggested_answer>` e uma sugestao
 * ao modelo da sessao, que continua a poder recusa-la. Se ela vier em turco, ele
 * ve-o.
 */

'use strict';

const fs = require('fs');

/** Quantas amostras chegam para acreditar num modelo. Abaixo disto, e "por medir". */
const MINIMO_AMOSTRAS = 3;
/** Abaixo desta taxa de sucesso, um modelo com historico e considerado mau. */
const SUCESSO_MINIMO = 0.5;
/** Folga entre a latencia medida e o orcamento: uma medicao nao e uma garantia. */
const FOLGA_MS = 1200;
/** Quantas linhas ler do fim do registo. Um ficheiro que cresce para sempre acaba por ser o problema. */
const JANELA = 400;

/** Le as ultimas amostras. Nunca rebenta: sem ficheiro, sem historico. */
function lerAmostras(caminho, janela = JANELA) {
  try {
    const linhas = fs.readFileSync(caminho, 'utf8').split(/\r?\n/).filter(Boolean);
    return linhas.slice(-janela)
      .map((l) => { try { return JSON.parse(l); } catch { return null; } })
      .filter((a) => a && typeof a.modelo === 'string');
  } catch { return []; }
}

/** Acrescenta uma amostra. Best-effort — telemetria nunca pode partir o hook. */
function registar(caminho, amostra) {
  try {
    fs.appendFileSync(caminho, `${JSON.stringify(amostra)}\n`, 'utf8');
  } catch { /* nunca falhar por causa do registo */ }
}

/** O percentil 75 de uma lista de numeros. Mais honesto que a media com caudas. */
function p75(valores) {
  if (!valores.length) return null;
  const v = [...valores].sort((a, b) => a - b);
  return v[Math.min(v.length - 1, Math.floor(v.length * 0.75))];
}

/**
 * Resume as amostras por modelo.
 *
 * Uma resposta VAZIA conta como falha, nao como sucesso rapido. E o caso do
 * `qwen3:30b`, que responde 200 a tempo e devolve texto nenhum: contar isso como
 * bom seria premiar exactamente o comportamento que torna o pre-calculo inutil.
 */
function resumir(amostras) {
  const porModelo = new Map();
  for (const a of amostras || []) {
    // Uma linha corrompida no meio do registo nao pode matar a leitura toda —
    // e um ficheiro append-only escrito por um hook: ha-de acontecer.
    if (!a || typeof a.modelo !== 'string' || !a.modelo) continue;
    if (!porModelo.has(a.modelo)) porModelo.set(a.modelo, { modelo: a.modelo, n: 0, ok: 0, msOk: [] });
    const r = porModelo.get(a.modelo);
    r.n += 1;
    if (a.ok) { r.ok += 1; if (Number.isFinite(a.ms)) r.msOk.push(a.ms); }
  }
  for (const r of porModelo.values()) {
    r.sucesso = r.n ? r.ok / r.n : 0;
    // p75 SO dos sucessos: a latencia de uma falha e o timeout, e incluir isso
    // fazia um modelo parecer lento quando na verdade e inutil.
    r.p75Ms = p75(r.msOk);
    r.medido = r.n >= MINIMO_AMOSTRAS;
  }
  return porModelo;
}

/**
 * Escolhe o modelo do pre-calculo.
 *
 * A ordem, e cada degrau tem uma razao:
 *
 *   1. PROVADOS   medidos, com sucesso >= 50%, e p75 + folga dentro do
 *                 orcamento. Entre eles ganha o de maior sucesso; a desempatar,
 *                 o mais rapido. Sucesso antes de velocidade de proposito — um
 *                 modelo rapido que devolve lixo custa mais do que um lento que
 *                 acerta, porque a resposta errada chega ao dono.
 *   2. POR MEDIR  ainda sem historico suficiente. Tem a sua vez DEPOIS dos
 *                 provados e ANTES dos reprovados, senao um modelo novo nunca
 *                 seria experimentado e o sistema ficava preso na primeira
 *                 escolha que resultou.
 *   3. NADA       devolve-se o recomendado com `razao: 'sem_alternativa'`. Falha
 *                 ABERTA: manter o comportamento antigo e melhor do que nao
 *                 pre-calcular de todo.
 *
 * O `recomendado` do router entra sempre como candidato. Ele sabe coisas que
 * este ficheiro nao sabe (VRAM, especializacao); so nao sabe latencia.
 */
function escolher({ recomendado = null, resumo = new Map(), catalogo = [], orcamentoMs = 8000 } = {}) {
  const tecto = orcamentoMs - FOLGA_MS;
  const candidatos = [...new Set([...(catalogo || []), ...(recomendado ? [recomendado] : [])])].filter(Boolean);
  if (!candidatos.length) return { modelo: recomendado, razao: 'sem_candidatos' };

  const provados = [];
  const porMedir = [];
  for (const m of candidatos) {
    const r = resumo.get(m);
    if (!r || !r.medido) { porMedir.push(m); continue; }
    if (r.sucesso < SUCESSO_MINIMO) continue; // reprovado — nao entra
    if (r.p75Ms === null || r.p75Ms > tecto) continue; // nao cabe no orcamento
    provados.push(r);
  }

  if (provados.length) {
    provados.sort((a, b) => (b.sucesso - a.sucesso) || (a.p75Ms - b.p75Ms));
    const v = provados[0];
    return {
      modelo: v.modelo,
      razao: `medido: p75 ${v.p75Ms}ms, ${v.ok}/${v.n} ok, tecto ${tecto}ms`,
    };
  }

  if (porMedir.length) {
    // O recomendado tem prioridade entre os por medir: e o palpite informado.
    const m = porMedir.includes(recomendado) ? recomendado : porMedir[0];
    return { modelo: m, razao: 'por medir — sem historico suficiente' };
  }

  return { modelo: recomendado, razao: 'sem_alternativa — todos reprovados ou lentos' };
}

module.exports = {
  lerAmostras, registar, resumir, escolher, p75,
  MINIMO_AMOSTRAS, SUCESSO_MINIMO, FOLGA_MS, JANELA,
};
