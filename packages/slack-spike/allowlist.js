'use strict';
/**
 * ⚠️ THROWAWAY — spike Slack.
 *
 * kimi #1 (ALTO): a MESMA allowlist tem de valer nos DOIS caminhos — aceitar um
 * goal E validar um clique. Um bot que so filtra na entrada tem a porta da
 * frente fechada e a de tras aberta: no Slack, qualquer pessoa do canal ve os
 * botoes de um pendente e pode carregar neles.
 *
 * Por isso isto e um MODULO com um objecto unico, e nao dois `if` copiados.
 */

/** A demo de bolso e de UM utilizador. O maximo e codigo, nao um comentario. */
const MAX_IDS = 1;

function criarAllowlist(ids) {
  if (!Array.isArray(ids) || ids.length === 0) {
    throw new Error('allowlist vazia — o spike exige pelo menos um id declarado; '
      + 'uma allowlist vazia que deixasse passar tudo seria o pior default possivel');
  }
  if (ids.length > MAX_IDS) {
    throw new Error('a demo de bolso aceita UM id, recebi ' + ids.length
      + ' — o maximo de ' + MAX_IDS + ' e um invariante do spike, nao uma sugestao');
  }
  const limpos = ids.map((i) => (typeof i === 'string' ? i.trim() : i));
  for (const i of limpos) {
    if (typeof i !== 'string' || i === '') {
      throw new Error('id de allowlist invalido: ' + JSON.stringify(i) + ' — tem de ser string nao vazia');
    }
  }
  const conjunto = new Set(limpos);

  return {
    tamanho: conjunto.size,
    ids: [...conjunto],
    /** @returns {{ok:boolean, porque:string}} nunca lanca: quem pergunta esta num handler. */
    permite(id) {
      if (typeof id !== 'string' || id.trim() === '') {
        return { ok: false, porque: 'id ausente ou nao-string — fora da allowlist do spike' };
      }
      if (!conjunto.has(id.trim())) {
        return { ok: false, porque: 'id fora da allowlist do spike (a demo e de um so utilizador)' };
      }
      return { ok: true, porque: 'id na allowlist' };
    },
  };
}

module.exports = { MAX_IDS, criarAllowlist };
