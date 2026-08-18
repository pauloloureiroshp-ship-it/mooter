'use strict';
/**
 * ⚠️ THROWAWAY — spike Slack. As 3 variaveis que se derivam em vez de se pedir.
 *
 * O dono deu os tokens; o resto (canal, id do bot, id do humano) o proprio bot
 * sabe perguntar. Pedir a mao o que a API sabe dizer e onde nascem os typos que
 * so aparecem em demo.
 *
 * As chamadas ao Slack passam TODAS pelo `chamarSlack` do `transporte.js` — este
 * modulo nao abre um segundo caminho para fora. A afirmacao «um unico ficheiro
 * fala com o Slack» continua verdadeira.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * FAIL-CLOSED EM CADA DERIVACAO
 *
 * Uma derivacao que adivinha e pior que uma pergunta. Por isso:
 *   canal   -> nome EXACTO; 0 resultados => erro que diz o nome que procurou
 *   humano  -> tem de haver EXACTAMENTE 1; 0 ou 2+ => recusa e lista os ids
 *   bot     -> `auth.test` ou nada
 *
 * O caso do humano e o mais importante: a allowlist do spike aceita UM id
 * (invariante do `allowlist.js`). Se o workspace tiver dois humanos, escolher um
 * era escolher quem pode aprovar gastos — e isso nao se adivinha, pergunta-se.
 * ─────────────────────────────────────────────────────────────────────────
 */

const fs = require('fs');
const { chamarSlack } = require('./transporte.js');

/** Scope que cada chamada precisa — para o erro dizer o que fazer, nao so que falhou. */
const SCOPES = Object.freeze({
  'auth.test': '(nenhum — basta o bot token)',
  'conversations.list': 'channels:read (e groups:read se o canal for privado)',
  'users.list': 'users:read',
});

function erroLegivel(metodo, e) {
  const sl = (e && e.slack_error) || 'n/d';
  const extra = sl === 'missing_scope' || sl === 'not_allowed_token_type'
    ? ' — falta o scope ' + SCOPES[metodo] + '; acrescenta-o na app e reinstala-a no workspace'
    : '';
  return metodo + ' falhou (' + sl + ')' + extra;
}

/** Percorre um metodo paginado e junta uma chave da resposta. Cursor do Slack. */
async function paginar(metodo, chave, corpoBase, opcoes) {
  const out = [];
  let cursor;
  let paginas = 0;
  do {
    const corpo = Object.assign({ limit: 200 }, corpoBase);
    if (cursor) corpo.cursor = cursor;
    const j = await chamarSlack(metodo, corpo, opcoes);
    for (const x of (j[chave] || [])) out.push(x);
    cursor = (j.response_metadata && j.response_metadata.next_cursor) || '';
    paginas += 1;
  } while (cursor && paginas < 20);   // 20 paginas = 4000 registos: um workspace de 1 pessoa
  return out;
}

/** O id do PROPRIO bot — e o que se tira do texto da mencao para obter o goal. */
async function descobrirBot(opcoes) {
  const o = opcoes || {};
  let j;
  try { j = await chamarSlack('auth.test', {}, { token: o.botToken, fetchImpl: o.fetchImpl }); } catch (e) {
    return { ok: false, porque: erroLegivel('auth.test', e) };
  }
  if (!j.user_id) return { ok: false, porque: 'auth.test respondeu ok mas sem user_id' };
  return { ok: true, bot_user_id: j.user_id, team: j.team || 'n/d' };
}

/** O canal, por NOME exacto. `#mooter-demo` — a demo e de um canal. */
async function descobrirCanal(opcoes) {
  const o = opcoes || {};
  const nome = String(o.nome || 'mooter-demo').replace(/^#/, '');
  let canais;
  try {
    canais = await paginar('conversations.list', 'channels',
      { types: 'public_channel,private_channel', exclude_archived: true },
      { token: o.botToken, fetchImpl: o.fetchImpl });
  } catch (e) {
    return { ok: false, porque: erroLegivel('conversations.list', e) };
  }
  const achados = canais.filter((c) => c && c.name === nome);
  if (achados.length === 0) {
    return { ok: false, porque: 'nao existe (ou o bot nao ve) um canal chamado #' + nome
      + ' — vi ' + canais.length + ' canal(is). Cria-o, ou convida o bot para lá com /invite' };
  }
  // nomes de canal sao unicos no Slack; 2+ significa que se leu mal, nao que ha escolha
  if (achados.length > 1) {
    return { ok: false, porque: 'mais do que um canal com o nome #' + nome + ' — nao devia '
      + 'acontecer; nao se escolhe por sorte' };
  }
  return { ok: true, canal: achados[0].id, nome: '#' + nome,
    e_membro: achados[0].is_member === true };
}

/**
 * O humano. O dono disse «sou o único humano do workspace» — isto verifica
 * a afirmacao em vez de a assumir, e recusa se ela nao se confirmar.
 */
async function descobrirHumano(opcoes) {
  const o = opcoes || {};
  let membros;
  try {
    membros = await paginar('users.list', 'members', {},
      { token: o.botToken, fetchImpl: o.fetchImpl });
  } catch (e) {
    return { ok: false, porque: erroLegivel('users.list', e) };
  }
  const humanos = membros.filter((u) => u && !u.is_bot && !u.deleted
    && u.id !== 'USLACKBOT' && u.id !== o.botUserId);
  if (humanos.length === 0) {
    return { ok: false, porque: 'nao encontrei nenhum humano no workspace (vi ' + membros.length
      + ' membro(s)) — sem humano nao ha a quem pedir aprovacao' };
  }
  if (humanos.length > 1) {
    return { ok: false, porque: 'ha ' + humanos.length + ' humanos no workspace ('
      + humanos.map((u) => u.id + (u.name ? '/' + u.name : '')).join(', ')
      + ') e a allowlist do spike aceita UM. Escolher por ti era escolher quem aprova gastos '
      + '— diz-me qual e o id' };
  }
  return { ok: true, allow_user_id: humanos[0].id, nome: humanos[0].name || 'n/d' };
}

/** As tres, de uma vez. Para-se na primeira que falha: derivar em cima de lixo nao ajuda. */
async function descobrirTudo(opcoes) {
  const o = opcoes || {};
  const notas = [];

  const b = await descobrirBot(o);
  if (!b.ok) return { ok: false, passo: 'auth.test', porque: b.porque };
  notas.push('bot: ' + b.bot_user_id + ' · workspace: ' + b.team);

  const c = await descobrirCanal(Object.assign({}, o,
    { nome: o.nome || o.canalNome || 'mooter-demo' }));
  if (!c.ok) return { ok: false, passo: 'conversations.list', porque: c.porque };
  notas.push('canal: ' + c.nome + ' = ' + c.canal
    + (c.e_membro ? '' : ' ⚠️ o bot NAO e membro — faz /invite @Mooter no canal'));

  const h = await descobrirHumano(Object.assign({}, o, { botUserId: b.bot_user_id }));
  if (!h.ok) return { ok: false, passo: 'users.list', porque: h.porque };
  notas.push('humano: ' + h.allow_user_id + '/' + h.nome + ' (unico do workspace, verificado)');

  return { ok: true, notas, e_membro: c.e_membro,
    valores: {
      SLACK_BOT_USER_ID: b.bot_user_id,
      SLACK_CANAL: c.canal,
      SLACK_ALLOW_USER_ID: h.allow_user_id,
    } };
}

// ── escrita no .env ─────────────────────────────────────────────────────────

/**
 * Escreve as chaves derivadas SEM tocar em mais nada. Nunca reescreve o
 * ficheiro de novo a partir de um objecto: as linhas que nao sao destas chaves
 * ficam byte-a-byte como estavam, comentarios incluidos. Um `.env` com tokens
 * dentro nao e sitio para um round-trip de parser.
 *
 * @returns {{ok:boolean, escritas:string[], actualizadas:string[], porque?:string}}
 */
function escreverEnv(envPath, valores) {
  if (!fs.existsSync(envPath)) {
    return { ok: false, escritas: [], actualizadas: [],
      porque: 'o .env nao existe — os tokens vem primeiro, as derivadas depois' };
  }
  const original = fs.readFileSync(envPath, 'utf8');
  const nl = original.includes('\r\n') ? '\r\n' : '\n';
  const linhas = original.split(/\r?\n/);
  const escritas = [];
  const actualizadas = [];

  for (const [chave, valor] of Object.entries(valores || {})) {
    if (valor == null || String(valor).trim() === '') continue;
    const linha = chave + '=' + String(valor);
    const i = linhas.findIndex((l) => new RegExp('^\\s*(export\\s+)?' + chave + '\\s*=').test(l));
    if (i >= 0) {
      if (linhas[i] === linha) continue;      // ja estava certo: nao se toca
      linhas[i] = linha;
      actualizadas.push(chave);
    } else {
      // acrescenta no fim, sem deixar o ficheiro sem newline final
      if (linhas.length && linhas[linhas.length - 1] !== '') linhas.push('');
      linhas[linhas.length - 1] = linha;
      linhas.push('');
      escritas.push(chave);
    }
  }
  if (!escritas.length && !actualizadas.length) {
    return { ok: true, escritas, actualizadas, porque: 'nada a escrever — ja estava tudo lá' };
  }
  fs.writeFileSync(envPath, linhas.join(nl), 'utf8');
  return { ok: true, escritas, actualizadas };
}

module.exports = { SCOPES, paginar, descobrirBot, descobrirCanal, descobrirHumano,
  descobrirTudo, escreverEnv };
