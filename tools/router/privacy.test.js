// privacy.test.js — o redactor não tinha testes, e passou a ter donos.
//
// PORQUÊ AGORA: enquanto o `privacy.sanitize` só limpava `prompt_preview` do
// `decisions.log`, um buraco na lista era barato. Deixou de ser: o
// `ledger-turn-io.js` guarda o PROMPT HUMANO no journal e chama esta função, e
// o journal tem projecção para o `SYNC.md`, que é versionado em git
// (`packages/vscode-extension/src/host-extra.js`, `_eventText` → `'Pediste: '`).
// Um segredo que escape aqui pode acabar no histórico do repositório.
//
// Os casos abaixo são os SEIS que a lista de `agent-sync-ledger.js:40-51` já
// conhecia e esta não — mais a ordem das regras, que é significativa e não
// estava escrita em lado nenhum.
'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const { sanitize, RULES } = require('./privacy.js');

// Chaves sintéticas, com a forma real mas sem valor — nunca colar uma a sério
// num ficheiro versionado, nem sequer revogada.
const AWS = 'AKIA' + '1234567890ABCDEF';
const GOOGLE = 'AIza' + 'SyD-1234567890abcdefghijklmnopqrs';
const SLACK = 'xoxb-' + '123456789012-abcdefghijklmnop';
const PAT = 'github_pat_' + '11ABCDEFG0abcdefghijklmn_XYZ';
const SKPROJ = 'sk-proj-' + 'abcdefghij_klmnopqrst-uvwxyz1234';

test('AWS: 20 caracteres passavam por baixo da regra <base64>, que exige 40', () => {
  const out = sanitize('a chave é ' + AWS + ' pronto');
  assert.ok(!out.includes(AWS));
  assert.match(out, /<aws_key>/);
});

test('Google: 39 caracteres — falhava o ≥40 do base64 por UM carácter', () => {
  const out = sanitize('key=' + GOOGLE + ' fim');
  assert.ok(!out.includes(GOOGLE));
  assert.match(out, /<google_key>/);
});

test('Slack, github_pat e chave PEM são reconhecidos', () => {
  assert.match(sanitize('token ' + SLACK), /<slack_token>/);
  assert.match(sanitize('usa ' + PAT), /<github_token>/);
  assert.match(sanitize('-----BEGIN RSA PRIVATE KEY-----'), /<private_key>/);
});

test('sk-: a classe inclui `_` e `-`, senão a chave era cortada a meio', () => {
  // `sk-[a-zA-Z0-9]{20,}` parava no primeiro separador de `sk-proj-…`:
  // redigia o prefixo e deixava o resto da chave em claro.
  const out = sanitize('a minha ' + SKPROJ + ' ok');
  assert.ok(!out.includes('abcdefghij'), 'metade da chave ficou em claro');
  assert.match(out, /<api_key>/);
});

test('credenciais em URL: a regra TEM de correr antes da do email', () => {
  // Medido: com a ordem inversa, `hunter2@github.com` casa como email primeiro
  // e o resultado fica `https://paulo:<email>` — esconde a senha, expõe o
  // utilizador, e mente sobre o que ali estava.
  const out = sanitize('clona https://paulo:hunter2@github.com/x/y.git');
  assert.ok(!out.includes('hunter2'));
  assert.ok(!out.includes('paulo:'), 'o utilizador da credencial ficou legível');
  assert.match(out, /<credentials>@/);
});

test('a regra do base64 fica em ÚLTIMO — é gulosa e engoliria as outras', () => {
  const ultima = RULES[RULES.length - 1];
  assert.match(String(ultima.rx), /A-Za-z0-9\+\//, 'a última regra deixou de ser a do base64');
  assert.equal(ultima.replace, '<base64>');
});

test('segredo declarado em prosa ou código é redigido, com o rótulo preservado', () => {
  const out = sanitize('o password = supersecreto123 e isto');
  assert.ok(!out.includes('supersecreto123'));
  assert.match(out, /password = <secret>/, 'o rótulo diz o que foi cortado');
  assert.match(sanitize('api_key: abcdefghijkl'), /<secret>/);
});

test('prosa normal atravessa intacta — redigir tudo é o mesmo que não registar nada', () => {
  const frases = [
    'liga o intent/outcome no gsd-turn-end e corre os testes',
    'o oráculo mede antes e depois, custo 0 USD',
    'porque é que o websocket reconnect falha às vezes?',
  ];
  for (const f of frases) assert.equal(sanitize(f), f, 'a redacção comeu prosa inocente: ' + f);
});

test('entrada inválida atravessa sem lançar — o redactor nunca parte o chamador', () => {
  assert.equal(sanitize(''), '');
  assert.equal(sanitize(null), null);
  assert.equal(sanitize(undefined), undefined);
  assert.equal(sanitize(42), 42);
});

test('as regras herdadas continuam a valer — nada foi partido ao acrescentar', () => {
  assert.match(sanitize('sk-ant-api03-' + 'A'.repeat(30)), /<anthropic_key>/);
  assert.match(sanitize('ghp_' + 'a'.repeat(36)), /<github_token>/);
  assert.match(sanitize('Authorization: Bearer abc.def.ghi'), /Bearer <token>/);
  assert.match(sanitize('escreve para alguem@exemplo.pt'), /<email>/);
  assert.match(sanitize('liga a 192.168.1.1'), /<ip>/);
  assert.match(sanitize('postgres://u:p@host/db'), /<connection_string>|<credentials>/);
});
