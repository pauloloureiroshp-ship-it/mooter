'use strict';
/**
 * ⚠️ THROWAWAY — spike Slack. O botao de PARAR.
 *
 * Decisao de maestro (H3, 2026-08-17): **cancelar > progresso**. Progresso e
 * conforto; cancelar e controlo. Um produto cujo argumento e custodia, sem botao
 * de parar, tem meia custodia — e e a metade que dói, porque o utilizador ansioso
 * por nao ver progresso recupera a confianca quando o trabalho aparece, e o
 * utilizador que ve o agente a fazer asneira sem poder parar nao recupera.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * PORQUE O CAS NAO BLOQUEIA AQUI (desvio declarado ao «mesmo CAS do Aprovar»)
 *
 * O `aprovar`/`recusar` recusam um clique atrasado: autorizar o que nao se viu e
 * exactamente o erro que o STALE existe para apanhar.
 *
 * O `parar` carrega o hash — mesma forma, mesma auditabilidade, o mesmo valor de
 * botao — mas NAO se recusa por divergencia. Um clique atrasado sobre um agente
 * descontrolado tem de o parar a mesma. Recusar «porque o estado mudou» seria o
 * botao de emergencia a falhar precisamente quando o estado esta a mudar depressa,
 * que e quando ele serve para alguma coisa.
 *
 * A outra metade do requisito do maestro — «clique atrasado sobre job terminado =
 * no-op, nao erro» — ja vem do `toolCancel`, que e idempotente sobre terminais.
 * Registamos a divergencia de hash no resultado, para o thread poder dize-la.
 * ─────────────────────────────────────────────────────────────────────────
 */

const gateOmissao = require('./gate.js');

/** O que a porta do cancelamento aceita. Simetrica a do despacho. */
const CAMPOS_PARA_CANCELAR = Object.freeze(['job_id', 'actor', 'hash_visto']);

function criarCancelador(opcoes) {
  const o = opcoes || {};
  const toolCancel = o.toolCancel;
  const syncPath = o.syncPath;
  const gate = o.gate || gateOmissao;
  if (typeof toolCancel !== 'function') {
    throw new Error('criarCancelador precisa de `toolCancel` — a porta do stop nao se adivinha');
  }
  if (!syncPath) throw new Error('criarCancelador precisa de `syncPath` — o gate le-o');

  /**
   * @returns {{parado:boolean, estado:string, porque_local?:string, nota?:string}}
   *   Nunca lanca: quem carrega em Parar esta a olhar para o telemovel.
   */
  async function cancelar(pedido) {
    const p = pedido || {};

    const g = gate.modoVivo({ syncPath });
    if (!g.vivo) {
      return { parado: false, estado: 'TRANCADO',
        porque_local: 'stop recusado — MODO VIVO trancado: ' + g.porque };
    }
    const forasteiros = Object.keys(p).filter((k) => !CAMPOS_PARA_CANCELAR.includes(k));
    if (forasteiros.length) {
      return { parado: false, estado: 'INVALIDO',
        porque_local: 'campo(s) fora da allowlist do stop: ' + forasteiros.join(', ') };
    }
    if (!p.job_id) {
      return { parado: false, estado: 'INVALIDO', porque_local: 'stop sem job_id' };
    }

    let r;
    try {
      r = await toolCancel({ job_id: p.job_id });
    } catch (e) {
      return { parado: false, estado: 'ERRO',
        porque_local: 'toolCancel lancou: ' + ((e && e.message) || 'erro sem mensagem') };
    }
    if (!r || typeof r !== 'object') {
      return { parado: false, estado: 'ERRO', porque_local: 'toolCancel devolveu ' + typeof r };
    }
    if (r.error) {
      // ⚠️ pode citar o job e caminhos — fica em porque_local, que a porta de
      // publicacao recusa por construcao
      return { parado: false, estado: 'ERRO', porque_local: 'o motor recusou: ' + String(r.error) };
    }
    // idempotente: um job ja terminado responde com nota, nao com erro
    const jaEstava = /idempotente|já estava|ja estava/i.test(String(r.note || ''));
    return { parado: true, estado: jaEstava ? 'JA_TERMINADO' : 'PARADO',
      job_estado: r.state || null, nota: r.note || null };
  }

  return { cancelar, CAMPOS_PARA_CANCELAR };
}

module.exports = { criarCancelador, CAMPOS_PARA_CANCELAR };
