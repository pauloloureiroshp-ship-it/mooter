'use strict';

/**
 * CONTEXTO E ADVOGADO DO DIABO — Wave J-6 (2026-07-31)
 *
 * A garantia central que estes testes defendem: uma regra adversarial só
 * dispara sobre um número MEDIDO, e cada pergunta transporta o facto que a fez
 * nascer. Uma pergunta sem facto é uma alucinação com ar de rigor — e seria
 * pior do que não perguntar nada.
 *
 * A segunda garantia: o que o conector não consegue saber (a conversa do host,
 * os PRs, o estado do código antes da tarefa) sai como n/d COM MOTIVO, nunca
 * como vazio nem como zero.
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const ctx = require('./recibo-contexto.js');

const T0 = Date.parse('2026-07-31T09:00:00.000Z');

function job(extra) {
  return Object.assign({
    job_id: 'j1', wave: 'w1', agent: 'codex', state: 'done',
    worktree: 'C:\\Users\\x\\frugal', local: false,
    dispatched_at: new Date(T0).toISOString(),
  }, extra || {});
}

const SEM_SESSAO = { sessaoModule: { ler: () => ({ vazio: true }) } };
const SEM_VAULT = { journalModule: { detectVault: () => ({ root: null, source: 'não-encontrado' }), FOLDERS: {} } };

// ─────────────────────────────────────────── o que não se sabe é n/d, não vazio ──

test('C1 — a conversa do host sai n/d COM MOTIVO, nunca vazia', () => {
  const c = ctx.contextoDeTrabalho([job()], SEM_SESSAO);
  assert.equal(c.conversa_do_host.valor, null);
  assert.match(c.conversa_do_host.porque, /MCP não expõe/i);
});

test('C2 — PRs saem n/d porque o conector não fala com o git', () => {
  const c = ctx.contextoDeTrabalho([job()], SEM_SESSAO);
  assert.equal(c.pull_requests.valor, null);
  assert.match(c.pull_requests.porque, /git|GitHub/i);
});

test('C3 — sem sessão registada, o projecto é n/d e diz como se resolve', () => {
  const c = ctx.contextoDeTrabalho([job()], SEM_SESSAO);
  assert.equal(c.projecto.valor, null);
  assert.match(c.sessao_id.porque, /mooter_setup/i, 'tem de dizer ao utilizador o que fazer');
});

test('C4 — as pastas SÃO derivadas do ledger, porque isso é um facto', () => {
  const c = ctx.contextoDeTrabalho([
    job({ worktree: 'C:\\a' }), job({ job_id: 'j2', worktree: 'C:\\b' }), job({ job_id: 'j3', worktree: 'C:\\a' }),
  ], SEM_SESSAO);
  assert.deepEqual(c.pastas.valor, ['C:\\a', 'C:\\b'], 'sem duplicados');
  assert.match(c.pastas.porque, /ledger/i);
});

test('C5 — o "antes" é rotulado como estado de sessão, NÃO como snapshot de código', () => {
  const anterior = ctx.estadoAnterior({
    sessaoModule: { ler: () => ({ vazio: false, feito: ['x'], por_fazer: ['y'], actualizada_em: 'ontem' }) },
  });
  assert.match(anterior.rotulo, /NÃO é um snapshot do código/i);
  assert.deepEqual(anterior.feito, ['x']);
});

// ──────────────────────────────────── as regras só disparam sobre factos ──

test('C6 — cobertura de custo baixa levanta a pergunta, e traz o número', () => {
  const jobs = [job({ cost_usd: 0.1 }), job({ job_id: 'j2' }), job({ job_id: 'j3' }), job({ job_id: 'j4' })];
  const qs = ctx.perguntasAdversariais(null, { jobs });
  const q = qs.find((x) => /custo por resposta certa/i.test(x.pergunta));
  assert.ok(q, 'a regra do custo tinha de disparar com 1 de 4 medidos');
  assert.match(q.facto, /25%/, 'a pergunta transporta a percentagem medida');
});

test('C7 — cobertura de custo boa NÃO levanta a pergunta', () => {
  const jobs = [job({ cost_usd: 0.1 }), job({ job_id: 'j2', cost_usd: 0.2 })];
  const qs = ctx.perguntasAdversariais(null, { jobs });
  assert.ok(!qs.some((x) => /custo por resposta certa/i.test(x.pergunta)),
    'sem facto fora da faixa, a regra não pode disparar');
});

test('C8 — um job done sem tokens de saída é interrogado (o padrão que custou 3 vezes)', () => {
  const jobs = [job({ tokens_out: 0, cost_usd: 0.1 })];
  const qs = ctx.perguntasAdversariais(null, { jobs });
  const q = qs.find((x) => /recusas carimbadas como sucesso/i.test(x.pergunta));
  assert.ok(q, 'tinha de perguntar');
  assert.match(q.facto, /j1/, 'e tinha de nomear o job');
});

test('C9 — prep-timeout levanta a pergunta do handoff em série', () => {
  const jobs = [job({ exit_code: 'prep-timeout', state: 'failed', cost_usd: 0.1 })];
  const qs = ctx.perguntasAdversariais(null, { jobs });
  assert.ok(qs.some((x) => /prep em série/i.test(x.pergunta)));
});

test('C10 — pastas diferentes + relocação levantam a dúvida sobre a comparação', () => {
  const jobs = [
    job({ relocated: true, worktree: 'C:\\a', cost_usd: 0.1 }),
    job({ job_id: 'j2', worktree: 'C:\\b', cost_usd: 0.1 }),
  ];
  const qs = ctx.perguntasAdversariais(null, { jobs });
  const q = qs.find((x) => /mesmo código/i.test(x.pergunta));
  assert.ok(q, 'comparar motores em árvores diferentes tem de ser questionado');
  assert.match(q.porque_importa, /mede a árvore, não o motor/i);
});

test('C11 — TODA pergunta transporta o facto que a fez nascer', () => {
  const jobs = [job({ tokens_out: 0 }), job({ job_id: 'j2', exit_code: 'prep-timeout', state: 'failed' })];
  const qs = ctx.perguntasAdversariais(null, {
    jobs, scorecard: { excepcoes: [{ metrica: 'pressao_quota', dono: 'MFO' }] },
  });
  assert.ok(qs.length >= 3);
  for (const q of qs) {
    assert.ok(q.facto && String(q.facto).length > 0, 'pergunta sem facto: ' + q.pergunta);
    assert.ok(q.porque_importa && String(q.porque_importa).length > 0, 'pergunta sem consequência: ' + q.pergunta);
  }
});

test('C12 — silêncio é declarado como silêncio, não como saúde', () => {
  const jobs = [job({ cost_usd: 0.1, tokens_out: 500, local: true, agent: 'moo' })];
  const qs = ctx.perguntasAdversariais(null, { jobs });
  assert.equal(qs.length, 1);
  assert.match(qs[0].facto, /não que está tudo bem/i,
    'ausência de alarme não pode ser apresentada como prova de saúde');
});

// ───────────────────────────────────────────────── próximos passos e vault ──

test('C13 — os próximos passos derivam das perguntas, não de opinião', () => {
  const qs = ctx.perguntasAdversariais(null, { jobs: [job({ tokens_out: 0 })] });
  const passos = ctx.proximosPassos(qs, { sessao_id: { valor: 'mooter' } });
  assert.ok(passos.some((p) => /guarda de recusa/i.test(p)));
});

test('C14 — sem sessão declarada, propõe declará-la (é o que põe uma sessão nova na mesma página)', () => {
  const passos = ctx.proximosPassos([], { sessao_id: { valor: null } });
  assert.ok(passos.some((p) => /mooter_setup.*registar/i.test(p)));
});

test('C15 — vault ausente é n/d com o motivo, nunca "0 notas" como se fosse medição', () => {
  const v = ctx.registadoNoVault(SEM_VAULT);
  assert.equal(v.valor, null);
  assert.match(v.porque, /vault não encontrado/i);
});

test('C16 — montar() nunca lança, mesmo com tudo em falta', () => {
  const out = ctx.montar({ janela: { desde: new Date(T0).toISOString() } },
    Object.assign({ jobs: [] }, SEM_SESSAO, SEM_VAULT));
  assert.ok(out.onde && out.antes && out.registado_no_vault);
  assert.ok(Array.isArray(out.advogado_do_diabo) && out.advogado_do_diabo.length);
  assert.match(out.rotulo, /nunca geradas por um modelo/i);
});
