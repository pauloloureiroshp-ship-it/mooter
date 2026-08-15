'use strict';

/**
 * f-mu0 · PARTE B — broker de decisão.
 *
 * Ronda 2, depois de um G4 com OITO ALTO. Vale a pena dizer o que correu mal na
 * ronda 1, porque quase tudo era o mesmo erro em sítios diferentes: **os testes
 * fabricavam o mundo em vez de o lerem**. Um stub síncrono escondia que o
 * dispatcher era async; um fixture com `allowedTools` escondia que o produtor
 * não grava esse campo; um teste que só lia uma constante deu por implementada
 * uma expiração que não existia.
 *
 * Por isso agora há testes de CONTRATO entre produtor e consumidor, e os stubs
 * são assíncronos por defeito.
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
  for (const f of [LEDGER, ROLES]) { try { fs.rmSync(f, { force: true }); } catch { /* */ } }
  try { fs.rmSync(broker.LOCK_PATH(), { force: true }); } catch { /* */ }
  try { fs.rmSync(path.join(HOME, 'jobs'), { recursive: true, force: true }); } catch { /* */ }
  broker.setDispatcher(null);
}
function escrever(ev) { fs.appendFileSync(LEDGER, JSON.stringify(ev) + '\n'); }
function eventos() {
  if (!fs.existsSync(LEDGER)) return [];
  return fs.readFileSync(LEDGER, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
}
function decididos() { return eventos().filter((e) => e.event === 'approval.decided'); }

/** Dispatcher ASSÍNCRONO por defeito — o real é async, e um stub síncrono mente. */
function stubDispatcher(registo) {
  broker.setDispatcher(async (args) => { registo.push(args); return { job_id: 'job-novo' }; });
}

const AGORA = Date.now();
const HA_UMA_HORA = new Date(AGORA - 3600e3).toISOString();

/**
 * Um job à espera, como o seamless.js o deixa. Os nomes de campo são os do
 * evento `dispatched` REAL — `escrita` e `allowedTools`. O B16 amarra os dois.
 */
function jobPendente(jobId, opts) {
  const o = opts || {};
  escrever({ ts: o.ts0 || HA_UMA_HORA, event: 'dispatched', job_id: jobId,
    wave: o.wave || 'w-b', agent: 'cc', worktree: o.worktree || 'C:\\wt\\um',
    actor: o.actor || ANA, actor_porque: identidade.PORQUE_DECLARADO,
    escrita: o.escrita === true, allowedTools: o.allowedTools || 'Read' });
  escrever({ ts: o.ts1 || HA_UMA_HORA, event: 'nao_verificado', job_id: jobId,
    wave: o.wave || 'w-b', worktree: o.worktree || 'C:\\wt\\um',
    exit_code: 'agent-awaiting-approval',
    actor: o.actor || ANA, actor_porque: identidade.PORQUE_DECLARADO });
  // o masterprompt COMPLETO vive na pasta do job, nao no ledger — e o broker
  // tem de o ler DE LA para re-despachar. Os testes tem de reproduzir isso,
  // porque foi exactamente a sua ausencia que escondeu o furo de integracao.
  if (o.semMasterprompt !== true) {
    const dir = path.join(HOME, 'jobs', jobId);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'masterprompt.md'),
      o.masterprompt || ('\u21c4 COWORK -> CC\nGOAL  ' + jobId + '\n'));
  }
}
const hashDe = (jobId) => broker.estadoDoJob(jobId).state_hash;

// ── B1 · a fila ───────────────────────────────────────────────────────────
test('B1 — listPending usa o estado terminal REAL e devolve quem pediu', () => {
  limpar();
  jobPendente('job-p1');
  escrever({ ts: HA_UMA_HORA, event: 'done', job_id: 'job-acabado', exit_code: 0, actor: ANA });

  const pend = broker.listPending();
  assert.equal(pend.length, 1);
  assert.equal(pend[0].exit_code, 'agent-awaiting-approval', 'o nome vem do código');
  assert.deepStrictEqual(pend[0].actor, ANA, 'decide-se sobre PESSOA + pedido');
});

test('B1b — listPending filtra por worktree e por actor', () => {
  limpar();
  jobPendente('job-ana', { actor: ANA, worktree: 'C:\\wt\\ana' });
  jobPendente('job-paulo', { actor: PAULO, worktree: 'C:\\wt\\paulo' });
  assert.deepStrictEqual(broker.listPending({ worktree: 'C:\\wt\\ana' }).map((p) => p.job_id), ['job-ana']);
  assert.deepStrictEqual(broker.listPending({ actor: 'paulo' }).map((p) => p.job_id), ['job-paulo']);
  assert.equal(broker.listPending().length, 2);
});

test('B1c — um job que SEGUIU sai da fila mesmo sem decisão', () => {
  limpar();
  jobPendente('job-seguiu');
  escrever({ ts: new Date().toISOString(), event: 'done', job_id: 'job-seguiu', exit_code: 0, actor: ANA });
  assert.equal(broker.listPending().length, 0,
    'olhar só para "existe um evento de espera algures" mantinha na fila quem já acabou');
});

test('B20 — só uma decisão FINAL fecha o pendente; um STALE não o esconde', async () => {
  limpar();
  jobPendente('job-st');
  const velho = hashDe('job-st');
  escrever({ ts: new Date().toISOString(), event: 'step', job_id: 'job-st', actor: ANA });

  const r = await broker.decide({ decision_id: 'd', request_id: 'job-st', actor: PAULO,
    veredicto: 'aprovar', idem_key: 'k', expected_state_hash: velho });
  assert.equal(r.estado, 'STALE');
  // o job JÁ NÃO está à espera (o step passou a ser o último evento), por isso
  // não está na fila — mas se voltar a esperar, tem de reaparecer.
  escrever({ ts: new Date().toISOString(), event: 'nao_verificado', job_id: 'job-st',
    exit_code: 'agent-awaiting-approval', actor: ANA });
  assert.equal(broker.listPending().length, 1,
    'um clique obsoleto não decide nada — esconder o job era perdê-lo');

  await broker.decide({ decision_id: 'd2', request_id: 'job-st', actor: PAULO,
    veredicto: 'recusar', idem_key: 'k2', expected_state_hash: hashDe('job-st') });
  assert.equal(broker.listPending().length, 0, 'uma decisão FINAL fecha');
});

// ── CAS ───────────────────────────────────────────────────────────────────
test('B2 — estado mudado entre o pedido e o clique dá STALE, e não re-despacha', async () => {
  limpar();
  jobPendente('job-s1');
  const velho = hashDe('job-s1');
  escrever({ ts: new Date().toISOString(), event: 'step', job_id: 'job-s1', actor: ANA });

  const despachos = []; stubDispatcher(despachos);
  const r = await broker.decide({ decision_id: 'd-s1', request_id: 'job-s1', actor: PAULO,
    veredicto: 'aprovar', idem_key: 'k-s1', expected_state_hash: velho });

  assert.equal(r.estado, 'STALE');
  assert.equal(despachos.length, 0, 'STALE NUNCA re-despacha');
  assert.equal(decididos().length, 1, 'a decisão STALE também é um facto e fica gravada');
});

test('B2b — o escopo do CAS é o ÚLTIMO evento DESTE job', async () => {
  limpar();
  jobPendente('job-esc');
  const h = hashDe('job-esc');
  escrever({ ts: new Date().toISOString(), event: 'dispatched', job_id: 'job-outro', actor: PAULO });
  const r = await broker.decide({ decision_id: 'd', request_id: 'job-esc', actor: PAULO,
    veredicto: 'recusar', idem_key: 'k', expected_state_hash: h });
  assert.equal(r.estado, 'REJECTED', 'ruído noutro job não torna esta decisão obsoleta');
});

test('B17 — sem expected_state_hash não há decisão: o CAS não tem interruptor', async () => {
  limpar();
  jobPendente('job-nocas');
  for (const h of [undefined, null, '']) {
    const r = await broker.decide({ decision_id: 'd', request_id: 'job-nocas', actor: PAULO,
      veredicto: 'aprovar', idem_key: 'k' + String(h), expected_state_hash: h });
    assert.equal(r.estado, 'INVALIDO', 'omitir o hash desligava o CAS — era um interruptor');
  }
  assert.equal(decididos().length, 0);
});

// ── expiração ─────────────────────────────────────────────────────────────
test('B11 — as 72h são APLICADAS, não só declaradas', async () => {
  limpar();
  const ha4dias = new Date(AGORA - 4 * 24 * 3600e3).toISOString();
  jobPendente('job-velho', { ts0: ha4dias, ts1: ha4dias });

  // sem `expires_at` nenhum: o default tem de morder
  const r = await broker.decide({ decision_id: 'd-v', request_id: 'job-velho', actor: PAULO,
    veredicto: 'aprovar', idem_key: 'k-v', expected_state_hash: hashDe('job-velho') });
  assert.equal(r.estado, 'EXPIRED',
    'a constante existia e nunca era aplicada; só valia o prazo que o decisor mandasse');
  assert.equal(r.descartada, true);
});

test('B11b — um expires_at generoso NÃO estica as 72h', async () => {
  limpar();
  const ha4dias = new Date(AGORA - 4 * 24 * 3600e3).toISOString();
  jobPendente('job-esticar', { ts0: ha4dias, ts1: ha4dias });
  const r = await broker.decide({ decision_id: 'd-e', request_id: 'job-esticar', actor: PAULO,
    veredicto: 'aprovar', idem_key: 'k-e', expected_state_hash: hashDe('job-esticar'),
    expires_at: new Date(AGORA + 99 * 24 * 3600e3).toISOString() });
  assert.equal(r.estado, 'EXPIRED', 'manda o prazo mais APERTADO, não o do decisor');
});

test('B3 — EXPIRED é terminal, descarta e não despacha', async () => {
  limpar();
  jobPendente('job-e1');
  const despachos = []; stubDispatcher(despachos);
  const r = await broker.decide({ decision_id: 'd-e1', request_id: 'job-e1', actor: PAULO,
    veredicto: 'aprovar', idem_key: 'k-e1', expected_state_hash: hashDe('job-e1'),
    expires_at: '2026-08-14T00:00:00.000Z' });
  assert.equal(r.estado, 'EXPIRED');
  assert.equal(despachos.length, 0);
  assert.equal(broker.listPending().length, 0, 're-pedir é um gesto humano NOVO');
});

// ── idempotência ──────────────────────────────────────────────────────────
test('B4 — a mesma idem_key no mesmo pedido devolve o resultado existente', async () => {
  limpar();
  jobPendente('job-i1');
  const args = { decision_id: 'd-i1', request_id: 'job-i1', actor: PAULO, veredicto: 'recusar',
    idem_key: 'k-i1', expected_state_hash: hashDe('job-i1') };
  const primeira = await broker.decide(args);
  const segunda = await broker.decide(args);
  assert.equal(primeira.estado, 'REJECTED');
  assert.equal(segunda.idempotente, true);
  assert.equal(decididos().length, 1, 'um clique duas vezes é UM clique');
});

test('B12 — a mesma idem_key noutro PEDIDO não herda a decisão do primeiro', async () => {
  limpar();
  jobPendente('job-x'); jobPendente('job-y', { escrita: true, allowedTools: 'Read,Edit,Write' });
  await broker.decide({ decision_id: 'd1', request_id: 'job-x', actor: PAULO,
    veredicto: 'recusar', idem_key: 'CHAVE', expected_state_hash: hashDe('job-x') });

  const despachos = []; stubDispatcher(despachos);
  const r = await broker.decide({ decision_id: 'd2', request_id: 'job-y', actor: PAULO,
    veredicto: 'aprovar', idem_key: 'CHAVE', expected_state_hash: hashDe('job-y') });
  assert.equal(r.idempotente, undefined,
    'reutilizar a chave devolvia a decisão do PRIMEIRO job — sem CAS, sem autorização, sem despacho');
  assert.equal(r.estado, 'APPROVED');
  assert.equal(despachos.length, 1);
});

test('B4b — sem cap de 50: a durabilidade não tem janela', async () => {
  limpar();
  for (let i = 0; i < 60; i++) {
    jobPendente('job-cap' + i);
    await broker.decide({ decision_id: 'd' + i, request_id: 'job-cap' + i, actor: PAULO,
      veredicto: 'recusar', idem_key: 'k-cap' + i, expected_state_hash: hashDe('job-cap' + i) });
  }
  const repetida = await broker.decide({ decision_id: 'd0', request_id: 'job-cap0', actor: PAULO,
    veredicto: 'recusar', idem_key: 'k-cap0', expected_state_hash: 'tanto-faz' });
  assert.equal(repetida.idempotente, true, 'o handoff-journal rodava às 50; um broker que esquece não é durável');
});

// ── recusa e aprovação ────────────────────────────────────────────────────
test('B5 — recusar grava approval_rejected, é terminal e não despacha', async () => {
  limpar();
  jobPendente('job-r1');
  const despachos = []; stubDispatcher(despachos);
  const r = await broker.decide({ decision_id: 'd-r1', request_id: 'job-r1', actor: PAULO,
    veredicto: 'recusar', idem_key: 'k-r1', expected_state_hash: hashDe('job-r1') });
  assert.equal(r.estado, 'REJECTED');
  assert.equal(eventos().some((e) => e.event === 'approval_rejected'), true);
  assert.equal(despachos.length, 0);
});

test('B6 — aprovar re-despacha com handoff_from e com o ator do DECISOR', async () => {
  limpar();
  jobPendente('job-a1', { actor: ANA });
  const despachos = []; stubDispatcher(despachos);
  const r = await broker.decide({ decision_id: 'd-a1', request_id: 'job-a1', actor: PAULO,
    veredicto: 'aprovar', idem_key: 'k-a1', expected_state_hash: hashDe('job-a1') });
  assert.equal(r.estado, 'APPROVED');
  assert.equal(despachos[0].handoff_from, 'job-a1');
  assert.deepStrictEqual(despachos[0].actor, PAULO, 'quem carrega o job novo é quem DECIDIU');
  assert.equal(r.job_novo, 'job-novo');
});

test('B15 — o despacho é ESPERADO; um dispatcher que falha não vira APPROVED', async () => {
  // o `toolDispatch` real é async. A ronda 1 gravava APPROVED com job_novo:null
  // antes de saber o resultado, e um stub SÍNCRONO escondia-o.
  limpar();
  jobPendente('job-w1');
  broker.setDispatcher(async () => { throw new Error('spawn recusado'); });
  const r = await broker.decide({ decision_id: 'd-w', request_id: 'job-w1', actor: PAULO,
    veredicto: 'aprovar', idem_key: 'k-w', expected_state_hash: hashDe('job-w1') });
  assert.equal(r.estado, 'REJECTED');
  assert.equal(r.porque_negado, 'despacho_falhou');

  limpar();
  jobPendente('job-w2');
  broker.setDispatcher(async () => ({ error: 'guard recusou o dispatch' }));
  const r2 = await broker.decide({ decision_id: 'd-w2', request_id: 'job-w2', actor: PAULO,
    veredicto: 'aprovar', idem_key: 'k-w2', expected_state_hash: hashDe('job-w2') });
  assert.equal(r2.estado, 'REJECTED');
  assert.equal(r2.porque_negado, 'despacho_recusado');
  assert.equal(decididos().every((e) => e.estado !== 'APPROVED'), true,
    'nunca se grava um sucesso que não se confirmou');
});

// ── autorização — ADVISORY, e a dizê-lo ───────────────────────────────────
test('B19 — a autorização declara-se ADVISORY, no retorno e no ledger', async () => {
  limpar();
  jobPendente('job-adv');
  const r = await broker.decide({ decision_id: 'd-adv', request_id: 'job-adv', actor: PAULO,
    veredicto: 'recusar', idem_key: 'k-adv', expected_state_hash: hashDe('job-adv') });
  assert.equal(r.authz.advisory, true);
  assert.equal(r.authz.actor_autenticado, false,
    'o actor é proveniência declarada; um RBAC que se dissesse seguro sem authn era teatro');
  assert.equal(decididos()[0].authz.advisory, true, 'e fica no ficheiro, não só na resposta');
});

test('B7 — a capacidade é DERIVADA do pedido; a declarada no payload é ignorada', async () => {
  limpar();
  const derivadas = broker.capacidadesDoPedido({ escrita: false, allowedTools: 'Read',
    capacidades: ['write', 'deploy', 'secrets'] });
  assert.deepStrictEqual(derivadas, ['read'], 'quem pede não declara o que pode');
  assert.deepStrictEqual(broker.capacidadesDoPedido({ allowedTools: 'Read,Bash,WebFetch' }),
    ['read', 'bash', 'net'], 'bash e net saem das ferramentas reais');
});

test('B7b — papel sem a capacidade que o pedido EXIGE é recusado', async () => {
  limpar();
  jobPendente('job-esc1', { escrita: true, allowedTools: 'Read,Edit,Write' });
  fs.writeFileSync(ROLES, JSON.stringify({
    papeis: { ana: 'viewer', paulo: 'owner' },
    capacidades: { viewer: ['read'], owner: ['read', 'write', 'bash', 'git'] } }));

  const negado = await broker.decide({ decision_id: 'd-n', request_id: 'job-esc1', actor: ANA,
    veredicto: 'aprovar', idem_key: 'k-n', expected_state_hash: hashDe('job-esc1') });
  assert.equal(negado.estado, 'REJECTED');
  assert.equal(negado.porque_negado, 'capacidade_em_falta');
  assert.deepStrictEqual(negado.capacidades_em_falta, ['write']);

  // job NOVO de proposito: o job-esc1 ja tem uma decisao final, e reutiliza-lo
  // aqui bateria na regra do B23 em vez de testar o que este teste quer testar.
  jobPendente('job-esc2', { escrita: true, allowedTools: 'Read,Edit,Write' });
  const despachos = []; stubDispatcher(despachos);
  const ok = await broker.decide({ decision_id: 'd-o', request_id: 'job-esc2', actor: PAULO,
    veredicto: 'aprovar', idem_key: 'k-o', expected_state_hash: hashDe('job-esc2') });
  assert.equal(ok.estado, 'APPROVED', 'o owner tem write');
});

test('B7c — SEM roles.json o comportamento é single-user, exactamente como hoje', async () => {
  limpar();
  jobPendente('job-su', { escrita: true, allowedTools: 'Read,Edit,Write' });
  const despachos = []; stubDispatcher(despachos);
  const r = await broker.decide({ decision_id: 'd-su', request_id: 'job-su', actor: PAULO,
    veredicto: 'aprovar', idem_key: 'k-su', expected_state_hash: hashDe('job-su') });
  assert.equal(r.estado, 'APPROVED', 'regressão zero é GATE');
  assert.equal(r.autorizacao, 'single_user');
});

test('B13 — roles.json ILEGÍVEL fecha; não é o mesmo que roles.json ausente', async () => {
  limpar();
  jobPendente('job-il', { escrita: true, allowedTools: 'Read,Edit,Write' });
  fs.writeFileSync(ROLES, '{ "papeis": { "paulo": "owner" ');   // truncado a meio
  const r = await broker.decide({ decision_id: 'd-il', request_id: 'job-il', actor: PAULO,
    veredicto: 'aprovar', idem_key: 'k-il', expected_state_hash: hashDe('job-il') });
  assert.equal(r.estado, 'REJECTED');
  assert.equal(r.porque_negado, 'roles_ilegivel',
    'apagar metade do ficheiro de papéis dava autoridade TOTAL — fail-open na autorização');

  limpar();
  jobPendente('job-il2', { escrita: true, allowedTools: 'Read,Edit,Write' });
  fs.writeFileSync(ROLES, JSON.stringify({ isto: 'não tem papeis nem capacidades' }));
  const r2 = await broker.decide({ decision_id: 'd-il2', request_id: 'job-il2', actor: PAULO,
    veredicto: 'aprovar', idem_key: 'k-il2', expected_state_hash: hashDe('job-il2') });
  assert.equal(r2.porque_negado, 'roles_ilegivel', 'JSON válido mas sem os campos também é avaria');
});

test('B18 — sem o pedido original não se autoriza às cegas', async () => {
  limpar();
  // só o evento de espera, sem `dispatched`
  escrever({ ts: HA_UMA_HORA, event: 'nao_verificado', job_id: 'job-orfao',
    exit_code: 'agent-awaiting-approval', actor: ANA });
  const r = await broker.decide({ decision_id: 'd-orf', request_id: 'job-orfao', actor: PAULO,
    veredicto: 'aprovar', idem_key: 'k-orf', expected_state_hash: hashDe('job-orfao') });
  assert.equal(r.estado, 'INVALIDO', 'derivar `read` e aprovar era autorizar às cegas com cara de rigor');
});

// ── contrato produtor ⇄ consumidor ────────────────────────────────────────
test('B16 — os campos que o broker LÊ são os que o seamless ESCREVE', () => {
  // Este é o teste que faltava na ronda 1. O broker derivava capacidades de
  // `allowedTools` e o evento `dispatched` não gravava esse campo: em produção
  // nunca se via `bash`, `net` nem `git`. Os fixtures fabricavam-no e o furo
  // ficou invisível até o crítico ir ao produtor.
  const src = fs.readFileSync(path.join(__dirname, 'seamless.js'), 'utf8');
  const i = src.indexOf("event: 'dispatched',");
  assert.ok(i > 0, 'não encontrei o evento dispatched no seamless.js');
  const bloco = src.slice(i, src.indexOf('});', i));
  for (const campo of ['escrita:', 'allowedTools:']) {
    assert.ok(bloco.includes(campo),
      'o broker deriva capacidades de `' + campo + '` e o dispatched não o grava');
  }
});

test('B14 — os eventos do broker não entram no stream do job (nenhum leitor parte)', async () => {
  limpar();
  jobPendente('job-lei');
  await broker.decide({ decision_id: 'd-lei', request_id: 'job-lei', actor: PAULO,
    veredicto: 'recusar', idem_key: 'k-lei', expected_state_hash: hashDe('job-lei') });

  for (const e of eventos().filter((x) => x.event === 'approval.decided' || x.event === 'approval_rejected')) {
    assert.equal(Object.prototype.hasOwnProperty.call(e, 'job_id'), false,
      'com job_id, o toolCollect dizia que o job ainda corria e o toolCancel inventava um failed');
    assert.equal(e.request_id, 'job-lei', 'a ligação faz-se por request_id');
  }
  const fleet = require('./fleet.js');
  const jobs = fleet.foldJobs(eventos());
  assert.deepStrictEqual(jobs.map((j) => j.job_id).sort(), ['job-lei'],
    'o fold dos jobs não pode ganhar linhas por causa do broker');
});

// ── lock ──────────────────────────────────────────────────────────────────
test('B8 — o append corre sob lock O_EXCL, e o lock é libertado', async () => {
  limpar();
  jobPendente('job-l1');
  await broker.decide({ decision_id: 'd-l1', request_id: 'job-l1', actor: PAULO,
    veredicto: 'recusar', idem_key: 'k-l1', expected_state_hash: hashDe('job-l1') });
  assert.equal(fs.existsSync(broker.LOCK_PATH()), false, 'um lock que fica bloqueia para sempre');
});

test('B8b — barreira forçada: com o lock tomado, o segundo decisor NÃO escreve', async () => {
  // kimi #9 — interleaving determinístico. O segundo não "chega tarde por azar":
  // encontra o lock lá porque fomos nós a pô-lo, e só o tiramos depois de medir.
  limpar();
  jobPendente('job-c1');
  const h = hashDe('job-c1');
  fs.mkdirSync(path.dirname(broker.LOCK_PATH()), { recursive: true });
  fs.writeFileSync(broker.LOCK_PATH(), JSON.stringify({
    acquired_by: 'outro-processo', pid: 999999, acquired_at_ms: Date.now(), ttl_seconds: 60 }), { flag: 'wx' });

  const bloqueado = await broker.decide({ decision_id: 'd-c1', request_id: 'job-c1', actor: PAULO,
    veredicto: 'recusar', idem_key: 'k-c1', expected_state_hash: h });
  assert.equal(bloqueado.estado, 'LOCKED');
  assert.equal(bloqueado.held_by, 'outro-processo');
  assert.equal(decididos().length, 0, 'nada foi ao ledger enquanto o lock era de outro');

  fs.rmSync(broker.LOCK_PATH(), { force: true });
  const passa = await broker.decide({ decision_id: 'd-c1', request_id: 'job-c1', actor: PAULO,
    veredicto: 'recusar', idem_key: 'k-c1', expected_state_hash: h });
  assert.equal(passa.estado, 'REJECTED', 'libertado o lock, a MESMA decisão passa');
});

test('B8c — lock órfão é REPORTADO, nunca roubado; e um lock vazio não é eterno', async () => {
  limpar();
  jobPendente('job-o1');
  fs.mkdirSync(path.dirname(broker.LOCK_PATH()), { recursive: true });
  fs.writeFileSync(broker.LOCK_PATH(), JSON.stringify({
    acquired_by: 'processo-morto', pid: 999999,
    acquired_at_ms: Date.now() - 10 * 60e3, ttl_seconds: 60 }));
  const r = await broker.decide({ decision_id: 'd-o1', request_id: 'job-o1', actor: PAULO,
    veredicto: 'recusar', idem_key: 'k-o1', expected_state_hash: hashDe('job-o1') });
  assert.equal(r.estado, 'LOCKED');
  assert.equal(r.stale, true, 'reporta a obsolescência e não a resolve sozinho');

  // lock VAZIO (uma escrita que morreu a meio): sem dono e sem relógio, ficava
  // eternamente não-obsoleto. A data do ficheiro é o relógio de recurso.
  fs.writeFileSync(broker.LOCK_PATH(), '');
  const antigo = Date.now() - 10 * 60e3;
  fs.utimesSync(broker.LOCK_PATH(), antigo / 1000, antigo / 1000);
  const r2 = await broker.decide({ decision_id: 'd-o2', request_id: 'job-o1', actor: PAULO,
    veredicto: 'recusar', idem_key: 'k-o2', expected_state_hash: hashDe('job-o1') });
  assert.equal(r2.stale, true, 'um lock vazio e velho tem de ser reportável como órfão');
  fs.rmSync(broker.LOCK_PATH(), { force: true });
});

// ── promoção, não recriação ───────────────────────────────────────────────
test('B9 — o hash canónico vem do ledger-prov, não de uma cópia', () => {
  const prov = broker._prov();
  assert.equal(prov.provHash({ a: 1, b: 2 }), prov.provHash({ b: 2, a: 1 }));
  const copias = fs.readdirSync(__dirname)
    .filter((f) => f.endsWith('.js') && !f.endsWith('.test.js'))
    .filter((f) => /function\s+canonicalize|function\s+provHash/.test(fs.readFileSync(path.join(__dirname, f), 'utf8')));
  assert.deepStrictEqual(copias, [], 'apareceu uma segunda implementação do hash canónico');
});

test('B10 — o broker e o ledger-prov entram no .mcpb', () => {
  // O broker resolve o prov em RUNTIME, por isso o detector de requires do
  // bundle.test.js não o vê. Sem esta rede, o conector instalado morria no
  // primeiro decide() com o repo todo verde.
  const pack = fs.readFileSync(path.join(__dirname, 'pack-mcpb.mjs'), 'utf8');
  const bloco = pack.slice(pack.indexOf('const FILES = ['), pack.indexOf('];', pack.indexOf('const FILES = [')));
  for (const alvo of ['server/broker.js', 'server/ledger-prov.js']) {
    assert.ok(bloco.includes("'" + alvo + "'"), alvo + ' não está na lista do bundle');
  }
});

// ── ronda 3 · os 8 ALTO do G4 #2 ──────────────────────────────────────────
test('B21 — job legado sem ferramentas conhecidas assume o PIOR, nao o melhor', () => {
  // antes degradava para ['read'], o que o tornava MAIS FACIL de aprovar.
  // Fail-open exactamente onde doi.
  assert.deepStrictEqual(broker.capacidadesDoPedido({}), broker.TODAS_AS_CAPACIDADES);
  assert.deepStrictEqual(broker.capacidadesDoPedido({ escrita: false, allowedTools: '' }),
    broker.TODAS_AS_CAPACIDADES, 'sem saber o que o job pode fazer, assume-se tudo');
});

test('B22 — a capacidade EFECTIVA manda sobre a pedida', () => {
  // o seamless documenta que --allowedTools PRE-APROVA e nao LIMITA. Derivar do
  // pedido, ignorando o efectivo, era medir a fechadura errada.
  const caps = broker.capacidadesDoPedido({
    allowedTools: 'Read',
    permissoes_efectivas: { valor: ['Read', 'Bash', 'WebFetch'] } });
  assert.deepStrictEqual(caps, ['read', 'bash', 'net']);
});

test('B23 — uma decisao FINAL nao se reabre com uma idem_key nova', async () => {
  limpar();
  jobPendente('job-fin');
  await broker.decide({ decision_id: 'd1', request_id: 'job-fin', actor: PAULO,
    veredicto: 'recusar', idem_key: 'k1', expected_state_hash: hashDe('job-fin') });
  const outra = await broker.decide({ decision_id: 'd2', request_id: 'job-fin', actor: PAULO,
    veredicto: 'aprovar', idem_key: 'CHAVE-NOVA', expected_state_hash: hashDe('job-fin') });
  assert.equal(outra.estado, 'REJECTED');
  assert.equal(outra.motivo, 'ja_decidido',
    'a idempotencia por chave nao chegava: as decisoes nao mudam o state_hash, logo o CAS nao dava por nada');
});

test('B24 — nao se decide um job que ja nao esta a espera', async () => {
  limpar();
  jobPendente('job-passou');
  escrever({ ts: new Date().toISOString(), event: 'done', job_id: 'job-passou', exit_code: 0, actor: ANA });
  const r = await broker.decide({ decision_id: 'd', request_id: 'job-passou', actor: PAULO,
    veredicto: 'aprovar', idem_key: 'k', expected_state_hash: hashDe('job-passou') });
  assert.equal(r.motivo, 'nao_esta_a_espera');
});

test('B25 — sem relogio utilizavel FECHA, e a fila nao rebenta', async () => {
  limpar();
  escrever({ event: 'dispatched', job_id: 'job-sem-ts', actor: ANA, allowedTools: 'Read' });
  escrever({ ts: 'nao-e-uma-data', event: 'nao_verificado', job_id: 'job-sem-ts',
    exit_code: 'agent-awaiting-approval', actor: ANA });

  assert.doesNotThrow(() => broker.listPending(), 'um ts invalido lancava RangeError na fila');
  const p = broker.listPending().find((x) => x.job_id === 'job-sem-ts');
  assert.equal(p.expira_em, null);
  assert.ok(p.expira_em_porque, 'e diz porque e que nao ha prazo, em vez de inventar um');

  const r = await broker.decide({ decision_id: 'd', request_id: 'job-sem-ts', actor: PAULO,
    veredicto: 'aprovar', idem_key: 'k', expected_state_hash: hashDe('job-sem-ts') });
  assert.equal(r.motivo, 'sem_relogio', 'sem prazo nao se aprova — antes vivia para sempre');
});

test('B25b — um ts no FUTURO nao estica o prazo', async () => {
  limpar();
  const daquiA10dias = new Date(Date.now() + 10 * 24 * 3600e3).toISOString();
  jobPendente('job-futuro', { ts0: daquiA10dias, ts1: daquiA10dias });
  const r = await broker.decide({ decision_id: 'd', request_id: 'job-futuro', actor: PAULO,
    veredicto: 'recusar', idem_key: 'k', expected_state_hash: hashDe('job-futuro') });
  assert.equal(r.estado, 'REJECTED', 'o relogio do pedido vale no maximo agora; nao ha viagem no tempo');
});

test('B26 — re-despacha o masterprompt DO DISCO, nao o goal', async () => {
  limpar();
  const texto = '⇄ COWORK -> CC\nGOAL  fazer a coisa certa\nGUARD sem push\n';
  jobPendente('job-mp', { masterprompt: texto });
  const despachos = []; stubDispatcher(despachos);
  const r = await broker.decide({ decision_id: 'd', request_id: 'job-mp', actor: PAULO,
    veredicto: 'aprovar', idem_key: 'k', expected_state_hash: hashDe('job-mp') });
  assert.equal(r.estado, 'APPROVED');
  assert.equal(despachos[0].masterprompt, texto,
    'reenviar o `goal` nao passa o guard, que exige o texto integral com cabecalho');
});

test('B26b — sem o masterprompt em disco NAO se aprova', async () => {
  limpar();
  jobPendente('job-nomp', { semMasterprompt: true });
  const despachos = []; stubDispatcher(despachos);
  const r = await broker.decide({ decision_id: 'd', request_id: 'job-nomp', actor: PAULO,
    veredicto: 'aprovar', idem_key: 'k', expected_state_hash: hashDe('job-nomp') });
  assert.equal(r.motivo, 'sem_masterprompt');
  assert.equal(despachos.length, 0, 'despachar outra coisa e pior do que nao despachar');
});

test('B27 — um despacho iniciado e nao confirmado PARA o retry', async () => {
  // sem isto, um crash entre despachar e gravar deixava um job novo sem decisao
  // e a repeticao despachava OUTRA VEZ.
  limpar();
  jobPendente('job-crash');
  escrever({ ts: new Date().toISOString(), event: 'approval.dispatching',
    request_id: 'job-crash', actor: PAULO, idem_key: 'k-antiga' });
  const despachos = []; stubDispatcher(despachos);
  const r = await broker.decide({ decision_id: 'd', request_id: 'job-crash', actor: PAULO,
    veredicto: 'aprovar', idem_key: 'k-nova', expected_state_hash: hashDe('job-crash') });
  assert.equal(r.estado, 'INDETERMINADO');
  assert.equal(r.motivo, 'despacho_pendurado');
  assert.equal(despachos.length, 0, 'nao se despacha duas vezes por causa de um crash');
});

test('B28 — TODO o retorno leva authz, cas e motivo', async () => {
  limpar();
  jobPendente('job-cx');
  const casos = [];
  casos.push(await broker.decide({}));                                            // INVALIDO
  casos.push(await broker.decide({ request_id: 'job-cx', actor: PAULO, idem_key: 'k' })); // sem CAS
  casos.push(await broker.decide({ request_id: 'job-cx', actor: PAULO, idem_key: 'k2',
    veredicto: 'recusar', expected_state_hash: hashDe('job-cx') }));               // REJECTED

  fs.mkdirSync(path.dirname(broker.LOCK_PATH()), { recursive: true });
  fs.writeFileSync(broker.LOCK_PATH(), JSON.stringify({ acquired_by: 'x', acquired_at_ms: Date.now(), ttl_seconds: 60 }));
  casos.push(await broker.decide({ request_id: 'job-cx', actor: PAULO, idem_key: 'k3',
    veredicto: 'recusar', expected_state_hash: 'x' }));                            // LOCKED
  fs.rmSync(broker.LOCK_PATH(), { force: true });

  for (const c of casos) {
    assert.equal(c.authz.advisory, true, 'authz em falta em ' + c.estado);
    assert.equal(c.cas.atomico, false, 'cas em falta em ' + c.estado);
    assert.ok(c.motivo, 'motivo em falta em ' + c.estado);
  }
  const motivos = casos.map((c) => c.motivo);
  assert.equal(new Set(motivos).size, motivos.length,
    'motivos repetidos nao discriminam nada — era isso que o consumidor nao conseguia distinguir');
});

test('B29 — capacidades que nao sao lista de strings fecham o roles.json', async () => {
  limpar();
  jobPendente('job-sub', { escrita: true, allowedTools: 'Read,Edit,Write' });
  // 'readwrite'.includes('read') === true — uma string passava por lista e dava
  // ao papel uma capacidade que ninguem lhe deu.
  fs.writeFileSync(ROLES, JSON.stringify({ papeis: { paulo: 'x' }, capacidades: { x: 'readwrite' } }));
  const r = await broker.decide({ decision_id: 'd', request_id: 'job-sub', actor: PAULO,
    veredicto: 'aprovar', idem_key: 'k', expected_state_hash: hashDe('job-sub') });
  assert.equal(r.motivo, 'roles_ilegivel');
});

test('B30 — a fila nao esconde um pendente por causa de um `collected`', async () => {
  // o `collected` e uma OBSERVACAO, nao um estado. Trata-lo como estado fazia um
  // mooter_collect normal apagar uma espera ainda por decidir.
  limpar();
  jobPendente('job-obs');
  escrever({ ts: new Date().toISOString(), event: 'collected', job_id: 'job-obs', actor: ANA });
  escrever({ ts: new Date().toISOString(), event: 'step', job_id: 'job-obs', actor: ANA });
  assert.equal(broker.listPending().map((p) => p.job_id).includes('job-obs'), true,
    'a espera continua por decidir — o collected nao decide nada');
});
