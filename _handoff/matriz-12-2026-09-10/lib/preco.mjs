// @ts-check
import { spawnSync } from 'node:child_process';

/**
 * preco.mjs — preco de lista datado, com fonte, e a aritmetica separada.
 *
 * DUAS grandezas diferentes, nunca somadas por engano:
 *
 *   custo_resposta  = tokens de entrada NOVOS x input + tokens de saida x output.
 *                     E o que o trabalho pedido custaria a quem chamasse o
 *                     modelo directamente com este prompt.
 *
 *   custo_faturado  = custo_resposta + cache_write x taxa_de_escrita
 *                                    + cache_read  x taxa_de_leitura.
 *                     E o que a chamada REALMENTE poe na conta, e nestes bracos
 *                     e dominado pelo system prompt do harness (medido: "banana"
 *                     no Opus 5 = 4 tokens de saida e 3938 tokens escritos em
 *                     cache). Reportar so o primeiro numero seria esconder a
 *                     maior parcela; reportar so o segundo seria imputar ao
 *                     prompt o custo de arrancar o CLI.
 *
 * NENHUM dolar sai por token nesta maquina: Claude Code corre por OAuth de
 * subscricao e o Codex por subscricao ChatGPT. Isto e preco de lista IMPUTADO.
 */

/**
 * Fonte: https://platform.claude.com/docs/en/about-claude/pricing
 * Lido em 2026-09-10 (fetch nesta sessao). Bate com o bloco datado
 * "Claude 5 family — verified 2026-08-19" de tools/router/pricing.js para
 * input/output; as colunas de cache NAO existem em pricing.js (ele nao modela
 * cache) e vem so da pagina oficial.
 */
export const TABELA = {
  fonte: 'https://platform.claude.com/docs/en/about-claude/pricing',
  lido_em: '2026-09-10',
  confere_com: 'tools/router/pricing.js — bloco "Claude 5 family — verified 2026-08-19" (input/output). As colunas de cache nao existem em pricing.js.',
  unidade: 'USD por milhao de tokens',
  modelos: {
    'claude-opus-5':              { input: 5,  output: 25, cache_write_5m: 6.25, cache_read: 0.50 },
    'claude-sonnet-5':            { input: 2,  output: 10, cache_write_5m: 2.50, cache_read: 0.20 },
    'claude-haiku-4-5-20251001':  { input: 1,  output: 5,  cache_write_5m: 1.25, cache_read: 0.10 },
    'claude-haiku-4-5':           { input: 1,  output: 5,  cache_write_5m: 1.25, cache_read: 0.10 },
  },
  local: 'qualquer modelo Ollama: $0 de fornecedor. NAO e "de graca": corre na GPU do dono e gasta energia. A corrida reporta segundos e watts idle medidos, nunca poupanca de energia.',
  gpt: 'gpt-6-astra: n/d. Nao existe em pricing.js nem foi encontrado preco de lista publicado para este id. O braco D reporta tokens e tempo; o custo fica n/d.',
};

/** Multiplicadores oficiais (mesma pagina): 5m write = 1.25x input, read = 0.1x input. */
export const MULTIPLICADORES = { cache_write_5m: 1.25, cache_read: 0.1 };

/**
 * @param {string} modelo
 * @param {{tokens_in:number|null, tokens_out:number|null, cache_creation?:number, cache_read?:number}} u
 */
/**
 * Um modelo so conta como local se ESTIVER instalado no Ollama desta maquina.
 * A lista e lida do daemon, nao adivinhada pelo nome.
 *
 * A versao anterior desta funcao dizia `local = !modelo.startsWith('claude-')`,
 * e por isso deu **$0** ao `gpt-6-astra` do braco D -- um modelo de nuvem, pago,
 * cujo preco de lista nao conhecemos. Num estudo que compara custo, o default
 * de um heuristico nunca pode ser "de graca": em duvida, n/d.
 */
let _locaisCache = null;
function ehLocal(modelo) {
  if (!modelo) return false;
  if (_locaisCache === null) {
    _locaisCache = new Set();
    try {
      const r = spawnSync(process.execPath, ['-e',
        "fetch('http://127.0.0.1:11434/api/tags').then(r=>r.json()).then(j=>console.log(j.models.map(m=>m.name).join('\\n'))).catch(()=>process.exit(1))"],
        { encoding: 'utf8', timeout: 10000 });
      if (r.status === 0) for (const n of (r.stdout || '').split('\n').map((s) => s.trim()).filter(Boolean)) _locaisCache.add(n);
    } catch { /* daemon em baixo: nada e local */ }
  }
  return _locaisCache.has(modelo) || _locaisCache.has(modelo + ':latest');
}

export function custos(modelo, u) {
  const p = TABELA.modelos[modelo];
  if (!p) {
    const local = ehLocal(modelo);
    return {
      preco: local ? { input: 0, output: 0 } : 'n/d',
      custo_resposta_usd: local ? 0 : null,
      custo_faturado_usd: local ? 0 : null,
      nota: local
        ? 'modelo instalado no Ollama desta maquina: $0 de fornecedor (a GPU e do dono, e gasta energia)'
        : `n/d — sem preco de lista para "${modelo}" na tabela citada, e nao esta instalado localmente`,
    };
  }
  const M = 1e6;
  const ti = Number(u.tokens_in) || 0;
  const to = Number(u.tokens_out) || 0;
  const cw = Number(u.cache_creation) || 0;
  const cr = Number(u.cache_read) || 0;
  const resposta = (ti * p.input + to * p.output) / M;
  const faturado = resposta + (cw * p.cache_write_5m + cr * p.cache_read) / M;
  return {
    preco: p,
    custo_resposta_usd: +resposta.toFixed(8),
    custo_faturado_usd: +faturado.toFixed(8),
    parcelas_usd: {
      entrada_nova: +((ti * p.input) / M).toFixed(8),
      saida: +((to * p.output) / M).toFixed(8),
      cache_write: +((cw * p.cache_write_5m) / M).toFixed(8),
      cache_read: +((cr * p.cache_read) / M).toFixed(8),
    },
  };
}
