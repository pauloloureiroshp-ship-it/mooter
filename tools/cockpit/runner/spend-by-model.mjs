/**
 * spend-by-model.mjs — o que estes tokens custariam, modelo a modelo.
 *
 * O painel dizia `usd: 0` a codigo fixo (fleet-state.mjs) e o medidor de quota
 * colapsava tudo em familias (Opus/Sonnet/Haiku), deitando fora o `por_modelo`
 * que ja tinha em maos. Resultado: a unica coisa que o dono nao conseguia ver
 * era em QUE modelo o dinheiro teria ido parar.
 *
 * Tres regras, e nenhuma e negociavel:
 *
 *  1. NAO SE DUPLICA O MOTOR CONGELADO. `packages/mooter-bridge/quota.js` ja
 *     sabe encontrar, ler, desduplicar e datar cada turno. Este modulo chama
 *     `medir()` (que enche o `CACHE` exportado) e depois `filtrar()` sobre cada
 *     entrada desse cache — as duas sao API publica. Zero linhas de parser
 *     copiadas, zero deriva possivel.
 *
 *  2. SEM PRECO NA TABELA, NAO HA NUMERO. `pricing.getPrice()` devolve
 *     FALLBACK_PRICE (Sonnet) para um modelo desconhecido, o que e sensato
 *     para uma ESTIMATIVA de encaminhamento e desastroso para um painel: foi
 *     assim que `claude-opus-5` — 98,7% dos turnos desta maquina — passou meses
 *     a ser cobrado a $3/$15 em vez de $5/$25. Aqui le-se `PRICES` a direito;
 *     um modelo sem entrada sai com `usd: null` e o total marca-se `parcial`.
 *
 *  3. ISTO NAO E DINHEIRO GASTO. Quem trabalha por subscricao nao paga por
 *     token. Este numero e o PRECO DE TABELA DA API para os mesmos tokens —
 *     serve para comparar com o $0 da GPU local, nao para reconciliar a fatura.
 *     A `natureza` viaja com o numero, tal como a `ressalva` do quota.js.
 */

import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

/** Turnos que o Claude Code grava sem modelo real — nao sao um modelo. */
export const NAO_E_MODELO = new Set(['<synthetic>', 'n/d', '<sintetico>']);

/**
 * ⚠️ claude-code#25941 — `output_tokens` gravado como 1-2 em vez do valor real.
 * O quota.js usa o mesmo limiar (20% dos turnos com saida ≤3). Acima disso as
 * saidas passam a n/d e o custo conta so as entradas: um limite inferior
 * honesto vale mais do que um total tres ordens de grandeza abaixo.
 */
export const LIMIAR_SAIDAS_SUSPEITAS = 0.2;

export const HORAS_OMISSAO = 5;

/**
 * Soma `por_modelo` ao longo de todos os ficheiros do cache do quota.js.
 * @param {Map<string, {r?: {todos?: unknown}}>} cache  o `CACHE` exportado
 * @param {(todos: unknown, desde: number) => any} filtrar  o `filtrar` exportado
 * @param {number} desde  epoch ms
 */
export function agregarPorModelo(cache, filtrar, desde) {
  const modelos = new Map();
  let turnos = 0;
  let suspeitas = 0;
  for (const entrada of cache.values()) {
    if (!entrada || !entrada.r || !entrada.r.todos) continue;
    const r = filtrar(entrada.r.todos, desde);
    turnos += r.turnos || 0;
    suspeitas += r.suspeitas || 0;
    for (const [id, pm] of Object.entries(r.por_modelo || {})) {
      const a = modelos.get(id) || { modelo: id, entradas: 0, saidas: 0, turnos: 0 };
      a.entradas += pm.entradas || 0;
      a.saidas += pm.saidas || 0;
      a.turnos += pm.turnos || 0;
      modelos.set(id, a);
    }
  }
  return { modelos, turnos, suspeitas };
}

/**
 * O preco de tabela, ou `null`. NUNCA um fallback: um preco inventado que
 * parece certo e pior do que um espaco em branco que se ve.
 * @returns {{input:number, output:number}|null}
 */
export function precoDe(id, PRICES) {
  const p = PRICES && PRICES[id];
  if (!p || typeof p.input !== 'number' || typeof p.output !== 'number') return null;
  return { input: p.input, output: p.output };
}

/**
 * @param {object} [o]
 * @param {any}    [o.quotaImpl]    modulo quota.js (injectavel para testes)
 * @param {any}    [o.pricingImpl]  modulo pricing.js (injectavel para testes)
 * @param {number} [o.agora]        epoch ms
 * @param {number} [o.horas]        tamanho da janela
 */
export function spendByModel(o = {}) {
  const quota = o.quotaImpl || require('../../../packages/mooter-bridge/quota.js');
  const pricing = o.pricingImpl || require('../../router/pricing.js');
  const agora = o.agora || Date.now();
  const horas = o.horas || HORAS_OMISSAO;
  const desde = agora - horas * 3600 * 1000;

  // `medir()` e que enche o CACHE. Sem esta chamada o cache pode estar vazio
  // (processo acabado de arrancar) e o painel mostrava zeros que pareciam reais.
  const medida = quota.medir({ agora, max_ficheiros: o.max_ficheiros });
  if (!medida || medida.disponivel === false) {
    return {
      disponivel: false,
      porque: (medida && medida.erro && medida.erro.porque) || 'o medidor de quota nao tem sessoes para ler nesta maquina',
      modelos: [], total_usd: null, parcial: true, sem_preco: [], ignorados: [],
    };
  }

  const { modelos, turnos, suspeitas } = agregarPorModelo(quota.CACHE, quota.filtrar, desde);
  const saidasSuspeitas = turnos > 0 && (suspeitas / turnos) > LIMIAR_SAIDAS_SUSPEITAS;

  const linhas = [];
  const ignorados = [];
  const semPreco = [];
  let total = 0;

  for (const a of [...modelos.values()].sort((x, y) => y.turnos - x.turnos)) {
    if (NAO_E_MODELO.has(a.modelo)) {
      ignorados.push({ modelo: a.modelo, turnos: a.turnos, porque: 'marcador interno do Claude Code, nao um modelo faturavel' });
      continue;
    }
    const preco = precoDe(a.modelo, pricing.PRICES);
    const saidas = saidasSuspeitas ? null : a.saidas;
    let usd = null;
    let porque = null;
    if (!preco) {
      semPreco.push(a.modelo);
      porque = 'sem entrada em tools/router/pricing.js — nao se inventa um preco';
    } else {
      usd = (a.entradas * preco.input + (saidas || 0) * preco.output) / 1e6;
      total += usd;
      if (saidasSuspeitas) porque = 'so entradas: as saidas deste periodo nao sao de confianca';
    }
    linhas.push({ modelo: a.modelo, familia: quota.pesoDe(a.modelo).familia, turnos: a.turnos, entradas: a.entradas, saidas, preco, usd, porque });
  }

  return {
    disponivel: true,
    janela: { horas, desde: new Date(desde).toISOString() },
    fonte: medida.fonte,
    ressalva: medida.ressalva,
    natureza: 'API list price for these same tokens. On a subscription plan this is NOT money spent — '
      + 'it is the yardstick against the $0 of the local GPU.',
    aviso_saidas: saidasSuspeitas
      ? 'claude-code#25941: ' + suspeitas + ' de ' + turnos + ' turnos gravaram output_tokens ≤3 (marcador). '
        + 'As saidas ficam n/d e o custo conta so as entradas — limite inferior.'
      : null,
    modelos: linhas,
    total_usd: linhas.length && semPreco.length === linhas.length ? null : Number(total.toFixed(4)),
    parcial: semPreco.length > 0 || saidasSuspeitas,
    sem_preco: semPreco,
    ignorados,
  };
}
