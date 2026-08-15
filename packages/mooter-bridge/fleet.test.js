'use strict';
/**
 * fleet.test.js — unit tests for the fleet snapshot that feeds the native panel.
 * Deterministic: the Ollama probe is pointed at a dead port so "local" is always
 * the unreachable path, which is the one that must degrade honestly.
 *   node --test packages/mooter-bridge/
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const TEST_HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'mooter-fleet-'));
process.env.MOOTER_HOME = TEST_HOME;
process.env.OLLAMA_HOST = '127.0.0.1:1'; // must be set before requiring fleet.js
process.on('exit', () => { try { fs.rmSync(TEST_HOME, { recursive: true, force: true }); } catch { /* */ } });

const test = require('node:test');
const assert = require('node:assert');
const fleet = require('./fleet.js');
const board = require('./board.js');
const capacidades = require('./capacidades.js');

const E = (job_id, event, extra) => Object.assign(
  { ts: '2026-07-24T17:47:11.000Z', job_id, wave: 'w1', agent: 'cc', worktree: 'C:\\repo\\wt', event },
  extra || {},
);

test('foldJobs collapses an event stream into one row per job', () => {
  const jobs = fleet.foldJobs([
    E('a', 'dispatched'), E('a', 'started'), E('a', 'done', { exit_code: 0, duration_s: 16 }),
    E('b', 'dispatched'), E('b', 'started'),
  ]);
  assert.strictEqual(jobs.length, 2);
  const a = jobs.find((j) => j.job_id === 'a');
  assert.strictEqual(a.state, 'done');
  assert.strictEqual(a.duration_s, 16);
  assert.strictEqual(jobs.find((j) => j.job_id === 'b').state, 'running');
});

test('A2 — foldJobs e publicJob preservam actor; histórico degrada para legacy', () => {
  const actor = { type: 'human', id: 'ana', origem: 'mcp-session' };
  const jobs = fleet.foldJobs([
    E('com-actor', 'dispatched', { actor }),
    E('com-actor', 'done', { exit_code: 0 }),
    E('historico', 'done', { exit_code: 0 }),
  ]);
  const declarado = jobs.find((job) => job.job_id === 'com-actor');
  const historico = jobs.find((job) => job.job_id === 'historico');

  assert.deepStrictEqual(declarado.actor, actor);
  assert.deepStrictEqual(fleet.publicJob(declarado, Date.now()).actor, actor);
  assert.deepStrictEqual(historico.actor, {
    type: 'system',
    id: 'legacy',
    origem: 'evento anterior à instrumentação de identidade (f-mu0)',
  });
});

test('A2b — o fold distingue ator DECLARADO de ator por DEFAULT (ALTO do G4)', () => {
  // sem isto, um default system/system lê-se no painel como "o sistema fez isto",
  // quando só quer dizer "ninguém declarou quem foi". Ausência disfarçada de
  // afirmação — foi o achado ALTO do crítico.
  const { PORQUE_DECLARADO, PORQUE_DEFAULT } = require('./actor.js');
  const jobs = fleet.foldJobs([
    E('declarado', 'dispatched', {
      actor: { type: 'human', id: 'ana' }, actor_porque: PORQUE_DECLARADO }),
    E('defaultado', 'dispatched', {
      actor: { type: 'system', id: 'system', origem: null }, actor_porque: PORQUE_DEFAULT }),
  ]);
  const d = jobs.find((j) => j.job_id === 'declarado');
  const s = jobs.find((j) => j.job_id === 'defaultado');

  assert.strictEqual(d.actor_porque, PORQUE_DECLARADO);
  assert.strictEqual(s.actor_porque, PORQUE_DEFAULT);
  assert.notStrictEqual(d.actor_porque, s.actor_porque,
    'se as duas projecções forem indistinguíveis, o ALTO continua aberto');
});

test('a failed job is never downgraded by a later collected event', () => {
  const jobs = fleet.foldJobs([E('c', 'started'), E('c', 'failed', { exit_code: 1 }), E('c', 'collected')]);
  assert.strictEqual(jobs[0].state, 'failed');
});

test('malformed and unknown events do not invent rows', () => {
  const jobs = fleet.foldJobs([{ ts: 'x', event: 'started' }, null, E('d', 'dispatched')]);
  assert.strictEqual(jobs.length, 1);
  assert.strictEqual(jobs[0].job_id, 'd');
});

test('elapsedSeconds counts from started when live and uses duration_s when finished', () => {
  const now = Date.parse('2026-07-24T17:47:41.000Z');
  assert.strictEqual(fleet.elapsedSeconds({ state: 'running', started_at: '2026-07-24T17:47:11.000Z' }, now), 30);
  assert.strictEqual(fleet.elapsedSeconds({ state: 'done', started_at: '2026-07-24T17:47:11.000Z', ended_at: '2026-07-24T17:47:27.000Z', duration_s: 16 }, now), 16);
});

test('elapsedSeconds returns null rather than guessing', () => {
  assert.strictEqual(fleet.elapsedSeconds({ state: 'running' }, Date.now()), null);
  assert.strictEqual(fleet.elapsedSeconds({ state: 'running', started_at: 'not-a-date' }, Date.now()), null);
});

// CONTRACT CHANGE in v1.2 — this test used to assert that a cwd match was
// enough. It is not, and the old behaviour shipped a real lie: on 2026-07-25 a
// job was labelled with the model of a session 18 HOURS older that merely
// shared the folder. A cwd match now also requires a time overlap.
test('attachModels matches worktree to session cwd when the session overlaps the job', () => {
  const jobs = [{ worktree: 'C:\\Users\\P\\frugal-w2', started_at: new Date(Date.now() - 60000).toISOString() }];
  fleet.attachModels(jobs, [{ cwd: 'c:/users/p/frugal-w2/', model: 'claude-sonnet-4-6', id: 'a1', ageMs: 55000 }]);
  assert.strictEqual(jobs[0].model, 'claude-sonnet-4-6');
  assert.strictEqual(jobs[0].session_id, 'a1');
});

test('attachModels refuses a same-folder session from another hour', () => {
  const jobs = [{ worktree: 'C:\\Users\\P\\frugal-w2', started_at: new Date(Date.now() - 60000).toISOString() }];
  fleet.attachModels(jobs, [{ cwd: 'c:/users/p/frugal-w2/', model: 'claude-opus-4-8', id: 'velha', ageMs: 64992846 }]);
  assert.strictEqual(jobs[0].model, null, 'voltou a herdar o modelo de outra sessão');
});

test('attachModels leaves model null when nothing matches — never fabricates', () => {
  const jobs = [{ worktree: 'C:\\repo\\other' }];
  fleet.attachModels(jobs, [{ cwd: 'C:\\repo\\wt', model: 'x' }]);
  assert.strictEqual(jobs[0].model, null);
});

test('groupByWave keeps input order and counts live vs done per wave', () => {
  const g = fleet.groupByWave([
    { wave: 'm3', state: 'running' }, { wave: 'vs1', state: 'done' },
    { wave: 'm3', state: 'done' }, { wave: 'm3', state: 'dispatched' },
  ]);
  assert.deepStrictEqual(g.map((x) => x.wave), ['m3', 'vs1']);
  assert.strictEqual(g[0].live, 2);
  assert.strictEqual(g[0].done, 1);
  assert.strictEqual(g[0].total, 3);
});

test('groupByWave gives jobs without a wave an explicit bucket', () => {
  const g = fleet.groupByWave([{ state: 'running' }]);
  assert.strictEqual(g[0].wave, '(sem wave)');
});

test('probeOllama resolves null (not an empty list) when the daemon is unreachable', async () => {
  const r = await fleet.probeOllama(200);
  assert.strictEqual(r, null, 'null means n/d; [] would falsely claim "up with zero models"');
});

test('probeOllama parses a real /api/ps payload into the panel shape', async () => {
  const http = require('http');
  const payload = { models: [{ model: 'qwen3:30b', size_vram: 19327352832, context_length: 32768, details: { parameter_size: '30.5B', quantization_level: 'Q4_K_M' } }] };
  const srv = http.createServer((q, r) => { r.end(JSON.stringify(payload)); });
  await new Promise((res) => srv.listen(0, '127.0.0.1', res));
  const port = srv.address().port;
  process.env.OLLAMA_HOST = '127.0.0.1:' + port;
  delete require.cache[require.resolve('./fleet.js')];
  const f2 = require('./fleet.js');
  const models = await f2.probeOllama(1500);
  srv.close();
  process.env.OLLAMA_HOST = '127.0.0.1:1';
  delete require.cache[require.resolve('./fleet.js')];
  assert.strictEqual(models.length, 1);
  assert.strictEqual(models[0].model, 'qwen3:30b');
  assert.strictEqual(models[0].parameter_size, '30.5B');
  assert.strictEqual(models[0].vram_bytes, 19327352832);
  assert.strictEqual(models[0].context_length, 32768);
});

test('mooter_session_bind refuses an empty binding', async () => {
  const r = await fleet.toolSessionBind({});
  assert.ok(r.error, 'binding nothing would silently mislabel every later snapshot');
});

// ⚠️ v1.5 — o gate no Windows apanhou isto: ao preservar o contexto anterior,
// uma chamada vazia passava a "ter" projecto por herança e o guard deixava-a
// passar, re-carimbando `bound_at` sem ninguém ter declarado nada.
test('herdar não é declarar — o guard olha para ESTA chamada, não para o passado', async () => {
  const ok = await fleet.toolSessionBind({ project: 'P', folder: '/tmp' });
  assert.ok(ok.ok, ok.error);
  const vazia = await fleet.toolSessionBind({});
  assert.ok(vazia.error, 'a chamada vazia passou por herdar o que já lá estava');
  // e declarar SÓ o modelo não pode apagar o projecto que já existia
  const so = await fleet.toolSessionBind({ session_model: 'claude-opus-5' });
  assert.ok(so.ok, so.error);
  assert.strictEqual(so.context.project, 'P', 'declarar o modelo apagou o projecto');
  assert.strictEqual(so.context.session_model, 'claude-opus-5');
  assert.ok(so.context.session_model_em, 'a declaração tem de ficar com carimbo de quando foi feita');
});

test('bind parcial não substitui um bind completo e deixa recibo no ledger', async () => {
  const fullFolder = fs.mkdtempSync(path.join(TEST_HOME, 'bind-completo-'));
  const full = await fleet.toolSessionBind({ project: 'Completo', folder: fullFolder });
  assert.ok(full.ok, full.error);

  const partial = await fleet.toolSessionBind({ project: 'Parcial' });
  assert.ok(partial.error, 'bind parcial foi aceite');
  assert.strictEqual(partial.bind_recusado, 'parcial');
  assert.strictEqual(partial.ledger_registado, true);

  const preserved = fleet.readSessionContext();
  assert.strictEqual(preserved.project, 'Completo');
  assert.strictEqual(path.resolve(preserved.folder), path.resolve(fullFolder));
  const ledger = fs.readFileSync(path.join(TEST_HOME, 'ledger.jsonl'), 'utf8')
    .trim().split('\n').map((line) => JSON.parse(line));
  const rejected = ledger.find((event) => event.event === 'session_bind_rejected');
  assert.ok(rejected, 'a recusa parcial não ficou no ledger');
  assert.strictEqual(rejected.project_requested, 'Parcial');
  assert.strictEqual(rejected.folder_requested, null);
  assert.deepStrictEqual(rejected.actor, { type: 'system', id: 'system', origem: null });
  assert.match(rejected.actor_porque, /ator não declarado/i);
});

test('roots declaradas e válidas ganham ao bind manual', async () => {
  const manualFolder = fs.mkdtempSync(path.join(TEST_HOME, 'bind-manual-'));
  const rootFolder = fs.mkdtempSync(path.join(TEST_HOME, 'bind-root-'));
  const manual = await fleet.toolSessionBind({ project: 'Manual', folder: manualFolder });
  assert.ok(manual.ok, manual.error);

  capacidades.registarInitialize({
    capabilities: { roots: {} },
    roots: [{ uri: rootFolder, name: 'Projecto Root' }],
  });
  const context = fleet.readSessionContext();
  assert.strictEqual(context.project, 'Projecto Root');
  assert.strictEqual(path.resolve(context.folder), path.resolve(rootFolder));
  assert.strictEqual(context.fonte, 'mcp-capabilities.json → roots/list');
});

test('toolFleet reports local_available false instead of pretending zero models', async () => {
  const out = await fleet.toolFleet({}, { sessionsList: async () => ({ sessions: [] }) });
  assert.ok(!('local' in out), 'bloco local sem dados deve desaparecer do payload');
  assert.strictEqual(out.local_available, false);
  assert.ok('context' in out);
  assert.ok(!('waves' in out), 'lista de waves vazia deve desaparecer do payload');
  assert.ok(out.capacidades && out.capacidades.onboarding,
    'o painel não expõe a sonda de capacidades do cliente');
});

test('fleet liga uma estimativa por job vivo e lê o índice uma só vez', async (t) => {
  const ledgerPath = path.join(TEST_HOME, 'ledger.jsonl');
  const before = fs.existsSync(ledgerPath) ? fs.readFileSync(ledgerPath, 'utf8') : '';
  const now = new Date().toISOString();
  const wave = 'eta-v2-fleet-test';
  const events = ['eta-job-a', 'eta-job-b'].flatMap((jobId) => [
    E(jobId, 'dispatched', { ts: now, wave, goal: 'implementa código', prompt_chars: 2_000 }),
    E(jobId, 'started', { ts: now, wave, steps_total: 4 }),
    E(jobId, 'step', { ts: now, wave, step_index: 1, steps_total: 4 }),
  ]);
  fs.appendFileSync(ledgerPath, events.map((event) => JSON.stringify(event)).join('\n') + '\n');
  for (const jobId of ['eta-job-a', 'eta-job-b']) {
    const dir = path.join(TEST_HOME, 'jobs', jobId);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'out.log'), 'medido\n', 'utf8');
  }
  t.after(() => {
    fs.writeFileSync(ledgerPath, before, 'utf8');
    for (const jobId of ['eta-job-a', 'eta-job-b']) {
      fs.rmSync(path.join(TEST_HOME, 'jobs', jobId), { recursive: true, force: true });
    }
  });
  let indexReads = 0;
  let estimates = 0;
  const out = await fleet.toolFleet({ wave }, {
    etaReadIndex() { indexReads++; return { version: 1, chaves: {} }; },
    estimateJob(jobId) {
      estimates++;
      return { job_id: jobId, falta_s: { valor: null, porque: 'sem histórico' } };
    },
    probeOllama: async () => null,
    gpuSnapshot: async () => null,
    vaultStatus: async () => null,
    uiProbe: async () => null,
    quotaEstado: async () => null,
    worktreesList: async () => null,
    sessionsList: async () => ({ sessions: [] }),
  });
  assert.strictEqual(indexReads, 1);
  assert.strictEqual(estimates, 2);
  assert.strictEqual(out.jobs.length, 2);
  assert.deepStrictEqual(out.jobs.map((job) => job.estimativa.job_id).sort(), ['eta-job-a', 'eta-job-b']);
});

test('view board usa o scorecard assíncrono sem correr as sondas da frota', async () => {
  let chamadas = 0;
  const scorecard = { metricas: {}, excepcoes: [], pode_ir_dormir: { valor: true } };
  const out = await fleet.toolFleet({ view: 'board' }, {
    async boardScorecard() { chamadas++; return scorecard; },
    probeOllama() { throw new Error('a vista board não deve sondar Ollama'); },
  });
  assert.strictEqual(chamadas, 1);
  assert.strictEqual(out.scorecard, scorecard);
  assert.deepStrictEqual(out.excepcoes, []);
});

test('view afericao sem histórico devolve n/d com porquê', async () => {
  const out = await fleet.toolFleet({ view: 'afericao' }, {
    afericaoLatest() {
      return { estado: 'n/d', porque: 'nunca foi guardada uma aferição nesta máquina' };
    },
    ledgerRead() {
      return [
        { event: 'done', job_id: 'capturado', agent: 'codex' },
        { event: 'done', job_id: 'perdido', agent: 'codex' },
      ];
    },
    etaReadIndex() {
      return {
        version: 1,
        chaves: {
          'codex|codigo|<4k': { _observacoes: [{ job_id: 'capturado' }], _timeouts: [] },
        },
      };
    },
    probeOllama() { throw new Error('a vista aferição não deve sondar Ollama'); },
  });
  assert.strictEqual(out.estado, 'n/d');
  assert.strictEqual(out.afericao, null);
  assert.match(out.porque, /nunca foi guardada/i);
  assert.deepStrictEqual(out.captura_por_agente, [{
    agente: 'codex', done_no_ledger: 2, observacoes_no_indice: 1,
    recusas_no_ledger: 0, taxa_captura_pct: 50, porque: null,
  }]);
});

test('o painel responde em menos de 2s quando uma sonda fica pendurada', async () => {
  const started = Date.now();
  const out = await fleet.toolFleet({}, {
    probeOllama: () => new Promise(() => {}),
    gpuSnapshot: async () => null,
    vaultStatus: async () => null,
    uiProbe: async () => null,
    quotaEstado: async () => null,
    worktreesList: async () => null,
    sessionsList: async () => ({ sessions: [] }),
  });
  const elapsed = Date.now() - started;
  assert.ok(elapsed < 2000, 'uma sonda pendurada segurou o painel por ' + elapsed + 'ms');
  assert.ok(!('local' in out), 'a sonda pendurada deve degradar removendo o bloco sem dados');
});

test('sondas cedem o ciclo antes de trabalho síncrono', async () => {
  let lifecycleAdvanced = false;
  let quotaSawLifecycle = false;
  setImmediate(() => { lifecycleAdvanced = true; });

  await fleet.toolFleet({}, {
    probeOllama: () => null,
    gpuSnapshot: () => null,
    vaultStatus: () => null,
    uiProbe: () => null,
    quotaEstado: () => { quotaSawLifecycle = lifecycleAdvanced; return null; },
    worktreesList: () => null,
    sessionsList: () => ({ sessions: [] }),
  });

  assert.strictEqual(quotaSawLifecycle, true,
    'uma sonda síncrona arrancou antes dos callbacks de lifecycle já pendentes');
});

test('an unexpanded ${VAR} placeholder is treated as unset, not as a hostname', () => {
  process.env.MOOTER_TEST_VAR = '${MOOTER_TEST_VAR}';
  assert.strictEqual(fleet.envOrNull('MOOTER_TEST_VAR'), null, 'a literal placeholder would silently kill the probe');
  process.env.MOOTER_TEST_VAR = '  ';
  assert.strictEqual(fleet.envOrNull('MOOTER_TEST_VAR'), null);
  process.env.MOOTER_TEST_VAR = ' 127.0.0.1:9 ';
  assert.strictEqual(fleet.envOrNull('MOOTER_TEST_VAR'), '127.0.0.1:9');
  delete process.env.MOOTER_TEST_VAR;
});

test('the UI resource carries the exact MCP Apps contract', () => {
  assert.strictEqual(fleet.UI_MIME, 'text/html;profile=mcp-app');
  assert.strictEqual(fleet.UI_RESOURCE.uri, 'ui://mooter/fleet');
  assert.strictEqual(fleet.UI_RESOURCE.mimeType, fleet.UI_MIME);
  assert.ok(fleet.UI_RESOURCE._meta.ui.csp, 'resource must declare its CSP');
});

test('both tools are exported and mooter_fleet declares its UI', () => {
  const names = fleet.TOOLS.map((t) => t.name);
  assert.deepStrictEqual(names, ['mooter_fleet', 'mooter_session_bind']);
  const t = fleet.TOOLS[0];
  assert.strictEqual(t._meta.ui.resourceUri, 'ui://mooter/fleet');
  assert.deepStrictEqual(t._meta.ui.visibility, ['model', 'app']);
  assert.strictEqual(t._meta['ui/resourceUri'], 'ui://mooter/fleet');
  assert.strictEqual(t.annotations.readOnlyHint, true);
});

test('the panel html is self-contained and speaks the app protocol', () => {
  const html = fleet.readUiHtml();
  assert.ok(html.length > 1000);
  /**
   * ⚠️ CONTRACT CHANGE na v1.5 — a regra ficou MAIS apertada, não menos.
   *
   * Antes: "nenhum URL, ponto final". Agora o painel embebe o teu servidor de
   * preview local, por isso `localhost` é legítimo — e tudo o resto passa a ser
   * proibido explicitamente, com o teste a dizer qual foi o intruso. Um painel
   * que mostra o teu código e envia prompts em teu nome não pode ganhar a
   * capacidade de falar para a internet por distracção de quem edita o HTML.
   */
  const urls = html.match(/https?:\/\/[^\s"'`<>)]+/g) || [];
  const forasteiros = urls.filter((u) => !/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?/.test(u));
  assert.deepStrictEqual(forasteiros, [],
    'o painel só pode falar para localhost — estes URL não são locais: ' + forasteiros.join(', '));
  assert.ok(html.includes('color-scheme: light dark'), 'without this the iframe canvas is white in dark mode');
  assert.ok(html.includes('ui/initialize'));
  assert.ok(html.includes('ui/notifications/tool-result'));
  // CONTRACT CHANGE in v1.2: money is now ON PURPOSE. "Não consigo ver quantos
  // tokens em tempo real por LLM" was the complaint; a cockpit that hides the
  // meter is not honest, it is just quiet.
  assert.ok(html.includes('tok/s'), 'the panel must show measured throughput');
  assert.ok(html.includes('<svg'), 'the cow must exist — inline, because the default CSP allows no external image');
  assert.ok(html.includes('ui/message'), 'the panel must be able to act, not only display');
  assert.ok(html.includes('--color-text-primary'), 'must use the host theme variables');
  // v1.5 — a cabine é UM bloco, e as quatro secções têm de lá estar
  for (const id of ['s-trab', 's-saldo', 's-cab', 'conduz']) {
    assert.ok(html.includes(id), 'falta a secção ' + id + ' — a cabine deixou de ser um bloco só');
  }
  assert.ok(html.includes('mooter_ui_probe'), 'sem a sonda, o suporte a Live Preview volta a ser suposição');
  assert.ok(/n\/d/.test(html), 'o painel tem de saber escrever n/d');
});

function unexplainedNulls(value, pathPrefix, parent) {
  const pathNow = pathPrefix || '$';
  if (value === null) {
    const explained = parent && ['porque', 'base', 'reason', 'nota']
      .some((key) => typeof parent[key] === 'string' && parent[key].trim());
    return explained ? [] : [pathNow];
  }
  if (!value || typeof value !== 'object') return [];
  const out = [];
  if (Array.isArray(value)) {
    value.forEach((item, index) => out.push(...unexplainedNulls(item, pathNow + '[' + index + ']', value)));
  } else {
    for (const [key, item] of Object.entries(value)) {
      out.push(...unexplainedNulls(item, pathNow + '.' + key, value));
    }
  }
  return out;
}

test('L1(a) — dois jobs cloud sem custo produzem n/d, nunca zero', () => {
  const aggregate = fleet.aggregatePanel([
    { job_id: 'codex-1', agent: 'codex', state: 'done' },
    { job_id: 'codex-2', agent: 'codex', state: 'done' },
  ]);
  assert.strictEqual(aggregate.totals.cost_usd.valor, null);
  assert.strictEqual(aggregate.totals.cost_usd.jobs_medidos, 0);
  assert.strictEqual(aggregate.totals.cost_usd.jobs_sem_medicao, 2);
  assert.match(aggregate.totals.cost_usd.porque, /nenhum.*custo|sem custo/i);
  assert.strictEqual(aggregate.totals.cloud_in.valor, null,
    'dois jobs reais sem tokens medidos não podem virar cloud_in=0');
});

test('L1(b) — totals e arvore.resumo partilham a mesma agregação', () => {
  const aggregate = fleet.aggregatePanel([
    { job_id: 'cloud', agent: 'codex', tokens_in: 12, tokens_out: 7, cost_usd: 0.25 },
    { job_id: 'local', agent: 'moo', tokens_in: 5, tokens_out: 3 },
  ]);
  assert.strictEqual(aggregate.totals.cost_usd, aggregate.arvore_resumo.custo_usd);
  assert.strictEqual(aggregate.totals.cloud_out, aggregate.arvore_resumo.tokens_nuvem);
  assert.strictEqual(aggregate.totals.local_out, aggregate.arvore_resumo.tokens_local);
  /**
   * ⚠️ Auditoria E2E 2026-08-01 — este assert TRANCAVA o bug.
   *
   * Afirmava `local_share` (contagem de JOBS) === `quota_local_pct`, que a UI
   * mostra debaixo de «dos tokens sairam da tua GPU». Igualar uma métrica de
   * jobs a um campo rotulado como tokens é exactamente a conflação que a G12 do
   * MEO_GAUNTLET existe para apanhar. Precedente ondaA: não se relaxa um teste
   * sem estabelecer quem está errado — aqui é o teste, e a prova é o rótulo.
   *
   * O invariante certo: `quota_local_pct` acompanha a métrica por TOKENS, e a
   * contagem de jobs tem campo próprio.
   */
  assert.strictEqual(aggregate.totals.local_share_tokens_saida, aggregate.arvore_resumo.quota_local_pct);
  assert.strictEqual(aggregate.totals.local_share, aggregate.arvore_resumo.quota_local_jobs_pct);
});

test('L1(c) — o payload não contém null sem porquê', () => {
  const aggregate = fleet.aggregatePanel([{ job_id: 'x', agent: 'codex' }]);
  const payload = fleet.compactPayload({
    totals: aggregate.totals,
    arvore: { resumo: aggregate.arvore_resumo },
    sessao: { modelo: { valor: null, porque: 'o host não declarou o modelo' } },
    poupanca: { usd: null, base: 'sem tokens locais medidos' },
    bloco_vazio: [],
    campo_sem_dados: null,
  });
  assert.deepStrictEqual(unexplainedNulls(payload), []);
});

test('L1(c) — o retrato real também passa a varredura recursiva', async () => {
  const measuredAt = new Date().toISOString();
  const out = await fleet.toolFleet({}, {
    probeOllama: () => [],
    gpuSnapshot: () => ({ available: false, reason: 'GPU não detectada' }),
    vaultStatus: () => ({ available: false, reason: 'vault não detectado' }),
    uiProbe: () => ({ veredicto: { estado: 'desconhecido', porque: 'sem sonda' }, relatorio: { at: measuredAt } }),
    quotaEstado: () => ({ medida: { disponivel: false, porque: 'sem sessões locais' } }),
    worktreesList: () => fleet.summarizeWorktrees([]),
    sessionsList: () => ({ sessions: [] }),
    capabilityState: () => ({ medido_em: measuredAt, onboarding: { estado: 'n/d', porque: 'sem initialize' } }),
  });
  assert.deepStrictEqual(unexplainedNulls(out), []);
  for (const key of ['live_preview', 'capacidades', 'gpu', 'vault', 'combustivel', 'sessao']) {
    assert.ok(out[key] && 'medido_em' in out[key] && 'fresco' in out[key] && 'idade_h' in out[key],
      key + ' ficou sem metadados de frescura');
  }
});

test('L1(d) — medição com uma hora fica stale e leva idade exacta', () => {
  const now = Date.parse('2026-07-27T12:00:00.000Z');
  const measuredAt = '2026-07-27T11:00:00.000Z';
  const block = fleet.addFreshness({ estado: 'medido' }, measuredAt, now, 15);
  assert.strictEqual(block.medido_em, measuredAt);
  assert.strictEqual(block.fresco, false);
  assert.strictEqual(block.idade_h, 1);
});

test('L1(d) — cada bloco stale mostra a idade ao lado do valor no painel', () => {
  const html = fleet.readUiHtml();
  for (const expression of ['idade(s)', 'idade(g)', 'idade(cb)', 'idade(v)',
    'idade(d.capacidades)', 'idade(d.live_preview)']) {
    assert.ok(html.includes(expression), expression + ' não está visível no painel');
  }
});

test('L1(e) — arrastar fecha exactamente em 100,0%', () => {
  const percentages = fleet.closePercentages({
    releitura: 53.4, regravacao: 22.1, resposta: 21.4, pergunta: 3.2,
  });
  const total = Object.values(percentages).reduce((sum, value) => sum + value, 0);
  assert.strictEqual(Number(total.toFixed(1)), 100.0);
});

test('L1(f) — free é derivado do mesmo busy e nunca excede total - ocupadas', () => {
  const inventory = fleet.summarizeWorktrees([
    { path: 'a', busy: false },
    { path: 'b', busy: false },
    { path: 'c', busy: true, busy_jobs: ['j1'] },
    { path: 'd', busy: false, detached: true },
  ]);
  // S4 — 'd' é detached: nunca é candidata a trabalho, por isso fica fora do
  // total elegível (3), mas o bruto (4) continua visível em total_bruto.
  assert.strictEqual(inventory.total.valor, 3);
  assert.strictEqual(inventory.total_bruto.valor, 4);
  assert.match(inventory.total_bruto.porque, /detached/i);
  assert.strictEqual(inventory.occupied.valor, 1);
  assert.strictEqual(inventory.free.valor, 2);
  assert.ok(inventory.free.valor <= inventory.total.valor - inventory.occupied.valor);
});

test('L1(g) — blocos vazios desaparecem do payload', () => {
  const payload = fleet.compactPayload({
    handoffs: [], sessions: [], local: [], files: [], preview_ultima: null,
    keep: { valor: 1 },
  });
  for (const key of ['handoffs', 'sessions', 'local', 'files', 'preview_ultima']) {
    assert.ok(!(key in payload), key + ' vazio sobreviveu no payload');
  }
  assert.deepStrictEqual(payload.keep, { valor: 1 });
});

test('L1(h) — coherence exclui ruído de ambiente', () => {
  const filtered = fleet.filterCoherence([
    { level: 'info', msg: 'ambiente (não é do job): rg: os error 123' },
    { level: 'aviso', msg: 'stderr: apply_patch verification failed: contexto não encontrado' },
    { level: 'aviso', msg: 'stderr: invariante de custo divergente' },
  ]);
  assert.deepStrictEqual(filtered.map((item) => item.msg), ['stderr: invariante de custo divergente']);
});

test('L1(11) — cada job publica uma só duração e explica a fonte', () => {
  const job = fleet.publicJob({
    job_id: 'j1',
    agent: 'codex',
    state: 'done',
    started_at: '2026-07-27T11:49:47.000Z',
    ended_at: '2026-07-27T12:00:00.000Z',
    duration_s: null,
    elapsed_s: 613,
  }, Date.parse('2026-07-27T12:00:00.000Z'));
  assert.ok(!('duration_s' in job));
  assert.ok(!('elapsed_s' in job));
  assert.deepStrictEqual(job.duracao_s, {
    valor: 613,
    porque: 'derivada de started_at e ended_at do ledger',
  });
  assert.ok(job.model && job.model.valor === null && job.model.porque);
  assert.ok(job.tier_motor && job.tier_motor.valor === null && job.tier_motor.porque);
});

test('L1(12) — suspeita sem item deixa de ser alerta', () => {
  const fuel = fleet.sanitizeFuel({
    medida: { longa: { suspeitas: 1, aviso_saidas: 'há um placeholder' } },
  });
  assert.ok(!('suspeitas' in fuel.medida.longa));
  assert.ok(!('aviso_saidas' in fuel.medida.longa));
});

test('L1(13) — active_wave só existe com job vivo; caso contrário há ultima_wave', () => {
  const jobs = [{ job_id: 'f1', wave: 'falhada', state: 'failed', ended_at: '2026-07-27T12:00:00.000Z' }];
  const focus = fleet.waveFocus(jobs, [{ wave: 'falhada', goal: 'não fingir actividade' }]);
  assert.strictEqual(focus.active_wave, null);
  assert.strictEqual(focus.ultima_wave.wave, 'falhada');
  assert.strictEqual(focus.ultima_wave.failed, 1);
});

/**
 * ⚠️ Um teste que fixa a versão em texto não testa nada — envelhece.
 *
 * A versão anterior deste teste exigia literalmente '1.22.0'. Ao subir para a
 * 1.23.0 ficou vermelho sem que houvesse bug nenhum: a suite passou a pedir
 * manutenção em vez de dar informação. O que interessa mesmo é o invariante da
 * Onda 1 — a versão anunciada tem de ser semver e tem de ter entrega declarada,
 * senão o conector diz "1.23.0" sem que ninguém saiba o que isso entrega.
 */
test('L1 — a versão anunciada é semver e tem entrega declarada', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, 'manifest.json'), 'utf8'));
  assert.match(manifest.version, /^\d+\.\d+\.\d+$/);
  const entregas = JSON.parse(fs.readFileSync(path.join(__dirname, 'entregas-por-versao.json'), 'utf8'));
  const minor = manifest.version.split('.').slice(0, 2).join('.');
  assert.ok(
    Object.prototype.hasOwnProperty.call(entregas, minor),
    'manifest anuncia ' + manifest.version + ' mas entregas-por-versao.json não declara ' + minor,
  );
});

test('toolFleet(view=board) tem pode_ir_dormir como chave de topo e coincide com o scorecard', async () => {
  const d = { boardScorecard: () => board.scorecard({ ledger: [], agora: '2026-07-26T23:00:00.000Z', persist: false }) };
  const result = await fleet.toolFleet({ view: 'board' }, d);
  assert.ok(Object.prototype.hasOwnProperty.call(result, 'pode_ir_dormir'), 'resposta deve ter pode_ir_dormir');
  assert.strictEqual(result.pode_ir_dormir, result.scorecard.pode_ir_dormir, 'pode_ir_dormir no topo deve ser igual ao do scorecard');
  const keys = Object.keys(result);
  const podeDormirIndex = keys.indexOf('pode_ir_dormir');
  assert.ok(podeDormirIndex >= 0 && podeDormirIndex < 3, 'pode_ir_dormir deve estar entre as primeiras chaves da resposta');
});
