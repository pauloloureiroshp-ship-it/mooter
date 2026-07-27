'use strict';
/**
 * seamless.test.js — hermetic tests for mooter-bridge v0.2 (node --test).
 * No real CLI is ever spawned: the job spawner is injected. The ledger and
 * jobs dir live in a temp MOOTER_HOME. Worktree checks use a real `git init`
 * temp repo (git is a hard dependency of the product anyway).
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { EventEmitter } = require('events');

// isolate BEFORE requiring the module under test
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'seamless-test-'));
process.env.MOOTER_HOME = path.join(TMP, 'mooter-home');
process.env.MOOTER_WORKTREE_ROOT = TMP;

// fake repo with a stub FROZEN classifier (route is tested against the seam,
// the real classify.js contract is exercised in the repo's own suite)
const FAKEREPO = path.join(TMP, 'frugal');
fs.mkdirSync(path.join(FAKEREPO, 'tools', 'router'), { recursive: true });
fs.writeFileSync(path.join(FAKEREPO, 'tools', 'router', 'classify.js'),
  "module.exports={classify:(t)=>String(t).includes('quota-t0')"
  + "?{tier:'T0',confidence:0.9,reasoning:'stub T0',recommended_model:'qwen2.5:3b'}"
  + ":{tier:'T2',confidence:0.9,reasoning:'stub',recommended_model:'sonnet'}};");
process.env.MOOTER_REPO = FAKEREPO;
process.env.OLLAMA_HOST = '127.0.0.1:1';

const seam = require('./seamless.js');
const moo = require('./moo.js');
const quotaModule = require('./quota.js');
const wtModule = require('./worktrees.js');

// a real git worktree
const WT = path.join(TMP, 'frugal-wt-a');
fs.mkdirSync(WT, { recursive: true });
execFileSync('git', ['init', '-q', WT]);

function fakeChild() {
  const c = new EventEmitter();
  c.stdout = new EventEmitter(); c.stdout.pipe = () => {};
  c.stderr = new EventEmitter(); c.stderr.pipe = () => {};
  c.kill = () => { c.emit('close', 137); };
  return c;
}

function makeWorktree(name) {
  const worktree = path.join(TMP, name);
  fs.mkdirSync(worktree, { recursive: true });
  execFileSync('git', ['init', '-q', worktree]);
  return worktree;
}

async function closeJob(result, code) {
  if (result && result.job_id && seam.REGISTRY.has(result.job_id)) {
    seam.REGISTRY.get(result.job_id).child.emit('close', code == null ? 0 : code);
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

async function waitUntil(fn, maxMs) {
  const deadline = Date.now() + (maxMs || 1500);
  while (Date.now() < deadline) {
    if (fn()) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  assert.fail('condição não ficou verdadeira dentro do prazo');
}

const MP = '⇄ ROUTING\nDE: teste\nPARA: cc\n\nDiz apenas "ok".';

test('guard: recusa agent desconhecido, mp sem ⇄, worktree inexistente, vault', () => {
  let g = seam.guardCheck({ agent: 'gpt', worktree: WT, masterprompt: MP, wave: 'w' });
  assert.ok(!g.ok && g.reasons.some((r) => r.includes('desconhecido')));
  g = seam.guardCheck({ agent: 'cc', worktree: WT, masterprompt: 'sem cabecalho', wave: 'w' });
  assert.ok(!g.ok && g.reasons.some((r) => r.includes('⇄')));
  g = seam.guardCheck({ agent: 'cc', worktree: path.join(TMP, 'nope'), masterprompt: MP, wave: 'w' });
  assert.ok(!g.ok && g.reasons.some((r) => r.includes('não existe')));
  g = seam.guardCheck({ agent: 'cc', worktree: path.join(TMP, 'paulo-vault', 'x'), masterprompt: MP, wave: 'w' });
  assert.ok(!g.ok && g.reasons.some((r) => r.includes('vault')));
  g = seam.guardCheck({ agent: 'cc', worktree: WT, masterprompt: MP, wave: 'w"quote' });
  assert.ok(!g.ok && g.reasons.some((r) => r.includes('aspas')));
});

test('guard: aceita worktree git válida e livre', () => {
  const g = seam.guardCheck({ agent: 'cc', worktree: WT, masterprompt: MP, wave: 'w' });
  assert.deepStrictEqual(g, { ok: true, reasons: [] });
});

test('route: usa o classifier (stub) e mapeia tier→agent', async () => {
  const r = await seam.toolRoute({ text: 'qualquer tarefa' });
  assert.strictEqual(r.agent, 'cc');
  assert.strictEqual(r.tier, 'T2');
  assert.strictEqual(r.confidence, 0.9);
  assert.ok(r.routing_note.includes('FROZEN'));
});

test('honestidade: pedido de execução fixado no moo é recusado antes do dispatch', async () => {
  const worktree = makeWorktree('frugal-wt-exec-moo');
  fs.writeFileSync(path.join(worktree, 'board.test.js'), 'const resultado = 14;\n');
  const originalPickModel = moo.pickModel;
  const originalPickModelExplained = moo.pickModelExplained;
  const originalRunLocal = moo.runLocal;
  let localRuns = 0;
  let result = null;
  try {
    moo.pickModel = async () => 'qwen-test';
    moo.pickModelExplained = async () => ({ model: 'qwen-test', porque: 'stub' });
    moo.runLocal = () => { localRuns++; return fakeChild(); };
    result = await seam.toolWork({
      goal: 'Corre o comando `node board.test.js` e diz quantos testes passaram',
      agent: 'moo', worktree, wave: 'honest-exec-moo', prepare: false,
    });
    assert.strictEqual(result.erro, 'motor_sem_execucao', JSON.stringify(result));
    assert.deepStrictEqual(result.permissoes_efectivas.valor, []);
    assert.match(result.resumo, /cc|codex/i);
    assert.strictEqual(localRuns, 0, 'o pedido impossível chegou ao /api/chat do moo');
  } finally {
    await closeJob(result, 1);
    moo.pickModel = originalPickModel;
    moo.pickModelExplained = originalPickModelExplained;
    moo.runLocal = originalRunLocal;
  }
});

test('honestidade: pedido de execução sem agent fixado é reencaminhado para cc', async () => {
  const worktree = makeWorktree('frugal-wt-exec-auto');
  fs.writeFileSync(path.join(worktree, 'board.test.js'), 'const resultado = 14;\n');
  const originalPickModel = moo.pickModel;
  const originalEstado = quotaModule.estado;
  let spawned = null;
  let result = null;
  try {
    quotaModule.estado = () => ({
      pressao: { valor: 0.2, nivel: 'normal' },
      calibragem: { politica: 'normal', tecto: null, forcar_local: false, porque: 'stub' },
    });
    moo.pickModel = async () => 'qwen-test';
    seam.setJobSpawner((cmd) => {
      spawned = cmd;
      const child = fakeChild();
      setImmediate(() => child.emit('spawn'));
      return child;
    });
    result = await seam.toolWork({
      goal: 'quota-t0: corre `node board.test.js` e devolve a saída',
      worktree, wave: 'honest-exec-auto', prepare: false,
    });
    assert.ok(result.job_id, JSON.stringify(result));
    assert.strictEqual(result.agent, 'cc');
    assert.strictEqual(result.routed_by, 'capacidade-execucao');
    assert.strictEqual(spawned.bin, 'claude');
  } finally {
    await closeJob(result, 1);
    moo.pickModel = originalPickModel;
    quotaModule.estado = originalEstado;
  }
});

test('honestidade: detector cobre verbos, crases e comandos canónicos', () => {
  for (const goal of [
    'corre os testes', 'executa esta verificação', 'roda a suite', 'run the checks',
    'usa `python script.py`', 'npm test', 'node board.test.js', 'git status', 'pytest -q',
  ]) {
    assert.ok(seam.pedeExecucaoDeMotor(goal), 'não detectou: ' + goal);
  }
  assert.strictEqual(seam.pedeExecucaoDeMotor('Resume em duas frases a ideia principal'), null);
});

test('honestidade: goal sem execução continua a ser despachado ao moo', async () => {
  const worktree = makeWorktree('frugal-wt-normal-moo');
  const originalPickModel = moo.pickModel;
  const originalPickModelExplained = moo.pickModelExplained;
  const originalRunLocal = moo.runLocal;
  let chosen = null;
  let result = null;
  try {
    moo.pickModel = async () => 'qwen-test';
    moo.pickModelExplained = async () => ({ model: 'qwen-test', porque: 'stub' });
    moo.runLocal = ({ model }) => { chosen = model; const child = fakeChild(); setImmediate(() => child.emit('spawn')); return child; };
    result = await seam.toolWork({
      goal: 'Resume em duas frases a ideia principal', agent: 'moo',
      worktree, wave: 'honest-normal-moo', prepare: false,
    });
    assert.ok(result.job_id, JSON.stringify(result));
    assert.strictEqual(result.agent, 'moo');
    assert.strictEqual(chosen, 'qwen-test');
  } finally {
    await closeJob(result, 0);
    moo.pickModel = originalPickModel;
    moo.pickModelExplained = originalPickModelExplained;
    moo.runLocal = originalRunLocal;
  }
});

test('honestidade: git de leitura satisfeito pelo A4 continua no moo', async () => {
  const worktree = makeWorktree('frugal-wt-a4-moo');
  const originalPickModel = moo.pickModel;
  const originalPickModelExplained = moo.pickModelExplained;
  const originalRunLocal = moo.runLocal;
  let result = null;
  try {
    moo.pickModel = async () => 'qwen-test';
    moo.pickModelExplained = async () => ({ model: 'qwen-test', porque: 'stub' });
    moo.runLocal = () => { const child = fakeChild(); setImmediate(() => child.emit('spawn')); return child; };
    result = await seam.toolWork({
      goal: 'corre git status e resume a saída', agent: 'moo',
      worktree, wave: 'honest-a4-moo', prepare: false,
    });
    assert.ok(result.job_id, JSON.stringify(result));
    assert.strictEqual(result.agent, 'moo');
    assert.deepStrictEqual(result.comandos_corridos, ['git status']);
  } finally {
    await closeJob(result, 0);
    moo.pickModel = originalPickModel;
    moo.pickModelExplained = originalPickModelExplained;
    moo.runLocal = originalRunLocal;
  }
});

test('quota: tecto sonnet limita o modelo final que cairia no default do CLI', async () => {
  const worktree = makeWorktree('frugal-wt-quota-cap');
  const originalEstado = quotaModule.estado;
  const originalPickModel = moo.pickModel;
  let spawned = null;
  let result = null;
  try {
    quotaModule.estado = () => ({
      pressao: { valor: 0.8, nivel: 'alto' },
      calibragem: { politica: 'nuvem-com-conta', tecto: 'sonnet', forcar_local: false, porque: 'stub' },
    });
    moo.pickModel = async () => null;
    seam.setJobSpawner((cmd) => {
      spawned = cmd;
      const child = fakeChild();
      setImmediate(() => child.emit('spawn'));
      return child;
    });
    result = await seam.toolWork({
      goal: 'quota-t0: explica isto brevemente', worktree,
      wave: 'quota-cap-final', prepare: false,
    });
    assert.ok(result.job_id, JSON.stringify(result));
    assert.ok(spawned, 'o job cloud não chegou ao spawner');
    const modelIndex = spawned.args.indexOf('--model');
    assert.ok(modelIndex >= 0, 'o tecto não chegou ao comando final: ' + JSON.stringify(spawned.args));
    assert.strictEqual(spawned.args[modelIndex + 1], 'sonnet');
    assert.strictEqual(result.model, 'sonnet');
    assert.ok(result.calibragem_por_quota.desceu_de, JSON.stringify(result.calibragem_por_quota));
    assert.strictEqual(result.routed_by, 'quota');
  } finally {
    await closeJob(result, 1);
    quotaModule.estado = originalEstado;
    moo.pickModel = originalPickModel;
  }
});

test('quota: agent moo continua isento do tecto activo', async () => {
  const worktree = makeWorktree('frugal-wt-quota-moo');
  const originalEstado = quotaModule.estado;
  const originalPickModel = moo.pickModel;
  const originalPickModelExplained = moo.pickModelExplained;
  const originalRunLocal = moo.runLocal;
  let chosen = null;
  let result = null;
  try {
    quotaModule.estado = () => ({
      pressao: { valor: 0.8, nivel: 'alto' },
      calibragem: { politica: 'nuvem-com-conta', tecto: 'sonnet', forcar_local: false, porque: 'stub' },
    });
    moo.pickModel = async () => 'qwen-test';
    moo.pickModelExplained = async () => ({ model: 'qwen-test', porque: 'stub' });
    moo.runLocal = ({ model }) => { chosen = model; const child = fakeChild(); setImmediate(() => child.emit('spawn')); return child; };
    result = await seam.toolWork({
      goal: 'Resume este conceito em duas frases', agent: 'moo',
      worktree, wave: 'quota-moo-isento', prepare: false,
    });
    assert.ok(result.job_id, JSON.stringify(result));
    assert.strictEqual(result.agent, 'moo');
    assert.strictEqual(chosen, 'qwen-test');
    assert.strictEqual(result.calibragem_por_quota.desceu_de, null);
  } finally {
    await closeJob(result, 0);
    quotaModule.estado = originalEstado;
    moo.pickModel = originalPickModel;
    moo.pickModelExplained = originalPickModelExplained;
    moo.runLocal = originalRunLocal;
  }
});

test('quota: sem calibragem o fallback conserva o default do CLI', async () => {
  const worktree = makeWorktree('frugal-wt-quota-normal');
  const originalEstado = quotaModule.estado;
  const originalPickModel = moo.pickModel;
  let spawned = null;
  let result = null;
  try {
    quotaModule.estado = () => ({
      pressao: { valor: 0.2, nivel: 'normal' },
      calibragem: { politica: 'normal', tecto: null, forcar_local: false, porque: 'stub' },
    });
    moo.pickModel = async () => null;
    seam.setJobSpawner((cmd) => {
      spawned = cmd;
      const child = fakeChild();
      setImmediate(() => child.emit('spawn'));
      return child;
    });
    result = await seam.toolWork({
      goal: 'quota-t0: explica isto brevemente', worktree,
      wave: 'quota-sem-calibragem', prepare: false,
    });
    assert.ok(result.job_id, JSON.stringify(result));
    assert.ok(spawned);
    assert.strictEqual(spawned.args.includes('--model'), false, JSON.stringify(spawned.args));
    assert.strictEqual(result.routed_by, 'cli-default');
    assert.strictEqual(result.calibragem_por_quota, null);
  } finally {
    await closeJob(result, 1);
    quotaModule.estado = originalEstado;
    moo.pickModel = originalPickModel;
  }
});

test('quota: o tecto nunca promove um modelo conhecido', () => {
  const calibration = { tecto: 'sonnet' };
  assert.deepStrictEqual(seam.applyQuotaCeiling('cc', 'haiku', calibration, true),
    { model: 'haiku', applied: false, from: null });
  assert.deepStrictEqual(seam.applyQuotaCeiling('cc', 'sonnet', calibration, true),
    { model: 'sonnet', applied: false, from: null });
  assert.deepStrictEqual(seam.applyQuotaCeiling('cc', 'opus', calibration, true),
    { model: 'sonnet', applied: true, from: 'opus' });
  assert.deepStrictEqual(seam.applyQuotaCeiling('moo', 'qwen-test', calibration, true),
    { model: 'qwen-test', applied: false, from: null });
});

test('permissões com Bash pedido nunca regressam como lista efectiva só de leitura', () => {
  const report = seam.permissionReport({
    agent: 'cc',
    allowedTools: 'Read,Glob,Grep,Bash',
    cmd: 'claude -p x --allowedTools Read,Glob,Grep,Bash',
  });
  assert.ok(report.pedido.valor.includes('Bash'));
  assert.strictEqual(report.efectivo.valor, 'n/d');
  assert.ok(report.efectivo.porque.includes('--allowedTools'));
  assert.notDeepStrictEqual(report.efectivo.valor, ['Read', 'Glob', 'Grep']);
});

test('permissões indetermináveis dizem n/d com o porquê', () => {
  const efectivo = seam.effectivePermissions({ agent: 'gemini', cmd: 'gemini --approval-mode auto_edit' });
  assert.strictEqual(efectivo.valor, 'n/d');
  assert.ok(efectivo.porque, 'n/d sem razão volta a ser opacidade');
});

test('create_worktree:true cria antes do dispatch e leva o caminho para resultado e ledger', async () => {
  const created = path.join(TMP, 'frugal-wt-created-explicit');
  fs.mkdirSync(created, { recursive: true });
  execFileSync('git', ['init', '-q', created]);
  const originalCreate = wtModule.create;
  let createCall = null;
  let jobId = null;
  wtModule.create = (repo, name, source) => {
    createCall = { repo, name, source };
    return { ok: true, path: created, branch: 'mooter/wt-onda54', source, created: true };
  };
  seam.setJobSpawner(() => { const child = fakeChild(); setImmediate(() => child.emit('spawn')); return child; });
  try {
    const result = await seam.toolWork({
      goal: 'explica o estado actual', agent: 'cc', worktree: WT,
      wave: 'onda54-create-explicit', create_worktree: true, prepare: false,
      allowedTools: 'Read,Glob,Grep,Bash',
    });
    jobId = result.job_id;
    assert.ok(jobId, JSON.stringify(result));
    assert.ok(createCall, 'create_worktree:true foi ignorado');
    assert.strictEqual(createCall.source, WT);
    assert.strictEqual(result.worktree_usada, created);
    assert.strictEqual(result.worktree_criada.path, created);
    const dispatched = seam.ledgerRead().find((event) => event.job_id === jobId && event.event === 'dispatched');
    assert.strictEqual(dispatched.worktree_criada.path, created);
    assert.ok(dispatched.permissoes_pedidas.valor.includes('Bash'));
    assert.strictEqual(dispatched.permissoes_efectivas.valor, 'n/d');
  } finally {
    if (jobId && seam.REGISTRY.has(jobId)) seam.REGISTRY.get(jobId).child.emit('close', 1);
    wtModule.create = originalCreate;
  }
});

test('mooter_work nomeia a worktree usada no resumo quando não relocaliza', async () => {
  seam.setJobSpawner(() => { const child = fakeChild(); setImmediate(() => child.emit('spawn')); return child; });
  const result = await seam.toolWork({
    goal: 'resume o estado do projecto', agent: 'cc', worktree: WT,
    wave: 'onda1-resumo-worktree', prepare: false,
  });
  try {
    assert.ok(result.job_id, JSON.stringify(result));
    assert.match(result.resumo, new RegExp(' · em ' + path.basename(WT) + '$'));
  } finally {
    await closeJob(result, 1);
  }
});

test('goal dêictico recusa worktree ocupada, não relocaliza e regista a recusa', async () => {
  const alternative = makeWorktree('frugal-wt-deictico-alt');
  const originalFirstFree = wtModule.firstFree;
  let pickerCalls = 0;
  let result = null;
  seam.ledgerAppend({
    job_id: 'ocupante-deictico', wave: 'onda1-deictico', agent: 'cc',
    worktree: WT, event: 'started',
  });
  wtModule.firstFree = () => { pickerCalls++; return alternative; };
  seam.setJobSpawner(() => { const child = fakeChild(); setImmediate(() => child.emit('spawn')); return child; });
  try {
    result = await seam.toolWork({
      goal: 'audita os ficheiros por commitar nesta worktree',
      agent: 'cc', worktree: WT, wave: 'onda1-deictico', prepare: false,
    });
    assert.strictEqual(result.erro, 'sem_worktree_viavel', JSON.stringify(result));
    assert.strictEqual(pickerCalls, 0, 'um goal dêictico chegou ao picker de relocalização');
    assert.deepStrictEqual(result.faz_assim, [
      'espera que um dos jobs acima termine',
      'mooter_cancel(sweep:true) — se forem órfãos de um reinício',
      'mooter_work({…, create_worktree:true}) — crio uma pasta nova a partir da branch actual',
    ]);
    const event = seam.ledgerRead().find((item) => item.event === 'relocacao_recusada'
      && item.wave === 'onda1-deictico');
    assert.ok(event, 'a recusa não ficou no ledger');
    assert.strictEqual(event.relocacao_recusada.goal_deictico, true);
    assert.ok(event.relocacao_recusada.porque);
  } finally {
    await closeJob(result, 1);
    wtModule.firstFree = originalFirstFree;
    seam.ledgerAppend({
      job_id: 'ocupante-deictico', wave: 'onda1-deictico', agent: 'cc',
      worktree: WT, event: 'failed', exit_code: 'fim-do-teste',
    });
  }
});

test('goal sem dêictico continua a relocalizar e nomeia origem e destino no resumo', async () => {
  const alternative = makeWorktree('frugal-wt-relocacao-alt');
  const originalFirstFree = wtModule.firstFree;
  let result = null;
  seam.ledgerAppend({
    job_id: 'ocupante-relocacao', wave: 'onda1-relocacao', agent: 'cc',
    worktree: WT, event: 'started',
  });
  wtModule.firstFree = () => alternative;
  seam.setJobSpawner(() => { const child = fakeChild(); setImmediate(() => child.emit('spawn')); return child; });
  try {
    result = await seam.toolWork({
      goal: 'audita o estado do projecto',
      agent: 'cc', worktree: WT, wave: 'onda1-relocacao', prepare: false,
    });
    assert.ok(result.job_id, JSON.stringify(result));
    assert.strictEqual(result.relocated, true);
    assert.strictEqual(result.worktree_usada, alternative);
    assert.match(result.resumo, new RegExp(' · relocado para ' + path.basename(alternative)
      + ' \\(pedida: ' + path.basename(WT) + '\\)'));
  } finally {
    await closeJob(result, 1);
    wtModule.firstFree = originalFirstFree;
    seam.ledgerAppend({
      job_id: 'ocupante-relocacao', wave: 'onda1-relocacao', agent: 'cc',
      worktree: WT, event: 'failed', exit_code: 'fim-do-teste',
    });
  }
});

test('dispatch: guard-first, ledger dispatched→started→done, cost do CC json, collect idempotente', async () => {
  let spawned = null;
  seam.setJobSpawner((cmd, cwd) => { spawned = { cmd, cwd }; const c = fakeChild(); setImmediate(() => c.emit('spawn')); return c; });

  const localDecisao = {
    local: false, porque: 'a tarefa exige rigor de nuvem', confianca: 'alta', forcado_por_quota: false,
  };
  const d = await seam.toolDispatch({ agent: 'cc', worktree: WT, masterprompt: MP, wave: 'm1',
    allowedTools: 'Read', __local_decisao: localDecisao });
  assert.ok(d.job_id, JSON.stringify(d));
  assert.strictEqual(path.resolve(spawned.cwd), path.resolve(WT));
  assert.ok(spawned.cmd.bin === 'claude' && spawned.cmd.args.includes('--output-format'));
  const dispatchedEv = seam.ledgerRead().find((e) => e.job_id === d.job_id && e.event === 'dispatched');
  assert.deepStrictEqual(dispatchedEv.local_decisao, localDecisao);

  // masterprompt landed in the job dir; CLI is pointed at the file, not inline
  const jobDir = path.join(process.env.MOOTER_HOME, 'jobs', d.job_id);
  assert.strictEqual(fs.readFileSync(path.join(jobDir, 'masterprompt.md'), 'utf8'), MP);
  assert.ok(spawned.cmd.args.some((a) => String(a).includes('masterprompt.md')));

  // simulate CC writing its json result, then closing 0
  // (wait a tick first: the module's WriteStream open() truncates out.log async)
  await new Promise((r) => setTimeout(r, 30));
  fs.writeFileSync(path.join(jobDir, 'out.log'), JSON.stringify({ result: 'ok', total_cost_usd: 0.0123, session_id: 'sess-1' }));
  const liveStatus = await seam.toolStatus({ job_id: d.job_id });
  assert.ok(liveStatus.jobs[0].estimativa, 'mooter_check perdeu o bloco estimativa do job vivo');
  assert.strictEqual(liveStatus.jobs[0].estimativa.falta_s.valor, null,
    'sem histórico suficiente, o check inventou uma duração');
  const reg = seam.REGISTRY.get(d.job_id);
  reg.child.emit('close', 0);
  await new Promise((r) => setTimeout(r, 20));

  const evs = seam.ledgerRead().filter((e) => e.job_id === d.job_id).map((e) => e.event);
  assert.deepStrictEqual(evs, ['dispatched', 'started', 'done']);
  const doneEv = seam.ledgerRead().find((e) => e.job_id === d.job_id && e.event === 'done');
  assert.strictEqual(doneEv.cost_usd, 0.0123);
  assert.strictEqual(typeof doneEv.duration_s, 'number');
  assert.strictEqual(doneEv.desfecho, 'entregue');
  assert.strictEqual(doneEv.ttft_ms, null, 'sem conteúdo observado no stream tem de ser null, nunca 0');
  assert.ok(doneEv.mp_hash && doneEv.mp_hash.length === 64);
  const etaState = JSON.parse(fs.readFileSync(path.join(process.env.MOOTER_HOME, 'eta-index.json'), 'utf8'));
  const etaSample = Object.values(etaState.chaves)
    .flatMap((entry) => entry._observacoes || [])
    .find((sample) => sample.job_id === d.job_id);
  assert.ok(etaSample && etaSample.bytes_finais > 0,
    'o fecho do job não guardou bytes_finais na mesma amostra ETA');

  // status
  const st = await seam.toolStatus({ job_id: d.job_id });
  assert.strictEqual(st.jobs[0].last, 'done');
  assert.strictEqual(st.jobs[0].alive, false);

  // collect (1ª vez) + idempotência
  const c1 = await seam.toolCollect({ job_id: d.job_id });
  assert.strictEqual(c1.result, 'ok');
  assert.strictEqual(c1.cost_usd, 0.0123);
  assert.strictEqual(c1.session_id, 'sess-1');
  const c2 = await seam.toolCollect({ job_id: d.job_id });
  assert.ok(c2.idempotent.includes('já tinha'));
  const collected = seam.ledgerRead().filter((e) => e.job_id === d.job_id && e.event === 'collected');
  assert.strictEqual(collected.length, 1, 'collected não pode duplicar');
});

test('posse: worktree com job ativo é recusada até o job terminar', async () => {
  seam.setJobSpawner(() => { const c = fakeChild(); setImmediate(() => c.emit('spawn')); return c; });
  const WT2 = path.join(TMP, 'frugal-wt-b');
  fs.mkdirSync(WT2, { recursive: true });
  execFileSync('git', ['init', '-q', WT2]);

  const d1 = await seam.toolDispatch({ agent: 'codex', worktree: WT2, masterprompt: MP, wave: 'm1' });
  assert.ok(d1.job_id);
  const d2 = await seam.toolDispatch({ agent: 'cc', worktree: WT2, masterprompt: MP, wave: 'm1' });
  assert.ok(d2.error && d2.reasons.some((r) => r.includes('posse')), JSON.stringify(d2));

  seam.REGISTRY.get(d1.job_id).child.emit('close', 0);
  await new Promise((r) => setTimeout(r, 20));
  const d3 = await seam.toolDispatch({ agent: 'cc', worktree: WT2, masterprompt: MP, wave: 'm1' });
  assert.ok(d3.job_id, 'worktree liberta após done: ' + JSON.stringify(d3));
  seam.REGISTRY.get(d3.job_id).child.emit('close', 1);
  await new Promise((r) => setTimeout(r, 20));
  const failed = seam.ledgerRead().find((e) => e.job_id === d3.job_id && e.event === 'failed');
  assert.strictEqual(failed.exit_code, 1);
  assert.strictEqual(failed.desfecho, 'falhou');
});

test('collect: resultado grande vem truncado com path do ficheiro completo', async () => {
  seam.setJobSpawner(() => { const c = fakeChild(); setImmediate(() => c.emit('spawn')); return c; });
  const WT3 = path.join(TMP, 'frugal-wt-c');
  fs.mkdirSync(WT3, { recursive: true });
  execFileSync('git', ['init', '-q', WT3]);
  const d = await seam.toolDispatch({ agent: 'gemini', worktree: WT3, masterprompt: MP, wave: 'm1' });
  const jobDir = path.join(process.env.MOOTER_HOME, 'jobs', d.job_id);
  await new Promise((r) => setTimeout(r, 30));
  fs.writeFileSync(path.join(jobDir, 'out.log'), 'x'.repeat(150_000));
  seam.REGISTRY.get(d.job_id).child.emit('close', 0);
  await new Promise((r) => setTimeout(r, 20));
  const c = await seam.toolCollect({ job_id: d.job_id });
  assert.strictEqual(c.truncated, true);
  assert.ok(c.full_path && c.full_path.includes(d.job_id));
  assert.ok(c.result.length < 10_000);
});

test('collect antes do fim: devolve estado, não resultado', async () => {
  seam.setJobSpawner(() => { const c = fakeChild(); setImmediate(() => c.emit('spawn')); return c; });
  const WT4 = path.join(TMP, 'frugal-wt-d');
  fs.mkdirSync(WT4, { recursive: true });
  execFileSync('git', ['init', '-q', WT4]);
  const d = await seam.toolDispatch({ agent: 'cc', worktree: WT4, masterprompt: MP, wave: 'm2' });
  const c = await seam.toolCollect({ job_id: d.job_id });
  assert.ok(c.note && c.note.includes('não terminou'));
  seam.REGISTRY.get(d.job_id).child.emit('close', 0);
});

test('prep que excede o timeout despacha o chain directo e regista prep_timeout', async () => {
  const wtPrep = path.join(TMP, 'frugal-wt-prep-timeout');
  fs.mkdirSync(wtPrep, { recursive: true });
  execFileSync('git', ['init', '-q', wtPrep]);
  const originalRunLocal = moo.runLocal;
  process.env.MOOTER_PREP_TIMEOUT_MS = '30';
  const cloud = [];
  try {
    moo.runLocal = () => { const child = fakeChild(); setImmediate(() => child.emit('spawn')); return child; };
    seam.setJobSpawner(() => {
      const child = fakeChild();
      cloud.push(child);
      setImmediate(() => child.emit('spawn'));
      return child;
    });
    const prep = await seam.toolDispatch({
      agent: 'moo', worktree: wtPrep, masterprompt: MP, wave: 'prep-timeout', model: 'qwen-test',
      __chain: { agent: 'cc', worktree: wtPrep, masterprompt: MP, wave: 'prep-timeout', model: 'claude-sonnet' },
    });
    await waitUntil(() => seam.ledgerRead().some((e) => e.job_id === prep.job_id && e.event === 'prep_timeout'));
    await waitUntil(() => seam.ledgerRead().some((e) => e.agent === 'cc' && e.prep_from === prep.job_id && e.event === 'dispatched'));

    const timedOut = seam.ledgerRead().find((e) => e.job_id === prep.job_id && e.event === 'prep_timeout');
    assert.ok(timedOut.note.includes('preparação local excedeu 0.03s — fui directo'));
    assert.strictEqual(typeof timedOut.prep_duration_s, 'number');
    assert.strictEqual(typeof timedOut.prep_chars, 'number');
    assert.strictEqual(typeof timedOut.tokens_poupados_estimados, 'number');
    assert.strictEqual(timedOut.tokens_poupados_estimados, 0, 'uma preparação descartada não poupou tokens');
    const collected = await seam.toolCollect({ job_id: prep.job_id });
    assert.ok(collected.note.includes('fui directo'), JSON.stringify(collected));
    assert.strictEqual(cloud.length, 1, 'o chain pago deve ser despachado exactamente uma vez');
  } finally {
    for (const [, live] of seam.REGISTRY) live.child.emit('close', 1);
    moo.runLocal = originalRunLocal;
    delete process.env.MOOTER_PREP_TIMEOUT_MS;
  }
});

test('prep que falha despacha o chain directo e regista prep_failed_fallback', async () => {
  const wtPrep = path.join(TMP, 'frugal-wt-prep-failed');
  fs.mkdirSync(wtPrep, { recursive: true });
  execFileSync('git', ['init', '-q', wtPrep]);
  const originalRunLocal = moo.runLocal;
  const cloud = [];
  try {
    moo.runLocal = () => { const child = fakeChild(); setImmediate(() => child.emit('spawn')); return child; };
    seam.setJobSpawner(() => {
      const child = fakeChild();
      cloud.push(child);
      setImmediate(() => child.emit('spawn'));
      return child;
    });
    const prep = await seam.toolDispatch({
      agent: 'moo', worktree: wtPrep, masterprompt: MP, wave: 'prep-failed', model: 'qwen-test',
      __chain: { agent: 'cc', worktree: wtPrep, masterprompt: MP, wave: 'prep-failed', model: 'claude-sonnet' },
    });
    seam.REGISTRY.get(prep.job_id).child.emit('close', 7);
    await waitUntil(() => seam.ledgerRead().some((e) => e.job_id === prep.job_id && e.event === 'prep_failed_fallback'));
    await waitUntil(() => seam.ledgerRead().some((e) => e.agent === 'cc' && e.prep_from === prep.job_id && e.event === 'dispatched'));

    const fallback = seam.ledgerRead().find((e) => e.job_id === prep.job_id && e.event === 'prep_failed_fallback');
    assert.strictEqual(fallback.exit_code, 7);
    assert.ok(fallback.note.includes('a preparação local falhou (exit 7) — fui directo'));
    assert.strictEqual(fallback.tokens_poupados_estimados, 0, 'uma preparação falhada não poupou tokens');
    const collected = await seam.toolCollect({ job_id: prep.job_id });
    assert.ok(collected.note.includes('exit 7'), JSON.stringify(collected));
    assert.strictEqual(cloud.length, 1, 'o chain pago deve ser despachado exactamente uma vez');
  } finally {
    for (const [, live] of seam.REGISTRY) live.child.emit('close', 1);
    moo.runLocal = originalRunLocal;
  }
});

test('server-seamless: regista as 4 tools no registry do server.js base', () => {
  const base = require('./server.js');
  require('./server-seamless.js');
  const names = base.TOOLS.map((t) => t.name);
  for (const n of ['mooter_route', 'mooter_dispatch', 'mooter_status', 'mooter_collect']) {
    assert.ok(names.includes(n), n + ' ausente');
  }
  for (const t of base.TOOLS) {
    assert.ok(t.annotations && typeof t.annotations.title === 'string', t.name + ' sem annotation title');
    assert.ok('readOnlyHint' in t.annotations, t.name + ' sem readOnlyHint');
  }
});
