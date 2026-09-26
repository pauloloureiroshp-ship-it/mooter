// Um teste por ataque aplicado da sub-ronda r1c do adversário codex (tools/p0/adversario-codex-r1.md).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { medir, listarTranscripts, sondar, invocaRouterExecute, rotuloModelo } from '../medir-p0.mjs';
import { criarReceptor, sanear } from '../otel-receptor.mjs';

const hint = (tier, sub) => `<router-hint>\ntier: ${tier}\nsuggested_subagent: ${sub}\nconfidence: 0.8\n</router-hint>`;
const T = (s) => new Date(Date.UTC(2026, 8, 25, 12, 0, s)).toISOString();
let n = 0;
const P = (s, text, extra = {}) => ({ type: 'user', uuid: 'p' + n++, parentUuid: null, sessionId: 'S', timestamp: T(s), isSidechain: false, message: { content: text }, ...extra });
const H = (s, parent, text) => ({ type: 'attachment', uuid: 'h' + n++, parentUuid: parent, sessionId: 'S', timestamp: T(s), isSidechain: false, attachment: { type: 'hook_success', hookEvent: 'UserPromptSubmit', content: text } });
const R = (s, parent, { model = 'claude-opus-5-5', tools = [], id, req, usage, extra = {} } = {}) => {
  const k = n++;
  return { type: 'assistant', uuid: 'r' + k, parentUuid: parent, sessionId: 'S', timestamp: T(s), isSidechain: false, requestId: req === undefined ? 'q' + k : req,
    message: { id: id === undefined ? 'm' + k : id, model, content: tools.map((t, i) => ({ type: 'tool_use', id: 'tu' + k + '_' + i, name: t.name, input: t.input })), usage: usage || { input_tokens: 1, output_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } }, ...extra };
};
function dirCom(ficheiros, metas = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'p0r1c-'));
  for (const [rel, linhas] of Object.entries(ficheiros)) {
    const f = path.join(dir, rel); fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, linhas.map((l) => JSON.stringify(l)).join('\n') + '\n');
  }
  for (const [rel, meta] of Object.entries(metas)) fs.writeFileSync(path.join(dir, rel), JSON.stringify(meta));
  return dir;
}
const medirDir = async (dir) => medir(listarTranscripts(dir));
const usage = (ctx) => ({ input_tokens: ctx, cache_creation_input_tokens: 0, cache_read_input_tokens: 0, output_tokens: 1 });

test('A37: resposta adiada conta como resposta do turno (ordem física não muda a categoria)', async () => {
  const p1 = P(0, 'um'); const r1 = R(1, p1.uuid, {}); const h = H(2, null, hint('T1', 'cheap-triage'));
  const p2 = P(3, 'dois'); const r2 = R(4, p2.uuid, { model: 'claude-haiku-4-5' });
  const a = await medirDir(dirCom({ 'proj/S.jsonl': [r1, p1, h, p2, r2] }));
  const b = await medirDir(dirCom({ 'proj/S.jsonl': [p1, r1, h, p2, r2] }));
  assert.deepEqual(a.aderencia.categorias, b.aderencia.categorias);
  assert.equal(a.aderencia.categorias.ja_no_tier, 1);
});

test('A38: terminador de comando logo a seguir ao ficheiro ainda é invocação', () => {
  for (const c of ['node router-execute.js; echo ok', 'node router-execute.js&&echo ok', '(node router-execute.js)', 'node "C:\\x\\router-execute.js"|tail -1'])
    assert.equal(invocaRouterExecute(c), true, c);
});

test('A39: hint pendente no fim do ficheiro conta como sem dono', async () => {
  const p1 = P(0, 'um'); const r1 = R(1, p1.uuid, {}); const h = H(2, null, hint('T1', 'cheap-triage'));
  const r = await medirDir(dirCom({ 'proj/S.jsonl': [p1, r1, h] }));
  assert.equal(r.aderencia.prompts_com_hint, 0);
  assert.equal(r.fonte.hints_sem_dono, 1);
});

test('A40: o mesmo agentId em sidechain antigo e em ficheiro de subagente é UMA execução', async () => {
  const q1 = R(1, null, { id: 'Q1', req: 'rq1', model: 'claude-haiku-4-5', usage: usage(100), extra: { isSidechain: true, agentId: 'z' } });
  const q2 = R(2, null, { id: 'Q2', req: 'rq2', model: 'claude-haiku-4-5', usage: usage(200), extra: { isSidechain: true, agentId: 'z' } });
  const dir = dirCom({ 'proj/S.jsonl': [q1, q2], 'proj/S/subagents/agent-z.jsonl': [q2] }, { 'proj/S/subagents/agent-z.meta.json': { agentType: 'cheap-triage' } });
  const r = await medirDir(dir);
  assert.equal(r.tokens.total.pedidos, 2);
  assert.equal(r.delegacao.execucoes, 1);
  assert.equal(r.delegacao.contexto_1o_pedido_soma, 100);
  assert.deepEqual(Object.keys(r.delegacao.por_tipo), ['cheap-triage']);
});

test('A41: o arranque de uma execução usa a ocorrência MAIS ANTIGA de um pedido copiado', async () => {
  const q1 = (s) => R(s, null, { id: 'Q1', req: 'rq1', model: 'claude-haiku-4-5', usage: usage(100), extra: { isSidechain: true } });
  const q2 = R(2, null, { id: 'Q2', req: 'rq2', model: 'claude-haiku-4-5', usage: usage(200), extra: { isSidechain: true } });
  const dir = dirCom({ 'a/S/subagents/agent-z.jsonl': [q1(3), q2], 'b/S/subagents/agent-z.jsonl': [q1(1)] },
    { 'a/S/subagents/agent-z.meta.json': { agentType: 'cheap-triage' }, 'b/S/subagents/agent-z.meta.json': { agentType: 'cheap-triage' } });
  const fs_ = listarTranscripts(dir);
  for (const ordem of [fs_, [...fs_].reverse()]) {
    const r = await medir(ordem);
    assert.equal(r.delegacao.execucoes, 1);
    assert.equal(r.delegacao.contexto_1o_pedido_soma, 100);
  }
});

test('A42: prefixo de família não basta; caminho codificado (C--Users-…) nunca sai', async () => {
  const cod = 'C--Users-Paulo-cliente-secreto';
  for (const m of ['claude-' + cod, 'qwen-' + cod, 'gpt-' + cod]) assert.equal(rotuloModelo(m), 'outro', m);
  for (const m of ['claude-opus-4-6', 'claude-haiku-4-5-20251001', 'claude-3-5-sonnet-20241022', 'us.anthropic.claude-sonnet-4-5-20250929-v1:0', 'claude-opus-4-6[1m]', 'qwen2.5-coder:14b', 'gpt-5-codex', 'gemini-2.5-pro'])
    assert.equal(rotuloModelo(m), m, m);
  const p = P(0, 'x', { [cod]: 1 });
  const dir = dirCom({ 'proj/S.jsonl': [p, R(1, p.uuid, { model: 'claude-' + cod })] });
  const s = JSON.stringify(await medirDir(dir)) + JSON.stringify(await sondar(listarTranscripts(dir)));
  assert.ok(!s.includes('cliente-secreto'));
});

test('A43: OTel — ids de traço em hex, unidade curta, enums e nomes de tool por forma', async () => {
  const cod = 'C--Users-Paulo-cliente-secreto';
  const kv = (o) => Object.entries(o).map(([key, v]) => ({ key, value: { stringValue: v } }));
  const traces = { resourceSpans: [{ scopeSpans: [{ spans: [{ traceId: cod, spanId: 'cliente-secreto.txt', name: 'claude_code.x', attributes: kv({ query_source: cod, tool_name: 'whoami', model: 'claude-opus-5-5' }) }] }] }] };
  const s1 = JSON.stringify(sanear(traces, 'traces').corpo);
  for (const m of ['cliente-secreto', 'whoami']) assert.ok(!s1.includes(m), m);
  assert.ok(s1.includes('claude-opus-5-5'));
  // (desde a r1d, tool_name nem está na allowlist: não tem enum conhecido e o agregador não o usa)
  const bons = { resourceSpans: [{ scopeSpans: [{ spans: [{ traceId: 'a'.repeat(32), spanId: 'b'.repeat(16), attributes: kv({ query_source: 'repl_main_thread' }) }] }] }] };
  const s2 = JSON.stringify(sanear(bons, 'traces').corpo);
  for (const m of ['a'.repeat(32), 'b'.repeat(16), 'repl_main_thread']) assert.ok(s2.includes(m), m);
  const met = { resourceMetrics: [{ scopeMetrics: [{ metrics: [{ name: 'claude_code.token.usage', unit: 'cliente-secreto.txt', sum: { dataPoints: [] } }] }] }] };
  assert.ok(!JSON.stringify(sanear(met, 'metrics').corpo).includes('cliente-secreto'));
  // e pelo receptor, até ao disco
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'otelA43-'));
  const { servidor } = criarReceptor({ dir });
  await new Promise((r) => servidor.listen(0, '127.0.0.1', r));
  const res = await fetch(`http://127.0.0.1:${servidor.address().port}/v1/traces`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(traces) });
  servidor.close();
  assert.equal(res.status, 200);
  const gravado = fs.readdirSync(dir).map((f) => fs.readFileSync(path.join(dir, f), 'utf8')).join('');
  assert.ok(!gravado.includes('cliente-secreto') && !gravado.includes('whoami'));
});
