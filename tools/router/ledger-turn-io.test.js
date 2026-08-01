// ledger-turn-io.test.js — Ledger Spine L0: MECHANICAL intent + outcome capture.
// Prova: o prompt humano do turno vira `intent` com identidade estável; a
// resposta vira `outcome` com ferramentas, ficheiros escritos, erros e uso
// medido; um tool_result NÃO é um prompt; uma injecção de hook (`<...>`) NÃO é
// um prompt; sem uso reportado o campo é `null` (n/d) e nunca zero; e os dois
// eventos aterram no journal com `kind` correcto e deduplicados por idem_key.
'use strict';

const { test, before, after } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { deriveTurnIO, _isHumanPrompt } = require('./ledger-turn-io.js');

// Um tail realista: prompt humano → assistente com tool_use → tool_result (um
// deles em erro) → remate do assistente. Mesma forma que o host escreve.
function fixture() {
  return [
    JSON.stringify({ type: 'user', promptId: 'p-old', uuid: 'u0', timestamp: '2026-08-01T10:00:00.000Z',
      message: { role: 'user', content: 'turno anterior, já fechado' } }),
    JSON.stringify({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text: 'feito' }] } }),
    JSON.stringify({ type: 'user', promptId: 'p-1', uuid: 'u1', timestamp: '2026-08-01T11:00:00.000Z',
      cwd: 'C:/Users/Paulo Loureiro/mooter-wt', gitBranch: 'feat/o1',
      message: { role: 'user', content: 'liga o intent/outcome no gsd-turn-end' } }),
    JSON.stringify({ type: 'assistant', timestamp: '2026-08-01T11:00:05.000Z',
      message: { role: 'assistant', model: 'claude-opus-5', usage: { input_tokens: 100, output_tokens: 40 },
        content: [
          { type: 'text', text: 'a ler o ficheiro' },
          { type: 'tool_use', id: 't1', name: 'Read', input: { file_path: '/repo/a.js' } },
          { type: 'tool_use', id: 't2', name: 'Write', input: { file_path: '/repo/novo.js' } },
          { type: 'tool_use', id: 't3', name: 'Write', input: { file_path: '/repo/negado.js' } },
        ] } }),
    JSON.stringify({ type: 'user', toolUseResult: {}, sourceToolAssistantUUID: 'a1',
      message: { role: 'user', content: [
        { type: 'tool_result', tool_use_id: 't1', content: 'conteúdo' },
        { type: 'tool_result', tool_use_id: 't3', is_error: true, content: 'permission denied' },
      ] } }),
    JSON.stringify({ type: 'assistant', timestamp: '2026-08-01T11:00:20.000Z',
      message: { role: 'assistant', model: 'claude-opus-5', usage: { input_tokens: 200, output_tokens: 60 },
        content: [{ type: 'text', text: 'Ficou ligado.' }] } }),
  ];
}

test('deriva intent do ÚLTIMO prompt humano, com identidade estável', () => {
  const { intent } = deriveTurnIO(fixture());
  assert.equal(intent.turn_id, 'p-1');
  assert.equal(intent.text, 'liga o intent/outcome no gsd-turn-end');
  assert.equal(intent.truncated, false);
  assert.equal(intent.git_branch, 'feat/o1');
  assert.equal(intent.cwd, 'C:/Users/Paulo Loureiro/mooter-wt');
});

test('outcome conta ferramentas, ficheiros escritos e erros — medidos, não inferidos', () => {
  const { outcome } = deriveTurnIO(fixture());
  assert.equal(outcome.turn_id, 'p-1');
  assert.deepEqual(outcome.tools, { Read: 1, Write: 2 });
  assert.equal(outcome.tool_calls, 3);
  assert.deepEqual(outcome.files_written, ['/repo/novo.js', '/repo/negado.js']);
  assert.equal(outcome.tool_errors, 1);
  assert.deepEqual(outcome.models, ['claude-opus-5']);
  assert.equal(outcome.assistant_snippet, 'Ficou ligado.');
  assert.equal(outcome.started_at, '2026-08-01T11:00:00.000Z');
  assert.equal(outcome.ended_at, '2026-08-01T11:00:20.000Z');
});

test('usage é somado quando o host o reporta', () => {
  const { outcome } = deriveTurnIO(fixture());
  assert.equal(outcome.usage.input_tokens, 300);
  assert.equal(outcome.usage.output_tokens, 100);
});

test('sem usage reportado, o campo é null — n/d, nunca um zero inventado', () => {
  const lines = [
    JSON.stringify({ type: 'user', promptId: 'p-2', message: { role: 'user', content: 'olá' } }),
    JSON.stringify({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text: 'olá' }] } }),
  ];
  const { outcome } = deriveTurnIO(lines);
  assert.equal(outcome.usage, null);
  assert.equal(outcome.tool_calls, 0);
});

test('um tool_result NÃO é um prompt humano', () => {
  assert.equal(_isHumanPrompt({ type: 'user', toolUseResult: {}, message: { role: 'user', content: 'x' } }), false);
  assert.equal(_isHumanPrompt({ type: 'user', sourceToolAssistantUUID: 'a', message: { role: 'user', content: 'x' } }), false);
});

test('uma injecção de hook (texto a começar em `<`) NÃO é um prompt humano', () => {
  assert.equal(_isHumanPrompt({ type: 'user', message: { role: 'user', content: '<router-hint>T0</router-hint>' } }), false);
});

test('um turno de subagente (isSidechain) não rouba o turno nem entra na contagem', () => {
  const lines = fixture().concat([
    JSON.stringify({ type: 'user', isSidechain: true, promptId: 'p-sub', message: { role: 'user', content: 'sub-tarefa' } }),
    JSON.stringify({ type: 'assistant', isSidechain: true, message: { role: 'assistant', content: [
      { type: 'tool_use', id: 's1', name: 'Bash', input: {} }] } }),
  ]);
  const { intent, outcome } = deriveTurnIO(lines);
  assert.equal(intent.turn_id, 'p-1');
  assert.equal(outcome.tools.Bash, undefined);
});

test('tail sem prompt humano devolve null — não é um turno, é uma continuação', () => {
  assert.equal(deriveTurnIO([JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text: 'x' }] } })]), null);
  assert.equal(deriveTurnIO([]), null);
  assert.equal(deriveTurnIO(null), null);
});

test('linhas ilegíveis são ignoradas, nunca lançam', () => {
  const lines = ['{lixo', '', JSON.stringify({ type: 'user', promptId: 'p-3', message: { role: 'user', content: 'ok' } })];
  assert.equal(deriveTurnIO(lines).intent.turn_id, 'p-3');
});

test('texto acima do tecto é cortado e marcado truncated — nunca em silêncio', () => {
  // Prosa a sério, não 5000 x's: uma corrida longa de alfanuméricos é redigida
  // como `<base64>` pelo privacy.js e nunca chegaria ao tecto. O corte tem de
  // ser medido sobre o texto que de facto vai para disco — o já sanitizado.
  const longo = ('o oráculo mede o estado antes e depois do job. ').repeat(80);
  const { intent } = deriveTurnIO([JSON.stringify({ type: 'user', promptId: 'p-4', message: { role: 'user', content: longo } })]);
  assert.equal(intent.text.length, 1200);
  assert.equal(intent.truncated, true);
});

// ── Privacidade: o prompt humano é a categoria de conteúdo NOVA que este ──────
// módulo trouxe para o journal, e é onde se colam chaves. O caminho está ligado
// por omissão (hook Stop), por isso não pode ser o único sem redacção.

test('privacidade: uma chave colada no prompt NÃO aterra em claro no journal', () => {
  const chave = 'sk-ant-api03-' + 'A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q7r8S9t0';
  const { intent } = deriveTurnIO([JSON.stringify({
    type: 'user', promptId: 'p-sec',
    message: { role: 'user', content: 'a minha chave é ' + chave + ' — porque é que falha?' },
  })]);
  assert.ok(!intent.text.includes(chave), 'a chave da API foi para disco em claro');
  assert.match(intent.text, /<anthropic_key>/);
  assert.match(intent.text, /porque é que falha/, 'a redacção comeu o pedido todo em vez do segredo');
});

test('privacidade: o remate do assistente também é redigido', () => {
  const token = 'ghp_' + 'a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8';
  const { outcome } = deriveTurnIO([
    JSON.stringify({ type: 'user', promptId: 'p-sec2', message: { role: 'user', content: 'mostra o token' } }),
    JSON.stringify({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text: 'é ' + token }] } }),
  ]);
  assert.ok(!outcome.assistant_snippet.includes(token));
  assert.match(outcome.assistant_snippet, /<github_token>/);
});

test('privacidade: um segredo a cavalo no tecto não escapa pela metade', () => {
  // Sanitizar DEPOIS de cortar deixaria meia chave em disco. O corte é a última
  // coisa que acontece, por isso o padrão inteiro chega ao privacy.js.
  const chave = 'sk-ant-api03-' + 'Z9y8X7w6V5u4T3s2R1q0P9o8N7m6L5k4J3i2H1g0';
  const enchimento = 'contexto irrelevante mas comprido. '.repeat(34); // ~1190 chars
  const { intent } = deriveTurnIO([JSON.stringify({
    type: 'user', promptId: 'p-sec3', message: { role: 'user', content: enchimento + chave },
  })]);
  assert.ok(!intent.text.includes('sk-ant-api03-'), 'metade de uma chave ainda é uma chave');
});

test('privacidade: caminhos de ficheiro escrito NÃO são redigidos — são o campo', () => {
  // `files_written` é estrutural, não texto livre. A regra <winpath> apagaria
  // exactamente o que torna o campo útil, e o journal já regista o cwd noutros
  // eventos — redigir aqui daria privacidade nenhuma e custaria o campo todo.
  const { outcome } = deriveTurnIO([
    JSON.stringify({ type: 'user', promptId: 'p-path', message: { role: 'user', content: 'escreve o ficheiro' } }),
    JSON.stringify({ type: 'assistant', message: { role: 'assistant', content: [
      { type: 'tool_use', id: 'w1', name: 'Write', input: { file_path: 'C:\\Users\\alguem\\repo\\a.js' } }] } }),
  ]);
  assert.deepEqual(outcome.files_written, ['C:\\Users\\alguem\\repo\\a.js']);
});

// ── Integração com o journal: os eventos aterram com o kind certo e deduplicam ──
let tmp, prevHome, prevUserProfile, journal;
before(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'turnio-'));
  prevHome = process.env.HOME; prevUserProfile = process.env.USERPROFILE;
  process.env.HOME = tmp; process.env.USERPROFILE = tmp;
  journal = require('./handoff-journal.js');
});
after(() => {
  if (prevHome === undefined) delete process.env.HOME; else process.env.HOME = prevHome;
  if (prevUserProfile === undefined) delete process.env.USERPROFILE; else process.env.USERPROFILE = prevUserProfile;
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* best-effort */ }
});

test('intent e outcome aterram como eventos do journal, idempotentes por turn_id', () => {
  const sid = 'sess-turnio-1';
  const { intent, outcome } = deriveTurnIO(fixture());
  const write = () => {
    journal.appendEvent({ sid, agent: 'cc', kind: 'intent', input: intent, idem_key: 'intent:' + intent.turn_id });
    journal.appendEvent({ sid, agent: 'cc', kind: 'outcome', output: outcome, idem_key: 'outcome:' + outcome.turn_id });
  };
  write();
  write(); // re-varrimento do mesmo tail no turno seguinte → nunca duplica

  assert.equal(journal.readEvents(sid, 'intent').length, 1);
  assert.equal(journal.readEvents(sid, 'outcome').length, 1);
  const ev = journal.lastEventOfKind(sid, 'outcome');
  assert.equal(ev.output.tool_errors, 1);
  assert.ok(ev.output_hash, 'a proveniência do payload é carimbada mecanicamente');
});

test('`intent` e `outcome` são kinds já declarados pelo journal — nada de schema novo', () => {
  assert.ok(journal.EVENT_KINDS.includes('intent'));
  assert.ok(journal.EVENT_KINDS.includes('outcome'));
});
