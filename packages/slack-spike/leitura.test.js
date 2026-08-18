'use strict';
/** ⚠️ THROWAWAY — spike Slack. Ver README.md e morte.js. Nao copiar para o produto. */

/**
 * Dia 0 (kimi #3) EM CODIGO. As formas destes eventos foram copiadas do ledger
 * REAL de 2026-08-17 (12 pendentes auditados) — nao sao inventadas:
 *   cost_usd      presente 12/12 · nao-nulo  6/12
 *   model_used    presente  6/12 · nao-nulo  6/12
 *   files_touched presente  6/12 · nao-nulo  0/12   → CORTADO do cartao
 *   actor         presente  9/12 · SEMPRE system/legacy (autor humano = n/d)
 */

const test = require('node:test');
const assert = require('node:assert');

const { derivarDoPendente } = require('./leitura.js');
const { criarPublicador, CAMPOS_PERMITIDOS, varrerArvore } = require('./publicar.js');
const { FRASES, CUSTO_PORQUE } = require('./esquema.js');
const denylist = require('./denylist.js');

// forma REAL: pendente rico (cc/opus, custo reportado pelo CLI)
const PENDENTE_RICO = {
  ts: '2026-08-16T15:03:47.261Z',
  job_id: 'job-msvxptxq-b9fb',
  wave: 'contrato-test',
  agent: 'cc',
  worktree: 'C:\\demo\\worktrees\\onda-a3',
  event: 'nao_verificado',
  exit_code: 'agent-awaiting-approval',
  cost_usd: 0.627405,
  cost_usd_fonte: 'reportado pelo CLI',
  model_used: 'claude-opus-5',
  tier_pedido: 'T0',
  tier_motor: 'T3',
  files_touched: null,
  actor: { type: 'system', id: 'system', origem: null },
  actor_porque: 'n/d — ator não declarado por quem disparou; nunca inferido',
  visibilidade: 'local_only',
};

// forma REAL: pendente pobre (moo local, sem custo nem modelo)
const PENDENTE_POBRE = {
  ts: '2026-08-16T14:11:24.536Z',
  job_id: 'job-msvvge27-d83e',
  wave: 'contrato-test',
  agent: 'moo',
  event: 'nao_verificado',
  exit_code: 'agent-awaiting-approval',
  cost_usd: null,
  cost_usd_fonte: 'n/d',
  actor: { type: 'system', id: 'system', origem: null },
  actor_porque: 'n/d — ator não declarado por quem disparou; nunca inferido',
  visibilidade: 'local_only',
};

// o que o Slack passa a produzir: um ator HUMANO declarado
const PENDENTE_DO_SLACK = Object.assign({}, PENDENTE_RICO, {
  job_id: 'job-slack-1',
  actor: { type: 'human', id: 'slack:U_PAULO', origem: 'slack' },
  actor_porque: 'declarado por quem disparou',
});

test('leitura · custo com fonte medida sai com valor E rotulo de fonte', () => {
  const d = derivarDoPendente(PENDENTE_RICO);
  assert.equal(d.custo.valor, 0.627405);
  assert.equal(d.custo.fonte, 'reportado pelo CLI');
  assert.equal(d.custo.estimativa, false);
});

test('leitura · custo com fonte n/d NAO mostra numero (nunca fabricar)', () => {
  const d = derivarDoPendente(PENDENTE_POBRE);
  assert.equal(d.custo.valor, null);
  assert.equal(d.custo.porque, CUSTO_PORQUE.SEM_VALOR);
});

test('leitura · custo calculado por tabela sai ROTULADO como estimativa', () => {
  const d = derivarDoPendente(Object.assign({}, PENDENTE_RICO, {
    cost_usd: 0.088179,
    cost_usd_fonte: 'calculado a partir de tokens e tabela de precos',
  }));
  assert.equal(d.custo.estimativa, true);
  assert.match(d.custo.rotulo, /estimativa/i);
});

test('leitura · modelo ausente e n/d — NUNCA se infere do tier', () => {
  const d = derivarDoPendente(PENDENTE_POBRE);
  assert.equal(d.modelo.valor, null);
  assert.ok(!JSON.stringify(d.modelo).includes('T3'), 'inferiu modelo a partir do tier');
});

test('leitura · autor NAO-humano e n/d, e o motor aparece a parte (nao disfarcado de autor)', () => {
  const d = derivarDoPendente(PENDENTE_RICO);
  assert.equal(d.autor.valor, null);
  assert.match(d.autor.porque, /n\/d|nao declarado|não declarado/i);
  assert.equal(d.motor.valor, 'cc');
  assert.match(d.motor.rotulo, /motor/i);
});

test('leitura · autor humano declarado pelo Slack aparece como AUTOR', () => {
  const d = derivarDoPendente(PENDENTE_DO_SLACK);
  assert.equal(d.autor.valor, 'slack:U_PAULO');
});

test('leitura · diff-stat esta CORTADO com a razao do Dia 0 (0/12 nao-nulo)', () => {
  const d = derivarDoPendente(PENDENTE_RICO);
  assert.equal(d.diff_stat.valor, null);
  assert.match(d.diff_stat.porque, /0\/12|nunca|ausente/i);
});

// ── publicar(): a UNICA porta de saida (kimi #6) ──────────────────────────
function publicadorDeEnsaio() {
  const enviados = [];
  const pub = criarPublicador({ enviar: (t) => { enviados.push(t); return { ok: true }; } });
  return { pub, enviados };
}

test('publicar · recusa payload marcado local_only', () => {
  const { pub, enviados } = publicadorDeEnsaio();
  const r = pub.publicar({ tipo: 'estado', texto: 'ola', visibilidade: 'local_only' });
  assert.equal(r.publicado, false);
  assert.match(r.porque, /local_only/);
  assert.equal(enviados.length, 0);
});

test('publicar · FAIL-CLOSED: campo fora da allowlist bloqueia (a ausencia de rotulo nao e permissao)', () => {
  const { pub, enviados } = publicadorDeEnsaio();
  // `goal` e `worktree` sao CONTEUDO e nao tem rotulo de visibilidade nenhum:
  // um gate que so olhasse para `local_only` deixava-os passar.
  const r = pub.publicar({ tipo: 'estado', texto: 'ola', goal: 'refactor o vault', worktree: 'C:\\segredos' });
  assert.equal(r.publicado, false);
  assert.match(r.porque, /goal|allowlist|permitid/i);
  assert.equal(enviados.length, 0);
});

test('publicar · a allowlist de campos nao inclui conteudo do utilizador', () => {
  for (const proibido of ['goal', 'prompt', 'texto_do_thread', 'worktree', 'mp_hash']) {
    assert.ok(!CAMPOS_PERMITIDOS.includes(proibido), proibido + ' nao devia ser publicavel');
  }
});

test('publicar · texto livre com nome de segredo e recusado pelo catalogo antes da denylist', () => {
  const { pub, enviados } = publicadorDeEnsaio();
  const r = pub.publicar({ tipo: 'estado', texto: 'falhou a ler segredo.env' });
  assert.equal(r.publicado, false);
  assert.match(r.porque, /catalogo/);
  assert.equal(enviados.length, 0);
});

test('denylist (unidade) · limpa a folha real e o varredor real limpa a arvore', () => {
  assert.equal(denylist.limpar('falhou a ler segredo.env').texto.includes('segredo.env'), false);
  const removidos = new Set();
  const limpo = varrerArvore({ dentro: ['falhou a ler segredo.env'] }, removidos);
  assert.equal(JSON.stringify(limpo).includes('segredo.env'), false);
  assert.deepEqual([...removidos], ['segredo.env']);
});

test('publicar · dry-run nao envia nada mas devolve o texto', () => {
  const enviados = [];
  const pub = criarPublicador({ enviar: (t) => enviados.push(t), dryRun: true });
  const r = pub.publicar({ tipo: 'estado', texto: FRASES.DESPACHADO });
  assert.equal(r.publicado, true);
  assert.equal(r.dry_run, true);
  assert.equal(enviados.length, 0);
});
