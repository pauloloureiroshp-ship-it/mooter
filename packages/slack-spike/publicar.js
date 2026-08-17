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

    // barreira 3 — nomes de segredos (kimi #5)
    const bruto = renderizar(p);
    const limpo = denylist.limpar(bruto);
    if (denylist.nomesSensiveis(limpo.texto).length) {
      return { publicado: false, porque: 'sobrou um nome sensivel apos limpeza — nao se publica' };
    }

    const registo = { texto: limpo.texto, removidos: limpo.removidos, ts: new Date().toISOString() };
    historico.push(registo);
    if (dryRun) return { publicado: true, dry_run: true, texto: limpo.texto, removidos: limpo.removidos };
    enviar(limpo.texto, p);
    return { publicado: true, dry_run: false, texto: limpo.texto, removidos: limpo.removidos };
  }

  return { publicar, historico, CAMPOS_PERMITIDOS };
}

module.exports = { CAMPOS_PERMITIDOS, CAMPO_VISIBILIDADE, criarPublicador, renderizar };
