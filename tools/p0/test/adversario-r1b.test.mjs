// Um teste por ataque aplicado da sub-ronda r1b do adversário codex (tools/p0/adversario-codex-r1.md).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { medir, listarTranscripts, resumoMarkdown, sondar, invocaRouterExecute, sha12 } from '../medir-p0.mjs';
import { criarReceptor } from '../otel-receptor.mjs';
import { agregarLogs, agregarMetricas } from '../otel-agregar.mjs';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const hint = (tier, sub) => `<router-hint>\ntier: ${tier}\nsuggested_subagent: ${sub}\nconfidence: 0.8\n</router-hint>`;
const T = (s) => new Date(Date.UTC(2026, 8, 25, 12, 0, s)).toISOString();
let n = 0;
const P = (s, text, extra = {}) => ({ type: 'user', uuid: 'p' + n++, parentUuid: null, sessionId: 'S', timestamp: T(s), isSidechain: false, message: { content: text }, ...extra });
const H = (s, parent, text, extra = {}) => ({ type: 'attachment', uuid: 'h' + n++, parentUuid: parent, sessionId: 'S', timestamp: T(s), isSidechain: false, attachment: { type: 'hook_success', hookEvent: 'UserPromptSubmit', content: text }, ...extra });
const R = (s, parent, { model = 'claude-opus-5-5', tools = [], id, req, usage, extra = {} } = {}) => {
  const k = n++;
  return { type: 'assistant', uuid: 'r' + k, parentUuid: parent, sessionId: 'S', timestamp: T(s), isSidechain: false, requestId: req === undefined ? 'q' + k : req,
    message: { id: id === undefined ? 'm' + k : id, model, content: tools.map((t, i) => ({ type: 'tool_use', id: 'tu' + k + '_' + i, name: t.name, input: t.input })), usage: usage || { input_tokens: 1, output_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } }, ...extra };
};
const agente = (sub) => [{ name: 'Agent', input: { subagent_type: sub } }];
function dirCom(ficheiros, metas = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'p0r1b-'));
  for (const [rel, linhas] of Object.entries(ficheiros)) {
    const f = path.join(dir, rel); fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, linhas.map((l) => JSON.stringify(l)).join('\n') + '\n');
  }
  for (const [rel, meta] of Object.entries(metas)) fs.writeFileSync(path.join(dir, rel), JSON.stringify(meta));
  return dir;
}
const medirDir = async (dir) => medir(listarTranscripts(dir));

// ── (a) ───────────────────────────────────────────────────────────────────────────────────────
test('A22: hint pendente sem cadeia não passa para um prompt que TEM cadeia', async () => {
  const p1 = P(0, 'um'); const r1 = R(1, p1.uuid, {});
  const h = H(2, null, hint('T1', 'cheap-triage'));
  const p2 = P(3, 'dois', { parentUuid: r1.uuid }); const r2 = R(4, p2.uuid, { tools: agente('cheap-triage') });
  const r = await medirDir(dirCom({ 'proj/S.jsonl': [p1, r1, h, p2, r2] }));
  assert.equal(r.aderencia.prompts_com_hint, 0);
});

test('A23: resumo de continuação em texto é barreira (não herda o prompt anterior)', async () => {
  const p1 = P(0, 'um'); const h1 = H(1, p1.uuid, hint('T1', 'cheap-triage')); const r1 = R(2, h1.uuid, {});
  const c = P(3, 'This session is being continued from a previous conversation that ran out of context.', { parentUuid: r1.uuid });
  const r2 = R(4, c.uuid, { tools: agente('cheap-triage') });
  const r = await medirDir(dirCom({ 'proj/S.jsonl': [p1, h1, r1, c, r2] }));
  assert.equal(r.aderencia.prompts_humanos, 1);
  assert.equal(r.aderencia.categorias.ignorou, 1);
  assert.equal(r.aderencia.categorias.seguiu, 0);
});

test('A24: uma linha sidechain não serve de ponte na cadeia', async () => {
  const p = P(0, 'x'); const s = P(1, 'tarefa do subagente', { parentUuid: p.uuid, isSidechain: true });
  const h = H(2, s.uuid, hint('T1', 'cheap-triage')); const r1 = R(3, h.uuid, { tools: agente('cheap-triage') });
  const r = await medirDir(dirCom({ 'proj/S.jsonl': [p, s, h, r1] }));
  assert.equal(r.aderencia.prompts_com_hint, 0);
  assert.equal(r.fonte.hints_sem_dono, 1);
});

test('A25: hint gravado ANTES do seu prompt (hook_success ← user) é atribuído; ordem física não muda nada', async () => {
  const p = P(0, 'x'); const h = H(1, p.uuid, hint('T1', 'cheap-triage')); const r1 = R(2, h.uuid, { tools: agente('cheap-triage') });
  const antes = await medirDir(dirCom({ 'proj/S.jsonl': [h, p, r1] }));
  assert.equal(antes.aderencia.prompts_com_hint, 1);
  assert.equal(antes.aderencia.categorias.seguiu, 1);
  const x = { type: 'attachment', uuid: 'X' + n++, parentUuid: p.uuid, sessionId: 'S', timestamp: T(1), attachment: { type: 'hook_system_message', content: 'ok' } };
  const h2 = H(2, x.uuid, hint('T1', 'cheap-triage')); const r2 = R(3, h2.uuid, { tools: agente('cheap-triage') });
  const a = await medirDir(dirCom({ 'proj/S.jsonl': [p, h2, x, r2] }));
  const b = await medirDir(dirCom({ 'proj/S.jsonl': [p, x, h2, r2] }));
  assert.deepEqual(a.aderencia.categorias, b.aderencia.categorias);
  assert.equal(a.aderencia.categorias.seguiu, 1);
});

test('A26: host de um turno copiado = 1.º pedido por tempo, em qualquer ordem de leitura', async () => {
  const p = P(0, 'x'); const h = H(1, p.uuid, hint('T1', 'cheap-triage'));
  const dir = dirCom({ 'proj/A.jsonl': [p, h, R(10, h.uuid, { model: 'claude-opus-5-5' })], 'proj/B.jsonl': [p, h, R(5, h.uuid, { model: 'claude-haiku-4-5' })] });
  const fs_ = listarTranscripts(dir);
  for (const ordem of [fs_, [...fs_].reverse()]) {
    const r = await medir(ordem);
    assert.equal(r.aderencia.categorias.ja_no_tier, 1);
  }
});

test('A28: router-execute — só invocação real e nome exacto; caminhos com espaços contam', () => {
  for (const c of ['echo node /tmp/router-execute.js', 'node /tmp/not-router-execute.js', 'printf "%s" node router-execute.js'])
    assert.equal(invocaRouterExecute(c), false, c);
  // mordidas reais medidas nos transcripts (forma normalizada): testes, sed e git show NÃO contam; env + timeout conta
  for (const c of ['cd x && node --test --test-force-exit router-execute.test.js 2>&1 | tail -5', 'cd x && sed -n 1,5p tools/router/router-execute.js', 'git show HEAD:tools/router/router-execute.js | cat -n'])
    assert.equal(invocaRouterExecute(c), false, c);
  for (const c of ['node "C:\\Users\\Paulo Loureiro\\router-execute.js" --pin-model=x', '& node "C:\\x y\\router-execute.js"', 'node router-execute --a',
    'cd x && echo a; MOOTER_PER_ATTEMPT_TIMEOUT_MS=120000 timeout 140 node tools/router/router-execute.js --pin-provider=codex'])
    assert.equal(invocaRouterExecute(c), true, c);
});

// ── (b) ───────────────────────────────────────────────────────────────────────────────────────
test('A29: linha só com requestId reconcilia com a linha que traz os dois ids', async () => {
  const p = P(0, 'x');
  const u = (o) => ({ input_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, output_tokens: o });
  const r = await medirDir(dirCom({ 'proj/S.jsonl': [p,
    R(1, p.uuid, { id: null, req: 'reqA', usage: u(8) }), R(2, p.uuid, { id: 'msgA', req: 'reqA', usage: u(10) }), R(3, p.uuid, { id: 'msgA', req: null, usage: u(9) }), R(4, p.uuid, { id: null, req: 'reqA', usage: u(7) }),
  ] }));
  assert.equal(r.tokens.total.pedidos, 1);
  assert.equal(r.tokens.total.output, 10);
});

test('A30: cópias parciais do mesmo subagente são UMA execução, com o 1.º pedido por tempo', async () => {
  const usage = (ctx) => ({ input_tokens: ctx, cache_creation_input_tokens: 0, cache_read_input_tokens: 0, output_tokens: 1 });
  const q1 = { ...R(1, null, { id: 'Q1', req: 'rq1', model: 'claude-haiku-4-5', usage: usage(100) }), isSidechain: true };
  const q2 = { ...R(2, null, { id: 'Q2', req: 'rq2', model: 'claude-haiku-4-5', usage: usage(200) }), isSidechain: true };
  const dir = dirCom({ 'projA/S/subagents/agent-z.jsonl': [q1], 'projB/S/subagents/agent-z.jsonl': [q1, q2] },
    { 'projA/S/subagents/agent-z.meta.json': { agentType: 'cheap-triage' }, 'projB/S/subagents/agent-z.meta.json': { agentType: 'cheap-triage' } });
  const fs_ = listarTranscripts(dir);
  for (const ordem of [fs_, [...fs_].reverse()]) {
    const r = await medir(ordem);
    assert.equal(r.delegacao.execucoes, 1);
    assert.equal(r.delegacao.por_tipo['cheap-triage'].contexto_1o_pedido.p50, 100);
  }
});

// ── (c) ───────────────────────────────────────────────────────────────────────────────────────
const CAMINHO = 'C:\\Users\\Fulano\\cliente-A';
test('A31/A32/A33: identificadores válidos com segredos saem como «outro», sem hash, e valores do cost-state só números', async () => {
  const p = P(0, 'x', { version: 'cliente-secreto' });
  const dir = dirCom({
    'proj/S.jsonl': [p, R(1, p.uuid, { model: 'paulo@example.pt' }), R(2, p.uuid, { model: CAMINHO }),
      { type: 'cost-state', sessionId: 'S', modelUsage: { 'claude-haiku-4-5': { inputTokens: CAMINHO, outputTokens: 'SEGREDO frase' } } }],
    'proj/S/subagents/agent-q.jsonl': [{ ...R(3, null, { model: 'claude-haiku-4-5' }), isSidechain: true }],
  }, { 'proj/S/subagents/agent-q.meta.json': { agentType: 'SEGREDO-PROMPT-NAO-PODE-SAIR' } });
  const r = await medirDir(dir);
  const s = JSON.stringify(r) + resumoMarkdown(r, 't') + JSON.stringify(await sondar(listarTranscripts(dir)));
  for (const m of ['paulo@example.pt', 'cliente-secreto', 'SEGREDO', 'Fulano', 'cliente-A', 'h:' + sha12(CAMINHO), 'h:' + sha12('paulo@example.pt')]) assert.ok(!s.includes(m), m);
  assert.equal(r.cross_check_cost_state.por_modelo['claude-haiku-4-5'].input, 0);
  assert.ok(r.tokens.por_modelo.outro, 'modelos sem forma de id agregam em «outro»');
});

test('A34: valores de atributos permitidos também têm de ter a forma certa', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'otelA34-'));
  const { servidor } = criarReceptor({ dir });
  await new Promise((r) => servidor.listen(0, '127.0.0.1', r));
  const kv = (o) => Object.entries(o).map(([key, v]) => ({ key, value: { stringValue: v } }));
  const uuid = '0b6f1c2e-3d4a-4b5c-8d9e-0f1a2b3c4d5e';
  const corpo = { resourceLogs: [{ resource: { attributes: kv({ 'session.id': 'conta-secreta', 'service.name': 'claude-code' }) }, scopeLogs: [{ scope: { name: 'cliente-secreto' }, logRecords: [
    { body: { stringValue: 'SEGREDO' }, attributes: kv({ 'event.name': 'api_request', model: 'fulano@x.pt', query_source: 'SEGREDO frase do prompt', tool_name: 'git status', 'prompt.id': uuid }) },
  ] }] }] };
  const res = await fetch(`http://127.0.0.1:${servidor.address().port}/v1/logs`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(corpo) });
  servidor.close();
  assert.equal(res.status, 200);
  const gravado = fs.readdirSync(dir).map((f) => fs.readFileSync(path.join(dir, f), 'utf8')).join('');
  for (const m of ['conta-secreta', 'cliente-secreto', 'SEGREDO', 'fulano@x.pt', 'git status']) assert.ok(!gravado.includes(m), m);
  assert.ok(gravado.includes(uuid) && gravado.includes('api_request'));
});

test('A35: porta inválida sai com erro controlado, sem stack nem caminho', () => {
  for (const porta of ['65536', 'abc']) {
    const r = spawnSync(process.execPath, [path.join(AQUI, '..', 'otel-receptor.mjs'), '--porta', porta, '--dir', path.join(os.tmpdir(), 'otelA35')], { encoding: 'utf8', timeout: 10_000 });
    assert.equal(r.status, 2, porta);
    assert.ok(!/\n\s+at /.test(r.stderr) && !r.stderr.includes(AQUI), porta);
  }
});

test('A36: chaves herdadas (constructor, toString) são só chaves', async () => {
  const dir = dirCom({ 'proj/S/subagents/agent-c.jsonl': [{ ...R(1, null, { model: 'claude-haiku-4-5' }), isSidechain: true }] }, { 'proj/S/subagents/agent-c.meta.json': { agentType: 'constructor' } });
  const r = await medirDir(dir); // não lança; desde a r1d um agentType desconhecido sai como «outro»
  assert.equal(r.delegacao.por_tipo.outro.contexto_1o_pedido.n, 1);
  const kv = (o) => Object.entries(o).map(([key, v]) => ({ key, value: { stringValue: v } }));
  const l = agregarLogs([{ resourceLogs: [{ scopeLogs: [{ logRecords: [{ attributes: kv({ 'event.name': 'api_request', model: 'claude-opus-5-5', query_source: 'constructor' }) }] }] }] }]);
  assert.equal(l.por_query_source.constructor.pedidos, 1);
  const m = agregarMetricas([{ resourceMetrics: [{ scopeMetrics: [{ metrics: [{ name: 'claude_code.token.usage', sum: { dataPoints: [{ attributes: kv({ type: 'toString' }), asInt: '3' }] } }] }] }] }]);
  assert.equal(m.token_usage['toString|n/d|n/d|n/d'], 3);
});
