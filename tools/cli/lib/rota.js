/**
 * rota.js — a pergunta unica: o que vai para o local, e o que vai para a cloud.
 *
 * NAO TOCA NO `classify.js`. Nem podia — esta congelado por sha em CI. Isto e
 * **politica sobre as classes que o classificador ja produz**: ele continua a
 * dizer «isto e leitura» ou «isto e escrita», e este ficheiro guarda a
 * preferencia do dono sobre o que fazer com essa resposta.
 *
 * A distincao importa e nao e formalidade: um router que se deixa reconfigurar
 * por politica continua a ser o mesmo router, e as decisoes continuam
 * reproduziveis. Um router cuja LOGICA se altera por preferencia deixa de ter
 * um comportamento que se possa provar.
 *
 * UMA PERGUNTA, E SO UMA. O `init` fazia onze. Esta faz-se porque a resposta
 * muda mesmo o que acontece a seguir, e porque nao ha maneira de a medir: e
 * uma preferencia, nao um facto da maquina.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const { raizMooter } = require('./entitlement.js');

/** As politicas que existem. Lista fechada: isto e lido e aplicado. */
const POLITICAS = Object.freeze({
  'local-leitura': {
    titulo: 'Local para leitura, Claude para escrita',
    descricao: 'Ler, resumir, explicar e procurar correm na tua GPU. Escrever e alterar codigo vai para o Claude.',
    leitura: 'local',
    escrita: 'cloud',
  },
  'local-tudo': {
    titulo: 'Local sempre que couber',
    descricao: 'Tudo o que o motor local conseguir fazer fica ca. So escala quando ele nao chega.',
    leitura: 'local',
    escrita: 'local-primeiro',
  },
  cloud: {
    titulo: 'Cloud sempre',
    descricao: 'Nada corre local. O Mooter continua a escolher o tier mais barato entre as tuas subscricoes.',
    leitura: 'cloud',
    escrita: 'cloud',
  },
});

const OMISSAO = 'local-leitura';

function caminho(o = {}) {
  return path.join(raizMooter(o), 'route.json');
}

/** Le a politica. Sem ficheiro, ou com lixo la dentro, devolve a de omissao. */
function ler(o = {}) {
  const { fsImpl = fs } = o;
  try {
    const j = JSON.parse(fsImpl.readFileSync(caminho(o), 'utf8'));
    const p = j && typeof j.politica === 'string' ? j.politica : null;
    if (p && POLITICAS[p]) return { politica: p, fonte: 'ficheiro', ...POLITICAS[p] };
    return { politica: OMISSAO, fonte: 'omissao', porque: `politica desconhecida '${String(p).slice(0, 30)}'`, ...POLITICAS[OMISSAO] };
  } catch {
    return { politica: OMISSAO, fonte: 'omissao', ...POLITICAS[OMISSAO] };
  }
}

/** Escreve a politica. Recusa uma que nao existe — nao inventa comportamento. */
function escrever(politica, o = {}) {
  const { fsImpl = fs, agora = () => new Date().toISOString() } = o;
  if (!POLITICAS[politica]) {
    return { ok: false, porque: `politica desconhecida: ${String(politica).slice(0, 30)} — conhecidas: ${Object.keys(POLITICAS).join(', ')}` };
  }
  const c = caminho(o);
  fsImpl.mkdirSync(path.dirname(c), { recursive: true });
  fsImpl.writeFileSync(c, JSON.stringify({ politica, escrito_em: agora() }, null, 2) + '\n');
  return { ok: true, politica, caminho: c, ...POLITICAS[politica] };
}

module.exports = { POLITICAS, OMISSAO, caminho, ler, escrever };
