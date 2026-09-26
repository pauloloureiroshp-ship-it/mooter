// Um teste por ataque aplicado da sub-ronda r1d do adversário codex (tools/p0/adversario-codex-r1.md).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { medir, listarTranscripts, resumoMarkdown } from '../medir-p0.mjs';
import { criarReceptor, sanear } from '../otel-receptor.mjs';

const hint = (tier, sub) => `<router-hint>\ntier: ${tier}\nsuggested_subagent: ${sub}\nconfidence: 0.8\n</router-hint>`;
const T = (s) => new Date(Date.UTC(2026, 8, 25, 12, 0, s)).toISOString();
let n = 0;
const P = (s, text, extra = {}) => ({ type: 'user', uuid: 'p' + n++, parentUuid: null, sessionId: 'S', timestamp: T(s), isSidechain: false, message: { content: text }, ...extra });
const H = (s, parent, text) => ({ type: 'attachment', uuid: 'h' + n++, parentUuid: parent, sessionId: 'S', timestamp: T(s), isSidechain: false, attachment: { type: 'hook_success', hookEvent: 'UserPromptSubmit', content: text } });
const R = (s, parent, { model = 'claude-opus-5-5', id, req, usage, extra = {} } = {}) => {
  const k = n++;
  return { type: 'assistant', uuid: 'r' + k, parentUuid: parent, sessionId: 'S', timestamp: T(s), isSidechain: false, requestId: req === undefined ? 'q' + k : req,
    message: { id: id === undefined ? 'm' + k : id, model, content: [], usage: usage || { input_tokens: 1, output_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } }, ...extra };
};
function dirCom(ficheiros, metas = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'p0r1d-'));
  for (const [rel, linhas] of Object.entries(ficheiros)) {
    const f = path.join(dir, rel); fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, linhas.map((l) => JSON.stringify(l)).join('\n') + '\n');
  }
  for (const [rel, meta] of Object.entries(metas)) fs.writeFileSync(path.join(dir, rel), JSON.stringify(meta));
  return dir;
}
const medirDir = async (dir) => medir(listarTranscripts(dir));

test('A44: resposta adiada sem modelo utilizável (<synthetic>) também marca o turno como respondido', async () => {
  const p1 = P(0, 'um'); const r1 = R(1, p1.uuid, { model: '<synthetic>' }); const h = H(2, null, hint('T1', 'cheap-triage'));
  const p2 = P(3, 'dois'); const r2 = R(4, p2.uuid, { model: 'claude-haiku-4-5' });
  const a = await medirDir(dirCom({ 'proj/S.jsonl': [r1, p1, h, p2, r2] }));
  const b = await medirDir(dirCom({ 'proj/S.jsonl': [p1, r1, h, p2, r2] }));
  assert.deepEqual(a.aderencia.categorias, b.aderencia.categorias);
  assert.equal(a.aderencia.categorias.ja_no_tier, 1);
});

test('A45: a cópia de um prompt que traz o hook antigo acrescenta o hint, em qualquer ordem', async () => {
  const base = { uuid: 'pX', parentUuid: undefined, sessionId: 'S', timestamp: T(0), isSidechain: false, type: 'user' };
  const semHint = { ...base, message: { content: 'faz x' } };
  const comHint = { ...base, message: { content: `faz x\n<user-prompt-submit-hook>${hint('T1', 'cheap-triage')}</user-prompt-submit-hook>` } };
  const dir = dirCom({ 'proj/A.jsonl': [semHint, R(1, undefined, {})], 'proj/B.jsonl': [comHint, R(2, undefined, {})] });
  const fs_ = listarTranscripts(dir);
  for (const ordem of [fs_, [...fs_].reverse()]) {
    const r = await medir(ordem);
    assert.equal(r.aderencia.prompts_humanos, 1);
    assert.equal(r.aderencia.prompts_com_hint, 1);
    assert.equal(r.aderencia.categorias.ignorou, 1);
  }
});

test('A46: reconciliar requestId→message.id guarda a ocorrência mais antiga (arranque certo)', async () => {
  const u = (i) => ({ input_tokens: i, cache_creation_input_tokens: 0, cache_read_input_tokens: 0, output_tokens: 0 });
  const side = { isSidechain: true };
  const linhas = [
    R(1, null, { id: null, req: 'reqA', model: 'claude-haiku-4-5', usage: u(100), extra: side }),
    R(2, null, { id: 'msgB', req: 'reqB', model: 'claude-haiku-4-5', usage: u(200), extra: side }),
    R(3, null, { id: 'msgA', req: null, model: 'claude-haiku-4-5', usage: u(100), extra: side }),
    R(4, null, { id: 'msgA', req: 'reqA', model: 'claude-haiku-4-5', usage: u(100), extra: side }),
  ];
  for (const ordem of [linhas, [...linhas].reverse()]) {
    const r = await medirDir(dirCom({ 'proj/S/subagents/agent-k.jsonl': ordem }, { 'proj/S/subagents/agent-k.meta.json': { agentType: 'cheap-triage' } }));
    assert.equal(r.tokens.total.pedidos, 2);
    assert.equal(r.tokens.total.input, 300);
    assert.equal(r.delegacao.contexto_1o_pedido_soma, 100);
  }
});

test('A47: agente definido pelo utilizador sai como «outro»; OTel só guarda valores conhecidos', async () => {
  const dir = dirCom({ 'proj/S/subagents/agent-c.jsonl': [R(1, null, { model: 'claude-haiku-4-5', extra: { isSidechain: true } })] }, { 'proj/S/subagents/agent-c.meta.json': { agentType: 'cliente-secreto' } });
  const r = await medirDir(dir);
  assert.ok(!(JSON.stringify(r) + resumoMarkdown(r, 't')).includes('cliente-secreto'));
  assert.equal(r.delegacao.por_tipo.outro.contexto_1o_pedido.n, 1);
  // agentes conhecidos continuam com nome
  const dir2 = dirCom({ 'proj/S/subagents/agent-d.jsonl': [R(1, null, { model: 'claude-haiku-4-5', extra: { isSidechain: true } })] }, { 'proj/S/subagents/agent-d.meta.json': { agentType: 'mooter:cheap-triage' } });
  assert.ok((await medirDir(dir2)).delegacao.por_tipo['cheap-triage']);

  const kv = (o) => Object.entries(o).map(([key, v]) => ({ key, value: { stringValue: v } }));
  const corpo = { resourceLogs: [{ resource: { attributes: kv({ 'service.name': 'cliente-secreto.txt', 'terminal.type': 'whoami', 'os.type': 'windows' }) },
    scopeLogs: [{ logRecords: [{ attributes: kv({ 'event.name': 'api_request', 'agent.name': 'cliente-secreto', type: 'whoami', model: 'claude-opus-5-5', input_tokens: '12' }) }] }] }] };
  const s = JSON.stringify(sanear(corpo, 'logs').corpo);
  for (const m of ['cliente-secreto', 'whoami']) assert.ok(!s.includes(m), m);
  for (const m of ['windows', 'api_request', 'claude-opus-5-5', '"12"']) assert.ok(s.includes(m), m);
  assert.match(s, /"agent\.name","value":\{"stringValue":"outro"\}/);
  // e até ao disco
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'otelA47-'));
  const { servidor } = criarReceptor({ dir: d });
  await new Promise((res) => servidor.listen(0, '127.0.0.1', res));
  await fetch(`http://127.0.0.1:${servidor.address().port}/v1/logs`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(corpo) });
  servidor.close();
  const gravado = fs.readdirSync(d).map((f) => fs.readFileSync(path.join(d, f), 'utf8')).join('');
  assert.ok(!gravado.includes('cliente-secreto') && !gravado.includes('whoami'));
});
