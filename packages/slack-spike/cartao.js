'use strict';
/**
 * ⚠️ THROWAWAY — spike Slack. A APRESENTACAO. Puro: dados -> Block Kit.
 *
 * Este ficheiro nasceu de um problema real, visto no Slack a funcionar: o cartao
 * saia como UM bloco de texto corrido «chave: valor», o Slack truncava-o com
 * «Mostrar mais», e o que ficava escondido era o CUSTO e o HASH — exactamente as
 * duas coisas que provam custodia a um estranho. Um cartao que esconde a prova
 * nao e um cartao de custodia, e um dump de debug com botoes.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * PORQUE A FORMATACAO VIVE AQUI E NAO NO TRANSPORTE
 *
 * O `publicar.js` e a UNICA porta de saida e o unico sitio que varre nomes
 * sensiveis. Se os blocos fossem construidos no `transporte.js` (depois da
 * porta), cada string dentro de um bloco seria texto NAO VARRIDO a sair da
 * maquina — o varrimento cobria o `text` de topo e mais nada. Por isso:
 * este modulo e PURO (nao fala com o Slack, nao le ficheiros), o `publicar.js`
 * chama-o e varre a arvore INTEIRA, e o transporte so entrega o que a porta
 * aprovou.
 * ─────────────────────────────────────────────────────────────────────────
 */

/** Slack corta um `section` por volta dos 300 chars; abaixo disto nao ha «Mostrar mais». */
const LIMITE_SECTION = 300;
const MAX_FIELDS = 10;          // limite do Block Kit
const CHARS_HASH = 8;           // suficiente para cruzar a olho, curto para o telemovel

/**
 * Dinheiro legivel. O ledger da 0.1372512; ninguem le dinheiro assim.
 * Sem fonte NUNCA sai um numero — a regra do Dia 0.
 */
function dinheiro(custo) {
  const c = custo || {};
  if (c.valor == null) return { texto: 'n/d', sufixo: c.porque || 'sem fonte no ledger' };
  const v = Number(c.valor);
  if (!Number.isFinite(v)) return { texto: 'n/d', sufixo: 'valor ilegivel no ledger' };
  // < 1 centimo nao se arredonda para "$0,00": isso leria-se como gratis
  const texto = v === 0 ? '$0,00'
    : (v < 0.01 ? '< $0,01' : '$' + v.toFixed(2).replace('.', ','));
  const fonte = c.estimativa ? 'ESTIMATIVA · ' + (c.fonte || 'n/d') : (c.fonte || 'n/d');
  return { texto, sufixo: fonte };
}

/** Um sha256 de 64 chars nao cabe num telemovel e ninguem o le todo. */
function hashCurto(h) {
  const s = String(h == null ? '' : h);
  if (!s) return 'n/d';
  return s.slice(0, CHARS_HASH) + '…';
}

/**
 * `slack:U0BGS8N8JFL` -> `<@U0BGS8N8JFL>`, que o Slack RENDERIZA como o nome da
 * pessoa. Resolve o id opaco sem precisar do scope `users:read`: e o cliente que
 * o traduz, nao nos. Um actor que nao venha do Slack fica como texto simples.
 */
function mencaoDeActor(actorId) {
  const s = String(actorId == null ? '' : actorId);
  const m = /^slack:(U[A-Z0-9]+)$/i.exec(s.trim());
  return m ? '<@' + m[1] + '>' : (s || 'n/d');
}

/** Valor de um campo derivado, sem o `porque` (que e longo e interno). */
function valorDe(campo, omissao) {
  if (campo == null) return omissao || 'n/d';
  if (typeof campo !== 'object') return String(campo);
  return campo.valor == null ? (omissao || 'n/d') : String(campo.valor);
}

/** O modelo com o `-20251001` no fim nao acrescenta nada a um estranho. */
function modeloCurto(campo) {
  const v = valorDe(campo);
  return v === 'n/d' ? v : v.replace(/-\d{8}$/, '');
}

/** Accao -> action_id do bloco. */
const ACCOES = Object.freeze({ aprovar: 'mooter_aprovar', recusar: 'mooter_recusar' });

/**
 * O valor que o botao carrega de volta: identificadores e o HASH DO CARTAO, nunca
 * conteudo. O hash e o que faz o CAS funcionar — ler um hash fresco no clique
 * fazia o clique atrasado passar por valido, e o STALE deixava de existir.
 */
function valorDoBotao(jobId, accao, hash) {
  return JSON.stringify({ j: String(jobId), a: accao, h: String(hash == null ? '' : hash) });
}

function lerValorDoBotao(valor) {
  let o;
  try { o = JSON.parse(String(valor == null ? '' : valor)); } catch { return { ok: false, porque: 'nao e JSON' }; }
  if (!o || typeof o !== 'object') return { ok: false, porque: 'nao e objecto' };
  const accao = o.a === 'aprovar' ? 'aprovar' : (o.a === 'recusar' ? 'recusar' : null);
  if (!accao) return { ok: false, porque: 'accao desconhecida' };
  if (!o.j) return { ok: false, porque: 'sem job_id' };
  if (!o.h) return { ok: false, porque: 'sem hash — sem CAS nao se decide' };
  return { ok: true, job_id: String(o.j), accao, hash: String(o.h) };
}

/**
 * Os dois botoes. `confirm` no APROVAR e deliberado: num telemovel os botoes ficam
 * lado a lado e um toque errado dispara trabalho pago. A recusa nao leva confirmacao
 * — recusar por engano nao gasta nada e o pedido continua recuperavel.
 */
function blocosDeAccoes(p) {
  const accoes = [].concat(p.accoes || []).filter((a) => ACCOES[a]);
  if (!accoes.length || !p.job_id || !p.hash_esperado) return null;
  return { type: 'actions', block_id: 'mooter_decisao', elements: accoes.map((a) => {
    const b = { type: 'button', action_id: ACCOES[a],
      text: { type: 'plain_text', text: a === 'aprovar' ? 'Aprovar' : 'Recusar', emoji: false },
      style: a === 'aprovar' ? 'primary' : 'danger',
      value: valorDoBotao(p.job_id, a, p.hash_esperado) };
    if (a === 'aprovar') {
      b.confirm = {
        title: { type: 'plain_text', text: 'Aprovar este pedido?' },
        text: { type: 'mrkdwn', text: 'Vai retomar trabalho pago. Custo declarado até agora: *'
          + dinheiro(p.custo).texto + '*.' },
        confirm: { type: 'plain_text', text: 'Aprovar' },
        deny: { type: 'plain_text', text: 'Voltar atrás' },
        style: 'primary',
      };
    }
    return b;
  }) };
}

const secao = (texto) => ({ type: 'section', text: { type: 'mrkdwn', text: texto } });
const contexto = (texto) => ({ type: 'context', elements: [{ type: 'mrkdwn', text: texto }] });
const cabecalho = (texto) => ({ type: 'header', text: { type: 'plain_text', text: texto, emoji: true } });

function campos(pares) {
  return { type: 'section', fields: pares.slice(0, MAX_FIELDS)
    .map(([k, v]) => ({ type: 'mrkdwn', text: '*' + k + '*\n' + v })) };
}

/**
 * O cartao de um pedido a espera de decisao.
 *
 * Hierarquia deliberada: o que decide (custo, quem pediu) em cima e em campos —
 * nunca depois do corte; a prova criptografica em `context` (cinza, pequeno),
 * porque um nao-tecnico nao a le mas precisa de a VER para o argumento existir.
 */
function blocosDePendente(p) {
  const d = dinheiro(p.custo);
  const blocos = [
    cabecalho('🐮 Aprovação pendente'),
    campos([
      ['Custo', d.texto],
      ['Modelo', modeloCurto(p.modelo)],
      ['Quem pediu', mencaoDeActor(valorDe(p.autor))],
      ['Motor', valorDe(p.motor) + '  ·  _não é quem pediu_'],
    ]),
  ];
  const accoes = blocosDeAccoes(p);
  if (accoes) { blocos.push({ type: 'divider' }); blocos.push(accoes); }
  return { blocos, rodape: contexto([
    '`' + String(p.job_id || 'n/d') + '`',
    'estado `' + hashCurto(p.hash_esperado) + '`',
    'custo: ' + d.sufixo,
    'ficheiros: ' + valorDe(p.diff_stat, 'n/d'),
  ].join('  ·  ')) };
}

/**
 * Depois de decidir, a MESMA mensagem passa a isto (via `chat.update`), sem
 * botoes. Deixar botoes vivos num pedido ja decidido convida um clique que so
 * pode responder «ja decidido» — e num ecra pequeno e um toque a mais numa accao
 * que gasta dinheiro.
 */
const ROSTO = Object.freeze({
  APPROVED: { emoji: '✅', verbo: 'Aprovado' },
  REJECTED: { emoji: '❌', verbo: 'Recusado' },
  STALE: { emoji: '⏳', verbo: 'Clique fora de tempo' },
  EXPIRED: { emoji: '⌛', verbo: 'Expirado' },
});

function blocosDeDecisao(p) {
  const r = ROSTO[p.estado] || { emoji: '•', verbo: String(p.estado || 'sem estado') };
  const quem = p.autor ? mencaoDeActor(valorDe(p.autor)) : null;
  const linhas = [r.emoji + ' *' + r.verbo + '*' + (quem ? ' por ' + quem : '')];
  if (p.texto) linhas.push('_' + p.texto + '_');
  const blocos = [secao(linhas.join('\n'))];
  if (p.hash_esperado && p.hash_actual) {
    blocos.push(campos([
      ['Estado no cartão', '`' + hashCurto(p.hash_esperado) + '`'],
      ['Estado agora', '`' + hashCurto(p.hash_actual) + '`'],
    ]));
    blocos.push(contexto('O pedido **continua** à espera: o estado mudou entre o cartão '
      + 'e o clique, por isso a decisão não foi aceite.'));
  }
  return { blocos, rodape: p.auditoria ? contexto('🧾 ' + p.auditoria) : null };
}

/** Estado curto (despachado / não despachou). Uma linha, sem cerimonia. */
function blocosDeEstado(p) {
  const linha = p.job_id
    ? '⚙️ ' + (p.texto || 'a trabalhar') + '  ·  `' + p.job_id + '`'
    : '⚠️ ' + (p.texto || 'sem estado');
  return { blocos: [secao(linha)], rodape: null };
}

/**
 * @returns {{blocos:Array, texto:string}} `texto` e o fallback da NOTIFICACAO
 *   (o que aparece no telemovel antes de abrir). Nao e decorativo: sem ele o
 *   push diz apenas o nome da app.
 */
function construir(payload) {
  const p = payload || {};
  const por = p.tipo === 'pendente' ? blocosDePendente
    : (p.tipo === 'decisao' ? blocosDeDecisao : blocosDeEstado);
  const { blocos, rodape } = por(p);
  const fora = blocos.slice();
  if (rodape) fora.push(rodape);
  return { blocos: fora, texto: notificacao(p) };
}

/** O texto do push. Curto, sem hash, sem conteudo — so o que decide se abres. */
function notificacao(p) {
  if (p.tipo === 'pendente') {
    return 'Aprovação pendente · ' + dinheiro(p.custo).texto + ' · ' + modeloCurto(p.modelo);
  }
  if (p.tipo === 'decisao') {
    const r = ROSTO[p.estado] || { verbo: String(p.estado || 'decisão') };
    return r.verbo + ' · ' + String(p.job_id || '');
  }
  return String(p.texto || 'slack-spike');
}

module.exports = { LIMITE_SECTION, MAX_FIELDS, CHARS_HASH, ROSTO, ACCOES,
  valorDoBotao, lerValorDoBotao, blocosDeAccoes,
  dinheiro, hashCurto, mencaoDeActor, valorDe, modeloCurto,
  blocosDePendente, blocosDeDecisao, blocosDeEstado, notificacao, construir };
