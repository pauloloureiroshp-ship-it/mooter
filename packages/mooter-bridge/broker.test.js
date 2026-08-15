'use strict';

/**
 * f-mu0 · PARTE B — broker de decisão. A prova ANTES do código.
 *
 * A Parte A era aditiva. Esta migra AUTORIDADE: quem pode aprovar o quê, e o
 * que acontece quando o mundo mudou entre o pedido e o clique. Por isso cada
 * teste aqui existe contra um modo de falha concreto, não contra uma feature:
 *
 * · STALE    — o botão que chega atrasado não pode aprovar um estado que já não
 *              existe (achado 11 do codex: "um botão Slack atrasado poderia
 *              aprovar decisão já substituída").
 * · EXPIRED  — uma decisão velha morre; NUNCA se re-enfileira sozinha, porque
 *              re-pedir é um gesto humano novo.
 * · idem_key — o mesmo clique duas vezes é um clique, não dois jobs.
 * · capacidade DERIVADA — o que o job pode fazer lê-se do PEDIDO, nunca de um
 *              campo que o chamador declarou. Capacidade forjada é ignorada.
 * · sem roles.json — comportamento single-user exactamente como hoje. Regressão
 *              zero é gate, não intenção.
 * · concorrência — barreira forçada, não corrida à sorte (kimi #9).
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'mooter-broker-'));
process.env.MOOTER_HOME = HOME;
process.env.MOOTER_LIB = '1';
process.env.MOOTER_REPO = path.join(__dirname, '..', '..');

const broker = require('./broker.js');
const identidade = require('./actor.js');

const LEDGER = path.join(HOME, 'ledger.jsonl');
const ROLES = path.join(HOME, 'roles.json');

const ANA = { type: 'human', id: 'ana', origem: 'slack:U1' };
const PAULO = { type: 'human', id: 'paulo', origem: 'cc:f-mu0' };

test.after(() => fs.rmSync(HOME, { recursive: true, force: true }));

function limpar() {
  try { fs.rmSync(LEDGER, { force: true }); } catch { /* */ }
  try { fs.rmSync(ROLES, { force: true }); } catch { /* */ }
}
function escrever(ev) {
  fs.appendFileSync(LEDGER, JSON.stringify(ev) + '\n');
}
function eventos() {
  if (!fs.existsSync(LEDGER)) return [];
  return fs.readFileSync(LEDGER, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
}

/**
 * Um job à espera de aprovação, tal como o seamless.js o deixa: o estado
 * terminal REAL é `nao_verificado` com exit_code `agent-awaiting-approval`
 * (achado 6 — usar os nomes do código, não os que soam bem).
 */
function jobPendente(jobId, opts) {
  const o = opts || {};
  escrever({ ts: o.ts0 || '2026-08-15T10:00:00.000Z', event: 'dispatched', job_id: jobId,
    wave: o.wave || 'w-b', agent: 'cc', worktree: o.worktree || 'C:\\wt\\um',
    actor: o.actor || ANA, actor_porque: identidade.PORQUE_DECLARADO,
    escrita: o.escrita === true, allowedTools: o.allowedTools || 'Read',
    masterprompt_hash: 'mp-' + jobId });
  escrever({ ts: o.ts1 || '2026-08-15T10:05:00.000Z', event: 'nao_verificado', job_id: jobId,
    wave: o.wave || 'w-b', worktree: o.worktree || 'C:\\wt\\um',
    exit_code: 'agent-awaiting-approval',
    actor: o.actor || ANA, actor_porque: identidade.PORQUE_DECLARADO });
}

// ── B1 · a fila de pendentes ──────────────────────────────────────────────
test('B1 — listPending usa o estado terminal REAL e devolve quem pediu', () => {
  limpar();
  jobPendente('job-p1');
  escrever({ ts: '2026-08-15T10:06:00.000Z', event: 'done', job_id: 'job-acabado',
    worktree: 'C:\\wt\\um', exit_code: 0, actor: ANA });

  const pend = broker.listPending();
  assert.equal(pend.length, 1, 'só o que está mesmo à espera entra na fila');
  assert.equal(pend[0].job_id, 'job-p1');
  assert.equal(pend[0].exit_code, 'agent-awaiting-approval',
    'o nome vem do código, não de uma lista paralela');
  assert.deepStrictEqual(pend[0].actor, ANA,
    'o aprovador decide sobre PESSOA + pedido, não sobre um job_id anónimo');
});

test('B1b — listPending filtra por worktree e por actor (dois utilizadores, duas frentes)', () => {
  limpar();
  jobPendente('job-ana', { actor: ANA, worktree: 'C:\\wt\\ana' });
  jobPendente('job-paulo', { actor: PAULO, worktree: 'C:\\wt\\paulo' });

  assert.deepStrictEqual(broker.listPending({ worktree: 'C:\\wt\\ana' }).map((p) => p.job_id),
    ['job-ana'], 'lista única misturaria projectos de pessoas diferentes');
  assert.deepStrictEqual(broker.listPending({ actor: 'paulo' }).map((p) => p.job_id),
    ['job-paulo']);
  assert.equal(broker.listPending().length, 2, 'sem filtro, vêem-se os dois');
});

test('B1c — um job já decidido sai da fila', () => {
  limpar();
  jobPendente('job-p2');
  broker.decide({ decision_id: 'd1', request_id: 'job-p2', actor: PAULO, veredicto: 'recusar',
    idem_key: 'k-p2', expected_state_hash: broker.estadoDoJob('job-p2').state_hash });
  assert.equal(broker.listPending().length, 0, 'decidido é decidido');
});

// ── o contrato anti-stale ─────────────────────────────────────────────────
test('B2 — CAS: estado mudado entre o pedido e o clique dá STALE', () => {
  limpar();
  jobPendente('job-s1');
  const hashAntigo = broker.estadoDoJob('job-s1').state_hash;

  // o mundo mexeu-se: chegou mais um evento ao MESMO job
  escrever({ ts: '2026-08-15T10:07:00.000Z', event: 'step', job_id: 'job-s1', step_index: 9,
    actor: ANA, actor_porque: identidade.PORQUE_DECLARADO });

  const r = broker.decide({ decision_id: 'd-s1', request_id: 'job-s1', actor: PAULO,
    veredicto: 'aprovar', idem_key: 'k-s1', expected_state_hash: hashAntigo });

  assert.equal(r.estado, 'STALE', 'o botão atrasado não aprova um estado que já não existe');
  const decidido = eventos().filter((e) => e.event === 'approval.decided');
  assert.equal(decidido.length, 1, 'a decisão STALE também é um facto e fica gravada');
  assert.equal(decidido[0].estado, 'STALE');
  assert.equal(eventos().some((e) => e.event === 'dispatched' && e.handoff_from), false,
    'STALE NUNCA re-despacha');
});

test('B2b — o escopo do CAS é o ÚLTIMO evento DESTE job, não a fila nem o diário', () => {
  limpar();
  jobPendente('job-esc');
  const hash = broker.estadoDoJob('job-esc').state_hash;

  // ruído noutro job: não pode invalidar a decisão deste
  escrever({ ts: '2026-08-15T10:08:00.000Z', event: 'dispatched', job_id: 'job-outro',
    actor: PAULO, actor_porque: identidade.PORQUE_DECLARADO });

  const r = broker.decide({ decision_id: 'd-esc', request_id: 'job-esc', actor: PAULO,
    veredicto: 'recusar', idem_key: 'k-esc', expected_state_hash: hash });
  assert.equal(r.estado, 'REJECTED', 'um evento de OUTRO job não torna esta decisão obsoleta');
});

// ── expiração ─────────────────────────────────────────────────────────────
test('B3 — EXPIRED é terminal e DESCARTA; nunca se re-enfileira sozinha', () => {
  limpar();
  jobPendente('job-e1');
  const r = broker.decide({ decision_id: 'd-e1', request_id: 'job-e1', actor: PAULO,
    veredicto: 'aprovar', idem_key: 'k-e1',
    expected_state_hash: broker.estadoDoJob('job-e1').state_hash,
    expires_at: '2026-08-14T00:00:00.000Z' });

  assert.equal(r.estado, 'EXPIRED');
  assert.equal(r.terminal, true);
  assert.equal(broker.listPending().length, 0, 'descarta — re-pedir é um gesto humano NOVO');
  assert.equal(eventos().some((e) => e.event === 'dispatched' && e.handoff_from), false);
});

test('B3b — o default de expiração é 72h e conta do pedido, não do clique', () => {
  assert.equal(broker.EXPIRACAO_DEFAULT_MS, 72 * 60 * 60 * 1000);
});

// ── idempotência ──────────────────────────────────────────────────────────
test('B4 — a mesma idem_key devolve o resultado existente, não decide outra vez', () => {
  limpar();
  jobPendente('job-i1');
  const args = { decision_id: 'd-i1', request_id: 'job-i1', actor: PAULO, veredicto: 'recusar',
    idem_key: 'k-i1', expected_state_hash: broker.estadoDoJob('job-i1').state_hash };

  const primeira = broker.decide(args);
  const segunda = broker.decide(args);

  assert.equal(primeira.estado, 'REJECTED');
  assert.equal(segunda.estado, 'REJECTED');
  assert.equal(segunda.idempotente, true, 'a segunda tem de dizer que é repetição');
  assert.equal(eventos().filter((e) => e.event === 'approval.decided').length, 1,
    'um clique duas vezes é UM clique — não dois eventos');
});

test('B4b — sem cap de 50: a durabilidade não tem janela', () => {
  limpar();
  for (let i = 0; i < 60; i++) {
    jobPendente('job-cap' + i);
    broker.decide({ decision_id: 'd' + i, request_id: 'job-cap' + i, actor: PAULO,
      veredicto: 'recusar', idem_key: 'k-cap' + i,
      expected_state_hash: broker.estadoDoJob('job-cap' + i).state_hash });
  }
  // a PRIMEIRA continua a ser reconhecida como já decidida 60 decisões depois
  const repetida = broker.decide({ decision_id: 'd0', request_id: 'job-cap0', actor: PAULO,
    veredicto: 'recusar', idem_key: 'k-cap0', expected_state_hash: 'tanto-faz' });
  assert.equal(repetida.idempotente, true,
    'o handoff-journal rodava às 50 entradas; um broker que esquece não é durável');
});

// ── recusa ────────────────────────────────────────────────────────────────
test('B5 — recusar grava approval_rejected e é terminal', () => {
  limpar();
  jobPendente('job-r1');
  const r = broker.decide({ decision_id: 'd-r1', request_id: 'job-r1', actor: PAULO,
    veredicto: 'recusar', idem_key: 'k-r1',
    expected_state_hash: broker.estadoDoJob('job-r1').state_hash });

  assert.equal(r.estado, 'REJECTED');
  assert.equal(r.terminal, true);
  assert.equal(eventos().some((e) => e.event === 'approval_rejected'), true);
  assert.equal(eventos().some((e) => e.event === 'dispatched' && e.handoff_from), false,
    'recusar nunca despacha');
});

// ── B2 do masterprompt · aprovar = re-despachar AUTENTICADO ───────────────
test('B6 — aprovar re-despacha com handoff_from e com o ator do DECISOR', () => {
  limpar();
  jobPendente('job-a1', { actor: ANA });
  const despachos = [];
  broker.setDispatcher((args) => { despachos.push(args); return { job_id: 'job-novo' }; });

  const r = broker.decide({ decision_id: 'd-a1', request_id: 'job-a1', actor: PAULO,
    veredicto: 'aprovar', idem_key: 'k-a1',
    expected_state_hash: broker.estadoDoJob('job-a1').state_hash });

  assert.equal(r.estado, 'APPROVED');
  assert.equal(despachos.length, 1, 'aprovar gera um dispatch NOVO — nunca "resume"');
  assert.equal(despachos[0].handoff_from, 'job-a1', 'a cadeia fica provada no ledger');
  assert.deepStrictEqual(despachos[0].actor, PAULO,
    'quem carrega o job novo é quem DECIDIU, não quem pediu');
  broker.setDispatcher(null);
});

// ── B3 do masterprompt · capacidade, não tier ─────────────────────────────
test('B7 — a capacidade é DERIVADA do pedido; a declarada pelo chamador é ignorada', () => {
  limpar();
  // pedido inócuo (só leitura) mas com capacidade FORJADA no payload
  jobPendente('job-forja', { escrita: false, allowedTools: 'Read' });
  fs.writeFileSync(ROLES, JSON.stringify({
    papeis: { paulo: 'viewer' },
    capacidades: { viewer: ['read'], owner: ['read', 'write', 'bash', 'git'] },
  }));

  const derivadas = broker.capacidadesDoPedido({ escrita: false, allowedTools: 'Read',
    capacidades: ['write', 'deploy', 'secrets'] });
  assert.deepStrictEqual(derivadas, ['read'],
    'um campo `capacidades` no payload é decoração — a verdade lê-se do pedido');

  const r = broker.decide({ decision_id: 'd-f', request_id: 'job-forja', actor: PAULO,
    veredicto: 'aprovar', idem_key: 'k-f',
    expected_state_hash: broker.estadoDoJob('job-forja').state_hash,
    capacidades: ['deploy'] });
  assert.equal(r.estado, 'APPROVED',
    'o viewer pode aprovar um pedido de leitura — a forja no payload não lhe tira nem dá nada');
});

test('B7b — papel sem a capacidade que o pedido EXIGE é recusado', () => {
  limpar();
  jobPendente('job-esc1', { escrita: true, allowedTools: 'Read,Edit,Write' });
  fs.writeFileSync(ROLES, JSON.stringify({
    papeis: { ana: 'viewer', paulo: 'owner' },
    capacidades: { viewer: ['read'], owner: ['read', 'write', 'bash', 'git'] },
  }));

  const exigidas = broker.capacidadesDoPedido({ escrita: true, allowedTools: 'Read,Edit,Write' });
  assert.ok(exigidas.includes('write'), 'um pedido com escrita EXIGE write');

  const negado = broker.decide({ decision_id: 'd-n', request_id: 'job-esc1', actor: ANA,
    veredicto: 'aprovar', idem_key: 'k-n',
    expected_state_hash: broker.estadoDoJob('job-esc1').state_hash });
  assert.equal(negado.estado, 'REJECTED');
  assert.equal(negado.porque_negado, 'capacidade_em_falta',
    'a recusa por autorização tem de se distinguir de uma recusa humana');
  assert.deepStrictEqual(negado.capacidades_em_falta, ['write']);

  limpar();
  jobPendente('job-esc2', { escrita: true, allowedTools: 'Read,Edit,Write' });
  fs.writeFileSync(ROLES, JSON.stringify({
    papeis: { paulo: 'owner' },
    capacidades: { owner: ['read', 'write', 'bash', 'git'] },
  }));
  const ok = broker.decide({ decision_id: 'd-o', request_id: 'job-esc2', actor: PAULO,
    veredicto: 'aprovar', idem_key: 'k-o',
    expected_state_hash: broker.estadoDoJob('job-esc2').state_hash });
  assert.equal(ok.estado, 'APPROVED', 'o owner tem write, logo pode');
});

test('B7c — SEM roles.json o comportamento é single-user, exactamente como hoje', () => {
  limpar();   // repara: nenhum roles.json escrito
  jobPendente('job-su', { escrita: true, allowedTools: 'Read,Edit,Write' });
  const r = broker.decide({ decision_id: 'd-su', request_id: 'job-su', actor: PAULO,
    veredicto: 'aprovar', idem_key: 'k-su',
    expected_state_hash: broker.estadoDoJob('job-su').state_hash });

  assert.equal(r.estado, 'APPROVED', 'regressão zero é GATE: sem roles.json, ninguém é barrado');
  assert.equal(r.autorizacao, 'single_user',
    'e diz porquê, para não parecer que a autorização correu e passou');
});

// ── B4 do masterprompt · single-writer interprocessos ─────────────────────
test('B8 — o append do broker corre sob lock O_EXCL, e o lock é libertado', () => {
  limpar();
  jobPendente('job-l1');
  broker.decide({ decision_id: 'd-l1', request_id: 'job-l1', actor: PAULO, veredicto: 'recusar',
    idem_key: 'k-l1', expected_state_hash: broker.estadoDoJob('job-l1').state_hash });
  assert.equal(fs.existsSync(broker.LOCK_PATH()), false,
    'um lock que fica para trás bloqueia o processo seguinte para sempre');
});

test('B8b — DOIS decisores, barreira forçada: um segura o lock, o outro tem de falhar', () => {
  // kimi #9 — interleaving determinístico, nunca corrida à sorte. O segundo
  // decisor não "chega tarde por azar": ele encontra o lock LÁ, porque fomos nós
  // a pô-lo e só o tiramos depois de medir.
  limpar();
  jobPendente('job-c1');
  const hash = broker.estadoDoJob('job-c1').state_hash;

  fs.mkdirSync(path.dirname(broker.LOCK_PATH()), { recursive: true });
  fs.writeFileSync(broker.LOCK_PATH(), JSON.stringify({
    acquired_by: 'outro-processo', pid: 999999,
    acquired_at_ms: Date.now(), ttl_seconds: 60,
  }), { flag: 'wx' });

  const bloqueado = broker.decide({ decision_id: 'd-c1', request_id: 'job-c1', actor: PAULO,
    veredicto: 'recusar', idem_key: 'k-c1', expected_state_hash: hash });
  assert.equal(bloqueado.estado, 'LOCKED', 'com o lock tomado, o segundo NÃO escreve');
  assert.equal(bloqueado.held_by, 'outro-processo', 'e diz quem o tem');
  assert.equal(eventos().some((e) => e.event === 'approval.decided'), false,
    'nada foi ao ledger enquanto o lock era de outro');

  fs.rmSync(broker.LOCK_PATH(), { force: true });
  const passa = broker.decide({ decision_id: 'd-c1', request_id: 'job-c1', actor: PAULO,
    veredicto: 'recusar', idem_key: 'k-c1', expected_state_hash: hash });
  assert.equal(passa.estado, 'REJECTED', 'libertado o lock, a MESMA decisão passa');
});

test('B8c — um lock ÓRFÃO é reportado, nunca roubado em silêncio', () => {
  limpar();
  jobPendente('job-o1');
  fs.mkdirSync(path.dirname(broker.LOCK_PATH()), { recursive: true });
  fs.writeFileSync(broker.LOCK_PATH(), JSON.stringify({
    acquired_by: 'processo-morto', pid: 999999,
    acquired_at_ms: Date.now() - (10 * 60 * 1000), ttl_seconds: 60,   // TTL há muito passado
  }));

  const r = broker.decide({ decision_id: 'd-o1', request_id: 'job-o1', actor: PAULO,
    veredicto: 'recusar', idem_key: 'k-o1',
    expected_state_hash: broker.estadoDoJob('job-o1').state_hash });
  assert.equal(r.estado, 'LOCKED');
  assert.equal(r.stale, true, 'o locks.ts REPORTA a obsolescência e não a resolve sozinho');
  fs.rmSync(broker.LOCK_PATH(), { force: true });
});

// ── promoção, não recriação ───────────────────────────────────────────────
test('B9 — o hash canónico vem do ledger-prov, não de uma cópia', () => {
  const prov = broker._prov();
  assert.equal(typeof prov.canonicalize, 'function');
  assert.equal(typeof prov.provHash, 'function');
  // a ordem das chaves não pode mudar o hash — é a propriedade que interessa
  assert.equal(prov.provHash({ a: 1, b: 2 }), prov.provHash({ b: 2, a: 1 }));

  const ficheiros = fs.readdirSync(__dirname)
    .filter((f) => f.endsWith('.js') && !f.endsWith('.test.js'));
  const copias = ficheiros.filter((f) => /function\s+canonicalize|function\s+provHash/
    .test(fs.readFileSync(path.join(__dirname, f), 'utf8')));
  assert.deepStrictEqual(copias, [], 'apareceu uma segunda implementação do hash canónico');
});

test('B10 — o broker e o ledger-prov entram no .mcpb', () => {
  // O broker resolve o ledger-prov em RUNTIME (repo primeiro, bundle depois),
  // igual ao classify.js. Isso significa que o detector de requires do
  // bundle.test.js não o vê: `require('./x.js')` literal não existe. Sem esta
  // rede, o conector instalado morria no primeiro `decide()` — com o repo todo
  // verde, que é o modo de falha mais caro que este projecto conhece.
  const pack = fs.readFileSync(path.join(__dirname, 'pack-mcpb.mjs'), 'utf8');
  const bloco = pack.slice(pack.indexOf('const FILES = ['), pack.indexOf('];', pack.indexOf('const FILES = [')));
  for (const alvo of ['server/broker.js', 'server/ledger-prov.js']) {
    assert.ok(bloco.includes("'" + alvo + "'"), alvo + ' não está na lista do bundle');
  }
});
