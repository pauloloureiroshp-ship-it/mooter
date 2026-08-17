'use strict';
/**
 * ⚠️ THROWAWAY — spike Slack. A APRESENTACAO. Puro: dados -> Block Kit.
 *
 * Nasceu de um problema visto no Slack a funcionar: o cartao saia como UM bloco de
 * texto corrido «chave: valor», o Slack truncava-o com «Mostrar mais», e o que
 * ficava escondido era o CUSTO e a IMPRESSAO — as duas coisas que provam custodia
 * a um estranho. Um cartao que esconde a prova nao e um cartao de custodia, e um
 * dump de debug com botoes.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * PORQUE A FORMATACAO VIVE AQUI E NAO NO TRANSPORTE
 *
 * O `publicar.js` e a UNICA porta de saida e o unico sitio que varre nomes
 * sensiveis. Se os blocos fossem construidos no `transporte.js` (depois da porta),
 * cada string dentro de um bloco seria texto NAO VARRIDO a sair da maquina. Por
 * isso: este modulo e PURO, a porta chama-o, varre a arvore inteira, e o
 * transporte so entrega o que a porta aprovou.
 *
 * VOCABULARIO FECHADO. Nada do ledger e impresso cru. `cost_usd_fonte`,
 * `agent` e `model_used` passam por mapas de traducao; um valor que os mapas nao
 * conhecam nao e mostrado — e, no caso do custo, o NUMERO tambem nao sai. Isto
 * fecha na origem o unico vector que a allowlist de campos nao cobria: as folhas
 * (`fonte`, `porque`) sao texto livre que vem do ledger.
 * ─────────────────────────────────────────────────────────────────────────
 */

/** Slack corta um `section` acima disto («Mostrar mais»). */
const LIMITE_SECTION = 300;
const MAX_FIELDS = 10;
/** Forma curta da impressao. 12 e nao 8: 8 colide mais depressa a olho. */
const CHARS_HASH = 12;

/**
 * ⚠️ `US$` E NAO `$`. O dono le isto em Sao Paulo, onde `$` sozinho se le
 * REAIS — cinco vezes o valor. O ledger grava USD; a moeda tem de vir dita.
 */
const MOEDA = 'US$ ';

/** O que o motor E, em vez do que se chama no ledger. */
const MOTORES_LEGIVEIS = Object.freeze({
  cc: 'agente Claude Code',
  codex: 'agente Codex',
  gemini: 'agente Gemini',
  moo: 'modelo local (a tua GPU)',
});

/**
 * Vocabulario FECHADO para a procedencia do custo. Um valor desconhecido nao se
 * imprime — e o numero tambem nao sai, porque um numero sem procedencia
 * reconhecida e um numero sem procedencia.
 */
const FONTES_LEGIVEIS = Object.freeze([
  [/reportado pelo cli/i, 'valor informado pelo próprio motor · não verificado por nós'],
  [/infer[eê]ncia local|sem custo de api/i, 'execução local, sem custo de API'],
  [/calculad|tabela|estimativ/i, 'ESTIMATIVA calculada a partir de tokens · não medida'],
]);

function fonteLegivel(fonte) {
  const s = String(fonte == null ? '' : fonte);
  for (const [re, texto] of FONTES_LEGIVEIS) if (re.test(s)) return texto;
  return null;                       // desconhecida => o numero nao sai
}

/**
 * Dinheiro legivel, um ramo por caso e nenhum a inventar precisao.
 * O ledger da 0.1372512; ninguem le dinheiro assim, e 4 decimais seriam precisao
 * falsa sobre um numero que o proprio ledger diz nao ter verificado.
 */
function dinheiro(custo) {
  const c = custo || {};
  const fonte = fonteLegivel(c.fonte);
  if (c.valor == null) {
    return { texto: 'n/d', sufixo: c.porque || 'sem fonte no ledger', tem: false };
  }
  if (!fonte) {
    return { texto: 'n/d', tem: false,
      sufixo: 'procedência não reconhecida — um número sem procedência não se publica' };
  }
  const v = Number(c.valor);
  if (!Number.isFinite(v)) return { texto: 'n/d', sufixo: 'valor ilegível no ledger', tem: false };
  if (v < 0) return { texto: 'n/d', sufixo: 'valor negativo no ledger', tem: false };
  if (v === 0) return { texto: MOEDA + '0,00', sufixo: fonte, tem: true };
  if (v < 0.01) return { texto: 'menos de ' + MOEDA + '0,01', sufixo: fonte, tem: true };
  const [inteiro, dec] = v.toFixed(2).split('.');
  const comMilhar = inteiro.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return { texto: MOEDA + comMilhar + ',' + dec, sufixo: fonte, tem: true };
}

/** A impressao completa: e ESTA a string que o CAS compara. */
function impressaoCompleta(h) {
  const s = String(h == null ? '' : h);
  return s || 'n/d';
}

/** Forma curta, para referencias em linha (confirmacao, auditoria, comparacao). */
function hashCurto(h) {
  const s = String(h == null ? '' : h);
  return s ? s.slice(0, CHARS_HASH) + '…' : 'n/d';
}

/**
 * `slack:U0BGS8N8JFL` -> `<@U0BGS8N8JFL>`, que o CLIENTE renderiza como o nome da
 * pessoa. Resolve o id opaco sem pedir o scope `users:read` a uma app throwaway.
 */
function mencaoDeActor(actorId) {
  const s = String(actorId == null ? '' : actorId);
  const m = /^slack:(U[A-Z0-9]+)$/i.exec(s.trim());
  return m ? '<@' + m[1] + '>' : (s || 'n/d');
}

function valorDe(campo, omissao) {
  if (campo == null) return omissao || 'n/d';
  if (typeof campo !== 'object') return String(campo);
  return campo.valor == null ? (omissao || 'n/d') : String(campo.valor);
}

/** O `-20251001` no fim do id do modelo nao acrescenta nada a um estranho. */
function modeloCurto(campo) {
  const v = valorDe(campo);
  return v === 'n/d' ? v : v.replace(/-\d{8}$/, '');
}

function motorLegivel(campo) {
  const v = valorDe(campo).toLowerCase();
  return MOTORES_LEGIVEIS[v] || (v === 'n/d' ? 'n/d' : v);
}

/** Sufixo curto do job: e o que distingue dois cartoes ao relance. */
function apelido(jobId) {
  const s = String(jobId || '');
  const m = /-([a-z0-9]{2,6})$/i.exec(s);
  return m ? m[1] : (s.slice(-4) || 'n/d');
}

// ── botoes ──────────────────────────────────────────────────────────────────

const ACCOES = Object.freeze({ aprovar: 'mooter_aprovar', recusar: 'mooter_recusar',
  parar: 'mooter_parar' });

/**
 * ⚠️ O CAS NAO PODE BLOQUEAR UM STOP.
 *
 * O `aprovar`/`recusar` levam CAS estrito: um clique atrasado NAO decide, porque
 * autorizar o que nao se viu e o erro que o STALE existe para apanhar.
 *
 * O `parar` leva o hash na mesma — mesma forma, mesma auditabilidade — mas NAO se
 * recusa por divergencia. Um clique atrasado sobre um agente descontrolado tem de o
 * parar a mesma; recusar «porque o estado mudou» seria o botao de emergencia a
 * falhar exactamente quando o estado esta a mudar depressa. O `toolCancel` ja e
 * idempotente sobre jobs terminados (no-op, nao erro), que e a outra metade.
 */
const ACCOES_COM_CAS_ESTRITO = Object.freeze(['aprovar', 'recusar']);

/** Identificadores e a IMPRESSAO do cartao — nunca conteudo. */
function valorDoBotao(jobId, accao, hash) {
  return JSON.stringify({ j: String(jobId), a: accao, h: String(hash == null ? '' : hash) });
}

function lerValorDoBotao(valor) {
  let o;
  try { o = JSON.parse(String(valor == null ? '' : valor)); } catch { return { ok: false, porque: 'nao e JSON' }; }
  if (!o || typeof o !== 'object') return { ok: false, porque: 'nao e objecto' };
  const accao = ACCOES[o.a] ? o.a : null;
  if (!accao) return { ok: false, porque: 'accao desconhecida' };
  if (!o.j) return { ok: false, porque: 'sem job_id' };
  if (!o.h) return { ok: false, porque: 'sem hash — sem CAS nao se decide' };
  return { ok: true, job_id: String(o.j), accao, hash: String(o.h) };
}

/**
 * `confirm` SO no aprovar: num telemovel os botoes ficam lado a lado e um toque
 * errado dispara trabalho pago. Recusar por engano nao gasta e e recuperavel, por
 * isso nao leva atrito — nem `style`, para nao competir com o primario.
 */
function blocosDeAccoes(p) {
  const accoes = [].concat(p.accoes || []).filter((a) => ACCOES[a]);
  if (!accoes.length || !p.job_id || !p.hash_esperado) return null;
  const d = dinheiro(p.custo);
  return { type: 'actions', block_id: 'moo_a', elements: accoes.map((a) => {
    const b = { type: 'button', action_id: ACCOES[a],
      text: { type: 'plain_text', emoji: false, text: a === 'aprovar' ? 'Aprovar' : 'Recusar' },
      value: valorDoBotao(p.job_id, a, p.hash_esperado) };
    if (a === 'aprovar') {
      b.style = 'primary';
      b.confirm = {
        title: { type: 'plain_text', text: 'Aprovar e retomar o trabalho?' },
        text: { type: 'mrkdwn', text: 'Já gasto até agora: *' + d.texto + '*.\n'
          + 'Não há tecto de custo declarado para o que vem a seguir.\n'
          + 'Impressão do pedido: `' + hashCurto(p.hash_esperado) + '`' },
        confirm: { type: 'plain_text', text: 'Aprovar' },
        deny: { type: 'plain_text', text: 'Voltar' },
        style: 'primary',
      };
    }
    return b;
  }) };
}

// ── blocos ──────────────────────────────────────────────────────────────────

/**
 * O botao PARAR, no cartao de estado enquanto o job corre.
 *
 * SEM `confirm`: um stop de emergencia com atrito nao e um stop. O custo de parar
 * por engano e baixo (repete-se o pedido); o custo de NAO conseguir parar e ver um
 * agente a fazer asneira na propria maquina, de longe, sem nada que se faca.
 * Sem `style:'danger'` tambem: o vermelho aqui leria-se como "acao perigosa", e a
 * accao perigosa e a outra — deixar correr.
 */
function blocoDeParar(p) {
  if (!p.job_id || !p.hash_esperado) return null;
  return { type: 'actions', block_id: 'moo_p', elements: [{
    type: 'button', action_id: ACCOES.parar,
    text: { type: 'plain_text', emoji: false, text: 'Parar' },
    value: valorDoBotao(p.job_id, 'parar', p.hash_esperado) }] };
}

const secao = (texto, extra) => Object.assign(
  { type: 'section', text: { type: 'mrkdwn', text: texto } }, extra || {});
const contexto = (partes) => ({ type: 'context',
  elements: partes.filter(Boolean).map((t) => ({ type: 'mrkdwn', text: t })) });
const cabecalho = (texto) => ({ type: 'header',
  text: { type: 'plain_text', emoji: false, text: texto } });
const campos = (pares) => ({ type: 'section', fields: pares.slice(0, MAX_FIELDS)
  .map(([k, v]) => ({ type: 'mrkdwn', text: '*' + k + '*\n' + v })) });

/** O dinheiro em section de largura INTEIRA: nunca em `fields`, nunca em `context`. */
function blocoDoDinheiro(p) {
  const d = dinheiro(p.custo);
  return secao('*Já gasto até agora neste pedido:* ' + d.texto + '\n' + d.sufixo);
}

/** A prova, completa, em code span. E esta a string que o CAS compara. */
function blocoDaImpressao(h) {
  return secao('*Impressão do pedido* (muda se o pedido mudar)\n`' + impressaoCompleta(h) + '`',
    { text: { type: 'mrkdwn', verbatim: true,
      text: '*Impressão do pedido* (muda se o pedido mudar)\n`' + impressaoCompleta(h) + '`' } });
}

function rodapeComum(p) {
  return contexto([
    'pedido `' + String(p.job_id || 'n/d') + '`',
    'modelo `' + modeloCurto(p.modelo) + '`',
    'ficheiros alterados: não declarados — este motor nunca os reporta',
  ]);
}

function blocosDePendente(p) {
  return { blocos: [
    cabecalho('Aprovação pendente · ' + (p.wave || 'slack-spike') + ' · ' + apelido(p.job_id)),
    // a consequencia ANTES do toque, e para os DOIS botoes: estava so dentro do
    // `confirm`, ou seja o leitor so a via depois de ja ter tocado
    secao('*Aprovar* retoma o trabalho pago deste pedido. *Recusar* deixa-o parado — '
      + 'nada mais é cobrado e podes pedir de novo.'),
    blocoDoDinheiro(p),
    campos([
      ['Pedido por', mencaoDeActor(valorDe(p.autor))],
      ['Executado por', motorLegivel(p.motor)],
    ]),
    blocoDaImpressao(p.hash_esperado),
  ].concat(blocosDeAccoes(p) ? [{ type: 'divider' }, blocosDeAccoes(p)] : []),
  rodape: rodapeComum(p) };
}

const ROSTO = Object.freeze({
  APPROVED: { emoji: '✅', verbo: 'Aprovado', extra: 'O trabalho foi retomado.' },
  REJECTED: { emoji: '❌', verbo: 'Recusado', extra: null },
  STALE: { emoji: '⏳', verbo: 'Decisão não aplicada', extra: null },
  EXPIRED: { emoji: '⌛', verbo: 'Expirado', extra: null },
  PARADO: { emoji: '🛑', verbo: 'Parado', extra: 'O trabalho foi interrompido. Nada ficou a meio sem se saber.' },
  JA_TERMINADO: { emoji: '🏁', verbo: 'Já tinha acabado', extra: 'O stop chegou depois do fim — nada foi interrompido.' },
});

function blocosDeDecisao(p) {
  const r = ROSTO[p.estado] || { emoji: '•', verbo: String(p.estado || 'sem estado') };
  const quem = p.autor ? mencaoDeActor(valorDe(p.autor)) : null;

  // STALE nao e decisao: o pedido CONTINUA a espera e um cartao novo vai aparecer
  if (p.estado === 'STALE') {
    return { blocos: [
      cabecalho('Decisão não aplicada · ' + apelido(p.job_id)),
      secao('⏳ *A decisão não foi aplicada* — o pedido mudou entre o cartão e o toque.\n'
        + 'O pedido *continua* à espera, e vai aparecer um cartão novo.'),
      campos([
        ['Impressão no cartão', '`' + hashCurto(p.hash_esperado) + '`'],
        ['Impressão agora', '`' + hashCurto(p.hash_actual) + '`'],
      ]),
    ], rodape: contexto(['pedido `' + String(p.job_id || 'n/d') + '`',
      'nada foi cobrado por este toque']) };
  }

  const linhas = [r.emoji + ' *' + r.verbo + '*' + (quem ? ' por ' + quem : '')];
  if (r.extra) linhas.push(r.extra);
  // ⚠️ Um estado que este modulo nao conhece NAO pode ficar sem explicacao: o
  // `texto` que o adapter escreveu ("sem decisao: motivo n/d") e a unica coisa
  // que diz o que aconteceu. Ao reescrever o cartao deixei de o renderizar, e o
  // resultado era informacao a desaparecer em silencio — e, de passagem, um teste
  // de vazamento que passou a ser vacuo, porque o campo ja nao ia a lado nenhum.
  if (!ROSTO[p.estado] && p.texto) linhas.push(String(p.texto));
  return { blocos: [
    cabecalho(r.verbo + ' · ' + apelido(p.job_id)),
    secao(linhas.join('\n')),
    blocoDoDinheiro(p),
    blocoDaImpressao(p.hash_esperado),
  ], rodape: contexto([
    'pedido `' + String(p.job_id || 'n/d') + '`',
    // o modelo entra aqui porque quem paga quer saber QUAL motor gastou — estava
    // so no cartao do pendente, e a decisao e o sitio onde o dinheiro se confirma
    'modelo `' + modeloCurto(p.modelo) + '`',
    p.auditoria ? '🧾 registado no ledger: ' + p.auditoria : null,
  ]) };
}

/**
 * O FECHO de um job que acabou SEM pedir decisao.
 *
 * ⚠️ Este cartao existe porque a sua falta enganou-nos ao vivo. O thread dizia
 * «Recebido. Vou trabalhar e volto aqui quando precisar de uma decisao» e calava-se
 * PARA SEMPRE — enquanto o job real corria, gastava US$ 0,096 e terminava bem. Uma
 * unica mensagem no inicio, sem nunca fechar, e verdade que engana: quem le conclui
 * que nada aconteceu. «Status no thread» so conta se o thread contar o fim.
 */
const FECHOS = Object.freeze({
  concluido: { emoji: '🏁', verbo: 'Trabalho concluído', nota: 'Não foi preciso decidir nada.' },
  falhou: { emoji: '⚠️', verbo: 'Trabalho falhou', nota: 'Nada foi aplicado.' },
});

function blocosDeFecho(p) {
  const f = FECHOS[p.estado] || { emoji: '•', verbo: String(p.estado || 'terminou'), nota: null };
  const d = dinheiro(p.custo);
  return { blocos: [
    secao(f.emoji + ' *' + f.verbo + '*' + (f.nota ? '\n' + f.nota : '')),
    blocoDoDinheiro(p),
  ], rodape: contexto([
    'pedido `' + String(p.job_id || 'n/d') + '`',
    'modelo `' + modeloCurto(p.modelo) + '`',
    d.tem ? null : 'sem custo declarado por este motor',
  ]) };
}

function blocosDeEstado(p) {
  if (!p.job_id) {
    return { blocos: [secao('⚠️ Não consegui aceitar este pedido. Nada foi iniciado.')],
      rodape: null };
  }
  const passos = Number(p.passos || 0);
  const seg = Number(p.segundos || 0);
  // o heartbeat SO acrescenta numeros quando ja ha numeros REAIS para acrescentar.
  // Sem passos e sem tempo, e o primeiro estado: nao se inventa progresso nenhum.
  const linha = (passos || seg)
    ? '⚙️ *A trabalhar* · ' + passos + ' ' + (passos === 1 ? 'passo' : 'passos')
      + ' · ' + duracao(seg)
    : '⚙️ Recebido. Vou trabalhar e volto aqui quando precisar de uma decisão.';
  const blocos = [secao(linha)];
  const parar = blocoDeParar(p);
  if (parar) blocos.push(parar);
  return { blocos, rodape: contexto(['pedido `' + p.job_id + '`']) };
}

/** `1m12s` — nunca uma percentagem, nunca um ETA: nao ha denominador honesto. */
function duracao(seg) {
  const s = Math.max(0, Math.round(Number(seg) || 0));
  return s < 60 ? s + 's' : Math.floor(s / 60) + 'm' + String(s % 60).padStart(2, '0') + 's';
}

/** O texto do push: o unico que o telemovel mostra antes de abrir. */
function notificacao(p) {
  const nome = apelido(p.job_id);
  if (p.tipo === 'pendente') {
    const d = dinheiro(p.custo);
    return 'Aprovação pendente · ' + nome + ' · já gasto ' + d.texto;
  }
  if (p.tipo === 'decisao') {
    const r = ROSTO[p.estado] || { verbo: String(p.estado || 'decisão') };
    return r.verbo + ' · ' + nome;
  }
  if (p.tipo === 'fecho') {
    const f = FECHOS[p.estado] || { verbo: 'Terminou' };
    return f.verbo + ' · ' + nome + ' · ' + dinheiro(p.custo).texto;
  }
  return p.job_id ? 'Recebido · ' + nome : 'Não aceitei o pedido';
}

function construir(payload) {
  const p = payload || {};
  const por = p.tipo === 'pendente' ? blocosDePendente
    : (p.tipo === 'decisao' ? blocosDeDecisao
      : (p.tipo === 'fecho' ? blocosDeFecho : blocosDeEstado));
  const { blocos, rodape } = por(p);
  const fora = blocos.slice();
  if (rodape && rodape.elements.length) fora.push(rodape);
  return { blocos: fora, texto: notificacao(p) };
}

module.exports = { LIMITE_SECTION, MAX_FIELDS, CHARS_HASH, MOEDA, ROSTO, ACCOES,
  MOTORES_LEGIVEIS, FONTES_LEGIVEIS,
  fonteLegivel, dinheiro, impressaoCompleta, hashCurto, mencaoDeActor, valorDe,
  modeloCurto, motorLegivel, apelido,
  valorDoBotao, lerValorDoBotao, blocosDeAccoes,
  blocosDePendente, blocosDeDecisao, blocosDeEstado, blocosDeFecho, FECHOS,
  blocoDeParar, duracao, ACCOES_COM_CAS_ESTRITO,
  notificacao, construir };
