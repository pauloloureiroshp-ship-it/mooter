'use strict';
/** ⚠️ THROWAWAY — spike Slack. Testes da derivacao. ZERO rede: `fetch` injectado. */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const d = require('./descobrir.js');

const BOT = 'U0BOT';
const PAULO = 'U_PAULO';

/** `fetch` falso com respostas por metodo. Aceita funcao para respostas paginadas. */
function fetchFalso(respostas) {
  const chamadas = [];
  const f = async (url, init) => {
    const metodo = String(url).split('/api/')[1];
    const corpo = JSON.parse(init.body);
    chamadas.push({ metodo, corpo });
    const r = respostas[metodo];
    const j = typeof r === 'function' ? r(corpo) : r;
    return { json: async () => (j || { ok: false, error: 'unknown_method' }) };
  };
  f.chamadas = chamadas;
  return f;
}

const OK_AUTH = { ok: true, user_id: BOT, team: 'Mooter HQ' };
const OK_CANAIS = { ok: true, channels: [
  { id: 'C_OUTRO', name: 'general', is_member: true },
  { id: 'C_DEMO', name: 'mooter-demo', is_member: true },
] };
const OK_USERS = { ok: true, members: [
  { id: BOT, name: 'mooter', is_bot: true },
  { id: 'USLACKBOT', name: 'slackbot', is_bot: false },
  { id: 'U_ANTIGO', name: 'saiu', is_bot: false, deleted: true },
  { id: PAULO, name: 'paulo', is_bot: false },
] };

function comEnv(conteudo) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'spike-env-'));
  const p = path.join(dir, '.env');
  fs.writeFileSync(p, conteudo);
  return p;
}

// ── o caminho feliz ─────────────────────────────────────────────────────────
test('descobrirTudo · deriva as 3 variaveis do proprio bot', async () => {
  const f = fetchFalso({ 'auth.test': OK_AUTH, 'conversations.list': OK_CANAIS, 'users.list': OK_USERS });
  const r = await d.descobrirTudo({ botToken: 'xoxb-x', fetchImpl: f });
  assert.equal(r.ok, true);
  assert.deepEqual(r.valores, {
    SLACK_BOT_USER_ID: BOT, SLACK_CANAL: 'C_DEMO', SLACK_ALLOW_USER_ID: PAULO,
  });
});

test('descobrirTudo · o bot e o slackbot e os apagados NAO contam como humano', async () => {
  const f = fetchFalso({ 'auth.test': OK_AUTH, 'conversations.list': OK_CANAIS, 'users.list': OK_USERS });
  const r = await d.descobrirTudo({ botToken: 'xoxb-x', fetchImpl: f });
  assert.equal(r.valores.SLACK_ALLOW_USER_ID, PAULO);
});

test('descobrirCanal · segue o cursor do Slack em vez de ficar na 1a pagina', async () => {
  const f = fetchFalso({ 'conversations.list': (c) => (c.cursor
    ? { ok: true, channels: [{ id: 'C_DEMO', name: 'mooter-demo', is_member: true }] }
    : { ok: true, channels: [{ id: 'C_X', name: 'random' }],
      response_metadata: { next_cursor: 'pag2' } }) });
  const r = await d.descobrirCanal({ botToken: 'xoxb-x', fetchImpl: f, nome: 'mooter-demo' });
  assert.equal(r.ok, true);
  assert.equal(r.canal, 'C_DEMO');
  assert.equal(f.chamadas.length, 2);
});

test('descobrirCanal · aceita o nome com # e sem #', async () => {
  const f = fetchFalso({ 'conversations.list': OK_CANAIS });
  assert.equal((await d.descobrirCanal({ fetchImpl: f, nome: '#mooter-demo' })).canal, 'C_DEMO');
});

// ── fail-closed ─────────────────────────────────────────────────────────────
test('descobrirCanal · canal inexistente NAO devolve o parecido mais proximo', async () => {
  const f = fetchFalso({ 'conversations.list': { ok: true,
    channels: [{ id: 'C_QUASE', name: 'mooter-demos' }, { id: 'C_G', name: 'general' }] } });
  const r = await d.descobrirCanal({ fetchImpl: f, nome: 'mooter-demo' });
  assert.equal(r.ok, false);
  assert.match(r.porque, /nao existe/);
  assert.ok(!r.canal);
});

test('descobrirCanal · avisa quando o bot ve o canal mas NAO e membro', async () => {
  const f = fetchFalso({ 'auth.test': OK_AUTH, 'users.list': OK_USERS,
    'conversations.list': { ok: true, channels: [{ id: 'C_DEMO', name: 'mooter-demo', is_member: false }] } });
  const r = await d.descobrirTudo({ fetchImpl: f });
  assert.equal(r.ok, true);
  assert.equal(r.e_membro, false);
  assert.match(r.notas.join(' '), /NAO e membro.*invite/);
});

test('descobrirHumano · DOIS humanos e recusa, com os ids, nao uma escolha as cegas', async () => {
  const f = fetchFalso({ 'users.list': { ok: true, members: [
    { id: PAULO, name: 'paulo', is_bot: false }, { id: 'U_OUTRO', name: 'alguem', is_bot: false }] } });
  const r = await d.descobrirHumano({ fetchImpl: f, botUserId: BOT });
  assert.equal(r.ok, false);
  assert.match(r.porque, /2 humanos/);
  assert.match(r.porque, /U_OUTRO/);
  assert.match(r.porque, /quem aprova gastos/);
  assert.ok(!r.allow_user_id);
});

test('descobrirHumano · ZERO humanos e recusa', async () => {
  const f = fetchFalso({ 'users.list': { ok: true, members: [{ id: BOT, is_bot: true }] } });
  assert.equal((await d.descobrirHumano({ fetchImpl: f, botUserId: BOT })).ok, false);
});

test('descobrirTudo · para no PRIMEIRO passo que falha e diz qual foi', async () => {
  const f = fetchFalso({ 'auth.test': { ok: false, error: 'invalid_auth' } });
  const r = await d.descobrirTudo({ fetchImpl: f });
  assert.equal(r.ok, false);
  assert.equal(r.passo, 'auth.test');
  assert.equal(f.chamadas.length, 1, 'nao se deriva em cima de lixo');
});

test('descobrirTudo · missing_scope diz QUAL o scope e o que fazer', async () => {
  const f = fetchFalso({ 'auth.test': OK_AUTH,
    'conversations.list': { ok: false, error: 'missing_scope' } });
  const r = await d.descobrirTudo({ fetchImpl: f });
  assert.equal(r.ok, false);
  assert.match(r.porque, /channels:read/);
  assert.match(r.porque, /reinstala/);
});

// ── a escrita no .env ───────────────────────────────────────────────────────
test('escreverEnv · acrescenta as derivadas e NAO toca nas linhas dos tokens', () => {
  const p = comEnv('# tokens do slack\nSLACK_APP_TOKEN=xapp-SEGREDO\nSLACK_BOT_TOKEN=xoxb-SEGREDO\n');
  const r = d.escreverEnv(p, { SLACK_CANAL: 'C_DEMO', SLACK_BOT_USER_ID: BOT,
    SLACK_ALLOW_USER_ID: PAULO });
  assert.equal(r.ok, true);
  assert.deepEqual(r.escritas.sort(), ['SLACK_ALLOW_USER_ID', 'SLACK_BOT_USER_ID', 'SLACK_CANAL']);
  const depois = fs.readFileSync(p, 'utf8');
  assert.match(depois, /^# tokens do slack$/m, 'o comentario ficou');
  assert.match(depois, /^SLACK_APP_TOKEN=xapp-SEGREDO$/m, 'o token ficou byte-a-byte');
  assert.match(depois, /^SLACK_BOT_TOKEN=xoxb-SEGREDO$/m);
  assert.match(depois, /^SLACK_CANAL=C_DEMO$/m);
  assert.equal((depois.match(/SLACK_BOT_TOKEN/g) || []).length, 1, 'nao duplicou nada');
});

test('escreverEnv · actualiza uma chave que ja existe em vez de a duplicar', () => {
  const p = comEnv('SLACK_BOT_TOKEN=xoxb-S\nSLACK_CANAL=C_VELHO\n');
  const r = d.escreverEnv(p, { SLACK_CANAL: 'C_NOVO' });
  assert.deepEqual(r.actualizadas, ['SLACK_CANAL']);
  const depois = fs.readFileSync(p, 'utf8');
  assert.equal((depois.match(/^SLACK_CANAL=/gm) || []).length, 1);
  assert.match(depois, /^SLACK_CANAL=C_NOVO$/m);
});

test('escreverEnv · idempotente: correr duas vezes nao muda nada a segunda', () => {
  const p = comEnv('SLACK_BOT_TOKEN=xoxb-S\n');
  const v = { SLACK_CANAL: 'C_DEMO' };
  d.escreverEnv(p, v);
  const a = fs.readFileSync(p, 'utf8');
  const r2 = d.escreverEnv(p, v);
  assert.deepEqual([r2.escritas, r2.actualizadas], [[], []]);
  assert.equal(fs.readFileSync(p, 'utf8'), a);
});

test('escreverEnv · reconhece `export CHAVE=` e nao cria uma segunda linha', () => {
  const p = comEnv('export SLACK_CANAL=C_VELHO\n');
  d.escreverEnv(p, { SLACK_CANAL: 'C_NOVO' });
  const depois = fs.readFileSync(p, 'utf8');
  assert.equal((depois.match(/SLACK_CANAL/g) || []).length, 1);
  assert.match(depois, /^SLACK_CANAL=C_NOVO$/m);
});

test('escreverEnv · sem .env recusa (os tokens vem primeiro)', () => {
  const r = d.escreverEnv(path.join(os.tmpdir(), 'nao-existe-' + Date.now(), '.env'), { SLACK_CANAL: 'C' });
  assert.equal(r.ok, false);
  assert.match(r.porque, /tokens vem primeiro/);
});

test('escreverEnv · valor vazio nao escreve uma chave vazia', () => {
  const p = comEnv('SLACK_BOT_TOKEN=xoxb-S\n');
  const r = d.escreverEnv(p, { SLACK_CANAL: '', SLACK_BOT_USER_ID: null });
  assert.deepEqual([r.escritas, r.actualizadas], [[], []]);
  assert.ok(!fs.readFileSync(p, 'utf8').includes('SLACK_CANAL'));
});

test('descobrirTudo · honra o nome de canal que lhe passam (o parametro liga a algo)', async () => {
  const f = fetchFalso({ 'auth.test': OK_AUTH, 'users.list': OK_USERS,
    'conversations.list': { ok: true, channels: [
      { id: 'C_DEMO', name: 'mooter-demo', is_member: true },
      { id: 'C_OUTRA', name: 'outra-demo', is_member: true }] } });
  const r = await d.descobrirTudo({ fetchImpl: f, canalNome: 'outra-demo' });
  assert.equal(r.valores.SLACK_CANAL, 'C_OUTRA');
});
