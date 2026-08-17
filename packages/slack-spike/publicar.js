'use strict';
/**
 * ⚠️ THROWAWAY — spike Slack.
 *
 * kimi #6: UMA funcao de publicacao. Nenhum `chat.postMessage` fora daqui.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * OBJECCAO AO MASTERPROMPT (levantada no Dia 0, com numeros)
 *
 * O masterprompt diz: «publicar() unica que REJEITA payload com
 * visibilidade: local_only». Lido a letra, isso e FAIL-OPEN, e a contagem do
 * ledger de 08-17 prova-o:
 *
 *   visibilidade:"local_only"  ->   118 eventos
 *   visibilidade:"shareable"   ->     0 eventos
 *   SEM o campo                ->  4640 eventos
 *
 * `actor.js` so etiqueta EVENTOS_RESULTADO (collected/done/failed/
 * nao_verificado) — e correcto, porque so esses carregam resultado. Mas
 * significa que um gate que apenas recusa `local_only` deixa passar os
 * 4640 restantes, e entre eles esta o `dispatched`, que carrega `goal` —
 * texto do utilizador. O gate certo bloquearia 100% do que esta etiquetado e
 * deixaria passar 100% do que nao esta: exactamente ao contrario.
 *
 * Por isso este modulo implementa DUAS barreiras, nesta ordem:
 *   1. recusa explicita de `visibilidade: local_only` (o que o MP pede);
 *   2. ALLOWLIST DE CAMPOS — so sai o que esta em CAMPOS_PERMITIDOS.
 *      A ausencia de rotulo nao e permissao.
 *
 * E a razao por que o cartao nao herda o `local_only` do evento: o cartao NAO
 * e o evento. E um artefacto novo, composto so por valores derivados
 * (custo, modelo, autor, hashes) que atravessaram a allowlist. O evento em si
 * nunca sai da maquina. Se algum dia isto virar produto, a decisao de publicar
 * tem de passar a ser um `shareable` explicito gravado no ledger — nao esta
 * allowlist. Fica dito.
 * ─────────────────────────────────────────────────────────────────────────
 */

const denylist = require('./denylist.js');
const cartao = require('./cartao.js');

/**
 * ⚠️ O VARREDOR DA ARVORE.
 *
 * Antes saia UMA string e varria-se essa string. Agora saem blocos do Block Kit —
 * dezenas de strings dentro de objectos e arrays. Varrer so o `text` de topo
 * deixaria todo o resto a sair sem verificacao, e isso e uma regressao de
 * privacidade disfarcada de melhoria de UI.
 *
 * Percorre TUDO (chaves incluidas nao, valores sim), limpa cada string, e devolve
 * a arvore nova. Nao muda a forma: o que entra objecto sai objecto.
 */
function varrerArvore(x, removidos) {
  if (typeof x === 'string') {
    const r = denylist.limpar(x);
    for (const n of r.removidos) removidos.add(n);
    return r.texto;
  }
  if (Array.isArray(x)) return x.map((v) => varrerArvore(v, removidos));
  if (x && typeof x === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(x)) out[k] = varrerArvore(v, removidos);
    return out;
  }
  return x;
}

/** Junta todas as strings de uma arvore, para a verificacao final. */
function stringsDe(x, acc) {
  if (typeof x === 'string') acc.push(x);
  else if (Array.isArray(x)) for (const v of x) stringsDe(v, acc);
  else if (x && typeof x === 'object') for (const v of Object.values(x)) stringsDe(v, acc);
  return acc;
}

/**
 * O que pode sair. Note-se o que NAO esta ca: goal, prompt, masterprompt,
 * mp_hash, worktree, thread_context, files, diff. Conteudo nunca sai.
 */
const CAMPOS_PERMITIDOS = Object.freeze([
  'tipo',          // 'pendente' | 'estado' | 'decisao'
  'job_id',        // identificador, nao conteudo
  'wave',          // etiqueta declarada por quem despachou
  'estado',        // APPROVED | REJECTED | STALE | ...
  'autor', 'motor', 'modelo', 'custo', 'diff_stat',   // campos derivados (leitura.js)
  'hash_esperado', 'hash_actual',                      // a prova do CAS a trabalhar
  'auditoria',     // a entrada do ledger que prova custodia (kimi #8)
  'accoes',        // ['aprovar','recusar']
  'texto',         // frase curta escrita POR ESTE adapter, nunca vinda do repo
]);

/** Campo de CONTROLO: e lido pelo gate e nunca publicado. */
const CAMPO_VISIBILIDADE = 'visibilidade';

function campoDerivado(c) {
  if (!c || typeof c !== 'object') return String(c);
  if (c.valor == null) return 'n/d — ' + (c.porque || 'sem fonte');
  return String(c.valor) + (c.fonte ? ' (' + c.fonte + ')' : '');
}

function renderizar(p) {
  const L = [];
  if (p.tipo) L.push('[' + p.tipo + ']');
  if (p.job_id) L.push('pedido: ' + p.job_id);
  if (p.wave) L.push('wave: ' + p.wave);
  if (p.estado) L.push('estado: ' + p.estado);
  for (const k of ['autor', 'motor', 'modelo', 'custo', 'diff_stat']) {
    if (p[k] === undefined) continue;
    const c = p[k];
    L.push(((c && c.rotulo) || k) + ': ' + campoDerivado(c));
  }
  if (p.hash_esperado) L.push('hash esperado: ' + String(p.hash_esperado).slice(0, 12) + '…');
  if (p.hash_actual) L.push('hash actual:  ' + String(p.hash_actual).slice(0, 12) + '…');
  if (p.auditoria) L.push('auditoria do ledger: ' + p.auditoria);
  if (p.accoes) L.push('accoes: ' + [].concat(p.accoes).join(' · '));
  if (p.texto) L.push(p.texto);
  return L.join('\n');
}

/**
 * @param {{enviar:Function, dryRun?:boolean}} opcoes
 *   `enviar` e a unica coisa que fala com o Slack. Em MODO CONSTRUCAO e um
 *   duplo; em MODO VIVO e o `chat.postMessage`.
 */
function criarPublicador(opcoes) {
  const o = opcoes || {};
  const enviar = o.enviar;
  const dryRun = !!o.dryRun;
  if (typeof enviar !== 'function' && !dryRun) {
    throw new Error('criarPublicador precisa de `enviar` (ou dryRun:true) — sem porta declarada '
      + 'nao ha publicacao');
  }
  const historico = [];

  function publicar(payload) {
    const p = payload || {};

    // barreira 1 — o rotulo explicito (o que o masterprompt pede)
    if (Object.prototype.hasOwnProperty.call(p, CAMPO_VISIBILIDADE)) {
      if (p[CAMPO_VISIBILIDADE] === 'local_only') {
        return { publicado: false, porque: 'payload marcado local_only — nao sai da maquina' };
      }
      return { publicado: false,
        porque: 'payload traz visibilidade="' + String(p[CAMPO_VISIBILIDADE]) + '": o cartao e um '
          + 'artefacto derivado e nao transporta rotulos de eventos; recusa-se por precaucao' };
    }

    // barreira 2 — allowlist de campos (a ausencia de rotulo NAO e permissao)
    const forasteiros = Object.keys(p).filter((k) => !CAMPOS_PERMITIDOS.includes(k));
    if (forasteiros.length) {
      return { publicado: false,
        porque: 'campo(s) fora da allowlist de publicacao: ' + forasteiros.join(', ')
          + ' — so saem campos derivados, nunca conteudo' };
    }

    // barreira 3 — nomes de segredos (kimi #5), agora sobre a ARVORE INTEIRA
    //
    // ⚠️ A ORDEM É A CORRECÇÃO, não um detalhe. Varre-se o PAYLOAD primeiro e
    // formata-se depois. Ao contrário — formatar e depois varrer — a propria
    // formatacao reabre o vazamento: o cartao envolve valores em italico
    // (`_texto_`), e `segredo.env_` deixa de casar com o `\b` do denylist, porque
    // `_` conta como caracter de palavra. Um teste apanhou-o com o nome a sair
    // inteiro dentro de um bloco. Limpar os DADOS e imune a decoracao; limpar a
    // decoracao depende de adivinhar toda a decoracao futura.
    const removidos = new Set();
    const limpo = varrerArvore(p, removidos);
    const construido = cartao.construir(limpo);
    // e varre-se OUTRA VEZ a arvore construida — cinto por cima dos suspensorios,
    // para o caso de o desenho um dia compor uma string a partir de duas metades
    const blocos = varrerArvore(construido.blocos, removidos);
    const texto = varrerArvore(construido.texto, removidos);
    // `renderizar` continua a servir de espelho textual do payload: se um nome
    // sensivel estivesse num campo que o Block Kit nao mostra, ainda assim conta
    const espelho = varrerArvore(renderizar(p), removidos);

    for (const s of stringsDe([blocos, texto, espelho], [])) {
      if (denylist.nomesSensiveis(s).length) {
        return { publicado: false,
          porque: 'sobrou um nome sensivel apos limpeza — nao se publica' };
      }
    }

    const lista = [...removidos];
    const registo = { texto, blocos, removidos: lista, ts: new Date().toISOString() };
    historico.push(registo);
    if (dryRun) return { publicado: true, dry_run: true, texto, blocos, removidos: lista };
    enviar(texto, p, blocos);
    return { publicado: true, dry_run: false, texto, blocos, removidos: lista };
  }

  return { publicar, historico, CAMPOS_PERMITIDOS };
}

module.exports = { CAMPOS_PERMITIDOS, CAMPO_VISIBILIDADE, criarPublicador, renderizar };
