'use strict';
/** ⚠️ THROWAWAY — spike Slack. */

/**
 * kimi #5 (o teste da denylist, com repo de ensaio a serio): um repositorio que
 * TEM um `segredo.env`, um job cujo goal o nomeia e um worktree cujo caminho o
 * contem. Prova-se que o NOME nunca aparece em nenhum pendente nem em nenhuma
 * mensagem publicada — por QUALQUER dos caminhos do adapter.
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const broker = require('../mooter-bridge/broker.js');
const { criarAllowlist } = require('./allowlist.js');
const { criarPublicador } = require('./publicar.js');
const { criarAdaptador } = require('./adapter.js');

const NOME = 'segredo.env';
const MP_TEXTO = '# ensaio\n\nle o ' + NOME + '\n';
const MP_HASH = crypto.createHash('sha256').update(MP_TEXTO, 'utf8').digest('hex');

function bancadaComSegredo() {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'spike-repo-segredo-'));
  fs.writeFileSync(path.join(repo, NOME), 'TOKEN=nao-devia-sair\n', 'utf8');

  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'spike-home-segredo-'));
  const jobId = 'job-segredo-1';
  fs.mkdirSync(path.join(home, 'jobs', jobId), { recursive: true });
  fs.writeFileSync(path.join(home, 'jobs', jobId, 'masterprompt.md'), MP_TEXTO, 'utf8');

  const ts = new Date().toISOString();
  const eventos = [
    { ts, job_id: jobId, event: 'dispatched', agent: 'cc', wave: 'slack-spike',
      // o goal E o caminho nomeiam o segredo — e o pior caso realista
      goal: 'le o ' + NOME + ' e resume', worktree: path.join(repo, NOME),
      mp_hash: MP_HASH, permissoes_efectivas: { valor: ['Read'] } },
    { ts, job_id: jobId, event: 'nao_verificado', agent: 'cc', wave: 'slack-spike',
      worktree: path.join(repo, NOME), exit_code: 'agent-awaiting-approval', mp_hash: MP_HASH,
      cost_usd: 0.01, cost_usd_fonte: 'reportado pelo CLI', model_used: 'claude-opus-5',
      files_touched: [NOME], visibilidade: 'local_only',
      note: 'o agente parou a pedir para ler ' + NOME,
      actor: { type: 'system', id: 'system', origem: null } },
  ];
  fs.writeFileSync(path.join(home, 'ledger.jsonl'),
    eventos.map((e) => JSON.stringify(e)).join('\n') + '\n', 'utf8');
  process.env.MOOTER_HOME = home;
  return { repo, home, jobId };
}

function montar() {
  const enviados = [];
  // captura TUDO o que sai: o texto da notificacao E as strings dos blocos
  const publicador = criarPublicador({
    enviar: (t, p, b) => { enviados.push(t + '\n' + JSON.stringify(b)); },
  });
  const ad = criarAdaptador({
    allowlist: criarAllowlist(['U_PAULO']),
    publicador,
    broker,
    despachar: async () => ({ job_id: 'job-novo-dry-run' }),
  });
  return { ad, enviados, publicador };
}

test.beforeEach(() => { broker.setDispatcher(async () => ({ job_id: 'job-redespacho-dry-run' })); });
test.afterEach(() => { delete process.env.MOOTER_HOME; });

test('kimi #5 · o NOME do segredo nao aparece no cartao do pendente', async () => {
  bancadaComSegredo();
  const { ad, enviados } = montar();
  const r = await ad.publicarPendentes();
  assert.equal(r.length, 1, 'a bancada devia ter um pendente');
  assert.equal(r[0].publicado, true);
  assert.ok(!enviados.join('\n').includes(NOME), 'o nome do segredo vazou: ' + enviados.join('\n'));
});

test('kimi #5 · o NOME nao aparece na mensagem de estado da mencao', async () => {
  bancadaComSegredo();
  const { ad, enviados } = montar();
  await ad.receberMencao({ user_id: 'U_PAULO', texto: 'le o ' + NOME + ' e resume', thread: 'T1' });
  assert.ok(!enviados.join('\n').includes(NOME));
});

test('kimi #5 · o NOME nao aparece na confirmacao nem na auditoria da decisao', async () => {
  const { jobId } = bancadaComSegredo();
  const { ad, enviados } = montar();
  const pend = broker.listPending()[0];
  const r = await ad.receberInteraccao({ user_id: 'U_PAULO', accao: 'aprovar', request_id: jobId,
    idem_key: 'k-segredo', expected_state_hash: pend.state_hash, thread: 'T1' });
  assert.equal(r.estado, 'APPROVED');
  assert.ok(!enviados.join('\n').includes(NOME));
});

test('kimi #5 · nem por acidente: uma frase que traga o nome sai limpa e marcada', () => {
  const { publicador, enviados } = montar();
  const r = publicador.publicar({ tipo: 'estado', texto: 'falhou a ler ' + NOME });
  assert.equal(r.publicado, true);
  assert.deepEqual(r.removidos, [NOME]);
  assert.ok(!enviados.join('\n').includes(NOME));
});

test('kimi #5 · o cartao NAO transporta files_touched, mesmo quando o ledger o traz', async () => {
  bancadaComSegredo();
  const { ad } = montar();
  const ledger = require('./adapter.js').lerLedgerPorOmissao();
  const cartao = ad.cartaoDe(broker.listPending()[0], ledger);
  assert.equal(cartao.diff_stat.valor, null);
  assert.ok(!JSON.stringify(cartao).includes(NOME));
});
